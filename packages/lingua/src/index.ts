export const isRTL = (lang?: string) => lang?.startsWith('ar') ?? false;
export const detectLang = (text: string): 'ar'|'en'|'mixed' => {
  const ar = /[\u0600-\u06FF]/.test(text);
  const en = /[A-Za-z]/.test(text);
  if (ar && en) return 'mixed';
  return ar ? 'ar' : 'en';
};
export const normalizeAR = (t: string) => t.normalize('NFC').replace(/[\u064B-\u0652]/g,'').replace(/[أإآ]/g,'ا');
export const normalizeEN = (t: string) => t.replace(/\s+/g,' ').trim();
