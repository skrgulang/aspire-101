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
import {
  fetchResolutionCases,
  type ConnectionResolutionCase,
  type ResolutionReason
} from '../lib/supabase/resolution';
import ResolutionCenterModal from './ResolutionCenterModal';
import styles from './ConnectionCloseoutPanel.module.css';

type CloseoutData = Awaited<ReturnType<typeof fetchLiveConnections>> & {
  completions: CompletionConfirmation[];
  cases: ConnectionResolutionCase[];
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
  const end = connection.scheduled_end_at ? new Date(connection.scheduled_end_at).getTime() : null;
  if (end) return end <= now;
  const start = connection.scheduled_start_at ? new Date(connection.scheduled_start_at).getTime() : null;
  return Boolean(start && start <= now);
}

function noShowUnlocked(connection: LiveConnection, now: number) {
  if (!connection.scheduled_start_at) return false;
  return new Date(connection.scheduled_start_at).getTime() + 10 * 60_000 <= now;
}

function isOpenCase(item: ConnectionResolutionCase) {
  return item.status === 'submitted' || item.status === 'under_review';
}

export default function ConnectionCloseoutPanel() {
  const [data, setData] = useState<CloseoutData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [helpConnectionId, setHelpConnectionId] = useState('');
  const [helpReason, setHelpReason] = useState<ResolutionReason>('other');
  const [now, setNow] = useState(Date.now());

  const reload = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const next = await fetchLiveConnections();
      const connectionIds = next.connections.map((item) => item.id);
      const [completions, cases] = await Promise.all([
        connectionIds.length
          ? fetchCompletionConfirmations(connectionIds).catch(() => [] as CompletionConfirmation[])
          : Promise.resolve([] as CompletionConfirmation[]),
        connectionIds.length
          ? fetchResolutionCases(connectionIds).catch(() => [] as ConnectionResolutionCase[])
          : Promise.resolve([] as ConnectionResolutionCase[])
      ]);
      setData({ ...next, completions, cases });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not load connection closeout.');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    const refresh = window.setInterval(() => void reload(true), 60_000);
    return () => {
      window.clearInterval(timer);
      window.clearInterval(refresh);
    };
  }, [reload]);

  const requestMap = useMemo(() => new Map((data?.requests ?? []).map((request) => [request.id, request])), [data]);
  const profileMap = useMemo(() => new Map((data?.profiles ?? []).map((profile) => [profile.id, profile])), [data]);
  const closeoutConnections = useMemo(
    () => (data?.connections ?? []).filter((connection) => shouldOfferCloseout(connection, now)),
    [data, now]
  );
  const helpConnection = closeoutConnections.find((connection) => connection.id === helpConnectionId) ?? null;

  function openHelp(connection: LiveConnection) {
    setHelpReason(noShowUnlocked(connection, now) ? 'no_show' : 'other');
    setHelpConnectionId(connection.id);
  }

  async function markComplete(connection: LiveConnection) {
    setBusy(`complete-${connection.id}`);
    setNotice('');
    try {
      const count = await confirmConnectionCompletion(connection.id);
      if (count >= 2 && connection.payment_method === 'aspire') {
        try {
          await releaseAspirePayment(connection.id);
          setNotice('Both people confirmed completion. Aspire started the protected payment release and the connection is moving to History.');
        } catch (releaseError) {
          setNotice(releaseError instanceof Error
            ? `Both people confirmed completion. ${releaseError.message}`
            : 'Both people confirmed completion. Payment release is still being finalized.');
        }
      } else if (count >= 2) {
        setNotice('Both people confirmed completion. The connection is moving to History, where you can review it and choose My Circle.');
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
        <p>Finish cleanly, report a problem, or cancel. Your chat is archived with the connection instead of staying active forever.</p>
      </header>

      {notice && <div className={styles.notice} role="status">{notice}</div>}

      <div className={styles.list}>
        {closeoutConnections.map((connection) => {
          const request = requestMap.get(connection.request_id);
          const otherId = data.userId === connection.requester_id ? connection.responder_id : connection.requester_id;
          const otherName = personName(profileMap.get(otherId));
          const myCompletion = data.completions.some((item) => item.connection_id === connection.id && item.user_id === data.userId);
          const otherCompletion = data.completions.some((item) => item.connection_id === connection.id && item.user_id === otherId);
          const openCase = data.cases.find((item) => item.connection_id === connection.id && isOpenCase(item));
          const canReportNoShow = noShowUnlocked(connection, now);

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

                  {openCase ? (
                    <a href="/resolution">
                      ! View open case
                      <small>A Resolution Center case is already active</small>
                    </a>
                  ) : (
                    <button type="button" onClick={() => openHelp(connection)}>
                      {canReportNoShow ? '! No-show / Get help' : '! Get help'}
                      <small>{canReportNoShow ? 'No-show is available now, or report another issue' : 'Report incomplete work, payment, safety, or another issue'}</small>
                    </button>
                  )}

                  <button
                    className={styles.cancel}
                    type="button"
                    disabled={busy === `cancel-${connection.id}`}
                    onClick={() => void cancel(connection)}
                  >
                    {busy === `cancel-${connection.id}` ? 'Cancelling…' : '× Cancelled'}
                    <small>The activity was called off and should close</small>
                  </button>
                </div>
              )}

              <p className={styles.archiveNote}>Closing a connection never deletes the conversation. Completed and cancelled connections stay in History; completed connections can be reviewed and added to My Circle.</p>
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
            initialReason={helpReason}
            onClose={() => setHelpConnectionId('')}
            onOpened={async () => {
              setHelpConnectionId('');
              await reload(true);
              setNotice('Case opened. If an Aspire payment is secured, provider payout is paused while the case is reviewed.');
            }}
          />
        );
      })()}
    </section>
  );
}
