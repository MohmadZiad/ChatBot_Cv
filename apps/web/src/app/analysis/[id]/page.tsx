// apps/web/src/app/analysis/[id]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";

import ScoreGauge from "@/components/ui/ScoreGauge";
import {
  analysesApi,
  type Analysis,
  type AnalysisMetrics,
} from "@/services/api/analyses";
import { t } from "@/lib/i18n";
import { useLang } from "@/lib/use-lang";

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

export default function ResultDetail() {
  const params = useParams<{ id: string }>();
  const lang = useLang();
  const tt = useMemo(() => (key: string) => t(lang, key), [lang]);

  const [data, setData] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params?.id) return;
    setLoading(true);
    setError(null);
    analysesApi
      .get(params.id)
      .then((res) => setData(res))
      .catch((err: any) => {
        setError(err?.message || "Failed to load analysis");
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [params?.id]);

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
  const scoreValue = Number(data.score ?? metrics?.weightedScore ?? 0);

  return (
    <div className="mx-auto max-w-6xl space-y-8 py-8">
      <header className="flex flex-col gap-2 border-b border-[#ffdcc2]/70 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-[#D85E00]">
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
            <span className="rounded-full border border-[#FFB26B]/50 px-3 py-1">
              {tt("analysisPage.generated")}: {generatedAt}
            </span>
          ) : null}
        </div>
      </header>

      <section className="rounded-3xl border border-[#FFE4C8] bg-white/85 p-6 shadow-sm dark:border-white/10 dark:bg-white/5">
        <div className="grid gap-6 sm:grid-cols-[220px_1fr]">
          <div className="flex flex-col items-center justify-center rounded-3xl bg-gradient-to-br from-[#FF7A00] via-[#FF9440] to-[#A259FF] px-6 py-8 text-white shadow-lg">
            <ScoreGauge value={scoreValue} />
            <div className="mt-4 text-sm font-medium">
              {tt("analysisPage.scoreLabel")} {scoreValue.toFixed(2)} / 10
            </div>
            <div className="mt-1 text-[11px] text-white/70">
              {tt("analysisPage.status")} {data.status}
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#2F3A4A]/70 dark:text-white/70">
              {data.model ? (
                <span className="rounded-full bg-[#FFF2E8] px-3 py-1 text-[#D85E00] dark:bg-white/10 dark:text-white/80">
                  {tt("analysisPage.model")}: {data.model}
                </span>
              ) : null}
              <span className="rounded-full bg-[#FFF2E8] px-3 py-1 text-[#D85E00] dark:bg-white/10 dark:text-white/80">
                {tt("analysisPage.status")}: {data.status}
              </span>
            </div>

            <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-[#FFE4C8] bg-white/70 px-4 py-3 dark:border-white/10 dark:bg-white/5">
                <div className="text-[11px] text-[#2F3A4A]/60 dark:text-white/60">
                  {tt("chat.mustPercent")}
                </div>
                <div className="text-lg font-semibold text-[#D85E00] dark:text-white">
                  {toPercent(metrics?.mustPercent)}
                </div>
              </div>
              <div className="rounded-2xl border border-[#FFE4C8] bg-white/70 px-4 py-3 dark:border-white/10 dark:bg-white/5">
                <div className="text-[11px] text-[#2F3A4A]/60 dark:text-white/60">
                  {tt("chat.nicePercent")}
                </div>
                <div className="text-lg font-semibold text-[#D85E00] dark:text-white">
                  {toPercent(metrics?.nicePercent)}
                </div>
              </div>
              <div className="rounded-2xl border border-[#FFE4C8] bg-white/70 px-4 py-3 dark:border-white/10 dark:bg-white/5">
                <div className="text-[11px] text-[#2F3A4A]/60 dark:text-white/60">
                  {tt("analysisPage.totalRequirements")}
                </div>
                <div className="text-lg font-semibold text-[#D85E00] dark:text-white">
                  {metrics?.totalRequirements ?? data.breakdown.length}
                </div>
              </div>
              <div className="rounded-2xl border border-[#FFE4C8] bg-white/70 px-4 py-3 dark:border-white/10 dark:bg-white/5">
                <div className="text-[11px] text-[#2F3A4A]/60 dark:text-white/60">
                  {tt("chat.gatePassed")}
                </div>
                <div className="text-lg font-semibold text-[#D85E00] dark:text-white">
                  {metrics?.gatePassed ? tt("analysisPage.gatePassed") : tt("analysisPage.gateFailed")}
                </div>
              </div>
            </div>

            {risks.length ? (
              <div className="flex flex-wrap gap-2 text-xs">
                {risks.map((flag) => (
                  <span
                    key={flag}
                    className="inline-flex items-center gap-1 rounded-full bg-[#FEE4E2] px-3 py-1 text-[#B42318]"
                  >
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {riskCopy[flag]?.[lang] ?? flag}
                  </span>
                ))}
              </div>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-[#FFE4C8] bg-white/70 p-4 dark:border-white/10 dark:bg-white/5">
                <h3 className="text-sm font-semibold text-[#D85E00]">
                  {tt("analysisPage.missing")}
                </h3>
                <div className="mt-2 text-xs text-[#2F3A4A]/70 dark:text-white/70">
                  {missingMust.length
                    ? missingMust.map((item) => (
                        <div key={`miss-${item}`} className="rounded-full bg-[#FEE4E2] px-3 py-1 text-[#B42318]">
                          {item}
                        </div>
                      ))
                    : tt("analysisPage.noMissing")}
                </div>
              </div>
              <div className="rounded-2xl border border-[#FFE4C8] bg-white/70 p-4 dark:border-white/10 dark:bg-white/5">
                <h3 className="text-sm font-semibold text-[#D85E00]">
                  {tt("analysisPage.improvements")}
                </h3>
                <div className="mt-2 text-xs text-[#2F3A4A]/70 dark:text-white/70">
                  {improvement.length
                    ? improvement.map((item) => (
                        <div key={`imp-${item}`} className="rounded-full bg-[#FEF0C7] px-3 py-1 text-[#B54708]">
                          {item}
                        </div>
                      ))
                    : tt("analysisPage.noImprovements")}
                </div>
              </div>
            </div>

            {strengths.length ? (
              <div className="rounded-2xl border border-[#FFE4C8] bg-white/70 p-4 dark:border-white/10 dark:bg-white/5">
                <h3 className="text-sm font-semibold text-[#D85E00]">
                  {tt("analysisPage.strengths")}
                </h3>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  {strengths.map((item) => (
                    <span
                      key={`${item.requirement}-${item.score}`}
                      className="rounded-full border border-[#FFB26B]/60 px-3 py-1 text-[#D85E00] dark:border-white/30 dark:text-white"
                    >
                      {item.requirement} • {item.score.toFixed(1)} / 10
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {evidence.length ? (
              <div className="rounded-2xl border border-[#FFE4C8] bg-white/70 p-4 dark:border-white/10 dark:bg-white/5">
                <h3 className="text-sm font-semibold text-[#D85E00]">
                  {tt("analysisPage.evidence")}
                </h3>
                <div className="mt-3 space-y-3 text-xs text-[#2F3A4A]/70 dark:text-white/70">
                  {evidence.map((item) => (
                    <div key={`${item.requirement}-${item.chunk.id}`} className="rounded-xl bg-white/70 p-3 shadow-sm dark:bg-white/10">
                      <div className="text-sm font-medium text-[#D85E00] dark:text-white">
                        {item.requirement}
                      </div>
                      <div className="mt-1 text-[11px] uppercase tracking-wide text-[#2F3A4A]/60 dark:text-white/60">
                        {item.chunk.section} • sim {(item.similarity * 100).toFixed(1)}%
                      </div>
                      <p className="mt-2 text-[11px] leading-relaxed">
                        {item.chunk.excerpt}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#D85E00]">
            {tt("analysisPage.breakdown")}
          </h2>
          <span className="text-xs text-[#2F3A4A]/60 dark:text-white/60">
            {tt("analysisPage.rowsLabel")} {data.breakdown.length}
          </span>
        </div>

        {data.breakdown.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {data.breakdown.map((row, idx) => (
              <div
                key={`${row.requirement}-${idx}`}
                className="rounded-3xl border border-[#FFE4C8] bg-white/80 p-4 shadow-sm transition hover:shadow-md dark:border-white/10 dark:bg-white/5"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-base font-semibold text-[#2F3A4A] dark:text-white">
                      {row.requirement}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[#2F3A4A]/60 dark:text-white/60">
                      <span className="rounded-full bg-[#FFF2E8] px-2 py-1 text-[#D85E00] dark:bg-white/10 dark:text-white/80">
                        {row.mustHave ? tt("analysisPage.must") : tt("analysisPage.nice")}
                      </span>
                      <span className="rounded-full bg-[#FFF2E8] px-2 py-1 text-[#D85E00] dark:bg-white/10 dark:text-white/80">
                        {tt("chat.weightLabel")}: {row.weight}
                      </span>
                      <span className="rounded-full bg-[#FFF2E8] px-2 py-1 text-[#D85E00] dark:bg-white/10 dark:text-white/80">
                        sim {(row.similarity * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <div className="text-lg font-semibold text-[#D85E00] dark:text-white">
                    {row.score10.toFixed(1)} / 10
                  </div>
                </div>
                {row.bestChunk?.excerpt ? (
                  <p className="mt-3 text-xs leading-relaxed text-[#2F3A4A]/70 dark:text-white/70">
                    {row.bestChunk.excerpt}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[#FFB26B]/60 bg-white/60 p-6 text-center text-sm text-[#2F3A4A]/60 dark:border-white/20 dark:bg-white/5 dark:text-white/60">
            {tt("analysisPage.emptyBreakdown")}
          </div>
        )}
      </section>
    </div>
  );
}
