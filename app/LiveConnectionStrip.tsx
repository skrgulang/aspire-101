'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchLiveConnections,
  LiveConnection,
  LiveConnectionProfile,
  LiveConnectionRequest,
  ConnectionLocationShare,
  setConnectionCoordinationStatus,
  setConnectionSchedule,
  shareConnectionLocation,
  stopConnectionLocationShare
} from '../lib/supabase/liveConnections';
import { cancelConnection } from '../lib/supabase/connections';
import {
  confirmConnectionCompletion,
  fetchCompletionConfirmations,
  releaseAspirePayment,
  type CompletionConfirmation
} from '../lib/supabase/payments';
import ConnectionEventTimeline from './ConnectionEventTimeline';
import styles from './LiveConnectionStrip.module.css';

type Data = {
  userId: string;
  connections: LiveConnection[];
  requests: LiveConnectionRequest[];
  profiles: LiveConnectionProfile[];
  locations: ConnectionLocationShare[];
  completions: CompletionConfirmation[];
};

const emptyData: Data = { userId: '', connections: [], requests: [], profiles: [], locations: [], completions: [] };

function personName(profile?: LiveConnectionProfile) {
  return profile?.display_name || profile?.full_name || profile?.name || 'Aspire student';
}

function timerCopy(startAt: string | null, now: number) {
  if (!startAt) return { label: 'TIME NOT SET', value: 'Coordinate a time', detail: 'Set it together before meeting.' };
  const start = new Date(startAt).getTime();
  const diff = start - now;
  const abs = Math.abs(diff);
  const hours = Math.floor(abs / 3_600_000);
  const minutes = Math.floor((abs % 3_600_000) / 60_000);
  const days = Math.floor(hours / 24);
  if (diff > 0) {
    const value = days > 0 ? `Starts in ${days}d ${hours % 24}h` : hours > 0 ? `Starts in ${hours}h ${minutes}m` : `Starts in ${Math.max(1, minutes)}m`;
    return { label: 'UP NEXT', value, detail: new Date(startAt).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) };
  }
  if (abs < 3_600_000) return { label: 'START TIME', value: 'Starting now', detail: new Date(startAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) };
  return { label: 'START TIME PASSED', value: `${hours}h ${minutes}m ago`, detail: 'Use the status buttons to keep the other person updated.' };
}

function statusLabel(status: LiveConnection['coordination_status']) {
  if (status === 'on_the_way') return 'On the way';
  if (status === 'arrived') return 'Arrived';
  if (status === 'in_progress') return 'In progress';
  if (status === 'scheduled') return 'Scheduled';
  return 'Planning';
}

function stageIndex(status: LiveConnection['coordination_status'], selfComplete: boolean) {
  if (selfComplete) return 4;
  if (status === 'in_progress') return 3;
  if (status === 'arrived') return 2;
  if (status === 'on_the_way') return 1;
  return 0;
}

