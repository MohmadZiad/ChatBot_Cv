// apps/api/src/routes/cv.route.ts
import type { FastifyInstance } from "fastify";
import { prisma } from "../db/client";
import { fileTypeFromBuffer } from "file-type";
import { putToStorage } from "../ingestion/upload.js";
import { parseAny } from "../ingestion/parse.js"; // ← واجهة موحّدة لكل الأنواع
import { chunkText } from "../ingestion/chunk.js";
import { detectLang } from "../nlp/lang.js";

type HttpError = Error & { status?: number; code?: string };

const unprocessable = (message: string, code = "UNPROCESSABLE"): HttpError => {
  const e: HttpError = new Error(message);
  e.status = 422;
  e.code = code;
  return e;
};

// حدّ أدنى منطقي بعد الـ OCR (يمكن ضبطه من ENV)
const MIN_TEXT = Number(process.env.MIN_EXTRACTED_TEXT || "80");

export async function cvRoute(app: FastifyInstance) {
  app.post("/upload", async (req, reply) => {
    try {
      app.log.info(
        {
          contentType: req.headers["content-type"],
          method: req.method,
          url: req.url,
        },
        "CV upload request received"
      );

      // 1) استلام الملف (20MB)
      const mp = await req.file({
        limits: { fileSize: 20 * 1024 * 1024 },
      });

      if (!mp) {
        app.log.warn("No file received in multipart request");
        return reply.code(400).send({
          ok: false,
          code: "NO_FILE",
          message: "لم يتم رفع أي ملف. تأكد من إرسال الملف بشكل صحيح.",
        });
      }

      app.log.info(
        { filename: mp.filename, mimetype: mp.mimetype, encoding: mp.encoding },
        "File received successfully"
      );

      // 2) تحويل إلى Buffer
      const fileBuf = await mp.toBuffer();
      if (!fileBuf?.length) {
        app.log.warn("File buffer is empty");
        return reply.code(400).send({
          ok: false,
          code: "EMPTY_UPLOAD",
          message: "الملف المرفوع فارغ.",
        });
      }
      app.log.info({ size: fileBuf.length }, "File buffer created");

      // 3) تحديد النوع/الامتداد
      const sniff = await fileTypeFromBuffer(fileBuf).catch(() => null);
      const mime = sniff?.mime ?? mp.mimetype ?? "application/octet-stream";
      const original = mp.filename ?? "upload.bin";
      app.log.info({ mime, original }, "File type detected");

      // 4) تخزين الملف أولًا (نحتفظ به سواء نجح الاستخراج أم لا)
      const { path, publicUrl } = await putToStorage(fileBuf, mime, original);
      app.log.info({ path, publicUrl }, "File stored successfully");

      // 5) استخراج النص لأي نوع (PDF/DOCX/DOC/صور/TXT…)
      let text = "";
      try {
        text = await parseAny(fileBuf, mime, original);
      } catch (parseErr: any) {
        app.log.error({ err: parseErr }, "Error parsing file");
        throw unprocessable(
          `فشل استخراج النص من الملف: ${parseErr.message}`,
          "PARSE_ERROR"
        );
      }

      text = (text || "").trim();
      app.log.info({ textLength: text.length }, "Text extracted");

      // 6) التحقق من كفاية النص
      if (!text || text.length < MIN_TEXT) {
        app.log.warn(
          { textLength: text.length, min: MIN_TEXT },
          "Insufficient text extracted"
        );
        return reply.code(422).send({
          ok: false,
          code: "NO_EXTRACTABLE_TEXT",
          message:
            "لم أستطع استخراج نص كافٍ من الملف. إن كان PDF/صورة فربما الجودة منخفضة — جرّب نسخة أوضح أو صيغة DOCX/PDF أنقى.",
          storagePath: path,
          publicUrl,
          extractedLength: text.length,
        });
      }

      // 7) تحديد اللغة
      const lang = detectLang(text);
      app.log.info({ lang }, "Language detected");

      // 8) إنشاء سجل CV
      const cv = await prisma.cV.create({
        data: {
          storagePath: path,
          originalFilename: original,
          parsedText: text.slice(0, 50_000),
          lang,
        },
      });
      app.log.info({ cvId: cv.id }, "CV record created");

      // 9) تقطيع النص وتخزين الأجزاء
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

      // 10) ردّ النجاح
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
      return reply.code(status).send({ ok: false, code, message });
    }
  });

  // قائمة بأحدث الملفات
  app.get("/", async () => {
    const cvs = await prisma.cV.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return { items: cvs };
  });

  // جلب ملف معيّن
  app.get("/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const cv = await prisma.cV.findUnique({
      where: { id },
      include: { chunks: { orderBy: { id: "asc" } } },
    });

    if (!cv) {
      return reply.code(404).send({
        ok: false,
        code: "NOT_FOUND",
        message: "CV not found",
      });
    }

    return { cv };
  });
}
