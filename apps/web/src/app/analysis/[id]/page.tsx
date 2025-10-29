// apps/web/src/app/analysis/[id]/page.tsx
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Check,
  ClipboardCopy,
  Loader2,
  Sparkles,
  Target,
  Trophy,
  Wand2,
} from "lucide-react";

import ScoreGauge from "@/components/ui/ScoreGauge";
import {
  analysesApi,
  type Analysis,
  type AnalysisMetrics,
} from "@/services/api/analyses";
import { jobsApi, type Job } from "@/services/api/jobs";
import {
  assistantApi,
  type ExtractedJobFields,
  type ExperienceExtract,
} from "@/services/api/assistant";
import { Button } from "@/components/ui/Button";
import { t } from "@/lib/i18n";
import { useLang } from "@/lib/use-lang";

const clampText = (value: string, max = 220) => {
  if (!value) return "";
  return value.length > max ? `${value.slice(0, max)}…` : value;
};

const parseBulletLines = (text: string): string[] =>
  text
    .split(/\r?\n/)
    .map((line) => line.replace(/^[\s•\-–\d.]+/, "").trim())
    .filter(Boolean)
    .slice(0, 8);

const LANGUAGE_HINTS: Array<{ label: string; patterns: RegExp[] }> = [
  {
    label: "العربية",
    patterns: [/\bArabic\b/i, /\bArabic language\b/i, /\bالعربية\b/, /\bعربي\b/],
  },
  {
    label: "الإنجليزية",
    patterns: [/\bEnglish\b/i, /\bالإنجليزية\b/, /\bانجليزي\b/],
  },
  {
    label: "الفرنسية",
    patterns: [/\bFrench\b/i, /\bالفرنسية\b/, /\bفرنسي\b/],
  },
  {
    label: "الألمانية",
    patterns: [/\bGerman\b/i, /\bالألمانية\b/, /\bألماني\b/],
  },
  {
    label: "الإسبانية",
    patterns: [/\bSpanish\b/i, /\bالإسبانية\b/, /\bإسباني\b/],
  },
];

const detectLanguages = (text: string | null | undefined): string[] => {
  if (!text) return [];
  const normalized = text
    .replace(/[\u064B-\u065F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return [];
  const results = new Set<string>();
  for (const hint of LANGUAGE_HINTS) {
    if (hint.patterns.some((re) => re.test(normalized))) {
      results.add(hint.label);
    }
  }
  return Array.from(results);
};

const riskCopy: Record<string, { ar: string; en: string }> = {
  must_threshold: {
    ar: "متطلبات الـmust أقل من الحد المطلوب.",
    en: "Must-have requirements are below the acceptance threshold.",
  },
  low_total: {
    ar: "النتيجة الإجمالية منخفضة مقارنة ببقية المتطلبات.",
    en: "Overall score is low compared to expectations.",
  },
  no_requirements: {
    ar: "لا توجد متطلبات كافية لتحليلها.",
    en: "No requirements were provided to analyse.",
  },
  no_text: {
    ar: "لم يتم استخراج نص من السيرة الذاتية المرفوعة.",
    en: "No text could be extracted from the uploaded CV.",
  },
};

const toPercent = (value: number | null | undefined) => {
  const safe = Number.isFinite(value ?? NaN) ? Number(value) : 0;
  return `${Math.max(0, Math.min(100, safe)).toFixed(1)}%`;
};

const toScore10 = (value: number | null | undefined) => {
  const raw = Number(value ?? 0);
  if (!Number.isFinite(raw)) return 0;
  return raw > 10 ? raw / 10 : raw;
};

const formatScore10 = (value: number | null | undefined) => toScore10(value).toFixed(2);

const formatDate = (value: string | null | undefined, lang: string) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(lang === "ar" ? "ar" : "en", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  } catch {
    return date.toISOString();
  }
};

const motionCardProps = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, ease: "easeOut" },
};

const getErrorMessage = (err: unknown, fallback: string) => {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err.trim().length) return err;
  if (typeof err === "object" && err && "message" in err) {
    const value = (err as { message?: unknown }).message;
    if (typeof value === "string" && value.trim().length) return value;
  }
  return fallback;
};

const AnimatedLoader = ({ label }: { label: string }) => (
  <div className="flex items-center gap-2 text-xs text-[#2F3A4A]/70 dark:text-white/70">
    <span className="flex items-center gap-1">
      <span className="inline-flex gap-1">
        {[0, 1, 2].map((idx) => (
          <motion.span
            key={idx}
            className="block h-1.5 w-1.5 rounded-full bg-[#FF7A00] dark:bg-[#FFB26B]"
            animate={{ opacity: [0.3, 1, 0.3], y: [-1, 1, -1] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: idx * 0.2 }}
          />
        ))}
      </span>
      <Loader2 className="h-3 w-3 animate-spin text-[#FF7A00] dark:text-[#FFB26B]" />
    </span>
    {label}
  </div>
);

const bubbleVariants = {
  initial: { opacity: 0, y: 14, scale: 0.96 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -6, scale: 0.98 },
};

