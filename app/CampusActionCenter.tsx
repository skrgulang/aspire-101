'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  fetchConnectionUnreadCounts,
  fetchMyConnections,
  fetchMyRequestInbox,
  type PublicProfile
} from '../lib/supabase/connections';
import { fetchMarketOrders } from '../lib/supabase/marketplace';
import { fetchMyResolutionHistory } from '../lib/supabase/resolution';
import UiIcon, { type UiIconName } from './UiIcon';
import styles from './CampusActionCenter.module.css';

type ActionItem = {
  key: string;
  title: string;
  detail: string;
  href: string;
  icon: UiIconName;
  tone: 'gold' | 'blue' | 'red';
};

function profileName(profile?: PublicProfile) {
  return profile?.display_name || profile?.full_name || profile?.name || 'another student';
}

export default function CampusActionCenter() {
  const [items, setItems] = useState<ActionItem[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setUnavailable(false);

    try {
      const inboxPromise = fetchMyRequestInbox();
      const connectionsPromise = fetchMyConnections();
      const unreadPromise = fetchConnectionUnreadCounts();
      const resolutionPromise = fetchMyResolutionHistory();
      const [inbox, connectionData, unreadRows, resolutionHistory] = await Promise.all([
        inboxPromise,
        connectionsPromise,
        unreadPromise,
        resolutionPromise
      ]);

      const orders = await fetchMarketOrders(connectionData.connections.map((connection) => connection.id));
      const requestMap = new Map(connectionData.requests.map((request) => [request.id, request]));
      const inboxRequestMap = new Map(inbox.requests.map((request) => [request.id, request]));
      const connectionProfileMap = new Map(connectionData.profiles.map((profile) => [profile.id, profile]));
      const next: ActionItem[] = [];

      connectionData.connections
        .filter((connection) =>
          connection.status === 'pending'
          && connection.responder_id === connectionData.userId
          && connection.requester_confirmed
          && !connection.responder_confirmed
        )
        .slice(0, 2)
        .forEach((connection) => {
          const request = requestMap.get(connection.request_id);
          const other = connectionProfileMap.get(connection.requester_id);
          next.push({
            key: `confirm-${connection.id}`,
            title: 'Confirm this connection',
            detail: `${request?.title || 'Campus connection'} · ${profileName(other)} chose you`,
            href: '/connections#my-activity',
            icon: 'check',
            tone: 'gold'
          });
        });

      const pendingByRequest = new Map<string, number>();
      inbox.responses
        .filter((response) => response.status === 'pending' && inboxRequestMap.get(response.request_id)?.status === 'open')
        .forEach((response) => pendingByRequest.set(response.request_id, (pendingByRequest.get(response.request_id) || 0) + 1));

      Array.from(pendingByRequest.entries()).slice(0, 2).forEach(([requestId, count]) => {
        const request = inboxRequestMap.get(requestId);
        next.push({
          key: `choose-${requestId}`,
          title: `Choose from ${count} ${count === 1 ? 'response' : 'responses'}`,
          detail: request?.title || 'Your campus post has a new response',
          href: '/connections#my-activity',
          icon: 'users',
          tone: 'gold'
        });
      });

      orders.forEach((order) => {
        const request = requestMap.get(order.request_id);
        const title = request?.title || 'Marketplace order';
        const href = `/transactions?connection=${encodeURIComponent(order.connection_id)}`;

        if (['awaiting_payment', 'payment_processing'].includes(order.status) && order.buyer_id === connectionData.userId) {
          next.push({ key: `pay-${order.id}`, title: `Finish payment for ${title}`, detail: 'Protected checkout is waiting for you.', href, icon: 'wallet', tone: 'gold' });
        } else if (order.status === 'paid' && order.seller_id === connectionData.userId && !order.seller_handed_off_at) {
          next.push({ key: `handoff-${order.id}`, title: `Hand off ${title}`, detail: 'The buyer has paid. Record the handoff when it happens.', href, icon: 'tag', tone: 'blue' });
        } else if (order.status === 'handoff_confirmed' && order.buyer_id === connectionData.userId && !order.buyer_received_at) {
          next.push({ key: `receive-${order.id}`, title: `Confirm ${title} arrived`, detail: 'Inspect the item before releasing seller payout.', href, icon: 'check', tone: 'blue' });
        } else if (order.status === 'release_ready') {
          next.push({ key: `release-${order.id}`, title: 'Release seller payout', detail: `${title} is ready for payout.`, href, icon: 'wallet', tone: 'blue' });
        } else if (order.status === 'disputed') {
          next.push({ key: `dispute-${order.id}`, title: 'Follow a reported order issue', detail: `${title} is under review and payout is paused.`, href, icon: 'shield', tone: 'red' });
        }
      });

      const unreadTotal = unreadRows.reduce((sum, row) => sum + row.unread_count, 0);
      if (unreadTotal > 0) {
        next.push({
          key: 'unread-messages',
          title: `Read ${unreadTotal} new ${unreadTotal === 1 ? 'message' : 'messages'}`,
          detail: 'A connection is waiting for your reply.',
          href: '/connections',
          icon: 'message',
          tone: 'blue'
        });
      }

      const openCases = resolutionHistory.cases.filter((item) => ['submitted', 'under_review'].includes(item.status));
      if (openCases.length > 0) {
        next.push({
          key: 'resolution-cases',
          title: `Check ${openCases.length} open ${openCases.length === 1 ? 'case' : 'cases'}`,
          detail: 'Review updates or add information in Resolution Center.',
          href: '/resolution',
          icon: 'shield',
          tone: 'red'
        });
      }

      setTotalItems(next.length);
      setItems(next.slice(0, 4));
    } catch {
      setUnavailable(true);
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const refresh = () => void load(true);
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [load]);

  if (loading) {
    return (
      <section className={styles.center} aria-label="Loading items that need your attention">
        <div className={styles.loading}><i /><span /><span /></div>
      </section>
    );
  }

  return (
    <section className={styles.center} aria-labelledby="action-center-title">
      <header className={styles.head}>
        <div>
          <span>YOUR NEXT STEP</span>
          <h2 id="action-center-title">Needs your attention</h2>
        </div>
        {items.length > 0 && <b aria-label={`${totalItems} items need attention`}>{totalItems}</b>}
      </header>

      {unavailable ? (
        <a className={styles.fallback} href="/connections">
          <span><strong>Couldn’t refresh your tasks right now.</strong><small>Your activity is still available in Inbox and Orders.</small></span>
          <UiIcon name="chevron" />
        </a>
      ) : items.length > 0 ? (
        <div className={styles.list}>
          {items.map((item) => (
            <a className={styles.item} href={item.href} key={item.key}>
              <i className={styles[item.tone]}><UiIcon name={item.icon} /></i>
              <span><strong>{item.title}</strong><small>{item.detail}</small></span>
              <UiIcon name="chevron" />
            </a>
          ))}
        </div>
      ) : (
        <div className={styles.clear}>
          <i><UiIcon name="check" /></i>
          <span><strong>You’re all caught up.</strong><small>New replies, messages, payments, and case updates will appear here.</small></span>
          <a href="/connections">Open Inbox →</a>
        </div>
      )}
    </section>
  );
}
