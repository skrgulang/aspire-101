'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchMyRole, AppRole } from '../lib/supabase/trust';
import {
  ConnectionNoShowIncident,
  ConnectionResolutionCase,
  ConnectionResolutionResponse,
  fetchNoShowIncidents,
  fetchResolutionCaseResponses,
  fetchResolutionCasesForModeration,
  resolveResolutionCase,
  reviewResolutionCase
} from '../lib/supabase/resolution';
import styles from './ResolutionCaseConsole.module.css';

type EvidenceEvent = {
  event_type?: string;
  actor_id?: string | null;
  body?: string;
  created_at?: string;
};

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

function outcomeLabel(status: ConnectionResolutionCase['status']) {
  if (status === 'resolved_refund') return 'Refunded';
  if (status === 'resolved_release') return 'Released';
  if (status === 'resolved_partial') return 'Partial';
  if (status === 'dismissed') return 'Dismissed';
  if (status === 'under_review') return 'Under review';
  return 'Submitted';
}

function when(value: string) {
  return new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function evidenceEvents(item: ConnectionResolutionCase) {
  const raw = item.evidence_snapshot?.events;
  if (!Array.isArray(raw)) return [] as EvidenceEvent[];
  return raw.filter((entry): entry is EvidenceEvent => Boolean(entry && typeof entry === 'object')).slice(-8).reverse();
}

function eventLabel(type?: string) {
  if (!type) return 'Activity';
  if (type === 'schedule_set') return 'Agreed time';
  if (type === 'schedule_proposed') return 'Time proposed';
  if (type === 'schedule_declined') return 'Time declined';
  if (type === 'on_the_way') return 'On the way';
  if (type === 'running_late') return 'Running late';
  if (type === 'cannot_make_it') return 'Can’t make it';
  if (type === 'arrived') return 'Arrived';
  if (type === 'in_progress') return 'Task started';
  if (type === 'location_shared') return 'Location shared';
  if (type === 'location_stopped') return 'Location stopped';
  return type.replaceAll('_', ' ');
}

export default function ResolutionCaseConsole() {
  const [role, setRole] = useState<AppRole>('member');
  const [cases, setCases] = useState<ConnectionResolutionCase[]>([]);
  const [responses, setResponses] = useState<ConnectionResolutionResponse[]>([]);
  const [incidents, setIncidents] = useState<ConnectionNoShowIncident[]>([]);
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
      const [nextResponses, nextIncidents] = await Promise.all([
        fetchResolutionCaseResponses(nextCases.map((item) => item.id)).catch(() => [] as ConnectionResolutionResponse[]),
        fetchNoShowIncidents(nextCases.map((item) => item.against_user_id || '')).catch(() => [] as ConnectionNoShowIncident[])
      ]);
      setCases(nextCases);
      setResponses(nextResponses);
      setIncidents(nextIncidents);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not load Resolution Center cases.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const openCases = useMemo(() => cases.filter((item) => ['submitted', 'under_review'].includes(item.status)), [cases]);
  const closedCases = useMemo(() => cases.filter((item) => !['submitted', 'under_review'].includes(item.status)).slice(0, 12), [cases]);
  const responseMap = useMemo(() => {
    const map = new Map<string, ConnectionResolutionResponse[]>();
    responses.forEach((response) => {
      const current = map.get(response.case_id) ?? [];
      current.push(response);
      map.set(response.case_id, current);
    });
    return map;
  }, [responses]);
  const incidentMap = useMemo(() => {
    const map = new Map<string, ConnectionNoShowIncident[]>();
    incidents.forEach((incident) => {
      const current = map.get(incident.user_id) ?? [];
      current.push(incident);
      map.set(incident.user_id, current);
    });
    return map;
  }, [incidents]);

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
            const capturedEvents = evidenceEvents(item);
            const priorIncidents = item.against_user_id ? (incidentMap.get(item.against_user_id) ?? []) : [];
            const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
            const recentIncidents = priorIncidents.filter((incident) => new Date(incident.created_at).getTime() >= cutoff);
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
                  {item.against_user_id && <span>Confirmed no-shows: {priorIncidents.length} total · {recentIncidents.length} in 90d</span>}
                </div>
                {recentIncidents.length >= 2 && <div className={styles.pattern}><strong>Repeat no-show pattern</strong><span>Human account review recommended. This signal does not automatically suspend the user.</span></div>}
                <p className={styles.details}>{item.details || 'No additional participant note.'}</p>
                {capturedEvents.length > 0 && (
                  <div className={styles.evidence}>
                    <b>CAPTURED CONNECTION EVIDENCE</b>
                    <div>
                      {capturedEvents.map((event, index) => {
                        const actor = !event.actor_id ? 'Aspire' : event.actor_id === item.opened_by ? 'Reporter' : event.actor_id === item.against_user_id ? 'Other participant' : 'Participant';
                        return <span key={`${event.created_at || 'event'}-${index}`}><strong>{eventLabel(event.event_type)}</strong><small>{actor}{event.created_at ? ` · ${when(event.created_at)}` : ''}</small></span>;
                      })}
                    </div>
                  </div>
                )}
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

      <div className={styles.audit}>
        <div className={styles.auditHead}>
          <div><span>ADMIN AUDIT TRAIL</span><strong>Recent case outcomes</strong></div>
          <small>{closedCases.length ? `Showing ${closedCases.length} recent closed cases` : 'No closed cases yet'}</small>
        </div>
        {!closedCases.length ? (
          <div className={styles.auditEmpty}>Resolved refunds, dismissals and releases will stay visible here for operational review.</div>
        ) : (
          <div className={styles.auditList}>
            {closedCases.map((item) => (
              <article className={styles.auditRow} key={`audit-${item.id}`}>
                <div>
                  <span>#{item.id.slice(0, 8).toUpperCase()} · {titleForReason(item.reason).toUpperCase()}</span>
                  <strong>{outcomeLabel(item.status)}</strong>
                  <small>{item.resolution_note || 'No resolution note recorded.'}</small>
                </div>
                <div className={styles.auditFacts}>
                  {item.refund_cents != null && <span><b>Refund</b>{money(item.refund_cents, item.currency_snapshot)}</span>}
                  {item.provider_release_cents != null && <span><b>Release</b>{money(item.provider_release_cents, item.currency_snapshot)}</span>}
                  <span><b>Reviewed</b>{item.reviewed_at ? when(item.reviewed_at) : 'Not recorded'}</span>
                  <span><b>Reviewer</b>{item.reviewed_by ? item.reviewed_by.slice(0, 8) : 'System / legacy'}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}