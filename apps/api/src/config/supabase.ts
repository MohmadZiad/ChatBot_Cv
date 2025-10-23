import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url) {
  throw new Error('SUPABASE_URL is required');
}

if (!key) {
  throw new Error(
    'Supabase service role key is missing (set SUPABASE_SERVICE_ROLE or SUPABASE_SERVICE_ROLE_KEY)'
  );
}

export const supabase = createClient(url, key, {
  auth: { persistSession: false }
});
