'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchLiveConnections, type LiveConnection, type LiveConnectionProfile } from '../lib/supabase/liveConnections';
import { fetchResolutionCases, type ConnectionResolutionCase } from '../lib/supabase/resolution';
import ResolutionCaseStatus from './ResolutionCaseStatus';
import ResolutionCenterModal from './ResolutionCenterModal';
import styles from './ResolutionQuickPanel.module.css';

function personName(profile?: LiveConnectionProfile) {
  return profile?.display_name || profile?.full_name || profile?.name || 'Aspire student';
}

export default function ResolutionQuickPanel() {
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchLiveConnections>> | null>(null);
  const [cases, setCases] = useState<ConnectionResolutionCase[]>([]);
  const [helpConnectionId, setHelpConnectionId] = useState('');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');

  const reload = useCallback(async () => {
    try {
      const next = await fetchLiveConnections();
      const nextCases = await fetchResolutionCases(next.connections.map((item) => item.id));
      setData(next);
      setCases(nextCases);
      setNotice('');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not load your active protection options.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const profileMap = useMemo(() => new Map((data?.profiles ?? []).map((profile) => [profile.id, profile])), [data]);
  const requestMap = useMemo(() => new Map((data?.requests ?? []).map((request) => [request.id, request])), [data]);
  const helpConnection = data?.connections.find((item) => item.id === helpConnectionId) ?? null;

  if (loading) return <section className={styles.panel}><span className={styles.eyebrow}>ASPIRE PROTECTION</span><p>Loading active connections…</p></section>;

  return (
    <section className={styles.panel} aria-label="Resolution Center quick actions">
      <header>
        <div><span className={styles.eyebrow}>ASPIRE PROTECTION</span><h2>Need help with a connection?</h2></div>
        <p>Open a case for no-show, cancellation, incomplete work, payment, or safety issues. Filing a case does not automatically decide fault or move money.</p>
      </header>

      {notice && <div className={styles.notice} role="status">{notice}</div>}

      {!data?.connections.length ? (
        <div className={styles.empty}><strong>No active connections need action.</strong><span>Your current and past cases are listed below.</span></div>
      ) : (
        <div className={styles.list}>
          {data.connections.map((connection: LiveConnection) => {
            const otherId = data.userId === connection.requester_id ? connection.responder_id : connection.requester_id;
            const otherName = personName(profileMap.get(otherId));
            const request = requestMap.get(connection.request_id);
            const openCase = cases.find((item) => item.connection_id === connection.id && ['submitted', 'under_review'].includes(item.status));
            return (
              <article className={styles.row} key={connection.id}>
                <div className={styles.identity}>
                  <i>{otherName.slice(0, 1).toUpperCase()}</i>
                  <div><strong>{request?.title || 'Active Aspire connection'}</strong><span>{otherName} · {request?.category || 'Campus connection'}</span></div>
                </div>
                {openCase ? (
                  <div className={styles.caseWrap}><ResolutionCaseStatus item={openCase} currentUserId={data.userId} otherName={otherName} /></div>
                ) : (
                  <button type="button" onClick={() => setHelpConnectionId(connection.id)}>Get help</button>
                )}
              </article>
            );
          })}
        </div>
      )}

      {helpConnection && (() => {
        const otherId = data!.userId === helpConnection.requester_id ? helpConnection.responder_id : helpConnection.requester_id;
        return (
          <ResolutionCenterModal
            connection={helpConnection}
            currentUserId={data!.userId}
            otherUserId={otherId}
            otherName={personName(profileMap.get(otherId))}
            onClose={() => setHelpConnectionId('')}
            onOpened={async () => {
              setHelpConnectionId('');
              await reload();
              setNotice('Case opened. If an Aspire payment is secured, provider payout is now paused while the case is open.');
            }}
          />
        );
      })()}
    </section>
  );
}
