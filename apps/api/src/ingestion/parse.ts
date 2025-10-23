// apps/api/src/ingestion/parse.ts
import mammoth from "mammoth";

/* =========================
   Lazy imports (runtime only)
========================= */

async function loadPdfJs(): Promise<any | null> {
  try {
    return await import("pdfjs-dist/legacy/build/pdf.js");
  } catch {}
  try {
    return await import("pdfjs-dist/build/pdf.js");
  } catch {}
  try {
    return await import("pdfjs-dist/build/pdf.mjs");
  } catch {}
  try {
    return await import("pdfjs-dist");
  } catch {}
  return null;
}

let _pdfParse: any | null = null;
async function getPdfParse() {
  if (_pdfParse) return _pdfParse;
  const mod = await import("pdf-parse");
  _pdfParse = (mod as any).default ?? (mod as any);
  return _pdfParse;
}

let _tesseract: any | null = null;
async function getTesseract() {
  if (_tesseract) return _tesseract;
  const mod = await import("tesseract.js");
  _tesseract = (mod as any).default ?? (mod as any);
  return _tesseract;
}

let _canvas: any | null = null;
async function getCanvas() {
  if (_canvas) return _canvas;
  // node-canvas
  const mod = await import("canvas");
  _canvas = mod;
  return _canvas;
}

let _wordExtractor: any | null = null;
async function getWordExtractor() {
  if (_wordExtractor) return _wordExtractor;
  const mod = await import("word-extractor"); // لدعم DOC القديم
  _wordExtractor = (mod as any).default ?? (mod as any);
  return _wordExtractor;
}

/* =========================
   Helpers
========================= */

function toBuf(input: unknown): Buffer {
  if (typeof input === "string") {
    throw new Error("Pass a Buffer, not a file path.");
  }
  return Buffer.isBuffer(input)
    ? (input as Buffer)
    : Buffer.from(input as ArrayBufferLike);
}

/* =========================
   PDF extractors
========================= */

/** pdf-parse (نص مضمّن) */
async function extractTextWithPdfParse(
  buf: Buffer,
  log?: (m: any) => void
): Promise<string> {
  try {
    const pdfParse = await getPdfParse();
    const res = await pdfParse(buf);
    const t = (res?.text || "").trim();
    log?.({ step: "pdf-parse", length: t.length });
    return t;
  } catch (e) {
    log?.({ step: "pdf-parse", error: String(e) });
    return "";
  }
}

/** pdfjs-dist (نص مضمّن) — متوافق مع Node: نعطّل الـ worker */
async function extractTextWithPdfJs(
  buf: Buffer,
  log?: (m: any) => void
): Promise<string> {
  const pdfjsLib = await loadPdfJs();
  if (!pdfjsLib) {
    log?.({ step: "pdfjs", error: "failed to load pdfjs-dist" });
    return "";
  }

  try {
    if (pdfjsLib?.GlobalWorkerOptions) {
      // في Node لا نستخدم worker إطلاقًا
      pdfjsLib.GlobalWorkerOptions.workerSrc = undefined as any;
    }
  } catch {}

  try {
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(buf),
      disableWorker: true, // أهم سطر لبيئة Node
      useSystemFonts: true,
      isEvalSupported: false,
      verbosity: (pdfjsLib as any).VerbosityLevel?.errors ?? 0,
    });

    const doc = await loadingTask.promise;

    let text = "";
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent({ normalizeWhitespace: true });
      text += content.items.map((it: any) => it?.str ?? "").join(" ") + "\n";
      (page as any)?.cleanup?.();
    }
    (doc as any)?.cleanup?.();

    const t = text.trim();
    log?.({ step: "pdfjs", pages: doc.numPages, length: t.length });
    return t;
  } catch (e: any) {
    log?.({ step: "pdfjs", error: String(e?.message ?? e) });
    return "";
  }
}

async function renderPageToPngBuffer(pdfjsLib: any, page: any, scale = 2) {
  const { createCanvas } = await getCanvas();
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(viewport.width, viewport.height);
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas.toBuffer("image/png");
}

