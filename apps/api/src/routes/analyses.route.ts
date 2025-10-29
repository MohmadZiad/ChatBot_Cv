// apps/api/src/routes/analyses.route.ts
import type { FastifyInstance } from "fastify";
import { prisma } from "../db/client";
import {
  runAnalysis,
  compareCvEmbeddings,
  recommendTopCandidates,
  improvementSuggestions,
} from "../services/analysis.js";
import { Prisma, AnalysisStatus } from "@prisma/client";

const MIN_TEXT = Number(process.env.MIN_EXTRACTED_TEXT || "60");

// دالة تساعد على إنشاء تحليل Placeholder عند نقص النص/المتطلبات
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
      status: AnalysisStatus.validated, // ✅ enum صحيح
      breakdown: [], // Json OK
      gaps: Prisma.DbNull, // ✅ بدل null
      evidence: Prisma.DbNull, // ✅ بدل null
      model: null, // String? OK
      // نخزن السبب داخل الميتريكس بدلًا من status نصّي
      metrics: {
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
        riskFlags: [reason],
        generatedAt: new Date().toISOString(),
      } as any,
    },
  });

  return {
    ok: true,
    id: a.id,
    jobId,
    cvId,
    status: "validated",
    score: 0,
    breakdown: [],
    gaps: null,
    metrics: {
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
      riskFlags: [reason],
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

export async function analysesRoute(app: FastifyInstance) {
  // POST /api/analyses/run
  app.post("/run", async (req, reply) => {
    const body = (req.body ?? {}) as { jobId?: string; cvId?: string };
    const { jobId, cvId } = body;
    if (!jobId || !cvId) {
      return reply.code(400).send({
        ok: false,
        code: "BAD_INPUT",
        message: "jobId & cvId required",
      });
    }

    try {
      // تأكد من وجود الـ CV
      const cv = await prisma.cV.findUnique({ where: { id: cvId } });
      if (!cv) {
        return reply
          .code(404)
          .send({ ok: false, code: "CV_NOT_FOUND", message: "CV not found" });
      }

      // Placeholder لو النص قصير
      const textLen = cv.parsedText?.trim()?.length ?? 0;
      if (textLen < MIN_TEXT) {
        app.log.warn(
          { cvId, textLen, min: MIN_TEXT },
          "placeholder analysis due to short text"
        );
        const payload = await createPlaceholderAnalysis(jobId, cvId, "no_text");
        return reply.code(201).send(payload);
      }

      // تحليل كامل
      const res = await runAnalysis(jobId, cvId);
      return reply.code(201).send(res);
    } catch (err: any) {
      // تحويل بعض الأخطاء إلى Placeholder بنتيجة 201
      const code = String(err?.code || "");
      if (code === "NO_CV_TEXT") {
        app.log.warn(
          { err, cvId: (req.body as any)?.cvId },
          "placeholder analysis on NO_CV_TEXT"
        );
        const payload = await createPlaceholderAnalysis(
          (req.body as any).jobId,
          (req.body as any).cvId,
          "no_text"
        );
        return reply.code(201).send(payload);
      }
      if (code === "NO_JOB_REQUIREMENTS") {
        app.log.warn(
          { err, jobId: (req.body as any)?.jobId },
          "placeholder analysis on NO_JOB_REQUIREMENTS"
        );
        const payload = await createPlaceholderAnalysis(
          (req.body as any).jobId,
          (req.body as any).cvId,
          "no_requirements"
        );
        return reply.code(201).send(payload);
      }

      app.log.error({ err }, "run analysis failed");
      const status = err?.status ?? 500;
      return reply.code(status).send({
        ok: false,
        code: code || "ANALYSIS_FAILED",
        message: err?.message || "run analysis failed",
      });
    }
  });

  // GET /api/analyses/:id
  app.get("/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const a = await prisma.analysis.findUnique({ where: { id } });
    if (!a) return reply.code(404).send({ ok: false, code: "NOT_FOUND" });
    return {
      ...a,
      score: a.score ? Number(a.score) : null,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    };
  });

  // GET /api/analyses/by-cv/:cvId
  app.get("/by-cv/:cvId", async (req) => {
    const { cvId } = req.params as { cvId: string };
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

  // GET /api/analyses/by-job/:jobId
  app.get("/by-job/:jobId", async (req) => {
    const { jobId } = req.params as { jobId: string };
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

  // POST /api/analyses/compare
  app.post("/compare", async (req, reply) => {
    try {
      const { cvIds = [] } = (req.body ?? {}) as { cvIds?: string[] };
      const res = await compareCvEmbeddings(Array.isArray(cvIds) ? cvIds : []);
      return { ok: true, ...res };
    } catch (err: any) {
      app.log.error({ err }, "compare embeddings failed");
      const status = err?.status ?? 400;
      return reply.code(status).send({
        ok: false,
        code: err?.code || "COMPARE_FAILED",
        message: err?.message || "compare failed",
      });
    }
  });

  // POST /api/analyses/pick-best
  app.post("/pick-best", async (req, reply) => {
    try {
      const {
        jobId,
        cvIds = [],
        top,
      } = (req.body ?? {}) as {
        jobId?: string;
        cvIds?: string[];
        top?: number;
      };
      const res = await recommendTopCandidates(
        jobId!,
        Array.isArray(cvIds) ? cvIds : [],
        Number(top) || 3
      );
      return { ok: true, ...res };
    } catch (err: any) {
      app.log.error({ err }, "pick best failed");
      const status = err?.status ?? 400;
      return reply.code(status).send({
        ok: false,
        code: err?.code || "PICK_FAILED",
        message: err?.message || "pick best failed",
      });
    }
  });

  // POST /api/analyses/improve
  app.post("/improve", async (req, reply) => {
    try {
      const { jobId, cvId, lang } = (req.body ?? {}) as {
        jobId?: string;
        cvId?: string;
        lang?: "ar" | "en";
      };

      const response = await improvementSuggestions(
        jobId!,
        cvId!,
        lang === "en" ? "en" : "ar"
      );

      return reply.send(response);
    } catch (err: any) {
      app.log.error({ err }, "improve suggestions failed");
      const status = err?.status ?? 400;
      return reply.code(status).send({
        ok: false,
        code: err?.code || "IMPROVE_FAILED",
        message: err?.message || "improvement failed",
      });
    }
  });
}
