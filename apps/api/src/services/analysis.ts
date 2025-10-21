// apps/api/src/services/analysis.ts
import { prisma } from "../db/client";
import { Prisma } from "@prisma/client";
import { embedTexts } from "./openai.js";
import { cosine } from "./vector.js";
import type { AnalysisStatus } from "@prisma/client";
import { ensureCvEmbeddings } from "./embeddings.js";

const DIM = Number(process.env.EMBEDDING_DIM || "1536");

export async function runAnalysis(jobId: string, cvId: string) {
  // أنشئ سجل التحليل
  const analysis = await prisma.analysis.create({
    data: { jobId, cvId, status: "processing" as AnalysisStatus },
  });

  try {
    // تأكد أنّ الـ CV لديه embeddings
    await ensureCvEmbeddings(cvId);

    // هات الشُنكس مع المتجهات كـ real[] (cast من pgvector)
    const chunks = await prisma.$queryRaw<
      { id: bigint; section: string; content: string; embedding: number[] }[]
    >`
      SELECT id, section, content, (embedding::real[]) AS embedding
      FROM "CVChunk"
      WHERE "cvId" = ${cvId} AND "embedding" IS NOT NULL
      ORDER BY id ASC
    `;

    if (!chunks.length) throw new Error("No CV chunks embeddings available.");

    // هات متطلبات الوظيفة
    const reqs = await prisma.jobRequirement.findMany({
      where: { jobId },
      orderBy: { id: "asc" },
    });
    if (!reqs.length) throw new Error("Job has no requirements.");

    // المتجهات لمتطلبات الوظيفة
    const reqVecs = await embedTexts(reqs.map((r) => r.requirement));

    const perReq: any[] = [];
    let totalWeight = 0;
    let weightedSum = 0;
    const evidence: any[] = [];

    for (let i = 0; i < reqs.length; i++) {
      const r = reqs[i];
      const rv = reqVecs[i] ?? [];
      if (!Array.isArray(rv) || !rv.length) continue;

      // ابحث أعلى تشابه cosine مع الشُنكس
      let best = { score: 0, chunkIdx: -1 };
      for (let j = 0; j < chunks.length; j++) {
        const cvv = chunks[j].embedding || [];
        const s = cosine(rv, cvv);
        if (s > best.score) best = { score: s, chunkIdx: j };
      }

      // علامة من 0..10
      const localScore10 = Math.max(
        0,
        Math.min(10, Math.round(best.score * 10))
      );

      // عقوبة mustHave لو أقل من 0.3
      let finalScore10 = localScore10;
      if (r.mustHave && best.score < 0.3)
        finalScore10 = Math.max(0, finalScore10 - 4);

      perReq.push({
        requirement: r.requirement,
        mustHave: r.mustHave,
        weight: Number(r.weight ?? 1), // ← تبسيط آمن
        similarity: Number(best.score.toFixed(3)),
        score10: finalScore10,
        bestChunkId: best.chunkIdx >= 0 ? chunks[best.chunkIdx].id : null,
      });

      const w = Number(r.weight ?? 1);
      totalWeight += w;
      weightedSum += finalScore10 * w;

      if (best.chunkIdx >= 0) {
        evidence.push({
          requirement: r.requirement,
          chunk: {
            id: chunks[best.chunkIdx].id,
            section: chunks[best.chunkIdx].section,
            excerpt: chunks[best.chunkIdx].content.slice(0, 300),
          },
          similarity: Number(best.score.toFixed(3)),
        });
      }
    }

    const total10 =
      totalWeight > 0 ? Number((weightedSum / totalWeight).toFixed(1)) : 0;

    const breakdown = {
      perRequirement: perReq,
      totalWeight,
    };

    // خزّن النتيجة
    await prisma.analysis.update({
      where: { id: analysis.id },
      data: {
        score: total10,
        breakdown: breakdown as Prisma.InputJsonValue,
        gaps: buildGaps(perReq) as Prisma.InputJsonValue,
        evidence: evidence as Prisma.InputJsonValue,
        model: process.env.EMBEDDING_MODEL || "text-embedding-3-small",
      },
    });

    return await prisma.analysis.findUnique({ where: { id: analysis.id } });
  } catch (err: any) {
    await prisma.analysis.update({
      where: { id: analysis.id },
      data: {
        status: "error",
        breakdown: {
          error: err?.message || String(err),
        } as Prisma.InputJsonValue,
      },
    });
    throw err;
  }
}

function buildGaps(perReq: any[]) {
  const missing = perReq
    .filter((r) => r.mustHave && r.similarity < 0.3)
    .map((r) => r.requirement);
  const weak = perReq
    .filter((r) => r.similarity >= 0.3 && r.score10 < 7)
    .map((r) => r.requirement);
  return { mustHaveMissing: missing, improve: weak };
}
