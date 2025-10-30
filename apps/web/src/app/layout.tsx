// apps/web/src/app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import Topbar from "@/components/ui/Topbar";
import Chatbot from "@/components/Chatbot";
import SplashScreen from "@/components/ui/SplashScreen";

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_APP_NAME || "CV Matcher",
  description: "Modern bilingual UI for CV–Job matching",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        {/* تهيئة اللغة/الاتجاه والثيم مبكرًا جدًا لتفادي الفلاش */}
        <script
          // سكربت متزامن مسموح داخل <head>
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var ls = window.localStorage;
                var lang = (ls.getItem("lang") || "ar");
                var theme = (ls.getItem("theme") || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
                document.documentElement.setAttribute("lang", lang);
                document.documentElement.setAttribute("dir", lang === "ar" ? "rtl" : "ltr");
                if (theme === "dark") document.documentElement.classList.add("dark");
                else document.documentElement.classList.remove("dark");
              } catch(_) {}
            `,
          }}
        />
      </head>

      <body
        suppressHydrationWarning
        className="antialiased min-h-dvh text-foreground"
      >
        <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-32 -end-32 h-[420px] w-[420px] rounded-full bg-[#FFB26B]/40 blur-3xl" />
          <div className="absolute -bottom-40 -start-20 h-[520px] w-[520px] rounded-full bg-[#FF7A00]/20 blur-[160px]" />
        </div>
        <SplashScreen />
        <Topbar />
        <main className="relative mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6 lg:px-8">
          {children}
        </main>
        <footer className="mx-auto max-w-6xl px-4 pb-8 text-xs text-[#2F3A4A]/70 dark:text-white/60 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>
              © {new Date().getFullYear()} • {process.env.NEXT_PUBLIC_APP_NAME || "CV Matcher"}
            </span>
            <span className="font-mono text-[#D85E00] dark:text-[#FFB26B]">Private • Secure • Realtime Scoring</span>
          </div>
        </footer>
        <Chatbot />
      </body>
    </html>
  );
}
