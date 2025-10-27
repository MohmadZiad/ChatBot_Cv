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
import { cvApi, type UploadCVResponse } from "@/services/api/cv";
import { jobsApi, type JobRequirement, type Job } from "@/services/api/jobs";
import {
  type Analysis,
  type AnalysisMetrics,
  type PerRequirement,
} from "@/services/api/analyses"; // use our flexible fetch below
import type { Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import RequirementPicker, {
  type ReqItem,
} from "@/components/RequirementPicker";

/**
 * Lightweight circular score gauge rendered via SVG.
 * Kept inline to avoid missing imports and ensure portability.
 */
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

/** Chat message shape */
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
    ? input.filter((item): item is string => typeof item === "string")
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

export default function AIConsole() {
  const lang = useLang();
  const tt = (k: string) => t(lang, k);

  const [messages, setMessages] = React.useState<Msg[]>(() => [
    buildIntroMessage(lang),
  ]);

  React.useEffect(() => {
    const intro = buildIntroMessage(lang);
    setMessages((prev) => {
      if (!prev.length) return [intro];
      return prev.map((msg) =>
        msg.id === INTRO_MESSAGE_ID && msg.role === "bot"
          ? { ...intro, id: msg.id }
          : msg
      );
    });
  }, [lang]);

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

  const [activeStep, setActiveStep] = React.useState(1);
  const maxStep = React.useMemo(() => {
    if (result) return 4;
    if (cvInfo || cvFile) return 3;
    if (reqs.length) return 3;
    return 2;
  }, [result, cvInfo, cvFile, reqs.length]);
  const prevMaxRef = React.useRef(maxStep);
  React.useEffect(() => {
    if (maxStep > prevMaxRef.current) {
      setActiveStep(maxStep);
    } else if (activeStep > maxStep) {
      setActiveStep(maxStep);
    }
    prevMaxRef.current = maxStep;
  }, [maxStep, activeStep]);
  const goToStep = React.useCallback(
    (step: number) => {
      if (step <= maxStep) setActiveStep(step);
    },
    [maxStep]
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

  const metrics = React.useMemo(
    () => computeMetricsFromResult(result),
    [result]
  );
  const riskMessages = React.useMemo(
    () =>
      metrics ? metrics.riskFlags.map((flag) => getRiskLabel(flag, lang)) : [],
    [metrics, lang]
  );
  const canExport = Boolean(
    result &&
      ((result.breakdown as PerRequirement[] | undefined)?.length || metrics)
  );
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
    // Validate size (<= 20MB)
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
      .map((columns) =>
        columns.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
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

  // Flexible runner that tolerates backend payload shapes (camelCase/snake_case) and returns full error messages
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
    const endpoint = "/api/analyses/run";
    async function post(body: any) {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        let details = `${res.status}`;
        try {
          const data = await res.json();
          details =
            data?.message ||
            data?.error ||
            data?.detail ||
            JSON.stringify(data);
        } catch {
          try {
            details = await res.text();
          } catch {}
        }
        const err = new Error(details || `HTTP ${res.status}`);
        (err as any)._status = res.status;
        (err as any)._body = body;
        throw err;
      }
      return res.json();
    }

    const payloads = [
      // snake_case minimal
      { job_id: jobId, cv_id: cvId },
      // camelCase minimal
      { jobId, cvId },
      // snake_case verbose
      { job_id: jobId, cv_id: cvId, ...extras },
      // camelCase verbose
      { jobId, cvId, ...extras },
    ];

    let lastError: any;
    for (const p of payloads) {
      try {
        return await post(p);
      } catch (e: any) {
        lastError = e;
        if (e?._status !== 422) throw e; // other errors -> stop
        // try next variant
        // eslint-disable-next-line no-console
        console.warn(
          "/api/analyses/run -> 422, retrying with alt payload",
          p,
          e?.message
        );
      }
    }
    throw lastError;
  }

  const run = async () => {
    if (loading) return; // prevent double submit

    // If user forgot to press "Confirm requirements" but textarea has content
    let currentReqs = reqs;
    if ((!currentReqs || currentReqs.length === 0) && reqText.trim()) {
      currentReqs = parseRequirements(reqText);
      setReqs(currentReqs);
    }

    // Validate inputs
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
      const job = await jobsApi.create({
        title: title || (lang === "ar" ? "وظيفة بدون عنوان" : "Untitled Job"),
        description: description || "—",
        requirements: currentReqs,
      });
      setJobInfo(job);
      const uploaded = await cvApi.upload(cvFile);
      setCvInfo(uploaded);

      // Use flexible runner to avoid 422 due to key casing
      const a = await runAnalysisFlexible(job.id, uploaded.cvId);

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

      // Fetch analysis by id (support both shapes: {id} or {analysis: {id}})
      const analysisId: string = a?.id || a?.analysis?.id;
      if (!analysisId) throw new Error("Invalid response: analysis id missing");
      const res2 = await fetch(`/api/analyses/${analysisId}`);
      if (!res2.ok) throw new Error(await res2.text());
      const final: Analysis = await res2.json();

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
              gpt-4o-mini + text-embedding-3-small
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
        <div className="space-y-6">
          <AnimatePresence mode="wait">
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

            {activeStep === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.25 }}
                className="rounded-[28px] border border-[var(--color-border)] bg-[var(--surface)]/95 p-6 shadow-sm space-y-5"
              >
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
                      <div className="flex flex-wrap gap-2 text-[11px] text-[#b42318]">
                        {riskMessages.map((msg) => (
                          <span
                            key={msg}
                            className="inline-flex items-center gap-2 rounded-full bg-[#fee4e2] px-3 py-1"
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
