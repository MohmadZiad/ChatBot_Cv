// apps/web/src/components/Chatbot.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MessageCircle, X, Play, Loader2, Wand2 } from "lucide-react";
import ScoreGauge from "./ui/ScoreGauge";
import { type Lang, t } from "@/lib/i18n";
import { cvApi } from "@/services/api/cv";
import { jobsApi } from "@/services/api/jobs";
import { analysesApi, type Analysis } from "@/services/api/analyses";

type Msg = { role: "bot" | "user" | "sys"; text: string };

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
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "bot", text: tt("chat.hello") },
  ]);

  // Data for selects
  const [cvs, setCvs] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [cvId, setCvId] = useState("");
  const [jobId, setJobId] = useState("");

  // Optional JD text → AI suggestion
  const [jd, setJd] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [result, setResult] = useState<Analysis | null>(null);

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

  // Ask AI to suggest requirements from a JD blob
  const handleSuggest = async () => {
    if (!jd.trim()) return;
    try {
      setSuggesting(true);
      const r = await jobsApi.suggestFromJD(jd);
      setMsgs((m) => [
        ...m,
        {
          role: "bot",
          text:
            `✅ ${tt("chat.aiSuggested")}:\n– ` +
            r.items
              .map(
                (i) =>
                  `${i.requirement}${i.mustHave ? " (must)" : ""} • w${i.weight}`
              )
              .join("\n– "),
        },
      ]);
    } catch (e: any) {
      setMsgs((m) => [...m, { role: "bot", text: `AI Error: ${e.message}` }]);
    } finally {
      setSuggesting(false);
    }
  };

  // Run analysis for selected CV + Job
  const run = async () => {
    if (!cvId || !jobId) return;
    setLoading(true);
    setResult(null);
    setMsgs((m) => [...m, { role: "user", text: `${tt("chat.run")} ▶️` }]);
    try {
      const a = await analysesApi.run({ jobId, cvId }); // returns final
      const score = Number(a.score ?? 0);
      setResult(a);
      setMsgs((m) => [
        ...m,
        {
          role: "bot",
          text: `${tt("chat.done")} • ${tt("chat.score")}: ${score.toFixed(2)}`,
        },
      ]);
    } catch (e: any) {
      setMsgs((m) => [...m, { role: "bot", text: `Error: ${e.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Soft background gradients */}
      <div className="fixed inset-0 -z-10 bg-gradient-to-br from-indigo-50 via-white to-pink-50 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900" />
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(600px_250px_at_10%_10%,rgba(99,102,241,.15),transparent_60%),radial-gradient(600px_250px_at_90%_30%,rgba(236,72,153,.15),transparent_60%)]" />

      {/* Floating open button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 end-5 z-[60] size-12 rounded-2xl bg-gradient-to-br from-black to-stone-800 text-white grid place-items-center shadow-xl hover:scale-105 transition"
        aria-label="Open Assistant"
      >
        <MessageCircle />
      </button>

      {/* Chat modal */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-black/30 backdrop-blur-sm"
          >
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              transition={{ type: "spring", stiffness: 130, damping: 16 }}
              className="absolute bottom-0 end-0 m-5 w-[min(460px,calc(100vw-2.5rem))] rounded-3xl border border-white/20 bg-white/80 dark:bg-black/70 shadow-2xl overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-black/10 dark:border-white/10">
                <div className="text-sm font-semibold">{tt("chat.title")}</div>
                <button
                  onClick={() => setOpen(false)}
                  className="size-8 grid place-items-center rounded-lg hover:bg-black/10 dark:hover:bg-white/10"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Body */}
              <div className="max-h-[70vh] overflow-auto p-3 space-y-3">
                {msgs.map((m, i) => (
                  <div
                    key={i}
                    className={
                      m.role === "user"
                        ? "ms-auto max-w-[85%] rounded-2xl bg-blue-600 text-white px-3 py-2 shadow"
                        : m.role === "sys"
                          ? "mx-auto max-w-[85%] rounded-2xl bg-black/5 dark:bg-white/10 px-3 py-2 text-xs"
                          : "me-auto max-w-[85%] rounded-2xl bg-white/70 dark:bg-white/10 px-3 py-2 shadow"
                    }
                  >
                    {m.text}
                  </div>
                ))}

                {/* JD + AI suggestion panel */}
                <div className="rounded-2xl border p-3 bg-white/70 dark:bg-white/5 backdrop-blur">
                  <div className="text-sm font-semibold mb-2">
                    Job Description (اختياري)
                  </div>
                  <textarea
                    value={jd}
                    onChange={(e) => setJd(e.target.value)}
                    className="w-full min-h-[120px] rounded-xl border px-3 py-2 bg-white/70 dark:bg-white/5"
                    placeholder="ألصق وصف الوظيفة هنا ثم اطلب من الذكاء توليد المتطلبات"
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={handleSuggest}
                      disabled={!jd.trim() || suggesting}
                      className="inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40"
                    >
                      <Wand2 size={16} />{" "}
                      {suggesting
                        ? "جارٍ الاستخراج..."
                        : "اقترح المتطلبات بالذكاء"}
                    </button>
                    <button
                      onClick={() => setJd("")}
                      className="rounded-2xl px-4 py-2 bg-black/5 dark:bg-white/10"
                    >
                      مسح
                    </button>
                  </div>
                </div>

                {/* Selects */}
                <div className="rounded-2xl border p-3 bg-white/70 dark:bg-white/5 backdrop-blur space-y-2">
                  <div className="text-xs opacity-70">{tt("chat.pickCv")}</div>
                  <select
                    value={cvId}
                    onChange={(e) => setCvId(e.target.value)}
                    className="w-full rounded-xl border px-3 py-2 bg-white/70 dark:bg-white/5"
                  >
                    <option value="">{tt("chat.pickCv")}</option>
                    {cvs.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.originalFilename || c.id.slice(0, 10)}
                      </option>
                    ))}
                  </select>

                  <div className="text-xs opacity-70 mt-2">
                    {tt("chat.pickJob")}
                  </div>
                  <select
                    value={jobId}
                    onChange={(e) => setJobId(e.target.value)}
                    className="w-full rounded-xl border px-3 py-2 bg-white/70 dark:bg-white/5"
                  >
                    <option value="">{tt("chat.pickJob")}</option>
                    {jobs.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.title}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={run}
                    disabled={!cvId || !jobId || loading}
                    className="mt-2 inline-flex items-center justify-center gap-2 w-full rounded-2xl bg-black text-white px-4 py-2 hover:opacity-90 disabled:opacity-40"
                  >
                    {loading ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Play size={16} />
                    )}
                    {loading ? tt("chat.running") : tt("chat.run")}
                  </button>
                </div>

                {/* Result */}
                {result && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl border p-3 bg-white/70 dark:bg-white/5 backdrop-blur space-y-3"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-[160px_1fr] gap-4">
                      <div className="grid place-items-center">
                        <ScoreGauge value={Number(result.score || 0)} />
                      </div>
                      <div>
                        <div className="font-semibold mb-1">
                          {tt("chat.score")} •{" "}
                          {Number(result.score || 0).toFixed(2)}
                        </div>
                        <div className="text-xs opacity-70">
                          model: {result.model} • status: {result.status}
                        </div>
                        {result.gaps && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {result.gaps.mustHaveMissing?.map((g) => (
                              <span
                                key={"m" + g}
                                className="px-2 py-1 text-xs rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300"
                              >
                                Must: {g}
                              </span>
                            ))}
                            {result.gaps.improve?.map((g) => (
                              <span
                                key={"i" + g}
                                className="px-2 py-1 text-xs rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
                              >
                                Improve: {g}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {Array.isArray(result.breakdown) && (
                      <div className="mt-2">
                        <div className="font-semibold mb-2">Breakdown</div>
                        <div className="space-y-2 max-h-64 overflow-auto pr-1">
                          {result.breakdown.map((r: any, idx: number) => (
                            <div
                              key={idx}
                              className="rounded-xl border px-3 py-2 bg-white/60 dark:bg-white/10"
                            >
                              <div className="text-sm font-medium">
                                {r.requirement}
                              </div>
                              <div className="text-xs opacity-70">
                                must:{r.mustHave ? "✓" : "—"} • weight:
                                {r.weight} • sim:
                                {(r.similarity * 100).toFixed(1)}% • score:
                                {Number(r.score10 || 0).toFixed(1)}
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
