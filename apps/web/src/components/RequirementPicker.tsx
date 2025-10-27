"use client";
import { useMemo, useState } from "react";
import type { Lang } from "@/lib/i18n";

export type ReqItem = {
  requirement: string;
  mustHave: boolean;
  weight: number;
};

const IT_WORDS = [
  "React",
  "Next.js",
  "TypeScript",
  "JavaScript",
  "Node.js",
  "Express",
  "NestJS",
  "GraphQL",
  "REST",
  "Tailwind CSS",
  "Sass",
  "CSS3",
  "HTML5",
  "Vite",
  "Webpack",
  "Babel",
  "Redux",
  "Zustand",
  "TanStack Query",
  "RxJS",
  "Jest",
  "Vitest",
  "Playwright",
  "Cypress",
  "Testing Library",
  "MongoDB",
  "PostgreSQL",
  "MySQL",
  "SQLite",
  "Prisma",
  "TypeORM",
  "Drizzle",
  "Redis",
  "ElasticSearch",
  "Kafka",
  "RabbitMQ",
  "AWS",
  "GCP",
  "Azure",
  "Cloudflare",
  "Vercel",
  "Netlify",
  "Docker",
  "Kubernetes",
  "Terraform",
  "CI/CD",
  "GitHub Actions",
  "GitLab CI",
  "CircleCI",
  "Authentication",
  "OAuth2",
  "JWT",
  "SAML",
  "OpenID Connect",
  "Security",
  "OWASP",
  "ZAP",
  "Snyk",
  "SonarQube",
  "WebSockets",
  "Socket.io",
  "gRPC",
  "tRPC",
  "Microservices",
  "Event-driven",
  "DDD",
  "Clean Architecture",
  "SOLID",
  "Performance",
  "Caching",
  "CDN",
  "SSR",
  "SSG",
  "ISR",
  "i18n",
  "RTL",
  "Accessibility",
  "SEO",
  "Analytics",
  "Python",
  "Django",
  "Flask",
  "FastAPI",
  "Go",
  "Rust",
  "C#",
  ".NET",
  "Java",
  "Spring Boot",
  "Kotlin",
  "Agile",
  "Scrum",
  "Kanban",
  "Jira",
  "Confluence",
  "AI",
  "LLM",
  "Prompt Engineering",
  "RAG",
  "Embeddings",
  "Vector DB",
  "pgvector",
  "OpenAI API",
  "LangChain",
  "Whisper",
  "Vision",
  "Mobile",
  "React Native",
  "Expo",
  "PWA",
  "Design Systems",
  "Storybook",
  "Figma",
  "Shadcn UI",
  "Radix UI",
  "Logging",
  "Observability",
  "OpenTelemetry",
  "Sentry",
  "Datadog",
];

type Props = {
  onAdd: (item: ReqItem) => void;
  lang?: Lang;
};

const LABELS: Record<Lang, { title: string; search: string; must: string; weight: string }> = {
  ar: {
    title: "إضافة متطلبات سريعة",
    search: "ابحث عن مهارة…",
    must: "أساسي",
    weight: "وزن",
  },
  en: {
    title: "Quick requirements",
    search: "Search skills…",
    must: "Must",
    weight: "Weight",
  },
};

export default function RequirementPicker({ onAdd, lang = "ar" }: Props) {
  const labels = LABELS[lang] ?? LABELS.ar;
  const weightOptions = useMemo(
    () => [
      { value: 1, label: `${labels.weight} 1` },
      { value: 2, label: `${labels.weight} 2` },
      { value: 3, label: `${labels.weight} 3` },
    ],
    [labels.weight]
  );
  const direction = lang === "ar" ? "rtl" : "ltr";
  const alignment = lang === "ar" ? "text-right" : "text-left";
  const [q, setQ] = useState("");
  const [must, setMust] = useState(true);
  const [weight, setWeight] = useState(1);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s
      ? IT_WORDS.filter((w) => w.toLowerCase().includes(s))
      : IT_WORDS.slice(0, 24);
  }, [q]);

  return (
    <div
      dir={direction}
      className="rounded-2xl border border-[var(--color-border)] bg-[var(--surface)]/90 p-4 shadow-sm"
    >
      <div className="mb-2 text-sm font-semibold text-[var(--foreground)]">
        {labels.title}
      </div>
      <div className="flex items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={labels.search}
          className="flex-1 rounded-2xl border border-[var(--color-border)] bg-[var(--surface-soft)]/70 px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
        />
        <label className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
          <input
            type="checkbox"
            checked={must}
            onChange={(e) => setMust(e.target.checked)}
          />
          {labels.must}
        </label>
        <select
          value={weight}
          onChange={(e) => setWeight(Number(e.target.value))}
          className="rounded-2xl border border-[var(--color-border)] bg-[var(--surface-soft)]/70 px-2 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
        >
          {weightOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-3 grid max-h-48 grid-cols-2 gap-2 overflow-auto pr-1 text-sm">
        {list.map((w) => (
          <button
            key={w}
            onClick={() => onAdd({ requirement: w, mustHave: must, weight })}
            className={`${alignment} rounded-xl border border-[var(--color-border)] bg-[var(--surface-soft)]/60 px-2 py-1 text-[var(--color-text-muted)] transition hover:border-[var(--color-primary)]/50 hover:text-[var(--color-primary)]`}
          >
            {w}
          </button>
        ))}
      </div>
    </div>
  );
}
