// apps/api/src/routes/jobs.ts
import type { FastifyInstance } from "fastify";
import { prisma } from "../db/client";
import { randomUUID } from "node:crypto";
import { suggestRequirementsFromDescription } from "../services/requirements.js";

function serializeRequirement(req: any) {
  if (!req) return req;
  return {
    ...req,
    mustHave: Boolean(req.mustHave),
    weight: Number(req.weight ?? 0),
  };
}

function serializeJob(job: any) {
  if (!job) return job;
  return {
    ...job,
    createdAt: job.createdAt?.toISOString?.() ?? job.createdAt,
    requirements: Array.isArray(job.requirements)
      ? job.requirements.map((req: any) => serializeRequirement(req))
      : [],
  };
}

export async function jobsRoute(app: FastifyInstance) {
  const ANALYSIS_MODEL = process.env.ANALYSIS_MODEL || "gpt-4o-mini";

  // POST /api/jobs — إنشاء وظيفة
  app.post("/", async (req, reply) => {
    try {
      const body: any = await req.body;
      const { title, description, requirements = [] } = body ?? {};
      if (!title) return reply.code(400).send({ error: "title required" });

      const job = await prisma.job.create({
        data: {
          id: randomUUID(), // يمكن حذفها والاعتماد على default(uuid())
          title,
          description: description ?? "",
        },
      });

      if (Array.isArray(requirements) && requirements.length) {
        await prisma.jobRequirement.createMany({
          data: requirements
            .map((r: any) => {
              const requirement =
                typeof r === "string" ? r : String(r?.requirement ?? "");
              if (!requirement.trim()) return null;
              return {
                jobId: job.id,
                requirement: requirement.slice(0, 240),
                mustHave: Boolean(r?.mustHave ?? true),
                weight: Number(r?.weight ?? 1) || 1, // Decimal-compatible
              };
            })
            .filter(Boolean) as {
            jobId: string;
            requirement: string;
            mustHave: boolean;
            weight: number;
          }[],
        });
      }

      const out = await prisma.job.findUnique({
        where: { id: job.id },
        include: { requirements: true },
      });

      return reply.code(201).send(serializeJob(out));
    } catch (err: any) {
      app.log.error({ err }, "create job failed");
      return reply
        .code(500)
        .send({ error: "create job failed", message: err?.message });
    }
  });

  // GET /api/jobs/:id
  app.get("/:id", async (req, reply) => {
    try {
      const { id } = req.params as any;
      const job = await prisma.job.findUnique({
        where: { id },
        include: { requirements: true },
      });
      if (!job) return reply.code(404).send({ error: "Not found" });
      return reply.send(serializeJob(job));
    } catch (err: any) {
      app.log.error({ err }, "get job failed");
      return reply
        .code(500)
        .send({ error: "get job failed", message: err?.message });
    }
  });

  // GET /api/jobs
  app.get("/", async (_req, reply) => {
    try {
      const list = await prisma.job.findMany({
        include: { requirements: true },
      });
      return reply.send({ items: list.map((job) => serializeJob(job)) });
    } catch (err: any) {
      return reply
        .code(500)
        .send({ error: "list jobs failed", message: err?.message });
    }
  });

  // POST /api/jobs/suggest — استخراج متطلبات من JD بالـ AI (ديناميكي)
  app.post("/suggest", async (req, reply) => {
    try {
      const { jdText } = (await req.body) as any;
      const raw = typeof jdText === "string" ? jdText : String(jdText ?? "");
      const trimmed = raw.trim();
      if (!trimmed) return reply.code(400).send({ error: "jdText required" });

      const items = await suggestRequirementsFromDescription(trimmed, {
        logger: app.log,
        model: ANALYSIS_MODEL,
      });

      return reply.send({ items });
    } catch (err: any) {
      app.log.error({ err }, "suggest failed");
      return reply
        .code(500)
        .send({ error: "suggest failed", message: err?.message });
    }
  });

  // POST /api/jobs/:id/requirements — إضافة متطلبات
  app.post("/:id/requirements", async (req, reply) => {
    try {
      const { id } = req.params as any;
      const { items = [] } = (await req.body) as any;
      if (!id) return reply.code(400).send({ error: "jobId required" });

      const job = await prisma.job.findUnique({ where: { id } });
      if (!job) return reply.code(404).send({ error: "Job not found" });

      const payload = (Array.isArray(items) ? items : [])
        .map((item) => {
          if (!item) return null;
          const requirement =
            typeof item === "string"
              ? item
              : String(item.requirement ?? "").trim();
          if (!requirement) return null;
          return {
            jobId: id,
            requirement: requirement.slice(0, 240),
            mustHave: Boolean(item?.mustHave ?? true),
            weight: Number(item?.weight ?? 1) || 1,
          };
        })
        .filter(Boolean) as {
        jobId: string;
        requirement: string;
        mustHave: boolean;
        weight: number;
      }[];

      if (!payload.length)
        return reply.code(400).send({ error: "No requirements provided" });

      await prisma.jobRequirement.createMany({ data: payload });

      const updated = await prisma.job.findUnique({
        where: { id },
        include: { requirements: true },
      });

      return reply.code(201).send(serializeJob(updated));
    } catch (err: any) {
      app.log.error({ err }, "add requirements failed");
      return reply
        .code(500)
        .send({ error: "add requirements failed", message: err?.message });
    }
  });

  // PATCH /api/jobs/requirements/:id — تعديل متطلب
  app.patch("/requirements/:id", async (req, reply) => {
    try {
      const { id } = req.params as any;
      const body = (await req.body) as any;
      const requirementId = Number(id);
      if (!Number.isInteger(requirementId))
        return reply.code(400).send({ error: "Requirement id invalid" });

      const data: Record<string, unknown> = {};
      if (body?.requirement !== undefined) {
        const text = String(body.requirement ?? "").trim();
        if (!text) {
          return reply.code(400).send({ error: "requirement cannot be empty" });
        }
        data.requirement = text.slice(0, 240);
      }
      if (body?.mustHave !== undefined) data.mustHave = Boolean(body.mustHave);
      if (body?.weight !== undefined) {
        const weight = Number(body.weight);
        if (!Number.isFinite(weight) || weight <= 0)
          return reply
            .code(400)
            .send({ error: "weight must be positive number" });
        data.weight = weight;
      }

      const updated = await prisma.jobRequirement.update({
        where: { id: requirementId },
        data,
      });

      return reply.send(serializeRequirement(updated));
    } catch (err: any) {
      app.log.error({ err }, "update requirement failed");
      const status = err?.code === "P2025" ? 404 : 500;
      return reply.code(status).send({
        error: "update requirement failed",
        message: err?.message,
      });
    }
  });

  // DELETE /api/jobs/requirements/:id — حذف متطلب
  app.delete("/requirements/:id", async (req, reply) => {
    try {
      const { id } = req.params as any;
      const requirementId = Number(id);
      if (!Number.isInteger(requirementId))
        return reply.code(400).send({ error: "Requirement id invalid" });

      await prisma.jobRequirement.delete({ where: { id: requirementId } });
      return reply.code(204).send();
    } catch (err: any) {
      app.log.error({ err }, "delete requirement failed");
      const status = err?.code === "P2025" ? 404 : 500;
      return reply.code(status).send({
        error: "delete requirement failed",
        message: err?.message,
      });
    }
  });
}
  