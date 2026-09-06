type AppDockTab = 'home' | 'discover' | 'post' | 'connections' | 'profile';

const items: { key: AppDockTab; label: string; href: string; icon: string }[] = [
  { key: 'home', label: 'Home', href: '/campus', icon: '⌂' },
  { key: 'discover', label: 'Discover', href: '/discover', icon: '◎' },
  { key: 'post', label: 'Post', href: '/post', icon: '+' },
  { key: 'connections', label: 'Connections', href: '/connections', icon: '♧' },
  { key: 'profile', label: 'Profile', href: '/profile', icon: '○' }
];

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
          <i aria-hidden="true">{item.icon}</i>
          <span>{item.label}</span>
        </a>
      ))}
    </nav>
  );
}
