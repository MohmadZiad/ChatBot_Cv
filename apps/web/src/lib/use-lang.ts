"use client";

import { useEffect, useState } from "react";

import type { Lang } from "./i18n";

const DEFAULT_LANG: Lang = "ar";

function readLangFromStorage(): Lang {
  if (typeof window === "undefined") return DEFAULT_LANG;
  try {
    const stored = window.localStorage.getItem("lang");
    if (stored === "en" || stored === "ar") return stored;
  } catch {
    // ignore storage failures
  }
  return DEFAULT_LANG;
}

export function useLang(): Lang {
  const [lang, setLang] = useState<Lang>(DEFAULT_LANG);

  useEffect(() => {
    setLang(readLangFromStorage());

    const onStorage = (event: StorageEvent) => {
      if (event.key === "lang") setLang(readLangFromStorage());
    };

    const onCustom = (event: Event) => {
      const detail = (event as CustomEvent<Lang | undefined>).detail;
      if (detail === "ar" || detail === "en") setLang(detail);
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener("lang-change", onCustom as EventListener);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("lang-change", onCustom as EventListener);
    };
  }, []);

  return lang;
}

