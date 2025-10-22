// استخلاص المتطلبات من JD عبر LLM
import assert from "node:assert";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
assert(OPENAI_API_KEY, "OPENAI_API_KEY is required");

type JDExtractItem = { requirement: string; mustHave: boolean; weight: number };

export async function extractRequirementsFromJD(
  jd: string,
  lang: "ar" | "en" = "ar"
): Promise<JDExtractItem[]> {
  const prompt = `
أنت مساعد HR تقني. استخرج متطلبات واضحة (requirements) من وصف الوظيفة التالي.
لكل requirement أرجع JSON ككائن يحتوي:
- requirement: نص قصير واضح (كلمة أو جملة قصيرة)
- mustHave: true/false
- weight: رقم من 1..3 (3 للأهم)

IMPORTANT: أرجع JSON array فقط بدون أي كلام إضافي.
JD:
${jd}
`.trim();

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LLM extract failed: ${res.status} ${err}`);
  }
  const json: any = await res.json();
  const text = json.choices?.[0]?.message?.content ?? "[]";
  try {
    const arr = JSON.parse(text);
    return Array.isArray(arr) ? arr.slice(0, 20) : [];
  } catch {
    return [];
  }
}
