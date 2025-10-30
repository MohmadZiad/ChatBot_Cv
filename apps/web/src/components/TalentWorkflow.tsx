"use client";

import * as React from "react";
import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Award,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Columns2,
  Download,
  FileOutput,
  FileText,
  Filter,
  Github,
  Link2,
  Linkedin,
  Loader2,
  Sparkles,
  Pin,
  RefreshCw,
  Trash2,
  UploadCloud,
  Users,
  X,
} from "lucide-react";
import { cvApi } from "@/services/api/cv";
import { jobsApi, type JobRequirement } from "@/services/api/jobs";
import {
  analysesApi,
  type Analysis,
  type ImproveResponse,
} from "@/services/api/analyses";
import type { Lang } from "@/lib/i18n";
import { useLang } from "@/lib/use-lang";

type UploadStatus =
  | "pending"
  | "uploading"
  | "analysing"
  | "success"
  | "error"
  | "duplicate";

type UploadItem = {
  id: string;
  file: File;
  name: string;
  size: number;
  status: UploadStatus;
  message?: string;
  cvId?: string;
  resultId?: string;
};

type CandidateMeta = {
  displayName: string;
  email?: string;
  phone?: string;
  location?: string;
  languages: string[];
  yearsExperience?: number;
  lastCompany?: string;
  projects: { label: string; url?: string }[];
  github: string[];
  linkedin: string[];
  textLength: number;
  summaryLine?: string;
  qualitySignals: string[];
};

type CandidateScores = {
  mustPercent: number;
  nicePercent: number;
  experienceScore: number;
  experienceStatus: "within" | "below" | "above" | "unknown";
  qualityScore: number;
  finalScore: number;
  gatePassed: boolean;
  status: "recommended" | "consider" | "excluded";
  missingMust: string[];
  duplicateOf?: string;
};

const STATUS_BADGE_MAP: Record<CandidateScores["status"], string> = {
  recommended: "bg-[#DCFCE7] text-[#166534]",
  consider: "bg-[#FEF3C7] text-[#92400E]",
  excluded: "bg-[#FDE8E8] text-[#B91C1C]",
};

function getStatusBadgeClass(
  scores: CandidateScores,
  isDuplicate: boolean
): string {
  if (isDuplicate) return "bg-[#E0E7FF] text-[#3730A3]";
  return STATUS_BADGE_MAP[scores.status];
}

type CandidateResult = {
  id: string;
  uploadId: string;
  cvId: string;
  fileName: string;
  meta: CandidateMeta;
  scores: CandidateScores;
  analysis: Analysis & { message?: string };
  ai?: Pick<ImproveResponse, "summary" | "suggestions" | "metrics"> | null;
};

type SortKey =
  | "finalScore"
  | "mustPercent"
  | "nicePercent"
  | "experience"
  | "name"
  | "status";

type JobTemplate = {
  id: string;
  title: string;
  description: string;
  must: string[];
  nice: string[];
  experienceBand?: string | null;
  level?: string | null;
  contract?: string | null;
  languages: string[];
};

type ExperienceBand = {
  id: string;
  label: { ar: string; en: string };
  min: number;
  max: number | null;
};

type Option = { id: string; label: { ar: string; en: string } };
type SkillSuggestion = { id: string; label: string };

const getOptionLabel = (option: Option, lang: Lang) =>
  option.label?.[lang] ?? option.label?.ar ?? option.label?.en ?? option.id;

const experienceBands: ExperienceBand[] = [
  { id: "0-1", label: { ar: "0 - 1 سنة", en: "0-1 years" }, min: 0, max: 1 },
  { id: "2-4", label: { ar: "2 - 4 سنوات", en: "2-4 years" }, min: 2, max: 4 },
  { id: "5-8", label: { ar: "5 - 8 سنوات", en: "5-8 years" }, min: 5, max: 8 },
  { id: "9+", label: { ar: "9+ سنوات", en: "9+ years" }, min: 9, max: null },
];

const levelOptions: Option[] = [
  { id: "junior", label: { ar: "Junior", en: "Junior" } },
  { id: "mid", label: { ar: "Mid", en: "Mid" } },
  { id: "senior", label: { ar: "Senior", en: "Senior" } },
  { id: "lead", label: { ar: "Lead", en: "Lead" } },
];

const contractOptions: Option[] = [
  { id: "fulltime", label: { ar: "دوام كامل", en: "Full-time" } },
  { id: "parttime", label: { ar: "دوام جزئي", en: "Part-time" } },
  { id: "contract", label: { ar: "عقد/فريلانس", en: "Contract" } },
  { id: "remote", label: { ar: "عن بُعد", en: "Remote" } },
];

const languageOptions: Option[] = [
  { id: "ar", label: { ar: "العربية", en: "Arabic" } },
  { id: "en", label: { ar: "الإنجليزية", en: "English" } },
  { id: "fr", label: { ar: "الفرنسية", en: "French" } },
  { id: "de", label: { ar: "الألمانية", en: "German" } },
  { id: "es", label: { ar: "الإسبانية", en: "Spanish" } },
];

const mustSuggestions: SkillSuggestion[] = [
  { id: "react", label: "React" },
  { id: "node", label: "Node.js" },
  { id: "typescript", label: "TypeScript" },
  { id: "rest", label: "REST APIs" },
  { id: "sql", label: "SQL" },
  { id: "docker", label: "Docker" },
  { id: "testing", label: "Testing / Jest" },
];

const niceSuggestions: SkillSuggestion[] = [
  { id: "next", label: "Next.js" },
  { id: "graphql", label: "GraphQL" },
  { id: "aws", label: "AWS" },
  { id: "gcp", label: "GCP" },
  { id: "tailwind", label: "Tailwind CSS" },
  { id: "ci", label: "CI/CD" },
  { id: "design", label: "UX Collaboration" },
];

