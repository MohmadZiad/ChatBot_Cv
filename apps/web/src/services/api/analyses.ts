import { http } from '../http';

export type PerRequirement = {
  requirement: string; mustHave: boolean; weight: number;
  similarity: number; score10: number; bestChunk?: { section: string; content: string }
};
export type Analysis = {
  id: string; jobId: string; cvId: string; status: string;
  score?: number; breakdown?: PerRequirement[]; gaps?: { mustHaveMissing: string[]; improve: string[] };
  model?: string; createdAt: string
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
