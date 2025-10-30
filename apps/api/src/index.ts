// apps/api/src/index.ts
import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { registerRoutes } from "./routes/index.js";

const DEFAULT_LOCALHOST_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
  "http://127.0.0.1:5173",
  "http://0.0.0.0:3000",
  "http://0.0.0.0:5173",
];

function parseOrigins(value?: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

function resolveCorsOrigins(): true | string[] {
  const origins = new Set<string>();

  const fromEnv = [
    ...parseOrigins(process.env.CORS_ORIGINS),
    ...parseOrigins(process.env.CORS_ORIGIN),
    ...parseOrigins(process.env.WEB_ORIGINS),
    ...parseOrigins(process.env.WEB_ORIGIN),
    ...parseOrigins(process.env.CORS_EXTRA_ORIGINS),
    ...parseOrigins(process.env.EXTRA_CORS_ORIGINS),
  ];
  fromEnv.forEach((origin) => origins.add(origin));

  const allowLocal =
    (process.env.ALLOW_LOCAL_ORIGINS ?? process.env.CORS_ALLOW_LOCAL ?? "true")
      .toLowerCase()
      .trim() !== "false";

  if (allowLocal) {
    DEFAULT_LOCALHOST_ORIGINS.forEach((origin) => origins.add(origin));
  }

  if (origins.size === 0) {
    return true;
  }

  return Array.from(origins);
}

async function main() {
  const app = Fastify({ logger: true });

  // CORS
  const corsOrigins = resolveCorsOrigins();
  await app.register(cors, {
    origin: corsOrigins,
    credentials: true,
  });
  app.log.info(
    { origins: corsOrigins === true ? "*" : corsOrigins },
    "Configured CORS origins",
  );

  // رفع الملفات (20MB)
  await app.register(multipart, {
    limits: { fileSize: 20 * 1024 * 1024, files: 1 },
    attachFieldsToBody: false,
  });

  // الراوترات
  registerRoutes(app);

  // Default route for render root checks
  app.get("/", async () => ({
    ok: true,
    message: "ChatBot CV API is running",
    health: "/api/health",
  }));

  // Error handler
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
}

// شغّل الـ main وما تهمل الأخطاء
main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Fatal startup error:", err);
  process.exit(1);
});
