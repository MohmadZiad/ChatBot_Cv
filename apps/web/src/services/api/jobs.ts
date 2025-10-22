import { http } from "../http";

export type JobRequirement = {
  id?: string;
  requirement: string;
  mustHave: boolean;
  weight: number;
};
export type Job = {
  id: string;
  title: string;
  description: string;
  requirements: JobRequirement[];
  createdAt?: string;
};

export const jobsApi = {
  create(input: {
    title: string;
    description: string;
    requirements?: JobRequirement[];
  }) {
    return http.post<Job>("/jobs", input);
  },
  list() {
    return http.get<{ items: Job[] }>("/jobs");
  },
  get(id: string) {
    return http.get<Job>(`/jobs/${id}`);
  },
  addRequirements(jobId: string, items: JobRequirement[]) {
    return http.post(`/jobs/${jobId}/requirements`, { items });
  },
  updateRequirement(id: string, payload: Partial<JobRequirement>) {
    return http.patch(`/jobs/requirements/${id}`, payload);
  },
  deleteRequirement(id: string) {
    return http.delete(`/jobs/requirements/${id}`);
  },

  // NEW: اقتراح متطلبات من JD
  suggestFromJD(jdText: string) {
    return http.post<{ items: JobRequirement[] }>("/jobs/suggest", { jdText });
  },
};
