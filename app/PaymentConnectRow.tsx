'use client';

import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabase/client';

type PaymentStatus = 'NOT_STARTED' | 'ACTION_REQUIRED' | 'UNDER_REVIEW' | 'READY' | 'RESTRICTED';

type StatusResponse = {
  status: PaymentStatus;
  transfersEnabled?: boolean;
  requirementsDue?: number;
  error?: string;
  code?: string;
};

const copy: Record<PaymentStatus, { title: string; detail: string; action: string }> = {
  NOT_STARTED: { title: 'Payments & earnings', detail: 'Set up Stripe before you receive money.', action: 'Start setup' },
  ACTION_REQUIRED: { title: 'Finish payout setup', detail: 'Stripe still needs information from you.', action: 'Continue' },
  UNDER_REVIEW: { title: 'Payout identity under review', detail: 'Stripe is reviewing your payout account.', action: 'Check again' },
  READY: { title: 'Payments ready ✓', detail: 'Your account can receive Aspire payouts through Stripe.', action: 'Manage payouts' },
  RESTRICTED: { title: 'Payout action required', detail: 'Stripe needs an update before payouts can continue.', action: 'Fix setup' }
};

async function authHeaders() {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sign in again to continue.');
  return { Authorization: `Bearer ${token}` };
}

function paymentError(payload: { error?: string; code?: string }, fallback: string) {
  if (payload.code?.startsWith('MISSING_ENV:')) {
    return 'Stripe payments are still being connected to this deployment.';
  }
  return payload.error || fallback;
}

export default function PaymentConnectRow({ phoneVerified, schoolVerified }: { phoneVerified: boolean; schoolVerified: boolean }) {
  const [status, setStatus] = useState<PaymentStatus>('NOT_STARTED');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function refresh() {
    setMessage('');
    try {
      const headers = await authHeaders();
      const response = await fetch('/api/stripe/connect/status', { headers, cache: 'no-store' });
      const payload = await response.json() as StatusResponse;
      if (!response.ok) throw new Error(paymentError(payload, 'Could not check payout status.'));
      setStatus(payload.status);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not check payout status.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    if (typeof window !== 'undefined') {
      const state = new URLSearchParams(window.location.search).get('payments');
      if (state === 'return') setMessage('Welcome back. Checking your Stripe setup…');
      if (state === 'refresh') setMessage('That Stripe link expired. You can create a fresh one here.');
    }
  }, []);

  async function openDashboard() {
    setBusy(true);
    setMessage('');
    try {
      const headers = await authHeaders();
      const response = await fetch('/api/stripe/connect/dashboard', { method: 'POST', headers });
      const payload = await response.json() as { url?: string; error?: string; code?: string };
      if (!response.ok || !payload.url) throw new Error(paymentError(payload, 'Could not open your payout dashboard.'));
      window.location.assign(payload.url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not open your payout dashboard.');
      setBusy(false);
    }
  }

  async function openStripe() {
    if (status === 'READY') {
      await openDashboard();
      return;
    }
    if (!schoolVerified) {
      setMessage('Verify your school identity before setting up payouts.');
      return;
    }
    if (!phoneVerified) {
      setMessage('Verify your phone before setting up payouts.');
      return;
    }
    if (status === 'UNDER_REVIEW') {
      setLoading(true);
      await refresh();
      return;
    }

    setBusy(true);
    setMessage('');
    try {
      const headers = await authHeaders();
      const response = await fetch('/api/stripe/connect/onboard', { method: 'POST', headers });
      const payload = await response.json() as { url?: string; error?: string; code?: string };
      if (!response.ok || !payload.url) throw new Error(paymentError(payload, 'Could not open Stripe onboarding.'));
      window.location.assign(payload.url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not open Stripe onboarding.');
      setBusy(false);
    }
  }

  const state = copy[status];

  return (
    <div className={`profileMenuRow paymentConnectRow payment-${status.toLowerCase()}`}>
      <i>$</i>
      <div>
        <strong>{loading ? 'Checking payments…' : state.title}</strong>
        <span>{loading ? 'Syncing Stripe status' : state.detail}</span>
        {message && <small className="paymentConnectMessage" role="status">{message}</small>}
      </div>
      <button type="button" onClick={openStripe} disabled={loading || busy}>
        {busy ? 'Opening…' : loading ? '…' : state.action}
      </button>
    </div>
  );
}
