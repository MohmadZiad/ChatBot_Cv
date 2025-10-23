// apps/api/src/index.ts
import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { registerRoutes } from "./routes/index.js";

const app = Fastify({ logger: true });

// CORS أثناء التطوير/الإنتاج
await app.register(cors, {
  origin: process.env.WEB_ORIGIN || process.env.CORS_ORIGIN || true,
  credentials: true,
});

// تمكين الرفع (20MB)
await app.register(multipart, {
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
  attachFieldsToBody: false,
});

// سجّل جميع الراوترات (تأكد أن index.js يركّب cvRoute تحت /api/cv)
registerRoutes(app);

// Error handler موحّد
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
  app.log.info(
    {
      TESSDATA_PATH: process.env.TESSDATA_PATH,
      OCR_LANGS: process.env.OCR_LANGS,
    },
    "OCR config"
  );
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
