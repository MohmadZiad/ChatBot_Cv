// apps/api/src/ingestion/parse.ts
import mammoth from 'mammoth';

/**
 * تحميل pdf-parse بدون side effects:
 * - نحاول lib/pdf-parse.js أولاً (لا يحتوي كود تجريبي)
 * - لو فشل، نرجع للمدخل الافتراضي
 */
async function loadPdfParse(): Promise<(buf: Buffer) => Promise<any>> {
  const { createRequire } = await import('module');
  const req = createRequire(import.meta.url);
  try {
    // هذا المسار الداخلي يتجنّب أي كود تجريبي في index.js
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdf = req('pdf-parse/lib/pdf-parse.js');
    return pdf;
  } catch {
    const mod = await import('pdf-parse'); // fallback
    return (mod as any).default ?? (mod as any);
  }
}

export async function parsePDF(buffer: Buffer) {
  if (!buffer || buffer.length === 0) {
    throw new Error('Empty PDF buffer');
  }
  const pdf = await loadPdfParse();
  const out: any = await pdf(buffer);
  return typeof out?.text === 'string' ? out.text : '';
}

export async function parseDOCX(buffer: Buffer) {
  if (!buffer || buffer.length === 0) {
    throw new Error('Empty DOCX buffer');
  }
  const out = await mammoth.extractRawText({ buffer });
  return out?.value || '';
}
