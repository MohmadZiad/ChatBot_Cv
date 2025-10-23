// apps/web/src/app/upload/page.tsx
"use client";
import * as React from "react";
import { cvApi, type UploadCVResponse } from "@/services/api/cv";

export default function UploadPage() {
  const [file, setFile] = React.useState<File | null>(null);
  const [res, setRes] = React.useState<UploadCVResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] || null;
    setFile(selected);
    setError(null);
    setRes(null);

    if (selected) {
      console.log("📄 File selected:", {
        name: selected.name,
        size: (selected.size / (1024 * 1024)).toFixed(2) + " MB",
        type: selected.type,
      });
    }
  };

  const onUpload = async () => {
    if (!file) {
      setError("الرجاء اختيار ملف أولاً");
      return;
    }

    setLoading(true);
    setError(null);
    setRes(null);

    try {
      const out = await cvApi.upload(file);
      setRes(out);

      // إعادة تعيين input الملف
      const fileInput = document.querySelector(
        'input[type="file"]'
      ) as HTMLInputElement;
      if (fileInput) fileInput.value = "";
      setFile(null);
    } catch (e: any) {
      console.error("Upload error:", e);
      setError(e?.message || "فشل رفع السيرة الذاتية");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 16 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 20 }}>
        رفع السيرة الذاتية
      </h1>

      <div
        style={{
          border: "2px dashed #ddd",
          borderRadius: 8,
          padding: 24,
          marginBottom: 16,
          textAlign: "center",
        }}
      >
        <input
          type="file"
          accept=".pdf,.docx,.doc"
          onChange={onFileChange}
          style={{ marginBottom: 12 }}
        />

        {file && (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              background: "#f5f5f5",
              borderRadius: 4,
            }}
          >
            <div>
              <strong>الملف المحدد:</strong> {file.name}
            </div>
            <div>
              <strong>الحجم:</strong> {(file.size / (1024 * 1024)).toFixed(2)}{" "}
              MB
            </div>
            <div>
              <strong>النوع:</strong> {file.type || "غير معروف"}
            </div>
          </div>
        )}
      </div>

      <div style={{ marginBottom: 16 }}>
        <button
          onClick={onUpload}
          disabled={!file || loading}
          style={{
            padding: "12px 24px",
            fontSize: 16,
            fontWeight: 600,
            backgroundColor: file && !loading ? "#2196F3" : "#ccc",
            color: "white",
            border: "none",
            borderRadius: 6,
            cursor: file && !loading ? "pointer" : "not-allowed",
            transition: "all 0.2s",
          }}
        >
          {loading ? "جاري الرفع..." : "رفع السيرة الذاتية"}
        </button>
      </div>

      {error && (
        <div
          style={{
            marginTop: 16,
            padding: 16,
            backgroundColor: "#ffebee",
            color: "#c62828",
            borderRadius: 8,
            border: "1px solid #ef5350",
          }}
        >
          <strong>❌ خطأ:</strong> {error}
        </div>
      )}

      {res && (
        <div
          style={{
            border: "1px solid #4caf50",
            borderRadius: 8,
            padding: 16,
            marginTop: 16,
            backgroundColor: "#f1f8f4",
          }}
        >
          <h3 style={{ marginTop: 0, color: "#2e7d32" }}>✅ تم الرفع بنجاح!</h3>
          <div style={{ marginBottom: 8 }}>
            <strong>معرّف السيرة الذاتية:</strong> <code>{res.cvId}</code>
          </div>
          <div style={{ marginBottom: 8 }}>
            <strong>عدد الأجزاء:</strong> {res.parts}
          </div>
          {res.textLength && (
            <div style={{ marginBottom: 8 }}>
              <strong>طول النص:</strong> {res.textLength} حرف
            </div>
          )}
          {res.publicUrl && (
            <div style={{ marginTop: 12 }}>
              <a
                href={res.publicUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  color: "#1976d2",
                  textDecoration: "underline",
                }}
              >
                🔗 مشاهدة الملف المرفوع
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
