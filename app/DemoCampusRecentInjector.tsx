'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { demoRecentImages } from './demoRecentImages';
import styles from './DemoCampusRecentInjector.module.css';

type DemoCard = {
  id: string;
  title: string;
  category: string;
  tone: 'events' | 'people' | 'gaming' | 'rides';
  image: string;
  price: string;
  paid?: boolean;
  time: string;
  href: string;
};

export default function DemoCampusRecentInjector() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [campusLabel, setCampusLabel] = useState('Purdue');
  const [campusPhoto, setCampusPhoto] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (window.location.pathname !== '/campus' || params.get('demo') !== '1') return;

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

  if (!target) return null;

  const cards: DemoCard[] = [
    {
      id: 'nightshift',
      title: 'Anyone want to go to BuildPurdue Nightshift together?',
      category: 'Events',
      tone: 'events',
      image: demoRecentImages.nightshift,
      price: 'Free',
      time: '1h ago',
      href: '/discover?category=People%20%2F%20community'
    },
    {
      id: 'corec',
      title: 'Anyone want to go to CoRec together?',
      category: 'People',
      tone: 'people',
      image: demoRecentImages.corec,
      price: 'Free',
      time: '2h ago',
      href: '/discover?category=People%20%2F%20community'
    },
    {
      id: 'gaming',
      title: 'Anyone want to game tonight?',
      category: 'Gaming',
      tone: 'gaming',
      image: demoRecentImages.gaming,
      price: 'Free',
      time: '3h ago',
      href: '/discover?category=Gaming%20%2F%20duos'
    },
    {
      id: 'airport',
      title: 'Airport pickup / ride to IND',
      category: 'Rides',
      tone: 'rides',
      image: campusPhoto || demoRecentImages.corec,
      price: '$25',
      paid: true,
      time: '5h ago',
      href: '/discover?category=Get%20me%20there'
    }
  ];

  return createPortal(
    <>
      {cards.map((card) => (
        <a key={card.id} href={card.href} className={styles.card} aria-label={`${card.title}, preview post by you`}>
          <div className={styles.imageWrap}>
            <img className={styles.image} src={card.image} alt="" />
            <span className={styles.favorite} aria-hidden="true">♡</span>
            <span className={styles.badge} data-tone={card.tone}>{card.category}</span>
          </div>
          <div className={styles.copy}>
            <strong>{card.title}</strong>
            <span className={styles.price} data-paid={card.paid ? 'true' : 'false'}>{card.price}</span>
            <span className={styles.meta}><span className={styles.you}>Posted by you</span> · {campusLabel} · {card.time}</span>
          </div>
        </a>
      ))}
    </>,
    target
  );
}
