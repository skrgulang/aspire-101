'use client';

import type { ReactNode } from 'react';
import type { DiscoverRequest } from '../lib/supabase/discovery';
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

function initialFor(name: string) {
  return name.trim().charAt(0).toUpperCase() || 'A';
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
  const category = campusFeedCategory(item);
  const image = item.media?.[0]?.public_url || fallbackImage || '';
  const mine = Boolean(currentUserId && item.poster_id === currentUserId);
  const displayAuthor = mine ? (authorName || 'You') : 'Campus student';
  const price = campusFeedPrice(item);
  const paid = item.amount_cents != null;
  const pending = mine && item.moderation_status && item.moderation_status !== 'approved';

  return (
    <article className={styles.card} data-request-id={item.id}>
      <div className={styles.media}>
        {image ? <img src={image} alt="" /> : <UiIcon name={category.icon} />}
        <span className={styles.category} data-tone={category.tone}>{category.label}</span>
        {item.media?.length > 1 && <span className={styles.mediaCount}>+{item.media.length - 1}</span>}
      </div>

      <div className={styles.copy}>
        <h3>{item.title}</h3>
        <span className={styles.price} data-paid={paid ? 'true' : 'false'}>{price}</span>
        <span className={styles.author}><b className={styles.avatar}>{initialFor(displayAuthor)}</b>{mine ? 'Posted by you' : displayAuthor}</span>
        <span className={styles.meta}>{campusLabel} · {campusFeedRelativeTime(item.created_at)}</span>
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
