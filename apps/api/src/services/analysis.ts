// apps/api/src/services/analysis.ts
import { prisma } from "../db/client";
import { Prisma } from "@prisma/client";
import { embedTexts } from "./openai.js";
import { cosine } from "./vector.js";
import { ensureCvEmbeddings } from "./embeddings.js";
import { debugLog } from "../utils/debug.js";

type HttpError = Error & { status?: number; code?: string };

const EMBEDDING_MODEL =
  process.env.EMBEDDINGS_MODEL ||
  process.env.EMBEDDING_MODEL ||
  "text-embedding-3-small";

function httpError(
  message: string,
  status = 422,
  code = "UNPROCESSABLE"
): HttpError {
  const err: HttpError = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

export async function runAnalysis(jobId: string, cvId: string) {
  debugLog("analysis.run", "starting analysis", { jobId, cvId });
  // يضمن وجود embeddings أو يرمي 422 NO_CV_TEXT
  await ensureCvEmbeddings(cvId);

  const chunks = await prisma.$queryRaw<
    { id: bigint; section: string; content: string; embedding: number[] }[]
  >`
    SELECT id, section, content, (embedding::real[]) AS embedding
    FROM "CVChunk"
    WHERE "cvId" = ${cvId} AND embedding IS NOT NULL
    ORDER BY id ASC
  `;
  if (!chunks.length) {
    throw httpError("لا توجد تضمينات على السيرة الذاتية.", 422, "NO_CV_TEXT");
  }

  debugLog("analysis.run", "loaded cv chunks", {
    jobId,
    cvId,
    chunkCount: chunks.length,
  });

  const reqs = await prisma.jobRequirement.findMany({
    where: { jobId },
    orderBy: { id: "asc" },
  });
  if (!reqs.length)
    throw httpError("الوظيفة بلا متطلبات.", 422, "NO_JOB_REQUIREMENTS");

  debugLog("analysis.run", "loaded job requirements", {
    jobId,
    cvId,
    requirementCount: reqs.length,
  });

  let reqVecs: number[][];
  try {
    debugLog("analysis.run", "requesting embeddings", {
      jobId,
      cvId,
      model: EMBEDDING_MODEL,
      requirementCount: reqs.length,
    });
    reqVecs = await embedTexts(reqs.map((r) => r.requirement), EMBEDDING_MODEL);
  } catch (e: any) {
    const err: HttpError = new Error(
      `OpenAI embeddings failed: ${e?.message || e}`
    );
    err.status = 502; // Bad Gateway لخدمة خارجية
    err.code = "EMBEDDINGS_FAILED";
    throw err;
  }

  debugLog("analysis.run", "computed embeddings", {
    jobId,
    cvId,
    model: EMBEDDING_MODEL,
  });

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
      bestChunkId: best.idx >= 0 ? chunks[best.idx].id : null,
    });

    if (best.idx >= 0) {
      evidence.push({
        requirement: r.requirement,
        chunk: {
          id: chunks[best.idx].id,
          section: chunks[best.idx].section,
          excerpt: chunks[best.idx].content.slice(0, 300),
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
      breakdown: perReq as unknown as Prisma.InputJsonValue,
      evidence: evidence as Prisma.InputJsonValue,
      gaps: buildGaps(perReq) as Prisma.InputJsonValue,
      model: EMBEDDING_MODEL,
    },
  });

  debugLog("analysis.run", "analysis completed", {
    analysisId: saved.id,
    jobId,
    cvId,
    score: saved.score ? Number(saved.score) : 0,
  });

  return {
    ...saved,
    score: saved.score ? Number(saved.score) : 0,
  };
}

function buildGaps(perReq: any[]) {
  const missing = perReq
    .filter((r: any) => r.mustHave && r.similarity < 0.35)
    .map((r: any) => r.requirement);
  const weak = perReq
    .filter((r: any) => r.similarity >= 0.2 && r.score10 < 7)
    .map((r: any) => r.requirement);
  return { mustHaveMissing: missing, improve: weak };
}
