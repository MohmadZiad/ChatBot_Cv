import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const CreateJobSchema = z.object({
  title: z.string().min(2),
  description: z.string().min(10)
});

export async function jobsRoute(app: FastifyInstance) {
  app.post('/', async (req, reply) => {
    const parsed = CreateJobSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(parsed.error.flatten());
    // TODO: احفظ في DB لاحقًا
    return { id: 'job_' + Date.now(), ...parsed.data };
  });
}
