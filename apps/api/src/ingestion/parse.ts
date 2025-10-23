// ======================================================
// Aggregates multiple extractors for PDFs (embedded text, PDF.js, OCR).
// Optionally uses Google Document AI if USE_DOC_AI=1.
// Always picks the "longest" result to be robust.
// Enable verbose logging with EXTRACT_DEBUG=1.
// ======================================================

import path from "node:path";
import fs from "node:fs/promises";
import mammoth from "mammoth";
import { docaiExtractPdfText } from "../services/docai";

// -------------------------
// Lazy imports (runtime)
// -------------------------
async function loadPdfJs(): Promise<any | null> {
  const variants = [
    "pdfjs-dist/legacy/build/pdf.js",
    "pdfjs-dist/build/pdf.js",
    "pdfjs-dist/build/pdf.mjs",
    "pdfjs-dist",
  ];
  for (const mod of variants) {
    try {
      return await import(mod);
    } catch {}
  }
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
  const mod = await import("canvas");
  _canvas = mod;
  return _canvas;
}

let _wordExtractor: any | null = null;
async function getWordExtractor() {
  if (_wordExtractor) return _wordExtractor;
  const mod = await import("word-extractor");
  _wordExtractor = (mod as any).default ?? (mod as any);
  return _wordExtractor;
}

// -------------------------
// Helpers
// -------------------------
function toBuf(input: unknown): Buffer {
  if (typeof input === "string") throw new Error("Pass a Buffer, not a path.");
  return Buffer.isBuffer(input)
    ? (input as Buffer)
    : Buffer.from(input as ArrayBufferLike);
}

function env(key: string, fallback?: string) {
  const v = process.env[key];
  return v == null || v === "" ? fallback : v;
}

function joinParts(parts: (string | null | undefined)[], sep = "\n") {
  return parts
    .filter(Boolean)
    .map((s) => (s as string).trim())
    .filter(Boolean)
    .join(sep);
}

function normLangs(l: string | undefined | null): string {
  let langs = (l ?? "").trim();
  if (!langs) return "eng";
  // allow: "eng,ara" or "eng+ara"
  if (langs.includes(",")) langs = langs.replace(/,/g, "+");
  return langs;
}

// -------------------------
// PDF extractors
// -------------------------
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
    // run without external worker
    pdfjsLib.GlobalWorkerOptions &&
      (pdfjsLib.GlobalWorkerOptions.workerSrc = undefined as any);
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

    let text = "";
    const linkLines: string[] = [];

    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent({ normalizeWhitespace: true });
      text += content.items.map((it: any) => it?.str ?? "").join(" ") + "\n";

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

    const out = joinParts([
      text,
      linkLines.length ? "\nLinks:\n" + linkLines.join("\n") : "",
    ]);
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

async function renderPageToPngBuffer(pdfjsLib: any, page: any, scale = 3) {
  const { createCanvas } = await getCanvas();
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(viewport.width, viewport.height);
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas.toBuffer("image/png");
}

