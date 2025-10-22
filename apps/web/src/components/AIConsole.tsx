// apps/web/src/components/AIConsole.tsx
"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Paperclip, Send, FileText, Loader2, CheckCircle2 } from "lucide-react";
import { cvApi } from "@/services/api/cv";
import { jobsApi, type JobRequirement } from "@/services/api/jobs";
import { analysesApi, type Analysis } from "@/services/api/analyses";
import type { Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";

type Msg = {
  id: string;
  role: "bot" | "user" | "sys";
  content: React.ReactNode;
};

function useLang(): Lang {
  const [lang, setLang] = React.useState<Lang>(
    (localStorage.getItem("lang") as Lang) || "ar"
  );
  React.useEffect(() => {
    const h = () => setLang((localStorage.getItem("lang") as Lang) || "ar");
    window.addEventListener("storage", h);
    return () => window.removeEventListener("storage", h);
  }, []);
  return lang;
}

function parseRequirements(text: string): JobRequirement[] {
  // صيغة مرنة: كل سطر requirement، ممكن يحتوي must/وزن
  // أمثلة:
  // React, must, 2
  // TypeScript, 1
  // Tailwind
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
              1) اكتب متطلبات الوظيفة (سطر لكل Requirement، ضيف{" "}
              <b>must</b> و/أو وزن مثل: <code>2</code>).
            </li>
            <li>2) ارفع ملف الـ CV (PDF/DOCX).</li>
            <li>3) اضغط {tt("chat.run")} — سأعرض لك النتيجة.</li>
          </ul>
        </div>
      ),
    },
  ]);

  // حالة الجلسة
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [reqText, setReqText] = React.useState("");
  const [reqs, setReqs] = React.useState<JobRequirement[]>([]);
  const [cvFile, setCvFile] = React.useState<File | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<Analysis | null>(null);

  // إدراج رسالة
  const push = (m: Omit<Msg, "id">) =>
    setMessages((s) => [
      ...s,
      { ...m, id: Math.random().toString(36).slice(2) },
    ]);

  // إرسال متطلبات
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
          ✅ تم استلام المتطلبات. الآن ارفع ملف الـ CV ثم اضغط {tt("chat.run")}.
        </div>
      ),
    });
    setReqText("");
  };

  // رفع CV
  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    if (!f) return;
    setCvFile(f);
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

  // تشغيل التحليل الكامل
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
      // 1) إنشاء الوظيفة
      const job = await jobsApi.create({
        title: title || (lang === "ar" ? "وظيفة بدون عنوان" : "Untitled Job"),
        description: description || "—",
        requirements: reqs,
      });

      // 2) رفع الـ CV
      const uploaded = await cvApi.upload(cvFile);

      // 3) تشغيل التحليل
      const a = await analysesApi.run({ jobId: job.id, cvId: uploaded.cvId });

      push({
        role: "sys",
        content: (
          <div className="inline-flex items-center gap-2 text-xs opacity-70">
            <Loader2 className="size-4 animate-spin" /> {tt("chat.running")}
          </div>
        ),
      });

      // 4) جلب النتيجة النهائية
      const final = await analysesApi.get(a.id);
      setResult(final);

      push({
        role: "bot",
        content: (
          <div>
            <div className="inline-flex items-center gap-2 text-green-700 dark:text-green-400">
              <CheckCircle2 className="size-5" /> {tt("chat.done")}
            </div>
            <div className="mt-2 text-sm">
              <b>{tt("chat.score")}</b>:{" "}
              {typeof final.score === "number" ? final.score.toFixed(2) : "-"} / 10
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
                    {final.breakdown.map((r: any, i: number) => (
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
    } catch (e: any) {
      push({
        role: "bot",
        content: (
          <div className="text-sm text-red-600">
            Error: {e?.message || "failed"}
          </div>
        ),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      {/* لوحة AI في الوسط */}
      <div className="relative rounded-[28px] border border-black/10 dark:border-white/10 bg-white/70 dark:bg-white/5 p-4 shadow-xl overflow-hidden">
        {/* خلفيات لطيفة */}
        <div className="pointer-events-none absolute -z-10 -top-24 -start-24 size-72 rounded-full bg-blue-200/40 blur-3xl" />
        <div className="pointer-events-none absolute -z-10 -bottom-24 -end-24 size-72 rounded-full bg-purple-200/40 blur-3xl" />

        {/* شريط عنوان */}
        <div className="flex items-center justify-between px-2 pb-3">
          <div className="font-semibold">AI • {t(lang, "app")}</div>
          <div className="text-xs opacity-60">Chat Console</div>
        </div>

        {/* الرسائل */}
        <div className="space-y-2 max-h-[55vh] overflow-y-auto pe-1">
          <AnimatePresence initial={false}>
            {messages.map((m) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className={
                  m.role === "user"
                    ? "ms-auto max-w-[85%] rounded-2xl bg-blue-600 text-white px-3 py-2 shadow"
                    : m.role === "sys"
                      ? "mx-auto max-w-[85%] rounded-2xl bg-black/5 dark:bg-white/10 px-3 py-2 text-xs"
                      : "me-auto max-w-[85%] rounded-2xl bg-white/80 dark:bg-white/10 px-3 py-2 shadow"
                }
              >
                {m.content}
              </motion.div>
            ))}
          </AnimatePresence>

          {result && (
            <div className="me-auto max-w-[85%] rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 px-3 py-2">
              <div className="text-sm">
                <b>{tt("chat.score")}:</b> {result.score?.toFixed?.(2) ?? "-"} / 10
              </div>
            </div>
          )}
        </div>

        {/* التحكم */}
        <div className="mt-3 grid gap-2">
          {/* عنوان ووصف (اختياري) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              placeholder={
                lang === "ar" ? "Job Title (اختياري)" : "Job Title (optional)"
              }
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded-xl border px-3 py-2 bg-white/90 dark:bg-white/10"
            />
            <input
              placeholder={
                lang === "ar"
                  ? "Job Description (اختياري)"
                  : "Job Description (optional)"
              }
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="rounded-xl border px-3 py-2 bg-white/90 dark:bg-white/10"
            />
          </div>

          {/* متطلبات الوظيفة */}
          <div className="rounded-2xl border p-2 bg-white/60 dark:bg-white/10">
            <div className="text-xs opacity-70 mb-1">
              {lang === "ar"
                ? "Requirements (سطر لكل متطلب، اكتب must/وزن اختياريًا)"
                : "Requirements (one per line, you can add 'must' and/or a weight)"}
            </div>
            <textarea
              value={reqText}
              onChange={(e) => setReqText(e.target.value)}
              rows={3}
              placeholder={
                lang === "ar"
                  ? `مثال:\nReact, must, 2\nTypeScript, 1\nTailwind`
                  : `Example:\nReact, must, 2\nTypeScript, 1\nTailwind`
              }
              className="w-full rounded-xl border px-3 py-2 bg-white/90 dark:bg-white/10"
            />

            <div className="mt-2 flex items-center justify-between">
              <label
                htmlFor="cvfile"
                className="inline-flex items-center gap-2 text-sm cursor-pointer"
              >
                <span className="size-8 grid place-items-center rounded-xl bg-black text-white">
                  <Paperclip className="size-4" />
                </span>
                <input
                  id="cvfile"
                  type="file"
                  accept=".pdf,.docx"
                  onChange={onPickFile}
                  className="hidden"
                />
                <span className="opacity-80">
                  {cvFile ? cvFile.name : lang === "ar" ? "أرفق CV (PDF/DOCX)" : "Attach CV (PDF/DOCX)"}
                </span>
              </label>

              <div className="flex items-center gap-2">
                <button
                  onClick={onSendReqs}
                  className="rounded-xl border px-4 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10"
                >
                  {lang === "ar" ? "أضف المتطلبات" : "Add Requirements"}
                </button>
                <button
                  onClick={run}
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-xl bg-black text-white px-4 py-2 hover:opacity-90 disabled:opacity-40"
                >
                  {loading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                  {loading ? (lang === "ar" ? "جاري العمل…" : "Working…") : tt("chat.run")}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer بسيط */}
      <div className="text-xs opacity-60 text-center mt-4">
        Next.js • Tailwind • Motion
      </div>
    </div>
  );
}
