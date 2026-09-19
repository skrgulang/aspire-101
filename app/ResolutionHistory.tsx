'use client';

import { useEffect, useMemo, useState } from 'react';
import { ConnectionResolutionCase, fetchMyResolutionHistory } from '../lib/supabase/resolution';
import { fetchMySafetyReports, type SafetyReportHistoryItem } from '../lib/supabase/safety';
import { fetchMyConnections } from '../lib/supabase/connections';
import { fetchMarketDisputes, fetchMarketOrders, type MarketDispute } from '../lib/supabase/marketplace';
import styles from './ResolutionHistory.module.css';

type MarketReportRow = {
  dispute: MarketDispute;
  requestId: string;
  requestTitle: string;
  category: string;
  campus: string | null;
};

function reasonLabel(reason: ConnectionResolutionCase['reason']) {
  if (reason === 'no_show') return 'No-show';
  if (reason === 'cancellation') return 'Cancellation';
  if (reason === 'incomplete') return 'Task incomplete';
  if (reason === 'not_as_described') return 'Not as described';
  if (reason === 'payment') return 'Payment issue';
  if (reason === 'safety') return 'Safety concern';
  return 'Other issue';
}

function safetyReasonLabel(reason: SafetyReportHistoryItem['reason']) {
  if (reason === 'harassment') return 'Harassment';
  if (reason === 'scam') return 'Scam';
  if (reason === 'unsafe') return 'Unsafe activity';
  if (reason === 'illegal') return 'Illegal activity';
  if (reason === 'hate') return 'Hate';
  if (reason === 'sexual') return 'Sexual content';
  if (reason === 'spam') return 'Spam';
  return 'Other safety report';
}

function marketReasonLabel(reason: MarketDispute['reason']) {
  if (reason === 'item_not_as_described') return 'Item not as described';
  if (reason === 'item_not_received') return 'Item not received';
  if (reason === 'counterfeit_or_prohibited') return 'Counterfeit / prohibited';
  if (reason === 'payment_issue') return 'Payment issue';
  if (reason === 'unsafe_handoff') return 'Unsafe handoff';
  return 'Marketplace issue';
}

function statusCopy(item: ConnectionResolutionCase) {
  if (item.status === 'submitted') return { label: 'Submitted', detail: 'The case is recorded and waiting for review.' };
  if (item.status === 'under_review') return { label: 'Under review', detail: 'Aspire is reviewing the connection record and participant statements.' };
  if (item.status === 'resolved_refund') return { label: 'Refunded', detail: 'Aspire approved a refund. Bank posting time may vary after Stripe processes it.' };
  if (item.status === 'resolved_release') return { label: 'Payment released', detail: 'Aspire resolved the case and released the eligible provider payment.' };
  if (item.status === 'resolved_partial') return { label: 'Partially resolved', detail: 'Aspire approved a reviewed partial outcome.' };
  return { label: 'Closed', detail: 'Aspire reviewed and closed this case.' };
}

function safetyStatusCopy(item: SafetyReportHistoryItem) {
  if (item.status === 'submitted') return { label: 'Submitted', detail: 'Your safety report was received.' };
  if (item.status === 'reviewing') return { label: 'Under review', detail: 'Aspire Safety is reviewing the report.' };
  if (item.status === 'resolved') return { label: 'Resolved', detail: 'Aspire Safety completed its review.' };
  return { label: 'Closed', detail: 'The report was reviewed and closed.' };
}

function marketStatusCopy(item: MarketDispute) {
  if (item.status === 'open') return { label: 'Submitted', detail: 'The marketplace report is open and seller payout remains paused when applicable.' };
  if (item.status === 'under_review') return { label: 'Under review', detail: 'Aspire is reviewing the order, payment, and handoff record.' };
  if (item.status === 'resolved_buyer') return { label: 'Resolved for buyer', detail: 'Aspire completed the marketplace review with a buyer-side outcome.' };
  if (item.status === 'resolved_seller') return { label: 'Resolved for seller', detail: 'Aspire completed the marketplace review with a seller-side outcome.' };
  return { label: 'Closed', detail: 'The marketplace report is closed.' };
}

function money(cents: number | null, currency: string | null) {
  if (cents == null) return null;
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD' }).format(cents / 100);
}

