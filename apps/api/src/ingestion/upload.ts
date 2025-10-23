import { supabase } from "../config/supabase.js";
import crypto from "crypto";
import { debugLog } from "../utils/debug.js";

type UploadError = Error & {
  status?: number;
  code?: string;
};

const ensuredBuckets = new Set<string>();

async function ensureBucketExists(bucket: string) {
  if (ensuredBuckets.has(bucket)) return;

  const { data, error } = await supabase.storage.getBucket(bucket);
  if (data) {
    ensuredBuckets.add(bucket);
    return;
  }

  const status = typeof (error as any)?.status === "number"
    ? (error as any).status
    : undefined;
  if (status && status !== 404) {
    throw error;
  }

  const { error: createError } = await supabase.storage.createBucket(bucket, {
    public: true,
  });

  if (
    createError &&
    (typeof (createError as any)?.status !== "number" ||
      (createError as any).status !== 409) &&
    !/exists/i.test(createError.message || "")
  ) {
    throw createError;
  }

  ensuredBuckets.add(bucket);
  debugLog("storage.bucket", "ensured bucket", { bucket });
}

export async function putToStorage(
  fileBuffer: Buffer,
  mime: string,
  originalName: string,
  bucket = process.env.STORAGE_BUCKET || "cv-uploads"
) {
  await ensureBucketExists(bucket);

  const ext = (originalName.split(".").pop() || "bin").toLowerCase();
  const key = `cv/${new Date()
    .toISOString()
    .slice(0, 10)}/${crypto.randomBytes(10).toString("hex")}.${ext}`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(key, fileBuffer, {
      contentType: mime,
      upsert: false,
    });

  if (error) {
    const status = typeof (error as any)?.status === "number" ? (error as any).status : 500;
    const code =
      typeof (error as any)?.statusCode === "string"
        ? (error as any).statusCode
        : (error as any)?.error ?? "STORAGE_UPLOAD_FAILED";

    const err: UploadError = new Error(error.message);
    err.status = status;
    err.code = code;
    debugLog("storage.upload", "upload failed", {
      bucket,
      key,
      status,
      code,
    });
    throw err;
  }

  const { data: pub } = supabase.storage.from(bucket).getPublicUrl(key);
  return { path: key, publicUrl: pub?.publicUrl ?? null };
}
