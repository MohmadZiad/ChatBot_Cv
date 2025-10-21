export function detectLang(t: string): 'ar' | 'en' | 'mixed' {
  const ar = /[\u0600-\u06FF]/.test(t);
  const en = /[A-Za-z]/.test(t);
  if (ar && en) return 'mixed';
  return ar ? 'ar' : 'en';
}
