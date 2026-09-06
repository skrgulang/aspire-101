'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AspireNotification,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  subscribeToNotifications
} from '../lib/supabase/notifications';

function timeAgo(value: string) {
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return 'now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function iconFor(kind: AspireNotification['kind']) {
  if (kind === 'message') return '↗';
  if (kind === 'request_response') return '◌';
  if (kind === 'circle_mutual') return '♧';
  if (kind === 'connection_cancelled') return '×';
  return '✓';
}

export default function NotificationCenter({
  userId,
  onShowRequests,
  onShowConnections,
  onOpenChat
}: {
  userId: string;
  onShowRequests: () => void;
  onShowConnections: () => void;
  onOpenChat: (connectionId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AspireNotification[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    setLoading(true);
    void fetchNotifications()
      .then((next) => { if (active) setItems(next); })
      .finally(() => { if (active) setLoading(false); });

    const unsubscribe = subscribeToNotifications(userId, (notification) => {
      setItems((current) => [notification, ...current.filter((item) => item.id !== notification.id)].slice(0, 40));
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [userId]);

  const unread = useMemo(() => items.filter((item) => !item.read_at).length, [items]);

  async function read(item: AspireNotification) {
    if (!item.read_at) {
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, read_at: new Date().toISOString() } : entry));
      void markNotificationRead(item.id).catch(() => undefined);
    }

    setOpen(false);
    if (item.kind === 'request_response') {
      onShowRequests();
      return;
    }
    if (item.kind === 'message' && item.connection_id) {
      onOpenChat(item.connection_id);
      return;
    }
    onShowConnections();
  }

  async function readAll() {
    const now = new Date().toISOString();
    setItems((current) => current.map((item) => item.read_at ? item : { ...item, read_at: now }));
    void markAllNotificationsRead().catch(() => undefined);
  }

  return (
    <>
      <button
        type="button"
        className="notificationToggle"
        onClick={() => setOpen(true)}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
      >
        Alerts {unread > 0 && <b className="unreadPill">{unread > 99 ? '99+' : unread}</b>}
      </button>

      {open && (
        <div className="notificationOverlay" role="presentation" onMouseDown={() => setOpen(false)}>
          <aside className="notificationPanel" role="dialog" aria-modal="true" aria-label="Notifications" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div><span>ASPIRE ACTIVITY</span><h2>Notifications</h2></div>
              <div className="notificationHeaderActions">
                {unread > 0 && <button type="button" onClick={readAll}>Mark all read</button>}
                <button type="button" className="notificationClose" onClick={() => setOpen(false)} aria-label="Close notifications">×</button>
              </div>
            </header>

            <div className="notificationList">
              {loading && !items.length && <p className="notificationEmpty">Loading activity…</p>}
              {!loading && !items.length && <div className="notificationEmpty"><strong>All quiet for now.</strong><p>Responses, connection updates, messages, and Circle activity will appear here.</p></div>}
              {items.map((item) => (
                <button type="button" className={`notificationItem ${item.read_at ? '' : 'unread'}`} key={item.id} onClick={() => read(item)}>
                  <i>{iconFor(item.kind)}</i>
                  <div><strong>{item.title}</strong>{item.body && <p>{item.body}</p>}<span>{timeAgo(item.created_at)}</span></div>
                  {!item.read_at && <b aria-label="Unread" />}
                </button>
              ))}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
