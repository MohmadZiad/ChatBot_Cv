// apps/api/src/routes/analyses.route.ts
import type { FastifyInstance } from "fastify";
import { prisma } from "../db/client";
import { runAnalysis } from "../services/analysis";

const MIN_TEXT = Number(process.env.MIN_EXTRACTED_TEXT || "60");

export async function analysesRoute(app: FastifyInstance) {
  /**
   * POST /api/analyses/run
   * body: { jobId: string, cvId: string }
   *
   * السلوك:
   * - إذا كان الـ CV بلا نص كافٍ → ننشئ تحليل رمزي score=0 ونرجّع 201 (بدون 422).
   * - غير ذلك → نستدعي runAnalysis كالعادة.
   */
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
      // 1) اقرأ الـ CV للتأكد من طول النص
      const cv = await prisma.cV.findUnique({ where: { id: cvId } });
      if (!cv) {
        return reply.code(404).send({
          ok: false,
          code: "CV_NOT_FOUND",
          message: "CV not found",
        });
      }

      const textLen = cv.parsedText?.trim()?.length ?? 0;

      // 2) لو النص غير كافٍ → تحليل رمزي score=0 بدل 422
      if (textLen < MIN_TEXT) {
        app.log.warn(
          { cvId, textLen, min: MIN_TEXT },
          "CV has insufficient text; creating placeholder analysis"
        );

        const a = await prisma.analysis.create({
          data: {
            jobId,
            cvId,
            // حقول إضافية مطلوبة في سكيمتك؟ أضفها هنا بقيم افتراضية:
            // status: "no_text",
            // summary: "No extractable text in CV",
            score: 0, // درجة صفرية لأن ما في نص للمقارنة
          } as any,
        });

        return reply.code(201).send({
          ok: true,
          id: a.id,
          jobId,
          cvId,
          score: a.score ? Number(a.score) : 0,
          breakdown: [], // لا يوجد تفصيل لأن ما في نص
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
            riskFlags: ["no_text"],
            generatedAt: new Date().toISOString(),
          },
          message:
            "لم يُستخرج نص كافٍ من السيرة الذاتية، تم إنشاء تحليل رمزي. رجاءً ارفع ملف PDF نصّي واضح أو DOCX.",
          createdAt: a.createdAt.toISOString(),
          updatedAt: a.updatedAt.toISOString(),
        });
      }

      // 3) نص كافٍ → التحليل الكامل
      const res = await runAnalysis(jobId, cvId);
      return reply.code(201).send(res);
    } catch (err: any) {
      app.log.error({ err }, "run analysis failed");
      const status = err?.status ?? 500;
      const code = err?.code ?? "ANALYSIS_FAILED";
      return reply.code(status).send({
        ok: false,
        code,
        message: err?.message || "run analysis failed",
      });
    }
  });

  // GET /api/analyses/:id
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

  // GET /api/analyses/by-cv/:cvId
  app.get("/by-cv/:cvId", async (req) => {
    const { cvId } = req.params as any;

    // حدّد النوع عبر Prisma
    const list = await prisma.analysis.findMany({
      where: { cvId },
      orderBy: { createdAt: "desc" },
    });

    // اكتب نوع العنصر داخل map لتفادي any
    return list.map((a: (typeof list)[number]) => ({
      ...a,
      score: a.score ? Number(a.score) : null,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    }));
  });
}