const COPY = {
  ar: {
    hero: {
      badge: "AI Workflow",
      title: "مساعد مطابقة السِيَر الذاتية مع الوظائف",
      subtitle:
        "حوّل توصيف الوظيفة وتحليل السير الذاتية إلى لوحة واحدة برتقالية احترافية — جاهزة للإطلاق التجاري.",
    },
    steps: {
      step1: "الخطوة 1: توصيف الوظيفة",
      step1Hint:
        "حقول واضحة + شرائح لتحديد المهارات، الخبرة، المستوى، نوع التعاقد واللغة.",
      step2: "الخطوة 2: الرفع والفرز",
      step2Hint:
        "اسحب ما يصل إلى 50 ملف CV، مع كشف تلقائي للتكرار وإمكانية إعادة المحاولة.",
      step3: "الخطوة 3: النتائج الذكية",
      step3Hint: "جدول قابل للفرز والتصفية مع شريط إجراءات ثابت أعلى النتائج.",
      step4: "الخطوة 4: صفحة المقارنة",
      step4Hint: "قارن 2-4 مرشحين جنباً إلى جنب مع نقاط القوة والضعف والتوصية.",
      step5: "الخطوة 5: تقرير مختصر",
      step5Hint: "زر واحد لتوليد تقرير مدير التوظيف بصفحة واحدة.",
    },
    fields: {
      jobTitle: "عنوان الوظيفة",
      jobTitlePlaceholder: "مثال: مطوّر React متقدم",
      jobDescription: "وصف مختصر",
      jobDescriptionPlaceholder:
        "املأ المسؤوليات الأساسية، التقنيات اليومية، ومن ستعمل معه...",
      mustHave: "مهارات Must-have",
      niceToHave: "مهارات Nice-to-have",
      chipHint: "اكتب واضغط Enter لإضافة شريحة جديدة.",
      experience: "الخبرة المطلوبة",
      level: "المستوى",
      contract: "نوع التعاقد",
      languages: "اللغة",
      templates: "قوالب محفوظة",
      loadTemplate: "استدعاء",
      noTemplates: "لا توجد قوالب بعد — احفظ أول توصيف لاستعادته لاحقًا.",
    },
    buttons: {
      saveTemplate: "حفظ التوصيف",
      startAnalysis: "ابدأ التحليل",
      runBatch: "ابدأ التحليل الجماعي",
      retry: "إعادة المحاولة",
      remove: "إزالة",
      selectBest: "اختيار أفضل 3",
      compare: "مقارنة المختارين",
      exportPdf: "تصدير PDF",
      exportCsv: "تصدير CSV",
      managerReport: "تقرير مدير التوظيف",
      close: "إغلاق",
    },
    uploads: {
      dropLabel: "اسحب الملفات هنا",
      browse: "اختر ملفات",
      limit: "حتى 50 ملف (PDF أو DOC/DOCX)",
      counter: "عدد الملفات",
      status: {
        pending: "بانتظار",
        uploading: "جاري الرفع",
        analysing: "جاري التحليل",
        success: "تم الاستخراج",
        error: "فشل",
        duplicate: "مكرر",
      },
      duplicateReason: "تكرار بناءً على {reason}.",
      ready: "جاهز للتحليل.",
    },
    table: {
      columns: {
        candidate: "الاسم",
        experience: "الخبرة (سنوات)",
        must: "تطابق Must-have %",
        nice: "تطابق Nice-to-have %",
        final: "الدرجة النهائية",
        languages: "اللغات",
        lastCompany: "آخر شركة",
        notes: "ملاحظات الذكاء الاصطناعي",
        status: "الحالة",
      },
      filtersTitle: "فلاتر سريعة",
      empty: "ابدأ التحليل لعرض النتائج.",
      selectedCount: "تم اختيار {count} مرشح.",
    },
    statuses: {
      recommended: "مُوصى به",
      consider: "قابل للمقابلة",
      excluded: "مستبعد",
      duplicate: "مكرر",
    },
    filters: {
      mustGate: "استبعاد غير المستوفين للـMust-have",
      exp24: "خبرة 2-4 سنوات",
      react: "يتقن React",
      highNice: "مهارات إضافية فوق 55%",
      recommended: "موصى به فقط",
      languageLabel: "اللغة",
      languageAny: "كل اللغات",
      languageArabic: "العربية",
      languageEnglish: "الإنجليزية",
      languageBilingual: "ثنائي اللغة",
      statusLabel: "الحالة",
      statusAny: "الكل",
      statusRecommended: "موصى به",
      statusConsider: "قابل للمقابلة",
      statusExcluded: "مستبعد",
      scoreLabel: "درجة مطابقة",
      scoreAny: "بدون حد",
      score70: "70%+",
      score80: "80%+",
    },
    insights: {
      summary: {
        recommended: "مرشح موصى به بدرجة {score}%.",
        consider: "قابل للمقابلة بدرجة {score}%.",
        excluded: "تم استبعاده بدرجة {score}%.",
        duplicate: "مكرر لنفس المتقدم ({name}).",
      },
      summaryDetails: {
        must: "تغطية الـMust-have {value}.",
        nice: "المهارات الإضافية {value}.",
        languages: "اللغات: {value}.",
        experience: "الخبرة: {value}.",
        quality: "جودة السيرة: {value}.",
      },
      gateFail: "لم يحقق 60% من مهارات الـMust-have.",
      strengths: {
        must: "حقق {value}% من متطلبات الـMust-have.",
        nice: "أظهر {value}% من مهارات Nice-to-have.",
        experience: "خبرته ({value} سنة) ضمن النطاق المطلوب.",
        languages: "يتحدث {value}.",
        projects: "يملك {value} مشاريع أو روابط موثوقة.",
        quality: "تنسيق السيرة واضح ومنظم.",
        skill: "مهارة {value} بدرجة {score}/10.",
      },
      weaknesses: {
        experienceLow: "الخبرة ({value} سنة) أقل من المطلوب ({target}).",
        experienceHigh: "الخبرة أعلى من النطاق المطلوب.",
        qualityLow: "تنسيق السيرة يحتاج تحسين.",
        missingMust: "يفتقد: {items}.",
        aiGaps: "مجالات للتحسين: {items}.",
        aiSuggestion: "اقتراح تحسين: {item}.",
      },
    },
    comparison: {
      title: "مقارنة المرشحين",
      empty: "اختر على الأقل مرشحين للمقارنة.",
      strengths: "نقاط القوة",
      weaknesses: "نقاط الضعف",
      skills: "أهم المهارات",
      languages: "اللغات",
      links: "روابط مهمة",
      scorecard: {
        heading: "مؤشرات المطابقة",
        final: "الدرجة النهائية",
        must: "Must-have",
        nice: "Nice-to-have",
      },
      recommendation: "التوصية",
      close: "إغلاق المقارنة",
    },
    report: {
      generated: "تم فتح التقرير في نافذة جديدة للطباعة.",
    },
    notifications: {
      saved: "تم حفظ التوصيف كقالب.",
      jobCreated: "تم حفظ الوظيفة وجاهزة للتحليل.",
      processing: "جاري تحليل السير الذاتية...",
      finished: "اكتمل تحليل جميع الملفات.",
      duplicate: "تم رصد ملف مكرر وتم وضع علامة عليه.",
      error: "حدث خطأ: {message}",
      limitReached: "تم الوصول إلى الحد الأقصى (50 ملف).",
      addedFiles: "تمت إضافة {count} ملفات.",
      autoFilled: "تم توليد المتطلبات تلقائياً من وصف الوظيفة.",
      autoFillFailed: "تعذّر استخراج المتطلبات تلقائياً. أضفها يدوياً.",
    },
    managerReport: {
      title: "تقرير مدير التوظيف",
      intro: "أفضل {count} مرشحين بعد التحليل الجماعي.",
      ranking: "الترتيب",
      reason: "سبب الاختيار",
      risks: "المخاطر",
      languages: "اللغات: {value}",
      missingMust: "فجوات: {value}",
    },
  },
  en: {
    hero: {
      badge: "AI Workflow",
      title: "Precision talent intelligence",
      subtitle:
        "Define the job, drop up to 50 resumes, and deliver explainable scoring in minutes — production ready.",
    },
    steps: {
      step1: "Step 1: Job definition",
      step1Hint:
        "Structured fields and chips for must-have skills, experience, level, contract and languages.",
      step2: "Step 2: Upload & triage",
      step2Hint:
        "Drag & drop up to 50 CVs with duplicate detection and retry handling.",
      step3: "Step 3: Smart results",
      step3Hint: "Sortable table with quick filters and action bar.",
      step4: "Step 4: Comparison view",
      step4Hint:
        "Compare 2–4 candidates side by side with strengths and weaknesses.",
      step5: "Step 5: Manager report",
      step5Hint: "Generate a one-page summary ready to share.",
    },
    fields: {
      jobTitle: "Job title",
      jobTitlePlaceholder: "Example: Senior React Engineer",
      jobDescription: "Short description",
      jobDescriptionPlaceholder:
        "Outline responsibilities, tech stack, team context and success metrics...",
      mustHave: "Must-have skills",
      niceToHave: "Nice-to-have skills",
      chipHint: "Type and press Enter to add a chip.",
      experience: "Experience",
      level: "Seniority",
      contract: "Contract type",
      languages: "Language",
      templates: "Saved templates",
      loadTemplate: "Load",
      noTemplates:
        "No templates yet — save the first definition to reuse it later.",
    },
    buttons: {
      saveTemplate: "Save template",
      startAnalysis: "Start analysis",
      runBatch: "Run bulk analysis",
      retry: "Retry",
      remove: "Remove",
      selectBest: "Pick top 3",
      compare: "Compare selected",
      exportPdf: "Export PDF",
      exportCsv: "Export CSV",
      managerReport: "Manager report",
      close: "Close",
    },
    uploads: {
      dropLabel: "Drop files here",
      browse: "browse",
      limit: "Up to 50 files (PDF or DOC/DOCX)",
      counter: "Files",
      status: {
        pending: "Pending",
        uploading: "Uploading",
        analysing: "Analysing",
        success: "Parsed",
        error: "Failed",
        duplicate: "Duplicate",
      },
      duplicateReason: "Duplicate detected based on {reason}.",
      ready: "Ready to analyse.",
    },
    table: {
      columns: {
        candidate: "Candidate",
        experience: "Experience (years)",
        must: "Must-have %",
        nice: "Nice-to-have %",
        final: "Final score",
        languages: "Languages",
        lastCompany: "Last company",
        notes: "AI notes",
        status: "Status",
      },
      filtersTitle: "Quick filters",
      empty: "Run the analysis to populate the table.",
      selectedCount: "{count} candidates selected.",
    },
    statuses: {
      recommended: "Recommended",
      consider: "Interview",
      excluded: "Excluded",
      duplicate: "Duplicate",
    },
    filters: {
      mustGate: "Hide must-have failures",
      exp24: "Experience 2-4 years",
      react: "Strong in React",
      highNice: "55%+ nice-to-have",
      recommended: "Recommended only",
      languageLabel: "Language",
      languageAny: "Any",
      languageArabic: "Arabic",
      languageEnglish: "English",
      languageBilingual: "Bilingual",
      statusLabel: "Status",
      statusAny: "Any",
      statusRecommended: "Recommended",
      statusConsider: "Interview",
      statusExcluded: "Excluded",
      scoreLabel: "Match floor",
      scoreAny: "No minimum",
      score70: "70%+",
      score80: "80%+",
    },
    insights: {
      summary: {
        recommended: "Recommended with a {score}% score.",
        consider: "Interview with a {score}% score.",
        excluded: "Excluded with a {score}% score.",
        duplicate: "Duplicate of {name}.",
      },
      summaryDetails: {
        must: "Must-have coverage {value}.",
        nice: "Nice-to-have coverage {value}.",
        languages: "Languages: {value}.",
        experience: "Experience: {value}.",
        quality: "CV quality: {value}.",
      },
      gateFail: "Did not reach 60% of must-have skills.",
      strengths: {
        must: "Matched {value}% of must-have skills.",
        nice: "Matched {value}% of nice-to-have skills.",
        experience: "Experience ({value} yrs) matches the required band.",
        languages: "Speaks {value}.",
        projects: "Has {value} relevant projects or links.",
        quality: "Resume is well structured and clear.",
        skill: "Skill {value} scored {score}/10.",
      },
      weaknesses: {
        experienceLow:
          "Experience ({value} yrs) is below the target ({target}).",
        experienceHigh: "Experience exceeds the target range.",
        qualityLow: "Resume formatting needs improvement.",
        missingMust: "Missing: {items}.",
        aiGaps: "Improve: {items}.",
        aiSuggestion: "AI recommendation: {item}.",
      },
    },
    comparison: {
      title: "Candidate comparison",
      empty: "Pick at least two candidates to compare.",
      strengths: "Strengths",
      weaknesses: "Weaknesses",
      skills: "Key skills",
      languages: "Languages",
      links: "Key links",
      scorecard: {
        heading: "Match snapshot",
        final: "Final score",
        must: "Must-have",
        nice: "Nice-to-have",
      },
      recommendation: "Recommendation",
      close: "Close comparison",
    },
    report: {
      generated: "Report opened in a new tab ready for print/PDF.",
    },
    notifications: {
      saved: "Job definition saved as template.",
      jobCreated: "Job saved and ready to analyse.",
      processing: "Analysing uploaded CVs...",
      finished: "All files analysed.",
      duplicate: "Duplicate detected and flagged.",
      error: "Error: {message}",
      limitReached: "Maximum number of files reached (50).",
      addedFiles: "Added {count} files.",
      autoFilled: "Auto-filled requirements from the job description.",
      autoFillFailed:
        "Couldn't extract requirements automatically. Please enter them manually.",
    },
    managerReport: {
      title: "Hiring manager report",
      intro: "Top {count} candidates based on bulk analysis.",
      ranking: "Ranking",
      reason: "Why selected",
      risks: "Risks",
      languages: "Languages: {value}",
      missingMust: "Gaps: {value}",
    },
  },
} as const;

type CopyKey = (typeof COPY)[keyof typeof COPY];

const TEMPLATES_KEY = "job-templates-v2";
const MAX_FILES = 50;

function randomId() {
  return Math.random().toString(36).slice(2);
}

function formatPercent(value: number): string {
  const rounded = Number(value.toFixed(1));
  return Number.isInteger(rounded)
    ? String(Math.round(rounded))
    : rounded.toFixed(1);
}

function formatExperienceYears(value: number, lang: Lang): string {
  const rounded = Number(value.toFixed(1));
  const display = Number.isInteger(rounded)
    ? String(Math.round(rounded))
    : rounded.toFixed(1);
  if (lang === "ar") {
    if (display === "0") return "0 سنة";
    if (display === "1") return "سنة واحدة";
    if (display === "2") return "سنتان";
    return `${display} سنوات`;
  }
  return `${display} yrs`;
}

function formatBytes(size: number): string {
  if (!size) return "0";
  const units = ["B", "KB", "MB", "GB"];
  const idx = Math.min(
    units.length - 1,
    Math.floor(Math.log(size) / Math.log(1024))
  );
  const value = size / 1024 ** idx;
  return `${value.toFixed(idx === 0 ? 0 : value < 10 ? 1 : 0)} ${units[idx]}`;
}

function normalizePhone(value?: string): string | undefined {
  if (!value) return undefined;
  return value.replace(/[^\d+]/g, "");
}

function formatList(items: string[], lang: Lang): string {
  if (!items.length) return "";
  return lang === "ar" ? items.join("، ") : items.join(", ");
}

