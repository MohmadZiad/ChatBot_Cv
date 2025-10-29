// apps/api/src/services/jd-extract.ts
import assert from "node:assert";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
assert(OPENAI_API_KEY, "OPENAI_API_KEY is required");

// توحيد الموديل مع بقيّة النظام
const MODEL = process.env.ANALYSIS_MODEL || "gpt-4o";

export type JDExtractItem = {
  requirement: string;
  mustHave: boolean;
  weight: number;
};

function clampWeight(x: any) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(3, Math.round(n)));
}

function uniqBy<T>(arr: T[], key: (t: T) => string) {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of arr) {
    const k = key(it).trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

export async function extractRequirementsFromJD(
  jd: string,
  lang: "ar" | "en" = "ar"
): Promise<JDExtractItem[]> {
  const sys =
    lang === "ar"
      ? "أنت مساعد HR تقني. أعد فقط JSON صالح حسب المخطط بدون أي نص إضافي."
      : "You are a technical HR assistant. Return only valid JSON matching the schema with no extra prose.";

  // صيغة موجزة للتعليمات + أمثلة بسيطة تُحسّن الالتزام
  const prompt =
    (lang === "ar"
      ? `استخرج متطلبات واضحة (requirements) من وصف الوظيفة التالي.
أعد مصفوفة JSON من عناصر بهذا الشكل:
{ "requirement": "نص قصير", "mustHave": true|false, "weight": 1|2|3 }
ملاحظات:
- requirement قصيرة ومحددة (كلمة–جملة قصيرة).
- weight: 3 للأهم، 2 متوسط، 1 أقل أهمية.
- لا تكرر البنود، ولا تضف أي تعليق خارج JSON.

الوصف:
`
      : `Extract clear requirements from the following job description.
Return a JSON array of items: { "requirement": "short text", "mustHave": true|false, "weight": 1|2|3 }.
Notes:
- Keep requirement short and specific.
- weight: 3 critical, 2 medium, 1 nice-to-have.
- No duplicates or extra text.

JD:
`) + jd;

  // استخدام JSON Mode لضمان الخرج
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      response_format: { type: "json_object" }, // JSON Mode
      messages: [
        { role: "system", content: sys },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LLM extract failed: ${res.status} ${err}`);
  }

  const json: any = await res.json();
  // في JSON Mode بيجي المحتوى كـ JSON نصّي داخل content
  const text = json?.choices?.[0]?.message?.content || "{}";

  // نتوقع JSON object يحتوي "items" أو "requirements" أو array مباشرة
  let raw: any;
  try {
    raw = JSON.parse(text);
  } catch {
    raw = {};
  }

  let arr: any[] = Array.isArray(raw)
    ? raw
    : raw.items || raw.requirements || [];
  if (!Array.isArray(arr)) arr = [];

  // تنظيف وتثبيت
  const cleaned = arr
    .map((r: any) => ({
      requirement: String(r?.requirement || "")
        .trim()
        .slice(0, 120),
      mustHave: Boolean(r?.mustHave),
      weight: clampWeight(r?.weight),
    }))
    .filter((r) => r.requirement.length >= 2);

  const unique = uniqBy(cleaned, (r) => r.requirement).slice(0, 20);
  return unique;
}
