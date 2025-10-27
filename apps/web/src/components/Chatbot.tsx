// apps/web/src/components/Chatbot.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import { MessageCircle, X, Play, Loader2, Wand2 } from "lucide-react";
import ScoreGauge from "./ui/ScoreGauge";
import { type Lang, t } from "@/lib/i18n";
import { cvApi } from "@/services/api/cv";
import { jobsApi } from "@/services/api/jobs";
import { analysesApi, type Analysis } from "@/services/api/analyses";

type MsgRole = "bot" | "user" | "sys";
type Msg = { role: MsgRole; text: string; kind?: "intro" | "error" | "info" };

const CHAT_STORAGE_KEY = "cv-chat-history-v2";
const MAX_SELECTED = 4;

type CompletedEventDetail = {
  analysis: Analysis;
  job?: { id?: string | null } | null;
};

/** Safe helper to read language from localStorage (client-only). */
function getLangFromStorage(): Lang {
  try {
    if (typeof window !== "undefined") {
      return (window.localStorage.getItem("lang") as Lang) || "ar";
    }
  } catch {
    // ignore read errors
  }
  return "ar";
}

export default function Chatbot() {
  // Modal state
  const [open, setOpen] = useState(false);

  /**
   * IMPORTANT: Do NOT read localStorage during the initial render.
   * Use a stable default ("ar") and hydrate from localStorage in useEffect.
   * This avoids "localStorage is not defined" on the first render.
   */
  const [lang, setLang] = useState<Lang>("ar");

  // Translation shortcut that re-computes when `lang` changes
  const tt = useMemo(() => (p: string) => t(lang, p), [lang]);

  // Hydrate language after mount and listen for cross-tab changes
  useEffect(() => {
    setLang(getLangFromStorage());
    const onStorage = () => setLang(getLangFromStorage());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Chat log
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const createIntroMessage = useCallback((): Msg => ({
    role: "bot",
    text: tt("chat.hello"),
    kind: "intro",
  }), [tt]);

  // Data for selects
  const [cvs, setCvs] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [cvId, setCvId] = useState("");
  const [jobId, setJobId] = useState("");
  const [compareId, setCompareId] = useState("");
  const [selectedCvIds, setSelectedCvIds] = useState<string[]>([]);

  // Optional JD text → AI suggestion
  const [jd, setJd] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [result, setResult] = useState<Analysis | null>(null);
  const [action, setAction] = useState<"" | "compare" | "pick" | "improve">("");
  const [historyReady, setHistoryReady] = useState(false);

  const appendMsg = useCallback((entry: Msg) => {
    setMsgs((prev) => [...prev, entry]);
  }, []);

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
        const detail = message && !/^http\b/i.test(message) ? message : undefined;
        return withDetails("chat.errorValidation", detail);
      }

      const detail = message && !/^http\b/i.test(message) ? message : undefined;
      return withDetails("chat.errorGeneric", detail);
    },
    [tt]
  );

  // When the chat opens, fetch CVs and Jobs
  useEffect(() => {
    if (!open) return;
    cvApi
      .list()
      .then((r) => setCvs(r.items))
      .catch(() => {});
    jobsApi
      .list()
      .then((r) => setJobs(r.items))
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
    const onCompleted = (event: Event) => {
      const detail = (event as CustomEvent<CompletedEventDetail>).detail;
      if (!detail?.analysis) return;
      const analysis: Analysis = detail.analysis;
      setResult(analysis);
      if (detail?.job?.id) setJobId(detail.job.id);
      if (analysis.cvId) setCvId(analysis.cvId);
      appendMsg({
        role: "bot",
        text: `${tt("chat.done")} • ${tt("chat.score")}: ${Number(analysis.score ?? 0).toFixed(2)}`,
      });
    };
    window.addEventListener("analysis:completed", onCompleted as EventListener);
    return () => window.removeEventListener("analysis:completed", onCompleted as EventListener);
  }, [tt, appendMsg]);

  // Ask AI to suggest requirements from a JD blob
  const handleSuggest = async () => {
    if (!jd.trim()) return;
    try {
      setSuggesting(true);
      const r = await jobsApi.suggestFromJD(jd);
      const mustTag = tt("chat.mustTag");
      const weightLabel = tt("chat.weightLabel");
      appendMsg({
        role: "bot",
        text:
          `✅ ${tt("chat.aiSuggested")}:\n– ` +
          r.items
            .map(
              (i) =>
                `${i.requirement}${i.mustHave ? ` (${mustTag})` : ""} • ${weightLabel} ${i.weight}`
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
      const details = res.insights?.length ? `\n${res.insights.join("\n")}` : "";
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
      const res = await analysesApi.pickBest({ jobId, cvIds: list as string[] });
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
              transition={{ type: 'spring', stiffness: 160, damping: 18 }}
              className="absolute bottom-0 end-0 m-6 w-[min(500px,calc(100vw-3rem))] overflow-hidden rounded-[32px] bg-[var(--surface)]/90 text-[var(--foreground)] shadow-2xl shadow-[rgba(17,24,39,0.25)]"
            >
              <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)]/60 bg-[var(--surface)]/90 px-5 py-4">
                <div>
                  <div className="text-sm font-semibold text-[var(--color-primary)]">
                    {tt('chat.title')}
                  </div>
                  <div className="text-[11px] text-[var(--color-text-muted)]">
                    {tt('chat.subtitle')}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={resetConversation}
                    className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs font-medium text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition"
                  >
                    {tt('chat.reset')}
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
                        'max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-sm',
                        m.role === 'user'
                          ? 'ms-auto bg-gradient-to-l from-[var(--color-primary)] via-[#ff9440] to-[var(--color-accent)] text-white shadow-lg'
                          : m.role === 'sys'
                            ? 'mx-auto bg-[var(--surface-muted)]/80 text-[11px] text-[var(--color-text-muted)]'
                            : 'me-auto border border-[var(--color-border)] bg-[var(--surface)] text-[var(--foreground)]'
                      )}
                    >
                      {m.text}
                    </div>
                  ))}
                </div>

                <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--surface)]/95 p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-[var(--color-primary)]">
                      {tt('chat.jdTitle')}
                    </div>
                    <button
                      onClick={() => setJd('')}
                      className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
                    >
                      {tt('chat.clear')}
                    </button>
                  </div>
                  <textarea
                    value={jd}
                    onChange={(e) => setJd(e.target.value)}
                    className="mt-2 w-full min-h-[120px] rounded-2xl border border-[var(--color-border)] bg-[var(--surface-soft)]/70 px-3 py-3 text-sm focus:border-[var(--color-primary)] focus:outline-none"
                    placeholder={tt('chat.jdPlaceholder')}
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
                      {suggesting ? tt('chat.extracting') : tt('chat.suggest')}
                    </button>
                    <span className="text-[11px] text-[var(--color-text-muted)]">
                      {tt('chat.jdHint')}
                    </span>
                  </div>
                </div>

                <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--surface)]/95 p-4 shadow-sm space-y-3">
                  <div className="grid gap-3">
                    <label className="text-xs font-semibold text-[var(--color-text-muted)]">
                      {tt('chat.pickCv')}
                      <select
                        value={cvId}
                        onChange={(e) => setCvId(e.target.value)}
                        className="mt-1 w-full rounded-2xl border border-[var(--color-border)] bg-[var(--surface-soft)]/70 px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
                      >
                        <option value="">{tt('chat.pickCv')}</option>
                        {cvs.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.originalFilename || c.id.slice(0, 12)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="text-xs font-semibold text-[var(--color-text-muted)]">
                      {tt('chat.secondCv')}
                      <select
                        value={compareId}
                        onChange={(e) => setCompareId(e.target.value)}
                        className="mt-1 w-full rounded-2xl border border-[var(--color-border)] bg-[var(--surface-soft)]/70 px-3 py-2 text-sm focus:border-[var(--color-secondary)] focus:outline-none"
                      >
                        <option value="">{tt('chat.secondCvPlaceholder')}</option>
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
                      {tt('chat.pickJob')}
                      <select
                        value={jobId}
                        onChange={(e) => setJobId(e.target.value)}
                        className="mt-1 w-full rounded-2xl border border-[var(--color-border)] bg-[var(--surface-soft)]/70 px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
                      >
                        <option value="">{tt('chat.pickJob')}</option>
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
                      {tt('chat.addSelection')}
                    </button>
                    {selectedCvIds.length ? (
                      <span>{tt('chat.selectedHint')}</span>
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
                      {loading ? tt('chat.running') : tt('chat.run')}
                    </button>
                    <button
                      onClick={handleCompare}
                      disabled={action === 'compare'}
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-[var(--color-secondary)]/60 bg-[var(--surface-muted)]/60 px-4 py-2 text-sm font-semibold text-[var(--color-secondary)] hover:border-[var(--color-secondary)]"
                    >
                      {action === 'compare' ? (
                        <Loader2 className="animate-spin" size={16} />
                      ) : null}
                      {tt('chat.compare')}
                    </button>
                    <button
                      onClick={handlePickBest}
                      disabled={action === 'pick'}
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-[var(--color-primary)]/40 bg-[var(--surface-soft)] px-4 py-2 text-sm font-semibold text-[var(--color-primary)] hover:border-[var(--color-primary)]"
                    >
                      {action === 'pick' ? (
                        <Loader2 className="animate-spin" size={16} />
                      ) : null}
                      {tt('chat.pickBest')}
                    </button>
                    <button
                      onClick={handleImprove}
                      disabled={action === 'improve'}
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
                    >
                      {action === 'improve' ? (
                        <Loader2 className="animate-spin" size={16} />
                      ) : null}
                      {tt('chat.improve')}
                    </button>
                  </div>
                </div>

                {result && (
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl border border-[var(--color-border)] bg-[var(--surface)]/95 p-4 shadow-sm space-y-4"
                  >
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-[160px_1fr]">
                      <div className="grid place-items-center rounded-2xl bg-[var(--surface-muted)]/60 p-4">
                        <ScoreGauge value={Number(result.score || 0)} />
                      </div>
                      <div className="space-y-2">
                        <div className="text-lg font-semibold text-[var(--color-primary)]">
                          {tt('chat.score')} • {Number(result.score || 0).toFixed(2)}
                        </div>
                        <div className="text-xs text-[var(--color-text-muted)]">
                          model: {result.model} • status: {result.status}
                        </div>
                        {result.gaps && (
                          <div className="flex flex-wrap gap-2 text-[11px]">
                            {result.gaps.mustHaveMissing?.map((g) => (
                              <span
                                key={`must-${g}`}
                                className="rounded-full bg-[#fee4e2] px-2 py-1 text-[#b42318]"
                              >
                                Must: {g}
                              </span>
                            ))}
                            {result.gaps.improve?.map((g) => (
                              <span
                                key={`imp-${g}`}
                                className="rounded-full bg-[#fef0c7] px-2 py-1 text-[#b54708]"
                              >
                                Improve: {g}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {Array.isArray(result.breakdown) && result.breakdown.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-sm font-semibold text-[var(--color-text-muted)]">
                          Breakdown
                        </div>
                        <div className="max-h-64 space-y-2 overflow-auto pr-1">
                          {result.breakdown.map((r: any, idx: number) => (
                            <div
                              key={`row-${idx}`}
                              className="rounded-xl border border-[var(--color-border)] bg-[var(--surface-soft)]/60 px-3 py-2 text-xs"
                            >
                              <div className="text-sm font-medium text-[var(--foreground)]">
                                {r.requirement}
                              </div>
                              <div className="text-[11px] text-[var(--color-text-muted)]">
                                must:{r.mustHave ? '✓' : '—'} • weight: {r.weight} • sim: {(r.similarity * 100).toFixed(1)}% • score: {Number(r.score10 || 0).toFixed(1)}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
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
