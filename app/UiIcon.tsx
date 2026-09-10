import type { ReactNode, SVGProps } from 'react';

export type UiIconName =
  | 'home'
  | 'search'
  | 'plus'
  | 'message'
  | 'user'
  | 'car'
  | 'book'
  | 'game'
  | 'code'
  | 'users'
  | 'tag'
  | 'bell'
  | 'sun'
  | 'moon'
  | 'mapPin'
  | 'check'
  | 'chevron'
  | 'compass'
  | 'wrench'
  | 'calendar'
  | 'flame'
  | 'sliders'
  | 'activity'
  | 'bookmark'
  | 'wallet'
  | 'shield'
  | 'settings';

const paths: Record<UiIconName, ReactNode> = {
  home: <><path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V21h13V9.5"/><path d="M9.5 21v-6h5v6"/></>,
  search: <><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></>,
  plus: <><path d="M12 5v14"/><path d="M5 12h14"/></>,
  message: <><path d="M4 5.5h16v11H9l-5 4v-15Z"/><path d="M8 10h8"/><path d="M8 13.5h5"/></>,
  user: <><circle cx="12" cy="8" r="3.5"/><path d="M5 20c.8-4 3.1-6 7-6s6.2 2 7 6"/></>,
  car: <><path d="m5 10 1.8-4h10.4l1.8 4"/><path d="M3.5 10h17v7.5h-17z"/><circle cx="7" cy="17.5" r="1.5"/><circle cx="17" cy="17.5" r="1.5"/><path d="M6 13h2M16 13h2"/></>,
  book: <><path d="M4 5.5c3.2-.8 5.8-.2 8 1.6v12c-2.2-1.8-4.8-2.4-8-1.6v-12Z"/><path d="M20 5.5c-3.2-.8-5.8-.2-8 1.6v12c2.2-1.8 4.8-2.4 8-1.6v-12Z"/></>,
  game: <><path d="M7.5 8h9a4 4 0 0 1 3.8 5.3l-1.1 3.3c-.7 2-3.2 2.5-4.6.9L13 15.8h-2l-1.6 1.7c-1.4 1.6-3.9 1.1-4.6-.9l-1.1-3.3A4 4 0 0 1 7.5 8Z"/><path d="M7 11v4M5 13h4"/><circle cx="16" cy="12" r=".8" fill="currentColor" stroke="none"/><circle cx="18" cy="14" r=".8" fill="currentColor" stroke="none"/></>,
  code: <><path d="m9 7-5 5 5 5"/><path d="m15 7 5 5-5 5"/><path d="m13.5 5-3 14"/></>,
  users: <><circle cx="9" cy="9" r="3"/><circle cx="17" cy="10" r="2.5"/><path d="M3.5 20c.7-4 2.5-6 5.5-6s4.8 2 5.5 6"/><path d="M14.5 15c3.2-.4 5.3 1.3 6 4.5"/></>,
  tag: <><path d="M4 5h8.5L20 12.5 12.5 20 5 12.5V5Z"/><circle cx="8.3" cy="8.3" r="1.2"/></>,
  bell: <><path d="M6.5 17h11l-1.2-2V10a4.3 4.3 0 0 0-8.6 0v5l-1.2 2Z"/><path d="M10 20h4"/></>,
  sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>,
  moon: <path d="M20 15.2A8.2 8.2 0 0 1 8.8 4 8.5 8.5 0 1 0 20 15.2Z"/>,
  mapPin: <><path d="M20 10c0 5.5-8 11-8 11S4 15.5 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
  check: <path d="m5 12.5 4 4L19 6.5"/>,
  chevron: <path d="m9 6 6 6-6 6"/>,
  compass: <><circle cx="12" cy="12" r="8.5"/><path d="m15.5 8.5-2.1 4.9-4.9 2.1 2.1-4.9 4.9-2.1Z"/></>,
  wrench: <path d="M14.7 6.3a4.7 4.7 0 0 0-5.9 5.9L3.5 17.5a2.1 2.1 0 1 0 3 3l5.3-5.3a4.7 4.7 0 0 0 5.9-5.9l-3 3-3-3 3-3Z"/>,
  calendar: <><rect x="3.5" y="5.5" width="17" height="15" rx="2"/><path d="M7.5 3v5M16.5 3v5M3.5 10h17"/></>,
  flame: <path d="M12 21c4 0 7-2.7 7-6.6 0-2.6-1.4-4.8-4.1-7.2.1 2.2-.8 3.5-2.2 4.5.2-3.6-1.8-6.2-4.9-8.7.2 3.4-2.8 5.4-2.8 9.8C5 17.5 8 21 12 21Z"/>,
  sliders: <><path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M7 14v6"/></>,
  activity: <><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 8h8M8 12h5M8 16h7"/></>,
  bookmark: <path d="M6 3.5h12v17l-6-3.7-6 3.7v-17Z"/>,
  wallet: <><path d="M4 6.5h14a2 2 0 0 1 2 2v10H4a2 2 0 0 1-2-2v-10a3 3 0 0 1 3-3h12"/><path d="M15 11h5v4h-5a2 2 0 1 1 0-4Z"/></>,
  shield: <><path d="M12 3 20 6v5c0 5-3.3 8.2-8 10-4.7-1.8-8-5-8-10V6l8-3Z"/><path d="m8.5 12 2.2 2.2 4.8-5"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>
};

export default function UiIcon({ name, ...props }: { name: UiIconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {paths[name]}
    </svg>
  );
}