export default function LiveConnectionStrip() {
  const [data, setData] = useState<Data>(emptyData);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [editingId, setEditingId] = useState('');
  const [startLocal, setStartLocal] = useState('');
  const [endLocal, setEndLocal] = useState('');
  const [meetingLabel, setMeetingLabel] = useState('');
  const [now, setNow] = useState(Date.now());

  const reload = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const next = await fetchLiveConnections();
      const completions = next.connections.length
        ? await fetchCompletionConfirmations(next.connections.map((connection) => connection.id)).catch(() => [] as CompletionConfirmation[])
        : [];
      setData({ ...next, completions });
      setNotice('');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not load active connections.');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    const refresh = window.setInterval(() => void reload(true), 45_000);
    return () => { window.clearInterval(timer); window.clearInterval(refresh); };
  }, [reload]);

  const requestMap = useMemo(() => new Map(data.requests.map((request) => [request.id, request])), [data.requests]);
  const profileMap = useMemo(() => new Map(data.profiles.map((profile) => [profile.id, profile])), [data.profiles]);

  function beginSchedule(connection: LiveConnection, reschedule = false) {
    setEditingId(connection.id);
    setMeetingLabel(connection.meeting_label || '');
    const localValue = connection.scheduled_start_at
      ? new Date(new Date(connection.scheduled_start_at).getTime() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
      : '';
    const localEnd = connection.scheduled_end_at
      ? new Date(new Date(connection.scheduled_end_at).getTime() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
      : '';
    setStartLocal(localValue);
    setEndLocal(localEnd);
    if (reschedule) setNotice('Need a different time? Update the plan here, then message the other person so the change is clear.');
  }

  async function saveSchedule(connectionId: string) {
    if (!startLocal) return setNotice('Choose a start time first.');
    setBusy(`schedule-${connectionId}`);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const startAt = new Date(startLocal).toISOString();
      const endAt = endLocal ? new Date(endLocal).toISOString() : undefined;
      await setConnectionSchedule(connectionId, startAt, timezone, meetingLabel, endAt);
      setEditingId('');
      await reload(true);
      setNotice('Time updated. Both people can see it on the active connection.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not update the time.');
    } finally {
      setBusy('');
    }
  }

  async function updateStatus(connectionId: string, status: 'on_the_way' | 'arrived' | 'in_progress') {
    setBusy(`${status}-${connectionId}`);
    try {
      await setConnectionCoordinationStatus(connectionId, status);
      await reload(true);
      setNotice(status === 'on_the_way' ? 'The other person can now see that you are on the way.' : status === 'arrived' ? 'Marked arrived.' : 'Task started. When it is finished, mark the connection complete.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not update your status.');
    } finally {
      setBusy('');
    }
  }

  async function completeConnection(connection: LiveConnection) {
    setBusy(`complete-${connection.id}`);
    try {
      const count = await confirmConnectionCompletion(connection.id);
      if (count >= 2 && connection.payment_method === 'aspire') {
        try {
          await releaseAspirePayment(connection.id);
          setNotice('Both people marked complete. Aspire payment release was started and this connection is moving to history.');
        } catch (releaseError) {
          setNotice(releaseError instanceof Error
            ? `Both people marked complete. ${releaseError.message}`
            : 'Both people marked complete. Payment release is still being finalized.');
        }
      } else if (count >= 2) {
        setNotice('Both people marked complete. This connection is moving to history.');
      } else {
        setNotice('You marked this complete. Waiting for the other person before Aspire closes it.');
      }
      await reload(true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not mark this connection complete.');
    } finally {
      setBusy('');
    }
  }

  async function cancelActiveConnection(connection: LiveConnection) {
    const protectedCopy = connection.payment_method === 'aspire'
      ? ' If an Aspire payment is secured, it will stay protected and will not be paid out automatically.'
      : '';
    if (!window.confirm(`Cancel this connection? This closes the active plan.${protectedCopy}`)) return;
    setBusy(`cancel-${connection.id}`);
    try {
      await cancelConnection(connection.id);
      setNotice(connection.payment_method === 'aspire'
        ? 'Connection cancelled. Any secured Aspire payment stays protected; cancellation does not automatically release money.'
        : 'Connection cancelled. It is no longer active.');
      await reload(true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not cancel this connection.');
    } finally {
      setBusy('');
    }
  }

  async function shareLocation(connectionId: string) {
    if (!navigator.geolocation) return setNotice('Location sharing is not supported in this browser.');
    setBusy(`location-${connectionId}`);
    setNotice('Your browser will ask for location permission. Aspire only shares it after you approve.');
    navigator.geolocation.getCurrentPosition(async (position) => {
      try {
        await shareConnectionLocation(
          connectionId,
          position.coords.latitude,
          position.coords.longitude,
          Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
          30
        );
        await reload(true);
        setNotice('Live location shared for 30 minutes. You can stop sharing at any time.');
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'Could not share your location.');
      } finally {
        setBusy('');
      }
    }, (error) => {
      setBusy('');
      setNotice(error.code === error.PERMISSION_DENIED ? 'Location was not shared because permission was not granted.' : 'Could not get your current location.');
    }, { enableHighAccuracy: true, timeout: 12_000, maximumAge: 15_000 });
  }

  async function stopLocation(connectionId: string) {
    setBusy(`stop-location-${connectionId}`);
    try {
      await stopConnectionLocationShare(connectionId);
      await reload(true);
      setNotice('Live location sharing stopped.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not stop location sharing.');
    } finally {
      setBusy('');
    }
  }

  if (loading) return null;
  if (!data.connections.length && !notice) return null;

  return (
    <section className={styles.section} aria-label="Active Aspire connections">
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>ASPIRE LIVE</p>
          <h2>Active connections</h2>
        </div>
        <p>Plan it, meet, finish, and close the loop without leaving Aspire.</p>
      </div>

      {notice && <div className={styles.notice} role="status">{notice}</div>}

      <div className={styles.grid}>
        {data.connections.map((connection) => {
          const request = requestMap.get(connection.request_id);
          const otherId = data.userId === connection.requester_id ? connection.responder_id : connection.requester_id;
          const other = profileMap.get(otherId);
          const otherName = personName(other);
          const timer = timerCopy(connection.scheduled_start_at, now);
          const myShare = data.locations.find((location) => location.connection_id === connection.id && location.user_id === data.userId);
          const otherShare = data.locations.find((location) => location.connection_id === connection.id && location.user_id === otherId);
          const myCompletion = data.completions.some((item) => item.connection_id === connection.id && item.user_id === data.userId);
          const otherCompletion = data.completions.some((item) => item.connection_id === connection.id && item.user_id === otherId);
          const currentStage = stageIndex(connection.coordination_status, myCompletion);
          const mapHref = otherShare ? `https://www.google.com/maps?q=${encodeURIComponent(`${otherShare.latitude},${otherShare.longitude}`)}` : '';
          const stages = ['Plan', 'On the way', 'Arrived', 'In progress', 'Complete'];

          return (
            <article key={connection.id} className={styles.card}>
              <div className={styles.top}>
                <div className={styles.identity}>
                  <div className={styles.avatar}>{otherName.slice(0, 1).toUpperCase()}</div>
                  <div><span>WITH</span><strong>{otherName}</strong></div>
                </div>
                <span className={styles.badge}>{statusLabel(connection.coordination_status)}</span>
              </div>

              <div className={styles.request}>
                <h3>{request?.title || 'Active Aspire connection'}</h3>
                <p>{[request?.category, request?.campus].filter(Boolean).join(' · ') || 'Campus connection'}</p>
              </div>

              <div className={styles.journey} aria-label="Connection progress">
                {stages.map((stage, index) => (
                  <div className={index < currentStage ? styles.stageDone : index === currentStage ? styles.stageCurrent : ''} key={stage}>
                    <i>{index < currentStage ? '✓' : index + 1}</i>
                    <span>{stage}</span>
                  </div>
                ))}
              </div>

              <div className={styles.timer}>
                <span>{timer.label}</span>
                <strong>{timer.value}</strong>
                <small>{connection.meeting_label ? `${timer.detail} · ${connection.meeting_label}` : timer.detail}</small>
              </div>

              {editingId === connection.id && (
                <div className={styles.editor}>
                  <div className={styles.editorRow}>
                    <label>Start time<input type="datetime-local" value={startLocal} onChange={(event) => setStartLocal(event.target.value)} /></label>
                    <label>Optional end time<input type="datetime-local" value={endLocal} onChange={(event) => setEndLocal(event.target.value)} /></label>
                  </div>
                  <label>Meeting point or place<input value={meetingLabel} maxLength={240} placeholder="e.g. PMU main entrance" onChange={(event) => setMeetingLabel(event.target.value)} /></label>
                  <div className={styles.actions}>
                    <button className={styles.primary} type="button" disabled={busy === `schedule-${connection.id}`} onClick={() => void saveSchedule(connection.id)}>Save plan</button>
                    <button type="button" onClick={() => setEditingId('')}>Close</button>
                  </div>
                </div>
              )}

              {otherShare && (
                <div className={styles.locationNotice}>
                  <span>{otherName} shared location temporarily.</span>
                  <a href={mapHref} target="_blank" rel="noreferrer">Open map ↗</a>
                </div>
              )}

              <ConnectionEventTimeline connectionId={connection.id} userId={data.userId} otherName={otherName} />

              <div className={styles.actions}>
                <a className={styles.primary} href="#my-activity">Open chat ↓</a>
                <button type="button" onClick={() => beginSchedule(connection)}>Set time</button>
                <button type="button" onClick={() => beginSchedule(connection, true)}>Reschedule</button>
                <button type="button" disabled={busy === `on_the_way-${connection.id}`} onClick={() => void updateStatus(connection.id, 'on_the_way')}>On my way</button>
                <button type="button" disabled={busy === `arrived-${connection.id}`} onClick={() => void updateStatus(connection.id, 'arrived')}>I&apos;ve arrived</button>
                <button type="button" disabled={busy === `in_progress-${connection.id}`} onClick={() => void updateStatus(connection.id, 'in_progress')}>Start task</button>
                {!myCompletion ? (
                  <button className={styles.complete} type="button" disabled={busy === `complete-${connection.id}`} onClick={() => void completeConnection(connection)}>
                    {busy === `complete-${connection.id}` ? 'Saving…' : 'Complete ✓'}
                  </button>
                ) : (
                  <span className={styles.waiting}>{otherCompletion ? 'Both marked complete' : 'You completed · waiting on them'}</span>
                )}
                {!myShare ? (
                  <button type="button" disabled={busy === `location-${connection.id}`} onClick={() => void shareLocation(connection.id)}>Share location · 30m</button>
                ) : (
                  <button className={styles.danger} type="button" disabled={busy === `stop-location-${connection.id}`} onClick={() => void stopLocation(connection.id)}>Stop sharing</button>
                )}
              </div>

              <div className={styles.closeout}>
                <div><strong>Plans changed?</strong><span>Reschedule if you still intend to meet. Cancel only when this connection is actually ending.</span></div>
                <div className={styles.closeoutActions}>
                  <a href="/safety">Get help</a>
                  <button type="button" disabled={busy === `cancel-${connection.id}`} onClick={() => void cancelActiveConnection(connection)}>
                    {busy === `cancel-${connection.id}` ? 'Cancelling…' : 'Cancel connection'}
                  </button>
                </div>
              </div>

              <div className={styles.privacy}><strong>Location is always optional.</strong> It is shared only after browser permission, only with the other person in this connection, and expires automatically.</div>
            </article>
          );
        })}
      </div>
    </section>
  );
}