// apps/api/src/services/analysis.ts
import { prisma } from "../db/client";
import { Prisma } from "@prisma/client";
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

// نماذج الذكاء المستخدمة في الحسابات والتحليلات
const EMB_MODEL = process.env.EMBEDDINGS_MODEL || "text-embedding-3-small";
const ANALYSIS_MODEL = process.env.ANALYSIS_MODEL || "gpt-4o-mini";

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

      model: `${ANALYSIS_MODEL} | ${EMB_MODEL}`,
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

type Lang = "ar" | "en";

function meanVector(list: number[][]): number[] {
  if (!list.length) return [];
  const size = list[0]?.length ?? 0;
  const acc = new Array(size).fill(0);
  for (const vec of list) {
    for (let i = 0; i < size && i < vec.length; i++) {
      acc[i] += vec[i];
    }
  }
  const denom = list.length || 1;
  return acc.map((value) => value / denom);
}

function serializeMetrics(metrics: any | null | undefined) {
  if (!metrics) return null;
  if (typeof metrics !== "object") return null;
  return metrics as any;
}

export async function compareCvEmbeddings(cvIds: string[]) {
  const uniqueIds = Array.from(new Set(cvIds.filter(Boolean)));
  if (uniqueIds.length < 2)
    throw httpError("يلزم اختيار سيرتين ذاتيتين على الأقل للمقارنة.");

  await Promise.all(uniqueIds.map((id) => ensureCvEmbeddings(id)));

  const rows = await prisma.$queryRaw<
    { cvId: string; embedding: number[] }[]
  >(
    Prisma.sql`
      SELECT "cvId", (embedding::real[]) AS embedding
      FROM "CVChunk"
      WHERE "cvId" IN (${Prisma.join(
        uniqueIds.map((id) => Prisma.sql`${id}`)
      )})
        AND embedding IS NOT NULL
    `
  );

  const byCv = new Map<string, number[][]>();
  for (const row of rows) {
    const list = byCv.get(row.cvId) ?? [];
    list.push(row.embedding || []);
    byCv.set(row.cvId, list);
  }

  const vectors = new Map<string, number[]>();
  for (const [cvId, list] of byCv.entries()) {
    const mean = meanVector(list);
    if (mean.length) vectors.set(cvId, mean);
  }

  const entries = Array.from(vectors.entries());
  const pairs: { a: string; b: string; similarity: number }[] = [];
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const sim = cosine(entries[i][1], entries[j][1]);
      pairs.push({
        a: entries[i][0],
        b: entries[j][0],
        similarity: Number((sim * 100).toFixed(2)),
      });
    }
  }

  const meta = await prisma.cV.findMany({
    where: { id: { in: uniqueIds } },
    select: {
      id: true,
      originalFilename: true,
      createdAt: true,
      lang: true,
    },
  });

  pairs.sort((a, b) => b.similarity - a.similarity);

  const highlights = pairs.map((pair) => {
    const a = meta.find((m) => m.id === pair.a);
    const b = meta.find((m) => m.id === pair.b);
    const nameA = a?.originalFilename || pair.a.slice(0, 8);
    const nameB = b?.originalFilename || pair.b.slice(0, 8);
    let label: string;
    if (pair.similarity >= 85) {
      label = `تشابه مرتفع جدًا (${pair.similarity}%) بين ${nameA} و${nameB}.`;
    } else if (pair.similarity >= 65) {
      label = `تشابه قوي (${pair.similarity}%) بين ${nameA} و${nameB}.`;
    } else {
      label = `تشابه محدود (${pair.similarity}%) بين ${nameA} و${nameB}.`;
    }
    return label;
  });

  return {
    pairs,
    meta: meta.map((m) => ({
      id: m.id,
      name: m.originalFilename || m.id,
      createdAt: m.createdAt?.toISOString?.() ?? null,
      lang: m.lang,
    })),
    insights: highlights,
  };
}

