// apps/api/src/services/embeddings.ts
import { embedTexts } from "./openai.js";
import { prisma } from "../db/client";
import { Prisma } from "@prisma/client";
import { chunkText } from "../ingestion/chunk.js";

const MIN_TEXT = Number(process.env.MIN_EXTRACTED_TEXT || "60");
const DIM = Number(process.env.EMBEDDING_DIM || "1536");

/**
 * يبني CVChunk لأول مرة إن لم تكن موجودة.
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

/**
 * يولّد embeddings لكل CVChunk ما عليه embedding بعد.
 */
export async function ensureCvEmbeddings(cvId: string) {
  // صحّح أي صفوف قديمة معلّمة hasEmbedding=true بلا embedding فعلي
  await prisma.$executeRaw`
    UPDATE "CVChunk"
    SET "hasEmbedding" = false
    WHERE "cvId" = ${cvId} AND "embedding" IS NULL
  `;

  const chunks = await prisma.cVChunk.findMany({
    where: { cvId, hasEmbedding: false },
    orderBy: { id: "asc" },
    select: { id: true, content: true },
  });
  if (chunks.length === 0) return 0;

  const BATCH = 64;
  let updated = 0;
  const idsUpdated: (number | bigint)[] = [];

  for (let i = 0; i < chunks.length; i += BATCH) {
    const slice = chunks.slice(i, i + BATCH);

    // استدعاء مزوّد الـ embeddings
    const vecs = await embedTexts(slice.map((c) => c.content));

    // تخزين كل متجه (pgvector) + وسم hasEmbedding
    for (let k = 0; k < slice.length; k++) {
      const id = slice[k].id as unknown as number | bigint;
      const v = vecs[k];

      if (!Array.isArray(v) || (DIM && v.length !== DIM)) continue;

      // embedding = ARRAY[...]::vector
      await prisma.$executeRawUnsafe(
        `UPDATE "CVChunk" SET "embedding" = ${toVectorSQL(v)} WHERE id = $1`,
        id
      );

      idsUpdated.push(id);
      updated++;
    }
  }

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
  return `${toArraySql(vec)}::vector`;
}
function toArraySql(vec: number[]) {
  return `ARRAY[${vec.join(",")}]`;
}