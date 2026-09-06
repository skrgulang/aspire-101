import { createClient, SupabaseClient } from '@supabase/supabase-js';

let browserClient: SupabaseClient | null = null;

function getPublicKey() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    getPublicKey()
  );
}

export function getSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey = getPublicKey();

  if (!url || !publicKey) {
    throw new Error(
      'Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or legacy NEXT_PUBLIC_SUPABASE_ANON_KEY).'
    );
  }

  if (!browserClient) {
    browserClient = createClient(url, publicKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
  }

  return browserClient;
}
