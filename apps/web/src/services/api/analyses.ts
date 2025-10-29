import { http } from "../http";

const toNumber = (value: unknown, fallback = 0): number => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const toStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

export type PerRequirement = {
  requirement: string;
  mustHave: boolean;
  weight: number;
  similarity: number;
  score10: number;
  bestChunkId?: number | null;
  bestChunk?: { id?: number; section: string; excerpt: string } | null;
};

export type AnalysisMetrics = {
  totalRequirements: number;
  mustCount: number;
  niceCount: number;
  mustPercent: number;
  nicePercent: number;
  weightedScore: number;
  gatePassed: boolean;
  missingMust: string[];
  improvement: string[];
  topStrengths: { requirement: string; score: number; similarity: number }[];
  riskFlags: string[];
  generatedAt?: string;
};

export type EvidenceItem = {
  requirement: string;
  chunk: { id: number; section: string; excerpt: string };
  similarity: number;
};

export type GapSummary = {
  mustHaveMissing: string[];
  improve: string[];
};

export type Analysis = {
  id: string;
  jobId: string;
  cvId: string;
  status: string;
  score: number | null;
  breakdown: PerRequirement[];
  gaps: GapSummary | null;
  metrics: AnalysisMetrics | null;
  evidence: EvidenceItem[] | null;
  model?: string | null;
  cv?: { id: string; name: string; createdAt: string | null } | null;
  createdAt: string;
  updatedAt?: string | null;
};

export type ImproveResponse = {
  ok: boolean;
  summary: string;
  suggestions: string[];
  metrics: {
    score: number;
    mustPercent: number;
    nicePercent: number;
    missingMust: string[];
    improvement: string[];
  };
  cv: { id: string; name: string };
  job: { id: string; title: string };
};

type RawAnalysis = Partial<Analysis> & {
  ok?: boolean;
  breakdown?: unknown;
  evidence?: unknown;
  gaps?: unknown;
  metrics?: unknown;
  score?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  cv?: { id?: unknown; originalFilename?: unknown; name?: unknown; createdAt?: unknown } | null;
};

function normalizeBreakdown(input: unknown): PerRequirement[] {
  if (!Array.isArray(input)) return [];
  const rows: Array<PerRequirement | null> = input.map((entry) => {
    if (!entry || typeof entry !== "object") return null;
    const record = entry as Record<string, unknown>;
    const similarity = toNumber(record.similarity);
    const score10 = toNumber(record.score10 ?? similarity * 10);
    const bestChunkIdRaw = record.bestChunkId;
    const bestChunkId =
      bestChunkIdRaw === null || bestChunkIdRaw === undefined
        ? null
        : toNumber(bestChunkIdRaw);

    const row = {
      requirement: String(record.requirement ?? ""),
      mustHave: Boolean(record.mustHave),
      weight: toNumber(record.weight, 1),
      similarity,
      score10,
      bestChunkId,
      bestChunk:
        record.bestChunk && typeof record.bestChunk === "object"
          ? {
              id: toNumber((record.bestChunk as any).id),
              section: String((record.bestChunk as any).section ?? ""),
              excerpt: String((record.bestChunk as any).excerpt ?? ""),
            }
          : null,
    } satisfies PerRequirement;

    return row;
  });

  // نزيل null ونحوّل النوع إلى PerRequirement[]
  return rows.filter(
    (item): item is PerRequirement => !!item && !!item.requirement
  );
}

