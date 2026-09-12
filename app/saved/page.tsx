'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';
import AppDock from '../AppDock';
import AppLoader from '../AppLoader';
import UiIcon from '../UiIcon';
import styles from './SavedPage.module.css';

type SavedPost = {
  id: string;
  title: string;
  category?: string;
  campus?: string;
  meta?: string;
  image?: string;
  href?: string;
};

const LEGACY_STORAGE_KEY = 'aspire-saved-posts';
const savedKey = (userId: string) => `aspire-saved-posts:${userId}`;

export default function SavedPage() {
  const router = useRouter();
  const [items, setItems] = useState<SavedPost[]>([]);
  const [currentUserId, setCurrentUserId] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    const supabase = getSupabaseBrowserClient();

    supabase.auth.getUser().then(({ data }) => {
      if (!alive) return;
      const user = data.user;
      if (!user) {
        router.replace('/login?next=%2Fsaved');
        return;
      }

      setCurrentUserId(user.id);
      try {
        const key = savedKey(user.id);
        let raw = window.localStorage.getItem(key);
        if (!raw) {
          const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
          if (legacy) {
            raw = legacy;
            window.localStorage.setItem(key, legacy);
            window.localStorage.removeItem(LEGACY_STORAGE_KEY);
          }
        }
        const parsed = raw ? JSON.parse(raw) : [];
        setItems(Array.isArray(parsed) ? parsed : []);
      } catch {
        setItems([]);
      } finally {
        setReady(true);
      }
    }).catch(() => {
      if (alive) setReady(true);
    });

    return () => { alive = false; };
  }, [router]);

  function removeSaved(id: string) {
    if (!currentUserId) return;
    const next = items.filter((item) => item.id !== id);
    setItems(next);
    try {
      window.localStorage.setItem(savedKey(currentUserId), JSON.stringify(next));
    } catch {
      // Keep the visible state responsive even if browser storage is unavailable.
    }
  }

  if (!ready) return <AppLoader label="Opening saved posts…" detail="Your Aspire" />;

  return (
    <main className={styles.page}>
      <AppDock active="saved" />
      <div className={styles.shell}>
        <header className={styles.header}>
          <div>
            <span>YOUR STUFF</span>
            <h1>Saved</h1>
            <p>Keep posts you want to come back to without cluttering your inbox.</p>
          </div>
          <a href="/discover" className={styles.browse}><UiIcon name="search" />Browse campus</a>
        </header>

        {items.length ? (
          <section className={styles.grid} aria-label="Saved posts">
            {items.map((item) => (
              <article className={styles.card} key={item.id}>
                {item.image ? <img src={item.image} alt="" /> : <div className={styles.placeholder}><UiIcon name="bookmark" /></div>}
                <div className={styles.copy}>
                  <span>{item.category || 'Saved post'}</span>
                  <h2>{item.title}</h2>
                  <p>{item.campus || 'Campus'}{item.meta ? ` · ${item.meta}` : ''}</p>
                  <div className={styles.actions}>
                    <a href={item.href || '/discover'}>View post</a>
                    <button type="button" onClick={() => removeSaved(item.id)}>Remove</button>
                  </div>
                </div>
              </article>
            ))}
          </section>
        ) : (
          <section className={styles.empty}>
            <div className={styles.emptyIcon}><UiIcon name="bookmark" /></div>
            <span>NOTHING SAVED YET</span>
            <h2>Save the posts worth coming back to.</h2>
            <p>Use the bookmark on a campus card to keep a ride, listing, study group, event, or request here for later.</p>
            <a href="/discover"><UiIcon name="search" />Explore campus</a>
          </section>
        )}
      </div>
    </main>
  );
}
