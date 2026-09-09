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

const receiveCopy: Record<PaymentStatus, { detail: string; action: string }> = {
  NOT_STARTED: { detail: 'Receiving is optional until you want money sent to you.', action: 'Set up receiving' },
  ACTION_REQUIRED: { detail: 'Receiving setup is incomplete. You can still buy and pay normally.', action: 'Finish setup' },
  UNDER_REVIEW: { detail: 'Stripe is reviewing your receiving setup. You can still buy and pay normally.', action: 'Check status' },
  READY: { detail: 'Receiving is ready ✓ You can both pay and receive with this Aspire account.', action: 'Manage payouts' },
  RESTRICTED: { detail: 'Receiving setup needs more information. Buying and checkout are not affected.', action: 'Finish setup' }
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
      if (!response.ok) throw new Error(paymentError(payload, 'Could not check receiving status.'));
      setStatus(payload.status);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not check receiving status.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    if (typeof window !== 'undefined') {
      const state = new URLSearchParams(window.location.search).get('payments');
      if (state === 'return') setMessage('Welcome back. Checking your receiving setup…');
      if (state === 'refresh') setMessage('Your receiving setup session expired. You can continue here.');
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
      setMessage('Verify your school identity before setting up receiving.');
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

  const receiveState = receiveCopy[status];

  return (
    <div className={`profileMenuRow paymentConnectRow payment-${status.toLowerCase()}`}>
      <i>$</i>
      <div>
        <strong>{loading ? 'Checking payments…' : 'Payments'}</strong>
        <span>One Aspire account can both pay and receive. Add a card or wallet only when you check out; set up a payout account only when you want to receive money.</span>
        <small className="paymentConnectMessage">{loading ? 'Checking receiving status…' : receiveState.detail}</small>
        <a className="paymentMoneyLink" href="/money">View Aspire Money →</a>
        {message && <small className="paymentConnectMessage" role="status">{message}</small>}
      </div>
      <button type="button" onClick={openPayoutSetup} disabled={loading || busy}>
        {busy ? 'Opening…' : loading ? '…' : receiveState.action}
      </button>
    </div>
  );
}
