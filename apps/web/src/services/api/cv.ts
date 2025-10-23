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

export type UploadCVError = {
  ok: false;
  code: string;
  message: string;
  extractedLength?: number;
};

export function buildPublicUrl(cv: CV): string | null {
  const base = process.env.NEXT_PUBLIC_STORAGE_PUBLIC_BASE;
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

    // التحقق من حجم الملف
    const maxSize = 20 * 1024 * 1024; // 20MB
    if (file.size > maxSize) {
      throw new Error(`حجم الملف كبير جداً. الحد الأقصى هو 20 ميجابايت.`);
    }

    // التحقق من نوع الملف
    const allowedTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
    ];

    const allowedExtensions = [".pdf", ".docx", ".doc"];
    const hasValidExtension = allowedExtensions.some((ext) =>
      file.name.toLowerCase().endsWith(ext)
    );

    if (!allowedTypes.includes(file.type) && !hasValidExtension) {
      throw new Error(`نوع الملف غير مدعوم. الرجاء رفع ملف PDF أو DOCX فقط.`);
    }

    const form = new FormData();
    form.append("file", file, file.name);

    console.log("📡 Sending request to:", `${API}/cv/upload`);

    try {
      const res = await fetch(`${API}/cv/upload`, {
        method: "POST",
        body: form,
      });

      console.log("📨 Response status:", res.status, res.statusText);

      // قراءة الـ response مرة واحدة فقط
      const responseText = await res.text();
      console.log("📨 Raw response:", responseText);

      let responseData: any;
      try {
        responseData = JSON.parse(responseText);
      } catch (parseErr) {
        console.error("❌ Failed to parse JSON:", responseText);
        throw new Error(
          `استجابة غير صالحة من السيرفر: ${responseText.substring(0, 100)}`
        );
      }

      if (!res.ok) {
        console.error("❌ Upload error:", responseData);
        const message =
          responseData?.message || `خطأ في الرفع: HTTP ${res.status}`;
        throw new Error(message);
      }

      console.log("✅ Upload successful:", responseData);
      return responseData;
    } catch (error: any) {
      console.error("❌ Upload failed:", error);

      if (
        error.message.includes("fetch") ||
        error.message.includes("Failed to fetch")
      ) {
        throw new Error(
          "فشل الاتصال بالسيرفر. تأكد من تشغيل الـ API على المنفذ 4000."
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