/** OCR لصفحات PDF */
async function ocrPdf(buf: Buffer, log?: (m: any) => void): Promise<string> {
  const pdfjsLib = await loadPdfJs();
  if (!pdfjsLib) {
    log?.({ step: "ocr", error: "pdfjs not loaded" });
    return "";
  }

  try {
    if (pdfjsLib?.GlobalWorkerOptions) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = undefined as any;
    }
  } catch {}

  try {
    const Tesseract = await getTesseract();
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(buf),
      disableWorker: true,
    });
    const doc = await loadingTask.promise;

    const OCR_LANGS = process.env.OCR_LANGS || "eng+ara";
    const MAX_PAGES = Number(process.env.OCR_MAX_PAGES || "10");
    const SCALE = Number(process.env.OCR_RENDER_SCALE || "2");

    let text = "";
    const limit = Math.min(doc.numPages, MAX_PAGES);
    for (let i = 1; i <= limit; i++) {
      const page = await doc.getPage(i);
      const png = await renderPageToPngBuffer(pdfjsLib, page, SCALE);
      const { data } = await Tesseract.recognize(png, OCR_LANGS);
      if (data?.text) text += data.text + "\n";
      (page as any)?.cleanup?.();
    }
    (doc as any)?.cleanup?.();

    const t = text.trim();
    log?.({ step: "ocr", pages: limit, length: t.length });
    return t;
  } catch (e) {
    log?.({ step: "ocr", error: String(e) });
    return "";
  }
}

/* =========================
   DOCX / DOC / PLAIN / IMAGES
========================= */

export async function parseDOCX(buf: Buffer): Promise<string> {
  try {
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return (value || "").trim();
  } catch {
    return "";
  }
}

export async function parseDOC(buf: Buffer): Promise<string> {
  try {
    const WordExtractor = await getWordExtractor();
    const extractor = new WordExtractor();
    const doc = await extractor.extract(buf);
    return (doc?.getBody() || "").trim();
  } catch {
    return "";
  }
}

export async function parsePlainText(buf: Buffer): Promise<string> {
  try {
    return buf.toString("utf8").trim();
  } catch {
    return "";
  }
}

export async function parseImageWithOCR(buf: Buffer): Promise<string> {
  try {
    const Tesseract = await getTesseract();
    const OCR_LANGS = process.env.OCR_LANGS || "eng+ara";
    const { data } = await Tesseract.recognize(buf, OCR_LANGS);
    return (data?.text || "").trim();
  } catch {
    return "";
  }
}

/* =========================
   Public APIs
========================= */

/** قراءة PDF — نجرب الثلاثة ونختار الأطول */
export async function parsePDF(input: unknown): Promise<string> {
  const buf = toBuf(input);
  const log = (m: any) => console.log("[PDF-EXTRACT]", m);

  let best = "";

  const t1 = await extractTextWithPdfParse(buf, log);
  if (t1.length > best.length) best = t1;

  const t2 = await extractTextWithPdfJs(buf, log);
  if (t2.length > best.length) best = t2;

  const t3 = await ocrPdf(buf, log);
  if (t3.length > best.length) best = t3;

  return best.trim();
}

/**
 * parseAny: واجهة موحّدة — تحدد المستخرج حسب الـ mime/الامتداد
 * وتفاضل دائمًا على "الأطول".
 */
export async function parseAny(
  input: unknown,
  mime?: string | null,
  filename?: string | null
): Promise<string> {
  const buf = toBuf(input);
  const name = (filename || "").toLowerCase();
  const is = (ext: string) => name.endsWith(ext);

  let runs: Array<() => Promise<string>> = [];

  if ((mime || "").includes("pdf") || is(".pdf")) {
    runs = [
      () => extractTextWithPdfParse(buf),
      () => extractTextWithPdfJs(buf),
      () => ocrPdf(buf),
    ];
  } else if (
    (mime || "").includes(
      "vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) ||
    is(".docx")
  ) {
    runs = [() => parseDOCX(buf)];
  } else if ((mime || "") === "application/msword" || is(".doc")) {
    runs = [() => parseDOC(buf)];
  } else if (
    (mime || "").startsWith("image/") ||
    is(".png") ||
    is(".jpg") ||
    is(".jpeg") ||
    is(".webp") ||
    is(".bmp") ||
    is(".tif") ||
    is(".tiff")
  ) {
    runs = [() => parseImageWithOCR(buf)];
  } else if (
    (mime || "").startsWith("text/") ||
    is(".txt") ||
    is(".md") ||
    is(".csv")
  ) {
    runs = [() => parsePlainText(buf)];
  } else {
    // غير معروف: جرّب نص مباشر ثم OCR كـ fallback
    runs = [() => parsePlainText(buf), () => parseImageWithOCR(buf)];
  }

  let best = "";
  for (const run of runs) {
    try {
      const t = (await run())?.trim?.() || "";
      if (t.length > best.length) best = t;
    } catch {}
  }
  return best.trim();
}
