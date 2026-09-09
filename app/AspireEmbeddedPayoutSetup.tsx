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
      throw new Error(payload?.error || 'Could not start receiving setup.');
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
      setError(nextError instanceof Error ? nextError.message : 'Could not initialize receiving setup.');
    }
  }, [fetchClientSecret]);

  if (!publishableKey) {
    return (
      <div className="embeddedStripeError">
        <strong>Embedded receiving setup needs one more deployment setting.</strong>
        <p>Add NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY to this Vercel environment, then redeploy.</p>
        <a href="/profile">Back to Profile</a>
      </div>
    );
  }

  if (error) {
    return (
      <div className="embeddedStripeError">
        <strong>Could not open receiving setup.</strong>
        <p>{error}</p>
        <a href="/profile">Back to Profile</a>
      </div>
    );
  }

  if (!connectInstance) {
    return <div className="embeddedStripeLoading">Preparing secure receiving setup…</div>;
  }

  return (
    <div className="embeddedPayoutShell">
      <div className="embeddedPayoutBrand">
        <span>RECEIVE MONEY · STRIPE CONNECT</span>
        <h1>One Aspire account can both pay and receive.</h1>
        <p><strong>You do not need a separate seller account.</strong> When you are buying, you simply use a card or supported wallet at Aspire checkout. This setup only enables the same Aspire account to receive money when you sell an item or get paid for an eligible request.</p>
        <p>If Stripe asks what type of account you are using, a student receiving money personally should choose the personal/individual option. Choose a company or business option only if the money is actually being received by a business.</p>
        <p>To receive money, Stripe may need identity, tax and payout-bank information. Stripe collects those sensitive fields directly inside this embedded component; Aspire does not store your full bank-account credentials or raw KYC documents in its application database.</p>
        <p>Aspire keeps limited transaction records such as your Stripe account identifier, payout-readiness status, transaction amounts, release status and transfer identifiers so we can operate support, refunds, disputes and payout reconciliation.</p>
        <div className="embeddedPayoutBuyerExit"><a href="/connections">I only want to pay right now → Back to Connections</a></div>
        <small>Stripe may request additional information when required for financial compliance. By continuing, you acknowledge Aspire&apos;s <a href="/privacy">Privacy Policy</a> and <a href="/terms">Terms</a>, and Stripe&apos;s own terms and privacy practices apply to information Stripe processes.</small>
      </div>
      <div className="embeddedPayoutFrame">
        <ConnectComponentsProvider connectInstance={connectInstance}>
          <ConnectAccountOnboarding
            collectionOptions={{ fields: 'currently_due' }}
            onExit={() => window.location.assign('/profile?payments=return')}
          />
        </ConnectComponentsProvider>
      </div>
    </div>
  );
}