function normalizeMetrics(
  input: unknown,
  fallback: GapSummary | null,
  breakdown: PerRequirement[]
): AnalysisMetrics | null {
  if (!input || typeof input !== "object") {
    if (!breakdown.length) return null;
    return {
      totalRequirements: breakdown.length,
      mustCount: breakdown.filter((item) => item.mustHave).length,
      niceCount: breakdown.filter((item) => !item.mustHave).length,
      mustPercent: 0,
      nicePercent: 0,
      weightedScore: 0,
      gatePassed: true,
      missingMust: fallback?.mustHaveMissing ?? [],
      improvement: fallback?.improve ?? [],
      topStrengths: [],
      riskFlags: [],
    };
  }

  const record = input as Record<string, unknown>;
  const topStrengthsRaw = Array.isArray(record.topStrengths)
    ? record.topStrengths
    : [];

  return {
    totalRequirements: toNumber(record.totalRequirements, breakdown.length),
    mustCount: toNumber(record.mustCount, 0),
    niceCount: toNumber(record.niceCount, 0),
    mustPercent: toNumber(record.mustPercent, 0),
    nicePercent: toNumber(record.nicePercent, 0),
    weightedScore: toNumber(record.weightedScore, 0),
    gatePassed: Boolean(record.gatePassed),
    missingMust:
      toStringArray(record.missingMust).length > 0
        ? toStringArray(record.missingMust)
        : (fallback?.mustHaveMissing ?? []),
    improvement:
      toStringArray(record.improvement).length > 0
        ? toStringArray(record.improvement)
        : toStringArray((record as any).improve).length > 0
          ? toStringArray((record as any).improve)
          : (fallback?.improve ?? []),
    topStrengths: topStrengthsRaw
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const row = item as Record<string, unknown>;
        return {
          requirement: String(row.requirement ?? ""),
          score: toNumber(row.score, 0),
          similarity: toNumber(row.similarity, 0),
        };
      })
      .filter(
        (item): item is AnalysisMetrics["topStrengths"][number] =>
          !!item && !!item.requirement
      ),
    riskFlags: toStringArray(record.riskFlags),
    generatedAt: record.generatedAt ? String(record.generatedAt) : undefined,
  };
}

function normalizeGaps(
  gaps: unknown,
  metrics: AnalysisMetrics | null
): GapSummary | null {
  if (metrics) {
    const missing = metrics.missingMust ?? [];
    const improvement = metrics.improvement ?? [];
    return {
      mustHaveMissing: missing,
      improve: improvement,
    };
  }

  if (!gaps || typeof gaps !== "object") return null;
  const record = gaps as Record<string, unknown>;
  const missing =
    toStringArray(record.mustHaveMissing).length > 0
      ? toStringArray(record.mustHaveMissing)
      : toStringArray((record as any).missingMust);
  const improve =
    toStringArray(record.improve).length > 0
      ? toStringArray(record.improve)
      : toStringArray((record as any).improvement);

  if (!missing.length && !improve.length) return null;
  return { mustHaveMissing: missing, improve };
}

function normalizeEvidence(input: unknown): EvidenceItem[] | null {
  if (!Array.isArray(input)) return null;
  const rows: Array<EvidenceItem | null> = input.map((entry) => {
    if (!entry || typeof entry !== "object") return null;
    const record = entry as Record<string, unknown>;
    if (!record.requirement || !record.chunk) return null;
    const chunk = record.chunk as Record<string, unknown>;
    return {
      requirement: String(record.requirement ?? ""),
      chunk: {
        id: toNumber(chunk.id, 0),
        section: String(chunk.section ?? ""),
        excerpt: String(chunk.excerpt ?? ""),
      },
      similarity: toNumber(record.similarity, 0),
    };
  });

  const cleaned = rows.filter(
    (item): item is EvidenceItem => !!item && !!item.requirement
  );
  return cleaned.length ? cleaned : null;
}

