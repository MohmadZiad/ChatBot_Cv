// apps/web/src/app/page.tsx
import AIConsole from "@/components/AIConsole";

export default function HomePage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Hero صغير فوق الكونسول */}
      <header className="text-center">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
          مساعد مطابقة السِيَر الذاتية مع الوظائف
        </h1>
        <p className="text-sm text-black/60 dark:text-white/60 mt-2">
          اكتب متطلبات الوظيفة، أرفق CV، واضغط «حلّل الآن» لمشاهدة النتيجة التفصيلية.
        </p>
      </header>

      <AIConsole />

      {/* فوتر خفيف تحت الكونسول */}
      <div className="text-xs opacity-60 text-center">
        جاهز للمقارنة والتصدير من صفحة النتائج.
      </div>
    </div>
  );
}
