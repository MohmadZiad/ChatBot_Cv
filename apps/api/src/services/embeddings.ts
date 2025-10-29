// apps/api/src/services/embeddings.ts
import { embedTexts } from "./openai.js";
import { prisma } from "../db/client";
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
  for (let i = 0; i < chunks.length; i += BATCH) {
    const slice = chunks.slice(i, i + BATCH);

    // استدعاء مزوّد الـ embeddings
    const vecs = await embedTexts(slice.map((c) => c.content));

    // تخزين كل متجه (pgvector) + وسم hasEmbedding
    for (let k = 0; k < slice.length; k++) {
      const id = slice[k].id as unknown as number | bigint;
      const raw = vecs[k];
      const vector = normalizeVector(raw);

      if (!vector.length || (DIM && vector.length !== DIM)) continue;

      await prisma.$executeRawUnsafe(
        `UPDATE "CVChunk" SET "embedding" = ${toVectorSQL(vector)} WHERE id = $1`,
        id
      );

      updated++;
    }
  }

  return updated;
}

// Helpers
function normalizeVector(value: unknown): number[] {
  const source: unknown[] = Array.isArray(value)
    ? value
    : typeof value === "object" &&
        value !== null &&
        typeof (value as { length?: number }).length === "number"
      ? Array.from(value as ArrayLike<unknown>)
      : [];

  return source.map((entry) => {
    const num = typeof entry === "number" ? entry : Number(entry);
    return Number.isFinite(num) ? num : 0;
  });
}

function isValidVector(vec: number[]) {
  if (!vec.length) return false;
  if (DIM && vec.length !== DIM) return false;
  return vec.some((value) => value !== 0);
}

function toVectorLiteral(vec: number[]) {
  const formatted = vec.map((value) => formatComponent(value)).join(",");
  return `[${formatted}]`;
}

function formatComponent(value: number) {
  if (!Number.isFinite(value)) return "0";
  if (value === 0) return "0";
  const abs = Math.abs(value);
  if (abs >= 1) return value.toFixed(6).replace(/0+$/g, "").replace(/\.$/, "");
  if (abs >= 1e-3) return value.toPrecision(8).replace(/0+$/g, "").replace(/\.$/, "");
  return value.toExponential(6);
}

function normalizeVector(value: unknown): number[] {
  if (Array.isArray(value)) return value.map((num) => Number(num) || 0);
  if (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { length?: number }).length === "number"
  ) {
    try {
      return Array.from(value as ArrayLike<number>, (num) => Number(num) || 0);
    } catch {
      return [];
    }
  }
  return [];
}
