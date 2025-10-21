import type { FastifyInstance } from "fastify";
import { prisma } from "../db/client";

export async function jobsRoute(app: FastifyInstance) {
  // POST /api/jobs
  app.post("/", async (req, reply) => {
    try {
      const body: any = await req.body;
      const { title, description, requirements = [] } = body ?? {};
      if (!title) return reply.code(400).send({ error: "title required" });

      // 1) أنشئ Job بهوية صريحة (لو الـ id ما عليه default في DB)
      const job = await prisma.job.create({
        data: {
          id: crypto.randomUUID(),           // <-- يضمن عدم فشل الـ PK
          title,
          description: description ?? "",
        },
      });

      // 2) أدخل المتطلبات (لو موجودة) createMany على جدول JobRequirement
      if (Array.isArray(requirements) && requirements.length) {
        await prisma.jobRequirement.createMany({
          data: requirements.map((r: any) => ({
            jobId: job.id,
            requirement: typeof r === "string" ? r : r.requirement,
            mustHave: Boolean(r?.mustHave ?? true),
            weight: Number(r?.weight ?? 1),
          })),
        });
      }

      // 3) رجّع الجوب مع المتطلبات
      const out = await prisma.job.findUnique({
        where: { id: job.id },
        include: { requirements: true },
      });

      return reply.code(201).send(out);
    } catch (err: any) {
      // اطبع الخطأ الحقيقي في اللوج، وارجع رسالة مفهومة للواجهة
      app.log.error({ err }, "create job failed");
      return reply.code(500).send({
        error: "create job failed",
        message: err?.message,
      });
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
      return job;
    } catch (err: any) {
      app.log.error({ err }, "get job failed");
      return reply.code(500).send({ error: "get job failed", message: err?.message });
    }
  });

  // GET /api/jobs
  app.get("/", async (_req, reply) => {
    try {
      const list = await prisma.job.findMany({ include: { requirements: true } });
      return { items: list };
    } catch (err: any) {
      return reply.code(500).send({ error: "list jobs failed", message: err?.message });
    }
  });
}
