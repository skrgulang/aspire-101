'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type { DiscoverRequest } from '../lib/supabase/discovery';
import { requestLanguageLabel } from '../lib/supabase/requests';
import UiIcon from './UiIcon';
import { campusFeedCategory, campusFeedHref, campusFeedPrice, campusFeedRelativeTime } from './campusFeedPresentation';
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

type SavedPost = {
  id: string;
  title: string;
  category?: string;
  campus?: string;
  meta?: string;
  image?: string;
  href?: string;
};

const savedKey = (userId: string) => `aspire-saved-posts:${userId}`;

function initialFor(name: string) {
  return name.trim().charAt(0).toUpperCase() || 'A';
}

function readSaved(key: string): SavedPost[] {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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
  const previewHidden = item.id.startsWith('demo-preview-') && !/\bpurdue\b/i.test(campusLabel);
  const category = campusFeedCategory(item);
  const image = item.media?.[0]?.public_url || item.cover_image_url || fallbackImage || '';
  const mine = Boolean(currentUserId && item.poster_id === currentUserId);
  const displayAuthor = mine ? (authorName || 'You') : 'Campus student';
  const price = campusFeedPrice(item);
  const paid = item.amount_cents != null;
  const pending = mine && item.moderation_status && item.moderation_status !== 'approved';
  const language = requestLanguageLabel(item.language_code);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!currentUserId || mine || previewHidden) {
      setSaved(false);
      return;
    }
    setSaved(readSaved(savedKey(currentUserId)).some((entry) => entry.id === item.id));
  }, [currentUserId, item.id, mine, previewHidden]);

  function toggleSaved() {
    if (!currentUserId || mine || previewHidden) return;
    const key = savedKey(currentUserId);
    const current = readSaved(key);
    const exists = current.some((entry) => entry.id === item.id);
    const next = exists
      ? current.filter((entry) => entry.id !== item.id)
      : [{
          id: item.id,
          title: item.title,
          category: category.label,
          campus: campusLabel,
          meta: `${language} · ${campusFeedRelativeTime(item.created_at)}`,
          image,
          href: campusFeedHref(item)
        }, ...current];
    window.localStorage.setItem(key, JSON.stringify(next));
    setSaved(!exists);
  }

  if (previewHidden) return null;

  return (
    <article className={styles.card} data-request-id={item.id}>
      <div className={styles.media}>
        {image ? <img src={image} alt="" /> : <UiIcon name={category.icon} />}
        <span className={styles.category} data-tone={category.tone}>{category.label}</span>
        {!mine && currentUserId && (
          <button
            type="button"
            className={`${styles.saveButton} ${saved ? styles.saved : ''}`.trim()}
            onClick={toggleSaved}
            aria-pressed={saved}
            aria-label={saved ? 'Remove from saved posts' : 'Save this post'}
            title={saved ? 'Saved' : 'Save post'}
          >
            <UiIcon name="bookmark" />
          </button>
        )}
        {item.media?.length > 1 && <span className={styles.mediaCount}>+{item.media.length - 1}</span>}
      </div>

      <div className={styles.copy}>
        <h3>{item.title}</h3>
        <span className={styles.price} data-paid={paid ? 'true' : 'false'}>{price}</span>
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
