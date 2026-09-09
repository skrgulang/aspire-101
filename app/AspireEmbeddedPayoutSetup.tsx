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
    return <div className="embeddedStripeLoading">Preparing secure seller payout setup…</div>;
  }

  return (
    <div className="embeddedPayoutShell">
      <div className="embeddedPayoutBrand">
        <div className="embeddedBetaNotice"><b>PRIVATE BETA</b><span>Seller payout onboarding is being tested. In Preview, use Stripe sandbox/test information only and do not enter real banking or identity data for beta testing.</span></div>
        <span>SELLER PAYOUTS · STRIPE CONNECT</span>
        <h1>Only sellers need this setup.</h1>
        <p><strong>If you are only buying or paying another student, you do not need to complete this form.</strong> Buyers enter a card only at Aspire checkout after a real connection or marketplace order is ready.</p>
        <p>This page is only for people who want to <strong>receive earnings</strong>. Stripe directly collects and verifies the identity, tax and banking information needed to send seller payouts. Sensitive bank-account and KYC fields are handled inside Stripe&apos;s embedded component rather than stored in Aspire&apos;s application database.</p>
        <p>Aspire keeps limited payment records such as your Stripe account identifier, payout-readiness status, transaction amounts, release status and transfer identifiers so we can operate support, refunds, disputes and payout reconciliation.</p>
        <div className="embeddedPayoutBuyerExit"><a href="/connections">I only want to buy / pay → Back to Connections</a></div>
        <small>Stripe may request additional information when required for financial compliance. By continuing, you acknowledge Aspire&apos;s <a href="/privacy">Privacy Policy</a> and <a href="/terms">Terms</a>, and Stripe&apos;s own terms and privacy practices apply to information Stripe processes.</small>
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
