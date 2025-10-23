// apps/api/src/routes/cv.route.ts
import type { FastifyInstance } from "fastify";
import { prisma } from "../db/client";
import { fileTypeFromBuffer } from "file-type";
import { putToStorage } from "../ingestion/upload.js";
import { parsePDF, parseDOCX } from "../ingestion/parse.js";
import { chunkText } from "../ingestion/chunk.js";
import { detectLang } from "../nlp/lang.js";
import { normalizeCvText } from "../ingestion/validation.js";
import { debugLog } from "../utils/debug.js";

type HttpError = Error & { status?: number; code?: string };
const unprocessable = (message: string, code = "UNPROCESSABLE"): HttpError => {
  const e: HttpError = new Error(message);
  e.status = 422;
  e.code = code;
  return e;
};

export async function cvRoute(app: FastifyInstance) {
  app.post("/upload", async (req, reply) => {
    try {
      const mp = await req.file(); // requires @fastify/multipart
      if (!mp)
        return reply
          .code(400)
          .send({ ok: false, code: "NO_FILE", message: "No file" });

      const fileBuf = await mp.toBuffer();
      if (!fileBuf?.length)
        return reply
          .code(400)
          .send({ ok: false, code: "EMPTY_UPLOAD", message: "Empty upload" });

      const type = await fileTypeFromBuffer(fileBuf).catch(() => null);
      const mime = type?.mime ?? mp.mimetype ?? "application/octet-stream";
      const original = mp.filename ?? "cv.bin";

      // 1) خزّن الملف أولًا
      debugLog("cv.upload", "storing file", {
        mime,
        bytes: fileBuf.length,
        original,
      });
      const { path, publicUrl } = await putToStorage(fileBuf, mime, original);

      // 2) جرّب استخراج النص
      let text = "";
      if (mime.includes("pdf")) text = await parsePDF(fileBuf);
      else if (
        mime.includes("word") ||
        original.toLowerCase().endsWith(".docx")
      )
        text = await parseDOCX(fileBuf);
      else text = fileBuf.toString("utf8");
      const normalizedText = normalizeCvText(text);

      // guard: لو النص قليل جدًا اعتبره غير صالح
      if (!normalizedText) {
        debugLog("cv.upload", "extracted text unusable", {
          storagePath: path,
          mime,
          bytes: fileBuf.length,
          length: typeof text === "string" ? text.length : 0,
        });
        return reply.code(422).send({
          ok: false,
          code: "NO_EXTRACTABLE_TEXT",
          message:
            "لم أستطع استخراج نص صالح من السيرة الذاتية. رجاءً ارفع DOCX أو PDF يحتوي نصًا (ليس صورة).",
          storagePath: path,
          publicUrl,
        });
      }

      const lang = detectLang(normalizedText);

      // 3) أنشئ CV
      const cv = await prisma.cV.create({
        data: {
          storagePath: path,
          originalFilename: original,
          parsedText: normalizedText.slice(0, 50_000),
          lang,
        },
      });

      // 4) تقطيع وتخزين الشُنكس
      const chunksData = chunkText(normalizedText, 1000).map((c) => ({
        cvId: cv.id,
        section: c.section,
        content: c.content,
        tokenCount: Math.ceil(c.content.length / 4),
      }));
      const parts = chunksData.length;
      if (parts) await prisma.cVChunk.createMany({ data: chunksData });

      debugLog("cv.upload", "stored CV chunks", {
        cvId: cv.id,
        parts,
        lang,
        textLength: normalizedText.length,
      });

      return reply.code(201).send({
        ok: true,
        cvId: cv.id,
        parts,
        storagePath: path,
        publicUrl,
        parsed: true,
      });
    } catch (err: any) {
      app.log.error({ err }, "cv upload failed");
      const status = err?.status ?? 500;
      const code = err?.code ?? "UPLOAD_FAILED";
      return reply
        .code(status)
        .send({ ok: false, code, message: err?.message || "upload failed" });
    }
  });

  app.get("/", async () => {
    const cvs = await prisma.cV.findMany({ orderBy: { createdAt: "desc" } });
    return { items: cvs };
  });
}
