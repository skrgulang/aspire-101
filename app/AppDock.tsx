'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import styles from './AppDock.module.css';
import UiIcon, { UiIconName } from './UiIcon';
import { aspireLogo } from './logo';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import { AspireNotification, subscribeToNotifications } from '../lib/supabase/notifications';

type AppDockTab = 'home' | 'discover' | 'market' | 'post' | 'connections' | 'delivery' | 'activity' | 'saved' | 'transactions' | 'resolution' | 'profile' | 'settings';
type DockItem = { key: AppDockTab; label: string; href: string; icon: UiIconName; mobile?: boolean };

const discoverItems: DockItem[] = [
  { key: 'home', label: 'Home', href: '/campus', icon: 'home', mobile: true },
  { key: 'discover', label: 'Browse', href: '/discover', icon: 'search', mobile: true },
  { key: 'market', label: 'Market', href: '/marketplace', icon: 'cart', mobile: true },
  { key: 'post', label: 'Post', href: '/post', icon: 'plus', mobile: true }
];

const personalItems: DockItem[] = [
  { key: 'connections', label: 'Inbox', href: '/connections', icon: 'message', mobile: true },
  { key: 'delivery', label: 'Delivery', href: '/delivery', icon: 'car' },
  { key: 'activity', label: 'My Posts', href: '/activity', icon: 'activity' },
  { key: 'saved', label: 'Saved', href: '/saved', icon: 'bookmark' },
  { key: 'transactions', label: 'Orders', href: '/transactions', icon: 'wallet' },
  { key: 'resolution', label: 'Resolution', href: '/resolution', icon: 'shield' }
];

const accountItems: DockItem[] = [
  { key: 'profile', label: 'Profile', href: '/profile', icon: 'user', mobile: true }
];

export default function AppDock({ active, preview = false }: { active: AppDockTab; preview?: boolean }) {
  const pathname = usePathname();
  const currentActive: AppDockTab = !preview && pathname.startsWith('/marketplace') ? 'market' : active;
  const [notifications, setNotifications] = useState<AspireNotification[]>([]);

  const unreadNotifications = useMemo(() => notifications.filter((item) => !item.read_at), [notifications]);
  const inboxUnread = unreadNotifications.length;
  const inviteUnread = useMemo(
    () => unreadNotifications.filter((item) => item.kind === 'connection_chosen' || item.kind === 'request_response').length,
    [unreadNotifications]
  );
  const connectedUnread = useMemo(
    () => unreadNotifications.filter((item) => item.kind === 'connection_confirmed').length,
    [unreadNotifications]
  );
  const inboxHasPriority = inviteUnread > 0 || connectedUnread > 0;
  const inboxBadgeCount = inviteUnread > 0 ? inviteUnread : connectedUnread > 0 ? connectedUnread : inboxUnread;

  useEffect(() => {
    const stored = window.localStorage.getItem('aspire-theme');
    const next = stored === 'light' || stored === 'dark' ? stored : 'dark';
    document.documentElement.dataset.aspireTheme = next;
  }, []);

  useEffect(() => {
    if (preview) return;
    let alive = true;
    let unsubscribe = () => undefined;
    const supabase = getSupabaseBrowserClient();

    void supabase.auth.getUser().then(({ data }) => {
      if (!alive || !data.user) return;
      unsubscribe = subscribeToNotifications(
        data.user.id,
        (items) => { if (alive) setNotifications(items); },
        () => undefined
      );
    }).catch(() => undefined);

    return () => {
      alive = false;
      unsubscribe();
    };
  }, [preview]);

  function renderItem(item: DockItem) {
    const isInbox = item.key === 'connections';
    const priorityLabel = inviteUnread > 0
      ? inviteUnread + ' connection ' + (inviteUnread === 1 ? 'update' : 'updates')
      : connectedUnread > 0
        ? connectedUnread + ' new ' + (connectedUnread === 1 ? 'match' : 'matches')
        : '';

    return (
      <a
        key={item.key}
        href={preview ? '/ui-preview' : item.href}
        className={`${styles.navItem} ${!item.mobile ? styles.desktopExtra : ''} ${item.key === currentActive ? styles.active : ''} ${item.key === 'post' ? styles.post : ''} ${isInbox && inboxHasPriority ? styles.inboxAttention : ''}`.trim()}
        aria-current={item.key === currentActive ? 'page' : undefined}
        aria-label={isInbox && inboxUnread > 0 ? 'Inbox, ' + inboxUnread + ' new, ' + (priorityLabel || 'activity') : item.label}
        title={isInbox && priorityLabel ? 'Inbox · ' + priorityLabel : item.label}
        onClick={preview ? (event) => event.preventDefault() : undefined}
      >
        <i className={styles.iconWrap}>
          <UiIcon name={item.icon} />
          {isInbox && inboxBadgeCount > 0 && <b className={`${styles.unreadBadge} ${inboxHasPriority ? styles.priorityBadge : ''}`}>{inboxBadgeCount > 99 ? '99+' : inboxBadgeCount}</b>}
        </i>
        <span>{item.label}</span>
        {isInbox && priorityLabel && <em className={styles.inboxMeta}>{priorityLabel}</em>}
      </a>
    );
  }

  return (
    <nav className={`${styles.dock} signedInDock`} aria-label="Aspire app navigation">
      <a className={styles.brand} href={preview ? '/ui-preview' : '/'} aria-label="Back to Aspire 101 main page" title="Back to Aspire 101">
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
      <a className={`${styles.utilityLink} ${styles.desktopExtra} ${currentActive === 'settings' ? styles.active : ''}`} href={preview ? '/ui-preview' : '/settings'} title="Settings" aria-current={currentActive === 'settings' ? 'page' : undefined} onClick={preview ? (event) => event.preventDefault() : undefined}>
        <UiIcon name="settings" />
        <span>Settings</span>
      </a>
    </nav>
  );
}
