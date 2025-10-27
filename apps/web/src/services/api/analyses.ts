import { http } from "../http";

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

export type Analysis = {
  id: string;
  jobId: string;
  cvId: string;
  status: string;
  score?: number;
  breakdown?: PerRequirement[];
  gaps?:
    | { mustHaveMissing: string[]; improve: string[] }
    | AnalysisMetrics
    | null;
  metrics?: AnalysisMetrics | null;
  evidence?: EvidenceItem[] | null;
  model?: string;
  createdAt: string;
  updatedAt?: string;
};

// ---- Helpers ---------------------------------------------------------------
async function postWithFallback<T>(path: string, payloads: any[]): Promise<T> {
  let lastErr: any;
  for (const body of payloads) {
    try {
      return await http.post<T>(path, body);
    } catch (e: any) {
      lastErr = e;
      if (!/^(HTTP\s)?422/.test(e?.message || "")) throw e; // other errors: stop
      // try next payload variant
      // eslint-disable-next-line no-console
      console.warn(`[${path}] 422 -> retry with`, body);
    }
  }
  throw lastErr;
}

// ---- API ------------------------------------------------------------------
export const analysesApi = {
  async run(input: {
    jobId: string;
    cvId: string;
    requirements?: any[];
    lang?: string;
    title?: string;
    description?: string;
  }) {
    const payloads = [
      { job_id: input.jobId, cv_id: input.cvId },
      { jobId: input.jobId, cvId: input.cvId },
      {
        job_id: input.jobId,
        cv_id: input.cvId,
        requirements: input.requirements,
        lang: input.lang,
        title: input.title,
        description: input.description,
      },
      {
        jobId: input.jobId,
        cvId: input.cvId,
        requirements: input.requirements,
        lang: input.lang,
        title: input.title,
        description: input.description,
      },
    ];
    return await postWithFallback<Analysis>("/analyses/run", payloads);
  },

  get(id: string) {
    return http.get<Analysis>(`/analyses/${id}`);
  },

  byCv(cvId: string) {
    return http.get<Analysis[]>(`/analyses/by-cv/${cvId}`);
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

  async pickBest(input: { jobId: string; cvIds: string[]; top?: number }) {
    return await postWithFallback<{
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
      summary: string[] | string;
    }>("/analyses/pick-best", [
      { job_id: input.jobId, cv_ids: input.cvIds, top: input.top },
      { jobId: input.jobId, cvIds: input.cvIds, top: input.top },
    ]);
  },

  async improve(input: {
    jobId: string;
    cvId: string;
    lang?: "ar" | "en";
    text?: string;
  }) {
    return await postWithFallback<{
      ok: boolean;
      summary: string | string[];
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
    }>("/analyses/improve", [
      {
        job_id: input.jobId,
        cv_id: input.cvId,
        lang: input.lang,
        text: input.text,
      },
      {
        jobId: input.jobId,
        cvId: input.cvId,
        lang: input.lang,
        text: input.text,
      },
    ]);
  },
};
