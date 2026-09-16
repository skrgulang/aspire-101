'use client';

import { FormEvent, useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '../../../lib/supabase/client';
import styles from './page.module.css';

type ApiPayload = {
  ok?: boolean;
  mode?: string;
  url?: string;
  error?: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function accessToken() {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) throw new Error('Sign in again to continue.');
  return data.session.access_token;
}

export default function StripeSandboxOnboardingPage() {
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [userId, setUserId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Checking admin access…');

  useEffect(() => {
    let cancelled = false;

    async function checkAccess() {
      try {
        const token = await accessToken();
        const response = await fetch('/api/admin/stripe/connect/onboard', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store'
        });
        const payload = await response.json().catch(() => ({})) as ApiPayload;
        if (!response.ok || !payload.ok || payload.mode !== 'sandbox') {
          throw new Error(payload.error || 'This tool is unavailable.');
        }
        if (!cancelled) {
          setAllowed(true);
          setMessage('Admin verified. Stripe sandbox is ready.');
        }
      } catch (error) {
        if (!cancelled) {
          const text = error instanceof Error ? error.message : 'Could not verify admin access.';
          setMessage(text);
          if (text === 'Sign in again to continue.') {
            window.location.assign('/login?next=%2Fadmin%2Fstripe-sandbox-onboarding');
          }
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    }

    checkAccess();
    return () => { cancelled = true; };
  }, []);

  async function launch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedUserId = userId.trim();
    if (!UUID_RE.test(normalizedUserId) || busy || !allowed) {
      setMessage('Enter a valid seller user UUID.');
      return;
    }

    setBusy(true);
    setMessage('Creating a single-use Stripe sandbox onboarding link…');
    try {
      const token = await accessToken();
      const response = await fetch('/api/admin/stripe/connect/onboard', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ userId: normalizedUserId }),
        cache: 'no-store'
      });
      const payload = await response.json().catch(() => ({})) as ApiPayload;
      if (!response.ok || !payload.url) throw new Error(payload.error || 'Could not create the onboarding link.');

      const destination = new URL(payload.url);
      if (destination.protocol !== 'https:' || !destination.hostname.endsWith('stripe.com')) {
        throw new Error('Stripe returned an unexpected onboarding URL.');
      }
      window.location.assign(destination.toString());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not create the onboarding link.');
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <div className={styles.badge}>INTERNAL · SANDBOX ONLY</div>
        <h1>Stripe seller onboarding</h1>
        <p className={styles.lead}>
          Temporary admin launcher for an existing seller sandbox payout account. The server re-checks both your admin role and Stripe test mode before it creates a link.
        </p>

        <div className={`${styles.status} ${allowed ? styles.good : checking ? '' : styles.bad}`} role="status">
          <span className={styles.dot} />
          <span>{message}</span>
        </div>

        <form className={styles.form} onSubmit={launch}>
          <label htmlFor="seller-user-id">Seller user UUID</label>
          <input
            id="seller-user-id"
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            autoComplete="off"
            spellCheck={false}
            disabled={!allowed || busy}
          />
          <button type="submit" disabled={!allowed || busy || !UUID_RE.test(userId.trim())}>
            {busy ? 'Opening Stripe…' : 'Open Stripe sandbox onboarding'}
          </button>
        </form>

        <div className={styles.notes}>
          <strong>Safety guardrails</strong>
          <p>No Stripe secret, login token, or one-time onboarding URL is shown in this page source. The link is generated only after an authenticated admin request and only while this deployment is configured for Stripe sandbox mode.</p>
        </div>

        <a className={styles.back} href="/transactions">← Back to Transactions</a>
      </section>
    </main>
  );
}
