import { createClient, SupabaseClient } from '@supabase/supabase-js';

let browserClient: SupabaseClient | null = null;
let signupGuardInstalled = false;

function getPublicKey() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

function installExistingAccountGuard(client: SupabaseClient) {
  if (signupGuardInstalled) return;
  signupGuardInstalled = true;

  const originalSignUp = client.auth.signUp.bind(client.auth);
  client.auth.signUp = (async (...args: Parameters<typeof originalSignUp>) => {
    const result = await originalSignUp(...args);

    // With email confirmation enabled, Supabase can return an obfuscated user
    // for an email that already belongs to an account. No confirmation email is
    // sent in that case and the returned user has no identities. Turn that
    // confusing success-looking response into a clear Aspire message instead.
    const identities = result.data.user?.identities;
    if (!result.error && result.data.user && Array.isArray(identities) && identities.length === 0) {
      throw new Error('You already have an Aspire account with this email. Sign in instead.');
    }

    return result;
  }) as typeof client.auth.signUp;
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
    installExistingAccountGuard(browserClient);
  }

  return browserClient;
}
