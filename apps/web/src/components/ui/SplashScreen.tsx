"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

export default function SplashScreen() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), 3000);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden bg-[var(--background)] text-[var(--foreground)]"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
        >
          {/* الخلفية المتدرجة */}
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -top-24 -end-28 h-[420px] w-[420px] rounded-full bg-[var(--color-primary)]/20 blur-3xl" />
            <div className="absolute -bottom-32 -start-32 h-[520px] w-[520px] rounded-full bg-[var(--color-secondary)]/15 blur-[120px]" />
          </div>

          {/* المحتوى الرئيسي */}
          <div className="relative flex flex-col items-center gap-7 text-center">
            <motion.span
              className="text-[12px] uppercase tracking-[0.8em] text-[var(--color-primary)]/70"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            >
              confidenceway{" "}
            </motion.span>

            <motion.div
              className="flex flex-col items-center gap-3"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.6, ease: "easeOut" }}
            >
              <span className="text-5xl font-bold tracking-tight sm:text-6xl">
                CV Matcher
              </span>
              <span className="text-base text-[var(--color-text-muted)]">
                Precision talent intelligence
              </span>
            </motion.div>

            <motion.div
              className="flex items-center gap-3 text-sm text-[var(--color-text-muted)]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6, duration: 0.6, ease: "easeOut" }}
            >
              <span
                className="relative inline-flex size-5 items-center justify-center"
                aria-hidden="true"
              >
                <span className="absolute inset-0 rounded-full border border-[var(--color-primary)]/40" />
                <motion.span
                  className="absolute inset-[3px] rounded-full border-t-2 border-[var(--color-primary)]"
                  animate={{ rotate: 360 }}
                  transition={{
                    repeat: Infinity,
                    duration: 1.2,
                    ease: "linear",
                  }}
                />
              </span>
              <span>Preparing the bilingual experience…</span>
            </motion.div>
          </div>

          {/* أسفل يسار الصفحة */}
          <div className="pointer-events-none absolute bottom-6 left-6 flex flex-col text-[10px] uppercase tracking-[0.5em] text-[var(--color-text-muted)]/40">
            <span>Loading experience…</span>
            <span className="mt-1 text-[var(--color-text-muted)]/30">
              By MohammadZ 🧡
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
