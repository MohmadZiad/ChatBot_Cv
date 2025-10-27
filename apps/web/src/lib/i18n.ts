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
      summaryTitle: "ملخص الموارد البشرية",
      strengths: "نقاط القوة",
      risks: "مخاطر",
      improvements: "تحسينات مقترحة",
      missingMust: "متطلبات أساسية مفقودة",
      mustPercent: "مطابقة الـMust",
      nicePercent: "مطابقة الـNice",
      gatePassed: "اجتياز العتبة",
      exportPdf: "تصدير PDF",
      exportCsv: "تصدير Excel",
      viewFull: "افتح لوحة التحليل",
      stored: "تم حفظ التحليل في قاعدة البيانات.",
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
      summaryTitle: "HR Summary",
      strengths: "Strengths",
      risks: "Risks",
      improvements: "Suggested Improvements",
      missingMust: "Missing must-have",
      mustPercent: "Must match",
      nicePercent: "Nice-to-have",
      gatePassed: "Gate passed",
      exportPdf: "Export PDF",
      exportCsv: "Export Excel",
      viewFull: "Open full dashboard",
      stored: "Analysis stored in the database.",
    },
  },
} as const;

export function t(lang: Lang, path: string): string {
  const parts = path.split(".");
  let node: unknown = dict[lang] as unknown;
  for (const part of parts) {
    if (node && typeof node === "object" && part in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[part];
    } else {
      node = undefined;
      break;
    }
  }
  return typeof node === "string" ? node : path;
}
