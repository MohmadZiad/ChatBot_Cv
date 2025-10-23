// apps/api/src/services/analysis.ts
import { prisma } from "../db/client";
import type { Prisma } from "@prisma/client";
import { embedTexts } from "./openai.js";
import { cosine } from "./vector.js";
import { ensureCvEmbeddings } from "./embeddings.js";

type HttpError = Error & { status?: number; code?: string };
const httpError = (
  message: string,
  status = 422,
  code = "UNPROCESSABLE"
): HttpError => {
  const e: HttpError = new Error(message);
  e.status = status;
  e.code = code;
  return e;
};

function gapsFrom(perReq: any[]) {
  const missing = perReq
    .filter((r: any) => r.mustHave && r.similarity < 0.35)
    .map((r: any) => r.requirement);
  const improve = perReq
    .filter((r: any) => r.similarity >= 0.2 && (r.score10 ?? 0) < 7)
    .map((r: any) => r.requirement);
  return { mustHaveMissing: missing, improve };
}

// وحّدنا اسم المتغيّر (مع S)
const EMB_MODEL = process.env.EMBEDDINGS_MODEL || "text-embedding-3-small";

export async function runAnalysis(jobId: string, cvId: string) {
  // تأكيد وجود embeddings للـ CV (وتوليدها إذا ناقصة)
  await ensureCvEmbeddings(cvId);

  // قراءة الـ chunks مع تحويل vector -> real[]
  const chunks = await prisma.$queryRaw<
    { id: bigint; section: string; content: string; embedding: number[] }[]
  >`
    SELECT id, section, content, (embedding::real[]) AS embedding
    FROM "CVChunk"
    WHERE "cvId" = ${cvId} AND embedding IS NOT NULL
    ORDER BY id ASC
  `;
  if (!chunks.length)
    throw httpError("لا توجد تضمينات على السيرة الذاتية.", 422, "NO_CV_TEXT");

  // متطلبات الوظيفة
  const reqs = await prisma.jobRequirement.findMany({
    where: { jobId },
    orderBy: { id: "asc" },
  });
  if (!reqs.length)
    throw httpError("الوظيفة بلا متطلبات.", 422, "NO_JOB_REQUIREMENTS");

  // Embeddings للمتطلبات
  let reqVecs: number[][];
  try {
    reqVecs = await embedTexts(
      reqs.map((r: (typeof reqs)[number]) => r.requirement)
    );
  } catch (e: any) {
    const err: HttpError = new Error(
      `OpenAI embeddings failed: ${e?.message || e}`
    );
    err.status = 502;
    err.code = "EMBEDDINGS_FAILED";
    throw err;
  }

  const perReq: any[] = [];
  const evidence: any[] = [];
  let totalWeight = 0;
  let weightedSum = 0;

  for (let i = 0; i < reqs.length; i++) {
    const r = reqs[i];
    const rv = reqVecs[i] ?? [];
    if (!rv.length) continue;

    let best = { score: 0, idx: -1 };
    for (let j = 0; j < chunks.length; j++) {
      const sim = cosine(rv, chunks[j].embedding || []);
      if (sim > best.score) best = { score: sim, idx: j };
    }

    const base10 = Math.round(best.score * 10);
    let final10 = base10;
    if (r.mustHave && best.score < 0.3) final10 = Math.max(0, final10 - 4);

    const w = Number(r.weight ?? 1);
    totalWeight += w;
    weightedSum += final10 * w;

    perReq.push({
      requirement: r.requirement,
      mustHave: r.mustHave,
      weight: w,
      similarity: Number(best.score.toFixed(3)),
      score10: final10,
      bestChunkId: best.idx >= 0 ? Number(chunks[best.idx].id) : null,
    });

    if (best.idx >= 0) {
      const c = chunks[best.idx];
      evidence.push({
        requirement: r.requirement,
        chunk: {
          id: Number(c.id),
          section: c.section,
          excerpt: c.content.slice(0, 300),
        },
        similarity: Number(best.score.toFixed(3)),
      });
    }
  }

  const score10 =
    totalWeight > 0 ? Number((weightedSum / totalWeight).toFixed(1)) : 0;

  const saved = await prisma.analysis.create({
    data: {
      jobId,
      cvId,
      status: "done",
      score: score10,
      // Prisma 6: استخدم JsonValue
      breakdown: perReq as any,
      evidence: evidence as any,
      gaps: gapsFrom(perReq) as any,

      model: EMB_MODEL,
    },
  });

  return { ...saved, score: saved.score ? Number(saved.score) : 0 };
}
