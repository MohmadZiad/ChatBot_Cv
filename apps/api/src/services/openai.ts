// apps/api/src/services/openai.ts
import assert from "node:assert";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
assert(OPENAI_API_KEY, "OPENAI_API_KEY is required");

export async function embedTexts(
  texts: string[],
  model = process.env.EMBEDDING_MODEL || "text-embedding-3-small"
): Promise<number[][]> {
  const safe = texts.map((t) => (t ?? "").slice(0, 8000));
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, input: safe }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI embeddings failed: ${res.status} ${err}`);
  }
  const json: any = await res.json();
  return json.data.map((d: any) => d.embedding as number[]);
}