export async function recommendTopCandidates(
  jobId: string,
  cvIds: string[],
  top = 3
) {
  if (!jobId) throw httpError("jobId مطلوب", 400, "BAD_INPUT");
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { requirements: true },
  });
  if (!job) throw httpError("الوظيفة غير موجودة", 404, "JOB_NOT_FOUND");

  const uniqueIds = Array.from(new Set(cvIds.filter(Boolean)));
  if (!uniqueIds.length)
    throw httpError("اختر سيرًا ذاتية للمقارنة", 400, "NO_CV_IDS");

  await Promise.all(uniqueIds.map((id) => ensureCvEmbeddings(id)));

  const existing = await prisma.analysis.findMany({
    where: { jobId, cvId: { in: uniqueIds } },
  });
  const missing = uniqueIds.filter(
    (id) => !existing.some((analysis) => analysis.cvId === id)
  );

  for (const id of missing) {
    try {
      await runAnalysis(jobId, id);
    } catch (err) {
      // لو فشل تحليل CV معين نستمر مع البقية
    }
  }

  const analyses = await prisma.analysis.findMany({
    where: { jobId, cvId: { in: uniqueIds } },
    include: { cv: true },
    orderBy: { score: "desc" },
  });

  const ranking = analyses.map((analysis) => {
    const metrics = serializeMetrics(analysis.metrics) || serializeMetrics(analysis.gaps);
    const weighted = metrics?.weightedScore ?? analysis.score ?? 0;
    const mustPercent = metrics?.mustPercent ?? 0;
    const nicePercent = metrics?.nicePercent ?? 0;
    const missingMust: string[] = metrics?.missingMust || [];
    const improvement: string[] = metrics?.improvement || [];
    return {
      cvId: analysis.cvId,
      fileName: analysis.cv?.originalFilename || analysis.cvId,
      score: Number(weighted),
      mustPercent: Number(mustPercent),
      nicePercent: Number(nicePercent),
      gatePassed:
        typeof metrics?.gatePassed === "boolean"
          ? metrics.gatePassed
          : mustPercent >= 80,
      missingMust,
      improvement,
    };
  });

  ranking.sort((a, b) => Number(b.score) - Number(a.score));
  const best = ranking.slice(0, Math.min(top, ranking.length));

  const summary = best.map((item, idx) => {
    const prefix = `#${idx + 1} ${item.fileName}`;
    const parts = [
      `${prefix} — درجة ${Number(item.score).toFixed(1)} / 10`,
      `تغطية المتطلبات الحرجة ${Number(item.mustPercent).toFixed(1)}%`,
    ];
    if (item.missingMust.length) {
      parts.push(`يفتقد إلى: ${item.missingMust.slice(0, 3).join("، ")}`);
    }
    return parts.join(" • ");
  });

  return {
    job: { id: job.id, title: job.title },
    ranking,
    top: best,
    summary,
  };
}

export async function improvementSuggestions(
  jobId: string,
  cvId: string,
  lang: Lang = "ar"
) {
  if (!jobId || !cvId)
    throw httpError("jobId و cvId مطلوبان", 400, "BAD_INPUT");

  await ensureCvEmbeddings(cvId);

  const [job, cv] = await Promise.all([
    prisma.job.findUnique({
      where: { id: jobId },
      include: { requirements: true },
    }),
    prisma.cV.findUnique({ where: { id: cvId } }),
  ]);

  if (!job) throw httpError("الوظيفة غير موجودة", 404, "JOB_NOT_FOUND");
  if (!cv) throw httpError("السيرة الذاتية غير موجودة", 404, "CV_NOT_FOUND");

  const latest = await prisma.analysis.findFirst({
    where: { jobId, cvId },
    orderBy: { createdAt: "desc" },
  });

  const analysis = latest ?? (await runAnalysis(jobId, cvId));
  const metrics = serializeMetrics(analysis.metrics) || serializeMetrics(analysis.gaps);

  const missingMust: string[] = metrics?.missingMust || [];
  const improvement: string[] = metrics?.improvement || [];
  const mustPercent = Number(metrics?.mustPercent ?? 0);
  const nicePercent = Number(metrics?.nicePercent ?? 0);
  const score = Number(metrics?.weightedScore ?? analysis.score ?? 0);

  const suggestions: string[] = [];
  if (missingMust.length) {
    suggestions.push(
      (lang === "ar"
        ? `أضف خبرات واضحة حول المتطلبات الأساسية التالية: ${missingMust.join("، ")}.`
        : `Add explicit experience covering these must-have items: ${missingMust.join(", ")}.`)
    );
  }
  if (improvement.length) {
    suggestions.push(
      (lang === "ar"
        ? `عزّز السيرة الذاتية بإنجازات أو أرقام حول: ${improvement.join("، ")}.`
        : `Strengthen the CV with concrete achievements for: ${improvement.join(", ")}.`)
    );
  }
  if (nicePercent < 60) {
    suggestions.push(
      lang === "ar"
        ? "حاول إبراز المهارات الإضافية لرفع نسبة الـNice-to-have أعلى من 60%."
        : "Highlight complementary skills to push the nice-to-have coverage above 60%."
    );
  }
  if (!suggestions.length) {
    suggestions.push(
      lang === "ar"
        ? "السيرة الذاتية قوية جدًا مقابل الوظيفة. راجع التنسيق وأضف إنجازًا حديثًا لدعم النتيجة."
        : "This CV is already strong for the role. Refresh formatting and add a recent win to keep it sharp."
    );
  }

  const summary =
    lang === "ar"
      ? `درجة المطابقة الحالية ${score.toFixed(1)} / 10 مع تغطية ${mustPercent.toFixed(
          1
        )}% من المتطلبات الأساسية.`
      : `Current alignment score ${score.toFixed(1)} / 10 covering ${mustPercent.toFixed(
          1
        )}% of must-have requirements.`;

  return {
    summary,
    suggestions,
    metrics: {
      score,
      mustPercent,
      nicePercent,
      missingMust,
      improvement,
    },
    cv: {
      id: cv.id,
      name: cv.originalFilename || cv.id,
    },
    job: {
      id: job.id,
      title: job.title,
    },
  };
}
