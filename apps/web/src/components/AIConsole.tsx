// apps/web/src/components/AIConsole.tsx
"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";
import {
  Paperclip,
  Send,
  FileText,
  Loader2,
  CheckCircle2,
  Download,
  FileDown,
  ArrowUpRight,
  ShieldCheck,
  Sparkles,
  AlertTriangle,
  Play, // ✅ Fix: missing icon import
} from "lucide-react";

import { http } from "../services/http";
import { cvApi, type UploadCVResponse } from "@/services/api/cv";
import { jobsApi, type JobRequirement, type Job } from "@/services/api/jobs";
import {
  assistantApi,
  type CandidateHelper,
  type ExperienceExtract,
  type ExtractedJobFields as AssistantExtractedJobFields,
  type LanguagesExtract,
  type RequirementsTemplate,
  type SuggestedRequirements,
  type TitleSummary,
} from "@/services/api/assistant";
import {
  analysesApi, // نستخدمه لجلب الـanalysis والـpickBest
  type Analysis,
  type AnalysisMetrics,
  type PerRequirement,
} from "@/services/api/analyses";
import type { Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import { useLang } from "@/lib/use-lang";
import RequirementPicker, {
  type ReqItem,
} from "@/components/RequirementPicker";

/* ────────────────────────────────────────────────────────────────────────────
   Inline SVG score gauge (لا يعتمد على أي كومبوننت خارجي)
   ──────────────────────────────────────────────────────────────────────────── */
function ScoreGauge({
  value = 0,
  size = 120,
}: {
  value?: number;
  size?: number;
}) {
  const v = Number.isFinite(value) ? Math.max(0, Math.min(10, value)) : 0;
  const pct = (v / 10) * 100;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <div className="inline-flex flex-col items-center justify-center">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="block"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="currentColor"
          strokeOpacity={0.15}
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="currentColor"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="text-[var(--color-primary)]"
        />
        <text
          x="50%"
          y="50%"
          dominantBaseline="central"
          textAnchor="middle"
          className="fill-[var(--foreground)]"
          fontSize={size * 0.22}
          fontWeight={700}
        >
          {v.toFixed(1)}
        </text>
      </svg>
      <div className="mt-1 text-[10px] text-[var(--color-text-muted)]">/10</div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Types + helpers
   ──────────────────────────────────────────────────────────────────────────── */
type Msg = {
  id: string;
  role: "bot" | "user" | "sys";
  content: React.ReactNode;
};

const INTRO_MESSAGE_ID = "m0";

function buildIntroMessage(lang: Lang): Msg {
  return {
    id: INTRO_MESSAGE_ID,
    role: "bot",
    content: (
      <div className="space-y-2">
        <div className="font-semibold text-[var(--color-primary)]">
          {lang === "ar"
            ? "مرحباً بك في لوحة التحليل"
            : "Welcome to the analysis console"}
        </div>
        <ul className="list-decimal space-y-1 ps-4 text-xs text-[var(--color-text-muted)]">
          <li>
            {lang === "ar"
              ? "ابدأ بوصف الوظيفة سريعاً."
              : "Start with a quick job summary."}
          </li>
          <li>
            {lang === "ar"
              ? "أضف المتطلبات وحدد الأساسي منها."
              : "Add requirements and highlight must-have items."}
          </li>
          <li>
            {lang === "ar"
              ? "ارفع السيرة الذاتية واضغط تحليل سريع."
              : "Upload the CV and run the quick analysis."}
          </li>
        </ul>
      </div>
    ),
  };
}

function parseRequirements(text: string): JobRequirement[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line
        .split(/[,|،]/)
        .map((p) => p.trim())
        .filter(Boolean);
      const requirement = parts[0] || line;
      const mustHave = parts.some(
        (p) => /^must/i.test(p) || /^ضروري/.test(p) || /^أساسي/.test(p)
      );
      const weightPart = parts.find((p) => /^\d+(\.\d+)?$/.test(p));
      const weight = weightPart ? Number(weightPart) : 1;
      return { requirement, mustHave, weight };
    });
}

/* تحويل وصف الوظيفة إلى متطلبات (محلي/بدون باكند) */
function extractRequirementsFromDescription(desc: string): JobRequirement[] {
  if (!desc.trim()) return [];
  const parts = desc
    .split(/[.\n\r;؛]+/g)
    .map((s) => s.trim())
    .filter(Boolean);

  const MUST_HINTS = [/ضروري/i, /must/i, /required/i, /أساسي/i, /لا بد/i];
  const WEIGHTS: Array<{ re: RegExp; w: number }> = [
    { re: /(5\+|خمسة|خبرة كبيرة|senior|lead)/i, w: 2 },
    { re: /(3\+|ثلاثة|mid|متوسط)/i, w: 1.5 },
  ];

  const uniq = new Set<string>();
  const reqs: JobRequirement[] = [];
  for (const raw of parts) {
    let requirement = raw.replace(/^(?:-|\*|•)\s*/, "").trim();
    if (!requirement) continue;
    if (/^\s*(الوصف|المهام|عن الفريق|عن الشركة)\s*:?/i.test(requirement))
      continue;

    const mustHave = MUST_HINTS.some((re) => re.test(requirement));
    let weight = 1;
    for (const { re, w } of WEIGHTS)
      if (re.test(requirement)) weight = Math.max(weight, w);
    if (requirement.length > 160) requirement = requirement.slice(0, 160) + "…";
    const key = requirement.toLowerCase();
    if (uniq.has(key)) continue;
    uniq.add(key);
    reqs.push({ requirement, mustHave, weight });
    if (reqs.length >= 20) break;
  }
  return reqs;
}

type BroadcastPayload = {
  analysis: Analysis;
  job?: Job | null;
  cv?: UploadCVResponse | null;
  fileName?: string | null;
  source?: string;
};

const riskCopy: Record<string, { ar: string; en: string }> = {
  must_threshold: {
    ar: "لم تتجاوز متطلبات الـ must الحد الأدنى.",
    en: "Must-have requirements did not reach the acceptance threshold.",
  },
  low_total: {
    ar: "النتيجة الكلية منخفضة — راجع تفاصيل المتطلبات.",
    en: "Overall score is low — review requirement breakdown.",
  },
  no_requirements: {
    ar: "لم يتم تزويد متطلبات لتحليلها.",
    en: "No requirements were provided for this analysis.",
  },
  no_text: {
    ar: "لم يتم استخراج نص من السيرة الذاتية — استخدم ملفاً أوضح.",
    en: "No text could be extracted from the CV — upload a clearer file.",
  },
};

const toStringArray = (input: unknown): string[] =>
  Array.isArray(input)
    ? input.filter((x): x is string => typeof x === "string")
    : [];

function getRiskLabel(flag: string, lang: Lang): string {
  const entry = riskCopy[flag];
  if (!entry) return flag;
  return lang === "ar" ? entry.ar : entry.en;
}

function computeMetricsFromResult(
  result: Analysis | null
): AnalysisMetrics | null {
  if (!result) return null;
  if (result.metrics) return result.metrics;
  const breakdown = Array.isArray(result.breakdown) ? result.breakdown : [];
  if (!breakdown.length) return null;

  const must = breakdown.filter((item) => item.mustHave);
  const nice = breakdown.filter((item) => !item.mustHave);
  const sumScore = (items: typeof breakdown) =>
    items.reduce(
      (acc, item) => acc + Number(item.score10 ?? item.similarity * 10),
      0
    );
  const percent = (items: typeof breakdown) =>
    items.length
      ? Number(((sumScore(items) / (items.length * 10)) * 100).toFixed(2))
      : 0;

  const gapObj = (result.gaps ?? null) as Record<string, unknown> | null;
  const missingMust = toStringArray(gapObj?.["mustHaveMissing"]);
  const improvement = toStringArray(gapObj?.["improve"]);

  const topStrengths = breakdown
    .filter((item) => Number(item.score10 ?? 0) >= 8)
    .sort((a, b) => Number(b.score10 ?? 0) - Number(a.score10 ?? 0))
    .slice(0, 6)
    .map((item) => ({
      requirement: item.requirement,
      score: Number(item.score10 ?? 0),
      similarity: item.similarity,
    }));

  const weightedScore = Number(result.score ?? 0);
  const gatePassed = must.length === 0 || percent(must) >= 80;

  const riskFlags: string[] = [];
  if (!gatePassed) riskFlags.push("must_threshold");
  if (weightedScore < 6) riskFlags.push("low_total");
  if (breakdown.length === 0) riskFlags.push("no_requirements");

  return {
    totalRequirements: breakdown.length,
    mustCount: must.length,
    niceCount: nice.length,
    mustPercent: percent(must),
    nicePercent: percent(nice),
    weightedScore,
    gatePassed,
    missingMust,
    improvement,
    topStrengths,
    riskFlags,
    generatedAt: result.createdAt,
  };
}

const formatPercent = (value: number) => {
  const safe = Number.isFinite(value) ? value : 0;
  return `${Math.max(0, Math.min(100, safe)).toFixed(1)}%`;
};

/* ────────────────────────────────────────────────────────────────────────────
   Component
   ──────────────────────────────────────────────────────────────────────────── */
