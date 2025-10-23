import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { registerRoutes } from "./routes/index.js";

const app = Fastify({
  logger: true,
});

// CORS أثناء التطوير
await app.register(cors, {
  // ندعم كلا الاسمين: WEB_ORIGIN و CORS_ORIGIN
  origin: process.env.WEB_ORIGIN || process.env.CORS_ORIGIN || true,
  credentials: true,
});

// رفع ملفات حتى 20MB
await app.register(multipart, {
  limits: {
    fileSize: 20 * 1024 * 1024,
    files: 1,
  },
  attachFieldsToBody: false,
});

// سجّل جميع الراوترات
registerRoutes(app);

app.setErrorHandler((err, req, reply) => {
  req.log.error({ err, url: req.url, method: req.method }, "unhandled error");
  const status = (err as any)?.status ?? 500;
  const code = (err as any)?.code ?? "INTERNAL";
  reply.status(status).send({ ok: false, code, message: err.message });
});

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST || "0.0.0.0";

try {
  await app.listen({ port, host });
  app.log.info(`🚀 API listening on http://localhost:${port}`);
  app.log.info(`📁 File upload limit: 20MB`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
