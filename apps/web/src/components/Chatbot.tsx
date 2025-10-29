// apps/web/src/components/Chatbot.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import {
  MessageCircle,
  X,
  Play,
  Loader2,
  Wand2,
  AlertTriangle,
  ArrowUpRight,
  Copy,
  Check,
  Save,
  ClipboardList,
  Sparkles,
  BarChart3,
  Trophy,
  Target,
} from "lucide-react";
import ScoreGauge from "./ui/ScoreGauge";
import { useSWRLite } from "@/hooks/useSWRLite";
import { t, type Lang } from "@/lib/i18n";
import { useLang } from "@/lib/use-lang";
import { cvApi, type CV } from "@/services/api/cv";
import { jobsApi, type Job, type JobRequirement } from "@/services/api/jobs";
import { analysesApi, type Analysis } from "@/services/api/analyses";

type MsgRole = "bot" | "user" | "sys";
type MsgKind =
  | "intro"
  | "text"
  | "error"
  | "analysis"
  | "comparison"
  | "improvement"
  | "tip";
type Msg = {
  id: string;
  role: MsgRole;
  kind: MsgKind;
  text?: string;
  payload?: any;
  createdAt: number;
};

type ToastTone = "success" | "error" | "info";

type ToastMessage = { id: string; text: string; tone: ToastTone };

const CHAT_STORAGE_KEY = "cv-chat-history-v3";
const MAX_MESSAGES = 60;
const MAX_SELECTED = 4;
const createMsgId = () => Math.random().toString(36).slice(2);

