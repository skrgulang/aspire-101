'use client';

import { useEffect, useMemo, useState } from 'react';
import { fetchCancellationEvents } from '../lib/supabase/cancellations';
import { fetchMyConnections } from '../lib/supabase/connections';
import { ConnectionPayment, fetchConnectionPayments } from '../lib/supabase/payments';
import { ConnectionResolutionCase, fetchResolutionCases } from '../lib/supabase/resolution';
import styles from './CancellationHistory.module.css';

type CancellationData = Awaited<ReturnType<typeof fetchMyConnections>> & {
  payments: ConnectionPayment[];
  cases: ConnectionResolutionCase[];
  events: Awaited<ReturnType<typeof fetchCancellationEvents>>;
};

function personName(profile?: CancellationData['profiles'][number]) {
  return profile?.display_name || profile?.full_name || profile?.name || 'Aspire student';
}

function money(cents: number | null | undefined, currency = 'USD') {
  if (cents == null) return null;
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
}

function when(value: string | null | undefined) {
  if (!value) return 'Time not recorded';
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function caseStatus(item?: ConnectionResolutionCase) {
  if (!item) return null;
  if (item.status === 'submitted') return 'Submitted for Aspire review';
  if (item.status === 'under_review') return 'Under Aspire review';
  if (item.status === 'resolved_refund') return 'Refund approved';
  if (item.status === 'resolved_release') return 'Payment released after review';
  if (item.status === 'resolved_partial') return 'Partially resolved';
  return 'Case closed';
}

function paymentSummary(
  payment: ConnectionPayment | undefined,
  resolutionCase: ConnectionResolutionCase | undefined,
  paymentMethod: 'none' | 'in_person' | 'aspire'
) {
  if (resolutionCase && ['submitted', 'under_review'].includes(resolutionCase.status)) {
    return 'Under Aspire review · provider payout paused';
  }
  if (!payment) {
    return paymentMethod === 'aspire' ? 'No secured Aspire payment' : 'No Pay with Aspire transaction';
  }
  if (payment.status === 'refunded') return 'Refund issued';
  if (payment.status === 'released') return 'Provider payout released';
  if (payment.status === 'disputed') return 'Card dispute open';
  if (payment.status === 'cancelled') return 'Payment cancelled';
  if (payment.status === 'secured') return 'Secured payment · review still required';
  if (payment.status === 'processing' || payment.status === 'checkout_created') return 'Payment still processing';
  if (payment.status === 'failed') return 'Payment not completed';
  return 'No completed payment';
}

export default function CancellationHistory() {
  const [data, setData] = useState<CancellationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const base = await fetchMyConnections();
        const connections = base.connections.filter((item) => item.status === 'cancelled').slice(0, 50);
        const connectionIds = connections.map((item) => item.id);
        const [events, payments, cases] = await Promise.all([
          fetchCancellationEvents(connectionIds),
          fetchConnectionPayments(connectionIds),
          fetchResolutionCases(connectionIds)
        ]);
        if (alive) setData({ ...base, connections, events, payments, cases });
      } catch (nextError) {
        if (!alive) return;
        const message = nextError instanceof Error ? nextError.message : 'Could not load cancellation history.';
        if (/sign(ed)? in|must be signed in/i.test(message)) {
          window.location.assign('/login?next=%2Fresolution');
          return;
        }
        setError(message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const requestMap = useMemo(() => new Map((data?.requests ?? []).map((item) => [item.id, item])), [data]);
  const profileMap = useMemo(() => new Map((data?.profiles ?? []).map((item) => [item.id, item])), [data]);
  const paymentMap = useMemo(() => new Map((data?.payments ?? []).map((item) => [item.connection_id, item])), [data]);
  const caseMap = useMemo(() => {
    const map = new Map<string, ConnectionResolutionCase>();
    (data?.cases ?? []).forEach((item) => {
      if (!map.has(item.connection_id)) map.set(item.connection_id, item);
    });
    return map;
  }, [data]);
  const eventMap = useMemo(() => {
    const map = new Map<string, CancellationData['events'][number]>();
    (data?.events ?? []).forEach((item) => {
      if (!map.has(item.connection_id)) map.set(item.connection_id, item);
    });
    return map;
  }, [data]);

  const reviewCount = useMemo(() => (data?.cases ?? []).filter((item) => ['submitted', 'under_review'].includes(item.status)).length, [data]);

  if (loading) return <div className={styles.loading}><span /><strong>Loading cancellation history…</strong></div>;
  if (error) return <div className={styles.error}><strong>Couldn’t load cancellation history.</strong><p>{error}</p></div>;
  if (!data?.connections.length) return null;

  return (
    <section className={styles.section} aria-label="Cancelled Aspire connections">
      <header className={styles.head}>
        <div>
          <span>CANCELLED CONNECTIONS</span>
          <h2>Cancellation history</h2>
          <p>Cancelled connections stay visible here so both participants can see who cancelled, when it happened, and what happened to any protected payment.</p>
        </div>
        <div className={styles.summary}>
          <strong>{data.connections.length}</strong>
          <span>saved receipts</span>
          {reviewCount > 0 && <small>{reviewCount} under review</small>}
        </div>
      </header>

      <div className={styles.list}>
        {data.connections.map((connection) => {
          const request = requestMap.get(connection.request_id);
          const payment = paymentMap.get(connection.id);
          const resolutionCase = caseMap.get(connection.id);
          const event = eventMap.get(connection.id);
          const otherId = data.userId === connection.requester_id ? connection.responder_id : connection.requester_id;
          const otherName = personName(profileMap.get(otherId));
          const actorCopy = !event?.actor_id
            ? 'Cancellation actor not recorded · legacy or Aspire-closed record'
            : event.actor_id === data.userId
              ? 'Cancelled by you'
              : event.actor_id === otherId
                ? `Cancelled by ${otherName}`
                : 'Cancelled through an Aspire record';
          const note = typeof event?.metadata?.note === 'string' ? event.metadata.note.trim() : '';
          const amount = money(payment?.customer_total_cents ?? payment?.gross_amount_cents, payment?.currency || 'USD');
          const paymentCopy = paymentSummary(payment, resolutionCase, connection.payment_method);
          const resolutionCopy = caseStatus(resolutionCase);
          const protectedReview = Boolean(resolutionCase && ['submitted', 'under_review'].includes(resolutionCase.status));

          return (
            <article className={styles.card} key={connection.id}>
              <div className={styles.top}>
                <div>
                  <span>{request?.category?.toUpperCase() || 'ASPIRE CONNECTION'}</span>
                  <h3>{request?.title || 'Cancelled Aspire connection'}</h3>
                  <small>With {otherName}</small>
                </div>
                <div className={styles.cancelledBadge}>CANCELLED</div>
              </div>

              <div className={styles.receipt} aria-label="Cancellation receipt">
                <div className={styles.receiptHead}>
                  <div><span>CANCELLATION RECEIPT</span><strong>{actorCopy}</strong></div>
                  {amount && <b>{amount}</b>}
                </div>
                <div className={styles.facts}>
                  <span><b>Connection</b><small>#{connection.id.slice(0, 8).toUpperCase()}</small></span>
                  <span><b>Cancelled</b><small>{when(event?.created_at || connection.updated_at)}</small></span>
                  <span><b>Payment</b><small>{paymentCopy}</small></span>
                  <span><b>Resolution</b><small>{resolutionCase ? `#${resolutionCase.id.slice(0, 8).toUpperCase()} · ${resolutionCopy}` : 'No Resolution Center case required'}</small></span>
                </div>
                {note && <div className={styles.note}><b>Cancellation note</b><p>{note}</p></div>}
                {protectedReview && <div className={styles.hold}><strong>Payment protected · payout paused</strong><span>Aspire review must close before any eligible provider payout or refund decision.</span></div>}
                {!event && <div className={styles.legacy}><strong>Legacy / system closure</strong><span>This connection is cancelled, but it does not contain the newer participant cancellation receipt event.</span></div>}
                <p className={styles.disclaimer}>This receipt records what happened in Aspire. Cancellation by itself does not establish fault or automatically decide a refund, compensation, or account penalty.</p>
              </div>

              <div className={styles.actions}>
                {resolutionCase && <a href={`/resolution#case-${resolutionCase.id}`}>View Resolution Center case →</a>}
                <a className={styles.secondary} href="/transactions">View transactions</a>
                <a className={styles.secondary} href="/resolution-policy">Cancellation policy</a>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
