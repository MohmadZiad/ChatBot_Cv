import { http } from '../http';

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
  gaps?: { mustHaveMissing: string[]; improve: string[] } | AnalysisMetrics | null;
  metrics?: AnalysisMetrics | null;
  evidence?: EvidenceItem[] | null;
  model?: string;
  createdAt: string;
  updatedAt?: string;
};

export const analysesApi = {
  run(input: { jobId: string; cvId: string }) {
    return http.post<Analysis>('/analyses/run', input);
  },
  get(id: string) {
    return http.get<Analysis>(`/analyses/${id}`);
  },
  byCv(cvId: string) {
    return http.get<Analysis[]>(`/analyses/by-cv/${cvId}`);
  }
};
