// apps/web/src/app/upload/page.tsx
"use client";
import * as React from "react";
import { cvApi, type UploadCVResponse } from "@/services/api/cv";

export default function UploadPage() {
  const [file, setFile] = React.useState<File | null>(null);
  const [res, setRes] = React.useState<UploadCVResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const onUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setRes(null);
    try {
      const out = await cvApi.upload(file);
      setRes(out);
    } catch (e: any) {
      setError(e?.message || "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 16 }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
        رفع السيرة الذاتية
      </h1>
      <input
        type="file"
        accept=".pdf,.docx"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
      />
      <div style={{ marginTop: 8 }}>
        <button onClick={onUpload} disabled={!file || loading}>
          {loading ? "يرفع..." : "رفع"}
        </button>
      </div>

      {error && <div style={{ marginTop: 12, color: "#B00020" }}>{error}</div>}

      {res && (
        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: 8,
            padding: 12,
            marginTop: 12,
          }}
        >
          <div>
            cvId: <b>{res.cvId}</b>
          </div>
          <div>الأجزاء (parts): {res.parts}</div>
          {res.publicUrl && (
            <a href={res.publicUrl} target="_blank" rel="noreferrer">
              مشاهدة الملف
            </a>
          )}
        </div>
      )}
    </div>
  );
}
