'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import type { AspireRequest } from '../lib/supabase/requests';
import UiIcon from './UiIcon';
import { buildDemoAspireRequests, isDemoPreviewPostId, isPreviewDemoEnabled, setDemoPreviewPostStatus } from './demoPreviewPosts';
import styles from './MyActivityManager.module.css';

type ConnectionRow = { request_id: string; status: string };
type Filter = 'all' | 'open' | 'closed';

function money(request: AspireRequest) {
  if (request.kind === 'community' || request.kind === 'collaboration') return 'Free';
  if (request.amount_cents == null) return request.kind === 'split_cost' ? 'Split cost' : 'Price not set';
  return `$${(request.amount_cents / 100).toFixed(request.amount_cents % 100 ? 2 : 0)}`;
}

function relativeTime(value: string) {
  const ms = Date.now() - new Date(value).getTime();
  const hours = Math.max(1, Math.round(ms / 3600000));
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export default function MyActivityManager() {
  const [requests, setRequests] = useState<AspireRequest[]>([]);
  const [connections, setConnections] = useState<ConnectionRow[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setNotice('');
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!auth.user) {
        window.location.assign('/login?next=/activity');
        return;
      }

      const { data: rows, error } = await supabase
        .from('requests')
        .select('*')
        .eq('poster_id', auth.user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const realRequests = (rows ?? []) as AspireRequest[];
      const previewRequests = isPreviewDemoEnabled() ? buildDemoAspireRequests(auth.user.id, 'Purdue University') : [];
      setRequests([...previewRequests, ...realRequests].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));

      if (!realRequests.length) {
        setConnections([]);
        return;
      }

      const { data: connectionRows, error: connectionError } = await supabase
        .from('connections')
        .select('request_id,status')
        .in('request_id', realRequests.map((request) => request.id));
      if (connectionError) throw connectionError;
      setConnections((connectionRows ?? []) as ConnectionRow[]);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not load your posts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => requests.filter((request) => {
    if (filter === 'open') return request.status === 'open';
    if (filter === 'closed') return request.status !== 'open';
    return true;
  }), [filter, requests]);

  const counts = useMemo(() => ({
    all: requests.length,
    open: requests.filter((request) => request.status === 'open').length,
    closed: requests.filter((request) => request.status !== 'open').length
  }), [requests]);

  function hasActiveConnection(requestId: string) {
    if (isDemoPreviewPostId(requestId)) return false;
    return connections.some((connection) => connection.request_id === requestId && connection.status !== 'cancelled');
  }

  async function closePost(request: AspireRequest) {
    if (!window.confirm(`Close “${request.title}”? It will stop appearing in Browse, but its history will be preserved.`)) return;
    setBusyId(request.id);
    setNotice('');
    try {
      if (isDemoPreviewPostId(request.id)) {
        setDemoPreviewPostStatus(request.id, 'cancelled');
        setRequests((current) => current.map((item) => item.id === request.id ? { ...item, status: 'cancelled' } : item));
        setNotice('Preview post closed. It is now hidden from Home and Browse.');
        return;
      }
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.from('requests').update({ status: 'cancelled' }).eq('id', request.id);
      if (error) throw error;
      setRequests((current) => current.map((item) => item.id === request.id ? { ...item, status: 'cancelled' } : item));
      setNotice('Post closed.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not close this post.');
    } finally {
      setBusyId('');
    }
  }

  async function deletePost(request: AspireRequest) {
    if (hasActiveConnection(request.id)) {
      setNotice('This post has an active or completed connection, so it cannot be permanently deleted. Close it instead to preserve the transaction and safety trail.');
      return;
    }
    if (!window.confirm(`Permanently delete “${request.title}”? This also removes pending responses to this post and cannot be undone.`)) return;

    setBusyId(request.id);
    setNotice('');
    try {
      if (isDemoPreviewPostId(request.id)) {
        setDemoPreviewPostStatus(request.id, 'deleted');
        setRequests((current) => current.filter((item) => item.id !== request.id));
        setNotice('Preview post deleted.');
        return;
      }
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.from('requests').delete().eq('id', request.id);
      if (error) throw error;
      setRequests((current) => current.filter((item) => item.id !== request.id));
      setNotice('Post deleted permanently.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not delete this post.');
    } finally {
      setBusyId('');
    }
  }

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <span>YOUR STUFF</span>
          <h1>My Activity</h1>
          <p>Manage the posts you created. Close a post when it is no longer needed, or permanently delete it when there is no active connection.</p>
        </div>
        <a href="/post"><UiIcon name="plus" /> New post</a>
      </header>

      <div className={styles.stats}>
        <article><strong>{counts.all}</strong><span>Total posts</span></article>
        <article><strong>{counts.open}</strong><span>Open</span></article>
        <article><strong>{counts.closed}</strong><span>Closed</span></article>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.tabs}>
          <button className={filter === 'all' ? styles.active : ''} onClick={() => setFilter('all')}>All <b>{counts.all}</b></button>
          <button className={filter === 'open' ? styles.active : ''} onClick={() => setFilter('open')}>Open <b>{counts.open}</b></button>
          <button className={filter === 'closed' ? styles.active : ''} onClick={() => setFilter('closed')}>Closed <b>{counts.closed}</b></button>
        </div>
        <a href="/connections">Responses & messages →</a>
      </div>

      {notice && <div className={styles.notice} role="status">{notice}</div>}

      {loading ? (
        <div className={styles.empty}>Loading your posts…</div>
      ) : !visible.length ? (
        <div className={styles.empty}>
          <strong>No posts here yet.</strong>
          <span>Create a post and it will show up here for you to manage.</span>
          <a href="/post">Post something →</a>
        </div>
      ) : (
        <div className={styles.list}>
          {visible.map((request) => {
            const protectedHistory = hasActiveConnection(request.id);
            const preview = isDemoPreviewPostId(request.id);
            return (
              <article className={styles.card} key={request.id}>
                <div className={styles.cardMain}>
                  <div className={styles.category}>{preview ? 'Preview · ' : ''}{request.category}</div>
                  <h2>{request.title}</h2>
                  <p>{request.details || 'No description added.'}</p>
                  <div className={styles.meta}>
                    <span>{money(request)}</span>
                    <span>{request.campus || 'Campus'}</span>
                    <span>{relativeTime(request.created_at)}</span>
                  </div>
                </div>

                <div className={styles.cardSide}>
                  <span className={`${styles.status} ${styles[`status_${request.status}`] || ''}`}>{request.status.replace('_', ' ')}</span>
                  {preview && <small>Posted by your current preview account</small>}
                  {protectedHistory && <small><UiIcon name="shield" /> Activity history protected</small>}
                  <div className={styles.actions}>
                    {request.status === 'open' && (
                      <button type="button" onClick={() => closePost(request)} disabled={busyId === request.id}>Close post</button>
                    )}
                    {!protectedHistory && (
                      <button type="button" className={styles.delete} onClick={() => deletePost(request)} disabled={busyId === request.id}>
                        {busyId === request.id ? 'Working…' : 'Delete'}
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
