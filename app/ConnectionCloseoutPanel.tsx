'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { cancelConnection } from '../lib/supabase/connections';
import {
  fetchLiveConnections,
  type LiveConnection,
  type LiveConnectionProfile
} from '../lib/supabase/liveConnections';
import {
  confirmConnectionCompletion,
  fetchCompletionConfirmations,
  releaseAspirePayment,
  type CompletionConfirmation
} from '../lib/supabase/payments';
import ResolutionCenterModal from './ResolutionCenterModal';
import styles from './ConnectionCloseoutPanel.module.css';

type CloseoutData = Awaited<ReturnType<typeof fetchLiveConnections>> & {
  completions: CompletionConfirmation[];
};

function personName(profile?: LiveConnectionProfile) {
  return profile?.display_name || profile?.full_name || profile?.name || 'Aspire student';
}

function scheduleCopy(connection: LiveConnection) {
  if (!connection.scheduled_start_at) return 'No agreed start time';
  const start = new Date(connection.scheduled_start_at).toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
  if (!connection.scheduled_end_at) return start;
  const end = new Date(connection.scheduled_end_at).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit'
  });
  return `${start} – ${end}`;
}

function shouldOfferCloseout(connection: LiveConnection, now: number) {
  if (connection.coordination_status === 'in_progress') return true;
  if (!connection.scheduled_start_at) return false;
  return new Date(connection.scheduled_start_at).getTime() <= now;
}

export default function ConnectionCloseoutPanel() {
  const [data, setData] = useState<CloseoutData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [helpConnectionId, setHelpConnectionId] = useState('');
  const [now, setNow] = useState(Date.now());

  const reload = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const next = await fetchLiveConnections();
      const completions = next.connections.length
        ? await fetchCompletionConfirmations(next.connections.map((item) => item.id)).catch(() => [] as CompletionConfirmation[])
        : [];
      setData({ ...next, completions });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not load connection closeout.');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const requestMap = useMemo(() => new Map((data?.requests ?? []).map((request) => [request.id, request])), [data]);
  const profileMap = useMemo(() => new Map((data?.profiles ?? []).map((profile) => [profile.id, profile])), [data]);
  const closeoutConnections = useMemo(
    () => (data?.connections ?? []).filter((connection) => shouldOfferCloseout(connection, now)),
    [data, now]
  );
  const helpConnection = closeoutConnections.find((connection) => connection.id === helpConnectionId) ?? null;

  async function markComplete(connection: LiveConnection) {
    setBusy(`complete-${connection.id}`);
    setNotice('');
    try {
      const count = await confirmConnectionCompletion(connection.id);
      if (count >= 2 && connection.payment_method === 'aspire') {
        try {
          await releaseAspirePayment(connection.id);
          setNotice('Both people marked this complete. Aspire started the protected payment release and moved the connection toward History.');
        } catch (releaseError) {
          setNotice(releaseError instanceof Error
            ? `Both people marked this complete. ${releaseError.message}`
            : 'Both people marked this complete. Payment release is still being finalized.');
        }
      } else if (count >= 2) {
        setNotice('Both people marked this complete. The connection is moving to History, where you can review it and choose My Circle.');
      } else {
        setNotice('You marked this complete. Aspire will close it after the other person confirms too.');
      }
      await reload(true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not mark this connection complete.');
    } finally {
      setBusy('');
    }
  }

  async function cancel(connection: LiveConnection) {
    const protectedCopy = connection.payment_method === 'aspire'
      ? ' Any secured Aspire payment stays protected and is not released automatically.'
      : '';
    if (!window.confirm(`Cancel this connection? This closes the active plan.${protectedCopy}`)) return;
    setBusy(`cancel-${connection.id}`);
    setNotice('');
    try {
      await cancelConnection(connection.id);
      setNotice(connection.payment_method === 'aspire'
        ? 'Connection cancelled. Any secured Aspire payment remains protected; use Get help if money or fault needs review.'
        : 'Connection cancelled and moved out of your active connections.');
      await reload(true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not cancel this connection.');
    } finally {
      setBusy('');
    }
  }

  if (loading || !data || (!closeoutConnections.length && !notice)) return null;

  return (
    <section className={styles.panel} aria-label="Connection closeout">
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>CLOSE THE LOOP</span>
          <h2>Did this activity happen?</h2>
        </div>
        <p>Finish cleanly, report a problem, or cancel. Completed connections move to History instead of staying active forever.</p>
      </header>

      {notice && <div className={styles.notice} role="status">{notice}</div>}

      <div className={styles.list}>
        {closeoutConnections.map((connection) => {
          const request = requestMap.get(connection.request_id);
          const otherId = data.userId === connection.requester_id ? connection.responder_id : connection.requester_id;
          const otherName = personName(profileMap.get(otherId));
          const myCompletion = data.completions.some((item) => item.connection_id === connection.id && item.user_id === data.userId);
          const otherCompletion = data.completions.some((item) => item.connection_id === connection.id && item.user_id === otherId);

          return (
            <article className={styles.card} key={connection.id}>
              <div className={styles.summary}>
                <div className={styles.avatar}>{otherName.slice(0, 1).toUpperCase()}</div>
                <div>
                  <span>{request?.category || 'Aspire connection'} · {otherName}</span>
                  <strong>{request?.title || 'Aspire activity'}</strong>
                  <small>{scheduleCopy(connection)}{connection.meeting_label ? ` · ${connection.meeting_label}` : ''}</small>
                </div>
              </div>

              {myCompletion ? (
                <div className={styles.waiting}>
                  <strong>{otherCompletion ? 'Both people confirmed completion ✓' : 'You marked this complete ✓'}</strong>
                  <span>{otherCompletion ? 'Aspire is closing the connection and moving it to History.' : `Waiting for ${otherName} to confirm before the connection closes.`}</span>
                </div>
              ) : (
                <div className={styles.actions}>
                  <button
                    className={styles.complete}
                    type="button"
                    disabled={busy === `complete-${connection.id}`}
                    onClick={() => void markComplete(connection)}
                  >
                    {busy === `complete-${connection.id}` ? 'Saving…' : '✓ Completed'}
                    <small>The activity happened and is finished</small>
                  </button>
                  <button type="button" onClick={() => setHelpConnectionId(connection.id)}>
                    ! No-show / Get help
                    <small>Report no-show, incomplete work, payment, or safety</small>
                  </button>
                  <button
                    className={styles.cancel}
                    type="button"
                    disabled={busy === `cancel-${connection.id}`}
                    onClick={() => void cancel(connection)}
                  >
                    {busy === `cancel-${connection.id}` ? 'Cancelling…' : '× Cancelled'}
                    <small>The plan ended and no further activity will happen</small>
                  </button>
                </div>
              )}

              <p className={styles.archiveNote}>Chats are never deleted by closeout. Completed or cancelled connections remain available in History; completed chats become read-only unless both people choose My Circle.</p>
            </article>
          );
        })}
      </div>

      {helpConnection && (() => {
        const otherId = data.userId === helpConnection.requester_id ? helpConnection.responder_id : helpConnection.requester_id;
        return (
          <ResolutionCenterModal
            connection={helpConnection}
            currentUserId={data.userId}
            otherUserId={otherId}
            otherName={personName(profileMap.get(otherId))}
            onClose={() => setHelpConnectionId('')}
            onOpened={async () => {
              setHelpConnectionId('');
              await reload(true);
              setNotice('Case opened. If an Aspire payment is secured, provider payout stays paused while the case is reviewed.');
            }}
          />
        );
      })()}
    </section>
  );
}
