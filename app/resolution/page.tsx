'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppDock from '../AppDock';
import ResolutionQuickPanel from '../ResolutionQuickPanel';
import ResolutionHistory from '../ResolutionHistory';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';
import styles from '../UtilityWorkspace.module.css';

export default function ResolutionPage() {
  const router = useRouter();
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    void supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace('/login?next=%2Fresolution');
        return;
      }
      setAuthReady(true);
    }).catch(() => {
      router.replace('/login?next=%2Fresolution');
    });
  }, [router]);

  if (!authReady) {
    return (
      <main className="connectionsPage">
        <AppDock active="resolution" />
        <div className={styles.shell}><div className={styles.content}>Checking your Aspire session…</div></div>
      </main>
    );
  }

  return (
    <main className="connectionsPage">
      <AppDock active="resolution" />
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.headerCopy}>
            <p className={styles.eyebrow}>ASPIRE PROTECTION</p>
            <h1 className={styles.title}>Resolution Center</h1>
            <p className={styles.lead}>Report a problem, keep an eligible protected payment paused during review, and follow the outcome without losing the record after a connection ends.</p>
          </div>
          <div className={styles.actions}>
            <a href="/resolution-policy">Read resolution policy</a>
          </div>
        </header>
        <div className={styles.content}>
          <ResolutionQuickPanel />
          <ResolutionHistory />
        </div>
      </div>
    </main>
  );
}
