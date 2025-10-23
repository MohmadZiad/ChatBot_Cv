// apps/api/src/ingestion/parse.ts
import path from "node:path";
import fs from "node:fs/promises";
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
  const mod = await import("canvas"); // canvas@3 works on Windows without system deps
  _canvas = mod;
  return _canvas;
}

let _wordExtractor: any | null = null;
async function getWordExtractor() {
  if (_wordExtractor) return _wordExtractor;
  const mod = await import("word-extractor"); // DOC (قديم)
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

function env(key: string, fallback?: string) {
  const v = process.env[key];
  return v == null || v === "" ? fallback : v;
}

function joinParts(parts: (string | null | undefined)[], sep = "\n"): string {
  return parts
    .filter(Boolean)
    .map((s) => (s as string).trim())
    .filter(Boolean)
    .join(sep);
}

/* =========================
   PDF extractors
========================= */

/** 1) pdf-parse (نص مضمّن سريع) */
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

/** 2) pdfjs-dist (نص مضمّن + الروابط من Annotations) */
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
    if (pdfjsLib?.GlobalWorkerOptions)
      pdfjsLib.GlobalWorkerOptions.workerSrc = undefined as any;
  } catch {}

  try {
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(buf),
      disableWorker: true,
      useSystemFonts: true,
      isEvalSupported: false,
      verbosity: (pdfjsLib as any).VerbosityLevel?.errors ?? 0,
    });
    const doc = await loadingTask.promise;

    const linkLines: string[] = [];
    let text = "";

    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);

      // نص الصفحة
      const content = await page.getTextContent({ normalizeWhitespace: true });
      text += content.items.map((it: any) => it?.str ?? "").join(" ") + "\n";

      // روابط الصفحة (URI annotations)
      try {
        const ann = await page.getAnnotations();
        for (const a of ann) {
          const uri = (a as any)?.url || (a as any)?.unsafeUrl;
          const title = (a as any)?.title || (a as any)?.contents || "";
          if (uri) linkLines.push(title ? `${title}: ${uri}` : uri);
        }
      } catch {}

      (page as any)?.cleanup?.();
    }
    (doc as any)?.cleanup?.();

    const out = joinParts(
      [text, linkLines.length ? "\nLinks:\n" + linkLines.join("\n") : ""],
      "\n"
    );
    const t = out.trim();
    log?.({
      step: "pdfjs",
      pages: doc.numPages,
      length: t.length,
      links: linkLines.length,
    });
    return t;
  } catch (e: any) {
    log?.({ step: "pdfjs", error: String(e?.message ?? e) });
    return "";
  }
}

async function renderPageToPngBuffer(
  pdfjsLib: any,
  page: any,
  scale = 2,
  debugFirst = false
) {
  const { createCanvas } = await getCanvas();
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(viewport.width, viewport.height);
  const ctx = canvas.getContext("2d");

  // رسم الصفحة
  await page.render({ canvasContext: ctx, viewport }).promise;

  // (اختياري) تحسين بسيط للصورة قبل OCR: تحويل لتدرّج رمادي + عتبة
  try {
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = img.data;
    // threshold بسيط (تلقائي نسبيًا)
    let sum = 0;
    for (let i = 0; i < data.length; i += 4)
      sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
    const avg = sum / (data.length / 4);
    const thresh = Math.max(110, Math.min(180, avg)); // 110..180
    for (let i = 0; i < data.length; i += 4) {
      const g = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      const v = g > thresh ? 255 : 0;
      data[i] = data[i + 1] = data[i + 2] = v;
    }
    ctx.putImageData(img, 0, 0);
  } catch {}

  const png = canvas.toBuffer("image/png");

  // احفظ أول صفحة للمعاينة لو وضع الديباغ مفعّل
  if (debugFirst) {
    try {
      const dir = path.join(process.cwd(), "storage", "ocr-debug");
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, "page1-preview.png"), png);
    } catch {}
  }

  return png;
}

/** 3) OCR لصفحات PDF — Tesseract Worker + معلمات محسّنة + Debug */
async function ocrPdf(buf: Buffer, log?: (m: any) => void): Promise<string> {
  const pdfjsLib = await loadPdfJs();
  if (!pdfjsLib) {
    log?.({ step: "ocr", error: "pdfjs not loaded" });
    return "";
  }
  try {
    if (pdfjsLib?.GlobalWorkerOptions)
      pdfjsLib.GlobalWorkerOptions.workerSrc = undefined as any;
  } catch {}

  const OCR_LANGS = env("OCR_LANGS", "eng+ara")!;
  const MAX_PAGES = Number(env("OCR_MAX_PAGES", "30"));
  const SCALE = Number(env("OCR_RENDER_SCALE", "3")); // 2–4
  const TESSDATA = env(
    "TESSDATA_PATH",
    path.join(process.cwd(), "apps/api/assets/tessdata")
  )!;
  const DEBUG = env("OCR_DEBUG", "0") !== "0";

  try {
    const { createWorker } = await getTesseract();
    const worker = await createWorker({
      langPath: TESSDATA,
      cacheMethod: "readOnly",
      // logger: DEBUG ? (m:any)=>log?.({ step:"ocr", tesseract:m }) : undefined,
    });

    await worker.loadLanguage(OCR_LANGS);
    await worker.initialize(OCR_LANGS);

    // إعدادات قوية للـ OCR
    await worker.setParameters({
      tessedit_pageseg_mode: "6", // فقرة نص واحد
      tessedit_ocr_engine_mode: "1", // LSTM-only
      preserve_interword_spaces: "1",
      user_defined_dpi: "300",
    });

    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(buf),
      disableWorker: true,
    });
    const doc = await loadingTask.promise;

    let out = "";
    const pages = Math.min(doc.numPages, MAX_PAGES);

    for (let i = 1; i <= pages; i++) {
      const page = await doc.getPage(i);
      const png = await renderPageToPngBuffer(
        pdfjsLib,
        page,
        SCALE,
        DEBUG && i === 1
      );
      const {
        data: { text },
      } = await worker.recognize(png);
      out += (text || "") + "\n";
      (page as any)?.cleanup?.();
    }
    (doc as any)?.cleanup?.();

    await worker.terminate();

    out = out.replace(/\u0000/g, "").trim();
    log?.({ step: "ocr", pages, length: out.length });
    return out;
  } catch (e: any) {
    log?.({ step: "ocr", error: String(e?.message ?? e) });
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
    const { createWorker } = await getTesseract();
    const OCR_LANGS = env("OCR_LANGS", "eng+ara")!;
    const TESSDATA = env(
      "TESSDATA_PATH",
      path.join(process.cwd(), "apps/api/assets/tessdata")
    )!;

    const worker = await createWorker({
      langPath: TESSDATA,
      cacheMethod: "readOnly",
    });
    await worker.loadLanguage(OCR_LANGS);
    await worker.initialize(OCR_LANGS);

    await worker.setParameters({
      tessedit_pageseg_mode: "6",
      tessedit_ocr_engine_mode: "1",
      preserve_interword_spaces: "1",
      user_defined_dpi: "300",
    });

    const { data } = await worker.recognize(buf);
    await worker.terminate();
    return (data?.text || "").trim();
  } catch {
    return "";
  }
}

/* =========================
   Public APIs
========================= */

/** قراءة PDF — نجرب 3 طرق (parse → pdfjs+links → OCR) ونختار الأطول */
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
 * ونفاضل دائمًا على "الأطول".
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
