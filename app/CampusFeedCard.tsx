'use client';

import type { ReactNode } from 'react';
import type { DiscoverRequest } from '../lib/supabase/discovery';
import { requestLanguageLabel } from '../lib/supabase/requests';
import UiIcon from './UiIcon';
import { campusFeedCategory, campusFeedPrice, campusFeedRelativeTime } from './campusFeedPresentation';
import styles from './CampusFeedCard.module.css';

type Props = {
  item: DiscoverRequest;
  campusLabel: string;
  currentUserId?: string | null;
  authorName?: string;
  fallbackImage?: string;
  footerLeft?: ReactNode;
  footerRight?: ReactNode;
};

const curatedSeedImages: Record<string, string> = {
  '31953690-e181-41d1-ac64-868ac3935d92': '/seeded/corec.webp?v=6',
  '32681530-eba3-4154-931b-442038cab1e2': '/seeded/gaming.webp?v=6'
};

function initialFor(name: string) {
  return name.trim().charAt(0).toUpperCase() || 'A';
}

function requestSchedule(startAt?: string | null) {
  if (!startAt) return null;
  const start = new Date(startAt);
  if (!Number.isFinite(start.getTime())) return null;

  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(dayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const dayAfterTomorrow = new Date(tomorrowStart);
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const time = start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const diff = start.getTime() - now.getTime();

  let label: string;
  if (startDay.getTime() === dayStart.getTime()) {
    label = start.getHours() >= 17 ? `Tonight · ${time}` : `Today · ${time}`;
  } else if (startDay.getTime() === tomorrowStart.getTime()) {
    label = `Tomorrow · ${time}`;
  } else if (startDay.getTime() < dayAfterTomorrow.getTime() + 6 * 24 * 60 * 60 * 1000) {
    label = `${start.toLocaleDateString([], { weekday: 'short' })} · ${time}`;
  } else {
    label = `${start.toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${time}`;
  }

  return {
    label,
    upcoming: diff > 0 && diff <= 24 * 60 * 60 * 1000,
    soon: diff > 0 && diff <= 2 * 60 * 60 * 1000
  };
}

export default function CampusFeedCard({
  item,
  campusLabel,
  currentUserId,
  authorName,
  fallbackImage,
  footerLeft,
  footerRight
}: Props) {
  // Defense-in-depth: Purdue-only preview cards must never render while browsing another campus,
  // even if stale client state briefly survives a campus switch.
  if (item.id.startsWith('demo-preview-') && !/\bpurdue\b/i.test(campusLabel)) return null;

  const category = campusFeedCategory(item);
  // The two seeded Purdue launch posts intentionally use the exact bundled images
  // requested for those posts. This takes precedence over any stale/fallback media.
  const image = curatedSeedImages[item.id] || item.media?.[0]?.public_url || fallbackImage || '';
  const mine = Boolean(currentUserId && item.poster_id === currentUserId);
  const displayAuthor = mine ? (authorName || 'You') : 'Campus student';
  const price = campusFeedPrice(item);
  const paid = item.amount_cents != null;
  const pending = mine && item.moderation_status && item.moderation_status !== 'approved';
  const language = requestLanguageLabel(item.language_code);
  const schedule = requestSchedule(item.scheduled_start_at);

  return (
    <article className={styles.card} data-request-id={item.id}>
      <div className={styles.media}>
        {image ? <img src={image} alt="" /> : <UiIcon name={category.icon} />}
        <span className={styles.category} data-tone={category.tone}>{category.label}</span>
        {schedule?.upcoming && <span className={styles.upcoming} data-soon={schedule.soon ? 'true' : 'false'}>{schedule.soon ? 'STARTING SOON' : 'UPCOMING'}</span>}
        {item.media?.length > 1 && <span className={styles.mediaCount}>+{item.media.length - 1}</span>}
      </div>

      <div className={styles.copy}>
        <h3>{item.title}</h3>
        <span className={styles.price} data-paid={paid ? 'true' : 'false'}>{price}</span>
        {schedule && <span className={styles.schedule} data-upcoming={schedule.upcoming ? 'true' : 'false'}><i aria-hidden="true" />{schedule.label}</span>}
        <span className={styles.author}><b className={styles.avatar}>{initialFor(displayAuthor)}</b>{mine ? 'Posted by you' : displayAuthor}</span>
        <span className={styles.meta}>{campusLabel} · {language} · {campusFeedRelativeTime(item.created_at)}</span>
        {pending && <span className={styles.pending}>Pending review · visible to you</span>}
      </div>

      {(footerLeft || footerRight) && (
        <div className={styles.footer}>
          <div>{footerLeft}</div>
          <div>{footerRight}</div>
        </div>
      )}
    </article>
  );
}

export const campusFeedCardStyles = {
  primaryAction: styles.primaryAction,
  secondaryAction: styles.secondaryAction
};
