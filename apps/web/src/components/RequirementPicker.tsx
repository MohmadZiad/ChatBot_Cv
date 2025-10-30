"use client";
import { useCallback, useMemo, useState } from "react";
import type { Lang } from "@/lib/i18n";

export type ReqItem = {
  requirement: string;
  mustHave: boolean;
  weight: number;
};

type CategoryConfig = {
  id: string;
  label: Record<Lang, string>;
  items: readonly string[];
};

const CATEGORY_DATA = [
  {
    id: "tech",
    label: { ar: "برمجة وتقنية", en: "Engineering" },
    items: [
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
      "Redux",
      "Zustand",
      "TanStack Query",
      "Jest",
      "Playwright",
      "Cypress",
      "MongoDB",
      "PostgreSQL",
      "Prisma",
      "Redis",
      "ElasticSearch",
      "Kafka",
      "AWS",
      "GCP",
      "Azure",
      "Docker",
      "Kubernetes",
      "Terraform",
      "CI/CD",
      "GitHub Actions",
      "Authentication",
      "OAuth2",
      "JWT",
      "Security",
      "WebSockets",
      "Microservices",
      "Event-driven",
      "Clean Architecture",
      "Performance",
      "Caching",
      "SSR",
      "Accessibility",
      "SEO",
      "Python",
      "Django",
      "FastAPI",
      "Rust",
      ".NET",
      "Spring Boot",
      "Agile",
      "Scrum",
      "AI",
      "LLM",
      "Prompt Engineering",
      "LangChain",
      "Mobile",
      "React Native",
      "Design Systems",
      "Storybook",
      "Observability",
      "OpenTelemetry",
      "Sentry",
      "Datadog",
    ],
  },
  {
    id: "product",
    label: { ar: "منتج", en: "Product" },
    items: [
      "Product Strategy",
      "Roadmap Planning",
      "User Research",
      "Discovery Workshops",
      "Stakeholder Alignment",
      "OKR Planning",
      "Feature Prioritisation",
      "A/B Testing",
      "Journey Mapping",
      "Product Analytics",
      "Go-To-Market",
      "Pricing",
      "Product Ops",
    ],
  },
  {
    id: "design",
    label: { ar: "تصميم", en: "Design" },
    items: [
      "UI Design",
      "UX Research",
      "Wireframing",
      "Prototyping",
      "Design Systems",
      "Accessibility",
      "Design Critique",
      "Motion Design",
      "Brand Guidelines",
      "Figma",
      "Usability Testing",
      "Information Architecture",
      "Design Ops",
    ],
  },
  {
    id: "hr",
    label: { ar: "موارد بشرية", en: "People" },
    items: [
      "Talent Acquisition",
      "Onboarding",
      "Performance Reviews",
      "Payroll",
      "HRIS",
      "Compensation",
      "Employee Engagement",
      "Learning & Development",
      "Succession Planning",
      "Policy Writing",
      "Employer Branding",
      "Workforce Planning",
    ],
  },
  {
    id: "marketing",
    label: { ar: "تسويق", en: "Marketing" },
    items: [
      "Content Strategy",
      "Copywriting",
      "SEO",
      "Performance Marketing",
      "Paid Campaigns",
      "Email Automation",
      "Social Media",
      "Brand Partnerships",
      "Event Marketing",
      "Community Building",
      "Influencer Marketing",
      "PR Outreach",
    ],
  },
  {
    id: "sales",
    label: { ar: "مبيعات", en: "Sales" },
    items: [
      "Pipeline Management",
      "Account Management",
      "Lead Qualification",
      "Forecasting",
      "Negotiation",
      "CRM",
      "Territory Planning",
      "Upselling",
      "Customer Success",
      "B2B Sales",
      "Channel Partners",
    ],
  },
  {
    id: "finance",
    label: { ar: "مالية", en: "Finance" },
    items: [
      "Financial Modelling",
      "Budgeting",
      "Forecasting",
      "Variance Analysis",
      "Accounting Standards",
      "Cash Flow",
      "Audit",
      "Risk Management",
      "Treasury",
      "Payroll",
      "Procurement",
    ],
  },
  {
    id: "operations",
    label: { ar: "عمليات", en: "Operations" },
    items: [
      "Process Improvement",
      "Lean",
      "Six Sigma",
      "Vendor Management",
      "Inventory Control",
      "Logistics",
      "SLA Management",
      "Customer Support",
      "Quality Assurance",
      "Service Design",
      "Capacity Planning",
    ],
  },
  {
    id: "education",
    label: { ar: "تعليم", en: "Education" },
    items: [
      "Curriculum Design",
      "Classroom Management",
      "Lesson Planning",
      "Assessment",
      "Special Education",
      "Blended Learning",
      "STEM Integration",
      "Teacher Training",
      "Parent Communication",
      "Educational Technology",
    ],
  },
  {
    id: "health",
    label: { ar: "صحة", en: "Healthcare" },
    items: [
      "Patient Care",
      "Clinical Assessment",
      "Electronic Medical Records",
      "Infection Control",
      "Medication Management",
      "Team Handover",
      "Rehabilitation",
      "Telemedicine",
      "Health Education",
      "Emergency Response",
    ],
  },
] satisfies ReadonlyArray<CategoryConfig>;

