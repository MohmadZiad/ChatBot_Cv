import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE!; 
export const supabase = createClient(url, key, {
  auth: { persistSession: false }
});
