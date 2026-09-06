'use client';

import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import { fetchNotifications, subscribeToNotifications } from '../lib/supabase/notifications';

type AppDockTab = 'home' | 'discover' | 'post' | 'connections' | 'profile';

const items: { key: AppDockTab; label: string; href: string; icon: string }[] = [
  { key: 'home', label: 'Home', href: '/campus', icon: '⌂' },
  { key: 'discover', label: 'Discover', href: '/discover', icon: '◎' },
  { key: 'post', label: 'Post', href: '/post', icon: '+' },
  { key: 'connections', label: 'Connections', href: '/connections', icon: '♧' },
  { key: 'profile', label: 'Profile', href: '/profile', icon: '○' }
];

export default function AppDock({ active }: { active: AppDockTab }) {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let mounted = true;
    let unsubscribe: (() => void) | undefined;

    async function refreshUnread() {
      try {
        const { data } = await supabase.auth.getUser();
        const user = data.user;
        if (!user || !mounted) {
          if (mounted) setUnread(0);
          return;
        }

        const notifications = await fetchNotifications(40);
        if (!mounted) return;
        setUnread(notifications.filter((item) => !item.read_at).length);

        if (!unsubscribe) {
          unsubscribe = subscribeToNotifications(user.id, (notification) => {
            if (!mounted || notification.read_at) return;
            setUnread((current) => current + 1);
          });
        }
      } catch {
        if (mounted) setUnread(0);
      }
    }

    void refreshUnread();
    const onChanged = () => void refreshUnread();
    window.addEventListener('aspire-notifications-changed', onChanged);

    return () => {
      mounted = false;
      window.removeEventListener('aspire-notifications-changed', onChanged);
      unsubscribe?.();
    };
  }, []);

  return (
    <nav className="appDock" aria-label="Aspire app navigation">
      {items.map((item) => {
        const hasConnectionAlert = item.key === 'connections' && unread > 0;
        return (
          <a
            key={item.key}
            href={item.href}
            className={`${item.key === active ? 'active' : ''} ${item.key === 'post' ? 'appDockPost' : ''}`.trim()}
            aria-current={item.key === active ? 'page' : undefined}
            aria-label={hasConnectionAlert ? `Connections, ${unread} unread notification${unread === 1 ? '' : 's'}` : undefined}
          >
            <span className="appDockIconWrap">
              <i aria-hidden="true">{item.icon}</i>
              {hasConnectionAlert && <b className="appDockNotificationDot" aria-hidden="true" />}
            </span>
            <span>{item.label}</span>
          </a>
        );
      })}
    </nav>
  );
}
