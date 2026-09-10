'use client';

import { useEffect, useState } from 'react';
import AppDock from '../AppDock';
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

const STORAGE_KEY = 'aspire-saved-posts';

export default function SavedPage() {
  const [items, setItems] = useState<SavedPost[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) setItems(parsed);
    } catch {
      setItems([]);
    } finally {
      setReady(true);
    }
  }, []);

  function removeSaved(id: string) {
    const next = items.filter((item) => item.id !== id);
    setItems(next);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

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

        {!ready ? (
          <div className={styles.loading}>Loading saved posts…</div>
        ) : items.length ? (
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
            <p>When you save a ride, listing, study group, event, or campus request, it will live here.</p>
            <a href="/discover"><UiIcon name="search" />Explore campus</a>
          </section>
        )}
      </div>
    </main>
  );
}
