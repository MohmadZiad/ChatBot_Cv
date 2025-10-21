export type Lang = "ar" | "en";

export const dict = {
  ar: {
    app: "مطابقة السير للوظائف",
    chat: {
      title: "مساعد التحليل",
      hello:
        'اكتب متطلبات الوظيفة، ثم ارفع CV، واضغط "حلّل الآن" — سأرجع لك النتيجة المفصلة.',
      run: "حلّل الآن",
      running: "جاري التحليل...",
      score: "النتيجة",
      gaps: "الفجوات",
      evidence: "الأدلّة",
      done: "تم التحليل",
    },
  },
  en: {
    app: "CV Matcher",
    chat: {
      title: "Analysis Assistant",
      hello:
        'Write job requirements, upload a CV, then click "Run Now" — I will return a detailed result.',
      run: "Run Now",
      running: "Running...",
      score: "Score",
      gaps: "Gaps",
      evidence: "Evidence",
      done: "Analysis complete",
    },
  },
} as const;

export function t(lang: Lang, path: string): string {
  const parts = path.split(".");
  // @ts-ignore
  let node: any = dict[lang];
  for (const p of parts) node = node?.[p];
  return (node ?? path) as string;
}
