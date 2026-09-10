'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { demoRecentImages } from './demoRecentImages';
import { buildDemoAspireRequests, demoPreviewPostDefinitions, isPreviewDemoEnabled } from './demoPreviewPosts';
import styles from './DemoCampusRecentInjector.module.css';

export default function DemoCampusRecentInjector() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [campusLabel, setCampusLabel] = useState('Purdue');
  const [campusPhoto, setCampusPhoto] = useState('');
  const [userId] = useState('preview-user');

  useEffect(() => {
    if (typeof window === 'undefined' || window.location.pathname !== '/campus' || !isPreviewDemoEnabled()) return;

    const heading = Array.from(document.querySelectorAll<HTMLElement>('main.campusHome h2'))
      .find((node) => node.textContent?.trim().startsWith('Recent around'));
    const section = heading?.closest('section');
    const feed = section?.children.item(1) as HTMLElement | null;
    if (!feed) return;

    const label = heading?.textContent?.replace(/^Recent around\s+/i, '').trim();
    if (label) setCampusLabel(label);

    const heroHeading = Array.from(document.querySelectorAll<HTMLElement>('main.campusHome h1'))
      .find((node) => /Welcome back|Find what you need/i.test(node.textContent || ''));
    const heroSection = heroHeading?.closest('section');
    const heroImage = heroSection?.querySelector('img') as HTMLImageElement | null;
    if (heroImage?.src) setCampusPhoto(heroImage.src);

    const emptyState = Array.from(feed.children).find((node) => node.textContent?.includes('Your campus feed is quiet right now.')) as HTMLElement | undefined;
    const previousDisplay = emptyState?.style.display;
    if (emptyState) emptyState.style.display = 'none';

    setTarget(feed);
    return () => {
      if (emptyState) emptyState.style.display = previousDisplay || '';
      setTarget(null);
    };
  }, []);

  const cards = useMemo(() => buildDemoAspireRequests(userId, campusLabel)
    .filter((request) => request.status === 'open')
    .map((request) => {
      const definition = demoPreviewPostDefinitions.find((item) => item.id === request.id)!;
      return {
        ...request,
        displayCategory: definition.displayCategory,
        image: definition.imageKey ? demoRecentImages[definition.imageKey] : campusPhoto || demoRecentImages.corec,
        time: `${definition.hoursAgo}h ago`,
        price: request.kind === 'split_cost' && request.amount_cents != null ? `$${request.amount_cents / 100}` : 'Free',
        href: `/discover?category=${encodeURIComponent(request.category)}`
      };
    }), [campusLabel, campusPhoto, userId]);

  if (!target) return null;

  return createPortal(<>{cards.map((card) => (
    <a key={card.id} href={card.href} className={styles.card} aria-label={`${card.title}, preview post by you`}>
      <div className={styles.imageWrap}>
        <img className={styles.image} src={card.image} alt="" />
        <span className={styles.favorite} aria-hidden="true">♡</span>
        <span className={styles.badge}>{card.displayCategory}</span>
      </div>
      <div className={styles.copy}>
        <strong>{card.title}</strong>
        <span className={styles.price} data-paid={card.kind === 'split_cost' ? 'true' : 'false'}>{card.price}</span>
        <span className={styles.meta}><span className={styles.you}>Posted by you</span> · {campusLabel} · {card.time}</span>
      </div>
    </a>
  ))}</>, target);
}
