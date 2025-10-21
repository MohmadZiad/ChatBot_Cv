import type { FastifyInstance } from 'fastify';
export async function healthRoute(app: FastifyInstance) {
  app.get('/health', async () => ({ ok: true, ts: Date.now() }));
}
