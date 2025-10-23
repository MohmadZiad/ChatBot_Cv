"use client";
import { useMemo, useState } from "react";

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
};

export default function RequirementPicker({ onAdd }: Props) {
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
    <div className="rounded-2xl border p-3 bg-white/70 dark:bg-white/5 backdrop-blur">
      <div className="text-sm font-semibold mb-2">إضافة متطلبات سريعة</div>
      <div className="flex gap-2 items-center">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ابحث عن مهارة…"
          className="flex-1 rounded-xl border px-3 py-2 bg-white/70 dark:bg-white/5"
        />
        <label className="text-xs flex items-center gap-1">
          <input
            type="checkbox"
            checked={must}
            onChange={(e) => setMust(e.target.checked)}
          />
          must
        </label>
        <select
          value={weight}
          onChange={(e) => setWeight(Number(e.target.value))}
          className="rounded-xl border px-2 py-2 bg-white/70 dark:bg-white/5 text-sm"
        >
          <option value={1}>w1</option>
          <option value={2}>w2</option>
          <option value={3}>w3</option>
        </select>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 max-h-48 overflow-auto pr-1">
        {list.map((w) => (
          <button
            key={w}
            onClick={() => onAdd({ requirement: w, mustHave: must, weight })}
            className="text-left rounded-lg border px-2 py-1 hover:bg-black/5 dark:hover:bg-white/10"
          >
            {w}
          </button>
        ))}
      </div>
    </div>
  );
}
