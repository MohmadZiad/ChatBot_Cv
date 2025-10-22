// apps/api/src/routes/analyses.route.ts
import type { FastifyInstance } from "fastify";
import { prisma } from "../db/client";
import { runAnalysis } from "../services/analysis";

export async function analysesRoute(app: FastifyInstance) {
  app.post("/run", async (req, reply) => {
    const { jobId, cvId } = (await req.body) as any;
    if (!jobId || !cvId)
      return reply
        .code(400)
        .send({
          ok: false,
          code: "BAD_INPUT",
          message: "jobId & cvId required",
        });

    try {
      const res = await runAnalysis(jobId, cvId);
      return reply.code(201).send(res);
    } catch (err: any) {
      app.log.error({ err }, "run analysis failed");
      const status = err?.status ?? 500;
      const code = err?.code ?? "ANALYSIS_FAILED";
      return reply
        .code(status)
        .send({
          ok: false,
          code,
          message: err?.message || "run analysis failed",
        });
    }
  });

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
}
