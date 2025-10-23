// apps/api/src/services/openai.ts
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
// نفس المتغيّر في كل مكان (مع S)
const EMB_MODEL = process.env.EMBEDDINGS_MODEL || "text-embedding-3-small";

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  const safe = texts.map((t) => (t ?? "").slice(0, 8000));
  const res = await client.embeddings.create({
    model: EMB_MODEL,
    input: safe,
  });
  return res.data.map((d) => d.embedding as unknown as number[]);
}
