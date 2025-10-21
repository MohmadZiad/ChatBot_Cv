import mammoth from 'mammoth';

export async function parsePDF(buffer: Buffer) {
  if (!buffer || buffer.length === 0) {
    throw new Error('Empty PDF buffer');
  }
  const { default: pdf } = await import('pdf-parse'); // <-- Lazy import
  const out: any = await pdf(buffer);
  return out?.text || '';
}

export async function parseDOCX(buffer: Buffer) {
  if (!buffer || buffer.length === 0) {
    throw new Error('Empty DOCX buffer');
  }
  const out = await mammoth.extractRawText({ buffer });
  return out?.value || '';
}
