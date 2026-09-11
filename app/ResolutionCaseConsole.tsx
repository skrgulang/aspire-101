'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchMyRole, AppRole } from '../lib/supabase/trust';
import {
  ConnectionResolutionCase,
  ConnectionResolutionResponse,
  fetchResolutionCaseResponses,
  fetchResolutionCasesForModeration,
  resolveResolutionCase,
  reviewResolutionCase
} from '../lib/supabase/resolution';
import styles from './ResolutionCaseConsole.module.css';

function money(cents: number | null, currency: string | null) {
  if (cents == null) return 'No Aspire payment snapshot';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD' }).format(cents / 100);
}

function titleForReason(reason: ConnectionResolutionCase['reason']) {
  if (reason === 'no_show') return 'No-show';
  if (reason === 'cancellation') return 'Cancellation';
  if (reason === 'incomplete') return 'Task incomplete';
  if (reason === 'not_as_described') return 'Not as described';
  if (reason === 'payment') return 'Payment issue';
  if (reason === 'safety') return 'Safety concern';
  return 'Other issue';
}

function when(value: string) {
  return new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function ResolutionCaseConsole() {
  const [role, setRole] = useState<AppRole>('member');
  const [cases, setCases] = useState<ConnectionResolutionCase[]>([]);
  const [responses, setResponses] = useState<ConnectionResolutionResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const nextRole = await fetchMyRole();
      setRole(nextRole);
      if (!['moderator', 'admin'].includes(nextRole)) return;
      const nextCases = await fetchResolutionCasesForModeration();
      const nextResponses = await fetchResolutionCaseResponses(nextCases.map((item) => item.id)).catch(() => [] as ConnectionResolutionResponse[]);
      setCases(nextCases);
      setResponses(nextResponses);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not load Resolution Center cases.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const openCases = useMemo(() => cases.filter((item) => ['submitted', 'under_review'].includes(item.status)), [cases]);
  const responseMap = useMemo(() => {
    const map = new Map<string, ConnectionResolutionResponse[]>();
    responses.forEach((response) => {
      const current = map.get(response.case_id) ?? [];
      current.push(response);
      map.set(response.case_id, current);
    });
    return map;
  }, [responses]);

  async function markReviewing(item: ConnectionResolutionCase) {
    setBusy(`review-${item.id}`);
    setNotice('');
    try {
      await reviewResolutionCase(item.id, 'under_review');
      setNotice('Case marked under review. Payout remains paused.');
      await reload();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not update this case.');
    } finally { setBusy(''); }
  }

  async function dismiss(item: ConnectionResolutionCase) {
    const note = window.prompt('Why should this case be closed?', 'Evidence did not support the claim.') ?? '';
    if (!note.trim()) return;
    if (!window.confirm('Close this case? If the payment otherwise qualifies, payout will no longer be blocked by this case.')) return;
    setBusy(`dismiss-${item.id}`);
    setNotice('');
    try {
      await resolveResolutionCase(item.id, 'dismiss', note);
      setNotice('Case dismissed.');
      await reload();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not close this case.');
    } finally { setBusy(''); }
  }

  async function fullRefund(item: ConnectionResolutionCase) {
    const note = window.prompt('Resolution note for the audit trail:', item.reason === 'no_show' ? 'Confirmed provider no-show. Full protected payment refund approved.' : 'Full protected payment refund approved.') ?? '';
    if (!note.trim()) return;
    if (!window.confirm(`Issue a full refund of ${money(item.payment_total_cents_snapshot, item.currency_snapshot)}? This sends a real Stripe refund in the current environment and closes the connection.`)) return;
    setBusy(`refund-${item.id}`);
    setNotice('');
    try {
      const result = await resolveResolutionCase(item.id, 'refund_full', note);
      setNotice(`Refund approved: ${money(result.refundCents ?? item.payment_total_cents_snapshot, item.currency_snapshot)}.`);
      await reload();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not issue this refund.');
    } finally { setBusy(''); }
  }

  if (loading || !['moderator', 'admin'].includes(role)) return null;

  return (
    <section className={styles.section} aria-label="Resolution Center moderation queue">
      <header className={styles.head}>
        <div><span>ASPIRE RESOLUTION CENTER</span><h2>Claims &amp; refunds</h2></div>
        <p>No-show, cancellation, incomplete-task, payment, and safety cases. Open cases freeze provider payout before transfer.</p>
      </header>
      {notice && <div className={styles.notice} role="status">{notice}</div>}
      {!openCases.length ? <div className={styles.empty}><strong>✓ No open resolution cases</strong><span>New participant claims will appear here.</span></div> : (
        <div className={styles.list}>
          {openCases.map((item) => {
            const caseResponses = responseMap.get(item.id) ?? [];
            return (
              <article className={styles.card} key={item.id}>
                <div className={styles.top}>
                  <div><span>{titleForReason(item.reason).toUpperCase()} · {item.status.replace('_', ' ').toUpperCase()}</span><h3>{item.requested_resolution.replace('_', ' ')}</h3></div>
                  <strong>{money(item.payment_total_cents_snapshot, item.currency_snapshot)}</strong>
                </div>
                <div className={styles.meta}>
                  <span>Opened {when(item.created_at)}</span>
                  <span>Payment: {item.payment_status_snapshot || 'none'}</span>
                  {item.scheduled_start_snapshot && <span>Agreed time: {when(item.scheduled_start_snapshot)}</span>}
                  {item.meeting_label_snapshot && <span>Place: {item.meeting_label_snapshot}</span>}
                  <span>Participant updates: {caseResponses.length}</span>
                </div>
                <p className={styles.details}>{item.details || 'No additional participant note.'}</p>
                {caseResponses.length > 0 && (
                  <div className={styles.responses}>
                    <b>PARTICIPANT STATEMENTS</b>
                    {caseResponses.slice(-5).map((response) => (
                      <article key={response.id}>
                        <strong>{response.author_id === item.opened_by ? 'Reporter' : 'Other participant'}</strong>
                        <p>{response.body}</p>
                        <time>{when(response.created_at)}</time>
                      </article>
                    ))}
                  </div>
                )}
                <div className={styles.actions}>
                  {item.status === 'submitted' && <button type="button" onClick={() => void markReviewing(item)} disabled={busy === `review-${item.id}`}>Start review</button>}
                  <button type="button" onClick={() => void dismiss(item)} disabled={busy === `dismiss-${item.id}`}>Dismiss</button>
                  {role === 'admin' && <button className={styles.refund} type="button" onClick={() => void fullRefund(item)} disabled={busy === `refund-${item.id}`}>Full refund</button>}
                </div>
                {role !== 'admin' && <small className={styles.adminNote}>Moderators can investigate and dismiss; only an admin can issue a Stripe refund.</small>}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
