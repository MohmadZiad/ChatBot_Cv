// apps/web/src/services/api/cv.ts
import { http } from "../http";

const ORIGIN = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";
const API = `${ORIGIN}/api`;

export type CV = {
  id: string;
  userId?: string | null;
  originalFilename: string;
  storagePath: string;
  parsedText?: string | null;
  lang?: string | null;
  createdAt?: string; // قد تكون undefined حسب الـ select
  updatedAt?: string;
};

export type UploadCVResponse = {
  cvId: string;
  parts: number;
  storagePath: string;
  publicUrl?: string; // هذا فقط من رفع الملف
};

// helper لبناء رابط العرض من Supabase (لو متاح)
export function buildPublicUrl(cv: CV): string | null {
  const base = process.env.NEXT_PUBLIC_STORAGE_PUBLIC_BASE; // مثلاً: https://<project>.supabase.co/storage/v1/object/public/<bucket>
  if (!base) return null;
  return `${base}/${cv.storagePath}`;
}

export const cvApi = {
  async upload(file: File): Promise<UploadCVResponse> {
    const form = new FormData();
    form.append("file", file);

    const res = await fetch(`${API}/cv/upload`, { method: "POST", body: form });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const j = await res.json();
        msg = j?.error || msg;
      } catch {}
      throw new Error(msg);
    }
    return res.json();
  },

  async list(): Promise<{ items: CV[] }> {
    return http.get(`/cv`);
  },
};
