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

    const bestChunk =
      best.idx >= 0
        ? {
            id: Number(chunks[best.idx].id),
            section: chunks[best.idx].section,
            excerpt: chunks[best.idx].content.slice(0, 320),
          }
        : null;

    perReq.push({
      requirement: r.requirement,
      mustHave: r.mustHave,
      weight: w,
      similarity: Number(best.score.toFixed(3)),
      score10: final10,
      bestChunkId: bestChunk?.id ?? null,
      bestChunk,
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

  const mustReqs = perReq.filter((r) => r.mustHave);
  const niceReqs = perReq.filter((r) => !r.mustHave);

  const pct = (arr: typeof perReq) =>
    arr.length
      ? Number(
          (
            arr.reduce((sum, item) => sum + Number(item.score10 ?? 0), 0) /
            (arr.length * 10)
          ).toFixed(3)
        ) * 100
      : 0;

  const mustPercent = pct(mustReqs);
  const nicePercent = pct(niceReqs);
  const gatePassed = mustReqs.length === 0 || mustPercent >= 80;

  const topStrengths = perReq
    .filter((item) => Number(item.score10 ?? 0) >= 8)
    .sort((a, b) => Number(b.score10 ?? 0) - Number(a.score10 ?? 0))
    .slice(0, 6)
    .map((item) => ({
      requirement: item.requirement,
      score: Number(item.score10 ?? 0),
      similarity: item.similarity,
    }));

  const gapDetails = gapsFrom(perReq);

  const riskFlags: string[] = [];
  if (!gatePassed) riskFlags.push("must_threshold");
  if (score10 < 6) riskFlags.push("low_total");
  if (perReq.length === 0) riskFlags.push("no_requirements");

  const metrics = {
    totalRequirements: perReq.length,
    mustCount: mustReqs.length,
    niceCount: niceReqs.length,
    mustPercent,
    nicePercent,
    weightedScore: score10,
    gatePassed,
    missingMust: gapDetails.mustHaveMissing,
    improvement: gapDetails.improve,
    topStrengths,
    riskFlags,
    generatedAt: new Date().toISOString(),
  };

  const saved = await prisma.analysis.create({
    data: {
      jobId,
      cvId,
      status: "done",
      score: score10,
      // Prisma 6: استخدم JsonValue
      breakdown: perReq as any,
      evidence: evidence as any,
      gaps: gapDetails as any,
      metrics: metrics as any,

      model: EMB_MODEL,
    },
  });

  return {
    ...saved,
    score: saved.score ? Number(saved.score) : 0,
    breakdown: perReq,
    evidence,
    gaps: gapDetails,
    metrics,
  };
}
