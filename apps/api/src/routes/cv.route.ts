import type { FastifyInstance } from "fastify";
import { prisma } from "../db/client";
import { fileTypeFromBuffer } from "file-type";
import { putToStorage } from "../ingestion/upload.js";
import { parsePDF, parseDOCX } from "../ingestion/parse.js";
import { chunkText } from "../ingestion/chunk.js";
import { detectLang } from "../nlp/lang.js";

export async function cvRoute(app: FastifyInstance) {
  app.post("/upload", async (req, reply) => {
    try {
      const mp = await req.file(); // requires @fastify/multipart
      if (!mp) return reply.code(400).send({ error: "No file" });

      const fileBuf = await mp.toBuffer();
      app.log.info(
        { size: fileBuf?.length, mime: mp.mimetype, name: mp.filename },
        "upload info"
      );
      if (!fileBuf?.length)
        return reply.code(400).send({ error: "Empty upload" });

      const type = await fileTypeFromBuffer(fileBuf).catch(() => null);
      const mime = type?.mime ?? mp.mimetype ?? "application/octet-stream";
      const original = mp.filename ?? "cv.bin";

      // 1) خزّن الملف أولًا
      const { path, publicUrl } = await putToStorage(fileBuf, mime, original);

      // 2) جرّب استخراج النص (لا ترمي 500 لو فشل)
      let text = "";
      try {
        if (mime.includes("pdf")) text = await parsePDF(fileBuf);
        else if (
          mime.includes("word") ||
          original.toLowerCase().endsWith(".docx")
        )
          text = await parseDOCX(fileBuf);
        else text = fileBuf.toString("utf8");
      } catch (err) {
        app.log.warn(
          { err: String(err) },
          "parse failed, saving file without text"
        );
        text = "";
      }
      text = (text || "").trim();
      const lang = text ? detectLang(text) : "en";

      // 3) أنشئ CV
      const cv = await prisma.cV.create({
        data: {
          storagePath: path,
          originalFilename: original,
          parsedText: text ? text.slice(0, 50_000) : null,
          lang,
        },
      });

      // 4) تقطيع وتخزين الشُنكس (إن وُجد نص)
      let parts = 0;
      if (text) {
        const chunksData = chunkText(text, 1000).map((c) => ({
          cvId: cv.id,
          section: c.section,
          content: c.content,
          tokenCount: Math.ceil(c.content.length / 4),
        }));
        parts = chunksData.length;
        if (parts) await prisma.cVChunk.createMany({ data: chunksData });
      }

      return reply.code(201).send({
        cvId: cv.id,
        parts,
        storagePath: path,
        publicUrl,
        parsed: Boolean(text),
      });
    } catch (err: any) {
      app.log.error({ err }, "cv upload failed");
      return reply
        .code(500)
        .send({ error: "upload failed", message: err?.message });
    }
  });

  app.get("/", async () => {
    const cvs = await prisma.cV.findMany({ orderBy: { createdAt: "desc" } });
    return { items: cvs };
  });
}
