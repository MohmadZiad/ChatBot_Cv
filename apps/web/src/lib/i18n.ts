export type Lang = "ar" | "en";

export const dict = {
  ar: {
    app: "مطابقة السير للوظائف",
    chat: {
      title: "مساعد التحليل",
      subtitle: "مساعد توظيف مدعوم بالذكاء الاصطناعي على مدار التجربة.",
      hello:
        'اكتب متطلبات الوظيفة، ثم ارفع CV، واضغط "حلّل الآن" — سأرجع لك النتيجة المفصلة.',
      run: "حلّل الآن",
      running: "جاري التحليل...",
      reset: "حذف المحادثة",
      jdTitle: "وصف الوظيفة (اختياري)",
      clear: "مسح",
      jdPlaceholder:
        "ألصق وصف الدور أو نقاط سريعة لتحويلها إلى متطلبات قابلة للتحليل...",
      extracting: "جارٍ الاستخراج...",
      suggest: "اقترح المتطلبات بالذكاء",
      jdHint: "استخدم وصفاً مختصراً وسنحوّله إلى متطلبات مع أوزان وجاهز للتحليل.",
      pickCv: "اختر السيرة الذاتية الأساسية",
      secondCv: "سيرة إضافية للمقارنة",
      secondCvPlaceholder: "اختر سيرة إضافية",
      pickJob: "اختر الوظيفة",
      addSelection: "أضف للمجموعة",
      selectedHint: "يمكنك اختيار حتى 4 سير للمقارنة أو الترتيب.",
      compare: "قارن السير الذاتية",
      compareAction: "بدء مقارنة السير",
      compareSummary: "نتيجة المقارنة",
      pickBest: "ترتيب الأفضل",
      pickBestAction: "ابدأ اختيار أفضل السير",
      rankingSummary: "ملخص الترتيب",
      improve: "تحسين السيرة",
      improveAction: "اقترح تحسينات",
      aiSuggested: "متطلبات مقترحة",
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
      mustTag: "أساسي",
      weightLabel: "وزن",
      errorGeneric: "حدث خلل غير متوقع. حاول مجدداً خلال لحظات.",
      errorValidation: "بعض المدخلات غير مكتملة أو غير صحيحة. تحقق ثم أعد المحاولة.",
      errorNetwork: "تعذّر الاتصال بالخادم. تأكد من الإنترنت ثم حاول مرة أخرى.",
      errorTimeout: "انتهت مهلة الطلب. حاول إعادة المحاولة بعد لحظات.",
      errorDetails: "التفاصيل:",
    },
  },
  en: {
    app: "CV Matcher",
    chat: {
      title: "Analysis Assistant",
      subtitle: "An AI recruiter that follows you across the experience.",
      hello:
        'Write job requirements, upload a CV, then click "Run Now" — I will return a detailed result.',
      run: "Run Now",
      running: "Running...",
      reset: "Reset conversation",
      jdTitle: "Job description (optional)",
      clear: "Clear",
      jdPlaceholder:
        "Paste the job brief or bullet points and I will turn them into weighted requirements...",
      extracting: "Extracting...",
      suggest: "Suggest requirements",
      jdHint: "Paste a quick JD and the assistant will build weighted requirements.",
      pickCv: "Select primary CV",
      secondCv: "Comparison CV",
      secondCvPlaceholder: "Pick another CV to compare",
      pickJob: "Select job",
      addSelection: "Add to selection",
      selectedHint: "Select up to four CVs to compare or rank.",
      compare: "Compare CVs",
      compareAction: "Compare CVs",
      compareSummary: "Comparison summary",
      pickBest: "Rank best fit",
      pickBestAction: "Rank the best CVs",
      rankingSummary: "Ranking summary",
      improve: "Improve CV",
      improveAction: "Suggest improvements",
      aiSuggested: "AI suggested requirements",
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
      mustTag: "Must",
      weightLabel: "Weight",
      errorGeneric: "Something unexpected happened. Please try again shortly.",
      errorValidation: "Some inputs are missing or invalid. Review them and try again.",
      errorNetwork: "We couldn't reach the server. Check your connection and retry.",
      errorTimeout: "The request timed out. Try once more in a moment.",
      errorDetails: "Details:",
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
