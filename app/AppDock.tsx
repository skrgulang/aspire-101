'use client';

import { useEffect, useState } from 'react';
import styles from './AppDock.module.css';
import UiIcon, { UiIconName } from './UiIcon';
import { aspireLogo } from './logo';
import DemoCampusRecentInjector from './DemoCampusRecentInjector';

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
  { key: 'activity', label: 'My Activity', href: '/connections#my-activity', icon: 'activity' },
  { key: 'saved', label: 'Saved', href: '/saved', icon: 'bookmark' },
  { key: 'transactions', label: 'Transactions', href: '/connections#transactions', icon: 'wallet' }
];

const accountItems: DockItem[] = [
  { key: 'profile', label: 'Profile', href: '/profile', icon: 'user', mobile: true }
];

export default function AppDock({ active, preview = false }: { active: AppDockTab; preview?: boolean }) {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    const stored = window.localStorage.getItem('aspire-theme');
    const next: Theme = stored === 'dark' || stored === 'light'
      ? stored
      : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.dataset.aspireTheme = next;
  }, []);

  function toggleTheme() {
    const next: Theme = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    window.localStorage.setItem('aspire-theme', next);
    document.documentElement.dataset.aspireTheme = next;
  }

  function renderItem(item: DockItem) {
    return (
      <a
        key={item.key}
        href={preview ? '/ui-preview' : item.href}
        className={`${styles.navItem} ${!item.mobile ? styles.desktopExtra : ''} ${item.key === active ? styles.active : ''} ${item.key === 'post' ? styles.post : ''}`.trim()}
        aria-current={item.key === active ? 'page' : undefined}
        title={item.label}
        onClick={preview ? (event) => event.preventDefault() : undefined}
      >
        <UiIcon name={item.icon} />
        <span>{item.label}</span>
      </a>
    );
  }

  return (
    <>
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
        <a className={`${styles.utilityLink} ${styles.desktopExtra}`} href={preview ? '/ui-preview' : '/profile#account-settings'} title="Settings" onClick={preview ? (event) => event.preventDefault() : undefined}>
          <UiIcon name="settings" />
          <span>Settings</span>
        </a>
        <button className={styles.themeButton} type="button" onClick={toggleTheme} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`} title={`Switch to ${theme === 'light' ? 'Black & Gold' : 'Light'} mode`}>
          <UiIcon name={theme === 'light' ? 'moon' : 'sun'} />
        </button>
      </nav>
      {!preview && <DemoCampusRecentInjector />}
    </>
  );
}
