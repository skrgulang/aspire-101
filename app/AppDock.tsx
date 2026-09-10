'use client';

import { useEffect, useState } from 'react';
import styles from './AppDock.module.css';
import UiIcon, { UiIconName } from './UiIcon';

type AppDockTab = 'home' | 'discover' | 'post' | 'connections' | 'profile';
type Theme = 'light' | 'dark';

const items: { key: AppDockTab; label: string; href: string; icon: UiIconName }[] = [
  { key: 'home', label: 'Home', href: '/campus', icon: 'home' },
  { key: 'discover', label: 'Browse', href: '/discover', icon: 'compass' },
  { key: 'post', label: 'Post', href: '/post', icon: 'plus' },
  { key: 'connections', label: 'Connections', href: '/connections', icon: 'message' },
  { key: 'profile', label: 'Profile', href: '/profile', icon: 'user' }
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

  return (
    <nav className={`${styles.dock} signedInDock`} aria-label="Aspire app navigation">
      <a className={styles.brand} href={preview ? '/ui-preview' : '/campus'} aria-label="Aspire 101 home">A101</a>

      {items.map((item) => (
        <a
          key={item.key}
          href={preview ? '/ui-preview' : item.href}
          className={`${styles.navItem} ${item.key === active ? styles.active : ''} ${item.key === 'post' ? styles.post : ''}`.trim()}
          aria-current={item.key === active ? 'page' : undefined}
          onClick={preview ? (event) => event.preventDefault() : undefined}
        >
          <UiIcon name={item.icon} />
          <span>{item.label}</span>
        </a>
      ))}

      <span className={styles.spacer} aria-hidden="true" />
      <button className={styles.themeButton} type="button" onClick={toggleTheme} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>
        <UiIcon name={theme === 'light' ? 'moon' : 'sun'} />
      </button>
    </nav>
  );
}
