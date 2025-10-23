// apps/web/src/services/api/cv.ts
import { http } from "../http";

const ORIGIN =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || "http://localhost:4000";
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

export type UploadCVError = {
  ok: false;
  code: string;
  message: string;
  extractedLength?: number;
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

    const maxSize = 20 * 1024 * 1024; // 20 MB
    if (file.size > maxSize) {
      throw new Error("❌ حجم الملف كبير جداً. الحد الأقصى هو 20 ميجابايت.");
    }

    const form = new FormData();
    form.append("file", file, file.name);

    const url = `${API}/cv/upload`;
    console.log("📡 Sending request to:", url);

    try {
      const res = await fetch(url, { method: "POST", body: form });

      console.log("📨 Response status:", res.status, res.statusText);
      const ct = res.headers.get("content-type") || "";
      let responseData: any = null;
      let rawText = "";

      if (ct.includes("application/json")) {
        responseData = await res.json().catch(() => null);
      } else {
        rawText = await res.text().catch(() => "");
        try {
          responseData = rawText ? JSON.parse(rawText) : null;
        } catch {}
      }

      if (!res.ok) {
        const msg =
          responseData?.message ||
          rawText ||
          `خطأ أثناء رفع الملف (HTTP ${res.status})`;
        console.error("❌ Upload error payload:", responseData ?? rawText);
        throw new Error(msg);
      }

      if (!responseData?.ok) {
        console.warn("⚠️ Unexpected success payload:", responseData);
      }

      console.log("✅ Upload successful:", responseData);
      return responseData as UploadCVResponse;
    } catch (error: any) {
      console.error("❌ Upload failed:", error);

      const msg = (error?.message || "").toLowerCase();
      if (
        msg.includes("failed to fetch") ||
        msg.includes("connection refused")
      ) {
        throw new Error(
          "🚫 فشل الاتصال بالسيرفر. تأكد من تشغيل الـ API على http://localhost:4000 وتفعيل CORS."
        );
      }
      throw error;
    }
  },

  async list(): Promise<{ items: CV[] }> {
    return http.get(`/cv`);
  },

  async getById(id: string): Promise<{ cv: CV }> {
    return http.get(`/cv/${id}`);
  },
};
