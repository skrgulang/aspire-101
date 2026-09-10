import type { DiscoverRequest } from '../lib/supabase/discovery';
import type { UiIconName } from './UiIcon';

export type CampusFeedCategory = {
  key: string;
  label: string;
  discoverCategory: string;
  icon: UiIconName;
  tone: string;
};

export const campusFeedCategories: CampusFeedCategory[] = [
  { key: 'events', label: 'Events', discoverCategory: 'People / community', icon: 'calendar', tone: 'events' },
  { key: 'rides', label: 'Rides', discoverCategory: 'Get me there', icon: 'car', tone: 'rides' },
  { key: 'housing', label: 'Housing', discoverCategory: 'People / community', icon: 'home', tone: 'housing' },
  { key: 'market', label: 'Buy & Sell', discoverCategory: 'Buy & sell', icon: 'tag', tone: 'market' },
  { key: 'study', label: 'Study Help', discoverCategory: 'Study / class', icon: 'book', tone: 'study' },
  { key: 'gaming', label: 'Gaming', discoverCategory: 'Gaming / duos', icon: 'game', tone: 'gaming' },
  { key: 'projects', label: 'Projects', discoverCategory: 'Build something', icon: 'code', tone: 'projects' },
  { key: 'services', label: 'Services', discoverCategory: 'Give me a hand', icon: 'wrench', tone: 'services' },
  { key: 'people', label: 'People', discoverCategory: 'People / community', icon: 'users', tone: 'people' }
];

export function campusFeedCategory(item: Pick<DiscoverRequest, 'title' | 'category' | 'kind'>): CampusFeedCategory {
  const text = `${item.category || ''} ${item.title || ''}`.toLowerCase();
  if (/event|nightshift|buildpurdue|meetup|workshop|callout|concert|party|tabling/.test(text)) return campusFeedCategories[0];
  if (/\bride\b|transport|airport|\bind\b|chicago|indy|pickup|carpool|driver/.test(text)) return campusFeedCategories[1];
  if (/housing|roommate|sublet|lease|rent|apartment|dorm|room for rent/.test(text)) return campusFeedCategories[2];
  if (item.kind === 'buy_sell' || /buy|sell|market|for sale|wanted|airpods|macbook|furniture|lamp/.test(text)) return campusFeedCategories[3];
  if (/study|class|tutor|math|calc|exam|homework|notes|course|quiz/.test(text)) return campusFeedCategories[4];
  if (/gaming|game|valorant|league|fortnite|duo|queue|cs2|playstation|xbox/.test(text)) return campusFeedCategories[5];
  if (/project|collab|designer|hackathon|build|startup|code|teammate/.test(text)) return campusFeedCategories[6];
  if (/service|moving|move|errand|repair|clean|photograph|photographer|assemble|fix|carry/.test(text)) return campusFeedCategories[7];
  return campusFeedCategories[8];
}

export function campusFeedPrice(item: Pick<DiscoverRequest, 'kind' | 'amount_cents' | 'market_intent'>) {
  if (item.amount_cents != null) {
    const value = item.amount_cents / 100;
    const amount = `$${value.toFixed(Number.isInteger(value) ? 0 : 2)}`;
    if (item.kind === 'buy_sell') return item.market_intent === 'wanted' ? `Budget ${amount}` : amount;
    return amount;
  }
  if (item.kind === 'community') return 'Free';
  if (item.kind === 'collaboration') return 'Collab';
  if (item.kind === 'split_cost') return 'Split cost';
  if (item.kind === 'buy_sell') return item.market_intent === 'wanted' ? 'Budget open' : 'Price open';
  return 'Open';
}

export function campusFeedRelativeTime(value: string) {
  const diff = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.max(1, Math.floor(diff / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function campusFeedHref(item: Pick<DiscoverRequest, 'title' | 'category' | 'kind'>, campusId?: string | null) {
  const category = campusFeedCategory(item).discoverCategory;
  const params = new URLSearchParams({ category });
  if (campusId) params.set('campus', campusId);
  return `/discover?${params.toString()}`;
}
