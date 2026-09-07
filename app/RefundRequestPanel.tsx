'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchMyRefundActivity, requestPaymentRefund, type RefundReason, type RefundRequest } from '../lib/supabase/refunds';

const reasons: Array<{ value: RefundReason; label: string }> = [
  { value: 'not_received', label: 'Item / delivery not received' },
  { value: 'not_as_described', label: 'Item not as described' },
  { value: 'service_not_completed', label: 'Service was not completed' },
  { value: 'wrong_charge', label: 'Wrong amount / payment issue' },
  { value: 'unsafe_or_cancelled', label: 'Unsafe situation or cancelled plan' },
  { value: 'other', label: 'Something else' }
];

function money(cents: number | null | undefined, currency = 'USD') {
  if (cents == null) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
}

function dateLabel(value: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

export default function RefundRequestPanel() {
  const [activity, setActivity] = useState<Awaited<ReturnType<typeof fetchMyRefundActivity>> | null>(null);
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [reason, setReason] = useState<RefundReason>('service_not_completed');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');

  const reload = useCallback(async () => {
    const next = await fetchMyRefundActivity();
    setActivity(next);
  }, []);

  useEffect(() => { void reload().catch((error) => setNotice(error instanceof Error ? error.message : 'Could not load refund activity.')); }, [reload]);

  const requestByPayment = useMemo(() => {
    const map = new Map<string, RefundRequest>();
    (activity?.requests ?? []).forEach((item) => { if (!map.has(item.payment_id)) map.set(item.payment_id, item); });
    return map;
  }, [activity]);

  if (!activity?.payments.length && !activity?.requests.length) return null;

  async function submit(connectionId: string) {
    setBusy(connectionId);
    setNotice('');
    try {
      await requestPaymentRefund(connectionId, reason, details);
      setOpenFor(null);
      setDetails('');
      setNotice('Refund request submitted. Aspire will review the payment and connection history before any money moves.');
      await reload();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not submit the refund request.');
    } finally { setBusy(''); }
  }

  return (
    <section className="refundRequests" aria-label="Refund requests">
      <header className="refundRequestsHead"><div><span>PAYMENT PROBLEMS</span><h2>Request a refund review.</h2></div><p>A refund request is not an automatic charge reversal. Aspire reviews protected payment status, completion / handoff events, and available evidence before deciding whether a Stripe refund can be created.</p></header>
      <div className="refundPolicyNote"><strong>Aspire Protected ≠ guaranteed refund.</strong><span>Marketplace before handoff: use <b>Cancel + refund</b> in the order. After handoff, after service starts, or after payout release: request review. Current beta review window is 7 days.</span><a href="/protection">Read the full protection rules →</a></div>
      {notice && <p className="refundNotice" role="status">{notice}</p>}
      <div className="refundList">
        {(activity?.payments ?? []).map((payment) => {
          const existing = requestByPayment.get(payment.id);
          const isMarketplace = payment.kind === 'buy_sell';
          const useMarketOrder = isMarketplace && payment.status === 'secured' && !['released','refunded'].includes(payment.marketplaceStatus || '');
          return <article key={payment.id}>
            <div className="refundTop"><div><span>{payment.category.toUpperCase()} · {payment.status.toUpperCase()}</span><h3>{payment.title}</h3><small>Paid {dateLabel(payment.paid_at)}{payment.released_at ? ` · payout released ${dateLabel(payment.released_at)}` : ''}</small></div><strong>{money(payment.customer_total_cents ?? payment.gross_amount_cents, payment.currency)}</strong></div>
            {existing ? <div className={`refundExisting status-${existing.status}`}><div><b>{existing.status.replace('_',' ').toUpperCase()}</b><strong>{reasons.find((item) => item.value === existing.reason)?.label || existing.reason}</strong><p>{existing.details}</p></div>{existing.resolution_note && <small>Reviewer note: {existing.resolution_note}</small>}</div> : useMarketOrder ? <div className="refundMarketRoute"><strong>Marketplace payment is still in the protected order flow.</strong><p>If the seller has not handed off the item, use <b>Cancel + refund</b>. If handoff has started or something is wrong, use <b>Report a problem</b> so seller payout is paused.</p><a href="/connections">Open marketplace order →</a></div> : openFor !== payment.id ? <div className="refundActions"><button type="button" onClick={() => { setOpenFor(payment.id); setDetails(''); setReason(isMarketplace ? 'not_as_described' : 'service_not_completed'); }}>Request refund / payment review →</button></div> : <div className="refundComposer"><label><span>What happened?</span><select value={reason} onChange={(event) => setReason(event.target.value as RefundReason)}>{reasons.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label><span>Details</span><textarea rows={4} value={details} onChange={(event) => setDetails(event.target.value)} maxLength={2000} placeholder="Keep it factual: what was agreed, what happened, and what resolution you are asking for." /></label><small>Submitting does not automatically withdraw money from the other student. A moderator reviews the case first.</small><div><button className="refundCancel" type="button" onClick={() => setOpenFor(null)}>Never mind</button><button className="button buttonGold" type="button" onClick={() => submit(payment.connection_id)} disabled={busy === payment.connection_id}>{busy === payment.connection_id ? 'Submitting…' : 'Submit for review →'}</button></div></div>}
          </article>;
        })}
      </div>
    </section>
  );
}