export default function AIConsole() {
  const lang = useLang();
  const tt = (k: string) => t(lang, k);

  const [messages, setMessages] = React.useState<Msg[]>(() => [
    buildIntroMessage(lang),
  ]);
  React.useEffect(() => {
    const intro = buildIntroMessage(lang);
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === INTRO_MESSAGE_ID && msg.role === "bot"
          ? { ...intro, id: msg.id }
          : msg
      )
    );
  }, [lang]);

  // ✅ اجعل push-hoisted ومثبت الهوية قبل أي useEffect يعتمد عليه
  const push = React.useCallback((m: Omit<Msg, "id">) => {
    setMessages((s) => [
      ...s,
      { ...m, id: Math.random().toString(36).slice(2) },
    ]);
  }, []);

  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [reqText, setReqText] = React.useState("");
  const [reqs, setReqs] = React.useState<JobRequirement[]>([]);
  const [cvFile, setCvFile] = React.useState<File | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<Analysis | null>(null);
  const [jobInfo, setJobInfo] = React.useState<Job | null>(null);
  const [cvInfo, setCvInfo] = React.useState<UploadCVResponse | null>(null);
  const [fileLabel, setFileLabel] = React.useState<string | null>(null);
  const [assistantLoading, setAssistantLoading] = React.useState<string | null>(null);
  const [assistantError, setAssistantError] = React.useState<string | null>(null);
  const [assistantFields, setAssistantFields] = React.useState<AssistantExtractedJobFields | null>(null);
  const [assistantTitleSummary, setAssistantTitleSummary] = React.useState<TitleSummary | null>(null);
  const [assistantQuickPoints, setAssistantQuickPoints] = React.useState<string[]>([]);
  const [assistantLanguages, setAssistantLanguages] = React.useState<LanguagesExtract | null>(null);
  const [assistantExperience, setAssistantExperience] = React.useState<ExperienceExtract | null>(null);
  const [assistantSuggested, setAssistantSuggested] = React.useState<SuggestedRequirements | null>(null);
  const [assistantTemplate, setAssistantTemplate] = React.useState<RequirementsTemplate | null>(null);
  const [candidateProfile, setCandidateProfile] = React.useState("");
  const [candidateHelperResult, setCandidateHelperResult] = React.useState<CandidateHelper | null>(null);
  const [promptFeedback, setPromptFeedback] = React.useState<
    { id: string; kind: "copy" | "insert" } | null
  >(null);
  const autoExtractSignature = React.useRef<string>("");

  const [activeStep, setActiveStep] = React.useState(1);
  const maxStep = React.useMemo(() => {
    if (result) return 4;
    if (cvInfo || cvFile) return 3;
    if (reqs.length) return 3;
    return 2;
  }, [result, cvInfo, cvFile, reqs.length]);

  const prevMaxRef = React.useRef(maxStep);
  React.useEffect(() => {
    if (maxStep > prevMaxRef.current) setActiveStep(maxStep);
    else if (activeStep > maxStep) setActiveStep(maxStep);
    prevMaxRef.current = maxStep;
  }, [maxStep, activeStep]);

  React.useEffect(() => {
    const handler = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          requirements?: ReqItem[];
          jd?: string;
        }>
      ).detail;
      if (!detail?.requirements || !detail.requirements.length) return;
      const normalized = detail.requirements.map((item) => ({
        requirement: item.requirement,
        mustHave: Boolean(item.mustHave),
        weight: Number(item.weight ?? 1) || 1,
      }));
      setReqs(normalized);
      setReqText(
        normalized
          .map(
            (item) =>
              `${item.requirement}${item.mustHave ? ", must" : ""}, ${item.weight}`
          )
          .join("\n")
      );
      if (detail.jd && !description.trim()) setDescription(detail.jd);
      setActiveStep((prev) => Math.max(prev, 2));
      push({
        role: "bot",
        content: (
          <div className="text-xs text-[var(--color-text-muted)]">
            {lang === "ar"
              ? "تم تحديث المتطلبات من المساعد الذكي."
              : "Requirements imported from the assistant."}
          </div>
        ),
      });
    };

    window.addEventListener("job:suggested", handler as EventListener);
    return () =>
      window.removeEventListener("job:suggested", handler as EventListener);
  }, [description, lang, push]);

  const goToStep = React.useCallback(
    (step: number) => {
      if (step <= maxStep) setActiveStep(step);
    },
    [maxStep]
  );

  const jobDescriptionForAssistant = React.useMemo(() => {
    const parts: string[] = [];
    if (title.trim()) parts.push(title.trim());
    if (description.trim()) parts.push(description.trim());
    return parts.join("\n\n");
  }, [title, description]);

  const parseAssistantLines = React.useCallback((text: string) => {
    return text
      .split(/\r?\n/)
      .map((line) => line.replace(/^[\s•\-–\d.]+/, "").trim())
      .filter(Boolean);
  }, []);

  const runAssistant = React.useCallback(
    async (
      label: string,
      executor: () => Promise<void>,
      options: { requireDescription?: boolean } = {}
    ) => {
      const requireDescription =
        options.requireDescription === undefined ? true : options.requireDescription;
      if (requireDescription && !jobDescriptionForAssistant.trim()) {
        setAssistantError(
          lang === "ar"
            ? "أدخل وصف الوظيفة أولاً."
            : "Provide the job description first."
        );
        return;
      }
      setAssistantLoading(label);
      setAssistantError(null);
      try {
        await executor();
      } catch (err: any) {
        setAssistantError(err?.message || "assistant failed");
      } finally {
        setAssistantLoading(null);
      }
    },
    [jobDescriptionForAssistant, lang]
  );

  const steps = React.useMemo(() => {
    const base = [
      {
        id: 1,
        icon: <Sparkles className="h-4 w-4" />,
        ar: {
          title: "١. توصيف الوظيفة",
          hint: "حدد العنوان والوصف والسيناريو العام للوظيفة.",
        },
        en: {
          title: "1. Job profile",
          hint: "Capture the job title and a quick role context.",
        },
      },
      {
        id: 2,
        icon: <ShieldCheck className="h-4 w-4" />,
        ar: {
          title: "٢. المتطلبات",
          hint: "أدخل المتطلبات وحدد الـ must والوزن لكل عنصر.",
        },
        en: {
          title: "2. Requirements",
          hint: "Write or pick the requirements with must-have and weight.",
        },
      },
      {
        id: 3,
        icon: <Paperclip className="h-4 w-4" />,
        ar: {
          title: "٣. رفع السيرة الذاتية",
          hint: "ارفع CV بصيغة PDF أو DOCX لبدء التحليل.",
        },
        en: {
          title: "3. Upload CV",
          hint: "Upload the candidate CV to trigger the analysis.",
        },
      },
      {
        id: 4,
        icon: <CheckCircle2 className="h-4 w-4" />,
        ar: {
          title: "٤. النتائج",
          hint: "راجع النتيجة التفصيلية والتصدير والمقارنة.",
        },
        en: {
          title: "4. Results",
          hint: "Review the detailed score and export or compare.",
        },
      },
    ];
    return base.map((step) => ({
      id: step.id,
      icon: step.icon,
      title: lang === "ar" ? step.ar.title : step.en.title,
      hint: lang === "ar" ? step.ar.hint : step.en.hint,
    }));
  }, [lang]);

  const handleAssistantExtract = React.useCallback(() => {
    runAssistant("extract", async () => {
      const res = await assistantApi.extractFields(
        jobDescriptionForAssistant,
        lang
      );
      setAssistantFields(res);
      setAssistantLanguages({
        languages: Array.isArray(res.languages) ? res.languages : [],
        proficiency_if_stated: {},
      });
      setAssistantExperience({
        required_experience_years: res.required_experience_years ?? "",
        experience_detail: res.notes ?? "",
      });
      if (Array.isArray(res.must_have) || Array.isArray(res.nice_to_have)) {
        setAssistantSuggested({
          must_have: (res.must_have || []).map((skill) => ({
            skill,
            weight: 2,
          })),
          nice_to_have: (res.nice_to_have || []).map((skill) => ({
            skill,
            weight: 1,
          })),
        });
      }
    });
  }, [jobDescriptionForAssistant, runAssistant]);

  const handleAssistantTitle = React.useCallback(() => {
    runAssistant("title", async () => {
      const res = await assistantApi.titleSummary(
        jobDescriptionForAssistant,
        lang
      );
      setAssistantTitleSummary(res);
    });
  }, [jobDescriptionForAssistant, runAssistant]);

  const handleAssistantQuickSummary = React.useCallback(() => {
    runAssistant("quick", async () => {
      const res = await assistantApi.quickSuggestions(
        lang === "ar" ? "ملخص" : "summary",
        jobDescriptionForAssistant,
        lang
      );
      setAssistantQuickPoints(parseAssistantLines(res.output).slice(0, 6));
    });
  }, [jobDescriptionForAssistant, parseAssistantLines, runAssistant]);

  const handleAssistantLanguages = React.useCallback(() => {
    runAssistant("languages", async () => {
      const res = await assistantApi.languages(jobDescriptionForAssistant, lang);
      setAssistantLanguages(res);
    });
  }, [jobDescriptionForAssistant, runAssistant]);

  const handleAssistantExperience = React.useCallback(() => {
    runAssistant("experience", async () => {
      const res = await assistantApi.experience(jobDescriptionForAssistant, lang);
      setAssistantExperience(res);
    });
  }, [jobDescriptionForAssistant, runAssistant]);

  const handleAssistantRequirements = React.useCallback(() => {
    runAssistant("requirements", async () => {
      const res = await assistantApi.suggestRequirements(
        jobDescriptionForAssistant,
        lang
      );
      setAssistantSuggested(res);
    });
  }, [jobDescriptionForAssistant, runAssistant]);

  const handleAssistantTemplate = React.useCallback(() => {
    runAssistant("template", async () => {
      const res = await assistantApi.requirementsTemplate(
        jobDescriptionForAssistant,
        lang
      );
      setAssistantTemplate(res);
    });
  }, [jobDescriptionForAssistant, runAssistant]);

  const applySuggestedRequirements = React.useCallback(() => {
    if (!assistantSuggested) return;
    const list: JobRequirement[] = [];
    const ensureWeight = (value: number | undefined, fallback: number) => {
      const num = Number(value);
      if (!Number.isFinite(num) || num <= 0) return fallback;
      return Math.max(1, Math.min(3, num));
    };
    assistantSuggested.must_have?.forEach((item) => {
      if (!item?.skill) return;
      list.push({
        requirement: item.skill,
        mustHave: true,
        weight: ensureWeight(item.weight, 2),
      });
    });
    assistantSuggested.nice_to_have?.forEach((item) => {
      if (!item?.skill) return;
      list.push({
        requirement: item.skill,
        mustHave: false,
        weight: ensureWeight(item.weight, 1),
      });
    });
    if (!list.length) return;
    setReqs(list);
    setReqText(
      list
        .map((item) => `${item.requirement}${item.mustHave ? ", must" : ""}, ${item.weight}`)
        .join("\n")
    );
    push({
      role: "bot",
      content: (
        <div className="text-sm text-[var(--color-text-muted)]">
          {lang === "ar"
            ? "تم إدراج المتطلبات المقترحة. راجعها ثم اعتمدها."
            : "Suggested requirements added. Review and confirm."}
        </div>
      ),
    });
    setActiveStep((prev) => Math.max(prev, 2));
  }, [assistantSuggested, lang, push]);

  const handleCandidateHelper = React.useCallback(() => {
    if (!candidateProfile.trim()) {
      setAssistantError(
        lang === "ar" ? "أدخل وصف المرشح أولاً." : "Provide the candidate profile first."
      );
      return;
    }
    runAssistant("candidate", async () => {
      const res = await assistantApi.candidateHelper(
        candidateProfile,
        jobDescriptionForAssistant,
        lang
      );
      setCandidateHelperResult(res);
    });
  }, [candidateProfile, jobDescriptionForAssistant, lang, runAssistant]);

  React.useEffect(() => {
    const signature = jobDescriptionForAssistant.trim();
    if (!signature) {
      autoExtractSignature.current = "";
      return;
    }
    if (assistantLoading) return;
    if (signature === autoExtractSignature.current) return;
    const timer = window.setTimeout(() => {
      autoExtractSignature.current = signature;
      handleAssistantExtract();
    }, 800);
    return () => window.clearTimeout(timer);
  }, [assistantLoading, handleAssistantExtract, jobDescriptionForAssistant]);

  React.useEffect(() => {
    if (!promptFeedback) return;
    const timer = window.setTimeout(() => setPromptFeedback(null), 2000);
    return () => window.clearTimeout(timer);
  }, [promptFeedback]);

  const assistantLanguagesList =
    assistantLanguages?.languages?.length
      ? assistantLanguages.languages
      : assistantFields?.languages ?? [];
  const assistantExperienceText =
    assistantExperience?.required_experience_years?.trim() ||
    assistantFields?.required_experience_years?.trim() ||
    "";
  const assistantExperienceDetail =
    assistantExperience?.experience_detail?.trim() ||
    assistantFields?.notes?.trim() ||
    "";
  const assistantLoadingText = React.useMemo(() => {
    if (!assistantLoading) return "";
    const copy: Record<string, { ar: string; en: string }> = {
      extract: {
        ar: "جارٍ استخراج تفاصيل الوظيفة...",
        en: "Extracting job details...",
      },
      title: {
        ar: "جارٍ اقتراح عنوان ووصف...",
        en: "Generating title and summary...",
      },
      quick: {
        ar: "جارٍ توليد النقاط...",
        en: "Generating quick highlights...",
      },
      languages: {
        ar: "جارٍ تحليل اللغات...",
        en: "Detecting languages...",
      },
      experience: {
        ar: "جارٍ استخراج الخبرة...",
        en: "Extracting experience...",
      },
      requirements: {
        ar: "جارٍ اقتراح المتطلبات...",
        en: "Suggesting requirements...",
      },
      template: {
        ar: "جارٍ تجهيز نموذج المتطلبات...",
        en: "Building quick template...",
      },
      candidate: {
        ar: "جارٍ مطابقة المرشح...",
        en: "Evaluating candidate fit...",
      },
    };
    const entry = copy[assistantLoading];
    if (!entry) return lang === "ar" ? "جارٍ استخدام المساعد..." : "Running assistant...";
    return lang === "ar" ? entry.ar : entry.en;
  }, [assistantLoading, lang]);
  const blueprintLines = React.useMemo(
    () =>
      lang === "ar"
        ? [
            "أطلِب دائمًا من الـAI أن يُرجع النتيجة بهذا الشكل فقط:",
            "2) برومبت استخراج المتطلبات من JD.",
            "انسخ البرومبت كما هو وألصقه قبل الـJD.",
            "ضع العناصر بصياغات قصيرة قابلة للبحث (ATS keywords).",
            "4) قوالب اقتراحات جاهزة (Auto-suggest).",
            "7) اختصار للاستخدام السريع (Prompt Macro).",
            "7) اختصار للاستخدام السريع (Prompt Macro).",
          ]
        : [
            "Always ask the AI to return the result using this exact layout:",
            "2) Requirements extraction prompt from the JD.",
            "Copy the prompt as-is and paste it before the JD.",
            "Keep items short and searchable (ATS keywords).",
            "4) Ready-made auto-suggest templates.",
            "7) Quick-use shortcut (Prompt Macro).",
            "7) Quick-use shortcut (Prompt Macro).",
          ],
    [lang]
  );
  const extractionPrompt = React.useMemo(
    () =>
      lang === "ar"
        ? "حلل توصيف الوظيفة التالي واستخرج المتطلبات في قوائم مختصرة قابلة للبحث (ATS keywords).\nقسّم النتيجة إلى قسمين:\n1) متطلبات أساسية (Must-have) — استخدم الصيغة \"- المهارة • w2\" لكل عنصر.\n2) مهارات إضافية (Nice-to-have) — استخدم الصيغة \"- المهارة • w1\" لكل عنصر.\nلا تضف أي شرح إضافي.\nJD:\n"
        : "Analyse the following job description and extract concise, searchable requirements (ATS keywords).\nReturn two sections:\n1) Must-have requirements — format each line as \"- skill • w2\".\n2) Nice-to-have requirements — format each line as \"- skill • w1\".\nDo not add any commentary.\nJD:\n",
    [lang]
  );
  const autoSuggestPrompt = React.useMemo(
    () =>
      lang === "ar"
        ? "بناءً على توصيف الوظيفة التالي، أنشئ قالب متطلبات جاهزاً من عمودين: العمود الأيسر للمتطلبات الأساسية (Must-have) مع الصيغة \"- المهارة • w2\"، والعمود الأيمن للمهارات الإضافية (Nice-to-have) مع الصيغة \"- المهارة • w1\". اجعل كل عنصر كلمة أو كلمتين قابلة للبحث ومرر النتيجة بحيث يمكن نسخها مباشرة.\nJD:\n"
        : "Using the following job description, craft a ready-to-use two-column requirements template: left column for must-have items (format \"- skill • w2\") and right column for nice-to-have items (format \"- skill • w1\"). Keep every item one or two searchable keywords and output a clean template that can be copied instantly.\nJD:\n",
    [lang]
  );
  const promptMacros = React.useMemo(
    () =>
      lang === "ar"
        ? [
            {
              id: "macro-standard",
              title: "اختصار المخرجات القياسية",
              description: "يثبّت شكل الرد على مخطط المخرجات القياسي.",
              content:
                "أجب باستخدام مخطط المخرجات القياسي فقط:\n1) متطلبات أساسية (Must-have)\n- المهارة • w2\n2) مهارات إضافية (Nice-to-have)\n- المهارة • w1\n3) ملاحظات سريعة\n- نقطة\n- نقطة\nJD:\n",
            },
            {
              id: "macro-quickwins",
              title: "اختصار التحسين السريع",
              description: "يولّد أهم فجوتين وتحسينين سريعين للمرشح.",
              content:
                "حلل توصيف الوظيفة وحدد أهم فجوتين تؤثران على ترشيح المرشح. بعد ذلك اقترح تحسينين سريعين بصياغة نقاط قصيرة قابلة للتنفيذ. استخدم نفس لغة الواجهة الحالية وقدّم النتيجة ضمن مخطط المخرجات القياسي إن أمكن.\nJD:\n",
            },
          ]
        : [
            {
              id: "macro-standard",
              title: "Standard layout macro",
              description: "Locks the response to the standard output blueprint.",
              content:
                "Respond using only this standard layout:\n1) Must-have requirements\n- skill • w2\n2) Nice-to-have requirements\n- skill • w1\n3) Quick notes\n- bullet\n- bullet\nJD:\n",
            },
            {
              id: "macro-quickwins",
              title: "Quick wins macro",
              description: "Highlights the key gaps and two fast improvements.",
              content:
                "Analyse the job description, surface the top two gaps blocking the candidate, then propose two actionable quick wins as short bullets. Use the interface language and stick to the standard output blueprint when possible.\nJD:\n",
            },
          ],
    [lang]
  );
  const feedbackCopyText =
    lang === "ar" ? "تم النسخ إلى الحافظة." : "Prompt copied to clipboard.";
  const feedbackInsertText =
    lang === "ar"
      ? "تم إدراج البرومبت في خانة الوصف."
      : "Prompt inserted before the job description.";
  const copyLabel = lang === "ar" ? "انسخ" : "Copy";
  const insertLabel = lang === "ar" ? "إدراج" : "Insert";
  const handlePromptCopy = React.useCallback(
    (id: string, text: string) => {
      const payload = text.endsWith("\n") ? text : `${text}\n`;
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        navigator.clipboard
          .writeText(payload)
          .then(() => setPromptFeedback({ id, kind: "copy" }))
          .catch(() => setPromptFeedback({ id, kind: "copy" }));
      } else {
        setPromptFeedback({ id, kind: "copy" });
      }
    },
    [setPromptFeedback]
  );
  const handlePromptInsert = React.useCallback(
    (id: string, text: string) => {
      const trimmedPrompt = text.trimEnd();
      setDescription((prev) => {
        const existing = prev.trimStart();
        if (!existing.length) return `${trimmedPrompt}\n\n`;
        if (prev.startsWith(trimmedPrompt)) return prev;
        return `${trimmedPrompt}\n\n${existing}`;
      });
      setPromptFeedback({ id, kind: "insert" });
    },
    [setDescription, setPromptFeedback]
  );
  const hasJobDescription = jobDescriptionForAssistant.trim().length > 0;

  const listRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, result]);

  const metrics = React.useMemo(
    () => computeMetricsFromResult(result),
    [result]
  );
  const riskMessages = React.useMemo(
    () => (metrics ? metrics.riskFlags.map((f) => getRiskLabel(f, lang)) : []),
    [metrics, lang]
  );
  const canExport = Boolean(
    result &&
      ((result.breakdown as PerRequirement[] | undefined)?.length || metrics)
  );

  const onSendReqs = () => {
    if (!reqText.trim()) return;
    const parsed = parseRequirements(reqText);
    setReqs(parsed);
    push({
      role: "user",
      content: (
        <div>
          <div className="font-medium">Job Requirements</div>
          <ul className="text-sm mt-1 list-disc ps-5">
            {parsed.map((r, i) => (
              <li key={i}>
                {r.requirement} {r.mustHave ? "• must" : ""}{" "}
                {r.weight !== 1 ? `• w=${r.weight}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ),
    });
    push({
      role: "bot",
      content: (
        <div className="text-sm">
          ✅ تم استلام المتطلبات. ارفع الـCV ثم اضغط {tt("chat.run")}.
        </div>
      ),
    });
    setReqText("");
  };

  const onQuickAdd = (item: ReqItem) => {
    const line = `${item.requirement}${item.mustHave ? ", must" : ""}, ${item.weight}`;
    setReqText((prev) => (prev ? `${prev}\n${line}` : line));
  };

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    if (!f) return;
    const MAX = 20 * 1024 * 1024;
    if (f.size > MAX) {
      push({
        role: "bot",
        content: (
          <div className="text-sm text-red-600">
            {lang === "ar"
              ? "حجم الملف يتجاوز 20 ميغابايت"
              : "File size exceeds 20 MB"}
          </div>
        ),
      });
      return;
    }
    setCvFile(f);
    setFileLabel(f.name);
    setCvInfo(null);
    push({
      role: "user",
      content: (
        <div className="inline-flex items-center gap-2">
          <FileText className="size-4" />
          <span className="text-sm">{f.name}</span>
        </div>
      ),
    });
  };

  const broadcast = React.useCallback((payload: BroadcastPayload) => {
    if (typeof window === "undefined") return;
    const detail = { source: "ai-console", ...payload };
    try {
      window.dispatchEvent(new CustomEvent("analysis:completed", { detail }));
      window.localStorage?.setItem(
        "last-analysis",
        JSON.stringify({ ...detail, ts: Date.now() })
      );
    } catch {}
  }, []);

  const exportBreakdownAsCsv = React.useCallback(() => {
    if (!(result?.breakdown && result.breakdown.length)) return;
    const header = ["Requirement", "Must", "Weight", "Similarity", "Score/10"];
    const rows = (result.breakdown as PerRequirement[]).map((item) => [
      item.requirement,
      item.mustHave ? "yes" : "no",
      item.weight,
      (item.similarity * 100).toFixed(1) + "%",
      Number(item.score10 ?? 0).toFixed(1),
    ]);
    const csv = [header, ...rows]
      .map((cols) =>
        cols.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const safeTitle = jobInfo?.title
      ?.replace(/[^\w]+/g, "-")
      ?.toLowerCase()
      ?.slice(0, 40);
    const name = safeTitle
      ? `analysis-${safeTitle}.csv`
      : `analysis-${Date.now()}.csv`;
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  }, [result, jobInfo?.title]);

  const exportBreakdownAsPdf = React.useCallback(() => {
    if (!result) return;
    const rows = (result.breakdown || [])
      .map(
        (item, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>${item.requirement}</td>
            <td>${item.mustHave ? "✓" : ""}</td>
            <td>${item.weight}</td>
            <td>${(item.similarity * 100).toFixed(1)}%</td>
            <td>${Number(item.score10 ?? 0).toFixed(1)}</td>
          </tr>`
      )
      .join("");

    const m = computeMetricsFromResult(result);
    const metricsBlock = m
      ? `
        <section>
          <h2 style="margin-bottom:6px;font-size:14px;">Metrics</h2>
          <ul style="padding-left:16px; margin:0 0 12px 0;">
            <li>Must match: ${m.mustPercent.toFixed(1)}%</li>
            <li>Nice-to-have: ${m.nicePercent.toFixed(1)}%</li>
            <li>Score /10: ${m.weightedScore.toFixed(1)}</li>
          </ul>
        </section>`
      : "";

    const html = `
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${jobInfo?.title || "Analysis"}</title>
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; padding: 32px; color: #2F3A4A; background: #FFF7F0; }
            h1 { color: #D85E00; }
            table { border-collapse: collapse; width: 100%; margin-top: 16px; }
            th, td { border: 1px solid #F4C79E; padding: 8px; text-align: left; }
            th { background: #FFE7CF; }
          </style>
        </head>
        <body>
          <h1>${jobInfo?.title || "AI Analysis"}</h1>
          <p>${new Date(result.createdAt).toLocaleString()}</p>
          ${metricsBlock}
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Requirement</th>
                <th>Must</th>
                <th>Weight</th>
                <th>Similarity</th>
                <th>Score/10</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </body>
      </html>`;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
  }, [result, jobInfo?.title]);

  const openDashboard = React.useCallback(() => {
    if (!result?.id) return;
    window.open(`/analysis/${result.id}`, "_blank");
  }, [result?.id]);

  /* تشغيل مرن: نحاول أكثر من شكل payload (camel/snake) */
  async function runAnalysisFlexible(
    jobId: string,
    cvId: string,
    extras?: {
      requirements?: any[];
      title?: string;
      description?: string;
      lang?: string;
    }
  ) {
    const payloads = [
      { job_id: jobId, cv_id: cvId }, // snake
      { jobId, cvId }, // camel
      { job_id: jobId, cv_id: cvId, ...extras }, // snake +
      { jobId, cvId, ...extras }, // camel +
    ];
    let lastErr: Error | null = null;
    for (const p of payloads) {
      try {
        // http.post يضيف ORIGIN + /api تلقائياً
        return await http.post<any>("/analyses/run", p);
      } catch (e: any) {
        lastErr = e;
        // جرّب الشكل التالي
        // eslint-disable-next-line no-console
        console.warn(
          "/analyses/run failed, trying next payload → ",
          e?.message,
          p
        );
      }
    }
    throw lastErr || new Error("Run failed");
  }

  const run = async () => {
    if (loading) return;

    // لو المستخدم ما ضغط "اعتمد المتطلبات" لكن كتب في الـtextarea
    let currentReqs = reqs;
    if ((!currentReqs || currentReqs.length === 0) && reqText.trim()) {
      currentReqs = parseRequirements(reqText);
      setReqs(currentReqs);
    }

    if (!cvFile || !currentReqs.length) {
      push({
        role: "bot",
        content: (
          <div className="text-sm">
            {lang === "ar"
              ? "رجاءً أدخل المتطلبات وارفع CV أولًا."
              : "Please add requirements and upload a CV first."}
          </div>
        ),
      });
      return;
    }

    setLoading(true);
    setResult(null);
    push({
      role: "user",
      content: (
        <div className="inline-flex items-center gap-2">
          <Send className="size-4" /> {tt("chat.run")}
        </div>
      ),
    });

    try {
      // 1) إنشاء الوظيفة
      const job = await jobsApi.create({
        title: title || (lang === "ar" ? "وظيفة بدون عنوان" : "Untitled Job"),
        description: description || "—",
        requirements: currentReqs,
      });
      setJobInfo(job);

      // 2) رفع السيرة
      const uploaded = await cvApi.upload(cvFile);
      setCvInfo(uploaded);

      // 3) تشغيل التحليل (تمرير extras يُساعد بعض السيرفرات)
      const a = await runAnalysisFlexible(job.id, uploaded.cvId, {
        requirements: currentReqs,
        title,
        description,
        lang,
      });

      push({
        role: "sys",
        content: (
          <div
            aria-live="polite"
            className="inline-flex items-center gap-2 text-xs opacity-70"
          >
            <Loader2 className="size-4 animate-spin" /> {tt("chat.running")}
          </div>
        ),
      });

      const analysisId: string = a?.id || a?.analysis?.id;
      if (!analysisId) throw new Error("Invalid response: analysis id missing");

      // 4) جلب النتيجة عبر الـAPI الصحيح
      const final = await analysesApi.get(analysisId);
      setResult(final);

      push({
        role: "bot",
        content: (
          <div className="text-xs text-[#2F3A4A] dark:text-white/80">
            {tt("chat.stored")}
          </div>
        ),
      });

      broadcast({
        analysis: final,
        job,
        cv: uploaded,
        fileName: fileLabel || cvFile.name,
      });

      // 5) عرض جدول مختصر + الفجوات بأمان
      push({
        role: "bot",
        content: (
          <div>
            <div className="inline-flex items-center gap-2 text-green-700 dark:text-green-400">
              <CheckCircle2 className="size-5" /> {tt("chat.done")}
            </div>
            <div className="mt-2 text-sm">
              <b>{tt("chat.score")}</b>:{" "}
              {typeof final.score === "number" ? final.score.toFixed(2) : "-"} /
              10
            </div>

            {Array.isArray(final.breakdown) && (
              <div className="mt-3 max-h-56 overflow-auto rounded-2xl border border-black/10 dark:border-white/10">
                <table className="w-full text-xs">
                  <thead className="bg-black/5 dark:bg-white/10">
                    <tr>
                      <th className="p-2 text-start">Requirement</th>
                      <th className="p-2">Must</th>
                      <th className="p-2">W</th>
                      <th className="p-2">Sim%</th>
                      <th className="p-2">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(final.breakdown as PerRequirement[]).map((r, i) => (
                      <tr
                        key={i}
                        className="border-t border-black/10 dark:border-white/10"
                      >
                        <td className="p-2">{r.requirement}</td>
                        <td className="p-2 text-center">
                          {r.mustHave ? "✓" : "—"}
                        </td>
                        <td className="p-2 text-center">{r.weight}</td>
                        <td className="p-2 text-center">
                          {(r.similarity * 100).toFixed(1)}%
                        </td>
                        <td className="p-2 text-center">
                          {r.score10?.toFixed?.(2) ?? "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {final.gaps && (
              <div className="mt-3 text-xs opacity-80 space-y-1">
                <div>
                  <b>{tt("chat.gaps")}</b>
                </div>
                <div>
                  must-missing:{" "}
                  {toStringArray((final.gaps as any)?.mustHaveMissing).join(
                    ", "
                  ) || "—"}
                </div>
                <div>
                  improve:{" "}
                  {toStringArray((final.gaps as any)?.improve).join(", ") ||
                    "—"}
                </div>
              </div>
            )}
          </div>
        ),
      });

      // (اختياري) ملخص الترتيب حتى لو CV واحد
      try {
        const pick = await analysesApi.pickBest({
          jobId: job.id,
          cvIds: [uploaded.cvId],
          top: 1,
        });
        const summaryList = Array.isArray((pick as any).summary)
          ? (pick as any).summary
          : (pick as any).summary
            ? [(pick as any).summary]
            : [];
        if (summaryList.length) {
          push({
            role: "bot",
            content: (
              <div className="mt-3 text-xs space-y-1">
                <b>{lang === "ar" ? "ملخص الترتيب" : "Ranking summary"}</b>
                <ul className="list-disc ps-5 opacity-80">
                  {summaryList.map((s: string, i: number) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            ),
          });
        }
      } catch {}
    } catch (error: any) {
      const message = error?.message || String(error);
      push({
        role: "bot",
        content: (
          <div className="text-sm text-red-600">
            {lang === "ar" ? `حدث خطأ: ${message}` : `Error: ${message}`}
          </div>
        ),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="relative overflow-hidden rounded-[36px] border border-[var(--color-border)] bg-[var(--surface)]/95 px-6 py-8 shadow-[0_24px_70px_-32px_rgba(255,122,0,0.38)]">
        <div className="pointer-events-none absolute -left-24 -top-36 h-64 w-64 rounded-full bg-[var(--color-primary)]/12 blur-3xl" />
        <div className="pointer-events-none absolute -right-28 bottom-0 h-72 w-72 rounded-full bg-[var(--color-secondary)]/18 blur-[120px]" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-3">
            <span className="inline-flex items-center gap-2 rounded-full bg-[var(--color-primary)]/10 px-3 py-1 text-xs font-semibold text-[var(--color-primary)]">
              <Sparkles className="h-3.5 w-3.5" />
              {lang === "ar" ? "منصة التحليل الذكي" : "AI talent workflow"}
            </span>
            <h2 className="text-3xl font-semibold text-[var(--foreground)]">
              {lang === "ar"
                ? "لوحة تحليل السير الذاتية"
                : "CV intelligence console"}
            </h2>
            <p className="max-w-xl text-sm text-[var(--color-text-muted)]">
              {lang === "ar"
                ? "اتبع الخطوات لتوليد متطلبات دقيقة، رفع السير، ثم الحصول على تقرير مطابق جاهز للتصدير."
                : "Follow the steps to craft requirements, upload CVs and receive an export-ready alignment report."}
            </p>
          </div>
          <div className="space-y-2 text-xs text-[var(--color-text-muted)]">
            <div className="inline-flex items-center gap-2 rounded-full bg-[var(--color-secondary)]/10 px-3 py-1 font-medium text-[var(--color-secondary)]">
              <ShieldCheck className="h-3.5 w-3.5" />
              gpt-4o + text-embedding-3-large
            </div>
            {result?.id && (
              <button
                onClick={openDashboard}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--color-primary)]/40 bg-[var(--surface)]/90 px-4 py-2 text-sm font-semibold text-[var(--color-primary)] shadow-sm hover:bg-[var(--color-primary)]/10"
              >
                <ArrowUpRight className="h-4 w-4" />
                {tt("chat.viewFull")}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Steps nav */}
      <nav className="rounded-3xl border border-[var(--color-border)] bg-[var(--surface)]/95 px-4 py-4 shadow-sm">
        <ol className="grid gap-3 sm:grid-cols-4">
          {steps.map((step) => {
            const isActive = step.id === activeStep;
            const isDone = step.id < activeStep;
            const locked = step.id > maxStep;
            return (
              <li key={step.id}>
                <button
                  type="button"
                  onClick={() => goToStep(step.id)}
                  disabled={locked}
                  className={clsx(
                    "group w-full rounded-2xl border px-4 py-3 text-start transition",
                    locked
                      ? "cursor-not-allowed border-[var(--color-border)] bg-[var(--surface)]/60 text-[var(--color-text-muted)]/60"
                      : isActive
                        ? "border-[var(--color-primary)] bg-[var(--color-primary)]/12 shadow"
                        : isDone
                          ? "border-[var(--color-primary)]/50 bg-[var(--color-primary)]/8"
                          : "border-[var(--color-border)] bg-[var(--surface)] hover:border-[var(--color-primary)]/60"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={clsx(
                        "flex size-9 items-center justify-center rounded-full border text-xs font-semibold",
                        isDone || isActive
                          ? "border-[var(--color-primary)] bg-[var(--color-primary)]/15 text-[var(--color-primary)]"
                          : "border-[var(--color-border)] bg-[var(--surface-soft)]/70 text-[var(--color-text-muted)]"
                      )}
                    >
                      {step.id}
                    </span>
                    <div>
                      <div className="text-sm font-semibold text-[var(--foreground)]">
                        {step.title}
                      </div>
                      <div className="text-[11px] text-[var(--color-text-muted)]">
                        {step.hint}
                      </div>
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
        {/* Left side: steps content */}
        <div className="space-y-6">
          <AnimatePresence mode="wait">
            {/* Step 1: Job profile */}
            {activeStep === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.25 }}
                className="rounded-[28px] border border-[var(--color-border)] bg-[var(--surface)]/95 p-6 shadow-sm space-y-4"
              >
                <div className="space-y-4">
                  <label className="flex flex-col gap-2 text-sm text-[var(--color-text-muted)]">
                    {lang === "ar" ? "عنوان الوظيفة" : "Job title"}
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder={
                        lang === "ar"
                          ? "مثال: مطوّر React متقدم"
                          : "Example: Senior React Engineer"
                      }
                      className="rounded-2xl border border-[var(--color-border)] bg-[var(--surface-soft)]/70 px-3 py-3 text-sm text-[var(--foreground)] focus:border-[var(--color-primary)] focus:outline-none"
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-sm text-[var(--color-text-muted)]">
                    {lang === "ar" ? "وصف مختصر" : "Short summary"}
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={4}
                      placeholder={
                        lang === "ar"
                          ? "ماذا يفعل الفريق؟ ما أبرز المسؤوليات؟"
                          : "What does the team do? Key responsibilities?"
                      }
                      className="rounded-2xl border border-[var(--color-border)] bg-[var(--surface-soft)]/70 px-3 py-3 text-sm text-[var(--foreground)] focus:border-[var(--color-primary)] focus:outline-none"
                    />
                  </label>

                  <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--surface-soft)]/60 p-4 text-xs text-[var(--color-text-muted)]">
                    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--foreground)]">
                      <div className="inline-flex items-center gap-2 font-semibold">
                        <Sparkles className="h-4 w-4 text-[var(--color-primary)]" />
                        {lang === "ar" ? "مساعد الذكاء للوصف" : "AI helper for the job brief"}
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs">
                        <button
                          type="button"
                          onClick={handleAssistantExtract}
                          disabled={!hasJobDescription || assistantLoading === "extract"}
                          className="inline-flex items-center gap-1 rounded-full border border-[var(--color-primary)]/40 px-3 py-1 font-semibold text-[var(--color-primary)] disabled:opacity-50"
                        >
                          <Sparkles className="h-3 w-3" />
                          {lang === "ar" ? "تحليل كامل" : "Full extract"}
                        </button>
                        <button
                          type="button"
                          onClick={handleAssistantTitle}
                          disabled={!hasJobDescription || assistantLoading === "title"}
                          className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] px-3 py-1 font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-primary)] disabled:opacity-50"
                        >
                          {lang === "ar" ? "عنوان ووصف" : "Title & summary"}
                        </button>
                        <button
                          type="button"
                          onClick={handleAssistantQuickSummary}
                          disabled={!hasJobDescription || assistantLoading === "quick"}
                          className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] px-3 py-1 font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-primary)] disabled:opacity-50"
                        >
                          {lang === "ar" ? "ملخص سريع" : "Quick highlights"}
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <button
                        type="button"
                        onClick={handleAssistantLanguages}
                        disabled={!hasJobDescription || assistantLoading === "languages"}
                        className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] px-3 py-1 font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-primary)] disabled:opacity-50"
                      >
                        {lang === "ar" ? "اللغات المطلوبة" : "Languages"}
                      </button>
                      <button
                        type="button"
                        onClick={handleAssistantExperience}
                        disabled={!hasJobDescription || assistantLoading === "experience"}
                        className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] px-3 py-1 font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-primary)] disabled:opacity-50"
                      >
                        {lang === "ar" ? "الخبرة المطلوبة" : "Experience"}
                      </button>
                    </div>
                    {assistantError ? (
                      <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">
                        {assistantError}
                      </div>
                    ) : null}
                    {assistantLoading ? (
                      <div className="mt-3 inline-flex items-center gap-2 text-[11px] text-[var(--color-text-muted)]">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        {assistantLoadingText ||
                          (lang === "ar"
                            ? "جارٍ استخدام المساعد..."
                            : "Running assistant...")}
                      </div>
                    ) : null}

                    {assistantFields ? (
                      <div className="mt-4 grid gap-3">
                        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--surface)]/80 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[var(--color-text-muted)]">
                              {lang === "ar" ? "ملخص مستخرج" : "Extracted snapshot"}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {assistantFields.title ? (
                                <button
                                  type="button"
                                  onClick={() => setTitle(assistantFields.title)}
                                  className="rounded-full border border-[var(--color-border)] px-3 py-1 text-[11px] font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
                                >
                                  {lang === "ar" ? "استخدام العنوان" : "Use title"}
                                </button>
                              ) : null}
                              {assistantFields.summary ? (
                                <button
                                  type="button"
                                  onClick={() => setDescription(assistantFields.summary)}
                                  className="rounded-full border border-[var(--color-border)] px-3 py-1 text-[11px] font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
                                >
                                  {lang === "ar" ? "استخدام الملخص" : "Use summary"}
                                </button>
                              ) : null}
                            </div>
                          </div>
                          <div className="mt-2 space-y-2 text-[11px]">
                            {assistantFields.title ? (
                              <div>
                                <span className="font-semibold text-[var(--foreground)]">
                                  {lang === "ar" ? "العنوان:" : "Title:"}
                                </span>{" "}
                                {assistantFields.title}
                              </div>
                            ) : null}
                            {assistantFields.summary ? (
                              <div>
                                <span className="font-semibold text-[var(--foreground)]">
                                  {lang === "ar" ? "الملخص:" : "Summary:"}
                                </span>{" "}
                                {assistantFields.summary}
                              </div>
                            ) : null}
                            {assistantFields.level ? (
                              <div>
                                <span className="font-semibold text-[var(--foreground)]">
                                  {lang === "ar" ? "المستوى:" : "Level:"}
                                </span>{" "}
                                {assistantFields.level}
                              </div>
                            ) : null}
                            {assistantFields.contract_types?.length ? (
                              <div>
                                <span className="font-semibold text-[var(--foreground)]">
                                  {lang === "ar" ? "أنواع العقد:" : "Contract:"}
                                </span>{" "}
                                {assistantFields.contract_types.join(" • ")}
                              </div>
                            ) : null}
                            {assistantFields.location ? (
                              <div>
                                <span className="font-semibold text-[var(--foreground)]">
                                  {lang === "ar" ? "الموقع:" : "Location:"}
                                </span>{" "}
                                {assistantFields.location}
                              </div>
                            ) : null}
                            {assistantFields.notes ? (
                              <div>
                                <span className="font-semibold text-[var(--foreground)]">
                                  {lang === "ar" ? "ملاحظات:" : "Notes:"}
                                </span>{" "}
                                {assistantFields.notes}
                              </div>
                            ) : null}
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--surface)]/80 p-3">
                            <div className="text-[11px] font-semibold text-[var(--color-text-muted)]">
                              {lang === "ar" ? "الخبرة" : "Experience"}
                            </div>
                            <div className="mt-2 text-[var(--foreground)]">
                              {assistantExperienceText
                                ? assistantExperienceText
                                : lang === "ar"
                                  ? "لم تُحدَّد خبرة صريحة."
                                  : "No explicit experience found."}
                            </div>
                            {assistantExperienceDetail ? (
                              <div className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                                {assistantExperienceDetail}
                              </div>
                            ) : null}
                          </div>
                          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--surface)]/80 p-3">
                            <div className="text-[11px] font-semibold text-[var(--color-text-muted)]">
                              {lang === "ar" ? "اللغات" : "Languages"}
                            </div>
                            {assistantLanguagesList.length ? (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {assistantLanguagesList.map((item) => (
                                  <span
                                    key={item}
                                    className="rounded-full bg-[var(--color-primary)]/10 px-3 py-1 text-[11px] font-semibold text-[var(--color-primary)]"
                                  >
                                    {item}
                                    {assistantLanguages?.proficiency_if_stated?.[item] ? (
                                      <span className="ms-1 text-[10px] text-[var(--color-text-muted)]">
                                        {assistantLanguages.proficiency_if_stated[item]}
                                      </span>
                                    ) : null}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <div className="mt-2 text-[11px] text-[var(--color-text-muted)]">
                                {lang === "ar" ? "لا توجد لغات محددة." : "No languages detected."}
                              </div>
                            )}
                          </div>
                        </div>

                        {(assistantFields.must_have?.length || assistantFields.nice_to_have?.length) ? (
                          <div className="grid gap-3 sm:grid-cols-2">
                            {assistantFields.must_have?.length ? (
                              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--surface)]/80 p-3">
                                <div className="text-[11px] font-semibold text-[var(--color-text-muted)]">
                                  {lang === "ar" ? "متطلبات أساسية" : "Must-have"}
                                </div>
                                <ul className="mt-2 space-y-1 text-[11px]">
                                  {assistantFields.must_have.map((item) => (
                                    <li key={`must-${item}`}>{item}</li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}
                            {assistantFields.nice_to_have?.length ? (
                              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--surface)]/80 p-3">
                                <div className="text-[11px] font-semibold text-[var(--color-text-muted)]">
                                  {lang === "ar" ? "مهارات إضافية" : "Nice-to-have"}
                                </div>
                                <ul className="mt-2 space-y-1 text-[11px]">
                                  {assistantFields.nice_to_have.map((item) => (
                                    <li key={`nice-${item}`}>{item}</li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {assistantTitleSummary ? (
                      <div className="mt-4 rounded-2xl border border-[var(--color-border)] bg-[var(--surface)]/80 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-[11px] font-semibold text-[var(--color-text-muted)]">
                            {lang === "ar" ? "عنوان مقترح" : "Suggested title & summary"}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {assistantTitleSummary.title ? (
                              <button
                                type="button"
                                onClick={() => setTitle(assistantTitleSummary.title)}
                                className="rounded-full border border-[var(--color-border)] px-3 py-1 text-[11px] font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
                              >
                                {lang === "ar" ? "اعتماد العنوان" : "Use title"}
                              </button>
                            ) : null}
                            {assistantTitleSummary.summary ? (
                              <button
                                type="button"
                                onClick={() => setDescription(assistantTitleSummary.summary)}
                                className="rounded-full border border-[var(--color-border)] px-3 py-1 text-[11px] font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
                              >
                                {lang === "ar" ? "اعتماد الوصف" : "Use summary"}
                              </button>
                            ) : null}
                          </div>
                        </div>
                        <div className="mt-2 space-y-2 text-[11px]">
                          {assistantTitleSummary.title ? (
                            <div>
                              <span className="font-semibold text-[var(--foreground)]">
                                {lang === "ar" ? "العنوان:" : "Title:"}
                              </span>{" "}
                              {assistantTitleSummary.title}
                            </div>
                          ) : null}
                          {assistantTitleSummary.summary ? (
                            <div>
                              <span className="font-semibold text-[var(--foreground)]">
                                {lang === "ar" ? "الوصف:" : "Summary:"}
                              </span>{" "}
                              {assistantTitleSummary.summary}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}

                    {assistantQuickPoints.length ? (
                      <div className="mt-4 rounded-2xl border border-[var(--color-border)] bg-[var(--surface)]/80 p-3">
                        <div className="text-[11px] font-semibold text-[var(--color-text-muted)]">
                          {lang === "ar" ? "نِقاط سريعة" : "Quick points"}
                        </div>
                        <ul className="mt-2 list-disc space-y-1 ps-5 text-[11px] text-[var(--color-text-muted)]">
                          {assistantQuickPoints.map((item, idx) => (
                            <li key={`quick-${idx}`}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--surface)]/80 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[11px] font-semibold text-[var(--color-text-muted)]">
                          {lang === "ar"
                            ? "مخطط المخرجات القياسي"
                            : "Standard output blueprint"}
                        </div>
                        <button
                          type="button"
                          onClick={() => handlePromptCopy("blueprint", blueprintLines.join("\n"))}
                          className="rounded-full border border-[var(--color-border)] px-3 py-1 text-[11px] font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
                        >
                          {copyLabel}
                        </button>
                      </div>
                      <ul className="mt-2 space-y-1 text-[11px] text-[var(--color-text-muted)]">
                        {blueprintLines.map((line, idx) => (
                          <li key={`blueprint-${idx}`}>{line}</li>
                        ))}
                      </ul>
                      {promptFeedback?.id === "blueprint" ? (
                        <div className="mt-2 text-[10px] text-[var(--color-primary)]">
                          {feedbackCopyText}
                        </div>
                      ) : null}
                    </div>

                    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--surface)]/80 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[11px] font-semibold text-[var(--color-text-muted)]">
                          {lang === "ar"
                            ? "برومبت استخراج المتطلبات من JD"
                            : "JD requirements extraction prompt"}
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handlePromptCopy("extract", extractionPrompt)}
                            className="rounded-full border border-[var(--color-border)] px-3 py-1 text-[11px] font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
                          >
                            {copyLabel}
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePromptInsert("extract", extractionPrompt)}
                            className="rounded-full border border-[var(--color-border)] px-3 py-1 text-[11px] font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
                          >
                            {insertLabel}
                          </button>
                        </div>
                      </div>
                      <pre className="mt-2 whitespace-pre-wrap break-words rounded-xl bg-[var(--surface-soft)]/60 px-3 py-2 text-[11px] text-[var(--color-text-muted)]">
                        {extractionPrompt}
                      </pre>
                      {promptFeedback?.id === "extract" ? (
                        <div className="mt-2 text-[10px] text-[var(--color-primary)]">
                          {promptFeedback.kind === "copy"
                            ? feedbackCopyText
                            : feedbackInsertText}
                        </div>
                      ) : null}
                    </div>

                    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--surface)]/80 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[11px] font-semibold text-[var(--color-text-muted)]">
                          {lang === "ar"
                            ? "قوالب اقتراحات جاهزة (Auto-suggest)"
                            : "Auto-suggest templates"}
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handlePromptCopy("autosuggest", autoSuggestPrompt)}
                            className="rounded-full border border-[var(--color-border)] px-3 py-1 text-[11px] font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
                          >
                            {copyLabel}
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePromptInsert("autosuggest", autoSuggestPrompt)}
                            className="rounded-full border border-[var(--color-border)] px-3 py-1 text-[11px] font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
                          >
                            {insertLabel}
                          </button>
                        </div>
                      </div>
                      <pre className="mt-2 whitespace-pre-wrap break-words rounded-xl bg-[var(--surface-soft)]/60 px-3 py-2 text-[11px] text-[var(--color-text-muted)]">
                        {autoSuggestPrompt}
                      </pre>
                      {promptFeedback?.id === "autosuggest" ? (
                        <div className="mt-2 text-[10px] text-[var(--color-primary)]">
                          {promptFeedback.kind === "copy"
                            ? feedbackCopyText
                            : feedbackInsertText}
                        </div>
                      ) : null}
                    </div>

                    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--surface)]/80 p-3">
                      <div className="text-[11px] font-semibold text-[var(--color-text-muted)]">
                        {lang === "ar"
                          ? "اختصارات للاستخدام السريع (Prompt Macro)"
                          : "Prompt macros"}
                      </div>
                      <div className="mt-3 space-y-3">
                        {promptMacros.map((macro) => (
                          <div
                            key={macro.id}
                            className="rounded-xl border border-[var(--color-border)] bg-[var(--surface-soft)]/60 p-3"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <div className="text-[11px] font-semibold text-[var(--foreground)]">
                                  {macro.title}
                                </div>
                                <div className="text-[10px] text-[var(--color-text-muted)]">
                                  {macro.description}
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => handlePromptCopy(macro.id, macro.content)}
                                  className="rounded-full border border-[var(--color-border)] px-3 py-1 text-[11px] font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
                                >
                                  {copyLabel}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handlePromptInsert(macro.id, macro.content)}
                                  className="rounded-full border border-[var(--color-border)] px-3 py-1 text-[11px] font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
                                >
                                  {insertLabel}
                                </button>
                              </div>
                            </div>
                            <pre className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-[var(--surface)]/60 px-3 py-2 text-[11px] text-[var(--color-text-muted)]">
                              {macro.content}
                            </pre>
                            {promptFeedback?.id === macro.id ? (
                              <div className="mt-2 text-[10px] text-[var(--color-primary)]">
                                {promptFeedback.kind === "copy"
                                  ? feedbackCopyText
                                  : feedbackInsertText}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* زر توليد المتطلبات من الوصف */}
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-[var(--color-text-muted)]">
                      {lang === "ar"
                        ? "استخدم وصفًا مختصرًا وسأحوله إلى متطلبات مع أوزان وجاهز للتحليل."
                        : "Write a brief role summary and I’ll turn it into weighted requirements."}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const fromDesc =
                          extractRequirementsFromDescription(description);
                        if (!fromDesc.length) {
                          push({
                            role: "bot",
                            content: (
                              <div className="text-sm text-amber-600">
                                {lang === "ar"
                                  ? "لم أستطع استخراج متطلبات من الوصف. أضف نقاطًا أو جُملاً أوضح."
                                  : "Couldn’t extract requirements from the summary. Add clearer bullet points."}
                              </div>
                            ),
                          });
                          return;
                        }
                        setReqs(fromDesc);
                        setReqText(
                          fromDesc
                            .map(
                              (r) =>
                                `${r.requirement}${r.mustHave ? ", must" : ""}, ${r.weight}`
                            )
                            .join("\n")
                        );
                        push({
                          role: "bot",
                          content: (
                            <div className="text-sm">
                              {lang === "ar"
                                ? "تم توليد المتطلبات من الوصف ✅"
                                : "Requirements generated from summary ✅"}
                            </div>
                          ),
                        });
                        goToStep(2);
                      }}
                      className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white shadow"
                    >
                      {lang === "ar"
                        ? "الشرح المتطلبات بالذكاء"
                        : "Generate requirements"}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={() => goToStep(2)}
                    disabled={!title.trim() && !description.trim()}
                    className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[var(--color-primary)] via-[#ff8b2e] to-[var(--color-accent)] px-5 py-2 text-sm font-semibold text-white shadow-lg disabled:opacity-50"
                  >
                    {lang === "ar" ? "التالي: المتطلبات" : "Next: requirements"}
                    <ArrowUpRight className="h-4 w-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* Step 2: Requirements */}
            {activeStep === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.25 }}
                className="rounded-[28px] border border-[var(--color-border)] bg-[var(--surface)]/95 p-6 shadow-sm space-y-5"
              >
                <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--surface-soft)]/60 p-4 text-xs text-[var(--color-text-muted)]">
                  <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--foreground)]">
                    <div className="inline-flex items-center gap-2 font-semibold">
                      <Sparkles className="h-4 w-4 text-[var(--color-primary)]" />
                      {lang === "ar" ? "ذكاء المتطلبات" : "AI requirements helper"}
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <button
                        type="button"
                        onClick={handleAssistantRequirements}
                        disabled={!hasJobDescription || assistantLoading === "requirements"}
                        className="inline-flex items-center gap-1 rounded-full border border-[var(--color-primary)]/40 px-3 py-1 font-semibold text-[var(--color-primary)] disabled:opacity-50"
                      >
                        <Sparkles className="h-3 w-3" />
                        {lang === "ar" ? "اقترح متطلبات" : "Suggest requirements"}
                      </button>
                      <button
                        type="button"
                        onClick={applySuggestedRequirements}
                        disabled={!assistantSuggested}
                        className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] px-3 py-1 font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-primary)] disabled:opacity-50"
                      >
                        {lang === "ar" ? "تطبيق المقترحات" : "Apply set"}
                      </button>
                      <button
                        type="button"
                        onClick={handleAssistantTemplate}
                        disabled={!hasJobDescription || assistantLoading === "template"}
                        className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] px-3 py-1 font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-primary)] disabled:opacity-50"
                      >
                        {lang === "ar" ? "نموذج سريع" : "Quick template"}
                      </button>
                    </div>
                  </div>
                  {assistantError ? (
                    <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">
                      {assistantError}
                    </div>
                  ) : null}
                  {assistantLoading && (assistantLoading === "requirements" || assistantLoading === "template") ? (
                    <div className="mt-3 inline-flex items-center gap-2 text-[11px] text-[var(--color-text-muted)]">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> {assistantLoadingText}
                    </div>
                  ) : null}
                  {assistantSuggested ? (
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--surface)]/80 p-3">
                        <div className="text-[11px] font-semibold text-[var(--color-text-muted)]">
                          {lang === "ar" ? "متطلبات أساسية" : "Must-have"}
                        </div>
                        {assistantSuggested.must_have?.length ? (
                          <ul className="mt-2 space-y-1 text-[11px]">
                            {assistantSuggested.must_have.map((item, idx) => (
                              <li key={`ai-must-${idx}`}>
                                {item.skill}
                                {item.weight ? ` • w${item.weight}` : ""}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="mt-2 text-[11px] text-[var(--color-text-muted)]">
                            {lang === "ar" ? "لا يوجد." : "None."}
                          </div>
                        )}
                      </div>
                      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--surface)]/80 p-3">
                        <div className="text-[11px] font-semibold text-[var(--color-text-muted)]">
                          {lang === "ar" ? "مهارات إضافية" : "Nice-to-have"}
                        </div>
                        {assistantSuggested.nice_to_have?.length ? (
                          <ul className="mt-2 space-y-1 text-[11px]">
                            {assistantSuggested.nice_to_have.map((item, idx) => (
                              <li key={`ai-nice-${idx}`}>
                                {item.skill}
                                {item.weight ? ` • w${item.weight}` : ""}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="mt-2 text-[11px] text-[var(--color-text-muted)]">
                            {lang === "ar" ? "لا يوجد." : "None."}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}
                  {assistantTemplate ? (
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--surface)]/80 p-3">
                        <div className="text-[11px] font-semibold text-[var(--color-text-muted)]">
                          {lang === "ar" ? "اقتراحات العمود الأيسر" : "Left column"}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {assistantTemplate.left_column.map((item) => (
                            <button
                              key={`tpl-left-${item}`}
                              type="button"
                              onClick={() => onQuickAdd({ requirement: item, mustHave: true, weight: 2 })}
                              className="rounded-full border border-[var(--color-primary)]/50 bg-[var(--surface)] px-3 py-1 text-[11px] font-semibold text-[var(--color-primary)]"
                            >
                              {item}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--surface)]/80 p-3">
                        <div className="text-[11px] font-semibold text-[var(--color-text-muted)]">
                          {lang === "ar" ? "اقتراحات العمود الأيمن" : "Right column"}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {assistantTemplate.right_column.map((item) => (
                            <button
                              key={`tpl-right-${item}`}
                              type="button"
                              onClick={() => onQuickAdd({ requirement: item, mustHave: false, weight: 1 })}
                              className="rounded-full border border-[var(--color-border)] px-3 py-1 text-[11px] font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
                            >
                              {item}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-4 rounded-2xl border border-[var(--color-border)] bg-[var(--surface)]/80 p-3">
                    <label className="flex flex-col gap-2 text-[11px] text-[var(--color-text-muted)]">
                      {lang === "ar"
                        ? "وصف المرشح (مثال: مطور، خبرة سنة، يتعلم أونلاين)"
                        : "Candidate profile (e.g. frontend dev, 1 year, learning online)"}
                      <textarea
                        value={candidateProfile}
                        onChange={(e) => setCandidateProfile(e.target.value)}
                        rows={3}
                        placeholder={
                          lang === "ar"
                            ? "اكتب وصفًا مختصرًا للشخص ليقارن مع الوظيفة"
                            : "Add a short candidate blurb to compare"
                        }
                        className="rounded-2xl border border-[var(--color-border)] bg-[var(--surface-soft)]/60 px-3 py-2 text-sm text-[var(--foreground)] focus:border-[var(--color-primary)] focus:outline-none"
                      />
                    </label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleCandidateHelper}
                        disabled={!hasJobDescription || assistantLoading === "candidate"}
                        className="inline-flex items-center gap-2 rounded-full border border-[var(--color-primary)]/40 px-3 py-1 text-[11px] font-semibold text-[var(--color-primary)] disabled:opacity-50"
                      >
                        <Sparkles className="h-3 w-3" />
                        {lang === "ar" ? "مساعد الشخص" : "Candidate helper"}
                      </button>
                    </div>
                    {candidateHelperResult ? (
                      <div className="mt-3 grid gap-3 text-[11px] text-[var(--color-text-muted)]">
                        {candidateHelperResult.fit_notes ? (
                          <div>
                            <span className="font-semibold text-[var(--foreground)]">
                              {lang === "ar" ? "مطابقة:" : "Fit:"}
                            </span>{" "}
                            {candidateHelperResult.fit_notes}
                          </div>
                        ) : null}
                        <div className="grid gap-2 md:grid-cols-2">
                          <div>
                            <div className="font-semibold text-[var(--color-text-muted)]">
                              {lang === "ar" ? "الفجوات" : "Gaps"}
                            </div>
                            {candidateHelperResult.gaps?.length ? (
                              <ul className="mt-1 space-y-1 ps-4">
                                {candidateHelperResult.gaps.map((item, idx) => (
                                  <li key={`gap-${idx}`}>{item}</li>
                                ))}
                              </ul>
                            ) : (
                              <div className="mt-1 text-[var(--color-text-muted)]">
                                {lang === "ar" ? "لا شيء صريح." : "No explicit gaps."}
                              </div>
                            )}
                          </div>
                          <div>
                            <div className="font-semibold text-[var(--color-text-muted)]">
                              {lang === "ar" ? "اقتراحات تعلم" : "Learning tips"}
                            </div>
                            {candidateHelperResult.learning_suggestions?.length ? (
                              <ul className="mt-1 space-y-1 ps-4">
                                {candidateHelperResult.learning_suggestions.map((item, idx) => (
                                  <li key={`learn-${idx}`}>{item}</li>
                                ))}
                              </ul>
                            ) : (
                              <div className="mt-1 text-[var(--color-text-muted)]">
                                {lang === "ar" ? "لا اقتراحات." : "No suggestions."}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                <RequirementPicker onAdd={onQuickAdd} lang={lang} />
                <textarea
                  value={reqText}
                  onChange={(e) => setReqText(e.target.value)}
                  rows={5}
                  placeholder={
                    lang === "ar"
                      ? "اكتب كل متطلب في سطر منفصل، ويمكن إضافة must أو وزن مثل 2"
                      : "Write each requirement on a new line. Add must or weight like 2"
                  }
                  className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--surface-soft)]/70 px-3 py-3 text-sm text-[var(--foreground)] focus:border-[var(--color-primary)] focus:outline-none"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={onSendReqs}
                    className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white shadow"
                  >
                    <Sparkles className="h-4 w-4" />
                    {lang === "ar" ? "اعتمد المتطلبات" : "Confirm requirements"}
                  </button>
                  <button
                    onClick={() => setReqText("")}
                    className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
                  >
                    {lang === "ar" ? "مسح" : "Clear"}
                  </button>
                </div>
                {reqs.length ? (
                  <div className="flex flex-wrap gap-2 text-xs">
                    {reqs.map((item, idx) => (
                      <span
                        key={`${item.requirement}-${idx}`}
                        className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--surface-soft)]/70 px-3 py-1 text-[var(--color-text-muted)]"
                      >
                        <span className="font-medium text-[var(--foreground)]">
                          {item.requirement}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[var(--color-text-muted)]">
                          {item.mustHave ? (
                            <ShieldCheck className="h-3 w-3 text-[var(--color-primary)]" />
                          ) : null}
                          w{item.weight}
                        </span>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {lang === "ar"
                      ? "أضف المتطلبات واضغط اعتماد للانتقال لرفع السيرة."
                      : "Add the requirements and confirm them to move to the upload step."}
                  </p>
                )}
                <div className="flex justify-end">
                  <button
                    onClick={() => goToStep(3)}
                    disabled={!reqs.length}
                    className="inline-flex items-center gap-2 rounded-full border border-[var(--color-primary)]/50 bg-[var(--surface)] px-5 py-2 text-sm font-semibold text-[var(--color-primary)] disabled:opacity-40"
                  >
                    {lang === "ar" ? "التالي: رفع السيرة" : "Next: upload CV"}
                    <ArrowUpRight className="h-4 w-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* Step 3: Upload & Run */}
            {activeStep === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.25 }}
                className="rounded-[28px] border border-[var(--color-border)] bg-[var(--surface)]/95 p-6 shadow-sm space-y-5"
              >
                <label className="flex items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--surface-soft)]/70 px-4 py-4 text-sm font-medium text-[var(--foreground)]">
                  <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-[var(--color-primary)]/12 text-[var(--color-primary)]">
                    <Paperclip className="h-5 w-5" />
                  </span>
                  <div className="flex-1">
                    <div>
                      {lang === "ar"
                        ? "اسحب أو اختر ملف السيرة الذاتية"
                        : "Drag or choose the CV file"}
                    </div>
                    <div className="text-xs text-[var(--color-text-muted)]">
                      {fileLabel
                        ? fileLabel
                        : lang === "ar"
                          ? "يدعم PDF و DOCX بحد أقصى 20 ميغابايت"
                          : "Supports PDF or DOCX up to 20 MB"}
                    </div>
                  </div>
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx"
                    onChange={onPickFile}
                    className="hidden"
                  />
                </label>

                {loading && (
                  <div className="flex items-center gap-3 rounded-2xl border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/8 px-4 py-3">
                    <div className="relative h-12 w-12">
                      <div className="absolute inset-0 rounded-full border-2 border-[var(--color-primary)]/40" />
                      <div className="absolute inset-1 rounded-full border-2 border-dashed border-[var(--color-primary)] animate-spin" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-[var(--color-primary)]">
                        {lang === "ar"
                          ? "جارٍ تحليل السيرة الذاتية..."
                          : "Analyzing the CV..."}
                      </div>
                      <div className="text-xs text-[var(--color-text-muted)]">
                        {lang === "ar"
                          ? "نقارن المتطلبات بالذكاء الدلالي والنتائج ستظهر بعد لحظات."
                          : "Matching the requirements with semantic embeddings. Results in seconds."}
                      </div>
                    </div>
                  </div>
                )}

                {cvInfo && (
                  <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--surface)]/90 px-4 py-3 text-xs text-[var(--color-text-muted)]">
                    {lang === "ar"
                      ? `تم الرفع بنجاح • طول النص المستخرج ${cvInfo.textLength ?? 0} حرف`
                      : `Upload complete • extracted text ${cvInfo.textLength ?? 0} characters`}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-[var(--color-text-muted)]">
                    {lang === "ar"
                      ? "تأكد من اعتماد المتطلبات قبل تشغيل التحليل السريع."
                      : "Confirm the requirements before running the quick analysis."}
                  </div>
                  <button
                    onClick={run}
                    disabled={!cvFile || !reqs.length || loading}
                    className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[var(--color-primary)] via-[#ff8b2e] to-[var(--color-accent)] px-5 py-2 text-sm font-semibold text-white shadow-lg disabled:opacity-50"
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                    {lang === "ar" ? "تحليل سريع" : "Quick analysis"}
                  </button>
                </div>
              </motion.div>
            )}

            {/* Step 4: Results */}
            {activeStep === 4 && result && (
              <motion.div
                key="step4"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.25 }}
                className="rounded-[28px] border border-[var(--color-border)] bg-[var(--surface)]/95 p-6 shadow-sm space-y-5"
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-2">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.35em] text-[var(--color-primary)]">
                      {tt("chat.summaryTitle")}
                    </div>
                    <h3 className="text-xl font-semibold text-[var(--foreground)]">
                      {jobInfo?.title ||
                        (lang === "ar"
                          ? "تحليل بدون عنوان"
                          : "Untitled analysis")}
                    </h3>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {lang === "ar"
                        ? `ملف: ${fileLabel || "—"}`
                        : `File: ${fileLabel || "—"}`}
                    </p>
                    {cvInfo?.publicUrl && (
                      <a
                        href={cvInfo.publicUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--color-secondary)] hover:text-[var(--color-primary)]"
                      >
                        <FileText className="h-4 w-4" />
                        {lang === "ar" ? "افتح السيرة" : "Open CV"}
                      </a>
                    )}
                  </div>
                  {canExport && (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={exportBreakdownAsPdf}
                        className="inline-flex items-center gap-2 rounded-full border border-[var(--color-primary)]/40 bg-[var(--surface)] px-4 py-2 text-xs font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10"
                      >
                        <FileDown className="h-4 w-4" /> {tt("chat.exportPdf")}
                      </button>
                      <button
                        onClick={exportBreakdownAsCsv}
                        className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] px-4 py-2 text-xs font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
                      >
                        <Download className="h-4 w-4" /> {tt("chat.exportCsv")}
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
                  <div className="rounded-2xl bg-[var(--surface-soft)]/70 p-4 text-center">
                    <ScoreGauge value={Number(result.score || 0)} />
                    <div className="mt-2 text-xs text-[var(--color-text-muted)]">
                      {lang === "ar" ? "درجة المطابقة" : "Alignment score"}
                    </div>
                  </div>
                  <div className="space-y-3">
                    {metrics && (
                      <div className="grid gap-2 text-xs text-[var(--color-text-muted)]">
                        <div className="flex items-center justify-between">
                          <span>
                            {lang === "ar" ? "متطلبات أساسية" : "Must-have"}
                          </span>
                          <span className="font-semibold text-[var(--foreground)]">
                            {formatPercent(metrics.mustPercent)}
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-[var(--surface-soft)]">
                          <div
                            className="h-full rounded-full bg-[var(--color-primary)]"
                            style={{
                              width: `${Math.min(100, Math.max(0, metrics.mustPercent))}%`,
                            }}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <span>
                            {lang === "ar" ? "مهارات إضافية" : "Nice-to-have"}
                          </span>
                          <span className="font-semibold text-[var(--foreground)]">
                            {formatPercent(metrics.nicePercent)}
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-[var(--surface-soft)]">
                          <div
                            className="h-full rounded-full bg-[var(--color-secondary)]"
                            style={{
                              width: `${Math.min(100, Math.max(0, metrics.nicePercent))}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}
                    {riskMessages.length > 0 && (
                      <div className="flex الفlex-wrap gap-2 text-[11px] text-[#b42318]">
                        {riskMessages.map((msg) => (
                          <span
                            key={msg}
                            className="inline-flex items-center gap-2 bg-[#fee4e2] rounded-full px-3 py-1"
                          >
                            <AlertTriangle className="h-3.5 w-3.5" /> {msg}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {Array.isArray(result.breakdown) &&
                  result.breakdown.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-sm font-semibold text-[var(--color-text-muted)]">
                        {lang === "ar"
                          ? "تفصيل المتطلبات"
                          : "Requirement breakdown"}
                      </div>
                      <div className="max-h-64 space-y-2 overflow-auto pr-1 text-xs">
                        {result.breakdown.map((item, idx) => (
                          <div
                            key={`bd-${idx}`}
                            className="rounded-xl border border-[var(--color-border)] bg-[var(--surface-soft)]/60 px-3 py-2"
                          >
                            <div className="flex items-center justify-between text-sm font-medium text-[var(--foreground)]">
                              <span>{item.requirement}</span>
                              <span className="text-[11px] text-[var(--color-text-muted)]">
                                w{item.weight}
                              </span>
                            </div>
                            <div className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                              {lang === "ar" ? "مطابقة" : "Match"}:{" "}
                              {(item.similarity * 100).toFixed(1)}% •{" "}
                              {lang === "ar" ? "درجة" : "Score"}:{" "}
                              {Number(item.score10 || 0).toFixed(1)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right side: sidebar */}
        <aside className="space-y-6">
          <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--surface)]/95 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[var(--foreground)]">
                {lang === "ar" ? "مؤشرات التقدم" : "Progress"}
              </span>
              <Sparkles className="h-4 w-4 text-[var(--color-primary)]" />
            </div>
            {metrics ? (
              <dl className="mt-3 space-y-2 text-xs text-[var(--color-text-muted)]">
                <div className="flex items-center justify-between">
                  <dt>{lang === "ar" ? "متطلبات Must" : "Must coverage"}</dt>
                  <dd className="font-semibold text-[var(--foreground)]">
                    {formatPercent(metrics.mustPercent)}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt>{lang === "ar" ? "متطلبات إضافية" : "Nice coverage"}</dt>
                  <dd className="font-semibold text-[var(--foreground)]">
                    {formatPercent(metrics.nicePercent)}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt>{lang === "ar" ? "النقاط المرجحة" : "Weighted score"}</dt>
                  <dd className="font-semibold text-[var(--foreground)]">
                    {Number(metrics.weightedScore).toFixed(1)}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="mt-3 text-xs text-[var(--color-text-muted)]">
                {lang === "ar"
                  ? "أدخل المتطلبات وارفع السيرة لعرض مؤشرات المطابقة."
                  : "Add requirements and upload a CV to see the alignment metrics."}
              </p>
            )}
          </div>

          <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--surface)]/95 p-5 shadow-sm">
            <div className="text-sm font-semibold text-[var(--foreground)]">
              {lang === "ar" ? "المتطلبات الحالية" : "Current requirements"}
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--color-text-muted)]">
              {reqs.length ? (
                reqs.map((item, idx) => (
                  <span
                    key={`side-req-${idx}`}
                    className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--surface-soft)]/60 px-3 py-1"
                  >
                    <span className="font-medium text-[var(--foreground)]">
                      {item.requirement}
                    </span>
                    <span>
                      {item.mustHave
                        ? lang === "ar"
                          ? "أساسي"
                          : "Must"
                        : lang === "ar"
                          ? "اختياري"
                          : "Nice"}
                    </span>
                  </span>
                ))
              ) : (
                <span>
                  {lang === "ar"
                    ? "أضف المتطلبات من الخطوة الثانية."
                    : "Add requirements in step two."}
                </span>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--surface)]/95 p-5 shadow-sm">
            <div className="text-sm font-semibold text-[var(--foreground)]">
              {lang === "ar" ? "سجل النشاط" : "Activity log"}
            </div>
            <div
              ref={listRef}
              className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1"
            >
              <AnimatePresence initial={false}>
                {messages.map((m) => (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className={clsx(
                      "rounded-2xl border px-3 py-2 text-xs",
                      m.role === "user"
                        ? "border-[var(--color-primary)]/50 bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                        : m.role === "sys"
                          ? "border-[var(--color-secondary)]/40 bg-[var(--color-secondary)]/10 text-[var(--color-secondary)]"
                          : "border-[var(--color-border)] bg-[var(--surface-soft)]/70 text-[var(--color-text-muted)]"
                    )}
                  >
                    {m.content}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
