import type { FastifyInstance } from "fastify";
import { prisma } from "../db/client";
import { randomUUID } from "node:crypto";

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
  // POST /api/jobs  — إنشاء وظيفة
  app.post("/", async (req, reply) => {
    try {
      const body: any = await req.body;
      const { title, description, requirements = [] } = body ?? {};
      if (!title) return reply.code(400).send({ error: "title required" });

      const job = await prisma.job.create({
        data: {
          id: randomUUID(), // ممكن تحذف هذا وتعتمد default(uuid())
          title,
          description: description ?? "",
        },
      });

      if (Array.isArray(requirements) && requirements.length) {
        await prisma.jobRequirement.createMany({
          data: requirements.map((r: any) => ({
            jobId: job.id,
            requirement: typeof r === "string" ? r : r.requirement,
            mustHave: Boolean(r?.mustHave ?? true),
            weight: Number(r?.weight ?? 1), // Decimal-compatible
          })),
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
      return serializeJob(job);
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
      return { items: list.map((job) => serializeJob(job)) };
    } catch (err: any) {
      return reply
        .code(500)
        .send({ error: "list jobs failed", message: err?.message });
    }
  });

  // POST /api/jobs/suggest  — استخراج متطلبات من JD بالـ AI
  app.post("/suggest", async (req, reply) => {
    try {
      const { jdText } = (await req.body) as any;
      if (!jdText) return reply.code(400).send({ error: "jdText required" });

      const prompt = `
استخرج متطلبات تقنية مختصرة من وصف الوظيفة التالي. أعد JSON فقط كمصفوفة عناصر، كل عنصر:
{ "requirement": "...", "mustHave": true|false, "weight": 1|2|3 }
الوصف:
"""${jdText}"""`.trim();

      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: ANALYSIS_MODEL,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2,
        }),
      });

      if (!r.ok) return reply.code(500).send({ error: "OpenAI failed" });
      const j: any = await r.json();

      let items: any[] = [];
      try {
        items = JSON.parse(j.choices?.[0]?.message?.content || "[]");
      } catch {}

      items = (items || []).map((x: any) => ({
        requirement: String(x?.requirement || "").slice(0, 120),
        mustHave: !!x?.mustHave,
        weight: Math.min(3, Math.max(1, Number(x?.weight ?? 1))),
      }));

      return reply.send({ items });
    } catch (err: any) {
      app.log.error({ err }, "suggest failed");
      return reply
        .code(500)
        .send({ error: "suggest failed", message: err?.message });
    }
  });

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
          return reply
            .code(400)
            .send({ error: "requirement cannot be empty" });
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
