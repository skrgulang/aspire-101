type AppDockTab = 'home' | 'discover' | 'post' | 'connections' | 'profile';

const items: { key: AppDockTab; label: string; href: string }[] = [
  { key: 'home', label: 'Home', href: '/campus' },
  { key: 'discover', label: 'Browse', href: '/discover' },
  { key: 'post', label: 'Post', href: '/post' },
  { key: 'connections', label: 'Inbox', href: '/connections' },
  { key: 'profile', label: 'Profile', href: '/profile' }
];

function DockIcon({ kind }: { kind: AppDockTab }) {
  const shared = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };

  if (kind === 'home') return <svg {...shared}><path d="M3.5 10.5 12 3.8l8.5 6.7" /><path d="M5.5 9.5V20h13V9.5" /><path d="M9.4 20v-6h5.2v6" /></svg>;
  if (kind === 'discover') return <svg {...shared}><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.2 4.2" /></svg>;
  if (kind === 'post') return <svg {...shared}><path d="M12 6v12M6 12h12" /></svg>;
  if (kind === 'connections') return <svg {...shared}><path d="M4 5.5h16v11H9l-5 3v-14Z" /><path d="M8 10h8M8 13h5" /></svg>;
  return <svg {...shared}><circle cx="12" cy="8.2" r="3.2" /><path d="M5.5 20c.7-4 3.1-6 6.5-6s5.8 2 6.5 6" /></svg>;
}

export default function AppDock({ active }: { active: AppDockTab }) {
  return (
    <nav className="appDock" aria-label="Aspire app navigation">
      {items.map((item) => (
        <a
          key={item.key}
          href={item.href}
          className={`${item.key === active ? 'active' : ''} ${item.key === 'post' ? 'appDockPost' : ''}`.trim()}
          aria-current={item.key === active ? 'page' : undefined}
        >
          <i aria-hidden="true"><DockIcon kind={item.key} /></i>
          <span>{item.label}</span>
        </a>
      ))}
    </nav>
  );
}