export function normalizeAnalysis(input: RawAnalysis): Analysis {
  const breakdown = normalizeBreakdown(input.breakdown);
  const preliminaryGaps = normalizeGaps(input.gaps, null);
  const metrics = normalizeMetrics(input.metrics, preliminaryGaps, breakdown);
  const gaps = normalizeGaps(input.gaps, metrics);
  const cvMeta = input.cv
    ? {
        id: String(input.cv.id ?? ""),
        name: String(
          input.cv.name ?? input.cv.originalFilename ?? input.cv.id ?? ""
        ),
        createdAt: input.cv.createdAt
          ? String(input.cv.createdAt)
          : null,
      }
    : null;

  return {
    id: String(input.id ?? ""),
    jobId: String(input.jobId ?? ""),
    cvId: String(input.cvId ?? ""),
    status: String(input.status ?? "unknown"),
    score:
      input.score === null || input.score === undefined
        ? (metrics?.weightedScore ?? null)
        : toNumber(input.score),
    breakdown,
    gaps,
    metrics,
    evidence: normalizeEvidence(input.evidence),
    model: input.model ? String(input.model) : null,
    cv: cvMeta,
    createdAt: input.createdAt
      ? String(input.createdAt)
      : new Date().toISOString(),
    updatedAt: input.updatedAt ? String(input.updatedAt) : null,
  };
}

function normalizeList(list: RawAnalysis[] | undefined | null): Analysis[] {
  if (!Array.isArray(list)) return [];
  return list.map((item) => normalizeAnalysis(item));
}

function normalizeImprove(input: any): ImproveResponse {
  const suggestions = Array.isArray(input?.suggestions)
    ? input.suggestions.filter(
        (item: unknown): item is string =>
          typeof item === "string" && item.trim().length > 0
      )
    : [];

  const metrics = input?.metrics ?? {};
  return {
    ok: Boolean(input?.ok ?? true),
    summary: String(input?.summary ?? ""),
    suggestions,
    metrics: {
      score: toNumber(metrics?.score, 0),
      mustPercent: toNumber(metrics?.mustPercent, 0),
      nicePercent: toNumber(metrics?.nicePercent, 0),
      missingMust: toStringArray(metrics?.missingMust),
      improvement: toStringArray(metrics?.improvement),
    },
    cv: {
      id: String(input?.cv?.id ?? ""),
      name: String(input?.cv?.name ?? input?.cv?.originalFilename ?? ""),
    },
    job: {
      id: String(input?.job?.id ?? ""),
      title: String(input?.job?.title ?? ""),
    },
  };
}

export const analysesApi = {
  async run(input: { jobId: string; cvId: string }) {
    const res = await http.post<RawAnalysis>("/analyses/run", input);
    return normalizeAnalysis(res);
  },
  async get(id: string) {
    const res = await http.get<RawAnalysis>(`/analyses/${id}`);
    return normalizeAnalysis(res);
  },
  async byCv(cvId: string) {
    const res = await http.get<RawAnalysis[]>(`/analyses/by-cv/${cvId}`);
    return normalizeList(res);
  },
  async byJob(jobId: string) {
    const res = await http.get<RawAnalysis[]>(`/analyses/by-job/${jobId}`);
    return normalizeList(res);
  },
  compare(input: { cvIds: string[] }) {
    return http.post<{
      ok: boolean;
      pairs: { a: string; b: string; similarity: number }[];
      meta: {
        id: string;
        name: string;
        createdAt: string | null;
        lang?: string | null;
      }[];
      insights: string[];
    }>("/analyses/compare", input);
  },
  pickBest(input: { jobId: string; cvIds: string[]; top?: number }) {
    return http.post<{
      ok: boolean;
      job: { id: string; title: string };
      ranking: {
        cvId: string;
        fileName: string;
        score: number;
        mustPercent: number;
        nicePercent: number;
        gatePassed: boolean;
        missingMust: string[];
        improvement: string[];
      }[];
      top: {
        cvId: string;
        fileName: string;
        score: number;
        mustPercent: number;
        nicePercent: number;
        gatePassed: boolean;
        missingMust: string[];
        improvement: string[];
      }[];
      summary: string[];
    }>("/analyses/pick-best", input);
  },
  improve(input: { jobId: string; cvId: string; lang?: "ar" | "en" }) {
    return http
      .post("/analyses/improve", input)
      .then((res) => normalizeImprove(res));
  },
};
