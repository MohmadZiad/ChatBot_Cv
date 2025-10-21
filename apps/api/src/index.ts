import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { registerRoutes } from './routes/index.js';

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } });
registerRoutes(app);

const port = Number(process.env.PORT ?? 4000);
app.listen({ port, host: '0.0.0.0' }).then(() => {
  app.log.info(`API listening on http://localhost:${port}`);
});
