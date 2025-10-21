import type { FastifyInstance } from 'fastify';

export async function analysesRoute(app: FastifyInstance) {
  app.get('/', async (_req, _reply) => {
    // TODO: ارجاع تحليلات من DB
    return { items: [] };
  });
}
