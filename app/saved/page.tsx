'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';
import { fetchSavedRequests, removeSavedRequest, type SavedRequestSnapshot } from '../../lib/supabase/savedRequests';
import AppDock from '../AppDock';
import AppLoader from '../AppLoader';
import UiIcon from '../UiIcon';
import styles from './SavedPage.module.css';

export default function SavedPage() {
  const router = useRouter();
  const [items, setItems] = useState<SavedRequestSnapshot[]>([]);
  const [ready, setReady] = useState(false);
  const [removingId, setRemovingId] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let alive = true;
    const supabase = getSupabaseBrowserClient();

    supabase.auth.getUser().then(async ({ data }) => {
      if (!alive) return;
      if (!data.user) {
        router.replace('/login?next=%2Fsaved');
        return;
      }

      try {
        const next = await fetchSavedRequests();
        if (alive) setItems(next);
      } catch (error) {
        if (alive) setNotice(error instanceof Error ? error.message : 'Could not load your saved posts.');
      } finally {
        if (alive) setReady(true);
      }
    }).catch(() => {
      if (alive) {
        setNotice('Could not load your saved posts.');
        setReady(true);
      }
    });

    return () => { alive = false; };
  }, [router]);

  async function removeSaved(id: string) {
    setRemovingId(id);
    setNotice('');
    try {
      await removeSavedRequest(id);
      setItems((current) => current.filter((item) => item.id !== id));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not remove this saved post.');
    } finally {
      setRemovingId('');
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
            <p>Keep posts you want to come back to. Saved posts now follow your Aspire account across devices.</p>
          </div>
          <a href="/discover" className={styles.browse}><UiIcon name="search" />Browse campus</a>
        </header>

        {notice && <div role="status">{notice}</div>}

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
                    <button type="button" onClick={() => void removeSaved(item.id)} disabled={removingId === item.id}>
                      {removingId === item.id ? 'Removing…' : 'Remove'}
                    </button>
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
