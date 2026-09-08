'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import { fetchMyRole } from '../lib/supabase/trust';
import AppLoader from './AppLoader';

type DailyPoint = {
  date: string;
  dau: number;
  signups: number;
  posts: number;
  responses: number;
  connections: number;
  payments: number;
  processedVolumeCents: number;
};

type CampusPoint = {
  campusId: string | null;
  campus: string;
  shortName: string;
  dau: number;
};

type ActivityMetrics = {
  generatedAt: string;
  timezone: string;
  todayDau: number;
  yesterdayDau: number;
  wau: number;
  mau: number;
  newUsersToday: number;
  totalUsers: number;
  verifiedStudents: number;
  postsToday: number;
  responsesToday: number;
  connectionsToday: number;
  paymentsToday: number;
  processedVolumeCentsToday: number;
  payoutsReleasedToday: number;
  daily: DailyPoint[];
  campusesToday: CampusPoint[];
};

function number(value: unknown) {
  const next = Number(value || 0);
  return Number.isFinite(next) ? next : 0;
}

function normalize(raw: any): ActivityMetrics {
  return {
    generatedAt: String(raw?.generatedAt || new Date().toISOString()),
    timezone: String(raw?.timezone || 'UTC'),
    todayDau: number(raw?.todayDau),
    yesterdayDau: number(raw?.yesterdayDau),
    wau: number(raw?.wau),
    mau: number(raw?.mau),
    newUsersToday: number(raw?.newUsersToday),
    totalUsers: number(raw?.totalUsers),
    verifiedStudents: number(raw?.verifiedStudents),
    postsToday: number(raw?.postsToday),
    responsesToday: number(raw?.responsesToday),
    connectionsToday: number(raw?.connectionsToday),
    paymentsToday: number(raw?.paymentsToday),
    processedVolumeCentsToday: number(raw?.processedVolumeCentsToday),
    payoutsReleasedToday: number(raw?.payoutsReleasedToday),
    daily: Array.isArray(raw?.daily) ? raw.daily.map((item: any) => ({
      date: String(item.date || ''),
      dau: number(item.dau),
      signups: number(item.signups),
      posts: number(item.posts),
      responses: number(item.responses),
      connections: number(item.connections),
      payments: number(item.payments),
      processedVolumeCents: number(item.processedVolumeCents)
    })) : [],
    campusesToday: Array.isArray(raw?.campusesToday) ? raw.campusesToday.map((item: any) => ({
      campusId: typeof item.campusId === 'string' ? item.campusId : null,
      campus: String(item.campus || 'Unknown campus'),
      shortName: String(item.shortName || item.campus || 'Unknown'),
      dau: number(item.dau)
    })) : []
  };
}

