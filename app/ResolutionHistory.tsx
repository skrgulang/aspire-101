'use client';

import { useEffect, useMemo, useState } from 'react';
import { ConnectionResolutionCase, fetchMyResolutionHistory } from '../lib/supabase/resolution';
import styles from './ResolutionHistory.module.css';

function reasonLabel(reason: ConnectionResolutionCase['reason']) {
  if (reason === 'no_show') return 'No-show';
  if (reason === 'cancellation') return 'Cancellation';
  if (reason === 'incomplete') return 'Task incomplete';
  if (reason === 'not_as_described') return 'Not as described';
  if (reason === 'payment') return 'Payment issue';
  if (reason === 'safety') return 'Safety concern';
  return 'Other issue';
}

function statusCopy(item: ConnectionResolutionCase) {
  if (item.status === 'submitted') return { label: 'Submitted', detail: 'Payout remains paused while the case is open.' };
  if (item.status === 'under_review') return { label: 'Under review', detail: 'Aspire is reviewing the connection record and participant statements.' };
  if (item.status === 'resolved_refund') return { label: 'Refunded', detail: 'Aspire approved a refund. Bank posting time may vary after Stripe processes it.' };
  if (item.status === 'resolved_release') return { label: 'Payment released', detail: 'Aspire resolved the case and released the eligible provider payment.' };
  if (item.status === 'resolved_partial') return { label: 'Partially resolved', detail: 'Aspire approved a reviewed partial outcome.' };
  return { label: 'Closed', detail: 'Aspire reviewed and closed this case without a financial resolution from the case.' };
}

function money(cents: number | null, currency: string | null) {
  if (cents == null) return null;
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD' }).format(cents / 100);
}

export default function ResolutionHistory() {
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchMyResolutionHistory>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'open' | 'closed'>('all');

  useEffect(() => {
    let alive = true;
    void fetchMyResolutionHistory()
      .then((next) => { if (alive) setData(next); })
      .catch((nextError) => {
        if (!alive) return;
        if (nextError instanceof Error && nextError.message === 'AUTH_REQUIRED') {
          window.location.assign('/login?next=%2Fresolution');
          return;
        }
        setError(nextError instanceof Error ? nextError.message : 'Could not load your Resolution Center history.');
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const requestMap = useMemo(() => new Map((data?.requests ?? []).map((item) => [item.id, item])), [data]);
  const cases = useMemo(() => {
    const current = data?.cases ?? [];
    if (filter === 'open') return current.filter((item) => ['submitted', 'under_review'].includes(item.status));
    if (filter === 'closed') return current.filter((item) => !['submitted', 'under_review'].includes(item.status));
    return current;
  }, [data, filter]);
  const openCount = useMemo(() => (data?.cases ?? []).filter((item) => ['submitted', 'under_review'].includes(item.status)).length, [data]);

  if (loading) return <div className={styles.loading}><span /><strong>Loading Resolution Center…</strong></div>;
  if (error) return <div className={styles.error}><strong>Couldn’t load your cases.</strong><p>{error}</p></div>;

  return (
    <section className={styles.section} aria-label="Your Resolution Center cases">
      <header className={styles.head}>
        <div><span>YOUR CASES</span><h2>Resolution Center</h2><p>Track no-show, cancellation, refund, payment, and safety issues connected to your Aspire activity.</p></div>
        <div className={styles.summary}><strong>{openCount}</strong><span>open {openCount === 1 ? 'case' : 'cases'}</span></div>
      </header>

      <nav className={styles.filters} aria-label="Case filters">
        <button className={filter === 'all' ? styles.active : ''} type="button" onClick={() => setFilter('all')}>All</button>
        <button className={filter === 'open' ? styles.active : ''} type="button" onClick={() => setFilter('open')}>Open</button>
        <button className={filter === 'closed' ? styles.active : ''} type="button" onClick={() => setFilter('closed')}>Closed</button>
      </nav>

      {!cases.length ? (
        <div className={styles.empty}>
          <strong>{filter === 'all' ? 'No Resolution Center cases.' : `No ${filter} cases.`}</strong>
          <p>If a problem happens during an active connection, use <b>Get help</b> from Aspire Live. Payment protection applies only to eligible Pay with Aspire transactions.</p>
          <a href="/connections">Open connections →</a>
        </div>
      ) : (
        <div className={styles.list}>
          {cases.map((item) => {
            const request = requestMap.get(item.request_id);
            const status = statusCopy(item);
            const amount = money(item.payment_total_cents_snapshot, item.currency_snapshot);
            const isOpen = ['submitted', 'under_review'].includes(item.status);
            const openedByMe = item.opened_by === data?.userId;
            return (
              <article className={`${styles.card} ${isOpen ? styles.open : ''}`} key={item.id}>
                <div className={styles.top}>
                  <div><span>{reasonLabel(item.reason).toUpperCase()}</span><h3>{request?.title || 'Aspire connection issue'}</h3><small>{request ? [request.category, request.campus].filter(Boolean).join(' · ') : 'Connection case'}</small></div>
                  {amount && <strong>{amount}</strong>}
                </div>
                <div className={styles.status}><i /><div><strong>{status.label}</strong><p>{status.detail}</p></div></div>
                <div className={styles.meta}>
                  <span>Opened {new Date(item.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                  <span>{openedByMe ? 'Opened by you' : 'Opened by the other participant'}</span>
                  {item.scheduled_start_snapshot && <span>Agreed time {new Date(item.scheduled_start_snapshot).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>}
                </div>
                {item.resolution_note && <div className={styles.note}><b>Aspire resolution</b><p>{item.resolution_note}</p></div>}
                <div className={styles.actions}>
                  {isOpen ? <a href="/connections">Open active connection →</a> : <a href="/transactions">View transactions →</a>}
                  <a className={styles.policy} href="/resolution-policy">Policy</a>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
