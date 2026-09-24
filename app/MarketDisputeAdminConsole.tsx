'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import styles from './MarketDisputeAdminConsole.module.css';

type Dispute = {
  id: string;
  market_order_id: string;
  opened_by: string | null;
  source: 'user' | 'stripe_dispute' | 'stripe_radar';
  stripe_status: string | null;
  stripe_outcome: string | null;
  reason: string;
  details: string;
  status: string;
  resolution_note: string | null;
  assigned_to: string | null;
  reviewed_by: string | null;
  evidence_due_by: string | null;
  created_at: string;
  resolved_at: string | null;
};
type Order = { id: string; connection_id: string; request_id: string; buyer_id: string; seller_id: string; status: string; fulfillment_method: string; currency: string; agreed_amount_cents: number; seller_handed_off_at: string | null; buyer_received_at: string | null; shipping_status: string | null };
type Payment = { connection_id: string; status: string; currency: string; customer_total_cents: number | null; gross_amount_cents: number | null; provider_net_cents: number | null; stripe_livemode: boolean; transfer_recovery_status: string; transfer_recovery_error: string | null };
type Message = { id: string; dispute_id: string; author_id: string; audience: 'participants' | 'staff'; message_type: 'participant_reply' | 'staff_reply' | 'internal_note'; body: string; created_at: string };
type Profile = { id: string; display_name: string | null; full_name: string | null; name: string | null; username: string | null };
type Payload = { userId: string; role: 'moderator' | 'admin'; disputes: Dispute[]; orders: Order[]; payments: Payment[]; messages: Message[]; profiles: Profile[] };

async function authHeaders() {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session?.access_token) throw new Error('Sign in again to continue.');
  return { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' };
}

function money(cents: number | null | undefined, currency = 'USD') {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(cents || 0) / 100);
}

