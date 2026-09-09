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
  NOT_STARTED: { title: 'Seller payouts', detail: 'Only set this up if you plan to receive money. Buyers add a card only when they check out.', action: 'Set up seller payouts' },
  ACTION_REQUIRED: { title: 'Finish seller payout setup', detail: 'Stripe still needs information before you can receive seller earnings.', action: 'Continue seller setup' },
  UNDER_REVIEW: { title: 'Seller payout review', detail: 'Stripe is reviewing the information needed for you to receive earnings.', action: 'Check again' },
  READY: { title: 'Seller payouts ready ✓', detail: 'You can receive Aspire seller payouts. Buyer checkout still requires no advance setup.', action: 'Manage seller payouts' },
  RESTRICTED: { title: 'Seller payout action required', detail: 'Stripe needs an update before you can receive seller earnings.', action: 'Fix seller setup' }
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
    return 'Payments are still being connected to this deployment.';
  }
  return payload.error || fallback;
}

export default function PaymentConnectRow({ phoneVerified: _phoneVerified, schoolVerified }: { phoneVerified: boolean; schoolVerified: boolean }) {
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
      if (state === 'return') setMessage('Welcome back. Checking your seller payout setup…');
      if (state === 'refresh') setMessage('Your seller payout setup session expired. You can continue here.');
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

  async function openPayoutSetup() {
    if (status === 'READY') {
      await openDashboard();
      return;
    }
    if (!schoolVerified) {
      setMessage('Verify your school identity before setting up seller payouts.');
      return;
    }
    if (status === 'UNDER_REVIEW') {
      setLoading(true);
      await refresh();
      return;
    }

    setBusy(true);
    window.location.assign('/payments/setup');
  }

  const state = copy[status];

  return (
    <div className={`profileMenuRow paymentConnectRow payment-${status.toLowerCase()}`}>
      <i>$</i>
      <div>
        <strong>{loading ? 'Checking seller payouts…' : state.title}</strong>
        <span>{loading ? 'Syncing seller payout status' : state.detail}</span>
        <a className="paymentMoneyLink" href="/money">View Aspire Money →</a>
        {message && <small className="paymentConnectMessage" role="status">{message}</small>}
      </div>
      <button type="button" onClick={openPayoutSetup} disabled={loading || busy}>
        {busy ? 'Opening…' : loading ? '…' : state.action}
      </button>
    </div>
  );
}
