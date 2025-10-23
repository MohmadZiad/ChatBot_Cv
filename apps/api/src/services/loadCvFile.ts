// apps/api/src/services/loadCvFile.ts
import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SUPABASE_STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "cv";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/** يحاول قراءة الملف من الديسك، ولو فشل ينزّله من Supabase Storage */
export async function loadCvFile(storagePath: string): Promise<Buffer> {
  // 1) جرّب مسار مطلق كما هو
  try { return await fs.readFile(storagePath); } catch {}

  // 2) جرّب مجلد uploads داخل المشروع
  try {
    const p = path.join(process.cwd(), "uploads", storagePath);
    return await fs.readFile(p);
  } catch {}

  // 3) نزّل من Supabase Storage
  // لو storagePath يبدأ بـ cv/ فالمفتاح داخل الـbucket هو الباقي بعد "cv/"
  const key = storagePath.replace(/^cv\//, "");
  const { data, error } = await supabase.storage
    .from(SUPABASE_STORAGE_BUCKET)
    .download(key);

  if (error) throw new Error(`Storage download failed: ${error.message}`);
  const buf = Buffer.from(await data.arrayBuffer());
  if (!buf.length) throw new Error("Downloaded empty file");
  return buf;
}
