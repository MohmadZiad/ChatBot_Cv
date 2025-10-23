import { supabase } from '../config/supabase.js';
import crypto from 'crypto';

export async function putToStorage(
  fileBuffer: Buffer,
  mime: string,
  originalName: string,
  bucket = process.env.STORAGE_BUCKET || 'cv-uploads'
) {
  const ext = (originalName.split('.').pop() || 'bin').toLowerCase();
  const key = `cv/${new Date().toISOString().slice(0,10)}/${crypto.randomBytes(10).toString('hex')}.${ext}`;

  const { error } = await supabase.storage.from(bucket).upload(key, fileBuffer, {
    contentType: mime,
    upsert: false,
  });
  if (error) throw error;

  const { data: pub } = supabase.storage.from(bucket).getPublicUrl(key);
  return { path: key, publicUrl: pub?.publicUrl ?? null };
}
