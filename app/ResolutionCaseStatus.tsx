'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  addResolutionCaseResponse,
  ConnectionResolutionCase,
  ConnectionResolutionResponse,
  fetchResolutionCaseResponses
} from '../lib/supabase/resolution';
import styles from './ResolutionCaseStatus.module.css';

type Props = {
  item: ConnectionResolutionCase;
  currentUserId: string;
  otherName: string;
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

function statusLabel(status: ConnectionResolutionCase['status']) {
  if (status === 'under_review') return 'Under review';
  if (status === 'submitted') return 'Submitted';
  if (status === 'resolved_refund') return 'Refunded';
  if (status === 'resolved_release') return 'Payment released';
  if (status === 'resolved_partial') return 'Partially resolved';
  return 'Closed';
}

export default function ResolutionCaseStatus({ item, currentUserId, otherName }: Props) {
  const [responses, setResponses] = useState<ConnectionResolutionResponse[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [expanded, setExpanded] = useState(false);

  const reload = useCallback(async () => {
    const next = await fetchResolutionCaseResponses([item.id]);
    setResponses(next);
  }, [item.id]);

  useEffect(() => { void reload().catch(() => undefined); }, [reload]);

  const isOpen = ['submitted', 'under_review'].includes(item.status);
  const openedByMe = item.opened_by === currentUserId;
  const newest = useMemo(() => responses.slice(-3), [responses]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.trim()) return;
    setBusy(true);
    setNotice('');
    try {
      await addResolutionCaseResponse(item.id, draft);
      setDraft('');
      await reload();
      setNotice('Your update was added to the case.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not add your update.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.panel} aria-label="Resolution Center case status">
      <div className={styles.top}>
        <div>
          <span>PAYMENT ON HOLD · {reasonLabel(item.reason).toUpperCase()}</span>
          <strong>{statusLabel(item.status)}</strong>
        </div>
        <button type="button" onClick={() => setExpanded((value) => !value)}>{expanded ? 'Hide details' : 'Case details'}</button>
      </div>
      <p>Provider payout stays paused while this case is open. Filing a case does not automatically decide fault.</p>

      {expanded && (
        <div className={styles.details}>
          <div className={styles.summary}>
            <span><b>Opened by</b>{openedByMe ? 'You' : otherName}</span>
            <span><b>Requested</b>{item.requested_resolution.replaceAll('_', ' ')}</span>
            {item.scheduled_start_snapshot && <span><b>Agreed time</b>{new Date(item.scheduled_start_snapshot).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</span>}
            {item.meeting_label_snapshot && <span><b>Meeting point</b>{item.meeting_label_snapshot}</span>}
          </div>

          {item.details && <div className={styles.opening}><b>Opening report</b><p>{item.details}</p></div>}

          {newest.length > 0 && (
            <div className={styles.responses}>
              <b>Case updates</b>
              {newest.map((response) => (
                <article key={response.id}>
                  <strong>{response.author_id === currentUserId ? 'You' : otherName}</strong>
                  <p>{response.body}</p>
                  <time>{new Date(response.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time>
                </article>
              ))}
            </div>
          )}

          {isOpen && (
            <form className={styles.form} onSubmit={submit}>
              <label>
                <span>Add your side or an update</span>
                <textarea rows={3} maxLength={2000} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Keep it factual: where you were, whether you contacted them, and what happened next." />
              </label>
              <div><small>{draft.length}/2000</small><button type="submit" disabled={busy || !draft.trim()}>{busy ? 'Adding…' : 'Add to case'}</button></div>
            </form>
          )}

          {notice && <div className={styles.notice} role="status">{notice}</div>}
          <small className={styles.footer}>Location sharing is optional. Aspire can review the agreed time, status events, chat/activity records, and participant statements without requiring location.</small>
        </div>
      )}
    </section>
  );
}