export default function ResultDetail() {
  const params = useParams<{ id: string }>();
  const lang = useLang();
  const tt = useMemo(() => (key: string) => t(lang, key), [lang]);

  const jobCopy = useMemo(
    () =>
      lang === "ar"
        ? {
            heading: "تفاصيل الوظيفة",
            summaryFallback: "لا يوجد ملخص مختصر للوصف.",
            level: "المستوى",
            experience: "الخبرة المطلوبة",
            contract: "نوع العقد",
            location: "الموقع",
            languages: "اللغات المطلوبة",
            languagesLoading: "جارٍ تحليل اللغات...",
            languagesFallback: "لم تُذكر لغات صريحة في الوصف.",
            aiTitle: "ملخص سريع بالذكاء الاصطناعي",
            aiButton: "ولّد النقاط",
            aiRegenerate: "إعادة التوليد",
            aiCopy: "نسخ",
            aiLoading: "جارٍ التوليد...",
            aiEmpty: "اضغط الزر لتوليد ثلاث نقاط مختصرة عن الدور.",
            jobLoading: "جارٍ تحميل تفاصيل الوظيفة...",
            jobError: "تعذّر تحميل تفاصيل الوظيفة.",
            aiErrorPrefix: "تعذّر التوليد: ",
            coachTitle: "مساعد التحسين",
            coachButton: "حلّل السيرة",
            coachRegenerate: "تحليل جديد",
            coachCopy: "انسخ",
            coachEmpty: "اضغط للحصول على تحسينات ذكية بناءً على هذه السيرة.",
            coachLoading: "نحلّل السيرة...",
            coachError: "تعذّر توليد التحسينات.",
            relatedTitle: "مقارنة التحليلات",
            relatedEmpty: "لم يتم تشغيل تحليلات أخرى لهذه الوظيفة بعد.",
          }
        : {
            heading: "Job overview",
            summaryFallback: "No short summary was extracted.",
            level: "Level",
            experience: "Required experience",
            contract: "Contract",
            location: "Location",
            languages: "Languages",
            languagesLoading: "Detecting languages...",
            languagesFallback: "No explicit languages were mentioned in the brief.",
            aiTitle: "AI quick highlights",
            aiButton: "Generate",
            aiRegenerate: "Regenerate",
            aiCopy: "Copy",
            aiLoading: "Generating...",
            aiEmpty: "Tap the button to receive three laser-focused bullets.",
            jobLoading: "Loading job details...",
            jobError: "Failed to load job details.",
            aiErrorPrefix: "Could not generate: ",
            coachTitle: "AI coach",
            coachButton: "Analyse CV",
            coachRegenerate: "Regenerate",
            coachCopy: "Copy",
            coachEmpty: "Launch the coach to receive actionable improvements for this CV.",
            coachLoading: "Thinking through the CV...",
            coachError: "Could not fetch improvement tips.",
            relatedTitle: "Comparison",
            relatedEmpty: "No other analyses exist for this job yet.",
          },
    [lang],
  );

  const [data, setData] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [job, setJob] = useState<Job | null>(null);
  const [jobLoading, setJobLoading] = useState(false);
  const [jobError, setJobError] = useState<string | null>(null);
  const [jobFields, setJobFields] = useState<ExtractedJobFields | null>(null);
  const [jobFieldsLoading, setJobFieldsLoading] = useState(false);
  const [jobFieldsError, setJobFieldsError] = useState<string | null>(null);
  const [aiLanguages, setAiLanguages] = useState<string[]>([]);
  const [aiLanguagesLoading, setAiLanguagesLoading] = useState(false);
  const [aiLanguagesError, setAiLanguagesError] = useState<string | null>(null);
  const [aiExperience, setAiExperience] = useState<ExperienceExtract | null>(null);
  const [aiExperienceLoading, setAiExperienceLoading] = useState(false);
  const [aiExperienceError, setAiExperienceError] = useState<string | null>(null);
  const [quickSummary, setQuickSummary] = useState<string[]>([]);
  const [quickError, setQuickError] = useState<string | null>(null);
  const [quickLoading, setQuickLoading] = useState(false);
  const [quickCopied, setQuickCopied] = useState(false);

  const [relatedAnalyses, setRelatedAnalyses] = useState<Analysis[]>([]);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [relatedError, setRelatedError] = useState<string | null>(null);

  const [coach, setCoach] = useState<{ summary: string; suggestions: string[] } | null>(null);
  const [coachError, setCoachError] = useState<string | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachCopied, setCoachCopied] = useState(false);

  const relatedList = useMemo(() => {
    if (!relatedAnalyses.length) return [];
    return relatedAnalyses
      .filter((item) => item.id && item.id !== (data?.id ?? ""))
      .sort(
        (a, b) => (Number(b.score ?? 0) || 0) - (Number(a.score ?? 0) || 0),
      )
      .slice(0, 4);
  }, [data?.id, relatedAnalyses]);

  const fallbackLanguages = useMemo(() => {
    const chunks = [job?.description ?? "", jobFields?.notes ?? ""].filter(Boolean);
    if (!chunks.length) return [] as string[];
    return detectLanguages(chunks.join("\n"));
  }, [job?.description, jobFields?.notes]);

  const displayLanguages = useMemo(() => {
    const sourceMap = new Map<string, { source: string }>();
    (jobFields?.languages ?? []).forEach((langItem) => {
      const label = (langItem || "").trim();
      if (!label) return;
      sourceMap.set(label, { source: "structured" });
    });
    aiLanguages.forEach((langItem) => {
      const label = (langItem || "").trim();
      if (!label) return;
      if (!sourceMap.has(label)) sourceMap.set(label, { source: "assistant" });
    });
    fallbackLanguages.forEach((langItem) => {
      const label = (langItem || "").trim();
      if (!label) return;
      if (!sourceMap.has(label)) sourceMap.set(label, { source: "detected" });
    });
    return Array.from(sourceMap.entries()).map(([label, payload]) => ({
      label,
      source: payload.source,
    }));
  }, [aiLanguages, fallbackLanguages, jobFields?.languages]);

  const languageSourceCopy = useMemo(
    () => ({
      structured: lang === "ar" ? "من الحقول" : "JD",
      assistant: lang === "ar" ? "ذكاء" : "AI",
      detected: lang === "ar" ? "مكتشف" : "Detected",
    }),
    [lang],
  );

  useEffect(() => {
    if (!params?.id) return;
    setLoading(true);
    setError(null);
    analysesApi
      .get(params.id)
      .then((res) => setData(res))
      .catch((err: unknown) => {
        setError(getErrorMessage(err, "Failed to load analysis"));
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [params?.id]);

  useEffect(() => {
    if (!data?.jobId) return;
    let alive = true;
    setJob(null);
    setJobError(null);
    setJobFields(null);
    setQuickSummary([]);
    setQuickError(null);
    setJobLoading(true);
    jobsApi
      .get(data.jobId)
      .then((res) => {
        if (!alive) return;
        setJob(res);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setJobError(getErrorMessage(err, "failed to load job"));
      })
      .finally(() => {
        if (alive) setJobLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [data?.jobId]);

  useEffect(() => {
    if (!job?.description?.trim()) {
      setJobFields(null);
      setQuickSummary([]);
      setAiLanguages([]);
      setAiExperience(null);
      return;
    }
    let alive = true;
    setJobFieldsLoading(true);
    setJobFieldsError(null);
    assistantApi
      .extractFields(job.description)
      .then((res) => {
        if (!alive) return;
        setJobFields(res);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setJobFieldsError(getErrorMessage(err, "failed to analyse job"));
        setJobFields(null);
      })
      .finally(() => {
        if (alive) setJobFieldsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [job?.id, job?.description]);

  useEffect(() => {
    if (!job?.description?.trim()) return;
    if (jobFieldsLoading) return;
    if (jobFields?.languages?.length) return;
    let alive = true;
    setAiLanguagesLoading(true);
    setAiLanguagesError(null);
    assistantApi
      .languages(job.description)
      .then((res) => {
        if (!alive) return;
        setAiLanguages(Array.isArray(res.languages) ? res.languages : []);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setAiLanguagesError(
          getErrorMessage(err, "failed to detect languages"),
        );
        setAiLanguages([]);
      })
      .finally(() => {
        if (alive) setAiLanguagesLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [job?.description, jobFields?.languages?.length, jobFieldsLoading]);

  useEffect(() => {
    if (!job?.description?.trim()) return;
    if (jobFieldsLoading) return;
    if (jobFields?.required_experience_years?.trim()) return;
    let alive = true;
    setAiExperienceLoading(true);
    setAiExperienceError(null);
    assistantApi
      .experience(job.description)
      .then((res) => {
        if (!alive) return;
        setAiExperience(res);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setAiExperienceError(
          getErrorMessage(err, "failed to extract experience"),
        );
        setAiExperience(null);
      })
      .finally(() => {
        if (alive) setAiExperienceLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [job?.description, jobFields?.required_experience_years, jobFieldsLoading]);

  useEffect(() => {
    if (!data?.jobId) return;
    let alive = true;
    setRelatedLoading(true);
    setRelatedError(null);
    analysesApi
      .byJob(data.jobId)
      .then((res) => {
        if (!alive) return;
        setRelatedAnalyses(res);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setRelatedError(
          getErrorMessage(err, "failed to load related analyses"),
        );
        setRelatedAnalyses([]);
      })
      .finally(() => {
        if (alive) setRelatedLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [data?.jobId]);

  const handleQuickSummary = useCallback(async () => {
    if (!job?.description?.trim()) return;
    setQuickLoading(true);
    setQuickError(null);
    try {
      const res = await assistantApi.quickSuggestions("ملخص", job.description);
      setQuickSummary(parseBulletLines(res.output));
    } catch (err: unknown) {
      setQuickError(getErrorMessage(err, "failed to generate"));
      setQuickSummary([]);
    } finally {
      setQuickLoading(false);
    }
  }, [job?.description]);

  const handleQuickCopy = useCallback(() => {
    if (!quickSummary.length) return;
    const text = quickSummary.join("\n");
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        setQuickCopied(true);
        window.setTimeout(() => setQuickCopied(false), 1600);
      });
    }
  }, [quickSummary]);

  const handleCoach = useCallback(async () => {
    if (!data?.jobId || !data?.cvId) return;
    setCoachLoading(true);
    setCoachError(null);
    try {
      const res = await analysesApi.improve({
        jobId: data.jobId,
        cvId: data.cvId,
        lang: lang === "en" ? "en" : "ar",
      });
      setCoach({ summary: res.summary, suggestions: res.suggestions });
    } catch (err: unknown) {
      setCoachError(getErrorMessage(err, jobCopy.coachError));
      setCoach(null);
    } finally {
      setCoachLoading(false);
    }
  }, [data?.cvId, data?.jobId, jobCopy.coachError, lang]);

  const handleCoachCopy = useCallback(() => {
    if (!coach) return;
    const parts = [coach.summary, ...coach.suggestions];
    const text = parts.filter(Boolean).join("\n• ");
    if (!text.trim()) return;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        setCoachCopied(true);
        window.setTimeout(() => setCoachCopied(false), 1600);
      });
    }
  }, [coach]);

  if (loading) {
    return (
      <div className="mx-auto flex max-w-4xl items-center justify-center py-16 text-sm text-[#2F3A4A]/70 dark:text-white/70">
        <Loader2 className="me-2 h-4 w-4 animate-spin" /> {tt("analysisPage.loading")}
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-4xl rounded-3xl border border-red-200 bg-red-50/70 p-6 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-4xl rounded-3xl border border-[var(--color-border)] bg-[var(--surface)]/90 p-8 text-center text-sm text-[var(--color-text-muted)]">
        {tt("analysisPage.notFound")}
      </div>
    );
  }

  const metrics: AnalysisMetrics | null = data.metrics ?? null;
  const gaps = data.gaps ?? null;
  const missingMust =
    metrics?.missingMust?.length
      ? metrics.missingMust
      : gaps?.mustHaveMissing ?? [];
  const improvement =
    metrics?.improvement?.length
      ? metrics.improvement
      : gaps?.improve ?? [];
  const strengths = metrics?.topStrengths ?? [];
  const risks = metrics?.riskFlags ?? [];
  const evidence = data.evidence?.slice(0, 4) ?? [];
  const generatedAt = formatDate(metrics?.generatedAt ?? data.updatedAt, lang);
  const scoreRaw = data.score ?? metrics?.weightedScore ?? 0;
  const scoreValue = toScore10(scoreRaw);
  const scoreLabel = formatScore10(scoreRaw);
  const combinedExperience =
    jobFields?.required_experience_years?.trim() ||
    aiExperience?.required_experience_years?.trim() ||
    "";
  const experienceDetail =
    jobFields?.notes?.trim() || aiExperience?.experience_detail?.trim() || "";
  const languagesLoading =
    jobFieldsLoading ||
    (!jobFields?.languages?.length && aiLanguagesLoading);
  const languagesError =
    jobFields?.languages?.length
      ? null
      : jobFieldsError || aiLanguagesError;
  const experienceLoading =
    jobFieldsLoading ||
    (!jobFields?.required_experience_years?.trim() && aiExperienceLoading);
  const experienceError =
    jobFields?.required_experience_years?.trim()
      ? null
      : jobFieldsError || aiExperienceError;
  const experienceLoadingLabel =
    lang === "ar" ? "جارٍ استخراج الخبرة..." : "Extracting experience...";

  return (
    <div className="mx-auto max-w-6xl space-y-10 py-8">
      <header className="flex flex-col gap-2 border-b border-[#ffdcc2]/70 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold text-[#D85E00]">
            {tt("analysisPage.title")}
          </h1>
          <p className="max-w-2xl text-sm text-[#2F3A4A]/70 dark:text-white/70">
            {tt("analysisPage.subtitle")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-[#2F3A4A]/60 dark:text-white/60">
          <span className="rounded-full border border-[#FFB26B]/50 px-3 py-1">
            ID • {params?.id?.slice(0, 12) ?? data.id}
          </span>
          {generatedAt ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-[#FFB26B]/50 px-3 py-1">
              <Sparkles className="h-3.5 w-3.5" /> {generatedAt}
            </span>
          ) : null}
        </div>
      </header>

      {jobLoading ? (
        <motion.section
          className="rounded-3xl border border-[#FFE4C8] bg-white/80 p-6 shadow-sm dark:border-white/10 dark:bg-white/5"
          {...motionCardProps}
        >
          <AnimatedLoader label={jobCopy.jobLoading} />
        </motion.section>
      ) : jobError ? (
        <motion.section
          className="rounded-3xl border border-red-200 bg-red-50/80 p-6 text-sm text-red-700"
          {...motionCardProps}
        >
          {jobError}
        </motion.section>
      ) : job ? (
        <motion.section
          className="grid gap-6 rounded-3xl border border-[#FFE4C8] bg-gradient-to-br from-white via-white/95 to-[#FFF1E3] p-6 shadow-[0_20px_60px_-35px_rgba(255,122,0,0.45)] dark:from-[#2A1F1C] dark:via-[#2A1F1C]/95 dark:to-[#1A1513] dark:border-white/10"
          {...motionCardProps}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-[0.3em] text-[#B54708] dark:text-[#FFB26B]">
                {jobCopy.heading}
              </div>
              <h2 className="text-2xl font-semibold text-[#D85E00] dark:text-white">
                {jobFields?.title?.trim() || job.title}
              </h2>
              <p className="max-w-3xl text-sm text-[#2F3A4A]/70 dark:text-white/70">
                {clampText(jobFields?.summary || job.description, 320) ||
                  jobCopy.summaryFallback}
              </p>
            </div>
            <div className="flex flex-col gap-2 text-xs text-[#2F3A4A]/60 dark:text-white/60">
              <span className="inline-flex items-center gap-1 rounded-full bg-[#FFF2E8] px-3 py-1 font-semibold text-[#D85E00] shadow-sm dark:bg-white/10 dark:text-white/80">
                <Target className="h-3.5 w-3.5" /> {jobCopy.level}: {jobFields?.level || "—"}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-[#FFF2E8] px-3 py-1 font-semibold text-[#D85E00] shadow-sm dark:bg-white/10 dark:text-white/80">
                <Activity className="h-3.5 w-3.5" /> {jobCopy.contract}: {(jobFields?.contract_types || []).join("، ") || "—"}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-[#FFF2E8] px-3 py-1 font-semibold text-[#D85E00] shadow-sm dark:bg-white/10 dark:text-white/80">
                <ArrowUpRight className="h-3.5 w-3.5" /> {jobCopy.location}: {jobFields?.location?.trim() || "—"}
              </span>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-[#FFE4C8] bg-white/70 px-4 py-3 text-sm dark:border-white/10 dark:bg-white/5">
              <div className="text-[11px] uppercase tracking-[0.3em] text-[#2F3A4A]/60 dark:text-white/60">
                {jobCopy.experience}
              </div>
              {experienceLoading ? (
                <div className="mt-2">
                  <AnimatedLoader label={experienceLoadingLabel} />
                </div>
              ) : experienceError ? (
                <div className="mt-2 text-xs text-red-600">{experienceError}</div>
              ) : (
                <div className="mt-1 space-y-1 text-[#D85E00] dark:text-white">
                  <div className="text-base font-semibold">
                    {combinedExperience || "—"}
                  </div>
                  {experienceDetail ? (
                    <div className="text-xs text-[#B54708] dark:text-[#FFB26B]">
                      {experienceDetail}
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-[#FFE4C8] bg-white/70 px-4 py-3 text-sm dark:border-white/10 dark:bg-white/5">
              <div className="text-[11px] uppercase tracking-[0.3em] text-[#2F3A4A]/60 dark:text-white/60">
                {jobCopy.languages}
              </div>
              {languagesLoading ? (
                <div className="mt-2">
                  <AnimatedLoader label={jobCopy.languagesLoading} />
                </div>
              ) : languagesError ? (
                <div className="mt-2 text-xs text-red-600">{languagesError}</div>
              ) : displayLanguages.length ? (
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  {displayLanguages.map(({ label, source }) => (
                    <span
                      key={`${label}-${source}`}
                      className="inline-flex items-center gap-1 rounded-full bg-[#FFF2E8] px-3 py-1 font-semibold text-[#D85E00] shadow-sm dark:bg-white/10 dark:text-white/80"
                    >
                      {label}
                      <span className="text-[10px] font-normal uppercase tracking-wide text-[#B54708]">
                        {languageSourceCopy[source as keyof typeof languageSourceCopy] ?? "AI"}
                      </span>
                    </span>
                  ))}
                </div>
              ) : (
                <div className="mt-2 text-xs text-[#2F3A4A]/60 dark:text-white/60">
                  {jobCopy.languagesFallback}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-[#FFE4C8] bg-white/70 px-4 py-3 text-sm dark:border-white/10 dark:bg-white/5">
              <div className="text-[11px] uppercase tracking-[0.3em] text-[#2F3A4A]/60 dark:text-white/60">
                Must-have
              </div>
              <div className="mt-2 flex flex-wrap gap-1 text-xs text-[#B54708] dark:text-[#FFB26B]">
                {(jobFields?.must_have?.length ?? 0) > 0 ? (
                  (jobFields?.must_have ?? []).slice(0, 6).map((item) => (
                    <span
                      key={item}
                      className="rounded-full bg-[#FFF2E8] px-3 py-1 font-semibold shadow-sm dark:bg-white/10"
                    >
                      {item}
                    </span>
                  ))
                ) : (
                  <span className="rounded-full border border-dashed border-[#FFD7B3] px-3 py-1 text-[#2F3A4A]/50 dark:border-white/10 dark:text-white/50">
                    —
                  </span>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-[#FFE4C8] bg-white/70 px-4 py-3 text-sm dark:border-white/10 dark:bg-white/5">
              <div className="text-[11px] uppercase tracking-[0.3em] text-[#2F3A4A]/60 dark:text-white/60">
                Nice-to-have
              </div>
              <div className="mt-2 flex flex-wrap gap-1 text-xs text-[#B54708] dark:text-[#FFB26B]">
                {(jobFields?.nice_to_have?.length ?? 0) > 0 ? (
                  (jobFields?.nice_to_have ?? []).slice(0, 6).map((item) => (
                    <span
                      key={item}
                      className="rounded-full bg-[#FFF2E8] px-3 py-1 font-semibold shadow-sm dark:bg-white/10"
                    >
                      {item}
                    </span>
                  ))
                ) : (
                  <span className="rounded-full border border-dashed border-[#FFD7B3] px-3 py-1 text-[#2F3A4A]/50 dark:border-white/10 dark:text-white/50">
                    —
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-[#FFD7B3]/70 bg-white/80 p-4 shadow-inner dark:border-white/10 dark:bg-white/5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#D85E00] dark:text-white">
                <Sparkles className="h-4 w-4" /> {jobCopy.aiTitle}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={handleQuickSummary}
                  disabled={quickLoading || !job?.description}
                  className="inline-flex items-center gap-2 rounded-full border-[#FFB26B]/60 bg-[#FFF2E8] px-4 py-2 text-xs font-semibold text-[#D85E00] transition-transform duration-200 hover:-translate-y-0.5 hover:bg-[#FFD4A8] disabled:opacity-60"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {quickLoading ? jobCopy.aiLoading : quickSummary.length ? jobCopy.aiRegenerate : jobCopy.aiButton}
                </Button>
                <Button
                  onClick={handleQuickCopy}
                  disabled={!quickSummary.length}
                  className="inline-flex items-center gap-2 rounded-full border border-transparent bg-[#FF7A00] px-4 py-2 text-xs font-semibold text-white shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#FF8E26] disabled:opacity-60"
                >
                  {quickCopied ? <Check className="h-3.5 w-3.5" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
                  {jobCopy.aiCopy}
                </Button>
              </div>
            </div>
            <div className="mt-3 text-xs text-[#2F3A4A]/70 dark:text-white/70">
              {quickLoading ? (
                <AnimatedLoader label={jobCopy.aiLoading} />
              ) : quickError ? (
                <div className="rounded-2xl border border-red-200 bg-red-50/70 px-3 py-2 text-red-700">
                  {jobCopy.aiErrorPrefix}
                  <span className="font-normal">{quickError}</span>
                </div>
              ) : quickSummary.length ? (
                <div className="space-y-2">
                  <AnimatePresence>
                    {quickSummary.map((item, idx) => (
                      <motion.div
                        key={`${item}-${idx}`}
                        variants={bubbleVariants}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        transition={{ duration: 0.25, delay: idx * 0.05 }}
                        className="relative rounded-2xl bg-white/90 px-4 py-3 text-[#B54708] shadow-sm before:absolute before:-bottom-2 before:end-6 before:h-3 before:w-3 before:rounded-br-2xl before:border-b before:border-r before:border-[#FFD7B3] before:bg-white/90 dark:bg-[#2A1F1C]/80 dark:text-[#FFB26B]"
                      >
                        • {item}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              ) : (
                <div className="text-[#2F3A4A]/60 dark:text-white/60">{jobCopy.aiEmpty}</div>
              )}
            </div>
          </div>
        </motion.section>
      ) : null}

      <motion.section
        className="grid gap-6 rounded-3xl border border-[#FFD7B3]/70 bg-gradient-to-br from-white via-white/90 to-[#FFE9D2] p-6 shadow-[0_25px_80px_-40px_rgba(255,122,0,0.5)] dark:from-[#241915] dark:via-[#241915]/95 dark:to-[#1a1412] dark:border-white/10 lg:grid-cols-[260px_1fr]"
        {...motionCardProps}
      >
        <div className="flex flex-col items-center justify-center gap-4 rounded-3xl bg-gradient-to-br from-[#FF7A00] via-[#FF9440] to-[#A259FF] px-6 py-8 text-white shadow-lg">
          <ScoreGauge value={scoreValue} />
          <div className="mt-4 text-sm font-medium">
            {tt("analysisPage.scoreLabel")} {scoreLabel} / 10
          </div>
          <div className="mt-1 text-[11px] text-white/80">
            {tt("analysisPage.status")} {data.status}
          </div>
          <div className="grid w-full gap-2 text-xs text-white/80">
            <span className="inline-flex items-center justify-between gap-2 rounded-full bg-white/10 px-3 py-1">
              <span>{tt("chat.mustPercent")}</span>
              <span className="font-semibold">{toPercent(metrics?.mustPercent)}</span>
            </span>
            <span className="inline-flex items-center justify-between gap-2 rounded-full bg-white/10 px-3 py-1">
              <span>{tt("chat.nicePercent")}</span>
              <span className="font-semibold">{toPercent(metrics?.nicePercent)}</span>
            </span>
            <span className="inline-flex items-center justify-between gap-2 rounded-full bg-white/10 px-3 py-1">
              <span>{tt("chat.totalRequirements")}</span>
              <span className="font-semibold">{metrics?.totalRequirements ?? data.breakdown.length}</span>
            </span>
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-3xl border border-white/40 bg-white/85 p-4 shadow-inner dark:border-white/5 dark:bg-white/5">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#D85E00] dark:text-[#FFB26B]">
              <Wand2 className="h-4 w-4" /> {tt("analysisPage.status")}
            </div>
            <div className="mt-3 grid gap-3 text-xs text-[#2F3A4A]/70 dark:text-white/70 sm:grid-cols-2">
              {data.model ? (
                <span className="inline-flex items-center gap-2 rounded-2xl bg-[#FFF2E8] px-3 py-2 font-semibold text-[#B54708] dark:bg-white/10 dark:text-[#FFB26B]">
                  <Sparkles className="h-3.5 w-3.5" /> {tt("analysisPage.model")}: {data.model}
                </span>
              ) : null}
              <span className="inline-flex items-center gap-2 rounded-2xl bg-[#FFF2E8] px-3 py-2 font-semibold text-[#B54708] dark:bg-white/10 dark:text-[#FFB26B]">
                <Trophy className="h-3.5 w-3.5" /> {tt("analysisPage.status")}: {data.status}
              </span>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#D85E00] dark:text-[#FFB26B]">
              <Target className="h-4 w-4" /> {tt("analysisPage.breakdown")}
            </div>
            <div className="space-y-3">
              {data.breakdown?.length ? (
                data.breakdown.map((item, idx) => (
                  <motion.div
                    key={`${item.requirement}-${idx}`}
                    variants={bubbleVariants}
                    initial="initial"
                    animate="animate"
                    transition={{ duration: 0.25, delay: idx * 0.03 }}
                    className="relative overflow-hidden rounded-3xl border border-[#FFD7B3]/60 bg-white/85 p-4 shadow-sm before:absolute before:inset-y-0 before:start-0 before:w-1.5 before:bg-gradient-to-b before:from-[#FF7A00] before:to-[#FFB26B] dark:border-white/10 dark:bg-white/5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="text-xs font-semibold uppercase tracking-[0.25em] text-[#B54708] dark:text-[#FFB26B]">
                          {item.mustHave ? "MUST" : "NICE"}
                        </div>
                        <div className="text-sm font-semibold text-[#2F3A4A] dark:text-white">
                          {item.requirement}
                        </div>
                        {item.bestChunk?.excerpt ? (
                          <div className="text-xs text-[#2F3A4A]/60 dark:text-white/60">
                            “{clampText(item.bestChunk.excerpt, 180)}”
                          </div>
                        ) : null}
                      </div>
                      <div className="flex flex-col items-end gap-1 text-xs">
                        <span className="rounded-full bg-[#FFF2E8] px-3 py-1 font-semibold text-[#B54708] shadow-sm dark:bg-white/10 dark:text-[#FFB26B]">
                          {tt("analysisPage.similarity")}: {(item.similarity * 100).toFixed(0)}%
                        </span>
                        <span className="rounded-full bg-[#FFF2E8] px-3 py-1 font-semibold text-[#B54708] shadow-sm dark:bg-white/10 dark:text-[#FFB26B]">
                          {tt("analysisPage.scoreLabel")} {item.score10.toFixed(1)} / 10
                        </span>
                      </div>
                    </div>
                  </motion.div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-[#FFD7B3] bg-white/60 p-6 text-center text-xs text-[#2F3A4A]/60 dark:border-white/10 dark:bg-white/5 dark:text-white/60">
                  {tt("analysisPage.noBreakdown")}
                </div>
              )}
            </div>
          </div>

          {(strengths.length || improvement.length || missingMust.length || risks.length) ? (
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-3xl border border-[#FFD7B3]/70 bg-white/85 p-4 shadow-inner dark:border-white/10 dark:bg-white/5">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#2F3A4A] dark:text-white">
                  <Trophy className="h-4 w-4 text-[#FF7A00]" /> {tt("analysisPage.strengths")}
                </div>
                <ul className="mt-3 space-y-2 text-xs text-[#2F3A4A]/70 dark:text-white/70">
                  {strengths.length ? (
                    strengths.map((item, idx) => (
                      <li key={`${item.requirement}-${idx}`} className="rounded-2xl bg-[#FFF2E8] px-3 py-2 text-[#B54708] shadow-sm dark:bg-white/10 dark:text-[#FFB26B]">
                        {item.requirement}
                      </li>
                    ))
                  ) : (
                    <li className="rounded-2xl border border-dashed border-[#FFD7B3] px-3 py-2 text-[#2F3A4A]/50 dark:border-white/10 dark:text-white/50">
                      {tt("analysisPage.noStrengths")}
                    </li>
                  )}
                </ul>
              </div>

              <div className="rounded-3xl border border-[#FFD7B3]/70 bg-white/85 p-4 shadow-inner dark:border-white/10 dark:bg-white/5">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#2F3A4A] dark:text-white">
                  <Target className="h-4 w-4 text-[#FF7A00]" /> {tt("analysisPage.gaps")}
                </div>
                <div className="mt-3 space-y-3 text-xs text-[#2F3A4A]/70 dark:text-white/70">
                  <div className="space-y-2">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#B54708] dark:text-[#FFB26B]">
                      {tt("analysisPage.missing")}
                    </div>
                    {missingMust.length ? (
                      <ul className="space-y-2">
                        {missingMust.map((item, idx) => (
                          <li key={`${item}-${idx}`} className="rounded-2xl bg-[#FFE9D2] px-3 py-2 text-[#B54708] shadow-sm dark:bg-white/10 dark:text-[#FFB26B]">
                            {item}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-[#FFD7B3] px-3 py-2 text-[#2F3A4A]/50 dark:border-white/10 dark:text-white/50">
                        {tt("analysisPage.noGaps")}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#B54708] dark:text-[#FFB26B]">
                      {tt("analysisPage.improvements")}
                    </div>
                    {improvement.length ? (
                      <ul className="space-y-2">
                        {improvement.map((item, idx) => (
                          <li key={`${item}-${idx}`} className="rounded-2xl bg-[#FFF2E8] px-3 py-2 text-[#B54708] shadow-sm dark:bg-white/10 dark:text-[#FFB26B]">
                            {item}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-[#FFD7B3] px-3 py-2 text-[#2F3A4A]/50 dark:border-white/10 dark:text-white/50">
                        {tt("analysisPage.noImprovements")}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-[#FFD7B3]/70 bg-white/85 p-4 shadow-inner dark:border-white/10 dark:bg-white/5">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#2F3A4A] dark:text-white">
                  <AlertTriangle className="h-4 w-4 text-[#FF7A00]" /> {tt("analysisPage.risks")}
                </div>
                <ul className="mt-3 space-y-2 text-xs text-[#2F3A4A]/70 dark:text-white/70">
                  {risks.length ? (
                    risks.map((item) => (
                      <li key={item} className="rounded-2xl bg-[#FFE3D1] px-3 py-2 text-[#B54708] shadow-sm dark:bg-white/10 dark:text-[#FFB26B]">
                        {riskCopy[item]?.[lang] || item}
                      </li>
                    ))
                  ) : (
                    <li className="rounded-2xl border border-dashed border-[#FFD7B3] px-3 py-2 text-[#2F3A4A]/50 dark:border-white/10 dark:text-white/50">
                      {tt("analysisPage.noRisks")}
                    </li>
                  )}
                </ul>
              </div>
            </div>
          ) : null}

          {evidence.length ? (
            <div className="rounded-3xl border border-[#FFD7B3]/70 bg-white/85 p-4 shadow-inner dark:border-white/10 dark:bg-white/5">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#2F3A4A] dark:text-white">
                <Sparkles className="h-4 w-4 text-[#FF7A00]" /> {tt("analysisPage.evidence")}
              </div>
              <ul className="mt-3 space-y-2 text-xs text-[#2F3A4A]/70 dark:text-white/70">
                {evidence.map((item, idx) => (
                  <li key={`${item.chunk.id}-${idx}`} className="rounded-2xl bg-[#FFF2E8] px-3 py-2 text-[#B54708] shadow-sm dark:bg-white/10 dark:text-[#FFB26B]">
                    <div className="font-semibold">{item.requirement}</div>
                    <div className="text-[11px] text-[#B54708]/80 dark:text-[#FFB26B]/80">
                      “{clampText(item.chunk.excerpt, 220)}”
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </motion.section>

      <motion.section
        className="grid gap-6 rounded-3xl border border-[#FFD7B3]/70 bg-gradient-to-br from-white via-white/95 to-[#FFF5EC] p-6 shadow-[0_30px_100px_-45px_rgba(255,122,0,0.55)] dark:from-[#271c18] dark:via-[#271c18]/95 dark:to-[#1b1411] dark:border-white/10 lg:grid-cols-2"
        {...motionCardProps}
      >
        <div className="rounded-3xl border border-[#FFE4C8] bg-white/85 p-5 shadow-inner dark:border-white/10 dark:bg-white/5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#D85E00] dark:text-white">
              <Trophy className="h-4 w-4" /> {jobCopy.relatedTitle}
            </div>
          </div>
          <div className="mt-3 space-y-3 text-xs text-[#2F3A4A]/70 dark:text-white/70">
            {relatedLoading ? (
              <AnimatedLoader label={tt("analysisPage.loading")} />
            ) : relatedError ? (
              <div className="rounded-2xl border border-red-200 bg-red-50/70 px-3 py-2 text-red-700">
                {relatedError}
              </div>
            ) : relatedList.length ? (
              relatedList.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-[#FFF2E8] px-3 py-2 text-[#B54708] shadow-sm dark:bg-white/10 dark:text-[#FFB26B]"
                >
                  <div className="space-y-1">
                    <div className="font-semibold">
                      {item.cv?.name || item.cvId.slice(0, 8)}
                    </div>
                    <div className="text-[11px] text-[#B54708]/80 dark:text-[#FFB26B]/80">
                      {formatDate(item.createdAt, lang)}
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    <div className="font-semibold">{(item.score ?? 0).toFixed(1)} / 10</div>
                    <div>{toPercent(item.metrics?.mustPercent)}</div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-[#FFD7B3] px-3 py-8 text-center text-[#2F3A4A]/60 dark:border-white/10 dark:text-white/60">
                {jobCopy.relatedEmpty}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-[#FFE4C8] bg-white/85 p-5 shadow-inner dark:border-white/10 dark:bg-white/5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#D85E00] dark:text-white">
              <Wand2 className="h-4 w-4" /> {jobCopy.coachTitle}
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={handleCoach}
                disabled={coachLoading || !data?.cvId}
                className="inline-flex items-center gap-2 rounded-full border border-transparent bg-[#FF7A00] px-4 py-2 text-xs font-semibold text-white shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#FF8E26] disabled:opacity-60"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {coachLoading
                  ? jobCopy.coachLoading
                  : coach
                    ? jobCopy.coachRegenerate
                    : jobCopy.coachButton}
              </Button>
              <Button
                onClick={handleCoachCopy}
                disabled={!coach || !coach.summary}
                className="inline-flex items-center gap-2 rounded-full border border-[#FFB26B]/60 bg-[#FFF2E8] px-4 py-2 text-xs font-semibold text-[#D85E00] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#FFD4A8] disabled:opacity-60"
              >
                {coachCopied ? <Check className="h-3.5 w-3.5" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
                {jobCopy.coachCopy}
              </Button>
            </div>
          </div>
          <div className="mt-3 text-xs text-[#2F3A4A]/70 dark:text-white/70">
            {coachLoading ? (
              <AnimatedLoader label={jobCopy.coachLoading} />
            ) : coachError ? (
              <div className="rounded-2xl border border-red-200 bg-red-50/70 px-3 py-2 text-red-700">
                {coachError}
              </div>
            ) : coach ? (
              <div className="space-y-3">
                {coach.summary ? (
                  <motion.div
                    variants={bubbleVariants}
                    initial="initial"
                    animate="animate"
                    transition={{ duration: 0.25 }}
                    className="rounded-2xl bg-[#FFF2E8] px-4 py-3 text-[#B54708] shadow-sm dark:bg-white/10 dark:text-[#FFB26B]"
                  >
                    {coach.summary}
                  </motion.div>
                ) : null}
                {coach.suggestions.length ? (
                  <ul className="space-y-2">
                    {coach.suggestions.map((item, idx) => (
                      <motion.li
                        key={`${item}-${idx}`}
                        variants={bubbleVariants}
                        initial="initial"
                        animate="animate"
                        transition={{ duration: 0.25, delay: idx * 0.04 }}
                        className="rounded-2xl border border-[#FFD7B3]/70 bg-white/90 px-4 py-3 text-[#B54708] shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-[#FFB26B]"
                      >
                        • {item}
                      </motion.li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-[#FFD7B3] px-3 py-8 text-center text-[#2F3A4A]/60 dark:border-white/10 dark:text-white/60">
                {jobCopy.coachEmpty}
              </div>
            )}
          </div>
        </div>
      </motion.section>
    </div>
  );
}
