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
      className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between"
    >
      <div className="text-sm font-semibold opacity-80">
        {process.env.NEXT_PUBLIC_APP_NAME || "CV Matcher"}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => applyLang(lang === "ar" ? "en" : "ar")}
          className="text-xs rounded-lg border px-3 py-1 hover:bg-black/5 dark:hover:bg-white/10"
        >
          {lang.toUpperCase()}
        </button>
        <button
          onClick={() => applyTheme(!dark)}
          className="text-xs rounded-lg border px-3 py-1 hover:bg-black/5 dark:hover:bg-white/10"
        >
          {dark ? "Dark" : "Light"}
        </button>
      </div>
    </div>
  );
}
