'use client';

import { useEffect, useMemo, useState } from 'react';
import AppDock from '../../AppDock';
import { getSupabaseBrowserClient } from '../../../lib/supabase/client';
import { fetchDeliveryBoard, deliveryStatusLabel, rewardLabel, type DeliveryBoardData, type DeliveryJob, type DeliveryOffer } from '../../../lib/supabase/delivery';
import styles from './DeliveryActivity.module.css';

type View = 'all' | 'action' | 'unread' | 'active' | 'completed';
type AlertTone = 'action' | 'update' | 'complete';
type Urgency = 'overdue' | 'soon' | null;

type DeliveryAlert = {
  id: string;
  job: DeliveryJob;
  title: string;
  body: string;
  tone: AlertTone;
  href: string;
  actionLabel: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  unreadKey: string;
  urgency: Urgency;
};

const EMPTY_BOARD: DeliveryBoardData = { jobs: [], requests: new Map(), offers: [], profiles: new Map() };
const SEEN_KEY = 'aspire-delivery-activity-seen-v1';

function profileName(board: DeliveryBoardData, userId: string | null) {
  if (!userId) return 'Aspirer';
  const profile = board.profiles.get(userId);
  return profile?.display_name || profile?.full_name || profile?.name || 'Aspirer';
}

function timeAgo(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  if (diff < 60_000) return 'just now';
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function urgencyFor(job: DeliveryJob): Urgency {
  if (!job.preferred_at || ['completed', 'cancelled'].includes(job.status)) return null;
  const preferred = new Date(job.preferred_at).getTime();
  if (!Number.isFinite(preferred)) return null;
  const diff = preferred - Date.now();
  if (diff < 0) return 'overdue';
  if (diff <= 2 * 60 * 60 * 1000) return 'soon';
  return null;
}

function pendingOfferForRequester(offers: DeliveryOffer[], userId: string | null) {
  return offers.filter((offer) => ['pending', 'countered'].includes(offer.status) && offer.last_actor_id !== userId);
}

function buildAlert(
  job: DeliveryJob,
  board: DeliveryBoardData,
  userId: string | null,
  offers: DeliveryOffer[],
  paymentStatusByConnection: Record<string, string>
): DeliveryAlert | null {
  const request = board.requests.get(job.request_id);
  const title = request?.title || 'Delivery request';
  const isRequester = job.requester_id === userId;
  const isPickupParty = job.pickup_party_id === userId;
  const isDropoffParty = job.dropoff_party_id === userId;
  const isAspirer = job.matched_aspirer_id === userId;
  const ownOffer = offers.find((offer) => offer.aspirer_id === userId);
  const actionHref = `/delivery?job=${encodeURIComponent(job.id)}`;
  const unreadKey = `${job.id}:${job.updated_at}`;
  const urgency = urgencyFor(job);
  const paymentStatus = job.connection_id ? paymentStatusByConnection[job.connection_id] : undefined;

  if (isRequester && job.status === 'offer_received') {
    const actionable = pendingOfferForRequester(offers, userId);
    if (actionable.length) return {
      id: `offers:${job.id}`,
      job,
      title: `${actionable.length} offer${actionable.length === 1 ? '' : 's'} need your response`,
      body: `${title} · review pricing, messages, and counteroffers before choosing an Aspirer.`,
      tone: 'action', href: actionHref, actionLabel: 'Review offers', unreadKey, urgency
    };
  }

  if (
    isRequester
    && job.connection_id
    && Number(job.agreed_reward_cents || 0) > 0
    && ['matched', 'heading_to_pickup'].includes(job.status)
    && !['secured', 'released'].includes(paymentStatus || '')
  ) {
    const paymentKnown = Boolean(paymentStatus);
    return {
      id: `secure:${job.id}`,
      job,
      title: paymentKnown ? 'Secure the delivery reward' : 'Review the delivery reward',
      body: paymentKnown
        ? `${title} matched with ${profileName(board, job.matched_aspirer_id)}. The protected reward must be secured before pickup can begin.`
        : `${title} matched with ${profileName(board, job.matched_aspirer_id)}. Open payment details to verify the protected reward status before pickup.`,
      tone: 'action', href: `/transactions?connection=${encodeURIComponent(job.connection_id)}`, actionLabel: 'Open payment',
      secondaryHref: actionHref, secondaryLabel: 'View delivery', unreadKey, urgency
    };
  }

  if (isAspirer && job.status === 'matched') return {
    id: `heading:${job.id}`, job, title: 'Ready to head to pickup', body: `${title} is matched to you. Open the delivery when you are ready to start moving toward pickup.`,
    tone: 'action', href: actionHref, actionLabel: 'Start pickup', unreadKey, urgency
  };

  if (isPickupParty && ['matched', 'heading_to_pickup'].includes(job.status)) return {
    id: `pickup-code:${job.id}`, job, title: 'Pickup code will be needed', body: `${title} is approaching pickup. Show the one-time code only after the item is physically handed over.`,
    tone: 'action', href: actionHref, actionLabel: 'Open pickup', unreadKey, urgency
  };

  if (isAspirer && ['matched', 'heading_to_pickup'].includes(job.status)) return {
    id: `pickup-confirm:${job.id}`, job, title: 'Confirm pickup with the 4-digit code', body: `${title} is ready for pickup confirmation. Ask the pickup party for the code after the handoff.`,
    tone: 'action', href: actionHref, actionLabel: 'Confirm pickup', unreadKey, urgency
  };

  if (isDropoffParty && ['picked_up', 'on_the_way'].includes(job.status)) return {
    id: `delivery-code:${job.id}`, job, title: 'Prepare the delivery code', body: `${title} is on the way. Give the one-time delivery code only after you receive the item.`,
    tone: 'action', href: actionHref, actionLabel: 'Open delivery', unreadKey, urgency
  };

  if (isAspirer && ['picked_up', 'on_the_way'].includes(job.status)) return {
    id: `deliver:${job.id}`, job, title: job.status === 'picked_up' ? 'Start the delivery leg' : 'Complete delivery with the receiver code', body: `${title} is in your active delivery queue.`,
    tone: 'action', href: actionHref, actionLabel: job.status === 'picked_up' ? 'Start delivery' : 'Confirm delivery', unreadKey, urgency
  };

  if ((isRequester || isDropoffParty) && job.status === 'delivered') return {
    id: `closeout:${job.id}`, job, title: 'Confirm you received the delivery', body: `${title} was marked delivered. Complete the receiver side of closeout after you verify the handoff.`,
    tone: 'action', href: actionHref, actionLabel: 'Complete delivery', unreadKey, urgency
  };

  if (isRequester && job.status === 'completed' && job.connection_id && Number(job.agreed_reward_cents || 0) > 0) return {
    id: `release:${job.id}`, job, title: 'Review protected reward release', body: `${title} is completed. Review payout status, disputes, and release eligibility before sending the reward.`,
    tone: 'complete', href: `/transactions?connection=${encodeURIComponent(job.connection_id)}`, actionLabel: 'Payment details',
    secondaryHref: actionHref, secondaryLabel: 'Review delivery', unreadKey, urgency: null
  };

  if (ownOffer && ['pending', 'countered'].includes(ownOffer.status) && ['looking_for_aspirer', 'offer_received'].includes(job.status)) return {
    id: `offer-wait:${job.id}`, job, title: ownOffer.status === 'countered' && ownOffer.last_actor_id !== userId ? 'Requester sent a counteroffer' : 'Your delivery offer is active',
    body: `${title} · current offer ${new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(ownOffer.amount_cents / 100)}.`,
    tone: ownOffer.status === 'countered' && ownOffer.last_actor_id !== userId ? 'action' : 'update', href: actionHref,
    actionLabel: ownOffer.status === 'countered' && ownOffer.last_actor_id !== userId ? 'Review counter' : 'View offer', unreadKey, urgency
  };

  if ((isRequester || isAspirer || isPickupParty || isDropoffParty) && job.status === 'completed') return {
    id: `done:${job.id}`, job, title: 'Delivery completed', body: `${title} is closed. Review the connection history or leave a review.`,
    tone: 'complete', href: actionHref, actionLabel: 'View completed delivery',
    secondaryHref: job.connection_id ? `/connections?connection=${encodeURIComponent(job.connection_id)}&tab=history` : undefined,
    secondaryLabel: job.connection_id ? 'Connection history' : undefined, unreadKey, urgency: null
  };

  if (isRequester || isAspirer || ownOffer) return {
    id: `update:${job.id}`, job, title: deliveryStatusLabel(job.status), body: `${title} · ${job.pickup_area} → ${job.dropoff_area}`,
    tone: 'update', href: actionHref, actionLabel: 'View delivery', unreadKey, urgency
  };

  return null;
}

export default function DeliveryActivityCenter() {
  const [userId, setUserId] = useState<string | null>(null);
  const [campusId, setCampusId] = useState<string | null>(null);
  const [board, setBoard] = useState<DeliveryBoardData>(EMPTY_BOARD);
  const [paymentStatusByConnection, setPaymentStatusByConnection] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [view, setView] = useState<View>('action');
  const [seen, setSeen] = useState<Set<string>>(new Set());

  async function loadActivity(nextCampusId: string) {
    const supabase = getSupabaseBrowserClient();
    const nextBoard = await fetchDeliveryBoard(nextCampusId);
    setBoard(nextBoard);

    const connectionIds = [...new Set(nextBoard.jobs.map((job) => job.connection_id).filter((id): id is string => Boolean(id)))];
    if (!connectionIds.length) {
      setPaymentStatusByConnection({});
      return;
    }

    const { data: payments, error: paymentError } = await supabase
      .from('connection_payments')
      .select('connection_id,status')
      .in('connection_id', connectionIds);

    if (paymentError) {
      setPaymentStatusByConnection({});
      return;
    }

    setPaymentStatusByConnection(Object.fromEntries((payments || []).map((payment) => [payment.connection_id, payment.status])));
  }

  useEffect(() => {
    try { setSeen(new Set(JSON.parse(window.localStorage.getItem(SEEN_KEY) || '[]'))); } catch { setSeen(new Set()); }
    const supabase = getSupabaseBrowserClient();
    void supabase.auth.getUser().then(async ({ data, error }) => {
      if (error) throw error;
      if (!data.user) { window.location.assign('/login?next=%2Fdelivery%2Factivity'); return; }
      setUserId(data.user.id);
      const { data: profile, error: profileError } = await supabase.from('profiles').select('current_campus_id,home_campus_id').eq('id', data.user.id).maybeSingle();
      if (profileError) throw profileError;
      const id = profile?.current_campus_id || profile?.home_campus_id || null;
      setCampusId(id);
      if (!id) throw new Error('Choose your campus in Profile before using Delivery Activity.');
      await loadActivity(id);
    }).catch((error) => setNotice(error instanceof Error ? error.message : 'Could not load delivery activity.')).finally(() => setLoading(false));
  }, []);

  const offersByJob = useMemo(() => {
    const map = new Map<string, DeliveryOffer[]>();
    for (const offer of board.offers) map.set(offer.delivery_job_id, [...(map.get(offer.delivery_job_id) || []), offer]);
    return map;
  }, [board.offers]);

  const alerts = useMemo(() => board.jobs
    .map((job) => buildAlert(job, board, userId, offersByJob.get(job.id) || [], paymentStatusByConnection))
    .filter((alert): alert is DeliveryAlert => Boolean(alert))
    .sort((a, b) => {
      if (a.tone === 'action' && b.tone !== 'action') return -1;
      if (a.tone !== 'action' && b.tone === 'action') return 1;
      const urgencyRank = (value: Urgency) => value === 'overdue' ? 2 : value === 'soon' ? 1 : 0;
      if (urgencyRank(a.urgency) !== urgencyRank(b.urgency)) return urgencyRank(b.urgency) - urgencyRank(a.urgency);
      return new Date(b.job.updated_at).getTime() - new Date(a.job.updated_at).getTime();
    }), [board, offersByJob, paymentStatusByConnection, userId]);

  const unreadCount = alerts.filter((alert) => !seen.has(alert.unreadKey)).length;
  const actionCount = alerts.filter((alert) => alert.tone === 'action').length;
  const activeCount = alerts.filter((alert) => !['completed', 'cancelled'].includes(alert.job.status)).length;

  const visible = alerts.filter((alert) => {
    if (view === 'action') return alert.tone === 'action';
    if (view === 'unread') return !seen.has(alert.unreadKey);
    if (view === 'active') return !['completed', 'cancelled'].includes(alert.job.status);
    if (view === 'completed') return alert.job.status === 'completed';
    return true;
  });

  function persistSeen(next: Set<string>) {
    setSeen(next);
    window.localStorage.setItem(SEEN_KEY, JSON.stringify([...next]));
  }

  function markSeen(key: string) {
    const next = new Set(seen);
    next.add(key);
    persistSeen(next);
  }

  function markAllSeen() {
    persistSeen(new Set(alerts.map((alert) => alert.unreadKey)));
  }

  async function refresh() {
    if (!campusId) return;
    try { await loadActivity(campusId); setNotice('Delivery activity refreshed.'); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Could not refresh delivery activity.'); }
  }

  return <main className={styles.page}>
    <AppDock active="delivery" />
    <div className={styles.shell}>
      <section className={styles.hero}>
        <div><p className={styles.eyebrow}>ASPIRE DELIVERY · ACTIVITY</p><h1>Your delivery inbox.</h1><p>See what needs your attention, recent offer changes, urgent handoffs, and completed delivery follow-up without scanning every request.</p></div>
        <div className={styles.heroActions}><a className={styles.gold} href="/delivery">Open Delivery Board</a><button className={styles.outline} type="button" onClick={() => void refresh()} disabled={!campusId}>Refresh</button></div>
      </section>

      {notice && <div className={styles.notice}>{notice}</div>}

      <section className={styles.summary}>
        <button type="button" onClick={() => setView('action')}><strong>{actionCount}</strong><span>Need action</span></button>
        <button type="button" onClick={() => setView('unread')}><strong>{unreadCount}</strong><span>Unread updates</span></button>
        <button type="button" onClick={() => setView('active')}><strong>{activeCount}</strong><span>Active deliveries</span></button>
        <button type="button" onClick={() => setView('completed')}><strong>{alerts.filter((alert) => alert.job.status === 'completed').length}</strong><span>Completed</span></button>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelTop}>
          <div><p className={styles.eyebrow}>ACTIVITY FEED</p><h2>Delivery updates</h2></div>
          <button className={styles.mutedButton} type="button" onClick={markAllSeen} disabled={!unreadCount}>Mark all read</button>
        </div>

        <div className={styles.tabs}>{([
          ['all', 'All'], ['action', 'Needs action'], ['unread', 'Unread'], ['active', 'Active'], ['completed', 'Completed']
        ] as [View, string][]).map(([value, label]) => <button key={value} type="button" className={view === value ? styles.tabActive : styles.tab} onClick={() => setView(value)}>{label}</button>)}</div>

        {loading ? <div className={styles.empty}>Loading your delivery activity…</div> : !visible.length ? <div className={styles.empty}><strong>Nothing here right now.</strong><span>When offers, pickup steps, delivery confirmations, or closeout actions need you, they will appear here.</span></div> : <div className={styles.feed}>{visible.map((alert) => {
          const unread = !seen.has(alert.unreadKey);
          const reward = rewardLabel(alert.job.reward_mode, alert.job.reward_cents);
          return <article key={alert.id} className={`${styles.card} ${alert.tone === 'action' ? styles.cardAction : ''} ${unread ? styles.cardUnread : ''}`}>
            <div className={styles.cardMain}>
              <div className={styles.cardHeading}><div className={styles.icon}>{alert.tone === 'complete' ? '✓' : alert.tone === 'action' ? '!' : '•'}</div><div><div className={styles.titleRow}><h3>{alert.title}</h3>{unread && <span className={styles.newBadge}>NEW</span>}{alert.urgency && <span className={styles.urgentBadge}>{alert.urgency === 'overdue' ? 'OVERDUE' : 'TIME-SENSITIVE'}</span>}</div><p>{alert.body}</p></div></div>
              <div className={styles.meta}><span>{deliveryStatusLabel(alert.job.status)}</span><span>{reward}</span><span>{alert.job.pickup_area} → {alert.job.dropoff_area}</span><span>Updated {timeAgo(alert.job.updated_at)}</span></div>
            </div>
            <div className={styles.actions}>
              <a className={styles.gold} href={alert.href} onClick={() => markSeen(alert.unreadKey)}>{alert.actionLabel}</a>
              {alert.secondaryHref && <a className={styles.outline} href={alert.secondaryHref} onClick={() => markSeen(alert.unreadKey)}>{alert.secondaryLabel}</a>}
              {alert.job.connection_id && <a className={styles.textLink} href={`/resolution?connection=${encodeURIComponent(alert.job.connection_id)}`}>Report issue</a>}
              {unread && <button className={styles.textButton} type="button" onClick={() => markSeen(alert.unreadKey)}>Mark read</button>}
            </div>
          </article>;
        })}</div>}
      </section>

      <section className={styles.safety}><strong>Activity is a coordination layer, not an automatic payout or fault decision.</strong> Paid rewards still follow Aspire Protected payment, completion, payout-readiness, dispute, and Resolution Center checks. Use Report issue for delivery problems instead of resolving money outside Aspire.</section>
    </div>
  </main>;
}