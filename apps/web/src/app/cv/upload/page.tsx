'use client';
import * as React from 'react';
import { cvApi, type UploadCVResponse } from '@/services/api/cv';
import { Button } from '@/components/ui/Button';

export default function UploadPage() {
  const [file, setFile] = React.useState<File | null>(null);
  const [res, setRes] = React.useState<UploadCVResponse | null>(null);
  const [loading, setLoading] = React.useState(false);

  const onUpload = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const out = await cvApi.upload(file);
      setRes(out);
    } catch (e: any) {
      alert(e.message || 'Upload failed');
    } finally { setLoading(false); }
  };

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>رفع السيرة الذاتية</h1>
      <input type="file" accept=".pdf,.docx" onChange={e => setFile(e.target.files?.[0] || null)} />
      <div style={{ marginTop: 8 }}>
        <Button onClick={onUpload} disabled={!file} loading={loading}>رفع</Button>
      </div>
      {res && (
        <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, marginTop: 12 }}>
          <div>cvId: <b>{res.cvId}</b></div>
          <div>الأجزاء: {res.parts}</div>
          {res.publicUrl && <a href={res.publicUrl} target="_blank" rel="noreferrer">مشاهدة الملف</a>}
        </div>
      )}
    </div>
  );
}
