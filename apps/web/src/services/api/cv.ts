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
  createdAt?: string;
  updatedAt?: string;
};


export type UploadCVResponse = {
  ok: boolean;
  cvId: string;
  parts: number;
  storagePath: string;
  publicUrl?: string;
  parsed: boolean;
  textLength?: number;
};

export function buildPublicUrl(cv: CV): string | null {
  const base =
    process.env.NEXT_PUBLIC_STORAGE_PUBLIC_BASE ||
    process.env.NEXT_PUBLIC_STORAGE_PUBLIC_URL;
  if (!base) return null;
  return `${base}/${cv.storagePath}`;
}

export const cvApi = {
  async upload(file: File): Promise<UploadCVResponse> {
    console.log("📤 Starting upload:", {
      name: file.name,
      type: file.type,
      size: file.size,
      sizeInMB: (file.size / (1024 * 1024)).toFixed(2) + " MB",
    });

    const maxSize = 20 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new Error("حجم الملف كبير جداً. الحد الأقصى 20MB.");
    }

    const form = new FormData();
    form.append("file", file, file.name);

    const url = `${API}/cv/upload`;
    console.log("📡 Sending request to:", url);

    try {
      const res = await fetch(url, { method: "POST", body: form });
      console.log("📨 Response status:", res.status, res.statusText);

      const ct = res.headers.get("content-type") || "";
      let payload: any = null;
      let rawText = "";

      if (ct.includes("application/json")) {
        payload = await res.json().catch(() => null);
      } else {
        rawText = await res.text().catch(() => "");
        try {
          payload = rawText ? JSON.parse(rawText) : null;
        } catch {}
      }

      if (!res.ok) {
        const message =
          payload?.message || rawText || `HTTP ${res.status} ${res.statusText}`;
        console.error("❌ Upload error payload:", payload ?? rawText);
        throw new Error(message);
      }

      if (!payload || payload.ok !== true) {
        console.warn("⚠️ Unexpected success payload:", payload);
      }

      console.log("✅ Upload successful:", payload);
      return payload as UploadCVResponse;
    } catch (e: any) {
      console.error("❌ Upload failed:", e);

      const msg = String(e?.message || "").toLowerCase();
      if (
        msg.includes("failed to fetch") ||
        msg.includes("connection refused")
      ) {
        throw new Error(
          "فشل الاتصال بالسيرفر. تأكّد أن الـ API يعمل على http://localhost:4000 وأن CORS مفعّل."
        );
      }
      throw e;
    }
  },

  async list(): Promise<{ items: CV[] }> {
    return http.get(`/cv`);
  },

  async getById(id: string): Promise<{ cv: CV }> {
    return http.get(`/cv/${id}`);
  },
};