function reviewedWhen(value: string | null) {
  if (!value) return 'Completed by Aspire review';
  return new Date(value).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function isConnectionOpen(item: ConnectionResolutionCase) {
  return ['submitted', 'under_review'].includes(item.status);
}
function isSafetyOpen(item: SafetyReportHistoryItem) {
  return ['submitted', 'reviewing'].includes(item.status);
}
function isMarketOpen(item: MarketDispute) {
  return ['open', 'under_review'].includes(item.status);
}

export default function ResolutionHistory() {
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchMyResolutionHistory>> | null>(null);
  const [safetyReports, setSafetyReports] = useState<SafetyReportHistoryItem[]>([]);
  const [marketReports, setMarketReports] = useState<MarketReportRow[]>([]);
  const [extraRequests, setExtraRequests] = useState<{ id: string; title: string; category: string; campus: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'open' | 'closed'>('all');

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [next, reports, base] = await Promise.all([
          fetchMyResolutionHistory(),
          fetchMySafetyReports(),
          fetchMyConnections()
        ]);
        const requestMap = new Map(base.requests.map((request) => [request.id, request]));
        const marketConnections = base.connections.filter((connection) => requestMap.get(connection.request_id)?.kind === 'buy_sell');
        const orders = await fetchMarketOrders(marketConnections.map((connection) => connection.id));
        const disputes = await fetchMarketDisputes(orders.map((order) => order.id));
        const orderMap = new Map(orders.map((order) => [order.id, order]));
        const nextMarketReports = disputes.map((dispute) => {
          const order = orderMap.get(dispute.market_order_id);
          const request = order ? requestMap.get(order.request_id) : undefined;
          return {
            dispute,
            requestId: order?.request_id || '',
            requestTitle: request?.title || 'Marketplace order',
            category: request?.category || 'Buy & sell',
            campus: request?.campus || null
          };
        });

        if (!alive) return;
        setData(next);
        setSafetyReports(reports);
        setMarketReports(nextMarketReports);
        setExtraRequests(base.requests.map((request) => ({
          id: request.id,
          title: request.title,
          category: request.category,
          campus: request.campus || null
        })));
      } catch (nextError) {
        if (!alive) return;
        if (nextError instanceof Error && nextError.message === 'AUTH_REQUIRED') {
          window.location.assign('/login?next=%2Fresolution');
          return;
        }
        setError(nextError instanceof Error ? nextError.message : 'Could not load your Resolution Center history.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const requestMap = useMemo(() => new Map([
    ...(data?.requests ?? []).map((item) => [item.id, item] as const),
    ...extraRequests.map((item) => [item.id, item] as const)
  ]), [data, extraRequests]);

  const cases = useMemo(() => {
    const current = data?.cases ?? [];
    if (filter === 'open') return current.filter(isConnectionOpen);
    if (filter === 'closed') return current.filter((item) => !isConnectionOpen(item));
    return current;
  }, [data, filter]);

  const visibleSafety = useMemo(() => {
    if (filter === 'open') return safetyReports.filter(isSafetyOpen);
    if (filter === 'closed') return safetyReports.filter((item) => !isSafetyOpen(item));
    return safetyReports;
  }, [filter, safetyReports]);

  const visibleMarket = useMemo(() => {
    if (filter === 'open') return marketReports.filter((item) => isMarketOpen(item.dispute));
    if (filter === 'closed') return marketReports.filter((item) => !isMarketOpen(item.dispute));
    return marketReports;
  }, [filter, marketReports]);

  const openCount = useMemo(() =>
    (data?.cases ?? []).filter(isConnectionOpen).length
    + safetyReports.filter(isSafetyOpen).length
    + marketReports.filter((item) => isMarketOpen(item.dispute)).length,
  [data, marketReports, safetyReports]);

  const visibleCount = cases.length + visibleSafety.length + visibleMarket.length;

  if (loading) return <div className={styles.loading}><span /><strong>Loading Resolution Center…</strong></div>;
  if (error) return <div className={styles.error}><strong>Couldn’t load your cases.</strong><p>{error}</p></div>;

  return (
    <section className={styles.section} aria-label="Your Resolution Center cases">
      <header className={styles.head}>
        <div><span>YOUR CASES &amp; REPORTS</span><h2>Resolution Center</h2><p>Connection and order cases opened by either participant appear here. Safety reports you submit stay visible with their review status; reports submitted by someone else stay private during review.</p></div>
        <div className={styles.summary}><strong>{openCount}</strong><span>open {openCount === 1 ? 'case' : 'cases'}</span></div>
      </header>

      <nav className={styles.filters} aria-label="Case filters">
        <button className={filter === 'all' ? styles.active : ''} type="button" onClick={() => setFilter('all')}>All</button>
        <button className={filter === 'open' ? styles.active : ''} type="button" onClick={() => setFilter('open')}>Open</button>
        <button className={filter === 'closed' ? styles.active : ''} type="button" onClick={() => setFilter('closed')}>Closed</button>
      </nav>

      {!visibleCount ? (
        <div className={styles.empty}>
          <strong>{filter === 'all' ? 'No cases or reports yet.' : `No ${filter} cases or reports.`}</strong>
          <p>Connection cases from either participant, marketplace reports, and safety reports you submit will stay here with their current status.</p>
          <a href="/connections">Open connections →</a>
        </div>
      ) : (
        <div className={styles.list}>
          {cases.map((item) => {
            const request = requestMap.get(item.request_id);
            const status = statusCopy(item);
            const amount = money(item.payment_total_cents_snapshot, item.currency_snapshot);
            const refundAmount = money(item.refund_cents ?? item.payment_total_cents_snapshot, item.currency_snapshot);
            const open = isConnectionOpen(item);
            const openedByMe = item.opened_by === data?.userId;
            return (
              <article id={`case-${item.id}`} className={`${styles.card} ${open ? styles.open : ''}`} key={item.id}>
                <div className={styles.top}>
                  <div><span>CONNECTION CASE · {reasonLabel(item.reason).toUpperCase()}</span><h3>{request?.title || 'Aspire connection issue'}</h3><small>{request ? [request.category, request.campus].filter(Boolean).join(' · ') : 'Connection case'}</small></div>
                  {amount && <strong>{amount}</strong>}
                </div>
                <div className={styles.status}><i /><div><strong>{status.label}</strong><p>{status.detail}</p></div></div>
                <div className={styles.meta}>
                  <span>Opened {new Date(item.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                  <span>{openedByMe ? 'Opened by you' : 'Opened by the other participant'}</span>
                  {item.scheduled_start_snapshot && <span>Agreed time {new Date(item.scheduled_start_snapshot).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>}
                </div>
                {item.resolution_note && <div className={styles.note}><b>Aspire resolution</b><p>{item.resolution_note}</p></div>}
                {item.status === 'resolved_refund' && (
                  <div className={styles.receipt} aria-label="Refund receipt">
                    <div className={styles.receiptTop}><span>REFUND RECEIPT</span><strong>{refundAmount || 'Refund approved'}</strong></div>
                    <div className={styles.receiptGrid}>
                      <span><b>Aspire case</b><small>#{item.id.slice(0, 8).toUpperCase()}</small></span>
                      <span><b>Decision</b><small>{reviewedWhen(item.reviewed_at)}</small></span>
                      <span><b>Payment state</b><small>Refund issued · provider payout stopped</small></span>
                    </div>
                    <p>This is your Aspire resolution record. Your card or bank can take additional time to post the refund after Stripe accepts it.</p>
                  </div>
                )}
                <div className={styles.actions}>
                  {open ? <a href="/connections">Open active connection →</a> : <a href="/transactions">View transactions →</a>}
                  <a className={styles.policy} href="/resolution-policy">Policy</a>
                </div>
              </article>
            );
          })}

          {visibleMarket.map(({ dispute, requestTitle, category, campus }) => {
            const status = marketStatusCopy(dispute);
            const open = isMarketOpen(dispute);
            return (
              <article className={`${styles.card} ${open ? styles.open : ''}`} key={`market-${dispute.id}`}>
                <div className={styles.top}>
                  <div><span>MARKETPLACE REPORT · {marketReasonLabel(dispute.reason).toUpperCase()}</span><h3>{requestTitle}</h3><small>{[category, campus].filter(Boolean).join(' · ') || 'Marketplace order'}</small></div>
                </div>
                <div className={styles.status}><i /><div><strong>{status.label}</strong><p>{status.detail}</p></div></div>
                <div className={styles.meta}>
                  <span>Opened {new Date(dispute.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                  <span>{dispute.opened_by === data?.userId ? 'Opened by you' : 'Opened by the other participant'}</span>
                  <span>Order report #{dispute.id.slice(0, 8).toUpperCase()}</span>
                </div>
                {dispute.details && <div className={styles.note}><b>Report details</b><p>{dispute.details}</p></div>}
                <div className={styles.actions}><a href="/transactions">View order →</a><a className={styles.policy} href="/resolution-policy">Policy</a></div>
              </article>
            );
          })}

          {visibleSafety.map((item) => {
            const status = safetyStatusCopy(item);
            const request = item.request_id ? requestMap.get(item.request_id) : undefined;
            const open = isSafetyOpen(item);
            return (
              <article className={`${styles.card} ${open ? styles.open : ''}`} key={`safety-${item.id}`}>
                <div className={styles.top}>
                  <div><span>SAFETY REPORT · {safetyReasonLabel(item.reason).toUpperCase()}</span><h3>{request?.title || 'Safety report'}</h3><small>Submitted by you · Aspire Safety</small></div>
                </div>
                <div className={styles.status}><i /><div><strong>{status.label}</strong><p>{status.detail}</p></div></div>
                <div className={styles.meta}>
                  <span>Submitted {new Date(item.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                  <span>Safety report #{item.id.slice(0, 8).toUpperCase()}</span>
                  {item.reviewed_at && <span>Reviewed {new Date(item.reviewed_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>}
                </div>
                {item.details && <div className={styles.note}><b>Your report</b><p>{item.details}</p></div>}
                <div className={styles.actions}><a href="/safety">Safety Center →</a><a className={styles.policy} href="/resolution-policy">Policy</a></div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
