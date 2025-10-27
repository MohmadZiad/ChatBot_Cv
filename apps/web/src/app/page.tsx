// apps/web/src/app/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import AIConsole from "@/components/AIConsole";
import TalentWorkflow from "@/components/TalentWorkflow";

type View = "home" | "workflow";

const fadeSlide = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -16 },
  transition: { duration: 0.25 },
};

export default function HomePage() {
  const [view, setView] = useState<View>("home");

  // احترم الهاش: #workflow أو #home
  useEffect(() => {
    const read = () => {
      const h = window.location.hash.replace("#", "");
      setView(h === "workflow" ? "workflow" : "home");
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  // زر التبديل يحدّث الهاش فقط — كلشي ينعرض بنفس الصفحة
  const go = (next: View) => {
    const hash = next === "workflow" ? "#workflow" : "#home";
    if (window.location.hash !== hash) window.location.hash = hash;
    // سكرول لطرف العنوان ليظهر التبديل بشكل نظيف
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const isWorkflow = view === "workflow";

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="relative overflow-hidden rounded-[40px] border border-[var(--color-border)] bg-[var(--surface)]/95 px-6 py-10 text-center shadow-[0_28px_80px_-40px_rgba(255,122,0,0.45)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(320px_220px_at_20%_20%,rgba(255,122,0,0.18),transparent_60%),radial-gradient(360px_260px_at_80%_-10%,rgba(74,144,226,0.16),transparent_65%)]" />
        <div className="relative space-y-3">
          <span className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--color-primary)]/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-primary)]">
            AI Talent Platform
          </span>
          <h1 className="text-3xl font-semibold text-[var(--foreground)] sm:text-4xl">
            {"مساعد توظيف ثنائي اللغة يعتمد على الذكاء الاصطناعي"}
          </h1>
          <p className="mx-auto max-w-2xl text-sm text-[var(--color-text-muted)] sm:text-base">
            {"وحّد رحلة التحليل من توصيف الوظيفة إلى مقارنة السير الذاتية. خطوة بخطوة مع دعم العربية والإنجليزية ونماذج gpt-4o-mini + text-embedding-3-small."}
          </p>
        </div>
      </header>

      <div className="flex items-center justify-center gap-3">
        <button
          onClick={() => go("home")}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
            !isWorkflow
              ? "bg-gradient-to-r from-[var(--color-primary)] via-[#ff8b2e] to-[var(--color-accent)] text-white shadow"
              : "border border-[var(--color-primary)]/40 bg-[var(--surface)] text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10"
          }`}
        >
          لوحة التحليل الذكية
        </button>
        <button
          onClick={() => go("workflow")}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
            isWorkflow
              ? "bg-gradient-to-r from-[var(--color-primary)] via-[#ff8b2e] to-[var(--color-accent)] text-white shadow"
              : "border border-[var(--color-primary)]/40 bg-[var(--surface)] text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10"
          }`}
        >
          Talent Workflow
        </button>
      </div>

      {/* المحتوى مع أنيميشن */}
      <AnimatePresence mode="wait">
        {!isWorkflow ? (
          <motion.div key="home" {...fadeSlide}>
            <AIConsole />
            <div className="text-xs opacity-60 text-center mt-3">
              جاهز للمقارنة والتصدير من صفحة النتائج.
            </div>
          </motion.div>
        ) : (
          <motion.div key="workflow" {...fadeSlide}>
            <TalentWorkflow />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
