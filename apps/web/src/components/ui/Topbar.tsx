// apps/web/src/components/ui/Topbar.tsx
"use client";

import * as React from "react";
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
      <div className="mx-auto flex max-w-6xl items-center justify-between rounded-2xl border border-[#FFB26B]/50 bg-white/80 px-4 py-3 shadow-sm backdrop-blur sm:px-6 lg:px-8 dark:border-[#FFB26B]/30 dark:bg-[#1F140D]/80">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-9 items-center justify-center rounded-xl bg-[#FF7A00] text-white shadow">
            <span className="text-lg font-semibold">AI</span>
          </span>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-[#D85E00] dark:text-[#FFB26B]">
              {process.env.NEXT_PUBLIC_APP_NAME || "CV Matcher"}
            </div>
            <div className="text-[11px] text-[#2F3A4A]/70 dark:text-white/60">
              Precision Talent Intelligence • مساعدة توظيف فورية
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <button
            onClick={() => applyLang(lang === "ar" ? "en" : "ar")}
            className="rounded-full border border-[#FF7A00]/40 px-3 py-1 font-semibold text-[#D85E00] transition hover:bg-[#FF7A00]/10 dark:text-[#FFB26B] dark:hover:bg-[#FF7A00]/20"
          >
            {lang === "ar" ? "العربية" : "English"}
          </button>
          <button
            onClick={() => applyTheme(!dark)}
            className="rounded-full border border-[#FF7A00]/40 px-3 py-1 font-semibold text-[#2F3A4A] transition hover:bg-[#FF7A00]/10 dark:text-white dark:hover:bg-[#FF7A00]/20"
          >
            {dark ? "Dark" : "Light"}
          </button>
        </div>
      </div>
    </div>
  );
}
