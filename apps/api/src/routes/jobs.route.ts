
// apps/api/src/routes/jobs.route.ts
import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/client';

export async function jobsRoute(app: FastifyInstance) {
  // إنشاء جوب مع متطلبات يجيبوها من الفرونت أو نستخرجها لاحقاً
  app.post('/jobs', async (req, reply) => {
    const body: any = await req.body;
    const { title, description, requirements = [] } = body ?? {};
    if (!title) return reply.code(400).send({ error: 'title required' });

    const job = await prisma.job.create({
      data: {
        title,
        description: description ?? '',
        requirements: {
          create: (requirements as any[]).map((r: any) => ({
            requirement: typeof r === 'string' ? r : r.requirement,
            mustHave: Boolean(r?.mustHave ?? true),
            weight: r?.weight ?? 1,
          })),
        },
      },
      include: { requirements: true },
    });

    return reply.code(201).send(job);
  });

  // جلب جوب
  app.get('/jobs/:id', async (req, reply) => {
    const { id } = req.params as any;
    const job = await prisma.job.findUnique({
      where: { id },
      include: { requirements: true },
    });
    if (!job) return reply.code(404).send({ error: 'Not found' });
    return job;
  });
}
