// apps/api/src/routes/analyses.route.ts
import type { FastifyInstance } from 'fastify';
import { runAnalysis } from '../services/analysis.js';
import { prisma } from '../db/client';

export async function analysesRoute(app: FastifyInstance) {
  // تشغيل التحليل بناءً على jobId + cvId
  app.post('/analyses/run', async (req, reply) => {
    const { jobId, cvId } = (await req.body) as any;
    if (!jobId || !cvId) return reply.code(400).send({ error: 'jobId & cvId required' });

    const out = await runAnalysis(jobId, cvId);
    return reply.code(201).send(out);
  });

  app.get('/analyses/:id', async (req, reply) => {
    const { id } = req.params as any;
    const a = await prisma.analysis.findUnique({ where: { id } });
    if (!a) return reply.code(404).send({ error: 'Not found' });
    return a;
  });

  // جلب تحاليل CV
  app.get('/analyses/by-cv/:cvId', async (req, reply) => {
    const { cvId } = req.params as any;
    const list = await prisma.analysis.findMany({
      where: { cvId },
      orderBy: { createdAt: 'desc' },
    });
    return list;
  });
}
