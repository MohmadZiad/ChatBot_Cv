export function detectLang(text: string): 'ar' | 'en' | 'mixed' {
  const ar = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const en = (text.match(/[A-Za-z]/g) || []).length;
  if (ar > en * 1.2) return 'ar';
  if (en > ar * 1.2) return 'en';
  return 'mixed';
}
