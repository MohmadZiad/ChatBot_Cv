import { http } from "../http";

export type ExtractedJobFields = {
  title: string;
  summary: string;
  level: string;
  required_experience_years: string;
  contract_types: string[];
  languages: string[];
  must_have: string[];
  nice_to_have: string[];
  tools: string[];
  frameworks: string[];
  apis: string[];
  location: string;
  remote: string;
  notes: string;
};

export type SuggestedRequirements = {
  must_have: { skill: string; weight: number }[];
  nice_to_have: { skill: string; weight: number }[];
};

export type TitleSummary = {
  title: string;
  summary: string;
};

export type LanguagesExtract = {
  languages: string[];
  proficiency_if_stated: Record<string, string>;
};

export type ExperienceExtract = {
  required_experience_years: string;
  experience_detail: string;
};

export type CvQuickCheck = {
  score_percent: number;
  must_have_match: string[];
  must_have_missing: string[];
  nice_to_have_match: string[];
  nice_to_have_missing: string[];
  notes: string;
};

export type DashboardAnalysis = {
  jobs_requirements: {
    title: string;
    summary: string;
    level: string;
    required_experience_years: string;
    languages: string[];
    contract_types: string[];
    must_have: string[];
    nice_to_have: string[];
  };
  cvs_analysis: Array<{
    name: string;
    score_percent: number;
    must_have_match: string[];
    must_have_missing: string[];
    nice_to_have_match: string[];
    nice_to_have_missing: string[];
  }>;
};

export type CandidateHelper = {
  fit_notes: string;
  gaps: string[];
  learning_suggestions: string[];
};

export type RequirementsTemplate = {
  left_column: string[];
  right_column: string[];
};

export const assistantApi = {
  extractFields(jobDescription: string) {
    return http.post<ExtractedJobFields>("/assistant/extract-fields", {
      job_description: jobDescription,
    });
  },
  suggestRequirements(jobDescription: string) {
    return http.post<SuggestedRequirements>("/assistant/suggest-requirements", {
      job_description: jobDescription,
    });
  },
  titleSummary(jobDescription: string) {
    return http.post<TitleSummary>("/assistant/title-summary", {
      job_description: jobDescription,
    });
  },
  languages(jobDescription: string) {
    return http.post<LanguagesExtract>("/assistant/languages", {
      job_description: jobDescription,
    });
  },
  experience(jobDescription: string) {
    return http.post<ExperienceExtract>("/assistant/experience", {
      job_description: jobDescription,
    });
  },
  cvQuickCheck(jobDescription: string, cvText: string) {
    return http.post<CvQuickCheck>("/assistant/cv-quick-check", {
      job_description: jobDescription,
      cv_text: cvText,
    });
  },
  dashboard(jobDescription: string, cvs: { name: string; text: string }[]) {
    return http.post<DashboardAnalysis>("/assistant/analysis-dashboard", {
      job_description: jobDescription,
      cvs,
    });
  },
  quickSuggestions(topic: "عنوان" | "وصف" | "متطلبات" | "ملخص", jobDescription: string) {
    return http.post<{ output: string }>("/assistant/quick-suggestions", {
      topic,
      job_description: jobDescription,
    });
  },
  candidateHelper(candidateProfile: string, jobDescription: string) {
    return http.post<CandidateHelper>("/assistant/candidate-helper", {
      candidate_profile: candidateProfile,
      job_description: jobDescription,
    });
  },
  requirementsTemplate(jobDescription: string) {
    return http.post<RequirementsTemplate>("/assistant/requirements-template", {
      job_description: jobDescription,
    });
  },
  titleText(jobDescription: string) {
    return http.post<{ output: string }>("/assistant/title-text", {
      job_description: jobDescription,
    });
  },
  summaryText(jobDescription: string) {
    return http.post<{ output: string }>("/assistant/summary-text", {
      job_description: jobDescription,
    });
  },
  requirementsList(jobDescription: string) {
    return http.post<{ output: string }>("/assistant/requirements-list", {
      job_description: jobDescription,
    });
  },
};
