import type { FastifyInstance } from "fastify";

import { prisma } from "../db/client";
import { fileTypeFromBuffer } from "file-type";
import { putToStorage } from "../ingestion/upload.js";
import { parsePDF, parseDOCX } from "../ingestion/parse.js";
import { chunkText } from "../ingestion/chunk.js";
import { detectLang } from "../nlp/lang.js";

export async function cvRoute(app: FastifyInstance) {
  app.post("/upload", async (req, reply) => {
    const mp = await req.file(); // requires @fastify/multipart
    if (!mp) return reply.code(400).send({ error: "No file" });

    const fileBuf = await mp.toBuffer();
    if (!fileBuf || fileBuf.length === 0) {
      return reply.code(400).send({ error: "Empty file" });
    }

    const type = await fileTypeFromBuffer(fileBuf).catch(() => null);
    const mime = type?.mime ?? mp.mimetype ?? "application/octet-stream";
    const original = mp.filename ?? "cv.bin";

    // 1) رفع إلى التخزين
    const { path, publicUrl } = await putToStorage(fileBuf, mime, original);

    // 2) Parsing
    let text = "";
    if (mime.includes("pdf")) text = await parsePDF(fileBuf);
    else if (mime.includes("word") || original.toLowerCase().endsWith(".docx"))
      text = await parseDOCX(fileBuf);
    else text = fileBuf.toString("utf8");

    text = (text || "").trim();
    if (!text) return reply.code(400).send({ error: "Cannot parse file" });

    const lang = detectLang(text);

    // 3) إنشاء CV
    const cv = await prisma.cV.create({
      data: {
        storagePath: path,
        originalFilename: original,
        parsedText: text.slice(0, 50000),
        lang,
      },
    });

    // 4) تقطيع وتخزين
    const chunksData = chunkText(text, 1000).map((c) => ({
      cvId: cv.id,
      section: c.section,
      content: c.content,
      embedding: null,
      tokenCount: Math.ceil(c.content.length / 4),
    }));
    if (chunksData.length)
      await prisma.cVChunk.createMany({ data: chunksData });

    return reply.code(201).send({
      cvId: cv.id,
      parts: chunksData.length,
      storagePath: path,
      publicUrl,
    });
  });

  app.get("/", async () => {
    const cvs = await prisma.cV.findMany({ orderBy: { createdAt: "desc" } });
    return { items: cvs };
  });
}
