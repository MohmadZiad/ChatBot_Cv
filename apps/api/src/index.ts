// apps/api/src/index.ts
import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { registerRoutes } from "./routes/index.js";

const app = Fastify({ logger: true });

// CORS أثناء التطوير
await app.register(cors, {
  origin: process.env.WEB_ORIGIN || true,
  credentials: true,
});

// رفع ملفات حتى 20MB
await app.register(multipart, {
  limits: { fileSize: 20 * 1024 * 1024 },
});

// سجّل جميع الراوترات
registerRoutes(app);

app.setErrorHandler((err, req, reply) => {
  req.log.error({ err }, "unhandled");
  const status = (err as any)?.status ?? 500;
  const code = (err as any)?.code ?? "INTERNAL";
  reply.status(status).send({ ok: false, code, message: err.message });
});

const port = Number(process.env.PORT ?? 4000);
app.listen({ port, host: "0.0.0.0" }).then(() => {
  app.log.info(`API listening on http://localhost:${port}`);
});
