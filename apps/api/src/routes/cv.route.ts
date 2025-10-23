// apps/api/src/routes/cv.route.ts
import type { FastifyInstance } from "fastify";
import { prisma } from "../db/client";
import { fileTypeFromBuffer } from "file-type";
import { putToStorage } from "../ingestion/upload.js";
import { parsePDF, parseDOCX } from "../ingestion/parse.js";
import { chunkText } from "../ingestion/chunk.js";
import { detectLang } from "../nlp/lang.js";

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
      app.log.info({ 
        contentType: req.headers['content-type'],
        method: req.method,
        url: req.url 
      }, "CV upload request received");

      // استلام الملف
      const mp = await req.file({
        limits: { 
          fileSize: 20 * 1024 * 1024 // 20MB
        }
      });

      if (!mp) {
        app.log.warn("No file received in multipart request");
        return reply.code(400).send({ 
          ok: false, 
          code: "NO_FILE", 
          message: "لم يتم رفع أي ملف. تأكد من إرسال الملف بشكل صحيح." 
        });
      }

      app.log.info({ 
        filename: mp.filename, 
        mimetype: mp.mimetype,
        encoding: mp.encoding 
      }, "File received successfully");

      // تحويل الملف إلى Buffer
      const fileBuf = await mp.toBuffer();
      
      if (!fileBuf?.length) {
        app.log.warn("File buffer is empty");
        return reply.code(400).send({ 
          ok: false, 
          code: "EMPTY_UPLOAD", 
          message: "الملف المرفوع فارغ." 
        });
      }

      app.log.info({ size: fileBuf.length }, "File buffer created");

      // تحديد نوع الملف
      const type = await fileTypeFromBuffer(fileBuf).catch(() => null);
      const mime = type?.mime ?? mp.mimetype ?? "application/octet-stream";
      const original = mp.filename ?? "cv.bin";

      app.log.info({ mime, original }, "File type detected");

      // 1) تخزين الملف أولاً
      const { path, publicUrl } = await putToStorage(fileBuf, mime, original);
      app.log.info({ path, publicUrl }, "File stored successfully");

      // 2) استخراج النص
      let text = "";
      try {
        if (mime.includes("pdf")) {
          app.log.info("Parsing PDF");
          text = await parsePDF(fileBuf);
        } else if (
          mime.includes("word") ||
          mime.includes("openxmlformats") ||
          original.toLowerCase().endsWith(".docx")
        ) {
          app.log.info("Parsing DOCX");
          text = await parseDOCX(fileBuf);
        } else {
          app.log.info("Parsing as plain text");
          text = fileBuf.toString("utf8");
        }
      } catch (parseErr: any) {
        app.log.error({ err: parseErr }, "Error parsing file");
        throw unprocessable(
          `فشل استخراج النص من الملف: ${parseErr.message}`,
          "PARSE_ERROR"
        );
      }

      text = (text || "").trim();
      app.log.info({ textLength: text.length }, "Text extracted");

      // التحقق من أن النص كافٍ
      if (!text || text.length < 200) {
        app.log.warn({ textLength: text.length }, "Insufficient text extracted");
        return reply.code(422).send({
          ok: false,
          code: "NO_EXTRACTABLE_TEXT",
          message:
            "لم أستطع استخراج نص كافٍ من السيرة الذاتية. رجاءً ارفع ملف DOCX أو PDF يحتوي نصًا واضحًا (ليس مجرد صورة).",
          storagePath: path,
          publicUrl,
          extractedLength: text.length,
        });
      }

      // تحديد اللغة
      const lang = detectLang(text);
      app.log.info({ lang }, "Language detected");

      // 3) إنشاء سجل CV في قاعدة البيانات
      const cv = await prisma.cV.create({
        data: {
          storagePath: path,
          originalFilename: original,
          parsedText: text.slice(0, 50_000),
          lang,
        },
      });

      app.log.info({ cvId: cv.id }, "CV record created");

      // 4) تقطيع النص وتخزين الأجزاء
      const chunksData = chunkText(text, 1000).map((c) => ({
        cvId: cv.id,
        section: c.section,
        content: c.content,
        tokenCount: Math.ceil(c.content.length / 4),
      }));

      const parts = chunksData.length;
      
      if (parts > 0) {
        await prisma.cVChunk.createMany({ data: chunksData });
        app.log.info({ parts }, "CV chunks created");
      }

      return reply.code(201).send({
        ok: true,
        cvId: cv.id,
        parts,
        storagePath: path,
        publicUrl,
        parsed: true,
        textLength: text.length,
      });

    } catch (err: any) {
      app.log.error({ err, stack: err.stack }, "CV upload failed");
      
      const status = err?.status ?? 500;
      const code = err?.code ?? "UPLOAD_FAILED";
      const message = err?.message || "فشل رفع السيرة الذاتية";
      
      return reply.code(status).send({ 
        ok: false, 
        code, 
        message 
      });
    }
  });

  app.get("/", async () => {
    const cvs = await prisma.cV.findMany({ 
      orderBy: { createdAt: "desc" },
      take: 100 
    });
    return { items: cvs };
  });

  app.get("/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const cv = await prisma.cV.findUnique({ 
      where: { id },
      include: {
        chunks: {
          orderBy: { id: "asc" }
        }
      }
    });
    
    if (!cv) {
      return reply.code(404).send({ 
        ok: false, 
        code: "NOT_FOUND", 
        message: "CV not found" 
      });
    }
    
    return { cv };
  });
}