function fmt(
  template: string,
  replacements: Record<string, string | number>
): string {
  let out = template;
  for (const [key, value] of Object.entries(replacements)) {
    out = out.replace(new RegExp(`\\{${key}\\}`, "g"), String(value));
  }
  return out;
}
function hostLabelFromUrl(url: string, fallback: string): string {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^www\./i, "");
    if (!hostname) return fallback;
    return hostname;
  } catch {
    const cleaned = url.replace(/^https?:\/\//i, "").split(/[/?#]/)[0];
    return cleaned || fallback;
  }
}
function formatLinkBadgeLabel(
  url: string,
  platform?: "github" | "linkedin"
): string {
  if (platform === "github" || platform === "linkedin") {
    const prefix = platform === "github" ? "GitHub" : "LinkedIn";
    try {
      const parsed = new URL(url);
      const path = parsed.pathname.replace(/\/$/, "").split("/").filter(Boolean);
      if (path.length) {
        return `${prefix} • ${path[0]}`;
      }
    } catch {
      const fallback = url.replace(/^https?:\/\//i, "");
      const parts = fallback.split(/[/?#]/).filter(Boolean);
      if (parts.length > 1) return `${prefix} • ${parts[1]}`;
    }
    return prefix;
  }
  return hostLabelFromUrl(url, "Link");
}

function detectLanguages(text: string): string[] {
  const found = new Set<string>();
  const pairs: [RegExp, string][] = [
    [/english|ingles/i, "English"],
    [/arabic|العربية/i, "Arabic"],
    [/french|français|الفرنسية/i, "French"],
    [/german|deutsch|الألمانية/i, "German"],
    [/spanish|español|الإسبانية/i, "Spanish"],
  ];
  for (const [regex, label] of pairs) {
    if (regex.test(text)) found.add(label);
  }
  return Array.from(found);
}

function parseCandidateMeta(
  text: string | null | undefined,
  fallbackName: string,
  cvLang?: string | null
): CandidateMeta {
  const safeText = text ? text.replace(/\r/g, "") : "";
  const lines = safeText
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const displayName = lines[0]?.replace(/[#*•\-]/g, "").trim() || fallbackName;

  const emailMatch = safeText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi);
  const phoneMatch = safeText.match(/\+?[0-9][0-9\s().-]{6,}/g);

  const locationMatch = safeText.match(/(?:Location|الموقع)[:\s]+([^\n]+)/i);

  const experienceMatch = safeText.match(
    /(\d{1,2})\s*(?:years?|yrs?|سن(?:ة|وات)|عام|خبرة)/gi
  );
  const yearsExperience = experienceMatch
    ?.map((token) => Number(token.replace(/[^0-9]/g, "")))
    .filter((n) => !Number.isNaN(n))
    .reduce((acc, curr) => Math.max(acc, curr), 0);

  const companyMatch = safeText.match(
    /(?:Company|Employer|شركة)[:\s]+([^\n]+)/i
  );
  let lastCompany = companyMatch?.[1]?.trim();
  if (!lastCompany) {
    const atMatch = safeText.match(/\b(?:at|@)\s+([A-Z][\w& ]{2,40})/);
    if (atMatch) lastCompany = atMatch[1].trim();
  }

  const linkMatches = safeText.match(/https?:\/\/[^\s)]+/gi) || [];
  const github = linkMatches.filter((url) => /github\.com/i.test(url));
  const linkedin = linkMatches.filter((url) => /linkedin\.com/i.test(url));
  const projectLinks = linkMatches
    .filter((url) => !github.includes(url) && !linkedin.includes(url))
    .slice(0, 5)
    .map((url, idx) => ({
      label: hostLabelFromUrl(url, `Link ${idx + 1}`),
      url,
    }));

  const detectedLanguages = detectLanguages(safeText);
  if (cvLang) {
    const mapped = languageOptions.find((l) => l.id === cvLang)?.label.en;
    if (mapped) detectedLanguages.unshift(mapped);
  }

  const summaryLine =
    lines.find((line) => /summary|objective|ملخص/i.test(line)) || lines[1];

  const qualitySignals: string[] = [];
  if (/summary|objective|ملخص/i.test(safeText)) qualitySignals.push("sections");
  if (/experience|projects|education|skills|الخبرات|المهارات/i.test(safeText))
    qualitySignals.push("headings");
  if (/-\s|•\s|●\s/.test(safeText)) qualitySignals.push("bullets");

  return {
    displayName,
    email: emailMatch?.[0],
    phone: phoneMatch?.[0],
    location: locationMatch?.[1]?.trim(),
    languages: Array.from(new Set(detectedLanguages)).slice(0, 5),
    yearsExperience: yearsExperience
      ? Math.min(yearsExperience, 40)
      : undefined,
    lastCompany,
    projects: projectLinks,
    github,
    linkedin,
    textLength: safeText.length,
    summaryLine,
    qualitySignals,
  };
}

function computeQualityScore(meta: CandidateMeta): {
  score: number;
  signals: string[];
} {
  let score = 0;
  const signals: string[] = [];
  if (meta.textLength > 2000) {
    score += 40;
    signals.push("detail");
  } else if (meta.textLength > 900) {
    score += 28;
    signals.push("detail");
  } else if (meta.textLength > 300) {
    score += 18;
  }

  if (meta.qualitySignals.includes("sections")) {
    score += 24;
    signals.push("sections");
  }
  if (meta.qualitySignals.includes("bullets")) {
    score += 16;
    signals.push("bullets");
  }
  if (meta.email && meta.phone) {
    score += 10;
    signals.push("contact");
  } else if (meta.email || meta.phone) {
    score += 6;
  }
  if (meta.languages.length > 1) {
    score += 10;
    signals.push("languages");
  }
  if (meta.projects.length > 0) {
    score += 8;
    signals.push("projects");
  }

  return { score: Math.min(100, Math.round(score)), signals };
}

function computeExperienceScore(
  years: number | undefined,
  bandId: string | null
): { score: number; status: "within" | "below" | "above" | "unknown" } {
  if (!bandId) {
    if (years == null) return { score: 60, status: "unknown" };
    return {
      score: Math.min(100, Math.round(Math.min(years * 15, 90))),
      status: "unknown",
    };
  }
  const band = experienceBands.find((b) => b.id === bandId);
  if (!band) return { score: 60, status: "unknown" };
  if (years == null) return { score: 55, status: "unknown" };

  if (years >= band.min && (band.max == null || years <= band.max)) {
    return { score: 100, status: "within" };
  }
  if (years < band.min) {
    const diff = band.min - years;
    const score = Math.max(25, Math.round(100 - diff * 18));
    return { score, status: "below" };
  }
  if (band.max != null && years > band.max) {
    const diff = years - band.max;
    const score = Math.max(55, Math.round(95 - diff * 10));
    return { score, status: "above" };
  }
  return { score: 90, status: "within" };
}

function computeScores(
  analysis: Analysis,
  meta: CandidateMeta,
  jobConfig: { experienceBand: string | null },
  duplicateOf?: string
): CandidateScores {
  const breakdown = Array.isArray(analysis.breakdown) ? analysis.breakdown : [];
  const must = breakdown.filter((b) => b.mustHave);
  const nice = breakdown.filter((b) => !b.mustHave);

  const mustPercent = must.length
    ? (must.reduce(
        (sum, item) => sum + Number(item.score10 ?? item.similarity * 10),
        0
      ) /
        (must.length * 10)) *
      100
    : 0;
  const nicePercent = nice.length
    ? (nice.reduce(
        (sum, item) => sum + Number(item.score10 ?? item.similarity * 10),
        0
      ) /
        (nice.length * 10)) *
      100
    : 0;

  const gatePassed = must.length === 0 || mustPercent >= 60;

  const exp = computeExperienceScore(
    meta.yearsExperience,
    jobConfig.experienceBand
  );
  const quality = computeQualityScore(meta);

  const finalScore =
    Math.round(
      (0.5 * mustPercent +
        0.2 * nicePercent +
        0.2 * exp.score +
        0.1 * quality.score) *
        10
    ) / 10;

  let status: CandidateScores["status"] = "consider";
  if (!gatePassed || finalScore < 65 || duplicateOf) status = "excluded";
  else if (finalScore >= 85) status = "recommended";

  return {
    mustPercent: Math.min(100, Number(mustPercent.toFixed(1))),
    nicePercent: Math.min(100, Number(nicePercent.toFixed(1))),
    experienceScore: Math.min(100, exp.score),
    experienceStatus: exp.status,
    qualityScore: Math.min(100, quality.score),
    finalScore: Math.min(100, Math.max(0, finalScore)),
    gatePassed,
    status,
    missingMust: (analysis.gaps as any)?.mustHaveMissing ?? [],
    duplicateOf,
  };
}

type AiNarrative = {
  summary: string;
  strengths: string[];
  weaknesses: string[];
};

type SkillChip = { label: string; score: number; mustHave: boolean };

type LinkBadge = {
  label: string;
  url: string;
  type: "github" | "linkedin" | "project";
};

type StrengthMetric = {
  requirement?: string;
  score?: number;
  similarity?: number;
  mustHave?: boolean;
};

type RequirementBreakdown = {
  requirement?: string;
  score10?: number;
  similarity?: number;
  mustHave?: boolean;
};

function buildAiNarrative(
  result: CandidateResult,
  lang: Lang,
  copy: CopyKey,
  jobConfig: { experienceBand: string | null },
  duplicateName?: string
): AiNarrative {
  const { scores, meta, analysis } = result;
  const texts = copy.insights;
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const ai = result.ai;

  if (scores.duplicateOf) {
    const summary = fmt(texts.summary.duplicate, {
      name: duplicateName || result.meta.displayName,
    });
    return { summary, strengths, weaknesses: [summary] };
  }

  const scoreText = formatPercent(scores.finalScore);
  let summary = fmt(texts.summary[scores.status], { score: scoreText });

  if (ai?.summary) {
    summary = ai.summary;
  }

  const detailTemplates = texts.summaryDetails;
  const detailParts: string[] = [];
  if (detailTemplates) {
    detailParts.push(
      fmt(detailTemplates.must, { value: `${formatPercent(scores.mustPercent)}%` })
    );
    if (scores.nicePercent > 0) {
      detailParts.push(
        fmt(detailTemplates.nice, { value: `${formatPercent(scores.nicePercent)}%` })
      );
    }
    if (meta.languages.length) {
      const langs = formatList(meta.languages, lang) || meta.languages.join(
        lang === "ar" ? "، " : ", "
      );
      detailParts.push(fmt(detailTemplates.languages, { value: langs }));
    }
    if (typeof meta.yearsExperience === "number" && meta.yearsExperience >= 0) {
      detailParts.push(
        fmt(detailTemplates.experience, {
          value: formatExperienceYears(meta.yearsExperience, lang),
        })
      );
    }
    if (scores.qualityScore > 0) {
      detailParts.push(
        fmt(detailTemplates.quality, {
          value: `${formatPercent(scores.qualityScore)}%`,
        })
      );
    }
  }

  if (detailParts.length) {
    const separator = lang === "ar" ? " • " : " • ";
    const detailText = detailParts.join(separator);
    summary = summary ? `${summary}${separator}${detailText}` : detailText;
  }

  if (!scores.gatePassed) {
    weaknesses.push(texts.gateFail);
  }

  if (scores.mustPercent >= 85) {
    strengths.push(
      fmt(texts.strengths.must, { value: formatPercent(scores.mustPercent) })
    );
  }
  if (scores.nicePercent >= 60) {
    strengths.push(
      fmt(texts.strengths.nice, { value: formatPercent(scores.nicePercent) })
    );
  }
  if (scores.experienceStatus === "within" && meta.yearsExperience != null) {
    strengths.push(
      fmt(texts.strengths.experience, {
        value: formatPercent(meta.yearsExperience),
      })
    );
  }
  if (meta.languages.length) {
    strengths.push(
      fmt(texts.strengths.languages, {
        value: formatList(meta.languages, lang) || "",
      })
    );
  }
  if (meta.projects.length > 0 || meta.github.length || meta.linkedin.length) {
    const total =
      meta.projects.length + meta.github.length + meta.linkedin.length;
    strengths.push(fmt(texts.strengths.projects, { value: String(total) }));
  }
  if (scores.qualityScore >= 70) {
    strengths.push(texts.strengths.quality);
  }

  const topStrengths = Array.isArray(analysis.metrics?.topStrengths)
    ? (analysis.metrics?.topStrengths ?? [])
    : [];
  if (topStrengths.length) {
    topStrengths.slice(0, 4).forEach((item) => {
      if (!item?.requirement) return;
      strengths.push(
        fmt(texts.strengths.skill, {
          value: item.requirement,
          score: Number(item.score ?? item.similarity ?? 0).toFixed(1),
        })
      );
    });
  }

  if (scores.experienceStatus === "below" && meta.yearsExperience != null) {
    // قبل: b.id === jobConfig.experienceBand ?? ""
    const band = experienceBands.find(
      (b) => b.id === (jobConfig.experienceBand ?? "")
    );
    const target = band
      ? lang === "ar"
        ? band.label.ar
        : band.label.en
      : scores.experienceScore;
    weaknesses.push(
      fmt(texts.weaknesses.experienceLow, {
        value: formatPercent(meta.yearsExperience),
        target: String(target),
      })
    );
  }
  if (scores.experienceStatus === "above") {
    weaknesses.push(texts.weaknesses.experienceHigh);
  }
  if (scores.qualityScore < 55) {
    weaknesses.push(texts.weaknesses.qualityLow);
  }

  const missingMust = ai?.metrics?.missingMust?.length
    ? ai.metrics.missingMust
    : scores.missingMust?.length
      ? scores.missingMust
      : ((analysis.gaps as any)?.mustHaveMissing ?? []);
  if (missingMust.length) {
    weaknesses.push(
      fmt(texts.weaknesses.missingMust, {
        items: formatList(missingMust, lang),
      })
    );
  }

  const improvables = ai?.metrics?.improvement?.length
    ? ai.metrics.improvement
    : ((analysis.gaps as any)?.improve ?? []);
  if (improvables.length) {
    weaknesses.push(
      fmt(texts.weaknesses.aiGaps, {
        items: formatList(improvables.slice(0, 6), lang),
      })
    );
  }

  if (Array.isArray(ai?.suggestions) && ai.suggestions.length) {
    ai.suggestions.forEach((item) => {
      if (!item) return;
      weaknesses.push(
        fmt(texts.weaknesses.aiSuggestion, {
          item,
        })
      );
    });
  }

  return { summary, strengths, weaknesses };
}

function extractLinkBadges(meta: CandidateMeta): LinkBadge[] {
  const badges: LinkBadge[] = [];
  const seen = new Set<string>();

  meta.github.forEach((url) => {
    if (!url) return;
    const key = `github:${url}`;
    if (seen.has(key)) return;
    seen.add(key);
    badges.push({
      label: formatLinkBadgeLabel(url, "github"),
      url,
      type: "github",
    });
  });

  meta.linkedin.forEach((url) => {
    if (!url) return;
    const key = `linkedin:${url}`;
    if (seen.has(key)) return;
    seen.add(key);
    badges.push({
      label: formatLinkBadgeLabel(url, "linkedin"),
      url,
      type: "linkedin",
    });
  });

  meta.projects
    .filter((project) => project?.url)
    .forEach((project) => {
      const url = project.url!;
      const key = `project:${url}`;
      if (seen.has(key)) return;
      seen.add(key);
      badges.push({
        label: project.label || hostLabelFromUrl(url, "Link"),
        url,
        type: "project",
      });
    });

  return badges;
}

function collectTopSkillChips(result: CandidateResult): SkillChip[] {
  const breakdown = Array.isArray(result.analysis.breakdown)
    ? (result.analysis.breakdown as RequirementBreakdown[])
    : [];
  const metricsRaw = result.analysis.metrics as
    | { topStrengths?: StrengthMetric[] }
    | undefined;
  const fromMetrics = Array.isArray(metricsRaw?.topStrengths)
    ? metricsRaw?.topStrengths ?? []
    : [];

  const seen = new Map<string, SkillChip>();

  const addChip = (label?: string, score?: number, mustHave?: boolean) => {
    if (!label) return;
    const normalized = label.trim();
    if (!normalized) return;
    if (typeof score !== "number" || Number.isNaN(score)) return;
    const key = normalized.toLowerCase();
    const existing = seen.get(key);
    if (!existing || score > existing.score) {
      seen.set(key, {
        label: normalized,
        score,
        mustHave: Boolean(mustHave),
      });
    }
  };

  fromMetrics.forEach((entry) => {
    if (!entry) return;
    const value =
      typeof entry.score === "number"
        ? entry.score
        : typeof entry.similarity === "number"
        ? entry.similarity * 10
        : undefined;
    addChip(entry.requirement, value, entry.mustHave);
  });

  const sortedBreakdown = breakdown
    .slice()
    .sort((a, b) => {
      const aScore =
        typeof a.score10 === "number"
          ? a.score10
          : typeof a.similarity === "number"
          ? a.similarity * 10
          : 0;
      const bScore =
        typeof b.score10 === "number"
          ? b.score10
          : typeof b.similarity === "number"
          ? b.similarity * 10
          : 0;
      return bScore - aScore;
    });

  for (const entry of sortedBreakdown) {
    if (seen.size >= 8) break;
    const value =
      typeof entry.score10 === "number"
        ? entry.score10
        : typeof entry.similarity === "number"
        ? entry.similarity * 10
        : undefined;
    if (typeof value !== "number" || value < 5) continue;
    addChip(entry.requirement, value, entry.mustHave);
  }

  return Array.from(seen.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

type Banner = { type: "success" | "error" | "info"; text: string } | null;

export default function TalentWorkflow() {
  const lang = useLang();
  const copy = COPY[lang];
  const dir = lang === "ar" ? "rtl" : "ltr";

  const [jobTitle, setJobTitle] = React.useState("");
  const [jobDescription, setJobDescription] = React.useState("");
  const [mustSkills, setMustSkills] = React.useState<string[]>([]);
  const [niceSkills, setNiceSkills] = React.useState<string[]>([]);
  const [mustInput, setMustInput] = React.useState("");
  const [niceInput, setNiceInput] = React.useState("");
  const [experienceBand, setExperienceBand] = React.useState<string | null>(
    null
  );
  const [level, setLevel] = React.useState<string | null>(null);
  const [contract, setContract] = React.useState<string | null>(null);
  const [jobLanguages, setJobLanguages] = React.useState<string[]>([]);
  const autoSuggestKeyRef = React.useRef<string>("");
  const [autoSuggestStatus, setAutoSuggestStatus] = React.useState<
    "idle" | "loading" | "done" | "error"
  >("idle");

  const [templates, setTemplates] = React.useState<JobTemplate[]>([]);
  const [jobId, setJobId] = React.useState<string | null>(null);
  const [savingJob, setSavingJob] = React.useState(false);

  const [uploads, setUploads] = React.useState<UploadItem[]>([]);
  const [processing, setProcessing] = React.useState(false);
  const [banner, setBanner] = React.useState<Banner>(null);

  const [results, setResults] = React.useState<CandidateResult[]>([]);
  const resultsRef = React.useRef<CandidateResult[]>([]);
  React.useEffect(() => {
    resultsRef.current = results;
  }, [results]);

  const [selected, setSelected] = React.useState<string[]>([]);
  const [pinnedId, setPinnedId] = React.useState<string | null>(null);
  const [activeFilters, setActiveFilters] = React.useState<string[]>([]);
  const [languageFilter, setLanguageFilter] = React.useState<string>("all");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [scoreFilter, setScoreFilter] = React.useState<string>("any");
  const [sortState, setSortState] = React.useState<{
    key: SortKey;
    direction: "asc" | "desc";
  }>({ key: "finalScore", direction: "desc" });
  const [comparisonOpen, setComparisonOpen] = React.useState(false);

  const jobConfig = React.useMemo(
    () => ({ experienceBand, level, contract, languages: jobLanguages }),
    [experienceBand, level, contract, jobLanguages]
  );

  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(TEMPLATES_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as JobTemplate[];
        setTemplates(parsed);
      }
    } catch (error) {
      console.warn("Failed to load templates", error);
    }
  }, []);

  const pushBanner = React.useCallback((payload: NonNullable<Banner>) => {
    setBanner(payload);
    const timer = setTimeout(() => setBanner(null), 4200);
    return () => clearTimeout(timer);
  }, []);

  const addMustSkill = React.useCallback((value: string) => {
    const normalized = value.trim();
    if (!normalized) return;
    setMustSkills((prev) =>
      prev.includes(normalized) ? prev : [...prev, normalized].slice(0, 20)
    );
  }, []);

  const addNiceSkill = React.useCallback((value: string) => {
    const normalized = value.trim();
    if (!normalized) return;
    setNiceSkills((prev) =>
      prev.includes(normalized) ? prev : [...prev, normalized].slice(0, 20)
    );
  }, []);

  const removeSkill = React.useCallback(
    (type: "must" | "nice", value: string) => {
      if (type === "must") {
        setMustSkills((prev) => prev.filter((item) => item !== value));
      } else {
        setNiceSkills((prev) => prev.filter((item) => item !== value));
      }
    },
    []
  );

  const toggleLanguage = React.useCallback((id: string) => {
    setJobLanguages((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }, []);

  const buildRequirementsFromState = React.useCallback((): JobRequirement[] => {
    return [
      ...mustSkills.map((req) => ({
        requirement: req,
        mustHave: true,
        weight: 2,
      })),
      ...niceSkills.map((req) => ({
        requirement: req,
        mustHave: false,
        weight: 1,
      })),
    ];
  }, [mustSkills, niceSkills]);

  const normalizeSuggestedRequirements = React.useCallback(
    (items: JobRequirement[] | undefined) => {
      const seen = new Set<string>();
      const must: string[] = [];
      const nice: string[] = [];
      const normalized: JobRequirement[] = [];

      (Array.isArray(items) ? items : []).forEach((item) => {
        if (!item) return;
        const requirement = String(item.requirement ?? "").trim();
        if (!requirement) return;
        const key = requirement.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        const mustHave = Boolean(item.mustHave);
        const clean = requirement.slice(0, 160);
        const weight = Math.min(3, Math.max(1, Number(item.weight ?? 1) || 1));

        normalized.push({ requirement: clean, mustHave, weight });
        if (mustHave) {
          if (must.length < 20) must.push(clean);
        } else if (nice.length < 20) {
          nice.push(clean);
        }
      });

      return { normalized, must, nice };
    },
    []
  );

  const runAutoSuggest = React.useCallback(
    async (source: "watch" | "ensure" = "watch"): Promise<JobRequirement[]> => {
      if (mustSkills.length || niceSkills.length) return [];
      const text = jobDescription.trim();
      if (!text) return [];
      if (source === "watch" && text.length < 40) return [];
      if (source === "watch" && autoSuggestKeyRef.current === text) return [];

      setAutoSuggestStatus("loading");
      try {
        const response = await jobsApi.suggestFromJD(text);
        const { normalized, must, nice } = normalizeSuggestedRequirements(
          response?.items
        );

        if (normalized.length) {
          autoSuggestKeyRef.current = text;
          setMustSkills(must);
          setNiceSkills(nice);
          setAutoSuggestStatus("done");
          if (source === "ensure" || autoSuggestStatus !== "done") {
            pushBanner({ type: "info", text: copy.notifications.autoFilled });
          }
          return normalized;
        }

        setAutoSuggestStatus("error");
        if (source === "ensure") {
          pushBanner({
            type: "error",
            text: copy.notifications.autoFillFailed,
          });
        }
        return [];
      } catch {
        setAutoSuggestStatus("error");
        if (source === "ensure") {
          pushBanner({
            type: "error",
            text: copy.notifications.autoFillFailed,
          });
        }
        return [];
      }
    },
    [
      mustSkills.length,
      niceSkills.length,
      jobDescription,
      normalizeSuggestedRequirements,
      pushBanner,
      copy.notifications.autoFilled,
      copy.notifications.autoFillFailed,
      autoSuggestStatus,
    ]
  );

  React.useEffect(() => {
    if (mustSkills.length || niceSkills.length) return;
    const text = jobDescription.trim();
    if (!text) {
      setAutoSuggestStatus("idle");
      autoSuggestKeyRef.current = "";
      return;
    }
    if (text.length < 40) return;

    const handle = window.setTimeout(() => {
      void runAutoSuggest("watch");
    }, 800);

    return () => window.clearTimeout(handle);
  }, [jobDescription, mustSkills.length, niceSkills.length, runAutoSuggest]);

  const ensureJob = React.useCallback(async () => {
    if (jobId) return jobId;
    let requirements = buildRequirementsFromState();
    if (!requirements.length) {
      const suggested = await runAutoSuggest("ensure");
      if (suggested.length) {
        requirements = suggested;
      }
    }
    if (!requirements.length) {
      pushBanner({
        type: "error",
        text: copy.notifications.autoFillFailed,
      });
      throw new Error("no-requirements");
    }

    setSavingJob(true);
    try {
      const descriptionExtras = [
        level ? `Level: ${level}` : null,
        contract ? `Contract: ${contract}` : null,
        jobLanguages.length ? `Languages: ${jobLanguages.join(", ")}` : null,
      ]
        .filter(Boolean)
        .join(" | ");

      const payload = await jobsApi.create({
        title: jobTitle || "Untitled Role",
        description: descriptionExtras
          ? `${jobDescription}\n${descriptionExtras}`
          : jobDescription,
        requirements,
      });
      setJobId(payload.id);
      pushBanner({ type: "success", text: copy.notifications.jobCreated });
      return payload.id;
    } catch (error: any) {
      pushBanner({
        type: "error",
        text: copy.notifications.error.replace(
          "{message}",
          error?.message || ""
        ),
      });
      throw error;
    } finally {
      setSavingJob(false);
    }
  }, [
    jobId,
    mustSkills,
    niceSkills,
    jobDescription,
    jobTitle,
    level,
    contract,
    jobLanguages,
    copy.notifications.error,
    copy.notifications.jobCreated,
    pushBanner,
  ]);

  const saveTemplate = React.useCallback(() => {
    const template: JobTemplate = {
      id: randomId(),
      title: jobTitle || (lang === "ar" ? "وظيفة بدون عنوان" : "Untitled"),
      description: jobDescription,
      must: mustSkills,
      nice: niceSkills,
      experienceBand,
      level,
      contract,
      languages: jobLanguages,
    };
    setTemplates((prev) => {
      const next = [template, ...prev].slice(0, 12);
      window.localStorage.setItem(TEMPLATES_KEY, JSON.stringify(next));
      return next;
    });
    pushBanner({ type: "success", text: copy.notifications.saved });
  }, [
    jobTitle,
    jobDescription,
    mustSkills,
    niceSkills,
    experienceBand,
    level,
    contract,
    jobLanguages,
    lang,
    copy.notifications.saved,
    pushBanner,
  ]);

  const applyTemplate = React.useCallback((template: JobTemplate) => {
    setJobTitle(template.title);
    setJobDescription(template.description);
    setMustSkills(template.must);
    setNiceSkills(template.nice);
    setExperienceBand(template.experienceBand ?? null);
    setLevel(template.level ?? null);
    setContract(template.contract ?? null);
    setJobLanguages(template.languages ?? []);
  }, []);

  const removeUpload = React.useCallback((id: string) => {
    setUploads((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const handleFiles = React.useCallback(
    (fileList: FileList | File[]) => {
      const files = Array.from(fileList);
      if (uploads.length + files.length > MAX_FILES) {
        pushBanner({ type: "error", text: copy.notifications.limitReached });
        return;
      }

      const existing = new Set(uploads.map((item) => item.name.toLowerCase()));
      const items: UploadItem[] = files.map((file) => {
        const nameKey = file.name.toLowerCase();
        const duplicate = existing.has(nameKey);
        return {
          id: randomId(),
          file,
          name: file.name,
          size: file.size,
          status: duplicate ? "duplicate" : "pending",
          message: duplicate
            ? copy.uploads.duplicateReason.replace("{reason}", "file name")
            : copy.uploads.ready,
        };
      });

      setUploads((prev) => [...prev, ...items]);
      pushBanner({
        type: "info",
        text: copy.notifications.addedFiles.replace(
          "{count}",
          String(items.length)
        ),
      });
    },
    [
      uploads,
      copy.notifications.limitReached,
      copy.notifications.addedFiles,
      copy.uploads.duplicateReason,
      copy.uploads.ready,
      pushBanner,
    ]
  );

  const onDrop = React.useCallback(
    (event: React.DragEvent<HTMLLabelElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const files = event.dataTransfer?.files;
      if (files?.length) handleFiles(files);
    },
    [handleFiles]
  );

  const onDragOver = React.useCallback(
    (event: React.DragEvent<HTMLLabelElement>) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    },
    []
  );

  const processUpload = React.useCallback(
    async (item: UploadItem, ensuredJobId: string) => {
      setUploads((prev) =>
        prev.map((entry) =>
          entry.id === item.id
            ? {
                ...entry,
                status: "uploading",
                message: copy.uploads.status.uploading,
              }
            : entry
        )
      );

      try {
        const uploadRes = await cvApi.upload(item.file);
        setUploads((prev) =>
          prev.map((entry) =>
            entry.id === item.id
              ? {
                  ...entry,
                  status: "analysing",
                  cvId: uploadRes.cvId,
                  message: copy.uploads.status.analysing,
                }
              : entry
          )
        );

        const analysisRes = (await analysesApi.run({
          jobId: ensuredJobId,
          cvId: uploadRes.cvId,
        })) as Analysis & { ok?: boolean; message?: string };

        const finalAnalysis = analysisRes.ok
          ? ({ ...analysisRes, id: analysisRes.id } as Analysis & {
              message?: string;
            })
          : analysisRes;

        const cvDetails = await cvApi.getById(uploadRes.cvId).catch(() => null);
        const meta = parseCandidateMeta(
          cvDetails?.cv?.parsedText,
          item.name.replace(/\.[^.]+$/, ""),
          cvDetails?.cv?.lang
        );

        const duplicateEntry = resultsRef.current.find((candidate) => {
          if (
            candidate.meta.displayName.toLowerCase() ===
            meta.displayName.toLowerCase()
          )
            return true;
          if (
            meta.email &&
            candidate.meta.email &&
            meta.email.toLowerCase() === candidate.meta.email.toLowerCase()
          )
            return true;
          const normalizedPhone = normalizePhone(meta.phone);
          if (
            normalizedPhone &&
            candidate.meta.phone &&
            normalizePhone(candidate.meta.phone) === normalizedPhone
          )
            return true;
          return false;
        });

        const scores = computeScores(
          finalAnalysis,
          meta,
          { experienceBand },
          duplicateEntry?.id
        );

        let aiInsights: CandidateResult["ai"] = null;
        try {
          const improve = await analysesApi.improve({
            jobId: ensuredJobId,
            cvId: uploadRes.cvId,
            lang,
          });
          aiInsights = {
            summary: improve.summary,
            suggestions: improve.suggestions,
            metrics: improve.metrics,
          };
          if (improve.metrics?.missingMust?.length) {
            scores.missingMust = improve.metrics.missingMust;
          }
        } catch (aiError) {
          console.error("Failed to fetch AI refinement", aiError);
        }

        const candidate: CandidateResult = {
          id: randomId(),
          uploadId: item.id,
          cvId: uploadRes.cvId,
          fileName: item.name,
          meta,
          scores,
          analysis: finalAnalysis,
          ai: aiInsights,
        };

        setResults((prev) => {
          const next = [...prev, candidate];
          resultsRef.current = next;
          return next;
        });

        setUploads((prev) =>
          prev.map((entry) =>
            entry.id === item.id
              ? {
                  ...entry,
                  status: scores.duplicateOf ? "duplicate" : "success",
                  message: scores.duplicateOf
                    ? copy.uploads.duplicateReason.replace(
                        "{reason}",
                        duplicateEntry?.meta.displayName || "duplicate"
                      )
                    : copy.uploads.status.success,
                  resultId: candidate.id,
                }
              : entry
          )
        );

        if (scores.duplicateOf) {
          pushBanner({ type: "info", text: copy.notifications.duplicate });
        }
      } catch (error: any) {
        setUploads((prev) =>
          prev.map((entry) =>
            entry.id === item.id
              ? {
                  ...entry,
                  status: "error",
                  message: copy.notifications.error.replace(
                    "{message}",
                    error?.message || ""
                  ),
                }
              : entry
          )
        );
      }
    },
    [
      copy.uploads.status.uploading,
      copy.uploads.status.analysing,
      copy.uploads.status.success,
      copy.uploads.duplicateReason,
      copy.notifications.duplicate,
      copy.notifications.error,
      experienceBand,
      pushBanner,
      lang,
    ]
  );

  const runBatch = React.useCallback(async () => {
    if (processing) return;
    try {
      const ensuredJobId = await ensureJob();
      setProcessing(true);
      pushBanner({ type: "info", text: copy.notifications.processing });
      for (const item of uploads) {
        if (item.status === "success" || item.status === "duplicate") continue;
        if (
          item.status === "pending" ||
          item.status === "error" ||
          item.status === "analysing"
        ) {
          await processUpload(item, ensuredJobId);
        }
      }
      pushBanner({ type: "success", text: copy.notifications.finished });
    } catch (error) {
      if ((error as Error)?.message === "no-requirements") return;
    } finally {
      setProcessing(false);
    }
  }, [
    processing,
    ensureJob,
    uploads,
    processUpload,
    copy.notifications.processing,
    copy.notifications.finished,
    pushBanner,
  ]);

  const retryUpload = React.useCallback(
    async (id: string) => {
      const item = uploads.find((entry) => entry.id === id);
      if (!item) return;
      try {
        const ensuredJobId = await ensureJob();
        await processUpload({ ...item, status: "pending" }, ensuredJobId);
      } catch {}
    },
    [uploads, ensureJob, processUpload]
  );

  const toggleFilter = React.useCallback((filterId: string) => {
    setActiveFilters((prev) =>
      prev.includes(filterId)
        ? prev.filter((id) => id !== filterId)
        : [...prev, filterId]
    );
  }, []);

  const toggleSelect = React.useCallback((candidateId: string) => {
    setSelected((prev) =>
      prev.includes(candidateId)
        ? prev.filter((id) => id !== candidateId)
        : [...prev, candidateId]
    );
  }, []);

  const selectTopThree = React.useCallback(() => {
    const top = [...results]
      .filter((item) => item.scores.status !== "excluded")
      .sort((a, b) => b.scores.finalScore - a.scores.finalScore)
      .slice(0, 3)
      .map((item) => item.id);
    setSelected(top);
  }, [results]);

  const exportCsv = React.useCallback(() => {
    if (!results.length) return;
    const header = [
      "Name",
      "Must%",
      "Nice%",
      "ExperienceScore",
      "QualityScore",
      "FinalScore",
      "Status",
      "Languages",
      "LastCompany",
    ];
    const rows = results.map((item) => [
      item.meta.displayName,
      item.scores.mustPercent,
      item.scores.nicePercent,
      item.scores.experienceScore,
      item.scores.qualityScore,
      item.scores.finalScore,
      item.scores.status,
      item.meta.languages.join(" | "),
      item.meta.lastCompany || "",
    ]);
    const csv = [header, ...rows]
      .map((columns) =>
        columns.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `analysis-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [results]);

  const exportTablePdf = React.useCallback(() => {
    if (!results.length) return;
    const tableRows = results
      .map(
        (item, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>${item.meta.displayName}</td>
            <td>${formatPercent(item.scores.finalScore)}%</td>
            <td>${formatPercent(item.scores.mustPercent)}%</td>
            <td>${formatPercent(item.scores.nicePercent)}%</td>
            <td>${item.meta.languages.join(", ")}</td>
            <td>${item.meta.lastCompany || ""}</td>
          </tr>
        `
      )
      .join("");
    const html = `
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Analysis Export</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 32px; color: #2F3A4A; }
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid #EDEDED; padding: 8px; text-align: left; }
            th { background: #FFF0E0; }
          </style>
        </head>
        <body>
          <h1>${copy.hero.title}</h1>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>${copy.table.columns.candidate}</th>
                <th>${copy.table.columns.final}</th>
                <th>${copy.table.columns.must}</th>
                <th>${copy.table.columns.nice}</th>
                <th>${copy.table.columns.languages}</th>
                <th>${copy.table.columns.lastCompany}</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </body>
      </html>
    `;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
  }, [results, copy.hero.title, copy.table.columns]);

  const exportManagerReport = React.useCallback(() => {
    const top = [...results]
      .filter((item) => item.scores.status !== "excluded")
      .sort((a, b) => b.scores.finalScore - a.scores.finalScore)
      .slice(0, 3);
    if (!top.length) return;
    const rows = top
      .map((item, index) => {
        const languagesText = item.meta.languages.length
          ? fmt(copy.managerReport.languages, {
              value: formatList(item.meta.languages, lang),
            })
          : "";
        const missingList = item.scores.missingMust ?? [];
        const missingText = missingList.length
          ? fmt(copy.managerReport.missingMust, {
              value: formatList(missingList, lang),
            })
          : "";
        const risks = [languagesText, missingText].filter(Boolean).join(" • ") || "—";
        return `
          <tr>
            <td>${index + 1}</td>
            <td>${item.meta.displayName}</td>
            <td>${formatPercent(item.scores.finalScore)}%</td>
            <td>${item.meta.lastCompany || ""}</td>
            <td>${risks}</td>
          </tr>
        `;
      })
      .join("");

    const html = `
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${copy.managerReport.title}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 32px; color: #2F3A4A; }
            h1 { color: #D85E00; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; }
            th, td { border: 1px solid #EDEDED; padding: 8px; text-align: left; }
            th { background: #FFF0E0; }
          </style>
        </head>
        <body>
          <h1>${copy.managerReport.title}</h1>
          <p>${fmt(copy.managerReport.intro, { count: top.length })}</p>
          <table>
            <thead>
              <tr>
                <th>${copy.managerReport.ranking}</th>
                <th>${copy.table.columns.candidate}</th>
                <th>${copy.table.columns.final}</th>
                <th>${copy.table.columns.lastCompany}</th>
                <th>${copy.managerReport.risks}</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </body>
      </html>
    `;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const win = window.open("", "_blank");
    if (win) {
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } else {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `manager-report-${Date.now()}.html`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
    pushBanner({ type: "success", text: copy.report.generated });
  }, [
    results,
    copy.managerReport,
    copy.table.columns,
    copy.report.generated,
    lang,
    pushBanner,
  ]);

  const quickFilters = React.useMemo(
    () => [
      { id: "mustGate", label: copy.filters.mustGate },
      { id: "exp24", label: copy.filters.exp24 },
      { id: "react", label: copy.filters.react },
      { id: "highNice", label: copy.filters.highNice },
      { id: "recommended", label: copy.filters.recommended },
    ],
    [copy.filters]
  );

  const filteredResults = React.useMemo(() => {
    return results.filter((item) => {
      if (activeFilters.includes("mustGate") && !item.scores.gatePassed)
        return false;
      if (
        activeFilters.includes("recommended") &&
        item.scores.status !== "recommended"
      )
        return false;
      if (activeFilters.includes("highNice") && item.scores.nicePercent < 55)
        return false;
      if (activeFilters.includes("exp24")) {
        if (
          !item.meta.yearsExperience ||
          item.meta.yearsExperience < 2 ||
          item.meta.yearsExperience > 4
        )
          return false;
      }
      if (activeFilters.includes("react")) {
        const hasReact = item.analysis.breakdown?.some(
          (entry: any) =>
            /react/i.test(entry.requirement) && Number(entry.score10 ?? 0) >= 7
        );
        if (!hasReact) return false;
      }
      if (languageFilter !== "all") {
        const languages = item.meta.languages.map((l) => l.toLowerCase());
        if (languageFilter === "ar" && !languages.some((l) => /arabic|العربية/.test(l)))
          return false;
        if (languageFilter === "en" && !languages.some((l) => /english|الإنجليزية/.test(l)))
          return false;
        if (languageFilter === "bilingual" && item.meta.languages.length < 2)
          return false;
      }
      if (statusFilter !== "all" && item.scores.status !== statusFilter)
        return false;
      if (scoreFilter === "70" && item.scores.finalScore < 70) return false;
      if (scoreFilter === "80" && item.scores.finalScore < 80) return false;
      return true;
    });
  }, [
    results,
    activeFilters,
    languageFilter,
    statusFilter,
    scoreFilter,
  ]);

  const sortedResults = React.useMemo(() => {
    const sorted = [...filteredResults].sort((a, b) => {
      const direction = sortState.direction === "asc" ? 1 : -1;
      switch (sortState.key) {
        case "finalScore":
          return direction * (a.scores.finalScore - b.scores.finalScore);
        case "mustPercent":
          return direction * (a.scores.mustPercent - b.scores.mustPercent);
        case "nicePercent":
          return direction * (a.scores.nicePercent - b.scores.nicePercent);
        case "experience":
          return (
            direction *
            ((a.meta.yearsExperience || 0) - (b.meta.yearsExperience || 0))
          );
        case "name":
          return (
            direction * a.meta.displayName.localeCompare(b.meta.displayName)
          );
        case "status":
          return direction * a.scores.status.localeCompare(b.scores.status);
        default:
          return 0;
      }
    });
    if (pinnedId) {
      const pinnedIndex = sorted.findIndex((item) => item.id === pinnedId);
      if (pinnedIndex > 0) {
        const [pinned] = sorted.splice(pinnedIndex, 1);
        sorted.unshift(pinned);
      }
    }
    return sorted;
  }, [filteredResults, sortState, pinnedId]);

  const comparisonCandidates = React.useMemo(
    () =>
      sortedResults.filter((item) => selected.includes(item.id)).slice(0, 4),
    [sortedResults, selected]
  );

  const duplicateMap = React.useMemo(() => {
    const map = new Map<string, string>();
    results.forEach((item) => {
      if (item.scores.duplicateOf) {
        const target = results.find(
          (candidate) => candidate.id === item.scores.duplicateOf
        );
        if (target) map.set(item.id, target.meta.displayName);
      }
    });
    return map;
  }, [results]);

  const bannerClasses: Record<NonNullable<Banner>["type"], string> = {
    success: "border-[#16A34A]/40 bg-[#dcfce7] text-[#166534]",
    error: "border-red-200 bg-red-50 text-red-600",
    info: "border-[#FF7A00]/30 bg-[#FFF0E0] text-[#D85E00]",
  };

  const stepHighlights = React.useMemo(
    () => [
      { id: "step1", title: copy.steps.step1, hint: copy.steps.step1Hint },
      { id: "step2", title: copy.steps.step2, hint: copy.steps.step2Hint },
      { id: "step3", title: copy.steps.step3, hint: copy.steps.step3Hint },
      { id: "step4", title: copy.steps.step4, hint: copy.steps.step4Hint },
      { id: "step5", title: copy.steps.step5, hint: copy.steps.step5Hint },
    ],
    [copy.steps]
  );

  return (
    <div dir={dir} className="space-y-12">
      {banner && (
        <div
          className={clsx(
            "flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm shadow-sm",
            bannerClasses[banner.type]
          )}
        >
          <span>{banner.text}</span>
          <button
            onClick={() => setBanner(null)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/60 text-[#2F3A4A]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <section className="relative overflow-hidden rounded-3xl border border-[#FFD7B0] bg-white/90 px-6 py-10 shadow-sm backdrop-blur">
        <div className="absolute -top-20 end-8 h-40 w-40 rounded-full bg-[#FFB26B]/30 blur-3xl" />
        <div className="absolute -bottom-24 start-8 h-48 w-48 rounded-full bg-[#FF7A00]/20 blur-3xl" />
        <div className="relative flex flex-col gap-6">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#FF7A00]/30 bg-[#FFF0E0] px-4 py-1 text-xs font-semibold text-[#D85E00]">
            {copy.hero.badge}
          </span>
          <div>
            <h1 className="text-3xl font-bold text-[#2F3A4A] sm:text-4xl">
              {copy.hero.title}
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-[#2F3A4A]/70">
              {copy.hero.subtitle}
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 text-xs text-[#2F3A4A]/60 sm:grid-cols-2 xl:grid-cols-5">
            {stepHighlights.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-[#FFE4C8] bg-white/80 p-4"
              >
                <div className="text-[#D85E00] font-semibold">{item.title}</div>
                <p className="mt-2 leading-relaxed">{item.hint}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-[#FFD7B0] bg-white/95 p-6 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-[#D85E00]">
              {copy.steps.step1}
            </h2>
            <p className="text-sm text-[#2F3A4A]/70">{copy.steps.step1Hint}</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <button
              onClick={saveTemplate}
              className="inline-flex items-center gap-2 rounded-full border border-[#FF7A00]/40 bg-white px-4 py-2 font-semibold text-[#D85E00] shadow-sm transition hover:bg-[#FF7A00]/10"
            >
              <CheckCircle2 className="h-4 w-4" /> {copy.buttons.saveTemplate}
            </button>
            <button
              onClick={runBatch}
              disabled={processing}
              className="inline-flex items-center gap-2 rounded-full bg-[#FF7A00] px-4 py-2 font-semibold text-white shadow hover:bg-[#D85E00] disabled:opacity-60"
            >
              {processing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <BarChart3 className="h-4 w-4" />
              )}{" "}
              {copy.buttons.startAnalysis}
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <label className="block text-sm font-medium text-[#2F3A4A]">
              {copy.fields.jobTitle}
              <input
                value={jobTitle}
                onChange={(event) => setJobTitle(event.target.value)}
                placeholder={copy.fields.jobTitlePlaceholder}
                className="mt-2 w-full rounded-2xl border border-[#FFE4C8] bg-white/80 px-4 py-3 text-sm focus:border-[#FF7A00] focus:outline-none"
              />
            </label>
            <label className="block text-sm font-medium text-[#2F3A4A]">
              {copy.fields.jobDescription}
              <textarea
                value={jobDescription}
                onChange={(event) => setJobDescription(event.target.value)}
                placeholder={copy.fields.jobDescriptionPlaceholder}
                rows={4}
                className="mt-2 w-full rounded-2xl border border-[#FFE4C8] bg-white/80 px-4 py-3 text-sm focus:border-[#FF7A00] focus:outline-none"
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-[#FFE4C8] bg-white/80 p-4">
              <div className="text-xs font-semibold text-[#D85E00]">
                {copy.fields.experience}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {experienceBands.map((option) => (
                  <button
                    key={option.id}
                    onClick={() =>
                      setExperienceBand((prev) =>
                        prev === option.id ? null : option.id
                      )
                    }
                    className={clsx(
                      "rounded-full border px-3 py-1 text-xs font-semibold transition",
                      experienceBand === option.id
                        ? "border-transparent bg-[#FF7A00] text-white"
                        : "border-[#FF7A00]/30 bg-white text-[#D85E00] hover:bg-[#FF7A00]/10"
                    )}
                  >
                    {getOptionLabel(option, lang)}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-[#FFE4C8] bg-white/80 p-4">
              <div className="text-xs font-semibold text-[#D85E00]">
                {copy.fields.level}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {levelOptions.map((option) => (
                  <button
                    key={option.id}
                    onClick={() =>
                      setLevel((prev) =>
                        prev === option.id ? null : option.id
                      )
                    }
                    className={clsx(
                      "rounded-full border px-3 py-1 text-xs font-semibold transition",
                      level === option.id
                        ? "border-transparent bg-[#FFB26B] text-[#2F3A4A]"
                        : "border-[#FF7A00]/30 bg-white text-[#D85E00] hover:bg-[#FF7A00]/10"
                    )}
                  >
                    {getOptionLabel(option, lang)}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-[#FFE4C8] bg-white/80 p-4">
              <div className="text-xs font-semibold text-[#D85E00]">
                {copy.fields.contract}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {contractOptions.map((option) => (
                  <button
                    key={option.id}
                    onClick={() =>
                      setContract((prev) =>
                        prev === option.id ? null : option.id
                      )
                    }
                    className={clsx(
                      "rounded-full border px-3 py-1 text-xs font-semibold transition",
                      contract === option.id
                        ? "border-transparent bg-[#FFB26B] text-[#2F3A4A]"
                        : "border-[#FF7A00]/30 bg-white text-[#D85E00] hover:bg-[#FF7A00]/10"
                    )}
                  >
                    {getOptionLabel(option, lang)}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-[#FFE4C8] bg-white/80 p-4">
              <div className="text-xs font-semibold text-[#D85E00]">
                {copy.fields.languages}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {languageOptions.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => toggleLanguage(option.id)}
                    className={clsx(
                      "rounded-full border px-3 py-1 text-xs font-semibold transition",
                      jobLanguages.includes(option.id)
                        ? "border-transparent bg-[#FF7A00] text-white"
                        : "border-[#FF7A00]/30 bg-white text-[#D85E00] hover:bg-[#FF7A00]/10"
                    )}
                  >
                    {getOptionLabel(option, lang)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-[#FFE4C8] bg-white/80 p-4">
            <div className="flex items-center justify-between text-xs font-semibold text-[#D85E00]">
              <span>{copy.fields.mustHave}</span>
              <span className="text-[#2F3A4A]/50">{copy.fields.chipHint}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {mustSkills.map((skill) => (
                <button
                  key={skill}
                  onClick={() => removeSkill("must", skill)}
                  className="group inline-flex items-center gap-1 rounded-full bg-[#FF7A00] px-3 py-1 text-xs font-semibold text-white"
                >
                  {skill}
                  <X className="h-3 w-3 opacity-70 transition group-hover:opacity-100" />
                </button>
              ))}
            </div>
            <input
              value={mustInput}
              onChange={(event) => setMustInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addMustSkill(mustInput);
                  setMustInput("");
                }
              }}
              placeholder="React, Node.js, SQL..."
              className="mt-4 w-full rounded-2xl border border-[#FF7A00]/30 bg-white/80 px-4 py-2 text-sm focus:border-[#FF7A00] focus:outline-none"
            />
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {mustSuggestions.map((suggestion) => (
                <button
                  key={suggestion.id}
                  onClick={() => addMustSkill(suggestion.label)}
                  className="rounded-full border border-[#FF7A00]/30 bg-white px-3 py-1 font-semibold text-[#D85E00] hover:bg-[#FF7A00]/10"
                >
                  {suggestion.label}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-[#FFE4C8] bg-white/80 p-4">
            <div className="flex items-center justify-between text-xs font-semibold text-[#D85E00]">
              <span>{copy.fields.niceToHave}</span>
              <span className="text-[#2F3A4A]/50">{copy.fields.chipHint}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {niceSkills.map((skill) => (
                <button
                  key={skill}
                  onClick={() => removeSkill("nice", skill)}
                  className="group inline-flex items-center gap-1 rounded-full bg-[#FFB26B] px-3 py-1 text-xs font-semibold text-[#2F3A4A]"
                >
                  {skill}
                  <X className="h-3 w-3 opacity-70 transition group-hover:opacity-100" />
                </button>
              ))}
            </div>
            <input
              value={niceInput}
              onChange={(event) => setNiceInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addNiceSkill(niceInput);
                  setNiceInput("");
                }
              }}
              placeholder="Next.js, GraphQL, AWS..."
              className="mt-4 w-full rounded-2xl border border-[#FF7A00]/30 bg-white/80 px-4 py-2 text-sm focus:border-[#FF7A00] focus:outline-none"
            />
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {niceSuggestions.map((suggestion) => (
                <button
                  key={suggestion.id}
                  onClick={() => addNiceSkill(suggestion.label)}
                  className="rounded-full border border-[#FF7A00]/30 bg-white px-3 py-1 font-semibold text-[#D85E00] hover:bg-[#FF7A00]/10"
                >
                  {suggestion.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-[#FFE4C8] bg-white/70 p-4">
          <div className="text-xs font-semibold text-[#D85E00]">
            {copy.fields.templates}
          </div>
          {templates.length === 0 ? (
            <p className="mt-3 text-xs text-[#2F3A4A]/60">
              {copy.fields.noTemplates}
            </p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {templates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => applyTemplate(template)}
                  className="rounded-full border border-[#FF7A00]/30 bg-white px-3 py-1 font-semibold text-[#D85E00] hover:bg-[#FF7A00]/10"
                >
                  {template.title}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-[#FFD7B0] bg-white/95 p-6 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-[#D85E00]">
              {copy.steps.step2}
            </h2>
            <p className="text-sm text-[#2F3A4A]/70">{copy.steps.step2Hint}</p>
          </div>
          <div className="text-xs text-[#2F3A4A]/50">
            {copy.uploads.counter}: {uploads.length}/{MAX_FILES}
          </div>
        </div>

        <label
          onDrop={onDrop}
          onDragOver={onDragOver}
          className="mt-6 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-[#FFB26B] bg-[#FFF0E0]/60 px-6 py-12 text-center transition hover:border-[#FF7A00] hover:bg-[#FFF0E0]"
        >
          <UploadCloud className="h-10 w-10 text-[#FF7A00]" />
          <div className="text-sm font-semibold text-[#D85E00]">
            {copy.uploads.dropLabel}
          </div>
          <div className="text-xs text-[#2F3A4A]/60">{copy.uploads.limit}</div>
          <span className="rounded-full bg-white px-4 py-1 text-xs font-semibold text-[#FF7A00] shadow">
            {copy.uploads.browse}
          </span>
          <input
            type="file"
            multiple
            accept=".pdf,.doc,.docx"
            className="hidden"
            onChange={(event) => {
              if (event.target.files) handleFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </label>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {uploads.map((item) => (
            <div
              key={item.id}
              className="flex flex-col rounded-2xl border border-[#FFE4C8] bg-white/90 p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#2F3A4A]">
                    <FileText className="h-4 w-4 text-[#FF7A00]" />
                    <span className="line-clamp-1">{item.name}</span>
                  </div>
                  <div className="mt-1 text-xs text-[#2F3A4A]/60">
                    {formatBytes(item.size)}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {item.status === "success" && (
                    <CheckCircle2 className="h-4 w-4 text-[#16A34A]" />
                  )}
                  {item.status === "duplicate" && (
                    <AlertTriangle className="h-4 w-4 text-[#F59E0B]" />
                  )}
                  {item.status === "error" && (
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                  )}
                  <button
                    onClick={() => removeUpload(item.id)}
                    className="rounded-full bg-[#FFF0E0] p-1 text-[#D85E00]"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs text-[#2F3A4A]/70">
                {item.status === "uploading" && (
                  <Loader2 className="h-4 w-4 animate-spin text-[#FF7A00]" />
                )}
                {item.status === "analysing" && (
                  <Loader2 className="h-4 w-4 animate-spin text-[#D85E00]" />
                )}
                {item.status === "success" && (
                  <CheckCircle2 className="h-4 w-4 text-[#16A34A]" />
                )}
                {item.status === "duplicate" && (
                  <AlertTriangle className="h-4 w-4 text-[#F59E0B]" />
                )}
                {item.status === "error" && (
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                )}
                <span>{item.message}</span>
              </div>
              {item.status === "error" && (
                <button
                  onClick={() => retryUpload(item.id)}
                  className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#FF7A00]/10 px-3 py-1 text-xs font-semibold text-[#D85E00]"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> {copy.buttons.retry}
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-[#FFD7B0] bg-white/95 p-6 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-[#D85E00]">
              {copy.steps.step3}
            </h2>
            <p className="text-sm text-[#2F3A4A]/70">{copy.steps.step3Hint}</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <button
              onClick={selectTopThree}
              className="inline-flex items-center gap-2 rounded-full border border-[#FF7A00]/40 bg-white px-3 py-1 font-semibold text-[#D85E00] hover:bg-[#FF7A00]/10"
            >
              <Award className="h-4 w-4" /> {copy.buttons.selectBest}
            </button>
            <button
              onClick={() => setComparisonOpen(true)}
              disabled={selected.length < 2}
              className="inline-flex items-center gap-2 rounded-full border border-[#FF7A00]/40 bg-white px-3 py-1 font-semibold text-[#D85E00] hover:bg-[#FF7A00]/10 disabled:opacity-50"
            >
              <Columns2 className="h-4 w-4" /> {copy.buttons.compare}
            </button>
            <button
              onClick={exportTablePdf}
              className="inline-flex items-center gap-2 rounded-full border border-[#FF7A00]/40 bg-white px-3 py-1 font-semibold text-[#D85E00] hover:bg-[#FF7A00]/10"
            >
              <FileOutput className="h-4 w-4" /> {copy.buttons.exportPdf}
            </button>
            <button
              onClick={exportCsv}
              className="inline-flex items-center gap-2 rounded-full border border-[#FF7A00]/40 bg-white px-3 py-1 font-semibold text-[#D85E00] hover:bg-[#FF7A00]/10"
            >
              <Download className="h-4 w-4" /> {copy.buttons.exportCsv}
            </button>
            <button
              onClick={exportManagerReport}
              className="inline-flex items-center gap-2 rounded-full bg-[#FF7A00] px-4 py-2 font-semibold text-white shadow hover:bg-[#D85E00]"
            >
              <Users className="h-4 w-4" /> {copy.buttons.managerReport}
            </button>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Filter className="h-4 w-4 text-[#FF7A00]" />
        <span className="text-xs font-semibold text-[#2F3A4A]/70">
          {copy.table.filtersTitle}
        </span>
        <div className="flex flex-wrap gap-2 text-xs">
          {quickFilters.map((filter) => (
            <button
              key={filter.id}
              onClick={() => toggleFilter(filter.id)}
              className={clsx(
                "rounded-full border px-3 py-1 font-semibold transition",
                activeFilters.includes(filter.id)
                  ? "border-transparent bg-[#FF7A00] text-white"
                  : "border-[#FF7A00]/40 bg-white text-[#D85E00] hover:bg-[#FF7A00]/10"
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-[#2F3A4A]/80">
          <label className="inline-flex items-center gap-2 rounded-full border border-[#FF7A00]/30 bg-white px-3 py-1">
            <span className="font-semibold text-[#D85E00]">
              {copy.filters.languageLabel}
            </span>
            <select
              value={languageFilter}
              onChange={(event) => setLanguageFilter(event.target.value)}
              className="bg-transparent text-[#2F3A4A] focus:outline-none"
              dir={lang === "ar" ? "rtl" : "ltr"}
            >
              <option value="all">{copy.filters.languageAny}</option>
              <option value="ar">{copy.filters.languageArabic}</option>
              <option value="en">{copy.filters.languageEnglish}</option>
              <option value="bilingual">{copy.filters.languageBilingual}</option>
            </select>
          </label>
          <label className="inline-flex items-center gap-2 rounded-full border border-[#FF7A00]/30 bg-white px-3 py-1">
            <span className="font-semibold text-[#D85E00]">
              {copy.filters.statusLabel}
            </span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="bg-transparent text-[#2F3A4A] focus:outline-none"
              dir={lang === "ar" ? "rtl" : "ltr"}
            >
              <option value="all">{copy.filters.statusAny}</option>
              <option value="recommended">{copy.filters.statusRecommended}</option>
              <option value="consider">{copy.filters.statusConsider}</option>
              <option value="excluded">{copy.filters.statusExcluded}</option>
            </select>
          </label>
          <label className="inline-flex items-center gap-2 rounded-full border border-[#FF7A00]/30 bg-white px-3 py-1">
            <span className="font-semibold text-[#D85E00]">
              {copy.filters.scoreLabel}
            </span>
            <select
              value={scoreFilter}
              onChange={(event) => setScoreFilter(event.target.value)}
              className="bg-transparent text-[#2F3A4A] focus:outline-none"
              dir={lang === "ar" ? "rtl" : "ltr"}
            >
              <option value="any">{copy.filters.scoreAny}</option>
              <option value="70">{copy.filters.score70}</option>
              <option value="80">{copy.filters.score80}</option>
            </select>
          </label>
        </div>
        {selected.length > 0 && (
          <span className="text-xs text-[#2F3A4A]/60">
            {copy.table.selectedCount.replace(
              "{count}",
              String(selected.length)
              )}
            </span>
          )}
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full divide-y divide-[#FFE4C8] text-sm">
            <thead className="bg-[#FFF0E0] text-[#D85E00]">
              <tr>
                <th className="sticky top-0 px-3 py-2 text-start">Pin</th>
                <th className="px-3 py-2 text-start">
                  <button
                    className="inline-flex items-center gap-1"
                    onClick={() =>
                      setSortState((prev) => ({
                        key: "name",
                        direction:
                          prev.key === "name" && prev.direction === "asc"
                            ? "desc"
                            : "asc",
                      }))
                    }
                  >
                    {copy.table.columns.candidate}
                    {sortState.key === "name" &&
                      (sortState.direction === "asc" ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      ))}
                  </button>
                </th>
                <th className="px-3 py-2">
                  <button
                    className="inline-flex items-center gap-1"
                    onClick={() =>
                      setSortState((prev) => ({
                        key: "experience",
                        direction:
                          prev.key === "experience" && prev.direction === "asc"
                            ? "desc"
                            : "asc",
                      }))
                    }
                  >
                    {copy.table.columns.experience}
                    {sortState.key === "experience" &&
                      (sortState.direction === "asc" ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      ))}
                  </button>
                </th>
                <th className="px-3 py-2">
                  <button
                    className="inline-flex items-center gap-1"
                    onClick={() =>
                      setSortState((prev) => ({
                        key: "mustPercent",
                        direction:
                          prev.key === "mustPercent" && prev.direction === "asc"
                            ? "desc"
                            : "asc",
                      }))
                    }
                  >
                    {copy.table.columns.must}
                    {sortState.key === "mustPercent" &&
                      (sortState.direction === "asc" ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      ))}
                  </button>
                </th>
                <th className="px-3 py-2">
                  <button
                    className="inline-flex items-center gap-1"
                    onClick={() =>
                      setSortState((prev) => ({
                        key: "nicePercent",
                        direction:
                          prev.key === "nicePercent" && prev.direction === "asc"
                            ? "desc"
                            : "asc",
                      }))
                    }
                  >
                    {copy.table.columns.nice}
                    {sortState.key === "nicePercent" &&
                      (sortState.direction === "asc" ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      ))}
                  </button>
                </th>
                <th className="px-3 py-2">
                  <button
                    className="inline-flex items-center gap-1"
                    onClick={() =>
                      setSortState((prev) => ({
                        key: "finalScore",
                        direction:
                          prev.key === "finalScore" && prev.direction === "asc"
                            ? "desc"
                            : "asc",
                      }))
                    }
                  >
                    {copy.table.columns.final}
                    {sortState.key === "finalScore" &&
                      (sortState.direction === "asc" ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      ))}
                  </button>
                </th>
                <th className="px-3 py-2">{copy.table.columns.languages}</th>
                <th className="px-3 py-2">{copy.table.columns.lastCompany}</th>
                <th className="px-3 py-2">{copy.table.columns.notes}</th>
                <th className="px-3 py-2">{copy.table.columns.status}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#FFE4C8]">
              {sortedResults.length === 0 && (
                <tr>
                  <td
                    colSpan={10}
                    className="px-4 py-6 text-center text-xs text-[#2F3A4A]/60"
                  >
                    {copy.table.empty}
                  </td>
                </tr>
              )}
              {sortedResults.map((item) => {
                const narrative = buildAiNarrative(
                  item,
                  lang,
                  copy,
                  { experienceBand },
                  duplicateMap.get(item.id)
                );
                const linkBadges: {
                  key: string;
                  label: string;
                  url: string;
                  type: "github" | "linkedin" | "project";
                }[] = [];
                item.meta.github.forEach((url, index) => {
                  linkBadges.push({
                    key: `github-${item.id}-${index}`,
                    label: formatLinkBadgeLabel(url, "github"),
                    url,
                    type: "github",
                  });
                });
                item.meta.linkedin.forEach((url, index) => {
                  linkBadges.push({
                    key: `linkedin-${item.id}-${index}`,
                    label: formatLinkBadgeLabel(url, "linkedin"),
                    url,
                    type: "linkedin",
                  });
                });
                item.meta.projects
                  .filter((project) => project?.url)
                  .forEach((project, index) => {
                    linkBadges.push({
                      key: `project-${item.id}-${index}`,
                      label: project.label || hostLabelFromUrl(project.url!, "Link"),
                      url: project.url!,
                      type: "project",
                    });
                  });
                return (
                  <tr key={item.id} className="bg-white/60">
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selected.includes(item.id)}
                          onChange={() => toggleSelect(item.id)}
                          className="h-4 w-4 rounded border-[#FF7A00]/40 text-[#FF7A00] focus:ring-[#FF7A00]"
                        />
                        <button
                          onClick={() =>
                            setPinnedId((prev) =>
                              prev === item.id ? null : item.id
                            )
                          }
                          className={clsx(
                            "rounded-full border px-2 py-1 text-[10px] font-semibold transition",
                            pinnedId === item.id
                              ? "border-transparent bg-[#FF7A00] text-white"
                              : "border-[#FF7A00]/30 bg-white text-[#D85E00] hover:bg-[#FF7A00]/10"
                          )}
                        >
                          <Pin className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-semibold text-[#2F3A4A]">
                        {item.meta.displayName}
                      </div>
                      <div className="text-xs text-[#2F3A4A]/60">
                        {item.fileName}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center text-sm text-[#2F3A4A]">
                      {item.meta.yearsExperience != null
                        ? `${item.meta.yearsExperience}`
                        : "—"}
                    </td>
                    <td className="px-3 py-3">
                      <div className="rounded-full bg-[#FF7A00]/10 px-2 py-1 text-center text-xs font-semibold text-[#D85E00]">
                        {formatPercent(item.scores.mustPercent)}%
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="rounded-full border border-[#F3C969]/40 bg-[#FDF3C4]/80 px-2 py-1 text-center text-xs font-semibold text-[#8B5E00]">
                        {formatPercent(item.scores.nicePercent)}%
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="rounded-full bg-[#16A34A]/10 px-2 py-1 text-center text-xs font-semibold text-[#0f5132]">
                        {formatPercent(item.scores.finalScore)}%
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs text-[#2F3A4A]/70">
                      {item.meta.languages.length
                        ? item.meta.languages.join(" • ")
                        : "—"}
                    </td>
                    <td className="px-3 py-3 text-xs text-[#2F3A4A]/70">
                      {item.meta.lastCompany || "—"}
                    </td>
                    <td className="px-3 py-3 text-xs text-[#2F3A4A]/80">
                      <div className="space-y-2">
                        <div className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#FFF4E5] via-[#FFE8CC] to-[#FFF4E5] px-3 py-1 text-[11px] font-semibold text-[#9A3412] shadow-sm transition hover:shadow-md animate-[pulse_7s_ease-in-out_infinite]">
                          <Sparkles className="h-3.5 w-3.5 text-[#ff7a00]" />
                          <span>{narrative.summary}</span>
                        </div>
                        {narrative.strengths.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {narrative.strengths.map((line, index) => (
                              <span
                                key={`strength-${item.id}-${index}`}
                                className="rounded-full bg-[#16A34A]/10 px-3 py-1 text-[10px] font-semibold text-[#0f5132] shadow-sm"
                              >
                                {line}
                              </span>
                            ))}
                          </div>
                        )}
                        {narrative.weaknesses.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {narrative.weaknesses.map((line, index) => (
                              <span
                                key={`weakness-${item.id}-${index}`}
                                className="rounded-full bg-[#FEF3C7] px-3 py-1 text-[10px] font-medium text-[#92400E] shadow-sm"
                              >
                                {line}
                              </span>
                            ))}
                          </div>
                        )}
                        {linkBadges.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {linkBadges.map((badge) => (
                              <a
                                key={badge.key}
                                href={badge.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded-full border border-[#FF7A00]/30 bg-white/80 px-3 py-1 text-[10px] font-semibold text-[#B34A00] transition hover:border-[#FF7A00] hover:text-[#D85E00]"
                              >
                                {badge.type === "github" ? (
                                  <Github className="h-3.5 w-3.5" />
                                ) : badge.type === "linkedin" ? (
                                  <Linkedin className="h-3.5 w-3.5" />
                                ) : (
                                  <Link2 className="h-3.5 w-3.5" />
                                )}
                                <span>{badge.label}</span>
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={clsx(
                          "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
                          getStatusBadgeClass(
                            item.scores,
                            Boolean(item.scores.duplicateOf)
                          )
                        )}
                      >
                        {
                          copy.statuses[
                            item.scores.duplicateOf
                              ? "duplicate"
                              : item.scores.status
                          ]
                        }
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <AnimatePresence>
        {comparisonOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-10"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative max-h-[85vh] w-full max-w-5xl overflow-auto rounded-3xl border border-[#FFD7B0] bg-white p-6 shadow-xl"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-[#D85E00]">
                    {copy.comparison.title}
                  </h3>
                  <p className="text-xs text-[#2F3A4A]/60">
                    {comparisonCandidates.length < 2
                      ? copy.comparison.empty
                      : copy.steps.step4Hint}
                  </p>
                </div>
                <button
                  onClick={() => setComparisonOpen(false)}
                  className="inline-flex items-center gap-2 rounded-full bg-[#FF7A00] px-3 py-1 text-xs font-semibold text-white"
                >
                  <X className="h-3 w-3" /> {copy.comparison.close}
                </button>
              </div>

              {comparisonCandidates.length >= 2 && (
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  {comparisonCandidates.map((item) => {
                  const narrative = buildAiNarrative(
                    item,
                    lang,
                    copy,
                    { experienceBand },
                    duplicateMap.get(item.id)
                  );
                  const linkBadges = extractLinkBadges(item.meta);
                  const skillChips = collectTopSkillChips(item);
                  return (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-[#FFE4C8] bg-white/90 p-4 shadow-sm"
                    >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-semibold text-[#2F3A4A]">
                              {item.meta.displayName}
                            </div>
                            <div className="text-xs text-[#2F3A4A]/60">
                              {item.meta.yearsExperience != null
                                ? `${item.meta.yearsExperience} yrs`
                                : "—"}
                            </div>
                          </div>
                          <span
                            className={clsx(
                              "rounded-full px-3 py-1 text-xs font-semibold",
                              getStatusBadgeClass(
                                item.scores,
                                Boolean(item.scores.duplicateOf)
                              )
                            )}
                          >
                            {
                              copy.statuses[
                                item.scores.duplicateOf
                                  ? "duplicate"
                                  : item.scores.status
                              ]
                            }
                          </span>
                        </div>
                        <div className="mt-3 grid gap-3 text-xs text-[#2F3A4A]/70">
                          <div>
                            <div className="font-semibold text-[#D85E00]">
                              {copy.comparison.recommendation}
                            </div>
                            <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#FFF4E5] via-[#FFE8CC] to-[#FFF4E5] px-3 py-1 text-[11px] font-semibold text-[#9A3412] shadow-sm">
                              <Sparkles className="h-3.5 w-3.5 text-[#ff7a00]" />
                              <span>{narrative.summary}</span>
                            </div>
                          </div>
                          <div className="rounded-xl bg-[#FFF9F0] p-3 text-[11px] text-[#9A3412] shadow-inner">
                            <div className="font-semibold text-[#B34A00]">
                              {copy.comparison.scorecard.heading}
                            </div>
                            <div className="mt-2 grid grid-cols-3 gap-3">
                              <div>
                                <div className="text-[10px] font-semibold uppercase tracking-wide text-[#b34a00]/70">
                                  {copy.comparison.scorecard.final}
                                </div>
                                <div className="text-base font-bold text-[#D85E00]">
                                  {formatPercent(item.scores.finalScore)}%
                                </div>
                              </div>
                              <div>
                                <div className="text-[10px] font-semibold uppercase tracking-wide text-[#b34a00]/70">
                                  {copy.comparison.scorecard.must}
                                </div>
                                <div className="text-base font-bold text-[#B34A00]">
                                  {formatPercent(item.scores.mustPercent)}%
                                </div>
                              </div>
                              <div>
                                <div className="text-[10px] font-semibold uppercase tracking-wide text-[#b34a00]/70">
                                  {copy.comparison.scorecard.nice}
                                </div>
                                <div className="text-base font-bold text-[#B35C00]">
                                  {formatPercent(item.scores.nicePercent)}%
                                </div>
                              </div>
                            </div>
                          </div>
                          <div>
                            <div className="font-semibold text-[#D85E00]">
                              {copy.comparison.languages}
                            </div>
                            {item.meta.languages.length ? (
                              <div className="mt-1 flex flex-wrap gap-1.5">
                                {item.meta.languages.map((language, index) => (
                                  <span
                                    key={`modal-lang-${item.id}-${index}`}
                                    className="rounded-full bg-[#FFE8CC] px-3 py-1 text-[10px] font-semibold text-[#9A3412] shadow-sm"
                                  >
                                    {language}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <p className="text-[#2F3A4A]/50">—</p>
                            )}
                          </div>
                          <div>
                            <div className="font-semibold text-[#D85E00]">
                              {copy.comparison.skills}
                            </div>
                            {skillChips.length ? (
                              <div className="mt-1 flex flex-wrap gap-1.5">
                                {skillChips.map((chip, index) => {
                                  const chipScore = Math.round(chip.score * 10) / 10;
                                  const display = Number.isInteger(chipScore)
                                    ? `${chipScore.toFixed(0)}/10`
                                    : `${chipScore.toFixed(1)}/10`;
                                  return (
                                    <span
                                      key={`modal-skill-${item.id}-${index}`}
                                      className={clsx(
                                        "rounded-full px-3 py-1 text-[10px] font-semibold shadow-sm",
                                        chip.mustHave
                                          ? "bg-[#FFEDD5] text-[#B45309]"
                                          : "bg-[#FDF3C4] text-[#8B5E00]"
                                      )}
                                    >
                                      {chip.label} • {display}
                                    </span>
                                  );
                                })}
                              </div>
                            ) : (
                              <p className="text-[#2F3A4A]/50">—</p>
                            )}
                          </div>
                          <div>
                            <div className="font-semibold text-[#D85E00]">
                              {copy.comparison.links}
                            </div>
                            {linkBadges.length ? (
                              <div className="mt-1 flex flex-wrap gap-1.5">
                                {linkBadges.map((badge, index) => (
                                  <a
                                    key={`modal-link-${item.id}-${index}`}
                                    href={badge.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 rounded-full border border-[#FF7A00]/30 bg-white/80 px-3 py-1 text-[10px] font-semibold text-[#B34A00] transition hover:border-[#FF7A00] hover:text-[#D85E00]"
                                  >
                                    {badge.type === "github" ? (
                                      <Github className="h-3.5 w-3.5" />
                                    ) : badge.type === "linkedin" ? (
                                      <Linkedin className="h-3.5 w-3.5" />
                                    ) : (
                                      <Link2 className="h-3.5 w-3.5" />
                                    )}
                                    <span>{badge.label}</span>
                                  </a>
                                ))}
                              </div>
                            ) : (
                              <p className="text-[#2F3A4A]/50">—</p>
                            )}
                          </div>
                          <div>
                            <div className="font-semibold text-[#16A34A]">
                              {copy.comparison.strengths}
                            </div>
                            {narrative.strengths.length ? (
                              <div className="mt-1 flex flex-wrap gap-1.5">
                                {narrative.strengths.map((line, index) => (
                                  <span
                                    key={`modal-strength-${item.id}-${index}`}
                                    className="rounded-full bg-[#16A34A]/10 px-3 py-1 text-[10px] font-semibold text-[#0f5132] shadow-sm"
                                  >
                                    {line}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <p className="text-[#2F3A4A]/50">—</p>
                            )}
                          </div>
                          <div>
                            <div className="font-semibold text-[#D85E00]">
                              {copy.comparison.weaknesses}
                            </div>
                            {narrative.weaknesses.length ? (
                              <div className="mt-1 flex flex-wrap gap-1.5">
                                {narrative.weaknesses.map((line, index) => (
                                  <span
                                    key={`modal-weakness-${item.id}-${index}`}
                                    className="rounded-full bg-[#FEF3C7] px-3 py-1 text-[10px] font-medium text-[#92400E] shadow-sm"
                                  >
                                    {line}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <p className="text-[#2F3A4A]/50">—</p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
