'use client';

import { useCallback, useEffect, useState } from 'react';
import { loadConnectAndInitialize, type StripeConnectInstance } from '@stripe/connect-js';
import { ConnectAccountOnboarding, ConnectComponentsProvider } from '@stripe/react-connect-js';
import { getSupabaseBrowserClient } from '../lib/supabase/client';

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';

async function authHeaders() {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sign in again to continue.');
  return { Authorization: `Bearer ${token}` };
}

export default function AspireEmbeddedPayoutSetup() {
  const [connectInstance, setConnectInstance] = useState<StripeConnectInstance | null>(null);
  const [error, setError] = useState('');

  const fetchClientSecret = useCallback(async () => {
    const headers = await authHeaders();
    const response = await fetch('/api/stripe/connect/session', { method: 'POST', headers });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.clientSecret) {
      throw new Error(payload?.error || 'Could not start payout setup.');
    }
    return payload.clientSecret as string;
  }, []);

  useEffect(() => {
    if (!publishableKey) return;
    try {
      const instance = loadConnectAndInitialize({
        publishableKey,
        fetchClientSecret,
        appearance: {
          overlays: 'dialog',
          variables: {
            colorPrimary: '#e4bd49',
            colorBackground: '#11110f',
            colorText: '#f5f0e4',
            borderRadius: '14px'
          }
        }
      });
      setConnectInstance(instance);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not initialize payout setup.');
    }
  }, [fetchClientSecret]);

  if (!publishableKey) {
    return (
      <div className="embeddedStripeError">
        <strong>Embedded payout setup needs one more deployment setting.</strong>
        <p>Add NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY to this Vercel environment, then redeploy.</p>
        <a href="/profile">Back to Profile</a>
      </div>
    );
  }

  if (error) {
    return (
      <div className="embeddedStripeError">
        <strong>Could not open payout setup.</strong>
        <p>{error}</p>
        <a href="/profile">Back to Profile</a>
      </div>
    );
  }

  if (!connectInstance) {
    return <div className="embeddedStripeLoading">Preparing secure payout setup…</div>;
  }

  return (
    <div className="embeddedPayoutShell">
      <div className="embeddedPayoutBrand">
        <span>ASPIRE PAYOUTS</span>
        <h1>Set up earnings without leaving Aspire.</h1>
        <p>Stripe securely collects the identity and banking information required to send you payouts. Aspire stores only the minimum status needed for payment readiness.</p>
      </div>
      <div className="embeddedPayoutFrame">
        <ConnectComponentsProvider connectInstance={connectInstance}>
          <ConnectAccountOnboarding
            collectionOptions={{ fields: 'eventually_due' }}
            onExit={() => window.location.assign('/profile?payments=return')}
          />
        </ConnectComponentsProvider>
      </div>
    </div>
  );
}
