'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import styles from './MarketDisputeAdminConsole.module.css';

type Dispute = {
  id: string;
  market_order_id: string;
  opened_by: string | null;
  source: 'user' | 'stripe_dispute' | 'stripe_radar';
  stripe_case_id: string | null;
  stripe_status: string | null;
  stripe_outcome: string | null;
  reason: string;
  details: string;
  status: string;
  resolution_note: string | null;
  assigned_to: string | null;
  reviewed_by: string | null;
  evidence_due_by: string | null;
  next_action_due_at: string | null;
  escalation_level: number;
  created_at: string;
  resolved_at: string | null;
};
type Order = { id: string; connection_id: string; request_id: string; buyer_id: string; seller_id: string; status: string; fulfillment_method: string; currency: string; agreed_amount_cents: number; seller_handed_off_at: string | null; buyer_received_at: string | null; admin_release_authorized_at: string | null; shipping_status: string | null };
type Payment = { connection_id: string; status: string; currency: string; customer_total_cents: number | null; gross_amount_cents: number | null; provider_net_cents: number | null; platform_fee_cents: number | null; refunded_total_cents: number | null; stripe_livemode: boolean; transfer_recovery_status: string; transfer_recovery_error: string | null };
type Message = { id: string; dispute_id: string; author_id: string; audience: 'participants' | 'staff'; message_type: 'participant_reply' | 'staff_reply' | 'internal_note'; body: string; created_at: string };
type Attachment = { id: string; dispute_id: string; uploaded_by: string; file_name: string; mime_type: string; size_bytes: number; audience: 'participants' | 'staff'; created_at: string; url: string | null };
type Profile = { id: string; display_name: string | null; full_name: string | null; name: string | null; username: string | null };
type Payload = { userId: string; role: 'moderator' | 'admin'; disputes: Dispute[]; orders: Order[]; payments: Payment[]; messages: Message[]; attachments: Attachment[]; profiles: Profile[] };

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
  const [refundAmounts, setRefundAmounts] = useState<Record<string, string>>({});
  const [stripeEvidenceDrafts, setStripeEvidenceDrafts] = useState<Record<string, string>>({});
  const [stripeEvidenceFiles, setStripeEvidenceFiles] = useState<Record<string, string>>({});
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

  async function resolve(dispute: Dispute, action: 'refund_buyer' | 'resume_seller', amountCents?: number) {
    const partial = action === 'refund_buyer' && typeof amountCents === 'number';
    const verb = action === 'refund_buyer' ? partial ? `issue a ${money(amountCents)} partial refund` : 'refund the buyer in full' : 'authorize the seller release';
    const note = window.prompt(`Reviewer note required to ${verb}:`, action === 'refund_buyer' ? partial ? 'Evidence supports a partial buyer refund and adjusted seller release.' : 'Evidence supports a full buyer refund.' : 'Evidence supports the seller; authorize the protected release.')?.trim() || '';
    if (note.length < 8) return;
    if (!window.confirm(`Confirm: ${verb}? This decision is recorded and both participants will see the outcome.`)) return;
    setBusy(`${action}-${dispute.id}`);
    setNotice('');
    try {
      const response = await fetch('/api/market/dispute/resolve', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ disputeId: dispute.id, action, note, amountCents })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'Could not resolve this dispute.');
      setNotice(action === 'refund_buyer' ? partial ? 'Partial refund recorded and seller release adjusted.' : 'Full buyer refund recorded and seller transfer stopped.' : 'Evidence decision recorded and seller release authorized.');
      await reload();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not resolve this dispute.');
    } finally {
      setBusy('');
    }
  }

  async function sendStripeEvidence(dispute: Dispute, submit: boolean) {
    const statement = (stripeEvidenceDrafts[dispute.id] || '').trim();
    if (statement.length < 20) return;
    if (submit && !window.confirm('Submit this evidence to Stripe now? Final submission can prevent later edits in Stripe.')) return;
    setBusy(`stripe-evidence-${dispute.id}`);
    setNotice('');
    try {
      const response = await fetch('/api/admin/market-disputes/stripe-evidence', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ disputeId: dispute.id, statement, attachmentId: stripeEvidenceFiles[dispute.id] || null, submit })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'Could not update Stripe evidence.');
      setNotice(submit ? 'Evidence package submitted to Stripe and recorded in the case log.' : 'Evidence draft saved to Stripe and recorded in the case log.');
      await reload();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not update Stripe evidence.');
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
            const attachments = data.attachments.filter((item) => item.dispute_id === dispute.id);
            const open = ['open', 'under_review'].includes(dispute.status);
            const total = Number(payment?.customer_total_cents ?? payment?.gross_amount_cents ?? 0);
            const refunded = Number(payment?.refunded_total_cents ?? 0);
            const remaining = Math.max(0, total - refunded);
            const partialCents = Math.round(Number(refundAmounts[dispute.id] || 0) * 100);
            return (
              <article className={styles.card} key={dispute.id}>
                <div className={styles.top}>
                  <div><span>{dispute.source.replace('_', ' ').toUpperCase()} · {dispute.reason.replaceAll('_', ' ').toUpperCase()}</span><h3>Case #{dispute.id.slice(0, 8).toUpperCase()}</h3></div>
                  <strong>{money(payment?.customer_total_cents ?? payment?.gross_amount_cents ?? order?.agreed_amount_cents, payment?.currency || order?.currency || 'USD')}</strong>
                </div>
                <div className={styles.facts}>
                  <span><b>Status</b>{dispute.status.replace('_', ' ')}</span><span><b>Order</b>{order?.status || 'Unavailable'}</span><span><b>Payment</b>{payment?.status || 'None'}</span><span><b>Mode</b>{payment ? payment.stripe_livemode ? 'Live' : 'Sandbox' : '—'}</span>
                  <span><b>Buyer</b>{person(order?.buyer_id || null)}</span><span><b>Seller</b>{person(order?.seller_id || null)}</span><span><b>Assigned</b>{person(dispute.assigned_to)}</span><span><b>Opened</b>{when(dispute.created_at)}</span>
                  <span><b>Already refunded</b>{money(refunded, payment?.currency)}</span><span><b>Refundable</b>{money(remaining, payment?.currency)}</span><span><b>Seller release</b>{money(payment?.provider_net_cents, payment?.currency)}</span><span><b>Buyer confirmed</b>{order?.buyer_received_at ? when(order.buyer_received_at) : 'No'}</span>
                </div>
                {dispute.evidence_due_by && <div className={styles.deadline}><b>Stripe evidence due</b><span>{when(dispute.evidence_due_by)}</span></div>}
                {open && dispute.next_action_due_at && <div className={styles.deadline}><b>{dispute.escalation_level > 0 ? `Escalated · level ${dispute.escalation_level}` : 'Next review due'}</b><span>{when(dispute.next_action_due_at)}</span></div>}
                {(dispute.stripe_status || dispute.stripe_outcome) && <div className={styles.stripe}>Stripe: {[dispute.stripe_status, dispute.stripe_outcome].filter(Boolean).join(' · ')}</div>}
                <p className={styles.details}>{dispute.details}</p>
                {payment?.transfer_recovery_status === 'manual_required' && <div className={styles.warning}><b>Manual transfer recovery required</b><span>{payment.transfer_recovery_error || 'Review the seller transfer in Stripe before closing this case.'}</span></div>}
                <div className={styles.thread}>
                  <b>CASE LOG</b>
                  {!messages.length ? <p>No replies or internal notes yet.</p> : messages.map((message) => <article className={message.audience === 'staff' ? styles.internal : message.message_type === 'staff_reply' ? styles.staff : ''} key={message.id}><div><strong>{message.audience === 'staff' ? 'Internal note' : message.message_type === 'staff_reply' ? 'Aspire reply' : person(message.author_id)}</strong><time>{when(message.created_at)}</time></div><p>{message.body}</p></article>)}
                </div>
                {!!attachments.length && <div className={styles.evidence}><b>PARTICIPANT EVIDENCE</b><div>{attachments.map((item) => <a href={item.url || undefined} target="_blank" rel="noreferrer" aria-disabled={!item.url} key={item.id}><strong>{item.mime_type === 'application/pdf' ? 'PDF' : 'PHOTO'}</strong><span>{item.file_name}</span><small>{person(item.uploaded_by)} · {Math.max(1, Math.round(item.size_bytes / 1024))} KB</small></a>)}</div></div>}
                {open && data.role === 'admin' && dispute.source === 'stripe_dispute' && <div className={styles.stripeEvidence}><b>STRIPE EVIDENCE RESPONSE</b><p>Use factual order and handoff details. Save a draft first; only use final submit after checking the deadline and attachment.</p><textarea rows={5} maxLength={5000} value={stripeEvidenceDrafts[dispute.id] || ''} onChange={(event) => setStripeEvidenceDrafts((current) => ({ ...current, [dispute.id]: event.target.value }))} placeholder="Describe the item, payment, meetup or delivery, messages, and why the charge is valid." /><label><span>Attach one file to Stripe (optional)</span><select value={stripeEvidenceFiles[dispute.id] || ''} onChange={(event) => setStripeEvidenceFiles((current) => ({ ...current, [dispute.id]: event.target.value }))}><option value="">No attachment</option>{attachments.filter((item) => item.mime_type !== 'image/webp' && item.size_bytes <= 5 * 1024 * 1024).map((item) => <option value={item.id} key={item.id}>{item.file_name}</option>)}</select></label><div><button type="button" onClick={() => void sendStripeEvidence(dispute, false)} disabled={busy.includes(dispute.id) || (stripeEvidenceDrafts[dispute.id] || '').trim().length < 20}>Save Stripe draft</button><button className={styles.refund} type="button" onClick={() => void sendStripeEvidence(dispute, true)} disabled={busy.includes(dispute.id) || (stripeEvidenceDrafts[dispute.id] || '').trim().length < 20}>Submit final evidence</button></div></div>}
                {open && <div className={styles.composer}><label htmlFor={`admin-dispute-${dispute.id}`}>Reply or leave a staff note</label><textarea id={`admin-dispute-${dispute.id}`} rows={3} maxLength={2000} value={drafts[dispute.id] || ''} onChange={(event) => setDrafts((current) => ({ ...current, [dispute.id]: event.target.value }))} placeholder="Write a factual update. Internal notes are never shown to participants." /><div><button type="button" onClick={() => void queueAction(dispute.id, 'assign_self')} disabled={busy === `assign_self-${dispute.id}`}>Assign to me</button><button type="button" onClick={() => void queueAction(dispute.id, 'internal_note')} disabled={!drafts[dispute.id]?.trim() || busy === `internal_note-${dispute.id}`}>Save internal note</button><button className={styles.reply} type="button" onClick={() => void queueAction(dispute.id, 'staff_reply')} disabled={!drafts[dispute.id]?.trim() || busy === `staff_reply-${dispute.id}`}>Reply to both sides</button></div></div>}
                {open && data.role === 'admin' && <div className={styles.decisionPanel}><label><span>Partial refund amount</span><div><b>$</b><input type="number" min="0.01" max={(remaining / 100).toFixed(2)} step="0.01" inputMode="decimal" value={refundAmounts[dispute.id] || ''} onChange={(event) => setRefundAmounts((current) => ({ ...current, [dispute.id]: event.target.value }))} placeholder={(remaining / 200).toFixed(2)} /></div></label><div className={styles.decisions}><button type="button" onClick={() => void resolve(dispute, 'resume_seller')} disabled={busy.includes(dispute.id)}>Authorize seller release</button><button type="button" onClick={() => void resolve(dispute, 'refund_buyer', partialCents)} disabled={busy.includes(dispute.id) || partialCents < 1 || partialCents >= remaining}>Issue partial refund</button><button className={styles.refund} type="button" onClick={() => void resolve(dispute, 'refund_buyer')} disabled={busy.includes(dispute.id) || remaining < 1}>Full refund</button></div></div>}
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
