'use client';
import { useEffect, useState } from 'react';
import { Languages, Sun, MoonStar } from 'lucide-react';
import { type Lang } from '@/lib/i18n';
import clsx from 'clsx';

export default function Topbar() {
  const [lang, setLang] = useState<Lang>((localStorage.getItem('lang') as Lang) || 'ar');
  const [dark, setDark] = useState<boolean>(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches);

  useEffect(() => {
    localStorage.setItem('lang', lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  return (
    <header className="sticky top-0 z-50 border-b border-black/10 bg-white/70 dark:bg-black/30 backdrop-blur supports-[backdrop-filter]:bg-white/50">
      <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-2xl bg-gradient-to-br from-black to-stone-600 text-white grid place-items-center text-sm font-semibold shadow-lg">CV</div>
          <div className="leading-tight">
            <div className="font-semibold">CV Matcher</div>
            <div className="text-xs text-black/60 dark:text-white/60">لوحة مطابقة السير • CV Matching</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setDark(v=>!v)}
            className="inline-flex items-center gap-1 rounded-xl border px-3 py-1.5 text-xs hover:bg-black/5 dark:hover:bg-white/10"
            title="Theme"
          >
            {dark ? <Sun size={16}/> : <MoonStar size={16}/>}
            <span className={clsx('hidden sm:inline')}>{dark ? 'Light' : 'Dark'}</span>
          </button>
          <button
            onClick={() => setLang(l => l === 'ar' ? 'en' : 'ar')}
            className="inline-flex items-center gap-1 rounded-xl border px-3 py-1.5 text-xs hover:bg-black/5 dark:hover:bg-white/10"
            title="Language"
          >
            <Languages size={16}/>
            <span className="hidden sm:inline">{lang.toUpperCase()}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
