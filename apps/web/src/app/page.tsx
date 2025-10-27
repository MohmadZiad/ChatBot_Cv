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
    <div className="mx-auto max-w-5xl space-y-6">
      {/* الهيرو */}
      <header className="text-center">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
          مساعد مطابقة السِيَر الذاتية مع الوظائف
        </h1>
        <p className="text-sm text-black/60 dark:text-white/60 mt-2">
          اكتب متطلبات الوظيفة، أرفق CV، واضغط «حلّل الآن» لمشاهدة النتيجة
          التفصيلية.
        </p>
      </header>

      {/* أزرار التبديل (تابس) */}
      <div className="flex items-center justify-center gap-2">
        <button
          onClick={() => go("home")}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
            !isWorkflow
              ? "bg-[#FF7A00] text-white shadow"
              : "border border-[#FF7A00]/40 text-[#D85E00] bg-white hover:bg-[#FF7A00]/10"
          }`}
        >
          لوحة التحليل (AI Console)
        </button>
        <button
          onClick={() => go("workflow")}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
            isWorkflow
              ? "bg-[#FF7A00] text-white shadow"
              : "border border-[#FF7A00]/40 text-[#D85E00] bg-white hover:bg-[#FF7A00]/10"
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