type CategoryId = (typeof CATEGORY_DATA)[number]["id"];

const CATEGORY_ITEMS: Array<{
  label: string;
  category: CategoryId;
}> = (() => {
  const map = new Map<string, { label: string; category: CategoryId }>();
  for (const cat of CATEGORY_DATA) {
    for (const raw of cat.items) {
      const key = raw.trim().toLowerCase();
      if (!key) continue;
      if (!map.has(key)) map.set(key, { label: raw, category: cat.id });
    }
  }
  return Array.from(map.values());
})();

type Props = {
  onAdd: (item: ReqItem) => void;
  lang?: Lang;
};

const LABELS: Record<
  Lang,
  {
    title: string;
    search: string;
    must: string;
    nice: string;
    add: string;
    weight: string;
    categories: string;
    noResults: string;
  }
> = {
  ar: {
    title: "إضافة متطلبات سريعة",
    search: "ابحث عن مهارة…",
    must: "أساسي",
    nice: "إضافي",
    add: "إضافة",
    weight: "وزن",
    categories: "اختر المجال",
    noResults: "لا توجد عناصر مطابقة حالياً",
  },
  en: {
    title: "Quick requirements",
    search: "Search skills…",
    must: "Must",
    nice: "Nice",
    add: "Add",
    weight: "Weight",
    categories: "Pick a domain",
    noResults: "No items found yet",
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
  const activeLang: Lang = lang ?? "ar";
  const direction = activeLang === "ar" ? "rtl" : "ltr";
  const alignment = activeLang === "ar" ? "text-right" : "text-left";
  const [q, setQ] = useState("");
  const [must, setMust] = useState(true);
  const [weight, setWeight] = useState(1);
  const [category, setCategory] = useState<CategoryId>(CATEGORY_DATA[0]?.id ?? "tech");
  const categories = CATEGORY_DATA;
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s) {
      return CATEGORY_ITEMS.filter((item) =>
        item.label.toLowerCase().includes(s)
      ).slice(0, 40);
    }
    return CATEGORY_ITEMS.filter((item) => item.category === category).slice(
      0,
      28
    );
  }, [category, q]);

  const handleAddCustom = useCallback(() => {
    const trimmed = q.trim();
    if (!trimmed) return;
    onAdd({ requirement: trimmed, mustHave: must, weight });
    setQ("");
  }, [q, must, weight, onAdd]);

  return (
    <div
      dir={direction}
      className="rounded-2xl border border-[var(--color-border)] bg-[var(--surface)]/90 p-4 shadow-sm"
    >
      <div className="mb-2 text-sm font-semibold text-[var(--foreground)]">
        {labels.title}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-text-muted)]">
        <span>{labels.categories}</span>
        <div className="flex flex-wrap gap-1">
          {categories.map((cat) => {
            const active = cat.id === category;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategory(cat.id)}
                className={`rounded-full border px-2 py-1 transition ${
                  active
                    ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                    : "border-[var(--color-border)] bg-[var(--surface-soft)]/70 text-[var(--color-text-muted)] hover:border-[var(--color-primary)]/40 hover:text-[var(--color-primary)]"
                }`}
              >
                {cat.label[activeLang] ?? cat.label.ar}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              handleAddCustom();
            }
          }}
          placeholder={labels.search}
          className="flex-1 rounded-2xl border border-[var(--color-border)] bg-[var(--surface-soft)]/70 px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
        />
        <div className="flex items-center gap-1 rounded-2xl border border-[var(--color-border)] bg-[var(--surface-soft)]/70 p-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setMust(true)}
            className={`rounded-2xl px-2 py-1 transition ${
              must
                ? "bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
            }`}
          >
            {labels.must}
          </button>
          <button
            type="button"
            onClick={() => setMust(false)}
            className={`rounded-2xl px-2 py-1 transition ${
              must
                ? "text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
                : "bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
            }`}
          >
            {labels.nice}
          </button>
        </div>
        <button
          type="button"
          onClick={handleAddCustom}
          className="inline-flex items-center rounded-2xl border border-[var(--color-primary)]/40 bg-[var(--surface-soft)]/60 px-3 py-2 text-xs font-semibold text-[var(--color-primary)] transition hover:bg-[var(--color-primary)]/10"
        >
          {labels.add}
        </button>
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
        {list.length ? (
          list.map((item) => (
            <button
              key={`${item.category}-${item.label}`}
              onClick={() =>
                onAdd({ requirement: item.label, mustHave: must, weight })
              }
              className={`${alignment} rounded-xl border border-[var(--color-border)] bg-[var(--surface-soft)]/60 px-2 py-1 text-[var(--color-text-muted)] transition hover:border-[var(--color-primary)]/50 hover:text-[var(--color-primary)]`}
            >
              {item.label}
            </button>
          ))
        ) : (
          <div className="col-span-2 rounded-xl border border-dashed border-[var(--color-border)]/60 bg-[var(--surface-soft)]/40 px-3 py-4 text-center text-xs text-[var(--color-text-muted)]">
            {labels.noResults}
          </div>
        )}
      </div>
    </div>
  );
}
