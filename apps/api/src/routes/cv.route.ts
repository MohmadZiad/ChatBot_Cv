// apps/api/src/routes/cv.route.ts
import type { FastifyInstance } from "fastify";
import { prisma } from "../db/client";
import { fileTypeFromBuffer } from "file-type";
import { putToStorage } from "../ingestion/upload.js";
import { parseAny, parsePDF } from "../ingestion/parse.js"; // ✅ إضافة parsePDF
import { chunkText } from "../ingestion/chunk.js";
import { detectLang } from "../nlp/lang.js";

type HttpError = Error & { status?: number; code?: string };

// حدّ أدنى منطقي بعد الـ OCR (قابل للضبط)
const MIN_TEXT = Number(process.env.MIN_EXTRACTED_TEXT || "60");

export async function cvRoute(app: FastifyInstance) {
  // POST /upload  (يُركّب عادةً تحت: /api/cv/upload)
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

      // 1) استلام الملف (حد 20MB)
      const mp = await req.file({ limits: { fileSize: 20 * 1024 * 1024 } });
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

      // 4) تخزين الملف دائمًا (نحتفظ به مهما كانت نتيجة الاستخراج)
      const { path, publicUrl } = await putToStorage(fileBuf, mime, original);
      app.log.info({ path, publicUrl }, "File stored successfully");

      // 5) استخراج النص - نختار parsePDF للـ PDF فقط
      let text = "";
      try {
        if (mime.includes("pdf") || original.toLowerCase().endsWith(".pdf")) {
          app.log.info("Detected PDF file, using parsePDF()");
          text = await parsePDF(fileBuf); // ✅ تحليل PDF بعمق
        } else {
          app.log.info("Non-PDF file, using parseAny()");
          text = await parseAny(fileBuf, mime, original);
        }
      } catch (e: any) {
        app.log.error({ err: e }, "Error parsing file");
        text = "";
      }

      text = (text || "").trim();
      const textLength = text.length;
      app.log.info({ textLength }, "Text extracted");

      // 6) أنشئ سجلّ CV دائماً (حتى لو النص قليل) لتُعيد cvId
      const lang = textLength ? detectLang(text) : null;
      const cv = await prisma.cV.create({
        data: {
          storagePath: path,
          originalFilename: original,
          parsedText: textLength ? text.slice(0, 50_000) : null,
          lang,
        },
      });
      app.log.info({ cvId: cv.id }, "CV record created");

      // 7) إن كان النص كافيًا → قسّمه وخزّن الأجزاء، وإلا لا تنشئ أجزاء
      let parts = 0;
      if (textLength >= MIN_TEXT) {
        const chunksData = chunkText(text, 1000).map((c) => ({
          cvId: cv.id,
          section: c.section,
          content: c.content,
          tokenCount: Math.ceil(c.content.length / 4),
        }));
        parts = chunksData.length;
        if (parts > 0) {
          await prisma.cVChunk.createMany({ data: chunksData });
          app.log.info({ parts }, "CV chunks created");
        }
      } else {
        app.log.warn(
          { textLength, min: MIN_TEXT },
          "Insufficient text extracted; returning parsed:false"
        );
      }

      // 8) ردّ النجاح دائمًا بـ 201
      return reply.code(201).send({
        ok: true,
        cvId: cv.id,
        parts,
        storagePath: path,
        publicUrl,
        parsed: textLength >= MIN_TEXT,
        textLength,
      });
    } catch (err: any) {
      app.log.error({ err, stack: err.stack }, "CV upload failed");
      const status = err?.status ?? 500;
      const code = err?.code ?? "UPLOAD_FAILED";
      const message = err?.message || "فشل رفع السيرة الذاتية";
      return reply.code(status).send({ ok: false, code, message });
    }
  });

  // GET / → أحدث الملفات
  app.get("/", async () => {
    const cvs = await prisma.cV.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return { items: cvs };
  });

  // GET /:id → سجلّ واحد مع الأجزاء
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
