import { http } from '../http';

export type UploadCVResponse = { cvId: string; parts: number; storagePath: string; publicUrl?: string | null };
export type CV = { id: string; title?: string | null; publicUrl?: string | null; storagePath: string; createdAt: string };

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api';

export const cvApi = {
  async upload(file: File) {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${BASE}/cv/upload`, { method: 'POST', body: form });
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<UploadCVResponse>;
  },
  list() {
    return http.get<{ items: CV[] }>('/cv');
  }
};
