// apps/web/src/components/Chatbot.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
} from "lucide-react";
import ScoreGauge from "./ui/ScoreGauge";
import { t } from "@/lib/i18n";
import { useLang } from "@/lib/use-lang";
import { cvApi } from "@/services/api/cv";
import { jobsApi, type Job, type JobRequirement } from "@/services/api/jobs";
import { analysesApi, type Analysis } from "@/services/api/analyses";

type MsgRole = "bot" | "user" | "sys";
type Msg = { role: MsgRole; text: string; kind?: "intro" | "error" | "info" };

const CHAT_STORAGE_KEY = "cv-chat-history-v2";
const MAX_SELECTED = 4;

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
      role: "bot",
      text: tt("chat.hello"),
      kind: "intro",
    }),
    [tt]
  );

  // Data for selects
  const [cvs, setCvs] = useState<any[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
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

  const appendMsg = useCallback((entry: Msg) => {
    setMsgs((prev) => [...prev, entry]);
  }, []);

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
      setJobs((prev) => [
        job,
        ...prev.filter((existing) => existing.id !== job.id),
      ]);
      setJobId(job.id);
      setSuggestedReqs(job.requirements ?? payload);
      appendMsg({ role: "bot", text: `✅ ${tt("chat.jobSaved")}` });
    } catch (err: any) {
      appendMsg({ role: "bot", text: formatError(err), kind: "error" });
    } finally {
      setSavingJob(false);
    }
  }, [appendMsg, formatError, guessJobTitle, jd, suggestedReqs, tt]);

  // When the chat opens, fetch CVs and Jobs
  useEffect(() => {
    if (!open) return;
    cvApi
      .list()
      .then((r) => setCvs(r.items))
      .catch(() => {});
    jobsApi
      .list()
      .then((r) => setJobs(r.items ?? []))
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(CHAT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const filtered = parsed.filter(
            (item: any): item is Msg =>
              item && typeof item.text === "string" && item.role
          );
          if (filtered.length) setMsgs(filtered);
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
        return [createIntroMessage()];
      }
      return prev.map((entry) =>
        entry.kind === "intro" ? { ...entry, text: tt("chat.hello") } : entry
      );
    });
  }, [historyReady, createIntroMessage, tt]);

  useEffect(() => {
    if (!historyReady) return;
    try {
      window.localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(msgs));
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
        text: `${tt("chat.done")} • ${tt("chat.score")}: ${Number(
          analysis.score ?? 0
        ).toFixed(2)}`,
      });
    };
    window.addEventListener("analysis:completed", onCompleted as EventListener);
    return () =>
      window.removeEventListener(
        "analysis:completed",
        onCompleted as EventListener
      );
  }, [tt, appendMsg]);

  // Ask AI to suggest requirements from a JD blob
  const handleSuggest = async () => {
    if (!jd.trim()) return;
    try {
      setSuggesting(true);
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
    } catch (e: any) {
      appendMsg({ role: "bot", text: formatError(e), kind: "error" });
    } finally {
      setSuggesting(false);
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
        text:
          lang === "ar"
            ? "اختر سيرتين ذاتيتين على الأقل للمقارنة."
            : "Select at least two CVs to compare.",
      });
      return;
    }
    setAction("compare");
    appendMsg({ role: "user", text: tt("chat.compareAction") });
    try {
      const res = await analysesApi.compare({ cvIds: list as string[] });
      const lines = res.pairs.map((pair) => {
        const left = resolveCvLabel(pair.a);
        const right = resolveCvLabel(pair.b);
        return `${left} ↔ ${right}: ${pair.similarity.toFixed(1)}%`;
      });
      const details = res.insights?.length
        ? `\n${res.insights.join("\n")}`
        : "";
      appendMsg({
        role: "bot",
        text: `${tt("chat.compareSummary")}\n${lines.join("\n")}${details}`,
      });
    } catch (e: any) {
      appendMsg({ role: "bot", text: formatError(e), kind: "error" });
    } finally {
      setAction("");
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
        text:
          lang === "ar"
            ? "اختر وظيفة وحدد سيرًا ذاتية أولاً."
            : "Pick a job and at least one CV first.",
      });
      return;
    }
    setAction("pick");
    appendMsg({ role: "user", text: tt("chat.pickBestAction") });
    try {
      const res = await analysesApi.pickBest({
        jobId,
        cvIds: list as string[],
      });
      const summary = res.summary.join("\n");
      appendMsg({
        role: "bot",
        text: `${tt("chat.rankingSummary")}\n${summary}`,
      });
      if (res.top?.[0]?.cvId) {
        setCvId(res.top[0].cvId);
      }
    } catch (e: any) {
      appendMsg({ role: "bot", text: formatError(e), kind: "error" });
    } finally {
      setAction("");
    }
  };

  const handleImprove = async () => {
    if (!jobId || !cvId) {
      appendMsg({
        role: "bot",
        text:
          lang === "ar"
            ? "اختر وظيفة وCV لتحسينه."
            : "Select a job and CV to improve.",
      });
      return;
    }
    setAction("improve");
    appendMsg({ role: "user", text: tt("chat.improveAction") });
    try {
      const res = await analysesApi.improve({ jobId, cvId, lang });
      const body = res.suggestions.length
        ? res.suggestions.map((s) => `– ${s}`).join("\n")
        : "";
      appendMsg({
        role: "bot",
        text: `${res.summary}${body ? `\n${body}` : ""}`,
      });
    } catch (e: any) {
      appendMsg({ role: "bot", text: formatError(e), kind: "error" });
    } finally {
      setAction("");
    }
  };

  // Run analysis for selected CV + Job
  const run = async () => {
    if (!cvId || !jobId) return;
    setLoading(true);
    setResult(null);
    appendMsg({ role: "user", text: `${tt("chat.run")} ▶️` });
    try {
      const a = await analysesApi.run({ jobId, cvId }); // returns final
      const score = Number(a.score ?? 0);
      setResult(a);
      appendMsg({
        role: "bot",
        text: `${tt("chat.done")} • ${tt("chat.score")}: ${score.toFixed(2)}`,
      });
    } catch (e: any) {
      appendMsg({ role: "bot", text: formatError(e), kind: "error" });
    } finally {
      setLoading(false);
    }
  };

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

              <div className="max-h-[72vh] overflow-auto px-5 py-5 space-y-4 bg-[var(--surface)]/72">
                <div className="space-y-2">
                  {msgs.map((m, i) => (
                    <div
                      key={`${m.role}-${i}-${m.text.slice(0, 12)}`}
                      className={clsx(
                        "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-sm",
                        m.role === "user"
                          ? "ms-auto bg-gradient-to-l from-[var(--color-primary)] via-[#ff9440] to-[var(--color-accent)] text-white shadow-lg"
                          : m.role === "sys"
                            ? "mx-auto bg-[var(--surface-muted)]/80 text-[11px] text-[var(--color-text-muted)]"
                            : "me-auto border border-[var(--color-border)] bg-[var(--surface)] text-[var(--foreground)]"
                      )}
                    >
                      {m.text}
                    </div>
                  ))}
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
                      >
                        <option value="">{tt("chat.pickCv")}</option>
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
                      >
                        <option value="">
                          {tt("chat.secondCvPlaceholder")}
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
                      >
                        <option value="">{tt("chat.pickJob")}</option>
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
                                value={Number(
                                  result.score ?? metrics?.weightedScore ?? 0
                                )}
                              />
                            </div>
                            <div className="space-y-3">
                              <div>
                                <div className="text-lg font-semibold text-[var(--color-primary)]">
                                  {tt("chat.score")} •{" "}
                                  {Number(
                                    result.score ?? metrics?.weightedScore ?? 0
                                  ).toFixed(2)}
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
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