async function ocrPdf(buf: Buffer, log?: (m: any) => void): Promise<string> {
  const pdfjsLib = await loadPdfJs();
  if (!pdfjsLib) {
    log?.({ step: "ocr", error: "pdfjs not loaded" });
    return "";
  }

  const OCR_LANGS = normLangs(env("OCR_LANGS", "eng+ara"));
  const MAX_PAGES = Number(env("OCR_MAX_PAGES", "30"));
  const SCALE = Number(env("OCR_RENDER_SCALE", "3"));
  const TESSDATA = env(
    "TESSDATA_PATH",
    path.join(process.cwd(), "apps/api/assets/tessdata")
  )!;
  let worker: any | null = null;

  try {
    const { createWorker } = await getTesseract();
    worker = await createWorker({
      langPath: TESSDATA,
      cacheMethod: "readOnly",
      // logger: (m:any)=>log?.({ step:"ocr", tesseract:m })
    });

    await worker.loadLanguage(OCR_LANGS);
    await worker.initialize(OCR_LANGS);
    await worker.setParameters({
      tessedit_pageseg_mode: "6",
      tessedit_ocr_engine_mode: "1",
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
      const png = await renderPageToPngBuffer(pdfjsLib, page, SCALE);
      const { data } = await worker.recognize(png);
      out += (data?.text || "") + "\n";
      (page as any)?.cleanup?.();
    }
    (doc as any)?.cleanup?.();
    out = out.replace(/\u0000/g, "").trim();
    log?.({ step: "ocr", pages, length: out.length });
    return out;
  } catch (e: any) {
    log?.({ step: "ocr", error: String(e?.message ?? e) });
    return "";
  } finally {
    try {
      await worker?.terminate();
    } catch {}
  }
}

// -------------------------
// Other formats
// -------------------------
export async function parseDOCX(buf: Buffer) {
  try {
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return (value || "").trim();
  } catch {
    return "";
  }
}

export async function parseDOC(buf: Buffer) {
  try {
    const WordExtractor = await getWordExtractor();
    const extractor = new WordExtractor();
    const doc = await extractor.extract(buf);
    return (doc?.getBody() || "").trim();
  } catch {
    return "";
  }
}

export async function parsePlainText(buf: Buffer) {
  try {
    return buf.toString("utf8").trim();
  } catch {
    return "";
  }
}

export async function parseImageWithOCR(buf: Buffer) {
  try {
    const { createWorker } = await getTesseract();
    const OCR_LANGS = normLangs(env("OCR_LANGS", "eng+ara"));
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

// -------------------------
// Public API
// -------------------------
export async function parsePDF(input: unknown): Promise<string> {
  const buf = toBuf(input);
  const debug = (process.env.EXTRACT_DEBUG || "0") !== "0";
  const log = (...args: any[]) =>
    debug && console.log("[PDF-EXTRACT]", ...args);

  const MIN = Number(env("MIN_EXTRACTED_TEXT", "60"));
  const OCR_ENABLED = (env("ENABLE_OCR", "1") || "1") !== "0";
  const useDocAi = (env("USE_DOC_AI", "0") || "0") !== "0";

  let best = "";

  // 0) DocAI (اختياري)
  if (useDocAi) {
    try {
      const d = await docaiExtractPdfText(buf);
      log({ step: "docai", length: d.length });
      if (d.length >= MIN && d.length > best.length) best = d;
    } catch (e: any) {
      log({ step: "docai", error: String(e?.message ?? e) });
    }
  }

  // 1) pdf-parse
  const t1 = await extractTextWithPdfParse(buf, (m) => log(m));
  if (t1.length > best.length) best = t1;

  // 2) pdfjs
  const t2 = await extractTextWithPdfJs(buf, (m) => log(m));
  if (t2.length > best.length) best = t2;

  // 3) OCR فقط عند الحاجة
  if (OCR_ENABLED && best.length < MIN) {
    const t3 = await ocrPdf(buf, (m) => log(m));
    if (t3.length > best.length) best = t3;
  }

  log({ step: "final", length: best.length });
  return best.trim();
}

export async function parseAny(
  input: unknown,
  mime?: string | null,
  filename?: string | null
): Promise<string> {
  const buf = toBuf(input);
  const name = (filename || "").toLowerCase();
  const is = (ext: string) => name.endsWith(ext);

  const MIN = Number(env("MIN_EXTRACTED_TEXT", "60"));
  const OCR_ENABLED = (env("ENABLE_OCR", "1") || "1") !== "0";

  let best = "";

  if ((mime || "").includes("pdf") || is(".pdf")) {
    // نفس منطق parsePDF لكن بدون DocAI هنا
    const t1 = await extractTextWithPdfParse(buf);
    if (t1.length > best.length) best = t1;

    const t2 = await extractTextWithPdfJs(buf);
    if (t2.length > best.length) best = t2;

    if (OCR_ENABLED && best.length < MIN) {
      const t3 = await ocrPdf(buf);
      if (t3.length > best.length) best = t3;
    }

    return best.trim();
  }

  // الأنواع الأخرى:
  const runs: Array<() => Promise<string>> = [];
  if ((mime || "").includes("wordprocessingml.document") || is(".docx")) {
    runs.push(() => parseDOCX(buf));
  } else if ((mime || "") === "application/msword" || is(".doc")) {
    runs.push(() => parseDOC(buf));
  } else if (
    (mime || "").startsWith("image/") ||
    [".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"].some(is)
  ) {
    runs.push(() => parseImageWithOCR(buf));
  } else if (
    (mime || "").startsWith("text/") ||
    [".txt", ".md", ".csv"].some(is)
  ) {
    runs.push(() => parsePlainText(buf));
  } else {
    runs.push(
      () => parsePlainText(buf),
      () => parseImageWithOCR(buf)
    );
  }

  for (const run of runs) {
    try {
      const t = (await run())?.trim?.() || "";
      if (t.length > best.length) best = t;
    } catch {}
  }
  return best.trim();
}
