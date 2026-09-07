'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabase/client';

type QueueItem = {
  id: string;
  reason: string;
  details: string;
  status: string;
  created_at: string;
  payment_status: string | null;
  customer_total_cents: number | null;
  provider_net_cents: number | null;
  currency: string;
  payout_released: boolean;
  title: string;
  category: string;
  kind: string | null;
  campus: string | null;
};

const reasonLabel: Record<string,string> = {
  not_received: 'Item / delivery not received',
  not_as_described: 'Item not as described',
  service_not_completed: 'Service not completed',
  wrong_charge: 'Wrong amount / payment issue',
  unsafe_or_cancelled: 'Unsafe situation or cancelled plan',
  other: 'Other payment problem'
};

function money(cents: number | null, currency = 'USD') {
  if (cents == null) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
}

async function authHeaders() {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sign in again.');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

export default function RefundReviewPanel() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [notes, setNotes] = useState<Record<string,string>>({});
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [allowed, setAllowed] = useState(true);

  const reload = useCallback(async () => {
    const headers = await authHeaders();
    const response = await fetch('/api/stripe/refunds/review', { headers, cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 403) { setAllowed(false); return; }
    if (!response.ok) throw new Error(payload?.error || 'Could not load refund queue.');
    setItems(payload.refunds || []);
  }, []);

  useEffect(() => { void reload().catch((error) => setNotice(error instanceof Error ? error.message : 'Could not load refund queue.')); }, [reload]);

  if (!allowed) return null;

  async function decide(item: QueueItem, action: 'approve' | 'deny') {
    const note = (notes[item.id] || '').trim();
    if (note.length < 4) return setNotice('Add a short reviewer note before making a refund decision.');
    if (action === 'approve' && !window.confirm(item.payout_released
      ? 'Approve a FULL refund? Aspire will first try to reverse the seller/provider Stripe transfer, then refund the payer. Continue?'
      : 'Approve a FULL refund to the payer through Stripe? Continue?')) return;
    if (action === 'deny' && !window.confirm('Deny this refund request and save your reviewer note?')) return;

    setBusy(`${action}-${item.id}`);
    setNotice('');
    try {
      const headers = await authHeaders();
      const response = await fetch('/api/stripe/refunds/review', {
        method: 'POST', headers,
        body: JSON.stringify({ refundRequestId: item.id, action, note })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'Could not finish refund review.');
      setNotice(action === 'approve' ? 'Refund processed through Stripe ✓' : 'Refund request denied.');
      await reload();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not finish refund review.');
    } finally { setBusy(''); }
  }

  return (
    <section className="refundReview">
      <header><div><span>PAYMENT REVIEW QUEUE</span><h2>Refund decisions stay human.</h2></div><p>Review the transaction facts before moving money. Approve currently means a full Stripe refund. If a seller/provider transfer was already released, Aspire attempts to reverse that transfer first.</p></header>
      <div className="refundReviewWarning"><strong>No AI auto-refunds.</strong><span>Aspire Intelligence can summarize disputes, but refund approval and denial remain moderator actions. Do not approve based on a risk score alone.</span></div>
      {notice && <p className="refundReviewNotice" role="status">{notice}</p>}
      {!items.length ? <div className="refundReviewEmpty">No open payment refund requests.</div> : <div className="refundReviewList">{items.map((item) => <article key={item.id}>
        <div className="refundReviewTop"><div><span>{item.category.toUpperCase()} · {item.payment_status?.toUpperCase() || 'PAYMENT'} · {item.campus || 'CAMPUS'}</span><h3>{item.title}</h3><small>{reasonLabel[item.reason] || item.reason} · request #{item.id.slice(0,8)}</small></div><div><strong>{money(item.customer_total_cents,item.currency)}</strong><small>{item.payout_released ? `Payout released · ${money(item.provider_net_cents,item.currency)} provider net` : 'Payout not released'}</small></div></div>
        <blockquote>{item.details}</blockquote>
        <label><span>Reviewer note</span><textarea rows={3} value={notes[item.id] || ''} onChange={(event) => setNotes((current) => ({...current,[item.id]:event.target.value}))} placeholder="What evidence did you review, and why are you approving or denying the request?" maxLength={1500} /></label>
        <div className="refundReviewActions"><button type="button" className="refundDeny" onClick={() => decide(item,'deny')} disabled={Boolean(busy)}>Deny refund</button><button type="button" className="button buttonGold" onClick={() => decide(item,'approve')} disabled={Boolean(busy)}>{busy === `approve-${item.id}` ? 'Processing Stripe…' : 'Approve full refund →'}</button></div>
      </article>)}</div>}
    </section>
  );
}
