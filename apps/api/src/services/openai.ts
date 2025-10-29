// apps/api/src/services/openai.ts
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// ثبّت الأسماء نفسها في كل المشروع
const EMB_MODEL = process.env.EMBEDDINGS_MODEL || "text-embedding-3-small";
const CHAT_MODEL = process.env.ANALYSIS_MODEL || "gpt-4o-mini";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatOptions = {
  temperature?: number;
  model?: string;
  maxTokens?: number;
  topP?: number;
};

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  // قصّ النص لتفادي تجاوز حدود الإدخال
  const safe = texts.map((t) => (t ?? "").slice(0, 8000));
  const res = await client.embeddings.create({
    model: EMB_MODEL,
    input: safe,
  });
  return res.data.map((d) => d.embedding as unknown as number[]);
}

/**
 * واجهة مضمونة وثابتة تعتمد Chat Completions (المتوافقة مع كل SDK v4)
 * لا تستخدم responses.create هنا لتفادي أخطاء الـ typings.
 */
export async function chatCompletion(
  messages: ChatMessage[],
  options: ChatOptions = {}
): Promise<string> {
  if (!messages.length) return "";
  const response = await client.chat.completions.create({
    model: options.model || CHAT_MODEL,
    messages,
    temperature: options.temperature ?? 0.4,
    max_tokens: options.maxTokens,
    top_p: options.topP,
  });
  return response.choices[0]?.message?.content?.trim() ?? "";
}

function stripJsonFences(text: string): string {
  return text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

export async function chatJson<T = any>(
  messages: ChatMessage[],
  options: ChatOptions = {}
): Promise<T | null> {
  const raw = await chatCompletion(messages, options);
  if (!raw) return null;
  const clean = stripJsonFences(raw);
  try {
    return JSON.parse(clean) as T;
  } catch {
    return null;
  }
}
