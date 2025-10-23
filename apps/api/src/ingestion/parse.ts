// apps/api/src/ingestion/parse.ts
import mammoth from "mammoth";

/** نحاول تحميل pdfjs-dist من عدة مسارات (تتغير حسب النسخة) */
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

/** Fallback عبر pdfjs-dist بدون import ثابت */
async function parseWithPdfJs(buf: Buffer): Promise<string> {
  try {
    const pdfjsLib = await loadPdfJs();
    if (!pdfjsLib) return "";

    // في Node لسنا بحاجة للـ worker غالبًا، لكن لو متاح نضبطه لتفادي التحذير
    try {
      // @ts-ignore
      if (pdfjsLib.GlobalWorkerOptions) {
        // @ts-ignore
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          "pdfjs-dist/legacy/build/pdf.worker.js";
      }
    } catch {
      /* ignore */
    }

    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buf) });
    const doc = await loadingTask.promise;

    let text = "";
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      text +=
        content.items
          .map((it: any) => (typeof it.str === "string" ? it.str : ""))
          .join(" ") + "\n";
    }
    if (typeof doc.cleanup === "function") await doc.cleanup();
    return text.trim();
  } catch {
    return "";
  }
}

/* ---------------------------------------------
   pdf-parse: استيراد ديناميكي + كاش داخلي
   هذا يمنع أي كود top-level بالحزمة من التنفيذ عند إقلاع السيرفر،
   ويتأكد أننا نمرّر Buffer فقط.
---------------------------------------------- */
let _pdfParse: any | null = null;
async function getPdfParse() {
  if (_pdfParse) return _pdfParse;
  const mod = await import("pdf-parse");
  _pdfParse = (mod as any).default ?? (mod as any);
  return _pdfParse;
}

/** قراءة PDF: نحاول أولًا بـ pdf-parse، وإلا نفاضل لـ pdfjs-dist */
export async function parsePDF(input: unknown): Promise<string> {
  // حماية: لا نسمح بتمرير path كنص
  if (typeof input === "string") {
    throw new Error("parsePDF: pass a Buffer, not a file path.");
  }

  // طبيعـة الإدخال: Buffer / ArrayBufferLike
  const buf: Buffer = Buffer.isBuffer(input)
    ? (input as Buffer)
    : Buffer.from(input as ArrayBufferLike);

  // المحاولة الأولى: pdf-parse
  try {
    const pdfParse = await getPdfParse();
    const res = await pdfParse(buf);
    const t = (res?.text || "").trim();
    if (t.length > 0) return t;
  } catch {
    // تجاهل — سنجرّب fallback
  }

  // Fallback: pdfjs-dist
  return await parseWithPdfJs(buf);
}

/** قراءة DOCX. يرجع "" عند الفشل بدل الرمي. */
export async function parseDOCX(buf: Buffer): Promise<string> {
  try {
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return (value || "").trim();
  } catch {
    return "";
  }
}
