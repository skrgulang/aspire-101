'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchMyRole } from '../lib/supabase/trust';
import { fetchFounderActivityMetrics, FounderActivityMetrics } from '../lib/supabase/adminMetrics';
import AppLoader from './AppLoader';
import styles from './founder-ops.module.css';

function number(value: number | null | undefined) {
  return new Intl.NumberFormat().format(Number(value || 0));
}

function money(cents: number | null | undefined) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(Number(cents || 0) / 100);
}

function percent(bps: number | null | undefined) {
  return `${(Number(bps || 0) / 100).toFixed(1)}%`;
}

function day(value: string) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function FounderDashboard() {
  const router = useRouter();
  const [metrics, setMetrics] = useState<FounderActivityMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setNotice('');
    try {
      const role = await fetchMyRole();
      if (role !== 'admin') {
        router.replace('/profile');
        return;
      }
      setMetrics(await fetchFounderActivityMetrics(30));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not load founder metrics.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  const recent = useMemo(() => (metrics?.daily || []).slice(-14).reverse(), [metrics]);
  const maxDau = useMemo(() => Math.max(1, ...recent.map((item) => Number(item.dau || 0))), [recent]);

  if (loading && !metrics) return <AppLoader label="Opening founder ops…" detail="Production metrics" />;

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div>
            <span className={styles.eyebrow}>CLOUDORA LABS, INC. · INTERNAL</span>
            <h1>Founder Ops</h1>
            <p>One place for product activity, marketplace throughput, and campus launch health. Database-backed business metrics stay separate from browser analytics.</p>
          </div>
          <div className={styles.actions}>
            <button type="button" onClick={() => void load()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
            <a href="/moderator">Trust &amp; Safety →</a>
            <a href="/profile">Profile →</a>
          </div>
        </header>

        {notice && <div className={styles.notice}>{notice}</div>}

        {metrics && <>
          <section className={styles.primaryGrid} aria-label="Core founder metrics">
            <article><span>DAU TODAY</span><strong>{number(metrics.todayDau)}</strong><small>Yesterday {number(metrics.yesterdayDau)}</small></article>
            <article><span>WAU / MAU</span><strong>{number(metrics.wau)} / {number(metrics.mau)}</strong><small>{number(metrics.totalUsers)} total accounts</small></article>
            <article><span>NEW USERS</span><strong>{number(metrics.newUsersToday)}</strong><small>{number(metrics.verifiedStudents)} confirmed emails total</small></article>
            <article><span>CONNECTIONS</span><strong>{number(metrics.connectionsToday)}</strong><small>{number(metrics.responsesToday)} responses today</small></article>
            <article><span>GMV TODAY</span><strong>{money(metrics.gmvCentsToday)}</strong><small>{number(metrics.successfulTransactionsToday)} successful transactions</small></article>
            <article><span>PLATFORM FEES</span><strong>{money(metrics.platformFeeRevenueCentsToday)}</strong><small>{percent(metrics.takeRateBpsToday)} take rate today</small></article>
          </section>

          <section className={styles.split}>
            <article className={styles.panel}>
              <div className={styles.panelHead}>
                <div><span>14-DAY OPERATING TREND</span><h2>Activity</h2></div>
                <small>UTC · generated {new Date(metrics.generatedAt).toLocaleString()}</small>
              </div>
              <div className={styles.dailyList}>
                {recent.map((item) => (
                  <div className={styles.dailyRow} key={item.date}>
                    <span>{day(item.date)}</span>
                    <div className={styles.barTrack}><i style={{ width: `${Math.max(3, (Number(item.dau || 0) / maxDau) * 100)}%` }} /></div>
                    <b>{number(item.dau)} DAU</b>
                    <small>{number(item.signups)} signup · {number(item.posts)} post · {number(item.connections)} connect</small>
                  </div>
                ))}
              </div>
            </article>

            <article className={styles.panel}>
              <div className={styles.panelHead}>
                <div><span>CAMPUS HEALTH</span><h2>Active campuses today</h2></div>
              </div>
              <div className={styles.campusList}>
                {!metrics.campusesToday?.length && <p className={styles.empty}>No campus activity recorded yet today.</p>}
                {(metrics.campusesToday || []).map((campus) => (
                  <div key={`${campus.campusId || 'unknown'}-${campus.shortName}`}>
                    <span>{campus.shortName || campus.campus}</span>
                    <strong>{number(campus.dau)} DAU</strong>
                  </div>
                ))}
              </div>
            </article>
          </section>

          <section className={styles.secondaryGrid}>
            <article><span>POSTS TODAY</span><strong>{number(metrics.postsToday)}</strong></article>
            <article><span>PAYMENTS TODAY</span><strong>{number(metrics.paymentsToday)}</strong></article>
            <article><span>PROCESSED VOLUME</span><strong>{money(metrics.processedVolumeCentsToday)}</strong></article>
            <article><span>PAYOUTS RELEASED</span><strong>{number(metrics.payoutsReleasedToday)}</strong></article>
            <article><span>SIGNUP COMPLETIONS</span><strong>{number(metrics.signupCompletionsToday)}</strong><small>{percent(metrics.signupRateBpsToday)} tracked signup rate</small></article>
            <article><span>TRACKED SESSIONS</span><strong>{number(metrics.uniqueSessionsToday)}</strong><small>{number(metrics.pageViewsToday)} page views</small></article>
          </section>

          <footer className={styles.footer}>Internal founder view · financial truth comes from Stripe + Aspire payment records; browser analytics are directional.</footer>
        </>}
      </div>
    </main>
  );
}
