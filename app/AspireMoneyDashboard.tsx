'use client';

import { useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabase/client';

type MoneyTransaction = {
  id: string;
  connectionId: string;
  requestId: string;
  title: string;
  category: string;
  kind: string | null;
  campus: string | null;
  role: 'payer' | 'payee';
  status: string;
  currency: string;
  baseAmountCents: number | null;
  customerTotalCents: number;
  providerNetCents: number;
  requesterFeeCents: number;
  providerFeeCents: number;
  transferReference: string | null;
  paidAt: string | null;
  releasedAt: string | null;
  refundedAt: string | null;
  disputedAt: string | null;
  updatedAt: string;
};

type MoneyResponse = {
  payout: {
    status: string;
    transfersEnabled: boolean;
    requirementsDue: number;
    lastSyncedAt: string | null;
  };
  summary: {
    pendingIncomingCents: number;
    releasedIncomingCents: number;
    disputedIncomingCents: number;
    protectedOutgoingCents: number;
    completedOutgoingCents: number;
    refundedOutgoingCents: number;
    feesPaidCents: number;
  };
  transactions: MoneyTransaction[];
};

function money(cents: number, currency = 'USD') {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format((cents || 0) / 100);
}

function when(value: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function statusCopy(status: string, role: 'payer' | 'payee') {
  if (status === 'secured') return role === 'payee' ? 'Pending release' : 'Payment protected';
  if (status === 'released') return role === 'payee' ? 'Released to Stripe' : 'Completed';
  if (status === 'refunded') return 'Refunded';
  if (status === 'disputed') return 'Under review';
  if (status === 'processing') return 'Processing';
  if (status === 'checkout_created') return 'Checkout opened';
  if (status === 'failed') return 'Payment failed';
  if (status === 'cancelled') return 'Cancelled';
  return status.replaceAll('_', ' ');
}

async function bearerHeaders() {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error('Sign in again to view Aspire Money.');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

export default function AspireMoneyDashboard() {
  const [data, setData] = useState<MoneyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  async function load() {
    setLoading(true);
    setNotice('');
    try {
      const headers = await bearerHeaders();
      const response = await fetch('/api/stripe/money/summary', { headers, cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'Could not load Aspire Money.');
      setData(payload as MoneyResponse);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not load Aspire Money.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const primaryCurrency = useMemo(() => data?.transactions[0]?.currency || 'USD', [data]);

  async function managePayouts() {
    if (!data?.payout.transfersEnabled) {
      window.location.assign('/profile');
      return;
    }
    setBusy(true);
    setNotice('');
    try {
      const headers = await bearerHeaders();
      const response = await fetch('/api/stripe/connect/dashboard', { method: 'POST', headers });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.url) throw new Error(payload?.error || 'Could not open Stripe payouts.');
      window.location.assign(payload.url);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not open Stripe payouts.');
      setBusy(false);
    }
  }

  if (loading) {
    return <section className="aspireMoneyLoading"><span /><span /><span /></section>;
  }

  return (
    <section className="aspireMoneyDashboard">
      <header className="aspireMoneyHero">
        <div>
          <p>ASPIRE MONEY · STRIPE CONNECT</p>
          <h1>Payments in.<br /><em>Payouts out.</em></h1>
          <span>See what is protected, what is waiting for completion, and what Aspire has released to your Stripe payout account.</span>
        </div>
        <div className={`aspireMoneyPayout payout-${(data?.payout.status || 'NOT_STARTED').toLowerCase()}`}>
          <span>PAYOUT ACCOUNT</span>
          <strong>{data?.payout.transfersEnabled ? 'Ready to receive ✓' : data?.payout.status === 'NOT_STARTED' ? 'Not set up' : 'Needs attention'}</strong>
          <small>{data?.payout.transfersEnabled ? 'Stripe transfers are enabled.' : 'Finish Stripe payout setup before receiving money.'}</small>
          <button type="button" onClick={managePayouts} disabled={busy}>{busy ? 'Opening…' : data?.payout.transfersEnabled ? 'Manage payouts →' : 'Set up payouts →'}</button>
        </div>
      </header>

      {notice && <div className="aspireMoneyNotice" role="status">{notice}</div>}

      <div className="aspireMoneyStats">
        <article><span>PENDING RELEASE</span><strong>{money(data?.summary.pendingIncomingCents || 0, primaryCurrency)}</strong><small>Buyer paid; waiting for the required completion or receipt confirmation.</small></article>
        <article><span>RELEASED TO STRIPE</span><strong>{money(data?.summary.releasedIncomingCents || 0, primaryCurrency)}</strong><small>Aspire created the seller/provider transfer to your connected Stripe account.</small></article>
        <article><span>YOUR PROTECTED PAYMENTS</span><strong>{money(data?.summary.protectedOutgoingCents || 0, primaryCurrency)}</strong><small>Money you paid that is secured but not yet released to the other person.</small></article>
        <article><span>REFUNDED TO YOU</span><strong>{money(data?.summary.refundedOutgoingCents || 0, primaryCurrency)}</strong><small>Protected payments marked refunded.</small></article>
      </div>

      {(data?.summary.disputedIncomingCents || 0) > 0 && <div className="aspireMoneyHold"><b>!</b><div><strong>{money(data?.summary.disputedIncomingCents || 0, primaryCurrency)} under review</strong><span>Disputed money is not treated as available earnings while the case is open.</span></div></div>}

      <section className="aspireMoneyActivity">
        <div className="aspireMoneySectionHead"><div><p>TRANSACTION ACTIVITY</p><h2>Your Aspire money trail.</h2></div><a href="/connections">Open Connections →</a></div>
        {!data?.transactions.length ? (
          <div className="aspireMoneyEmpty"><strong>No protected transactions yet.</strong><span>When you pay or earn through Aspire, the status will appear here.</span></div>
        ) : (
          <div className="aspireMoneyList">
            {data.transactions.map((item) => {
              const amount = item.role === 'payee' ? item.providerNetCents : item.customerTotalCents;
              const isIncoming = item.role === 'payee';
              return <article key={item.id}>
                <div className="aspireMoneyTxnMain">
                  <i>{isIncoming ? '↓' : '↑'}</i>
                  <div><span>{item.category.toUpperCase()} · {isIncoming ? 'INCOMING' : 'OUTGOING'}</span><strong>{item.title}</strong><small>{item.campus || 'Aspire campus'} · updated {when(item.updatedAt)}</small></div>
                </div>
                <div className="aspireMoneyTxnStatus"><b className={`moneyStatus status-${item.status}`}>{statusCopy(item.status, item.role)}</b>{item.transferReference && <small>Transfer ·••{item.transferReference}</small>}</div>
                <div className={`aspireMoneyTxnAmount ${isIncoming ? 'incoming' : 'outgoing'}`}><strong>{isIncoming ? '+' : '−'}{money(amount, item.currency)}</strong><small>{isIncoming ? `Net after ${money(item.providerFeeCents, item.currency)} Aspire fee` : `Includes ${money(item.requesterFeeCents, item.currency)} Aspire fee`}</small></div>
              </article>;
            })}
          </div>
        )}
      </section>

      <footer className="aspireMoneyFinePrint">
        <strong>Aspire Money is a transaction view, not a bank account or stored-value wallet.</strong>
        <span>Stripe processes buyer payments and connected-account payouts. “Released to Stripe” means Aspire created a Stripe transfer to the recipient’s connected account; the timing of a later bank deposit depends on Stripe and the recipient’s payout settings.</span>
      </footer>
    </section>
  );
}
