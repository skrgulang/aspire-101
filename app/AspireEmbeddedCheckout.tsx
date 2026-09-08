'use client';

import { useCallback } from 'react';
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { getSupabaseBrowserClient } from '../lib/supabase/client';

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

async function authHeaders() {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sign in again to continue.');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

export default function AspireEmbeddedCheckout({ connectionId }: { connectionId: string }) {
  const fetchClientSecret = useCallback(async () => {
    const headers = await authHeaders();
    const response = await fetch('/api/stripe/payment/embedded', {
      method: 'POST',
      headers,
      body: JSON.stringify({ connectionId })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.clientSecret) {
      throw new Error(payload?.error || 'Could not start Aspire payment.');
    }
    return payload.clientSecret as string;
  }, [connectionId]);

  if (!publishableKey || !stripePromise) {
    return (
      <div className="embeddedStripeError">
        <strong>Embedded payments need one more deployment setting.</strong>
        <p>Add NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY to this Vercel environment, then redeploy.</p>
        <a href="/connections">Back to Connections</a>
      </div>
    );
  }

  return (
    <div className="embeddedCheckoutShell">
      <div className="embeddedCheckoutBrand">
        <span>PAY WITH ASPIRE</span>
        <h1>Secure payment, without leaving Aspire.</h1>
        <p>Stripe handles the sensitive card fields in the background. Aspire never stores your raw card number.</p>
      </div>
      <div className="embeddedCheckoutFrame">
        <EmbeddedCheckoutProvider
          stripe={stripePromise}
          options={{
            fetchClientSecret,
            onComplete: () => {
              window.location.assign(`/connections?payment=success&connection=${encodeURIComponent(connectionId)}`);
            }
          }}
        >
          <EmbeddedCheckout />
        </EmbeddedCheckoutProvider>
      </div>
    </div>
  );
}
