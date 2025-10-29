"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  ClipboardList,
  Loader2,
  MapPin,
  NotebookPen,
  Sparkles,
} from "lucide-react";

import { jobsApi, type Job, type JobRequirement } from "@/services/api/jobs";
import { useLang } from "@/lib/use-lang";

function formatDate(value: string | undefined, lang: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(lang === "ar" ? "ar" : "en", {
      dateStyle: "medium",
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function splitRequirements(requirements: JobRequirement[]) {
  const must = requirements.filter((item) => item.mustHave);
  const nice = requirements.filter((item) => !item.mustHave);
  return { must, nice };
}

export default function JobsPage() {
  const lang = useLang();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    jobsApi
      .list()
      .then((res) => {
        if (!alive) return;
        const items = res.items ?? [];
        setJobs(items);
        if (items.length && !selectedId) setSelectedId(items[0].id);
      })
      .catch((err: any) => {
        if (!alive) return;
        setError(err?.message || "failed to load jobs");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [selectedId]);

  const selectedJob = useMemo(() => {
    if (!jobs.length) return null;
    if (selectedId) return jobs.find((job) => job.id === selectedId) ?? jobs[0];
    return jobs[0];
  }, [jobs, selectedId]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 py-10">
      <header className="space-y-4 rounded-[28px] border border-[var(--color-border)] bg-[var(--surface)]/95 p-6 shadow-sm">
        <div className="inline-flex items-center gap-2 rounded-full bg-[var(--color-primary)]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.32em] text-[var(--color-primary)]">
          <Sparkles className="h-3.5 w-3.5" /> AI Talent Library
        </div>
        <h1 className="text-3xl font-semibold text-[var(--foreground)]">
          {lang === "ar" ? "لوحة الوظائف المحفوظة" : "Saved job briefs"}
        </h1>
        <p className="max-w-3xl text-sm text-[var(--color-text-muted)]">
          {lang === "ar"
            ? "راجع توصيف الوظائف والمتطلبات المرتبطة بها قبل المطابقة مع السير الذاتية. كل وظيفة يتم إنشاؤها من لوحة التحليل أو المساعد يتم حفظها هنا تلقائياً."
            : "Review job briefs and their weighted requirements before matching CVs. Every job created from the console or assistant is stored here."}
        </p>
        <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--color-text-muted)]">
          <Link
            href="/#home"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--color-primary)]/50 px-4 py-2 font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10"
          >
            {lang === "ar" ? "العودة للوحة التحليل" : "Back to analysis"}
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/#workflow"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--color-secondary)]/40 px-4 py-2 font-semibold text-[var(--color-secondary)] hover:bg-[var(--color-secondary)]/10"
          >
            {lang === "ar" ? "إدارة رحلة التوظيف" : "Go to workflow"}
          </Link>
        </div>
      </header>

      {loading ? (
        <div className="flex items-center justify-center rounded-3xl border border-[var(--color-border)] bg-[var(--surface)]/90 p-10 text-sm text-[var(--color-text-muted)]">
          <Loader2 className="me-2 h-4 w-4 animate-spin" />
          {lang === "ar" ? "جاري التحميل..." : "Loading jobs..."}
        </div>
      ) : error ? (
        <div className="rounded-3xl border border-red-200 bg-red-50/70 p-6 text-sm text-red-700">
          {error}
        </div>
      ) : !jobs.length ? (
        <div className="rounded-3xl border border-dashed border-[var(--color-border)] bg-[var(--surface)]/70 p-10 text-center text-sm text-[var(--color-text-muted)]">
          {lang === "ar"
            ? "لا توجد وظائف محفوظة بعد. ابدأ من لوحة التحليل لإنشاء وظيفة جديدة."
            : "No saved jobs yet. Use the analysis console to create one."}
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
          <aside className="space-y-2 rounded-[24px] border border-[var(--color-border)] bg-[var(--surface)]/90 p-4 shadow-sm">
            <div className="mb-2 text-sm font-semibold text-[var(--color-text-muted)]">
              {lang === "ar" ? "كل الوظائف" : "All jobs"}
            </div>
            <div className="space-y-2">
              {jobs.map((job) => {
                const active = selectedJob?.id === job.id;
                const reqCount = job.requirements?.length ?? 0;
                return (
                  <button
                    key={job.id}
                    onClick={() => setSelectedId(job.id)}
                    className={`w-full rounded-2xl border px-3 py-3 text-start text-sm transition ${
                      active
                        ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                        : "border-[var(--color-border)] bg-[var(--surface-soft)]/60 text-[var(--foreground)] hover:border-[var(--color-primary)]/40"
                    }`}
                  >
                    <div className="font-semibold">{job.title}</div>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-[var(--color-text-muted)]">
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {formatDate(job.createdAt, lang)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <ClipboardList className="h-3.5 w-3.5" />
                        {lang === "ar" ? `${reqCount} متطلب` : `${reqCount} reqs`}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="space-y-4 rounded-[28px] border border-[var(--color-border)] bg-[var(--surface)]/95 p-6 shadow-sm">
            {selectedJob ? (
              <>
                <div className="flex flex-col gap-3 border-b border-[var(--color-border)]/60 pb-4">
                  <div className="text-xs uppercase tracking-[0.3em] text-[var(--color-text-muted)]">
                    Job Overview
                  </div>
                  <h2 className="text-2xl font-semibold text-[var(--foreground)]">
                    {selectedJob.title}
                  </h2>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--color-text-muted)]">
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-soft)] px-3 py-1">
                      <NotebookPen className="h-3.5 w-3.5" />
                      {lang === "ar" ? "تم إنشاؤها" : "Created"}: {formatDate(selectedJob.createdAt, lang)}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-soft)] px-3 py-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {lang === "ar" ? "عنصر تحليلي" : "Saved brief"}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-soft)] px-3 py-1">
                      <ClipboardList className="h-3.5 w-3.5" />
                      {(selectedJob.requirements?.length ?? 0).toString()} {lang === "ar" ? "متطلبات" : "requirements"}
                    </span>
                  </div>
                  {selectedJob.description ? (
                    <p className="text-sm leading-relaxed text-[var(--color-text-muted)]">
                      {selectedJob.description}
                    </p>
                  ) : null}
                </div>

                {(() => {
                  const { must, nice } = splitRequirements(
                    selectedJob.requirements ?? []
                  );
                  return (
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="space-y-3 rounded-2xl border border-[var(--color-primary)]/40 bg-[var(--surface-soft)]/70 p-4">
                        <div className="text-sm font-semibold text-[var(--color-primary)]">
                          {lang === "ar" ? "متطلبات أساسية" : "Must-have"}
                        </div>
                        <ul className="space-y-2 text-sm text-[var(--foreground)]">
                          {must.length ? (
                            must.map((item) => (
                              <li
                                key={`${item.id ?? item.requirement}-must`}
                                className="rounded-xl bg-white/70 px-3 py-2 text-xs text-[var(--foreground)] shadow-sm"
                              >
                                <div className="font-medium">{item.requirement}</div>
                                <div className="mt-1 flex items-center gap-2 text-[11px] text-[var(--color-text-muted)]">
                                  <span>
                                    {lang === "ar" ? "وزن" : "Weight"}: {Number(item.weight ?? 0).toFixed(1)}
                                  </span>
                                  <span className="rounded-full bg-[var(--color-primary)]/10 px-2 py-0.5 text-[var(--color-primary)]">
                                    must
                                  </span>
                                </div>
                              </li>
                            ))
                          ) : (
                            <li className="rounded-xl border border-dashed border-[var(--color-border)]/60 px-3 py-3 text-xs text-[var(--color-text-muted)]">
                              {lang === "ar" ? "لا توجد متطلبات أساسية." : "No must-have requirements."}
                            </li>
                          )}
                        </ul>
                      </div>

                      <div className="space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--surface-soft)]/70 p-4">
                        <div className="text-sm font-semibold text-[var(--color-text-muted)]">
                          {lang === "ar" ? "متطلبات تكميلية" : "Nice-to-have"}
                        </div>
                        <ul className="space-y-2 text-sm text-[var(--foreground)]">
                          {nice.length ? (
                            nice.map((item) => (
                              <li
                                key={`${item.id ?? item.requirement}-nice`}
                                className="rounded-xl bg-white/70 px-3 py-2 text-xs text-[var(--foreground)] shadow-sm"
                              >
                                <div className="font-medium">{item.requirement}</div>
                                <div className="mt-1 flex items-center gap-2 text-[11px] text-[var(--color-text-muted)]">
                                  <span>
                                    {lang === "ar" ? "وزن" : "Weight"}: {Number(item.weight ?? 0).toFixed(1)}
                                  </span>
                                  <span className="rounded-full bg-[var(--color-border)]/60 px-2 py-0.5 text-[var(--color-text-muted)]">
                                    nice
                                  </span>
                                </div>
                              </li>
                            ))
                          ) : (
                            <li className="rounded-xl border border-dashed border-[var(--color-border)]/60 px-3 py-3 text-xs text-[var(--color-text-muted)]">
                              {lang === "ar" ? "لا توجد متطلبات تكميلية." : "No optional requirements."}
                            </li>
                          )}
                        </ul>
                      </div>
                    </div>
                  );
                })()}

                <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--color-border)]/60 bg-[var(--surface-soft)]/60 px-4 py-3 text-xs text-[var(--color-text-muted)]">
                  <span>{lang === "ar" ? "جاهز للمطابقة" : "Ready to match"}</span>
                  <Link
                    href={`/#home`}
                    className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[var(--color-primary)] via-[#ff8b2e] to-[var(--color-accent)] px-4 py-2 font-semibold text-white shadow"
                  >
                    {lang === "ar" ? "ابدأ التحليل" : "Start matching"}
                  </Link>
                </div>
              </>
            ) : null}
          </section>
        </div>
      )}
    </div>
  );
}
