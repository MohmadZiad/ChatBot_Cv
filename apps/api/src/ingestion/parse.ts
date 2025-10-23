// apps/api/src/ingestion/parse.ts
// ======================================================
// - يجمع عدّة مستخرِجات PDF (نص مضمّن، PDF.js، OCR).
// - عند USE_DOC_AI=1 نجرب Google Document AI أولًا (اختياري).
// - دائمًا نختار أطول نتيجة لضمان الاعتمادية عبر الترميزات المختلفة.
// - فعّل سجلات التصحيح بـ EXTRACT_DEBUG=1.
// ======================================================

import path from "node:path";
import fs from "node:fs/promises";
import mammoth from "mammoth";
import { docaiExtractPdfText } from "../services/docai";

/* =========================
   Lazy imports (runtime only)
========================= */
async function loadPdfJs(): Promise<any | null> {
  const candidates = [
    "pdfjs-dist/legacy/build/pdf.js",
    "pdfjs-dist/build/pdf.js",
    "pdfjs-dist/build/pdf.mjs",
    "pdfjs-dist",
  ];
  for (const mod of candidates) {
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
  const mod = await import("tesseract.js"); // v6
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

/* =========================
   Helpers
========================= */
function toBuf(input: unknown): Buffer {
  if (typeof input === "string")
    throw new Error("Pass a Buffer, not a file path.");
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

    const out = joinParts(
      [text, linkLines.length ? "\nLinks:\n" + linkLines.join("\n") : ""],
      "\n"
    );
    const t = out.trim();
    log?.({
      step: "pdfjs",
      pages: (doc as any)?.numPages,
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
  scale = 3,
  debugFirst = false
) {
  const { createCanvas } = await getCanvas();
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(viewport.width, viewport.height);
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport }).promise;

  const png = canvas.toBuffer("image/png");
  if (debugFirst) {
    try {
      const dir = path.join(process.cwd(), "storage", "ocr-debug");
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, "page1-preview.png"), png);
    } catch {}
  }
  return png;
}

/** OCR fallback (Tesseract.js v6 expects array of langs) */
async function ocrPdf(buf: Buffer, log?: (m: any) => void): Promise<string> {
  const pdfjsLib = await loadPdfJs();
  if (!pdfjsLib) {
    log?.({ step: "ocr", error: "pdfjs not loaded" });
    return "";
  }

  // sanitize langs for v6 (array), allow env of "eng+ara" or "eng,ara"
  const langsArr = (env("OCR_LANGS", "eng+ara") || "eng")
    .replace(/,/g, "+")
    .split("+")
    .map((s) => s.trim())
    .filter(Boolean);

  const MAX_PAGES = Number(env("OCR_MAX_PAGES", "30"));
  const SCALE = Number(env("OCR_RENDER_SCALE", "3"));
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
      // logger: DEBUG ? (m: any) => log?.({ step: "tesseract", m }) : undefined,
    });

    // v6: array of langs
    await worker.loadLanguage(langsArr as any);
    await worker.initialize(langsArr.join("+"));

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
      const png = await renderPageToPngBuffer(
        pdfjsLib,
        page,
        SCALE,
        DEBUG && i === 1
      );
      const { data } = await worker.recognize(png);
      out += (data?.text || "") + "\n";
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
   DOC / DOCX / TEXT / IMAGE
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
    const langsArr = (env("OCR_LANGS", "eng+ara") || "eng")
      .replace(/,/g, "+")
      .split("+")
      .map((s) => s.trim())
      .filter(Boolean);
    const TESSDATA = env(
      "TESSDATA_PATH",
      path.join(process.cwd(), "apps/api/assets/tessdata")
    )!;

    const worker = await createWorker({
      langPath: TESSDATA,
      cacheMethod: "readOnly",
    });
    await worker.loadLanguage(langsArr as any);
    await worker.initialize(langsArr.join("+"));
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
   MAIN PUBLIC FUNCTIONS
========================= */
export async function parsePDF(input: unknown): Promise<string> {
  const buf = toBuf(input);
  const debug = (process.env.EXTRACT_DEBUG || "0") !== "0";
  const log = (...args: any[]) =>
    debug && console.log("[PDF-EXTRACT]", ...args);

  const MIN = Number(env("MIN_EXTRACTED_TEXT", "60"));
  const useDocAi = (env("USE_DOC_AI", "0") || "0") !== "0";

  let best = "";

  if (useDocAi) {
    try {
      const d = await docaiExtractPdfText(buf);
      log({ step: "docai", length: d.length });
      if (d.length >= MIN && d.length > best.length) best = d;
    } catch (e: any) {
      log({ step: "docai", error: String(e?.message ?? e) });
    }
  }

  for (const extractor of [
    extractTextWithPdfParse,
    extractTextWithPdfJs,
    ocrPdf,
  ]) {
    try {
      const t = await extractor(buf, (m: any) => log(m));
      if (t.length > best.length) best = t;
    } catch (err) {
      log({ step: "extractor error", error: String(err) });
    }
  }

  log({ step: "final", length: best.length });
  return best.trim();
}

export async function parseAny(
  input: unknown,
  mime?: string | null,
  filename?: string | null
) {
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
    (mime || "").includes("wordprocessingml.document") ||
    is(".docx")
  ) {
    runs = [() => parseDOCX(buf)];
  } else if ((mime || "") === "application/msword" || is(".doc")) {
    runs = [() => parseDOC(buf)];
  } else if (
    (mime || "").startsWith("image/") ||
    [".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"].some(is)
  ) {
    runs = [() => parseImageWithOCR(buf)];
  } else if (
    (mime || "").startsWith("text/") ||
    [".txt", ".md", ".csv"].some(is)
  ) {
    runs = [() => parsePlainText(buf)];
  } else {
    runs = [() => parsePlainText(buf), () => parseImageWithOCR(buf)];
  }

  let best = "";
  for (const run of runs) {
    try {
      const t = (await run())?.trim?.() || "";
      if (t.length > best.length) best = t;
    } catch (err) {
      console.error("[PDF-EXTRACT] parseAny error:", err);
    }
  }
  return best.trim();
}
