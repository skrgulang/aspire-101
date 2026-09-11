'use client';

import { useEffect, useState } from 'react';
import styles from './AppDock.module.css';
import UiIcon, { UiIconName } from './UiIcon';
import { aspireLogo } from './logo';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import { fetchConnectionUnreadCounts } from '../lib/supabase/connections';

type AppDockTab = 'home' | 'discover' | 'post' | 'connections' | 'activity' | 'saved' | 'transactions' | 'profile';
type Theme = 'light' | 'dark';
type DockItem = { key: AppDockTab; label: string; href: string; icon: UiIconName; mobile?: boolean };

const discoverItems: DockItem[] = [
  { key: 'home', label: 'Home', href: '/campus', icon: 'home', mobile: true },
  { key: 'discover', label: 'Browse', href: '/discover', icon: 'search', mobile: true },
  { key: 'post', label: 'Post', href: '/post', icon: 'plus', mobile: true }
];

const personalItems: DockItem[] = [
  { key: 'connections', label: 'Inbox', href: '/connections', icon: 'message', mobile: true },
  { key: 'activity', label: 'My Activity', href: '/activity', icon: 'activity' },
  { key: 'saved', label: 'Saved', href: '/saved', icon: 'bookmark' },
  { key: 'transactions', label: 'Transactions', href: '/transactions', icon: 'wallet' }
];

const accountItems: DockItem[] = [
  { key: 'profile', label: 'Profile', href: '/profile', icon: 'user', mobile: true }
];

export default function AppDock({ active, preview = false }: { active: AppDockTab; preview?: boolean }) {
  const [theme, setTheme] = useState<Theme>('light');
  const [inboxUnread, setInboxUnread] = useState(0);

  useEffect(() => {
    const stored = window.localStorage.getItem('aspire-theme');
    const next: Theme = stored === 'dark' || stored === 'light'
      ? stored
      : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.dataset.aspireTheme = next;
  }, []);

  useEffect(() => {
    if (preview) return;
    const supabase = getSupabaseBrowserClient();
    let alive = true;

    async function refreshUnread() {
      try {
        const { data } = await supabase.auth.getUser();
        if (!data.user || !alive) {
          if (alive) setInboxUnread(0);
          return;
        }
        const rows = await fetchConnectionUnreadCounts();
        if (!alive) return;
        setInboxUnread(rows.reduce((sum, row) => sum + Number(row.unread_count || 0), 0));
      } catch {
        if (alive) setInboxUnread(0);
      }
    }

    void refreshUnread();

    const channel = supabase
      .channel(`dock-inbox-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'connection_messages' }, () => {
        window.setTimeout(() => { void refreshUnread(); }, 120);
      })
      .subscribe();

    const onFocus = () => { void refreshUnread(); };
    window.addEventListener('focus', onFocus);

    return () => {
      alive = false;
      window.removeEventListener('focus', onFocus);
      void supabase.removeChannel(channel);
    };
  }, [preview, active]);

  function toggleTheme() {
    const next: Theme = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    window.localStorage.setItem('aspire-theme', next);
    document.documentElement.dataset.aspireTheme = next;
  }

  function renderItem(item: DockItem) {
    const showUnread = item.key === 'connections' && inboxUnread > 0;
    const badgeLabel = inboxUnread > 99 ? '99+' : String(inboxUnread);

    return (
      <a
        key={item.key}
        href={preview ? '/ui-preview' : item.href}
        className={`${styles.navItem} ${!item.mobile ? styles.desktopExtra : ''} ${item.key === active ? styles.active : ''} ${item.key === 'post' ? styles.post : ''}`.trim()}
        aria-current={item.key === active ? 'page' : undefined}
        title={showUnread ? `${item.label} · ${inboxUnread} unread` : item.label}
        onClick={preview ? (event) => event.preventDefault() : undefined}
      >
        <span className={styles.iconWrap}>
          <UiIcon name={item.icon} />
          {showUnread && <b className={styles.unreadBadge} aria-label={`${inboxUnread} unread messages`}>{badgeLabel}</b>}
        </span>
        <span>{item.label}</span>
        {showUnread && <b className={styles.unreadBadgeExpanded} aria-hidden="true">{badgeLabel}</b>}
      </a>
    );
  }

  return (
    <nav className={`${styles.dock} signedInDock`} aria-label="Aspire app navigation">
      <a className={styles.brand} href={preview ? '/ui-preview' : '/campus'} aria-label="Aspire 101 home">
        <img src={aspireLogo} alt="" />
        <span>Aspire 101</span>
      </a>

      <div className={styles.groupLabel}>Discover</div>
      {discoverItems.map(renderItem)}

      <div className={styles.groupLabel}>Your stuff</div>
      {personalItems.map(renderItem)}

      <div className={styles.groupLabel}>Account</div>
      {accountItems.map(renderItem)}

      <span className={styles.spacer} aria-hidden="true" />

      <a className={`${styles.utilityLink} ${styles.desktopExtra}`} href={preview ? '/ui-preview' : '/safety'} title="Safety & Help" onClick={preview ? (event) => event.preventDefault() : undefined}>
        <UiIcon name="shield" />
        <span>Safety & Help</span>
      </a>
      <a className={`${styles.utilityLink} ${styles.desktopExtra}`} href={preview ? '/ui-preview' : '/settings'} title="Settings" onClick={preview ? (event) => event.preventDefault() : undefined}>
        <UiIcon name="settings" />
        <span>Settings</span>
      </a>
      <button className={styles.themeButton} type="button" onClick={toggleTheme} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`} title={`Switch to ${theme === 'light' ? 'Black & Gold' : 'Light'} mode`}>
        <UiIcon name={theme === 'light' ? 'moon' : 'sun'} />
      </button>
    </nav>
  );
}