function when(value: string | null) {
  if (!value) return 'Not set';
  return new Date(value).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function MarketDisputeAdminConsole() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [showClosed, setShowClosed] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/market-disputes', { headers: await authHeaders(), cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'Could not load marketplace disputes.');
      setData(payload as Payload);
      setNotice('');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not load marketplace disputes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const orderMap = useMemo(() => new Map((data?.orders ?? []).map((item) => [item.id, item])), [data]);
  const paymentMap = useMemo(() => new Map((data?.payments ?? []).map((item) => [item.connection_id, item])), [data]);
  const profileMap = useMemo(() => new Map((data?.profiles ?? []).map((item) => [item.id, item])), [data]);
  const visible = useMemo(() => (data?.disputes ?? []).filter((item) => showClosed || ['open', 'under_review'].includes(item.status)), [data, showClosed]);

  function person(id: string | null) {
    if (!id) return 'Stripe / system';
    const profile = profileMap.get(id);
    return profile?.display_name || profile?.full_name || profile?.name || profile?.username || id.slice(0, 8);
  }

  async function queueAction(disputeId: string, action: 'assign_self' | 'staff_reply' | 'internal_note') {
    const message = (drafts[disputeId] || '').trim();
    if (action !== 'assign_self' && !message) return;
    setBusy(`${action}-${disputeId}`);
    setNotice('');
    try {
      const response = await fetch('/api/admin/market-disputes', {
        method: 'PATCH',
        headers: await authHeaders(),
        body: JSON.stringify({ disputeId, action, message })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'Could not update this dispute.');
      if (action !== 'assign_self') setDrafts((current) => ({ ...current, [disputeId]: '' }));
      setNotice(action === 'assign_self' ? 'Case assigned and marked under review.' : action === 'staff_reply' ? 'Reply sent to both participants.' : 'Internal note saved for staff only.');
      await reload();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not update this dispute.');
    } finally {
      setBusy('');
    }
  }

  async function resolve(dispute: Dispute, action: 'refund_buyer' | 'resume_seller') {
    const verb = action === 'refund_buyer' ? 'refund the buyer' : 'restore the seller payout flow';
    const note = window.prompt(`Reviewer note required to ${verb}:`, action === 'refund_buyer' ? 'Evidence supports a full buyer refund.' : 'Evidence does not support a buyer refund; resume the protected order flow.')?.trim() || '';
    if (note.length < 8) return;
    if (!window.confirm(`Confirm: ${verb}? This decision is recorded and both participants will see the outcome.`)) return;
    setBusy(`${action}-${dispute.id}`);
    setNotice('');
    try {
      const response = await fetch('/api/market/dispute/resolve', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ disputeId: dispute.id, action, note })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'Could not resolve this dispute.');
      setNotice(action === 'refund_buyer' ? 'Buyer refund recorded and payout stopped.' : 'Dispute closed and the protected seller flow was restored.');
      await reload();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not resolve this dispute.');
    } finally {
      setBusy('');
    }
  }

  if (loading && !data) return <section className={styles.section}><strong>Loading marketplace dispute queue…</strong></section>;
  if (!data && notice) return <section className={styles.section}><div className={styles.notice}>{notice}</div></section>;
  if (!data) return null;

  return (
    <section className={styles.section} aria-label="Marketplace dispute operations">
      <header className={styles.head}>
        <div><span>MARKETPLACE OPERATIONS</span><h2>Refunds &amp; disputes</h2><p>Assign cases, collect both sides’ replies, preserve internal notes, and make a recorded financial decision. Stripe-originated disputes remain human-reviewed.</p></div>
        <button type="button" onClick={() => setShowClosed((value) => !value)}>{showClosed ? 'Open cases only' : 'Include closed cases'}</button>
      </header>
      {notice && <div className={styles.notice} role="status">{notice}</div>}
      {!visible.length ? <div className={styles.empty}>✓ No marketplace disputes need action.</div> : (
        <div className={styles.list}>
          {visible.map((dispute) => {
            const order = orderMap.get(dispute.market_order_id);
            const payment = order ? paymentMap.get(order.connection_id) : undefined;
            const messages = data.messages.filter((item) => item.dispute_id === dispute.id);
            const open = ['open', 'under_review'].includes(dispute.status);
            return (
              <article className={styles.card} key={dispute.id}>
                <div className={styles.top}>
                  <div><span>{dispute.source.replace('_', ' ').toUpperCase()} · {dispute.reason.replaceAll('_', ' ').toUpperCase()}</span><h3>Case #{dispute.id.slice(0, 8).toUpperCase()}</h3></div>
                  <strong>{money(payment?.customer_total_cents ?? payment?.gross_amount_cents ?? order?.agreed_amount_cents, payment?.currency || order?.currency || 'USD')}</strong>
                </div>
                <div className={styles.facts}>
                  <span><b>Status</b>{dispute.status.replace('_', ' ')}</span><span><b>Order</b>{order?.status || 'Unavailable'}</span><span><b>Payment</b>{payment?.status || 'None'}</span><span><b>Mode</b>{payment ? payment.stripe_livemode ? 'Live' : 'Sandbox' : '—'}</span>
                  <span><b>Buyer</b>{person(order?.buyer_id || null)}</span><span><b>Seller</b>{person(order?.seller_id || null)}</span><span><b>Assigned</b>{person(dispute.assigned_to)}</span><span><b>Opened</b>{when(dispute.created_at)}</span>
                </div>
                {dispute.evidence_due_by && <div className={styles.deadline}><b>Stripe evidence due</b><span>{when(dispute.evidence_due_by)}</span></div>}
                {(dispute.stripe_status || dispute.stripe_outcome) && <div className={styles.stripe}>Stripe: {[dispute.stripe_status, dispute.stripe_outcome].filter(Boolean).join(' · ')}</div>}
                <p className={styles.details}>{dispute.details}</p>
                {payment?.transfer_recovery_status === 'manual_required' && <div className={styles.warning}><b>Manual transfer recovery required</b><span>{payment.transfer_recovery_error || 'Review the seller transfer in Stripe before closing this case.'}</span></div>}
                <div className={styles.thread}>
                  <b>CASE LOG</b>
                  {!messages.length ? <p>No replies or internal notes yet.</p> : messages.map((message) => <article className={message.audience === 'staff' ? styles.internal : message.message_type === 'staff_reply' ? styles.staff : ''} key={message.id}><div><strong>{message.audience === 'staff' ? 'Internal note' : message.message_type === 'staff_reply' ? 'Aspire reply' : person(message.author_id)}</strong><time>{when(message.created_at)}</time></div><p>{message.body}</p></article>)}
                </div>
                {open && <div className={styles.composer}><label htmlFor={`admin-dispute-${dispute.id}`}>Reply or leave a staff note</label><textarea id={`admin-dispute-${dispute.id}`} rows={3} maxLength={2000} value={drafts[dispute.id] || ''} onChange={(event) => setDrafts((current) => ({ ...current, [dispute.id]: event.target.value }))} placeholder="Write a factual update. Internal notes are never shown to participants." /><div><button type="button" onClick={() => void queueAction(dispute.id, 'assign_self')} disabled={busy === `assign_self-${dispute.id}`}>Assign to me</button><button type="button" onClick={() => void queueAction(dispute.id, 'internal_note')} disabled={!drafts[dispute.id]?.trim() || busy === `internal_note-${dispute.id}`}>Save internal note</button><button className={styles.reply} type="button" onClick={() => void queueAction(dispute.id, 'staff_reply')} disabled={!drafts[dispute.id]?.trim() || busy === `staff_reply-${dispute.id}`}>Reply to both sides</button></div></div>}
                {open && data.role === 'admin' && <div className={styles.decisions}><button type="button" onClick={() => void resolve(dispute, 'resume_seller')} disabled={busy.includes(dispute.id)}>Close for seller</button><button className={styles.refund} type="button" onClick={() => void resolve(dispute, 'refund_buyer')} disabled={busy.includes(dispute.id)}>Refund buyer</button></div>}
                {open && data.role !== 'admin' && <small className={styles.adminOnly}>Moderators can investigate and reply; only an admin can move money or close the financial outcome.</small>}
                {!open && <div className={styles.closed}><b>{dispute.status.replace('_', ' ')}</b><span>{dispute.resolution_note || 'Outcome recorded by Aspire.'}</span><small>{when(dispute.resolved_at)}</small></div>}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
