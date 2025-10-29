import type { FastifyBaseLogger } from "fastify";
import { chatJson } from "./openai.js";

export type SuggestedRequirement = {
  requirement: string;
  mustHave: boolean;
  weight: number;
};

type SuggestOptions = {
  logger?: FastifyBaseLogger;
  model?: string;
};

const DEFAULT_MODEL = process.env.ANALYSIS_MODEL || "gpt-4o-mini";

const normalizeList = (list: any[]): SuggestedRequirement[] =>
  (Array.isArray(list) ? list : [])
    .map((item) => {
      if (!item) return null;
      const requirement = String(item.requirement ?? item.text ?? "").trim();
      if (!requirement) return null;
      return {
        requirement: requirement.slice(0, 160),
        mustHave: Boolean(
          typeof item.mustHave === "boolean" ? item.mustHave : item.priority !== "nice"
        ),
        weight: Math.min(
          3,
          Math.max(1, Number(item.weight ?? item.score ?? 1) || 1)
        ),
      } satisfies SuggestedRequirement;
    })
    .filter(Boolean) as SuggestedRequirement[];

const fallbackFromText = (text: string): SuggestedRequirement[] =>
  text
    .split(/\r?\n|[•\-*–]/g)
    .map((line) => line.replace(/^[\s\d).:-]+/, "").trim())
    .filter((line) => line.length >= 4)
    .slice(0, 12)
    .map((line) => ({
      requirement: line.slice(0, 160),
      mustHave: /must|أساسي|خبرة|required|fundamental|essential/i.test(line),
      weight: /senior|lead|expert|10\+|8\+|15\+|خبير|قوي|advanced/i.test(line)
        ? 3
        : 1,
    }));

export async function suggestRequirementsFromDescription(
  raw: string,
  options: SuggestOptions = {}
): Promise<SuggestedRequirement[]> {
  const trimmed = typeof raw === "string" ? raw.trim() : String(raw ?? "").trim();
  if (!trimmed) return [];

  const lang = /[\u0600-\u06FF]/.test(trimmed) ? "ar" : "en";
  const model = options.model || DEFAULT_MODEL;

  if (!process.env.OPENAI_API_KEY) {
    options.logger?.warn("OPENAI_API_KEY missing, falling back to rule extraction");
    return fallbackFromText(trimmed);
  }

  try {
    const ai = await chatJson<
      | { items?: SuggestedRequirement[] }
      | SuggestedRequirement[]
    >(
      [
        {
          role: "system",
          content:
            lang === "ar"
              ? 'أنت مستشار توظيف. استخرج متطلبات مختصرة من وصف الوظيفة وأعد JSON فقط بالشكل {"items": [{"requirement": string, "mustHave": boolean, "weight": number}]}. لا تضف أي شرح.'
              : 'You are a hiring assistant. Extract concise requirements from the job description and respond with JSON only shaped as {"items": [{"requirement": string, "mustHave": boolean, "weight": number}]}. Do not add commentary.',
        },
        {
          role: "user",
          content:
            (lang === "ar"
              ? "حوّل الوصف إلى متطلبات موجزة، عيّن mustHave ووزن (1-3) لكل بند."
              : "Convert the description into concise requirements, set mustHave and a weight (1-3) for each item.") +
            "\n" +
            trimmed.slice(0, 3200),
        },
      ],
      { temperature: 0.15, model }
    );

    let items = Array.isArray(ai) ? normalizeList(ai) : normalizeList(ai?.items ?? []);
    if (!items.length) items = fallbackFromText(trimmed);
    return items;
  } catch (error) {
    options.logger?.error({ err: error }, "suggestRequirementsFromDescription failed");
    return fallbackFromText(trimmed);
  }
}

