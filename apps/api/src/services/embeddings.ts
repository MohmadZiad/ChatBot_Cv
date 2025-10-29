// apps/api/src/services/embeddings.ts
import { embedTexts } from "./openai.js";
import { prisma } from "../db/client";
import { Prisma } from "@prisma/client";
import { chunkText } from "../ingestion/chunk.js";

const MIN_TEXT = Number(process.env.MIN_EXTRACTED_TEXT || "60");

const DIM = Number(process.env.EMBEDDING_DIM || "1536");

/**
 * يولّد embeddings لأي CVChunk ما إلها embedding بعد (hasEmbedding=false)
 * وبعدين يرفع الفلاغ hasEmbedding=true مرّة واحدة بشكل جماعي.
 */
export async function ensureCvChunks(cvId: string) {
  const existing = await prisma.cVChunk.count({ where: { cvId } });
  if (existing > 0) return existing;

  const cv = await prisma.cV.findUnique({
    where: { id: cvId },
    select: { parsedText: true },
  });

  const text = cv?.parsedText?.trim();
  if (!text || text.length < MIN_TEXT) return 0;

  const chunkData = chunkText(text, 1000).map((c) => ({
    cvId,
    section: c.section,
    content: c.content,
    tokenCount: Math.ceil(c.content.length / 4),
    hasEmbedding: false,
  }));

  if (!chunkData.length) return 0;

  await prisma.cVChunk.createMany({ data: chunkData });
  return chunkData.length;
}

export async function ensureCvEmbeddings(cvId: string) {
  // صحّح أي سجلات قديمة تحتوي على embedding فارغ لكنها معلّمة كـ hasEmbedding=true
  await prisma.$executeRaw`
    UPDATE "CVChunk"
    SET "hasEmbedding" = false
    WHERE "cvId" = ${cvId} AND "embedding" IS NULL
  `;

  // هات الشُنكس اللي لسه ما إلها embedding
  const chunks = await prisma.cVChunk.findMany({
    where: {
      cvId,
      hasEmbedding: false,
    },
    orderBy: { id: "asc" },
    select: { id: true, content: true },
  });

  if (chunks.length === 0) return 0;

  const batch = 64;
  let updated = 0;
  const idsUpdated: (number | bigint)[] = [];

  for (let i = 0; i < chunks.length; i += batch) {
    const slice = chunks.slice(i, i + batch);

    // استدعاء OpenAI للحصول على المتجهات
    const vecs = await embedTexts(slice.map((c) => c.content));

    // خزّن كل متجه عبر SQL (Prisma ما بدعم Unsupported("vector") مباشرة)
    for (let k = 0; k < slice.length; k++) {
      const id = slice[k].id as unknown as number | bigint;
      const v = vecs[k];

      if (!Array.isArray(v) || (DIM && v.length !== DIM)) continue;

      await prisma.$executeRawUnsafe(
        `UPDATE "CVChunk" SET "embedding" = ${toVectorSQL(v)} WHERE id = $1`,
        id
      );

      idsUpdated.push(id);
      updated++;
    }
  }

  // علّم الشُنكس اللي تحديثت مرّة واحدة
  if (idsUpdated.length) {
    await prisma.$executeRaw`
      UPDATE "CVChunk"
      SET "hasEmbedding" = true
      WHERE id IN (${Prisma.join(idsUpdated)})
    `;
  }

  return updated;
}

// Helpers
function toVectorSQL(vec: number[]) {
  // cast إلى pgvector
  return `${toArraySql(vec)}::vector`;
}
function toArraySql(vec: number[]) {
  return `ARRAY[${vec.join(",")}]`;
}
