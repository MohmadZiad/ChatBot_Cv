// apps/web/src/components/ui/Topbar.tsx
"use client";

import * as React from "react";

type Lang = "ar" | "en";

export default function Topbar() {
  const [lang, setLang] = React.useState<Lang>("ar");
  const [dark, setDark] = React.useState(false);

  // اقرأ من localStorage فقط على العميل
  React.useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const savedLang = (window.localStorage.getItem("lang") as Lang) || "ar";
      setLang(savedLang);

      const prefDark =
        window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
      const savedTheme = window.localStorage.getItem("theme");
      setDark(savedTheme ? savedTheme === "dark" : prefDark);
    } catch {
      /* ignore */
    }
  }, []);

  const toggleLang = () => {
    const next = lang === "ar" ? "en" : "ar";
    setLang(next);
    if (typeof window !== "undefined")
      window.localStorage.setItem("lang", next);
  };

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    if (typeof window !== "undefined")
      window.localStorage.setItem("theme", next ? "dark" : "light");
  };

  return (
    <div
      dir={lang === "ar" ? "rtl" : "ltr"}
      style={{ display: "flex", gap: 8, alignItems: "center" }}
    >
      <button onClick={toggleLang}>{lang.toUpperCase()}</button>
      <button onClick={toggleTheme}>{dark ? "Dark" : "Light"}</button>
      {/* بقية التوببار… */}
    </div>
  );
}