const riskCopy: Record<string, { ar: string; en: string }> = {
  must_threshold: {
    ar: "لم تتجاوز متطلبات الـmust العتبة المطلوبة.",
    en: "Must-have requirements remain below the acceptance threshold.",
  },
  low_total: {
    ar: "النتيجة الكلية منخفضة — راجع المتطلبات الحساسة.",
    en: "Overall score is low — review the critical requirements.",
  },
  no_requirements: {
    ar: "لا توجد متطلبات كافية لتقييمها.",
    en: "No requirements were provided for this analysis.",
  },
  no_text: {
    ar: "لم يتم استخراج نص من السيرة الذاتية.",
    en: "No text could be extracted from the CV.",
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

const summariseAnalysis = (analysis: Analysis) => {
  const metrics = analysis.metrics ?? null;
  const breakdown = analysis.breakdown ?? [];
  const gaps = analysis.gaps ?? null;
  const missingMust = metrics?.missingMust?.length
    ? metrics.missingMust
    : gaps?.mustHaveMissing ?? [];
  const improvement = metrics?.improvement?.length
    ? metrics.improvement
    : gaps?.improve ?? [];
  const strengths = metrics?.topStrengths ?? [];
  const risks = metrics?.riskFlags ?? [];
  const score = Number(analysis.score ?? metrics?.weightedScore ?? 0);
  const generatedAt = metrics?.generatedAt || analysis.updatedAt || analysis.createdAt;

  return {
    metrics,
    breakdown,
    gaps,
    missingMust,
    improvement,
    strengths,
    risks,
    score,
    generatedAt,
  };
};

type CompletedEventDetail = {
  analysis: Analysis;
  job?: { id?: string | null } | null;
};

export default function Chatbot() {
  // Modal state
  const [open, setOpen] = useState(false);

  const lang = useLang();
  // Translation shortcut that re-computes when `lang` changes
  const tt = useMemo(() => (p: string) => t(lang, p), [lang]);

  // -------- helpers that must come BEFORE usage --------
  const formatError = useCallback(
    (error: unknown): string => {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "";
      const normalized = message.toLowerCase();
      const withDetails = (key: string, detail?: string) => {
        const base = `⚠️ ${tt(key)}`;
        return detail ? `${base}\n${tt("chat.errorDetails")} ${detail}` : base;
      };

      if (
        normalized.includes("failed to fetch") ||
        normalized.includes("network") ||
        normalized.includes("connection")
      ) {
        return withDetails("chat.errorNetwork");
      }
      if (normalized.includes("timeout")) {
        return withDetails("chat.errorTimeout");
      }
      if (
        normalized.includes("422") ||
        normalized.includes("unprocessable") ||
        normalized.includes("validation")
      ) {
        const detail =
          message && !/^http\b/i.test(message) ? message : undefined;
        return withDetails("chat.errorValidation", detail);
      }

      const detail = message && !/^http\b/i.test(message) ? message : undefined;
      return withDetails("chat.errorGeneric", detail);
    },
    [tt]
  );
  // -----------------------------------------------------

  // Chat log
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const createIntroMessage = useCallback(
    (): Msg => ({
      id: createMsgId(),
      role: "bot",
      kind: "intro",
      text: tt("chat.hello"),
      createdAt: Date.now(),
    }),
    [tt]
  );

  // Data for selects
  const [cvId, setCvId] = useState("");
  const [jobId, setJobId] = useState("");
  const [compareId, setCompareId] = useState("");
  const [selectedCvIds, setSelectedCvIds] = useState<string[]>([]);

  // Optional JD text → AI suggestion
  const [jd, setJd] = useState("");
  const [suggestedReqs, setSuggestedReqs] = useState<JobRequirement[]>([]);
  const [loading, setLoading] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [result, setResult] = useState<Analysis | null>(null);
  const [action, setAction] = useState<"" | "compare" | "pick" | "improve">("");
  const [historyReady, setHistoryReady] = useState(false);
  const [savingJob, setSavingJob] = useState(false);
  const [copied, setCopied] = useState(false);
  const [typing, setTyping] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const toastTimers = useRef<Record<string, number>>({});

  const pushToast = useCallback(
    (text: string, tone: ToastTone = "info") => {
      const id = createMsgId();
      setToasts((prev) => [...prev.slice(-2), { id, text, tone }]);
      if (typeof window !== "undefined") {
        const timer = window.setTimeout(() => {
          setToasts((prev) => prev.filter((toast) => toast.id !== id));
          if (toastTimers.current[id]) {
            window.clearTimeout(toastTimers.current[id]!);
            delete toastTimers.current[id];
          }
        }, 4200);
        toastTimers.current[id] = timer;
      }
    },
    []
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
    if (toastTimers.current[id] && typeof window !== "undefined") {
      window.clearTimeout(toastTimers.current[id]!);
      delete toastTimers.current[id];
    }
  }, []);

  useEffect(() => {
    return () => {
      Object.values(toastTimers.current).forEach((timer) => {
        if (typeof window !== "undefined") {
          window.clearTimeout(timer);
        }
      });
      toastTimers.current = {};
    };
  }, []);

  const appendMsg = useCallback(
    (entry: Omit<Msg, "id" | "createdAt"> & { id?: string }) => {
      setMsgs((prev) => {
        const next = [
          ...prev,
          {
            ...entry,
            id: entry.id ?? createMsgId(),
            createdAt: Date.now(),
          },
        ];
        return next.slice(-MAX_MESSAGES);
      });
    },
    []
  );

  const guessJobTitle = useCallback(() => {
    const raw = jd || "";
    const lines = raw
      .split(/\r?\n|[.،؛]/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (!lines.length) return "";
    const candidate =
      lines.find((line) => line.length <= 80 && /\S+/.test(line)) ?? lines[0];
    const cleaned = candidate.replace(/^(?:-\s*|•\s*)/, "").trim();
    if (!cleaned) return "";
    return cleaned.length > 80 ? `${cleaned.slice(0, 77)}…` : cleaned;
  }, [jd]);

  const handleCopySuggested = useCallback(async () => {
    if (!suggestedReqs.length) return;
    const mustTag = tt("chat.mustTag");
    const weightLabel = tt("chat.weightLabel");
    const lines = suggestedReqs
      .map(
        (item) =>
          `${item.requirement}${
            item.mustHave ? ` (${mustTag})` : ""
          } • ${weightLabel} ${Number(item.weight ?? 1).toFixed(1)}`
      )
      .join("\n");
    try {
      await navigator.clipboard.writeText(lines);
      setCopied(true);
    } catch (err: any) {
      appendMsg({ role: "bot", text: formatError(err), kind: "error" });
    }
  }, [appendMsg, suggestedReqs, tt, formatError]);

  const handleApplySuggested = useCallback(() => {
    if (!suggestedReqs.length) return;
    try {
      const payload = {
        requirements: suggestedReqs.map((item) => ({
          requirement: item.requirement,
          mustHave: Boolean(item.mustHave),
          weight: Number(item.weight ?? 1) || 1,
        })),
        jd,
        ts: Date.now(),
      };
      window.localStorage?.setItem(
        "pending-job-requirements",
        JSON.stringify(payload)
      );
      window.dispatchEvent(
        new CustomEvent("job:suggested", { detail: payload })
      );
    } catch (err: any) {
      appendMsg({ role: "bot", text: formatError(err), kind: "error" });
    }
  }, [appendMsg, formatError, jd, suggestedReqs]);

  const {
    data: cvsData,
    error: cvsError,
    isLoading: cvsLoading,
    revalidate: revalidateCvs,
  } = useSWRLite<CV[]>(
    open ? "cv:list" : null,
    open
      ? () =>
          cvApi
            .list()
            .then((r) => (Array.isArray(r.items) ? r.items : []))
      : null,
    { revalidateOnMount: true },
  );

  const {
    data: jobsData,
    error: jobsError,
    isLoading: jobsLoading,
    mutate: mutateJobs,
    revalidate: revalidateJobs,
  } = useSWRLite<Job[]>(
    open ? "job:list" : null,
    open
      ? () =>
          jobsApi
            .list()
            .then((r) => (Array.isArray(r.items) ? r.items : []))
      : null,
    { revalidateOnMount: true },
  );

  const cvs = useMemo(() => cvsData ?? [], [cvsData]);
  const jobs = useMemo(() => jobsData ?? [], [jobsData]);

  useEffect(() => {
    if (!open) return;
    void revalidateCvs();
    void revalidateJobs();
  }, [open, revalidateCvs, revalidateJobs]);

  useEffect(() => {
    if (!open || !cvsError) return;
    pushToast(
      lang === "ar" ? "تعذّر تحميل السير الذاتية" : "Couldn't load CV list",
      "error",
    );
  }, [open, cvsError, pushToast, lang]);

  useEffect(() => {
    if (!open || !jobsError) return;
    pushToast(lang === "ar" ? "تعذّر تحميل الوظائف" : "Couldn't load jobs", "error");
  }, [open, jobsError, pushToast, lang]);

  const handleSaveJob = useCallback(async () => {
    if (!suggestedReqs.length) {
      appendMsg({ role: "bot", text: tt("chat.saveJobError"), kind: "error" });
      return;
    }
    const title = guessJobTitle();
    if (!title) {
      appendMsg({ role: "bot", text: tt("chat.saveJobError"), kind: "error" });
      return;
    }
    setSavingJob(true);
    try {
      const payload = suggestedReqs.map((item) => ({
        requirement: item.requirement,
        mustHave: Boolean(item.mustHave),
        weight: Number(item.weight ?? 1) || 1,
      }));
      const job = await jobsApi.create({
        title,
        description: jd.trim() || title,
        requirements: payload,
      });
      const nextJobs = [job, ...jobs.filter((existing) => existing.id !== job.id)];
      await mutateJobs(nextJobs);
      void revalidateJobs();
      setJobId(job.id);
      setSuggestedReqs(job.requirements ?? payload);
      appendMsg({ role: "bot", kind: "text", text: `✅ ${tt("chat.jobSaved")}` });
      pushToast(lang === "ar" ? "تم حفظ الوظيفة" : "Job saved", "success");
    } catch (err: any) {
      appendMsg({ role: "bot", text: formatError(err), kind: "error" });
    } finally {
      setSavingJob(false);
    }
  }, [
    appendMsg,
    formatError,
    guessJobTitle,
    jd,
    jobs,
    mutateJobs,
    pushToast,
    lang,
    revalidateJobs,
    suggestedReqs,
    tt,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(CHAT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const normalized = parsed.reduce<Msg[]>((acc, item: any) => {
            if (!item || !item.role) return acc;
            const role = (item.role as MsgRole) ?? "bot";
            const kind = (item.kind as MsgKind) ?? "text";
            const text = typeof item.text === "string" ? item.text : undefined;
            const payload = item.payload ?? undefined;
            const id = typeof item.id === "string" ? item.id : createMsgId();
            const createdAt = Number.isFinite(item?.createdAt)
              ? Number(item.createdAt)
              : Date.now();
            acc.push({ id, role, kind, text, payload, createdAt });
            return acc;
          }, []);
          if (normalized.length) setMsgs(normalized.slice(-MAX_MESSAGES));
        }
      }
    } catch {}
    setHistoryReady(true);
  }, []);

  useEffect(() => {
    if (!historyReady) return;
    setMsgs((prev) => (prev.length ? prev : [createIntroMessage()]));
  }, [historyReady, createIntroMessage]);

  useEffect(() => {
    if (!historyReady) return;
    setMsgs((prev) => {
      if (prev.length === 1 && prev[0].kind === "intro") {
        const next = createIntroMessage();
        return [{ ...next, id: prev[0].id, createdAt: prev[0].createdAt }];
      }
      return prev.map((entry) =>
        entry.kind === "intro"
          ? { ...entry, text: tt("chat.hello") }
          : entry
      );
    });
  }, [historyReady, createIntroMessage, tt]);

  useEffect(() => {
    if (!historyReady) return;
    try {
      const payload = msgs.slice(-MAX_MESSAGES);
      window.localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(payload));
    } catch {}
  }, [msgs, historyReady]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  useEffect(() => {
    const onCompleted = (event: Event) => {
      const detail = (event as CustomEvent<CompletedEventDetail>).detail;
      if (!detail?.analysis) return;
      const analysis: Analysis = detail.analysis;
      setResult(analysis);
      if (detail?.job?.id) setJobId(detail.job.id);
      if (analysis.cvId) setCvId(analysis.cvId);
      appendMsg({
        role: "bot",
        kind: "analysis",
        payload: {
          analysis,
          job:
            jobs.find((job) => job.id === (detail?.job?.id ?? analysis.jobId)) ??
            null,
        },
      });
      pushToast(
        lang === "ar" ? "تم تحديث التحليل" : "Analysis updated",
        "success"
      );
    };
    window.addEventListener("analysis:completed", onCompleted as EventListener);
    return () =>
      window.removeEventListener(
        "analysis:completed",
        onCompleted as EventListener
      );
  }, [appendMsg, jobs, lang, pushToast]);

  // Ask AI to suggest requirements from a JD blob
  const handleSuggest = async () => {
    if (!jd.trim()) return;
    try {
      setSuggesting(true);
      setTyping(true);
      const r = await jobsApi.suggestFromJD(jd);
      const mustTag = tt("chat.mustTag");
      const weightLabel = tt("chat.weightLabel");
      const items = Array.isArray(r.items) ? r.items : [];
      setSuggestedReqs(
        items.map((item) => ({
          requirement: item.requirement,
          mustHave: Boolean(item.mustHave),
          weight: Number(item.weight ?? 1) || 1,
        }))
      );
      appendMsg({
        role: "bot",
        kind: "text",
        text:
          `✅ ${tt("chat.aiSuggested")}:\n– ` +
          items
            .map(
              (i) =>
                `${i.requirement}${
                  i.mustHave ? ` (${mustTag})` : ""
                } • ${weightLabel} ${i.weight}`
            )
            .join("\n– "),
      });
      pushToast(
        lang === "ar" ? "تم تجهيز المتطلبات المقترحة" : "Suggestions generated",
        "success"
      );
    } catch (e: any) {
      appendMsg({ role: "bot", text: formatError(e), kind: "error" });
    } finally {
      setSuggesting(false);
      setTyping(false);
    }
  };

  const resetConversation = () => {
    setResult(null);
    setMsgs([createIntroMessage()]);
    try {
      window.localStorage.removeItem(CHAT_STORAGE_KEY);
    } catch {}
  };

  const toggleSelectedCv = (id: string) => {
    if (!id) return;
    setSelectedCvIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      }
      const next = [...prev, id];
      if (next.length > MAX_SELECTED) next.shift();
      return next;
    });
  };

  const resolveCvLabel = useCallback(
    (id: string) => {
      const found = cvs.find((c) => c.id === id);
      return found?.originalFilename || id.slice(0, 12);
    },
    [cvs]
  );

  const handleCompare = async () => {
    const list =
      selectedCvIds.length >= 2
        ? selectedCvIds.slice(0, MAX_SELECTED)
        : [cvId, compareId].filter(Boolean);
    if (list.length < 2) {
      appendMsg({
        role: "bot",
        kind: "tip",
        text:
          lang === "ar"
            ? "اختر سيرتين ذاتيتين على الأقل للمقارنة."
            : "Select at least two CVs to compare.",
      });
      return;
    }
    setAction("compare");
    appendMsg({ role: "user", kind: "text", text: tt("chat.compareAction") });
    setTyping(true);
    try {
      const res = await analysesApi.compare({ cvIds: list as string[] });
      appendMsg({
        role: "bot",
        kind: "comparison",
        payload: {
          pairs: res.pairs.map((pair) => ({
            a: { id: pair.a, label: resolveCvLabel(pair.a) },
            b: { id: pair.b, label: resolveCvLabel(pair.b) },
            similarity: pair.similarity,
          })),
          insights: Array.isArray(res.insights) ? res.insights : [],
          meta: Array.isArray((res as any).meta) ? (res as any).meta : [],
        },
      });
      pushToast(
        lang === "ar" ? "نتائج المقارنة جاهزة" : "Comparison ready",
        "success"
      );
    } catch (e: any) {
      appendMsg({ role: "bot", text: formatError(e), kind: "error" });
    } finally {
      setAction("");
      setTyping(false);
    }
  };

  const handlePickBest = async () => {
    const list =
      selectedCvIds.length > 0
        ? selectedCvIds
        : [cvId, compareId].filter(Boolean);
    if (!jobId || !list.length) {
      appendMsg({
        role: "bot",
        kind: "tip",
        text:
          lang === "ar"
            ? "اختر وظيفة وحدد سيرًا ذاتية أولاً."
            : "Pick a job and at least one CV first.",
      });
      return;
    }
    setAction("pick");
    appendMsg({ role: "user", kind: "text", text: tt("chat.pickBestAction") });
    setTyping(true);
    try {
      const res = await analysesApi.pickBest({
        jobId,
        cvIds: list as string[],
      });
      appendMsg({
        role: "bot",
        kind: "improvement",
        payload: {
          title: res.job?.title || tt("chat.rankingSummary"),
          summary: res.summary,
          ranking: res.ranking,
          top: res.top,
        },
      });
      pushToast(
        lang === "ar" ? "تم ترتيب السير الذاتية" : "Ranking generated",
        "success"
      );
      if (res.top?.[0]?.cvId) {
        setCvId(res.top[0].cvId);
      }
    } catch (e: any) {
      appendMsg({ role: "bot", text: formatError(e), kind: "error" });
    } finally {
      setAction("");
      setTyping(false);
    }
  };

  const handleImprove = async () => {
    if (!jobId || !cvId) {
      appendMsg({
        role: "bot",
        kind: "tip",
        text:
          lang === "ar"
            ? "اختر وظيفة وCV لتحسينه."
            : "Select a job and CV to improve.",
      });
      return;
    }
    setAction("improve");
    appendMsg({ role: "user", kind: "text", text: tt("chat.improveAction") });
    setTyping(true);
    try {
      const res = await analysesApi.improve({ jobId, cvId, lang });
      appendMsg({
        role: "bot",
        kind: "improvement",
        payload: {
          title: res.job?.title || tt("chat.improveAction"),
          summary: res.summary ? [res.summary] : [],
          suggestions: res.suggestions,
          metrics: res.metrics,
          targetCv: res.cv,
        },
      });
      pushToast(
        lang === "ar" ? "تم توليد خطة التحسين" : "Improvement tips ready",
        "success"
      );
    } catch (e: any) {
      appendMsg({ role: "bot", text: formatError(e), kind: "error" });
    } finally {
      setAction("");
      setTyping(false);
    }
  };

  // Run analysis for selected CV + Job
  const run = async () => {
    if (!cvId || !jobId) return;
    setLoading(true);
    setResult(null);
    appendMsg({ role: "user", kind: "text", text: `${tt("chat.run")} ▶️` });
    setTyping(true);
    try {
      const a = await analysesApi.run({ jobId, cvId });
      setResult(a);
      appendMsg({
        role: "bot",
        kind: "analysis",
        payload: {
          analysis: a,
          job: jobs.find((job) => job.id === jobId) ?? null,
        },
      });
      pushToast(
        lang === "ar" ? "تحليل جديد جاهز" : "Analysis complete",
        "success"
      );
    } catch (e: any) {
      appendMsg({ role: "bot", text: formatError(e), kind: "error" });
    } finally {
      setLoading(false);
      setTyping(false);
    }
  };

  const renderMessage = useCallback(
    (msg: Msg) => {
      if (msg.kind === "analysis" && msg.payload?.analysis) {
        return (
          <AnalysisCard
            analysis={msg.payload.analysis as Analysis}
            job={(msg.payload.job as Job | null) ?? null}
            lang={lang}
          />
        );
      }
      if (msg.kind === "comparison" && msg.payload) {
        return <ComparisonCard data={msg.payload} lang={lang} />;
      }
      if (msg.kind === "improvement" && msg.payload) {
        return <ImprovementCard data={msg.payload} lang={lang} />;
      }
      const tone = msg.kind === "error" ? "error" : msg.kind === "tip" ? "tip" : "normal";
      return <ChatBubble role={msg.role} text={msg.text ?? ""} tone={tone} />;
    },
    [lang]
  );

  return (
    <>
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(420px_260px_at_12%_18%,rgba(255,122,0,0.18),transparent_60%),radial-gradient(560px_320px_at_88%_-10%,rgba(74,144,226,0.16),transparent_65%)]" />
      </div>

      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 end-6 z-[60] size-14 rounded-[24px] bg-gradient-to-br from-[var(--color-primary)] via-[#ff9440] to-[var(--color-accent)] text-white shadow-xl shadow-[rgba(255,122,0,0.28)] grid place-items-center hover:shadow-[rgba(162,89,255,0.45)] hover:translate-y-[-2px] transition"
        aria-label="Open Assistant"
      >
        <MessageCircle />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-sm"
          >
            <motion.div
              initial={{ y: 72, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              transition={{ type: "spring", stiffness: 160, damping: 18 }}
              className="absolute bottom-0 end-0 m-6 w-[min(500px,calc(100vw-3rem))] overflow-hidden rounded-[32px] bg-[var(--surface)]/90 text-[var(--foreground)] shadow-2xl shadow-[rgba(17,24,39,0.25)]"
            >
              <div className="relative flex h-full flex-col">
                <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)]/60 bg-[var(--surface)]/90 px-5 py-4">
                  <div>
                    <div className="text-sm font-semibold text-[var(--color-primary)]">
                      {tt("chat.title")}
                    </div>
                    <div className="text-[11px] text-[var(--color-text-muted)]">
                      {tt("chat.subtitle")}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={resetConversation}
                      className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs font-medium text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition"
                    >
                      {tt("chat.reset")}
                    </button>
                    <button
                      onClick={() => setOpen(false)}
                      className="size-9 rounded-full bg-[var(--surface-soft)] text-[var(--color-primary)] hover:bg-[var(--color-primary)]/15"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>

                {toasts.length ? (
                  <ToastStack items={toasts} onDismiss={removeToast} lang={lang} />
                ) : null}

                <div className="max-h-[72vh] overflow-auto px-5 py-5 space-y-4 bg-[var(--surface)]/72">
                <div className="space-y-3">
                  <AnimatePresence initial={false}>
                    {msgs.map((msg) => (
                      <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, y: 18 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -12 }}
                        transition={{ type: "spring", stiffness: 260, damping: 24 }}
                      >
                        {renderMessage(msg)}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  {typing ? <TypingIndicator lang={lang} /> : null}
                </div>

                <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--surface)]/95 p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-[var(--color-primary)]">
                      {tt("chat.jdTitle")}
                    </div>
                    <button
                      onClick={() => setJd("")}
                      className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
                    >
                      {tt("chat.clear")}
                    </button>
                  </div>
                  <textarea
                    value={jd}
                    onChange={(e) => setJd(e.target.value)}
                    className="mt-2 w-full min-h-[120px] rounded-2xl border border-[var(--color-border)] bg-[var(--surface-soft)]/70 px-3 py-3 text-sm focus:border-[var(--color-primary)] focus:outline-none"
                    placeholder={tt("chat.jdPlaceholder")}
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={handleSuggest}
                      disabled={!jd.trim() || suggesting}
                      className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-accent)] px-4 py-2 text-xs font-semibold text-white shadow disabled:opacity-50"
                    >
                      {suggesting ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Wand2 size={16} />
                      )}
                      {suggesting ? tt("chat.extracting") : tt("chat.suggest")}
                    </button>
                    <span className="text-[11px] text-[var(--color-text-muted)]">
                      {tt("chat.jdHint")}
                    </span>
                  </div>

                  {suggestedReqs.length ? (
                    <div className="mt-4 space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--surface-soft)]/70 p-4">
                      <div className="flex items-center justify-between text-xs font-semibold text-[var(--color-text-muted)]">
                        <span>{tt("chat.suggestedTitle")}</span>
                        <button
                          onClick={() => setSuggestedReqs([])}
                          className="text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
                        >
                          ×
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs">
                        {suggestedReqs.map((item, idx) => (
                          <span
                            key={`${item.requirement}-${idx}`}
                            className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--surface)]/80 px-3 py-1 text-[var(--foreground)]"
                          >
                            {item.requirement}
                            <span className="text-[11px] text-[var(--color-text-muted)]">
                              {item.mustHave ? tt("chat.mustTag") : "nice"} •{" "}
                              {tt("chat.weightLabel")}{" "}
                              {Number(item.weight ?? 1).toFixed(1)}
                            </span>
                          </span>
                        ))}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-text-muted)]">
                        <button
                          onClick={handleApplySuggested}
                          className="inline-flex items-center gap-2 rounded-full border border-[var(--color-primary)]/50 px-3 py-1 font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10"
                        >
                          <ClipboardList className="h-3.5 w-3.5" />
                          {tt("chat.applySuggested")}
                        </button>
                        <button
                          onClick={handleCopySuggested}
                          className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] px-3 py-1 font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
                        >
                          {copied ? (
                            <Check className="h-3.5 w-3.5" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                          {copied
                            ? lang === "ar"
                              ? "تم النسخ"
                              : "Copied"
                            : tt("chat.copySuggested")}
                        </button>
                        <button
                          onClick={handleSaveJob}
                          disabled={savingJob}
                          className="inline-flex items-center gap-2 rounded-full border border-[var(--color-secondary)]/50 px-3 py-1 font-semibold text-[var(--color-secondary)] hover:bg-[var(--color-secondary)]/10 disabled:opacity-60"
                        >
                          {savingJob ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Save className="h-3.5 w-3.5" />
                          )}
                          {tt("chat.saveJob")}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--surface)]/95 p-4 shadow-sm space-y-3">
                  <div className="grid gap-3">
                    <label className="text-xs font-semibold text-[var(--color-text-muted)]">
                      {tt("chat.pickCv")}
                      <select
                        value={cvId}
                        onChange={(e) => setCvId(e.target.value)}
                        className="mt-1 w-full rounded-2xl border border-[var(--color-border)] bg-[var(--surface-soft)]/70 px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
                        disabled={cvsLoading && !cvs.length}
                      >
                        <option value="">
                          {cvsLoading
                            ? lang === "ar"
                              ? "جارٍ تحميل السير الذاتية..."
                              : "Loading CVs..."
                            : cvs.length
                              ? tt("chat.pickCv")
                              : lang === "ar"
                                ? "لا توجد سير ذاتية مرفوعة"
                                : "No CVs uploaded yet"}
                        </option>
                        {cvs.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.originalFilename || c.id.slice(0, 12)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="text-xs font-semibold text-[var(--color-text-muted)]">
                      {tt("chat.secondCv")}
                      <select
                        value={compareId}
                        onChange={(e) => setCompareId(e.target.value)}
                        className="mt-1 w-full rounded-2xl border border-[var(--color-border)] bg-[var(--surface-soft)]/70 px-3 py-2 text-sm focus:border-[var(--color-secondary)] focus:outline-none"
                        disabled={cvsLoading && !cvs.length}
                      >
                        <option value="">
                          {cvsLoading
                            ? lang === "ar"
                              ? "جارٍ تحميل السير الذاتية..."
                              : "Loading CVs..."
                            : tt("chat.secondCvPlaceholder")}
                        </option>
                        {cvs
                          .filter((c) => c.id !== cvId)
                          .map((c) => (
                            <option key={`compare-${c.id}`} value={c.id}>
                              {c.originalFilename || c.id.slice(0, 12)}
                            </option>
                          ))}
                      </select>
                    </label>

                    <label className="text-xs font-semibold text-[var(--color-text-muted)]">
                      {tt("chat.pickJob")}
                      <select
                        value={jobId}
                        onChange={(e) => setJobId(e.target.value)}
                        className="mt-1 w-full rounded-2xl border border-[var(--color-border)] bg-[var(--surface-soft)]/70 px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
                        disabled={jobsLoading && !jobs.length}
                      >
                        <option value="">
                          {jobsLoading
                            ? lang === "ar"
                              ? "جارٍ تحميل الوظائف..."
                              : "Loading jobs..."
                            : jobs.length
                              ? tt("chat.pickJob")
                              : lang === "ar"
                                ? "لا توجد وظائف محفوظة بعد"
                                : "No saved jobs yet"}
                        </option>
                        {jobs.map((j) => (
                          <option key={j.id} value={j.id}>
                            {j.title}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-text-muted)]">
                    <button
                      onClick={() => toggleSelectedCv(cvId)}
                      disabled={!cvId}
                      className="rounded-full border border-[var(--color-primary)]/50 px-3 py-1 text-xs font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 disabled:opacity-40"
                    >
                      {tt("chat.addSelection")}
                    </button>
                    {selectedCvIds.length ? (
                      <span>{tt("chat.selectedHint")}</span>
                    ) : null}
                  </div>
                  {selectedCvIds.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {selectedCvIds.map((id) => (
                        <button
                          key={`chip-${id}`}
                          onClick={() => toggleSelectedCv(id)}
                          className="inline-flex items-center gap-1 rounded-full bg-[var(--color-secondary)]/15 px-3 py-1 text-xs font-medium text-[var(--color-secondary)]"
                        >
                          {resolveCvLabel(id)}
                          <X size={14} />
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      onClick={run}
                      disabled={!cvId || !jobId || loading}
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[var(--color-primary)] via-[#ff8b2e] to-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white shadow-lg disabled:opacity-50"
                    >
                      {loading ? (
                        <Loader2 className="animate-spin" size={16} />
                      ) : (
                        <Play size={16} />
                      )}
                      {loading ? tt("chat.running") : tt("chat.run")}
                    </button>
                    <button
                      onClick={handleCompare}
                      disabled={action === "compare"}
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-[var(--color-secondary)]/60 bg-[var(--surface-muted)]/60 px-4 py-2 text-sm font-semibold text-[var(--color-secondary)] hover:border-[var(--color-secondary)]"
                    >
                      {action === "compare" ? (
                        <Loader2 className="animate-spin" size={16} />
                      ) : null}
                      {tt("chat.compare")}
                    </button>
                    <button
                      onClick={handlePickBest}
                      disabled={action === "pick"}
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-[var(--color-primary)]/40 bg-[var(--surface-soft)] px-4 py-2 text-sm font-semibold text-[var(--color-primary)] hover:border-[var(--color-primary)]"
                    >
                      {action === "pick" ? (
                        <Loader2 className="animate-spin" size={16} />
                      ) : null}
                      {tt("chat.pickBest")}
                    </button>
                    <button
                      onClick={handleImprove}
                      disabled={action === "improve"}
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
                    >
                      {action === "improve" ? (
                        <Loader2 className="animate-spin" size={16} />
                      ) : null}
                      {tt("chat.improve")}
                    </button>
                  </div>
                </div>

                {result && (
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--surface)]/95 p-4 shadow-sm"
                  >
                    {(() => {
                      const metrics = result.metrics ?? null;
                      const gaps = result.gaps ?? null;
                      const missingMust = metrics?.missingMust?.length
                        ? metrics.missingMust
                        : (gaps?.mustHaveMissing ?? []);
                      const improvement = metrics?.improvement?.length
                        ? metrics.improvement
                        : (gaps?.improve ?? []);
                      const strengths = metrics?.topStrengths ?? [];
                      const risks = metrics?.riskFlags ?? [];
                      const generatedAt = metrics?.generatedAt
                        ? new Date(metrics.generatedAt)
                        : null;

                      return (
                        <>
                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[160px_1fr]">
                            <div className="grid place-items-center rounded-2xl bg-[var(--surface-muted)]/60 p-4">
                              <ScoreGauge
                                value={
                                  result.score ??
                                  metrics?.weightedScore ??
                                  0
                                }
                              />
                            </div>
                            <div className="space-y-3">
                              <div>
                                <div className="text-lg font-semibold text-[var(--color-primary)]">
                                  {tt("chat.score")} •{" "}
                                  {formatScore10(
                                    result.score ?? metrics?.weightedScore ?? 0
                                  )}
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-text-muted)]">
                                  <span className="rounded-full bg-[var(--surface-soft)] px-2 py-1">
                                    status: {result.status}
                                  </span>
                                  {result.model ? (
                                    <span className="rounded-full bg-[var(--surface-soft)] px-2 py-1">
                                      model: {result.model}
                                    </span>
                                  ) : null}
                                  {generatedAt ? (
                                    <span>
                                      {generatedAt.toLocaleString(
                                        lang === "ar" ? "ar" : "en",
                                        {
                                          hour12: false,
                                        }
                                      )}
                                    </span>
                                  ) : null}
                                </div>
                              </div>

                              <div className="grid gap-2 sm:grid-cols-3">
                                <div className="rounded-xl border border-[var(--color-border)]/60 bg-[var(--surface-soft)]/60 px-3 py-2 text-xs">
                                  <div className="text-[11px] text-[var(--color-text-muted)]">
                                    {tt("chat.mustPercent")}
                                  </div>
                                  <div className="text-sm font-semibold text-[var(--foreground)]">
                                    {toPercent(metrics?.mustPercent)}
                                  </div>
                                </div>
                                <div className="rounded-xl border border-[var(--color-border)]/60 bg-[var(--surface-soft)]/60 px-3 py-2 text-xs">
                                  <div className="text-[11px] text-[var(--color-text-muted)]">
                                    {tt("chat.nicePercent")}
                                  </div>
                                  <div className="text-sm font-semibold text-[var(--foreground)]">
                                    {toPercent(metrics?.nicePercent)}
                                  </div>
                                </div>
                                <div className="rounded-xl border border-[var(--color-border)]/60 bg-[var(--surface-soft)]/60 px-3 py-2 text-xs">
                                  <div className="text-[11px] text-[var(--color-text-muted)]">
                                    {tt("chat.gatePassed")}
                                  </div>
                                  <div className="text-sm font-semibold text-[var(--foreground)]">
                                    {metrics?.gatePassed ? "✓" : "✗"}
                                  </div>
                                </div>
                              </div>

                              <div className="space-y-2 text-[11px] text-[var(--color-text-muted)]">
                                {missingMust.length ? (
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-semibold text-[var(--color-primary)]">
                                      {tt("chat.missingMust")}
                                    </span>
                                    {missingMust.map((item) => (
                                      <span
                                        key={`miss-${item}`}
                                        className="rounded-full bg-[#fee4e2] px-3 py-1 text-[#b42318]"
                                      >
                                        {item}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                                {improvement.length ? (
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-semibold text-[#d4850d]">
                                      {tt("chat.improvements")}
                                    </span>
                                    {improvement.map((item) => (
                                      <span
                                        key={`imp-${item}`}
                                        className="rounded-full bg-[#fef0c7] px-3 py-1 text-[#b54708]"
                                      >
                                        {item}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                                {risks.length ? (
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-semibold text-[#b42318]">
                                      {tt("chat.risks")}
                                    </span>
                                    {risks.map((flag) => (
                                      <span
                                        key={`risk-${flag}`}
                                        className="inline-flex items-center gap-1 rounded-full bg-[#fde2e1] px-3 py-1 text-[#b42318]"
                                      >
                                        <AlertTriangle className="h-3.5 w-3.5" />
                                        {riskCopy[flag]?.[lang] ?? flag}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                                {!missingMust.length &&
                                !improvement.length &&
                                !risks.length ? (
                                  <div className="rounded-full bg-[var(--surface-soft)] px-3 py-1 text-center">
                                    {tt("chat.stored")}
                                  </div>
                                ) : null}
                              </div>

                              <div className="flex flex-wrap items-center gap-3 text-[11px] text-[var(--color-text-muted)]">
                                <span>{tt("chat.stored")}</span>
                                <a
                                  href={`/analysis/${result.id}`}
                                  className="inline-flex items-center gap-1 rounded-full border border-[var(--color-primary)]/40 px-3 py-1 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10"
                                >
                                  {tt("chat.viewFull")}{" "}
                                  <ArrowUpRight className="h-3.5 w-3.5" />
                                </a>
                              </div>
                            </div>
                          </div>

                          {strengths.length ? (
                            <div className="space-y-2">
                              <div className="text-sm font-semibold text-[var(--color-text-muted)]">
                                {tt("chat.strengths")}
                              </div>
                              <div className="flex flex-wrap gap-2 text-xs">
                                {strengths.map((item) => (
                                  <div
                                    key={`${item.requirement}-${item.score}`}
                                    className="rounded-full border border-[var(--color-secondary)]/40 bg-[var(--surface-soft)] px-3 py-1"
                                  >
                                    {item.requirement} • {item.score.toFixed(1)}{" "}
                                    / 10
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </>
                      );
                    })()}

                    {Array.isArray(result.breakdown) &&
                    result.breakdown.length > 0 ? (
                      <div className="space-y-2">
                        <div className="text-sm font-semibold text-[var(--color-text-muted)]">
                          {tt("chat.breakdown") ?? "Breakdown"}
                        </div>
                        <div className="max-h-64 space-y-3 overflow-auto pr-1">
                          {result.breakdown.map((row, idx) => (
                            <div
                              key={`${row.requirement}-${idx}`}
                              className="rounded-2xl border border-[var(--color-border)] bg-[var(--surface-soft)]/60 p-3 text-xs"
                            >
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                <div className="text-sm font-medium text-[var(--foreground)]">
                                  {row.requirement}
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-text-muted)]">
                                  <span className="rounded-full bg-white/60 px-2 py-1">
                                    {row.mustHave ? "Must" : "Nice"}
                                  </span>
                                  <span className="rounded-full bg-white/60 px-2 py-1">
                                    {tt("chat.weightLabel")}: {row.weight}
                                  </span>
                                  <span className="rounded-full bg-white/60 px-2 py-1">
                                    sim {(row.similarity * 100).toFixed(1)}%
                                  </span>
                                  <span className="rounded-full bg-white/60 px-2 py-1">
                                    {row.score10.toFixed(1)} / 10
                                  </span>
                                </div>
                              </div>
                              {row.bestChunk?.excerpt ? (
                                <p className="mt-2 line-clamp-3 text-[11px] leading-relaxed text-[var(--color-text-muted)]">
                                  {row.bestChunk.excerpt}
                                </p>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </motion.div>
                )}
              </div>
            </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

type ChatBubbleProps = {
  role: MsgRole;
  text: string;
  tone?: "normal" | "error" | "tip";
};

function ChatBubble({ role, text, tone = "normal" }: ChatBubbleProps) {
  const [copied, setCopied] = useState(false);
  const isUser = role === "user";
  const alignClass = isUser ? "justify-end" : role === "sys" ? "justify-center" : "justify-start";
  const userGradient = "linear-gradient(135deg, var(--color-primary), #ff9440, var(--color-accent))";

  let background = "var(--surface)";
  let border = "var(--color-border)";
  let textColor = "var(--foreground)";
  if (isUser) {
    background = userGradient;
    border = "transparent";
    textColor = "#fff";
  } else if (tone === "error") {
    background = "rgba(254, 226, 226, 0.9)";
    border = "rgba(248, 113, 113, 0.4)";
    textColor = "#7f1d1d";
  } else if (tone === "tip") {
    background = "rgba(255, 247, 222, 0.95)";
    border = "rgba(250, 204, 21, 0.4)";
    textColor = "#92400e";
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch (err) {
      console.warn("copy failed", err);
    }
  };

  const copyButtonClass = clsx(
    "rounded-full border p-1 transition",
    isUser
      ? "border-white/30 bg-white/10 text-white/90 hover:bg-white/20"
      : "border-[var(--color-border)]/60 bg-white/80 text-[var(--color-text-muted)] hover:bg-white",
  );

  return (
    <div className={clsx("flex", alignClass)}>
      <motion.div
        whileTap={{ scale: 0.98 }}
        className={clsx(
          "relative max-w-[85%] overflow-hidden rounded-3xl px-4 py-3 text-sm leading-relaxed shadow-lg",
          role === "sys" && "bg-[var(--surface-muted)]/90 text-[11px] text-[var(--color-text-muted)]"
        )}
        style={{ background, border: `1px solid ${border}`, color: textColor }}
      >
        <div className="flex items-start gap-3">
          <p className="whitespace-pre-wrap text-current">{text}</p>
          <button
            onClick={handleCopy}
            className={copyButtonClass}
            aria-label="Copy message"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>
        <span
          aria-hidden
          className={clsx(
            "pointer-events-none absolute bottom-[-6px] h-4 w-4 rotate-45",
            isUser ? "right-4" : role === "sys" ? "left-1/2 -translate-x-1/2" : "left-4"
          )}
          style={{ background }}
        />
      </motion.div>
    </div>
  );
}

type TypingIndicatorProps = { lang: string };

function TypingIndicator({ lang }: TypingIndicatorProps) {
  const label = lang === "ar" ? "المساعد يكتب..." : "Assistant is typing...";
  return (
    <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
      <motion.span
        className="flex items-center gap-1 rounded-full bg-[var(--surface-soft)] px-3 py-1"
        initial={{ opacity: 0.4 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, repeat: Infinity, repeatType: "reverse" }}
      >
        <span className="flex gap-1">
          {[0, 1, 2].map((idx) => (
            <motion.span
              key={idx}
              className="size-1.5 rounded-full bg-[var(--color-primary)]"
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1.2, repeat: Infinity, delay: idx * 0.2 }}
            />
          ))}
        </span>
        {label}
      </motion.span>
    </div>
  );
}

type AnalysisCardProps = {
  analysis: Analysis;
  job: Job | null;
  lang: Lang;
};

function AnalysisCard({ analysis, job, lang }: AnalysisCardProps) {
  const summary = summariseAnalysis(analysis);
  const formattedDate = summary.generatedAt
    ? new Date(summary.generatedAt).toLocaleString(lang === "ar" ? "ar" : "en", {
        hour12: false,
      })
    : null;
  const breakdownPreview = (analysis.breakdown ?? []).slice(0, 3);

  return (
    <motion.div
      whileTap={{ scale: 0.99 }}
      className="overflow-hidden rounded-[28px] bg-gradient-to-r from-fuchsia-500 via-purple-500 to-orange-400 p-[1px] text-white shadow-xl"
    >
      <div className="space-y-4 rounded-[27px] bg-black/20 p-5 backdrop-blur-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em]">
              <Sparkles className="h-3.5 w-3.5" />
              {lang === "ar" ? "تحليل مكتمل" : "Analysis ready"}
            </div>
            <h3 className="text-xl font-semibold">
              {job?.title || (lang === "ar" ? "وظيفة بدون عنوان" : "Untitled job")}
            </h3>
            <p className="text-sm text-white/80">
              {lang === "ar"
                ? `السيرة الذاتية: ${analysis.cvId.slice(0, 12)} • النموذج ${analysis.model || "gpt-4o"}`
                : `CV ${analysis.cvId.slice(0, 12)} • model ${analysis.model || "gpt-4o"}`}
            </p>
            {formattedDate ? (
              <p className="text-xs text-white/70">{formattedDate}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-4">
            <ScoreGauge value={summary.score} size={120} />
            <div className="space-y-2 text-xs text-white/80">
              <div className="rounded-full bg-white/10 px-3 py-1">
                {lang === "ar" ? "النقاط" : "Score"}: {formatScore10(summary.score)}
              </div>
              <div className="rounded-full bg-white/10 px-3 py-1">
                {lang === "ar" ? "مطلوب" : "Must"}: {toPercent(summary.metrics?.mustPercent ?? 0)}
              </div>
              <div className="rounded-full bg-white/10 px-3 py-1">
                {lang === "ar" ? "إضافي" : "Nice"}: {toPercent(summary.metrics?.nicePercent ?? 0)}
              </div>
            </div>
          </div>
        </div>

        {summary.missingMust.length ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Target className="h-4 w-4" />
              {lang === "ar" ? "متطلبات مفقودة" : "Missing must-haves"}
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              {summary.missingMust.map((item) => (
                <span
                  key={`miss-${item}`}
                  className="rounded-full bg-white/15 px-3 py-1 text-white"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {summary.improvement.length ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <BarChart3 className="h-4 w-4" />
              {lang === "ar" ? "تحسينات مقترحة" : "Improvement focus"}
            </div>
            <ul className="list-disc space-y-1 ps-5 text-xs text-white/85">
              {summary.improvement.slice(0, 4).map((item, idx) => (
                <li key={`imp-${idx}`}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {summary.strengths.length ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Trophy className="h-4 w-4" />
              {lang === "ar" ? "نقاط قوة" : "Top strengths"}
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-white/85">
              {summary.strengths.slice(0, 4).map((item) => (
                <span
                  key={`${item.requirement}-${item.score}`}
                  className="rounded-full bg-white/15 px-3 py-1"
                >
                  {item.requirement} • {item.score.toFixed(1)}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {breakdownPreview.length ? (
          <div className="space-y-2">
            <div className="text-sm font-semibold">
              {lang === "ar" ? "أبرز البنود" : "Highlighted requirements"}
            </div>
            <div className="space-y-2 text-xs text-white/80">
              {breakdownPreview.map((row, idx) => (
                <div key={`${row.requirement}-${idx}`} className="rounded-2xl bg-white/10 px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{row.requirement}</span>
                    <span>{row.score10.toFixed(1)} / 10</span>
                  </div>
                  <div className="mt-1 text-[10px] uppercase tracking-wide">
                    {lang === "ar" ? "تشابه" : "Similarity"}: {(row.similarity * 100).toFixed(1)}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {summary.risks.length ? (
          <div className="flex flex-wrap gap-2 text-xs">
            {summary.risks.map((flag) => (
              <span key={`risk-${flag}`} className="inline-flex items-center gap-1 rounded-full bg-black/30 px-3 py-1">
                <AlertTriangle className="h-3 w-3" />
                {riskCopy[flag]?.[lang] ?? flag}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}

type ComparisonCardProps = {
  data: {
    pairs: Array<{ a: { id: string; label: string }; b: { id: string; label: string }; similarity: number }>;
    insights?: string[];
    meta?: Array<{ id: string; name: string; createdAt: string | null; lang?: string | null }>;
  };
  lang: Lang;
};

function ComparisonCard({ data, lang }: ComparisonCardProps) {
  const bestPair = data.pairs.length
    ? data.pairs.reduce(
        (top, pair) =>
          pair.similarity > (top?.similarity ?? -Infinity) ? pair : top,
        data.pairs[0],
      )
    : null;

  const formatMetaDate = (value: string | null | undefined) => {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    try {
      return parsed.toLocaleDateString(lang === "ar" ? "ar" : "en", {
        month: "short",
        day: "numeric",
      });
    } catch {
      return parsed.toISOString().slice(0, 10);
    }
  };

  return (
    <motion.div
      whileTap={{ scale: 0.99 }}
      className="overflow-hidden rounded-[28px] bg-gradient-to-r from-sky-500 via-indigo-500 to-purple-500 p-[1px] text-white shadow-xl"
    >
      <div className="space-y-4 rounded-[27px] bg-black/20 p-5 backdrop-blur-sm">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <BarChart3 className="h-4 w-4" />
          {lang === "ar" ? "مقارنة السير الذاتية" : "CV comparison"}
        </div>
        <div className="space-y-3">
          {data.pairs.map((pair, idx) => (
            <div
              key={`${pair.a.id}-${pair.b.id}-${idx}`}
              className="rounded-2xl bg-white/10 p-3 text-xs text-white/85"
            >
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div className="font-semibold">
                  {pair.a.label} ↔ {pair.b.label}
                </div>
                <div className="inline-flex items-center gap-2">
                  <span className="rounded-full bg-black/30 px-3 py-1">
                    {pair.similarity.toFixed(1)}%
                  </span>
                </div>
              </div>
              <div className="mt-2 h-2 w-full rounded-full bg-white/20">
                <div
                  className="h-full rounded-full bg-white"
                  style={{ width: `${Math.min(100, Math.max(0, pair.similarity))}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        {bestPair ? (
          <div className="rounded-2xl bg-white/10 px-3 py-2 text-xs text-white/90">
            {lang === "ar"
              ? `أقرب تطابق: ${bestPair.a.label} ↔ ${bestPair.b.label} بنسبة ${bestPair.similarity.toFixed(1)}%`
              : `Closest match: ${bestPair.a.label} ↔ ${bestPair.b.label} at ${bestPair.similarity.toFixed(1)}%`}
          </div>
        ) : null}
        {data.insights?.length ? (
          <div className="space-y-2">
            <div className="text-sm font-semibold">
              {lang === "ar" ? "ملاحظات" : "Insights"}
            </div>
            <ul className="list-disc space-y-1 ps-5 text-xs text-white/80">
              {data.insights.slice(0, 5).map((item, idx) => (
                <li key={`insight-${idx}`}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {data.meta?.length ? (
          <div className="space-y-2">
            <div className="text-sm font-semibold">
              {lang === "ar" ? "الملفات المقارنة" : "Compared CVs"}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {data.meta.map((item) => {
                const title = item.name || item.id.slice(0, 10);
                const stamp = formatMetaDate(item.createdAt);
                return (
                  <div
                    key={`meta-${item.id}`}
                    className="rounded-2xl bg-white/10 px-3 py-2 text-xs text-white/85"
                  >
                    <div className="font-semibold">{title}</div>
                    <div className="mt-1 flex flex-wrap gap-2 text-[10px] uppercase tracking-wide text-white/70">
                      {item.lang ? (
                        <span className="rounded-full bg-black/30 px-2 py-1">
                          {lang === "ar" ? `اللغة: ${item.lang}` : `Lang: ${item.lang}`}
                        </span>
                      ) : null}
                      {stamp ? (
                        <span className="rounded-full bg-black/30 px-2 py-1">{stamp}</span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}

type ImprovementCardProps = {
  data: {
    title?: string;
    summary?: string[];
    suggestions?: string[];
    metrics?: {
      score: number;
      mustPercent: number;
      nicePercent: number;
      missingMust: string[];
      improvement: string[];
    };
    ranking?: Array<{
      cvId: string;
      fileName: string;
      score: number;
      mustPercent: number;
      nicePercent: number;
      gatePassed: boolean;
      missingMust: string[];
      improvement: string[];
    }>;
    top?: Array<{ cvId: string; fileName: string; score: number }>;
    targetCv?: { id: string; name: string };
  };
  lang: Lang;
};

function ImprovementCard({ data, lang }: ImprovementCardProps) {
  const summaryLines = data.summary ?? [];
  const suggestions = data.suggestions ?? [];
  const ranking = data.ranking ?? [];

  return (
    <motion.div
      whileTap={{ scale: 0.99 }}
      className="overflow-hidden rounded-[28px] bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 p-[1px] text-white shadow-xl"
    >
      <div className="space-y-4 rounded-[27px] bg-black/25 p-5 backdrop-blur-sm">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Trophy className="h-4 w-4" />
          {data.title || (lang === "ar" ? "اقتراحات" : "Suggestions")}
        </div>

        {summaryLines.length ? (
          <ul className="list-disc space-y-1 ps-5 text-xs text-white/85">
            {summaryLines.slice(0, 4).map((line, idx) => (
              <li key={`summary-${idx}`}>{line}</li>
            ))}
          </ul>
        ) : null}

        {suggestions.length ? (
          <div className="space-y-2">
            <div className="text-sm font-semibold">
              {lang === "ar" ? "خطوات عملية" : "Actionable next steps"}
            </div>
            <ul className="list-disc space-y-1 ps-5 text-xs text-white/80">
              {suggestions.slice(0, 6).map((item, idx) => (
                <li key={`suggest-${idx}`}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {ranking.length ? (
          <div className="space-y-2">
            <div className="text-sm font-semibold">
              {lang === "ar" ? "أفضل المرشحين" : "Top candidates"}
            </div>
            <div className="space-y-2">
              {ranking.slice(0, 3).map((item, idx) => (
                <div key={`rank-${item.cvId}`} className="rounded-2xl bg-white/10 px-3 py-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">
                      #{idx + 1} • {item.fileName}
                    </span>
                    <span>{item.score.toFixed(1)}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-[10px] uppercase tracking-wide">
                    <span className="rounded-full bg-black/30 px-2 py-1">
                      {lang === "ar" ? "مطلوب" : "Must"}: {toPercent(item.mustPercent)}
                    </span>
                    <span className="rounded-full bg-black/30 px-2 py-1">
                      {lang === "ar" ? "إضافي" : "Nice"}: {toPercent(item.nicePercent)}
                    </span>
                    <span className="rounded-full bg-black/30 px-2 py-1">
                      {item.gatePassed ? (lang === "ar" ? "يجتاز" : "Pass") : lang === "ar" ? "لا يجتاز" : "Fail"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {data.metrics ? (
          <div className="grid gap-2 sm:grid-cols-3 text-xs text-white/80">
            <div className="rounded-2xl bg-white/10 px-3 py-2">
              {lang === "ar" ? "النقاط" : "Score"}: {data.metrics.score.toFixed(1)}
            </div>
            <div className="rounded-2xl bg-white/10 px-3 py-2">
              {lang === "ar" ? "مطلوب" : "Must"}: {toPercent(data.metrics.mustPercent)}
            </div>
            <div className="rounded-2xl bg-white/10 px-3 py-2">
              {lang === "ar" ? "إضافي" : "Nice"}: {toPercent(data.metrics.nicePercent)}
            </div>
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}

type ToastStackProps = {
  items: ToastMessage[];
  onDismiss: (id: string) => void;
  lang: Lang;
};

function ToastStack({ items, onDismiss, lang }: ToastStackProps) {
  return (
    <div className="pointer-events-none absolute right-3 top-24 z-10 flex w-[min(320px,calc(100vw-3rem))] flex-col gap-2 sm:right-6 sm:top-20">
      <AnimatePresence>
        {items.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className={clsx(
              "pointer-events-auto inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-medium shadow-lg",
              toast.tone === "success"
                ? "bg-emerald-500/90 text-white"
                : toast.tone === "error"
                  ? "bg-rose-500/90 text-white"
                  : "bg-indigo-500/90 text-white"
            )}
          >
            <span>{toast.text}</span>
            <button
              onClick={() => onDismiss(toast.id)}
              className="rounded-full bg-white/20 p-1 hover:bg-white/30"
              aria-label={lang === "ar" ? "إغلاق" : "Dismiss"}
            >
              <X size={12} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
