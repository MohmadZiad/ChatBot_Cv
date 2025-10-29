// apps/web/src/components/ui/Topbar.tsx
"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";

type Lang = "ar" | "en";

export default function Topbar() {
  const [lang, setLang] = React.useState<Lang>("ar");
  const [dark, setDark] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const savedLang = (window.localStorage.getItem("lang") as Lang) || "ar";
      const sysDark =
        window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
      const savedTheme = window.localStorage.getItem("theme");
      const nextDark = savedTheme ? savedTheme === "dark" : Boolean(sysDark);

      setLang(savedLang);
      setDark(nextDark);

      document.documentElement.setAttribute("lang", savedLang);
      document.documentElement.setAttribute(
        "dir",
        savedLang === "ar" ? "rtl" : "ltr"
      );
      document.documentElement.classList.toggle("dark", nextDark);
    } catch {}
  }, []);

  const applyLang = (next: Lang) => {
    setLang(next);
    window.localStorage.setItem("lang", next);
    document.documentElement.setAttribute("lang", next);
    document.documentElement.setAttribute("dir", next === "ar" ? "rtl" : "ltr");
    // مهم: إجبار بقية المكوّنات على التحديث في نفس التبويب
    window.dispatchEvent(new CustomEvent("lang-change", { detail: next }));
  };

  const applyTheme = (nextDark: boolean) => {
    setDark(nextDark);
    window.localStorage.setItem("theme", nextDark ? "dark" : "light");
    document.documentElement.classList.toggle("dark", nextDark);
    window.dispatchEvent(new CustomEvent("theme-change", { detail: nextDark }));
  };

  return (
    <div
      dir={lang === "ar" ? "rtl" : "ltr"}
      className="sticky top-0 z-50 bg-transparent"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between rounded-2xl border border-[var(--color-border)] bg-[var(--surface)]/90 px-4 py-3 shadow-sm backdrop-blur sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-9 items-center justify-center rounded-xl bg-[var(--color-primary)] text-white shadow">
            <span className="text-lg font-semibold">AI</span>
          </span>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-[var(--color-primary)]">
              {process.env.NEXT_PUBLIC_APP_NAME || "CV Matcher"}
            </div>
            <div className="text-[11px] text-[var(--color-text-muted)]">
              Precision Talent Intelligence • مساعدة توظيف فورية
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <button
            onClick={() => applyLang(lang === "ar" ? "en" : "ar")}
            className="rounded-full border border-[var(--color-primary)]/40 px-3 py-1 font-semibold text-[var(--color-primary)] transition hover:bg-[var(--color-primary)]/10"
          >
            {lang === "ar" ? "العربية" : "English"}
          </button>
          <button
            onClick={() => applyTheme(!dark)}
            aria-pressed={dark}
            className="inline-flex items-center gap-2 rounded-full border border-[var(--color-primary)]/40 px-3 py-1 font-semibold text-[var(--color-text-muted)] transition hover:bg-[var(--color-primary)]/10"
          >
            {dark ? (
              <>
                <Moon size={14} />
                {lang === "ar" ? "ليلي" : "Dark"}
              </>
            ) : (
              <>
                <Sun size={14} />
                {lang === "ar" ? "نهاري" : "Light"}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
