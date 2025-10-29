import type { FastifyInstance } from "fastify";
import { prisma } from "../db/client";
import {
  runAnalysis,
  compareCvEmbeddings,
  recommendTopCandidates,
  improvementSuggestions,
} from "../services/analysis.js";

const MIN_TEXT = Number(process.env.MIN_EXTRACTED_TEXT || "60");

// ✅ دالة مساعدة لإنشاء تحليل رمزي Placeholder
async function createPlaceholderAnalysis(
  jobId: string,
  cvId: string,
  reason: "no_text" | "no_requirements" = "no_text"
) {
  const a = await prisma.analysis.create({
    data: {
      jobId,
      cvId,
      score: 0,
      status: "error", // ✅ قيمة صحيحة من enum AnalysisStatus
      breakdown: [],
      gaps: null,
      evidence: null,
      model: null,
      metrics: {
        placeholder: true,
        reason, // السبب (no_text / no_requirements)
        minText: MIN_TEXT,
        createdAt: new Date().toISOString(),
      },
    },
  });

  return {
    ok: true,
    id: a.id,
    jobId,
    cvId,
    score: 0,
    breakdown: [],
    gaps: null,
    metrics: {
      ...a.metrics,
      riskFlags: [reason],
      totalRequirements: 0,
      mustCount: 0,
      niceCount: 0,
      mustPercent: 0,
      nicePercent: 0,
      weightedScore: 0,
      gatePassed: false,
      missingMust: [],
      improvement: [],
      topStrengths: [],
      generatedAt: new Date().toISOString(),
    },
    message:
      reason === "no_text"
        ? "لم يُستخرج نص كافٍ من السيرة — تم إنشاء تحليل رمزي."
        : "الوظيفة بلا متطلبات — تم إنشاء تحليل رمزي.",
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

// ✅ المسار الرئيسي
export async function analysesRoute(app: FastifyInstance) {
  // 🔹 تشغيل التحليل
  app.post("/run", async (req, reply) => {
    const { jobId, cvId } = (await req.body) as any;

    if (!jobId || !cvId) {
      return reply.code(400).send({
        ok: false,
        code: "BAD_INPUT",
        message: "jobId & cvId required",
      });
    }

    try {
      const cv = await prisma.cV.findUnique({ where: { id: cvId } });
      if (!cv)
        return reply
          .code(404)
          .send({ ok: false, code: "CV_NOT_FOUND", message: "CV not found" });

      const textLen = cv.parsedText?.trim()?.length ?? 0;
      if (textLen < MIN_TEXT) {
        app.log.warn(
          { cvId, textLen, min: MIN_TEXT },
          "placeholder analysis due to short text"
        );
        const payload = await createPlaceholderAnalysis(jobId, cvId, "no_text");
        return reply.code(201).send(payload);
      }

      const res = await runAnalysis(jobId, cvId);
      return reply.code(201).send(res);
    } catch (err: any) {
      const code = (err?.code || "").toString();
      if (code === "NO_CV_TEXT") {
        const payload = await createPlaceholderAnalysis(
          (req.body as any).jobId,
          (req.body as any).cvId,
          "no_text"
        );
        return reply.code(201).send(payload);
      }
      if (code === "NO_JOB_REQUIREMENTS") {
        const payload = await createPlaceholderAnalysis(
          (req.body as any).jobId,
          (req.body as any).cvId,
          "no_requirements"
        );
        return reply.code(201).send(payload);
      }

      app.log.error({ err }, "run analysis failed");
      return reply.code(err?.status ?? 500).send({
        ok: false,
        code: code || "ANALYSIS_FAILED",
        message: err?.message || "run analysis failed",
      });
    }
  });

  // 🔹 جلب تحليل معين
  app.get("/:id", async (req, reply) => {
    const { id } = req.params as any;
    const a = await prisma.analysis.findUnique({ where: { id } });
    if (!a) return reply.code(404).send({ ok: false, code: "NOT_FOUND" });
    return {
      ...a,
      score: a.score ? Number(a.score) : null,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    };
  });

  // 🔹 جلب التحليلات حسب CV
  app.get("/by-cv/:cvId", async (req) => {
    const { cvId } = req.params as any;
    const list = await prisma.analysis.findMany({
      where: { cvId },
      orderBy: { createdAt: "desc" },
    });
    return list.map((a) => ({
      ...a,
      score: a.score ? Number(a.score) : null,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    }));
  });

  // 🔹 جلب التحليلات حسب الوظيفة
  app.get("/by-job/:jobId", async (req) => {
    const { jobId } = req.params as any;
    const list = await prisma.analysis.findMany({
      where: { jobId },
      orderBy: [{ score: "desc" }, { createdAt: "desc" }],
      include: {
        cv: { select: { id: true, originalFilename: true, createdAt: true } },
      },
    });
    return list.map((a) => ({
      ...a,
      score: a.score ? Number(a.score) : null,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    }));
  });

  // 🔹 مقارنة الـ CV embeddings
  app.post("/compare", async (req, reply) => {
    try {
      const { cvIds = [] } = (await req.body) as any;
      const res = await compareCvEmbeddings(Array.isArray(cvIds) ? cvIds : []);
      return { ok: true, ...res };
    } catch (err: any) {
      app.log.error({ err }, "compare embeddings failed");
      return reply.code(err?.status ?? 400).send({
        ok: false,
        code: err?.code || "COMPARE_FAILED",
        message: err?.message || "compare failed",
      });
    }
  });

  // 🔹 ترشيح أفضل المرشحين
  app.post("/pick-best", async (req, reply) => {
    try {
      const { jobId, cvIds = [], top } = (await req.body) as any;
      const res = await recommendTopCandidates(
        jobId,
        Array.isArray(cvIds) ? cvIds : [],
        Number(top) || 3
      );
      return { ok: true, ...res };
    } catch (err: any) {
      app.log.error({ err }, "pick best failed");
      return reply.code(err?.status ?? 400).send({
        ok: false,
        code: err?.code || "PICK_FAILED",
        message: err?.message || "pick best failed",
      });
    }
  });

  // 🔹 تحسينات الذكاء الاصطناعي
  app.post("/improve", async (req, reply) => {
    try {
      const { jobId, cvId, lang } = (await req.body) as any;
      const response = await improvementSuggestions(
        jobId,
        cvId,
        lang === "en" ? "en" : "ar"
      );
      return reply.send(response);
    } catch (err: any) {
      app.log.error({ err }, "improve suggestions failed");
      return reply.code(err?.status ?? 400).send({
        ok: false,
        code: err?.code || "IMPROVE_FAILED",
        message: err?.message || "improvement failed",
      });
    }
  });
}
