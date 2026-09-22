'use client';

import { useEffect, useState, type ReactNode } from 'react';
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
  saveHref?: string;
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

const SAVED_STORAGE_KEY = 'aspire-saved-posts';
const SAVED_CHANGE_EVENT = 'aspire:saved-posts-changed';

function readSavedPosts(): SavedPost[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(SAVED_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const curatedSeedImages: Record<string, string> = {
  '31953690-e181-41d1-ac64-868ac3935d92': '/seeded/corec.webp?v=6',
  '32681530-eba3-4154-931b-442038cab1e2': '/seeded/gaming.webp?v=6'
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
  footerRight,
  saveHref
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
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const syncSaved = () => setSaved(readSavedPosts().some((entry) => entry.id === item.id));
    syncSaved();
    window.addEventListener('storage', syncSaved);
    window.addEventListener(SAVED_CHANGE_EVENT, syncSaved);
    return () => {
      window.removeEventListener('storage', syncSaved);
      window.removeEventListener(SAVED_CHANGE_EVENT, syncSaved);
    };
  }, [item.id]);

  function toggleSaved() {
    const current = readSavedPosts();
    const alreadySaved = current.some((entry) => entry.id === item.id);
    const next = alreadySaved
      ? current.filter((entry) => entry.id !== item.id)
      : [...current, {
          id: item.id,
          title: item.title,
          category: category.label,
          campus: campusLabel,
          meta: `${price} · ${campusFeedRelativeTime(item.created_at)}`,
          image: image || undefined,
          href: saveHref || '/saved'
        }];
    try {
      window.localStorage.setItem(SAVED_STORAGE_KEY, JSON.stringify(next));
      setSaved(!alreadySaved);
      window.dispatchEvent(new Event(SAVED_CHANGE_EVENT));
    } catch {
      // Saving is optional; keep the feed usable if browser storage is unavailable.
    }
  }

  return (
    <article className={styles.card} data-request-id={item.id}>
      <div className={styles.media}>
        {image ? <img src={image} alt="" /> : <UiIcon name={category.icon} />}
        <button
          type="button"
          className={`${styles.saveButton} ${saved ? styles.saved : ''}`}
          aria-label={saved ? 'Remove from saved posts' : 'Save post'}
          aria-pressed={saved}
          title={saved ? 'Remove from Saved' : 'Save post'}
          onClick={toggleSaved}
        >
          <UiIcon name="bookmark" />
        </button>
        <span className={styles.category} data-tone={category.tone}>{category.label}</span>
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
