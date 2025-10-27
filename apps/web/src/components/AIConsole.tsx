// apps/web/src/components/AIConsole.tsx
"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
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
} from "lucide-react";
import { cvApi, type UploadCVResponse } from "@/services/api/cv";
import { jobsApi, type JobRequirement, type Job } from "@/services/api/jobs";
import {
  analysesApi,
  type Analysis,
  type AnalysisMetrics,
  type PerRequirement,
} from "@/services/api/analyses";
import type { Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import RequirementPicker, {
  type ReqItem,
} from "@/components/RequirementPicker";

/** Chat message shape */
type Msg = {
  id: string;
  role: "bot" | "user" | "sys";
  content: React.ReactNode;
};

function getLangFromStorage(): Lang {
  try {
    if (typeof window !== "undefined") {
      return (window.localStorage.getItem("lang") as Lang) || "ar";
    }
  } catch {}
  return "ar";
}
function useLang(): Lang {
  const [lang, setLang] = React.useState<Lang>("ar");
  React.useEffect(() => {
    setLang(getLangFromStorage());
    const onStorage = () => setLang(getLangFromStorage());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return lang;
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
      const mustHave = parts.some((p) => /^must/i.test(p) || /^ضروري/.test(p));
      const weightPart = parts.find((p) => /^\d+(\.\d+)?$/.test(p));
      const weight = weightPart ? Number(weightPart) : 1;
      return { requirement, mustHave, weight };
    });
}

type BroadcastPayload = {
  analysis: Analysis;
  job?: Job | null;
  cv?: UploadCVResponse | null;
  fileName?: string | null;
  source?: string;
};

const riskCopy: Record<
  string,
  { ar: string; en: string }
> = {
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
    ? input.filter((item): item is string => typeof item === "string")
    : [];

function getRiskLabel(flag: string, lang: Lang): string {
  const entry = riskCopy[flag];
  if (!entry) return flag;
  return lang === "ar" ? entry.ar : entry.en;
}

function computeMetricsFromResult(result: Analysis | null): AnalysisMetrics | null {
  if (!result) return null;
  if (result.metrics) return result.metrics;
  const breakdown = Array.isArray(result.breakdown) ? result.breakdown : [];
  if (!breakdown.length) return null;

  const must = breakdown.filter((item) => item.mustHave);
  const nice = breakdown.filter((item) => !item.mustHave);
  const sumScore = (items: typeof breakdown) =>
    items.reduce((acc, item) => acc + Number(item.score10 ?? item.similarity * 10), 0);
  const percent = (items: typeof breakdown) =>
    items.length ? Number(((sumScore(items) / (items.length * 10)) * 100).toFixed(2)) : 0;

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

export default function AIConsole() {
  const lang = useLang();
  const tt = (k: string) => t(lang, k);

  const [messages, setMessages] = React.useState<Msg[]>([
    {
      id: "m0",
      role: "bot",
      content: (
        <div>
          <div className="font-semibold">{tt("chat.title")}</div>
          <div className="text-sm opacity-80 mt-1">{tt("chat.hello")}</div>
          <ul className="text-xs opacity-70 mt-2 list-disc ps-5">
            <li>
              1) اكتب المتطلبات (سطر لكل متطلب) مع must و/أو وزن (مثال: 2).
            </li>
            <li>2) ارفع الـCV (PDF/DOCX).</li>
            <li>3) اضغط {tt("chat.run")} لعرض النتيجة.</li>
          </ul>
        </div>
      ),
    },
  ]);

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

  const listRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, result]);

  const push = (m: Omit<Msg, "id">) =>
    setMessages((s) => [
      ...s,
      { ...m, id: Math.random().toString(36).slice(2) },
    ]);

  const metrics = React.useMemo(() => computeMetricsFromResult(result), [result]);
  const riskMessages = React.useMemo(
    () => (metrics ? metrics.riskFlags.map((flag) => getRiskLabel(flag, lang)) : []),
    [metrics, lang]
  );
  const canExport = Boolean(result && (result.breakdown?.length || metrics));
  const createdAtLabel = React.useMemo(() => {
    if (!result?.createdAt) return "";
    try {
      return new Date(result.createdAt).toLocaleString(
        lang === "ar" ? "ar-SA" : "en-US",
        { dateStyle: "medium", timeStyle: "short" }
      );
    } catch {
      return result.createdAt;
    }
  }, [result?.createdAt, lang]);

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

  // إدراج بند من RequirementPicker إلى الـtextarea مباشرة (بدون تغيير لوجيك التحليل)
  const onQuickAdd = (item: ReqItem) => {
    const line = `${item.requirement}${item.mustHave ? ", must" : ""}, ${item.weight}`;
    setReqText((prev) => (prev ? `${prev}\n${line}` : line));
  };

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    if (!f) return;
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
    if (!result?.breakdown?.length) return;
    const header = ["Requirement", "Must", "Weight", "Similarity", "Score/10"];
    const rows = result.breakdown.map((item) => [
      item.requirement,
      item.mustHave ? "yes" : "no",
      item.weight,
      (item.similarity * 100).toFixed(1) + "%",
      Number(item.score10 ?? 0).toFixed(1),
    ]);
    const csv = [header, ...rows]
      .map((columns) =>
        columns.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const safeTitle = jobInfo?.title?.replace(/[^\w]+/g, "-")?.toLowerCase()?.slice(0, 40);
    const name = safeTitle ? `analysis-${safeTitle}.csv` : `analysis-${Date.now()}.csv`;
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
          </tr>
        `
      )
      .join("");

    const metricsBlock = metrics
      ? `
        <section>
          <h2 style="margin-bottom:6px;font-size:14px;">Metrics</h2>
          <ul style="padding-left:16px; margin:0 0 12px 0;">
            <li>Must match: ${metrics.mustPercent.toFixed(1)}%</li>
            <li>Nice-to-have: ${metrics.nicePercent.toFixed(1)}%</li>
            <li>Score /10: ${metrics.weightedScore.toFixed(1)}</li>
          </ul>
        </section>
      `
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
      </html>
    `;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
  }, [result, jobInfo?.title, metrics]);

  const openDashboard = React.useCallback(() => {
    if (!result?.id) return;
    window.open(`/analysis/${result.id}`, "_blank");
  }, [result?.id]);

  const run = async () => {
    if (!cvFile || reqs.length === 0) {
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
      const job = await jobsApi.create({
        title: title || (lang === "ar" ? "وظيفة بدون عنوان" : "Untitled Job"),
        description: description || "—",
        requirements: reqs,
      });
      setJobInfo(job);
      const uploaded = await cvApi.upload(cvFile);
      setCvInfo(uploaded);
      const a = await analysesApi.run({ jobId: job.id, cvId: uploaded.cvId });

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

      const final = await analysesApi.get(a.id);
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
                  must-missing: {final.gaps.mustHaveMissing?.join(", ") || "—"}
                </div>
                <div>improve: {final.gaps.improve?.join(", ") || "—"}</div>
              </div>
            )}
          </div>
        ),
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : typeof error === "string" ? error : "failed";
      push({
        role: "bot",
        content: (
          <div className="text-sm text-red-600">
            Error: {message}
          </div>
        ),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="relative overflow-hidden rounded-[32px] border border-[#FFB26B]/60 bg-white/90 shadow-[0_24px_60px_-28px_rgba(255,122,0,0.55)] dark:border-[#FFB26B]/30 dark:bg-[#1F140D]/90">
        <div className="pointer-events-none absolute -left-28 -top-24 h-72 w-72 rounded-full bg-[#FFEDD8]/70 blur-3xl" />
        <div className="pointer-events-none absolute -right-24 -bottom-36 h-80 w-80 rounded-full bg-[#FFD7A8]/60 blur-[110px]" />

        <div className="flex flex-col gap-3 border-b border-[#FFE0C2]/70 px-6 pb-4 pt-6 dark:border-[#FFB26B]/20">
          <div className="text-[11px] font-semibold uppercase tracking-[0.35em] text-[#FF7A00]">
            AI Console
          </div>
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
            <div>
              <h2 className="text-2xl font-semibold text-[#2F3A4A] dark:text-[#FFE7CF]">
                {t(lang, "app")}
              </h2>
              <p className="text-sm text-[#5C6475] dark:text-[#FFE7CF]/70">
                {lang === "ar"
                  ? "حمّل وصف الوظيفة والسيرة الذاتية لتحصل على تحليل فوري جاهز للتصدير."
                  : "Drop the job profile and CV to get instant, export-ready analytics."}
              </p>
            </div>
            {result?.id && (
              <button
                onClick={openDashboard}
                className="inline-flex items-center gap-2 self-start rounded-full border border-[#FF7A00]/40 bg-white/80 px-4 py-2 text-sm font-semibold text-[#D85E00] shadow-sm transition hover:bg-[#FF7A00]/15 dark:bg-[#2D1A0D] dark:text-[#FFB26B]"
              >
                <ArrowUpRight className="h-4 w-4" />
                {tt("chat.viewFull")}
              </button>
            )}
          </div>
        </div>

        <div
          ref={listRef}
          className="space-y-2 max-h-[55vh] overflow-y-auto px-6 py-4"
          aria-live="polite"
        >
          <AnimatePresence initial={false}>
            {messages.map((m) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className={
                  m.role === "user"
                    ? "ms-auto max-w-[85%] rounded-3xl bg-gradient-to-r from-[#FF7A00] to-[#FF8F32] px-4 py-2 text-sm text-white shadow-lg shadow-[#FF8F32]/30"
                    : m.role === "sys"
                      ? "mx-auto max-w-[85%] rounded-2xl border border-[#FFB26B]/40 bg-white/80 px-3 py-2 text-xs text-[#C25E00] dark:border-[#FFB26B]/20 dark:bg-[#2D1A0D] dark:text-[#FFB26B]"
                      : "me-auto max-w-[85%] rounded-3xl border border-[#FFD7A8]/60 bg-white/90 px-4 py-2 text-sm text-[#2F3A4A] shadow-sm dark:border-[#FFB26B]/20 dark:bg-[#27160E] dark:text-[#FFE7CF]"
                }
              >
                {m.content}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <div className="space-y-3 border-t border-[#FFE0C2]/70 px-6 py-5 dark:border-[#FFB26B]/20">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              placeholder={
                lang === "ar" ? "عنوان الوظيفة" : "Job title"
              }
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded-2xl border border-[#FFD7A8]/70 bg-white/80 px-3 py-2 text-sm text-[#2F3A4A] shadow-inner dark:border-[#FFB26B]/30 dark:bg-[#2D1A0D] dark:text-[#FFE7CF]"
            />
            <input
              placeholder={
                lang === "ar"
                  ? "وصف مختصر للوظيفة"
                  : "Job description"
              }
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="rounded-2xl border border-[#FFD7A8]/70 bg-white/80 px-3 py-2 text-sm text-[#2F3A4A] shadow-inner dark:border-[#FFB26B]/30 dark:bg-[#2D1A0D] dark:text-[#FFE7CF]"
            />
          </div>

          <div className="rounded-[28px] border border-[#FFD7A8]/70 bg-[#FFF7F0]/80 p-4 shadow-inner dark:border-[#FFB26B]/30 dark:bg-[#2A180F]">
            <div className="mb-2 flex items-center justify-between text-xs text-[#5C6475] dark:text-[#FFE7CF]/70">
              <span>
                {lang === "ar"
                  ? "أضف المتطلبات (سطر لكل متطلب، يمكن إضافة must أو وزن)"
                  : "Add requirements (one per line, you can mark must/weight)"}
              </span>
            </div>

            <div className="mb-3">
              <RequirementPicker onAdd={onQuickAdd} />
            </div>

            <textarea
              value={reqText}
              onChange={(e) => setReqText(e.target.value)}
              rows={4}
              placeholder={
                lang === "ar"
                  ? `مثال:\nReact, must, 2\nTypeScript, 1\nTailwind`
                  : `Example:\nReact, must, 2\nTypeScript, 1\nTailwind`
              }
              className="w-full rounded-2xl border border-[#FFD7A8]/70 bg-white/90 px-3 py-3 text-sm text-[#2F3A4A] shadow-inner focus:border-[#FF7A00] focus:outline-none dark:border-[#FFB26B]/30 dark:bg-[#2D1A0D] dark:text-[#FFE7CF]"
            />

            <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <label
                htmlFor="cvfile"
                className="inline-flex items-center gap-3 text-sm font-medium text-[#2F3A4A] dark:text-[#FFE7CF]"
              >
                <span className="size-10 grid place-items-center rounded-2xl bg-gradient-to-br from-[#FF7A00] to-[#FF9B3D] text-white shadow-md">
                  <Paperclip className="size-4" />
                </span>
                <input
                  id="cvfile"
                  type="file"
                  accept=".pdf,.doc,.docx"
                  onChange={onPickFile}
                  className="hidden"
                />
                <span className="max-w-[220px] truncate">
                  {fileLabel
                    ? fileLabel
                    : lang === "ar"
                      ? "أرفق CV (PDF / Word)"
                      : "Attach CV (PDF / Word)"}
                </span>
              </label>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={onSendReqs}
                  className="inline-flex items-center gap-2 rounded-full border border-[#FFB26B]/60 bg-white/80 px-4 py-2 text-sm font-semibold text-[#D85E00] transition hover:bg-[#FF7A00]/10 dark:border-[#FFB26B]/30 dark:bg-[#2D1A0D] dark:text-[#FFB26B]"
                >
                  <Sparkles className="h-4 w-4" />
                  {lang === "ar" ? "أضف المتطلبات" : "Add requirements"}
                </button>
                <button
                  onClick={run}
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#FF7A00] to-[#FF8F32] px-5 py-2 text-sm font-semibold text-white shadow-lg transition hover:brightness-105 disabled:opacity-40"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {loading
                    ? lang === "ar"
                      ? "جاري التحليل…"
                      : "Analyzing…"
                    : tt("chat.run")}
                </button>
              </div>
            </div>

            {cvInfo && (
              <div className="mt-2 text-[11px] text-[#5C6475] dark:text-[#FFE7CF]/60">
                {lang === "ar"
                  ? `طول النص المستخرج: ${cvInfo.textLength ?? 0} حرف • ${cvInfo.parsed ? "جاهز للتحليل" : "نص قليل"}`
                  : `Extracted text: ${cvInfo.textLength ?? 0} chars • ${cvInfo.parsed ? "Ready" : "Needs clearer source"}`}
              </div>
            )}
          </div>
        </div>
      </div>

      {result && (
        <section className="rounded-[32px] border border-[#FFB26B]/60 bg-[#FFF7F0]/90 p-6 shadow-[0_18px_50px_-32px_rgba(216,94,0,0.6)] dark:border-[#FFB26B]/30 dark:bg-[#24150F]">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.35em] text-[#FF7A00]">
                {tt("chat.summaryTitle")}
              </div>
              <h3 className="mt-2 text-xl font-semibold text-[#2F3A4A] dark:text-[#FFE7CF]">
                {jobInfo?.title || (lang === "ar" ? "تحليل بدون عنوان" : "Untitled analysis")}
              </h3>
              <p className="mt-1 text-sm text-[#5C6475] dark:text-[#FFE7CF]/70">
                {lang === "ar"
                  ? `ملف: ${fileLabel || "—"} • ${createdAtLabel}`
                  : `File: ${fileLabel || "—"} • ${createdAtLabel}`}
              </p>
              {cvInfo?.publicUrl && (
                <a
                  href={cvInfo.publicUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-2 text-xs font-semibold text-[#D85E00] hover:text-[#FF7A00] dark:text-[#FFB26B]"
                >
                  <FileText className="h-3.5 w-3.5" />
                  {lang === "ar" ? "افتح السيرة الذاتية" : "Open CV"}
                </a>
              )}
            </div>
            {canExport && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={exportBreakdownAsPdf}
                  className="inline-flex items-center gap-2 rounded-full border border-[#FFB26B]/60 bg-white/80 px-4 py-2 text-xs font-semibold text-[#D85E00] shadow-sm transition hover:bg-[#FF7A00]/10 dark:border-[#FFB26B]/30 dark:bg-[#2D1A0D] dark:text-[#FFB26B]"
                >
                  <FileDown className="h-4 w-4" /> {tt("chat.exportPdf")}
                </button>
                <button
                  onClick={exportBreakdownAsCsv}
                  className="inline-flex items-center gap-2 rounded-full border border-[#FFB26B]/60 bg-white/80 px-4 py-2 text-xs font-semibold text-[#D85E00] shadow-sm transition hover:bg-[#FF7A00]/10 dark:border-[#FFB26B]/30 dark:bg-[#2D1A0D] dark:text-[#FFB26B]"
                >
                  <Download className="h-4 w-4" /> {tt("chat.exportCsv")}
                </button>
              </div>
            )}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-[#FFD7A8]/70 bg-white/80 p-4 shadow-sm dark:border-[#FFB26B]/30 dark:bg-[#2D1A0D]">
              <div className="text-xs font-semibold uppercase text-[#D85E00]">
                Score /10
              </div>
              <div className="mt-2 text-3xl font-bold text-[#2F3A4A] dark:text-[#FFE7CF]">
                {Number(result.score ?? 0).toFixed(2)}
              </div>
              <div className="mt-3 h-2 w-full rounded-full bg-[#FFE0C2]/80 dark:bg-[#3A2215]">
                <div
                  className="h-2 rounded-full bg-gradient-to-r from-[#FF7A00] to-[#FF8F32]"
                  style={{ width: `${Math.min(100, Number(result.score ?? 0) * 10)}%` }}
                />
              </div>
            </div>

            <div className="rounded-2xl border border-[#FFD7A8]/70 bg-white/80 p-4 shadow-sm dark:border-[#FFB26B]/30 dark:bg-[#2D1A0D]">
              <div className="text-xs font-semibold uppercase text-[#D85E00]">
                {tt("chat.mustPercent")}
              </div>
              <div className="mt-2 text-3xl font-bold text-[#2F3A4A] dark:text-[#FFE7CF]">
                {metrics ? formatPercent(metrics.mustPercent) : "—"}
              </div>
              <div className="mt-3 h-2 w-full rounded-full bg-[#FFE0C2]/80 dark:bg-[#3A2215]">
                <div
                  className="h-2 rounded-full bg-gradient-to-r from-[#FF7A00] to-[#FFB26B]"
                  style={{ width: `${metrics ? Math.min(100, metrics.mustPercent) : 0}%` }}
                />
              </div>
            </div>

            <div className="rounded-2xl border border-[#FFD7A8]/70 bg-white/80 p-4 shadow-sm dark:border-[#FFB26B]/30 dark:bg-[#2D1A0D]">
              <div className="text-xs font-semibold uppercase text-[#D85E00]">
                {tt("chat.nicePercent")}
              </div>
              <div className="mt-2 text-3xl font-bold text-[#2F3A4A] dark:text-[#FFE7CF]">
                {metrics ? formatPercent(metrics.nicePercent) : "—"}
              </div>
              <div className="mt-3 h-2 w-full rounded-full bg-[#FFE0C2]/80 dark:bg-[#3A2215]">
                <div
                  className="h-2 rounded-full bg-gradient-to-r from-[#FFD7A8] to-[#FF7A00]"
                  style={{ width: `${metrics ? Math.min(100, metrics.nicePercent) : 0}%` }}
                />
              </div>
            </div>
          </div>

          {metrics && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#FFD7A8]/60 bg-white/80 px-3 py-1 text-xs font-medium text-[#2F3A4A] dark:border-[#FFB26B]/30 dark:bg-[#2D1A0D] dark:text-[#FFE7CF]">
              <ShieldCheck className="h-3.5 w-3.5" />
              {tt("chat.gatePassed")}:{" "}
              <span className="font-semibold">
                {metrics.gatePassed
                  ? lang === "ar"
                    ? "نعم"
                    : "Yes"
                  : lang === "ar"
                    ? "لا"
                    : "No"}
              </span>
            </div>
          )}

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-[#FFD7A8]/70 bg-white/90 p-4 shadow-sm dark:border-[#FFB26B]/30 dark:bg-[#2D1A0D]">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#D85E00] dark:text-[#FFB26B]">
                <Sparkles className="h-4 w-4" /> {tt("chat.strengths")}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {metrics?.topStrengths?.length ? (
                  metrics.topStrengths.map((item) => (
                    <span
                      key={item.requirement}
                      className="rounded-full bg-[#FFFAF2] px-3 py-1 text-xs font-medium text-[#C25E00] shadow-sm dark:bg-[#3A2215] dark:text-[#FFB26B]"
                    >
                      {item.requirement} • {item.score.toFixed(1)}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-[#5C6475] dark:text-[#FFE7CF]/70">
                    {lang === "ar" ? "لا توجد نقاط قوة واضحة بعد." : "No strong matches yet."}
                  </span>
                )}
              </div>
            </div>
            <div className="rounded-2xl border border-[#FFD7A8]/70 bg-white/90 p-4 shadow-sm dark:border-[#FFB26B]/30 dark:bg-[#2D1A0D]">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#B34700] dark:text-[#FFB26B]">
                <AlertTriangle className="h-4 w-4" /> {tt("chat.risks")}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {riskMessages.length ? (
                  riskMessages.map((msg, idx) => (
                    <span
                      key={idx}
                      className="rounded-full bg-[#FFF0E0] px-3 py-1 text-xs text-[#B34700] dark:bg-[#3A2215] dark:text-[#FFB26B]"
                    >
                      {msg}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-[#5C6475] dark:text-[#FFE7CF]/70">
                    {lang === "ar" ? "لا توجد تحذيرات." : "No risks detected."}
                  </span>
                )}
              </div>

              {metrics?.missingMust?.length ? (
                <div className="mt-3">
                  <div className="text-xs font-semibold text-[#B34700] dark:text-[#FFB26B]">
                    {tt("chat.missingMust")}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {metrics.missingMust.map((item) => (
                      <span
                        key={`miss-${item}`}
                        className="rounded-full bg-[#FFE0C2] px-2 py-1 text-[11px] text-[#7A2F00] dark:bg-[#3A2215] dark:text-[#FFB26B]"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {metrics?.improvement?.length ? (
                <div className="mt-3">
                  <div className="text-xs font-semibold text-[#B34700] dark:text-[#FFB26B]">
                    {tt("chat.improvements")}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {metrics.improvement.map((item) => (
                      <span
                        key={`imp-${item}`}
                        className="rounded-full bg-[#FFF5EA] px-2 py-1 text-[11px] text-[#7A2F00] dark:bg-[#3A2215] dark:text-[#FFB26B]"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {Array.isArray(result.breakdown) && result.breakdown.length > 0 && (
            <div className="mt-6 overflow-hidden rounded-[24px] border border-[#FFD7A8]/70 bg-white/95 shadow-sm dark:border-[#FFB26B]/30 dark:bg-[#2A180F]">
              <table className="w-full text-sm text-[#2F3A4A] dark:text-[#FFE7CF]">
                <thead className="bg-[#FFF0E0] text-xs uppercase text-[#B34700] dark:bg-[#3A2215] dark:text-[#FFB26B]">
                  <tr>
                    <th className="px-4 py-3 text-start">{lang === "ar" ? "المتطلب" : "Requirement"}</th>
                    <th className="px-3 py-3 text-center">Must</th>
                    <th className="px-3 py-3 text-center">{lang === "ar" ? "الوزن" : "Weight"}</th>
                    <th className="px-3 py-3 text-center">Sim%</th>
                    <th className="px-3 py-3 text-center">Score/10</th>
                    <th className="px-4 py-3 text-start">{lang === "ar" ? "دليل" : "Evidence"}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.breakdown.map((r, idx) => (
                    <tr
                      key={idx}
                      className="border-t border-[#FFE0C2]/70 last:border-b-0 dark:border-[#3A2215]"
                    >
                      <td className="px-4 py-3 align-top">
                        <div className="font-medium">{r.requirement}</div>
                      </td>
                      <td className="px-3 py-3 text-center align-top">{r.mustHave ? "✓" : "—"}</td>
                      <td className="px-3 py-3 text-center align-top">{r.weight}</td>
                      <td className="px-3 py-3 text-center align-top">{(r.similarity * 100).toFixed(1)}%</td>
                      <td className="px-3 py-3 text-center align-top">{Number(r.score10 ?? 0).toFixed(1)}</td>
                      <td className="px-4 py-3 text-xs text-[#5C6475] dark:text-[#FFE7CF]/70">
                        {r.bestChunk?.excerpt ? r.bestChunk.excerpt : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <div className="pb-8 text-center text-xs text-[#5C6475] dark:text-[#FFE7CF]/70">
        Next.js • Tailwind • Prisma • OpenAI
      </div>
    </div>
  );
}
