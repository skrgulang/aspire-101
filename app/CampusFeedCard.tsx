'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type { DiscoverRequest } from '../lib/supabase/discovery';
import { requestLanguageLabel } from '../lib/supabase/requests';
import { isRequestSaved, removeSavedRequest, saveRequest } from '../lib/supabase/savedRequests';
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
  const previewHidden = item.id.startsWith('demo-preview-') && !/\bpurdue\b/i.test(campusLabel);
  const category = campusFeedCategory(item);
  const image = item.media?.[0]?.public_url || item.cover_image_url || fallbackImage || '';
  const mine = Boolean(currentUserId && item.poster_id === currentUserId);
  const displayAuthor = mine ? (authorName || 'You') : (item.author_label || 'Campus student');
  const price = campusFeedPrice(item);
  const paid = item.amount_cents != null;
  const pending = mine && item.moderation_status && item.moderation_status !== 'approved';
  const language = requestLanguageLabel(item.language_code);
  const [saved, setSaved] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!currentUserId || mine || previewHidden) {
      setSaved(false);
      return () => { cancelled = true; };
    }

    void isRequestSaved(item.id)
      .then((value) => { if (!cancelled) setSaved(value); })
      .catch(() => { if (!cancelled) setSaved(false); });

    return () => { cancelled = true; };
  }, [currentUserId, item.id, mine, previewHidden]);

  async function toggleSaved() {
    if (!currentUserId || mine || previewHidden || saveBusy) return;
    setSaveBusy(true);
    try {
      if (saved) {
        await removeSavedRequest(item.id);
        setSaved(false);
      } else {
        await saveRequest({
          id: item.id,
          title: item.title,
          category: category.label,
          campus: campusLabel,
          meta: `${language} · ${campusFeedRelativeTime(item.created_at)}`,
          image,
          href: campusFeedHref(item)
        });
        setSaved(true);
      }
    } catch {
      // Saving is optional; keep the card usable if the network is temporarily unavailable.
    } finally {
      setSaveBusy(false);
    }
  }

  if (previewHidden) return null;

  return (
    <article className={styles.card} data-request-id={item.id}>
      <div className={styles.media}>
        {image ? <img src={image} alt="" /> : <UiIcon name={category.icon} />}
        <span className={styles.category} data-tone={category.tone}>{category.label}</span>
        {!mine && currentUserId && !item.starter && (
          <button
            type="button"
            className={`${styles.saveButton} ${saved ? styles.saved : ''}`.trim()}
            onClick={() => void toggleSaved()}
            disabled={saveBusy}
            aria-pressed={saved}
            aria-label={saved ? 'Remove from saved posts' : 'Save this post'}
            title={saveBusy ? 'Saving…' : saved ? 'Saved' : 'Save post'}
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
        {pending && <div className={styles.pendingRow}><span className={styles.pending}>Pending human review · visible only to you</span><a className={styles.pendingDetails} href="/activity">Review details →</a></div>}
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
