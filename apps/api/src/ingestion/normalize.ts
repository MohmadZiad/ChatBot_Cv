export const normalizeAR = (t: string) =>
  t.normalize('NFC').replace(/[\u064B-\u0652]/g,'').replace(/[أإآ]/g,'ا');
export const normalizeEN = (t: string) => t.replace(/\s+/g,' ').trim();