function money(cents: number) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function dayLabel(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export default function AdminActivityDashboard() {
  const router = useRouter();
  const [days, setDays] = useState(30);
  const [metrics, setMetrics] = useState<ActivityMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true); else setLoading(true);
    setError('');
    try {
      const role = await fetchMyRole();
      if (role !== 'admin') {
        router.replace('/profile');
        return;
      }
      const supabase = getSupabaseBrowserClient();
      const { data, error: rpcError } = await supabase.rpc('admin_activity_metrics', { p_days: days });
      if (rpcError) throw rpcError;
      setMetrics(normalize(data));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not load activity metrics.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [days, router]);

  useEffect(() => {
    void load(false);
    const timer = window.setInterval(() => void load(true), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const maxDau = useMemo(() => Math.max(1, ...(metrics?.daily.map((item) => item.dau) ?? [1])), [metrics]);
  const dauChange = metrics ? metrics.todayDau - metrics.yesterdayDau : 0;
  const stickiness = metrics && metrics.mau > 0 ? Math.round((metrics.todayDau / metrics.mau) * 100) : 0;

  if (loading && !metrics) return <AppLoader label="Opening growth monitor…" detail="DAU + marketplace activity" />;

  return (
    <main className="activityAdminPage">
      <div className="activityAdminShell">
        <header className="activityAdminTop">
          <div><span>CLOUDORA LABS, INC. · ASPIRE 101</span><h1>Daily Active Monitor</h1><p>Privacy-minimized product activity for signed-in Aspire users. No page paths, message contents, IP addresses, card data, or device fingerprints are stored by this monitor.</p></div>
          <div className="activityAdminActions"><a href="/moderator">Trust &amp; Safety →</a><button type="button" onClick={() => void load(true)} disabled={refreshing}>{refreshing ? 'Refreshing…' : 'Refresh'}</button></div>
        </header>

        {error && <div className="activityAdminNotice error" role="alert">{error}</div>}

        {metrics && <>
          <section className="activityHeroStats">
            <article className="primary"><span>DAU · TODAY</span><strong>{metrics.todayDau}</strong><small className={dauChange >= 0 ? 'up' : 'down'}>{dauChange >= 0 ? '+' : ''}{dauChange} vs yesterday</small></article>
            <article><span>WAU · 7D</span><strong>{metrics.wau}</strong><small>Unique signed-in users</small></article>
            <article><span>MAU · 30D</span><strong>{metrics.mau}</strong><small>Unique signed-in users</small></article>
            <article><span>DAU / MAU</span><strong>{stickiness}%</strong><small>Simple stickiness signal</small></article>
          </section>

          <section className="activitySecondaryStats">
            <article><span>NEW USERS TODAY</span><strong>{metrics.newUsersToday}</strong><small>{metrics.totalUsers} total accounts</small></article>
            <article><span>VERIFIED STUDENTS</span><strong>{metrics.verifiedStudents}</strong><small>School verification complete</small></article>
            <article><span>POSTS / RESPONSES</span><strong>{metrics.postsToday} / {metrics.responsesToday}</strong><small>Created today</small></article>
            <article><span>CONNECTIONS</span><strong>{metrics.connectionsToday}</strong><small>Created today</small></article>
            <article><span>PAYMENTS</span><strong>{metrics.paymentsToday}</strong><small>{money(metrics.processedVolumeCentsToday)} processed today</small></article>
            <article><span>PAYOUTS RELEASED</span><strong>{metrics.payoutsReleasedToday}</strong><small>Released today</small></article>
          </section>

          <section className="activityChartPanel">
            <div className="activityPanelHead"><div><span>ENGAGEMENT TREND</span><h2>Daily active users</h2></div><div className="activityRange">{[14,30,60,90].map((value) => <button key={value} type="button" className={days === value ? 'active' : ''} onClick={() => setDays(value)}>{value}D</button>)}</div></div>
            <div className="activityBars" aria-label="Daily active users chart">
              {metrics.daily.map((item) => <div className="activityBarColumn" key={item.date} title={`${dayLabel(item.date)} · ${item.dau} DAU`}><div className="activityBarTrack"><i style={{ height: `${Math.max(item.dau ? 8 : 2, (item.dau / maxDau) * 100)}%` }} /></div><b>{item.dau}</b><span>{dayLabel(item.date)}</span></div>)}
            </div>
          </section>

          <div className="activityGrid">
            <section className="activityTablePanel">
              <div className="activityPanelHead"><div><span>DAILY FUNNEL</span><h2>What active users did</h2></div><small>UTC</small></div>
              <div className="activityTableWrap"><table><thead><tr><th>Date</th><th>DAU</th><th>Signups</th><th>Posts</th><th>Responses</th><th>Connections</th><th>Payments</th><th>Volume</th></tr></thead><tbody>{metrics.daily.slice(-14).reverse().map((item) => <tr key={item.date}><td>{dayLabel(item.date)}</td><td><strong>{item.dau}</strong></td><td>{item.signups}</td><td>{item.posts}</td><td>{item.responses}</td><td>{item.connections}</td><td>{item.payments}</td><td>{money(item.processedVolumeCents)}</td></tr>)}</tbody></table></div>
            </section>

            <section className="activityCampusPanel">
              <div className="activityPanelHead"><div><span>CAMPUS HEALTH</span><h2>DAU by home campus</h2></div><small>Today</small></div>
              <div className="activityCampusList">{metrics.campusesToday.length ? metrics.campusesToday.map((campus) => <div key={campus.campusId || campus.campus}><div><strong>{campus.shortName}</strong><span>{campus.campus}</span></div><b>{campus.dau}</b></div>) : <p>No signed-in activity recorded yet today.</p>}</div>
            </section>
          </div>

          <footer className="activityAdminFoot"><span>Updated {new Date(metrics.generatedAt).toLocaleString()}</span><span>Definition: DAU = unique authenticated Aspire users with at least one activity heartbeat during the UTC day.</span></footer>
        </>}
      </div>
    </main>
  );
}
