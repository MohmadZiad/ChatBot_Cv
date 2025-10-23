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
      const uploaded = await cvApi.upload(cvFile);
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
      <div className="relative rounded-[28px] border border-black/10 dark:border-white/10 bg-white/70 dark:bg-white/5 p-4 shadow-xl overflow-hidden">
        <div className="pointer-events-none absolute -z-10 -top-24 -start-24 size-72 rounded-full bg-blue-200/40 blur-3xl" />
        <div className="pointer-events-none absolute -z-10 -bottom-24 -end-24 size-72 rounded-full bg-purple-200/40 blur-3xl" />

        <div className="flex items-center justify-between px-2 pb-3">
          <div className="font-semibold">AI • {t(lang, "app")}</div>
          <div className="text-xs opacity-60">Chat Console</div>
        </div>

        {/* الرسائل */}
        <div
          ref={listRef}
          className="space-y-2 max-h-[55vh] overflow-y-auto pe-1"
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
                <b>{tt("chat.score")}:</b> {result.score?.toFixed?.(2) ?? "-"} /
                10
              </div>
            </div>
          )}
        </div>

        {/* التحكم */}
        <div className="mt-3 grid gap-2">
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

          <div className="rounded-2xl border p-2 bg-white/60 dark:bg-white/10">
            <div className="text-xs opacity-70 mb-1">
              {lang === "ar"
                ? "Requirements (سطر لكل متطلب، اكتب must/وزن اختياريًا)"
                : "Requirements (one per line, you can add 'must' and/or a weight)"}
            </div>

            {/* RequirementPicker كمُدخل سريع */}
            <div className="mb-2">
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
                  {cvFile
                    ? cvFile.name
                    : lang === "ar"
                      ? "أرفق CV (PDF/DOCX)"
                      : "Attach CV (PDF/DOCX)"}
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
                  {loading
                    ? lang === "ar"
                      ? "جاري العمل…"
                      : "Working…"
                    : tt("chat.run")}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="text-xs opacity-60 text-center mt-4">
        Next.js • Tailwind • Motion
      </div>
    </div>
  );
}
