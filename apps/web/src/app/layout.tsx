// apps/web/src/app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Topbar from "@/components/ui/Topbar";
import Chatbot from "@/components/Chatbot";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_APP_NAME || "CV Matcher",
  description: "Modern bilingual UI for CV–Job matching",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-dvh bg-gradient-to-br from-[#f8fafc] via-white to-[#eef2ff] dark:from-[#0b0b0f] dark:via-black dark:to-[#0c0f1a] text-foreground`}
      >
        <Topbar />
        <main className="mx-auto max-w-7xl px-4 py-10">
          {/* خلفية دوائر متحركة خفيفة */}
          <div className="pointer-events-none fixed -z-10 inset-0 overflow-hidden">
            <div className="absolute -top-24 -end-24 size-72 rounded-full bg-blue-200/40 blur-3xl animate-pulse dark:bg-blue-900/30" />
            <div className="absolute -bottom-24 -start-24 size-72 rounded-full bg-purple-200/40 blur-3xl animate-pulse [animation-delay:300ms] dark:bg-purple-900/30" />
          </div>
          {children}
        </main>
        <footer className="mx-auto max-w-7xl px-4 pb-8 text-xs text-black/60 dark:text-white/60">
          <div className="flex items-center justify-between">
            <span>
              © {new Date().getFullYear()} •{" "}
              {process.env.NEXT_PUBLIC_APP_NAME || "CV Matcher"}
            </span>
            <span className="font-mono">Next.js • Tailwind • Motion</span>
          </div>
        </footer>
        {/* الزر العائم + نافذة الشات */}
        <Chatbot />
      </body>
    </html>
  );
}
