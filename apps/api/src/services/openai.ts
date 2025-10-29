// apps/api/src/services/openai.ts
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
// نفس المتغيّر في كل مكان (مع S)
const EMB_MODEL = process.env.EMBEDDINGS_MODEL || "text-embedding-3-small";
const CHAT_MODEL = process.env.ANALYSIS_MODEL || "gpt-4o-mini";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ChatOptions = {
  temperature?: number;
  model?: string;
};

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  const safe = texts.map((t) => (t ?? "").slice(0, 8000));
  const res = await client.embeddings.create({
    model: EMB_MODEL,
    input: safe,
  });
  return res.data.map((d) => d.embedding as unknown as number[]);
}

function toResponseInput(messages: ChatMessage[]) {
  return messages.map((msg) => ({
    role: msg.role,
    content: [{ type: "text" as const, text: msg.content }],
  }));
}

function extractResponseText(payload: any): string {
  if (!payload) return "";
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }
  const first = payload.output?.[0]?.content?.[0];
  if (!first) return "";
  if (typeof first === "string") return first.trim();
  if (first?.type === "output_text" && typeof first.text === "string") {
    return first.text.trim();
  }
  if (first?.type === "text" && typeof first.text?.value === "string") {
    return first.text.value.trim();
  }
  if (first?.type === "text" && typeof first.text === "string") {
    return first.text.trim();
  }
  return "";
}

function stripJsonFences(text: string): string {
  return text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

export async function chatCompletion(
  messages: ChatMessage[],
  options: ChatOptions = {}
): Promise<string> {
  if (!messages.length) return "";
  const response = await client.responses.create({
    model: options.model || CHAT_MODEL,
    input: toResponseInput(messages),
    temperature: options.temperature ?? 0.4,
  });
  return extractResponseText(response);
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
