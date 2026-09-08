export type KnownLocation = {
  key: string;
  label: string;
  aliases: string[];
  type: 'airport' | 'campus' | 'city' | 'place';
};

const locations: KnownLocation[] = [
  { key: 'IND', label: 'IND', aliases: ['ind', 'indianapolis airport', 'indianapolis international airport'], type: 'airport' },
  { key: 'ORD', label: 'ORD', aliases: ['ord', "o'hare", 'ohare', "chicago o'hare", 'chicago airport'], type: 'airport' },
  { key: 'MDW', label: 'MDW', aliases: ['mdw', 'midway', 'chicago midway'], type: 'airport' },
  { key: 'SFO', label: 'SFO', aliases: ['sfo', 'san francisco airport', 'san francisco international airport'], type: 'airport' },
  { key: 'OAK', label: 'OAK', aliases: ['oak', 'oakland airport', 'oakland international airport'], type: 'airport' },
  { key: 'SJC', label: 'SJC', aliases: ['sjc', 'san jose airport'], type: 'airport' },
  { key: 'LAX', label: 'LAX', aliases: ['lax', 'los angeles airport'], type: 'airport' },
  { key: 'IAD', label: 'IAD', aliases: ['iad', 'dulles', 'washington dulles'], type: 'airport' },
  { key: 'DCA', label: 'DCA', aliases: ['dca', 'reagan airport', 'reagan national'], type: 'airport' },
  { key: 'BWI', label: 'BWI', aliases: ['bwi', 'baltimore airport'], type: 'airport' },
  { key: 'PURDUE', label: 'Purdue', aliases: ['purdue', 'west lafayette', 'purdue university', 'pmu', 'purdue memorial union'], type: 'campus' },
  { key: 'BERKELEY', label: 'UC Berkeley', aliases: ['uc berkeley', 'berkeley', 'ucb', 'cal campus'], type: 'campus' },
  { key: 'CHICAGO', label: 'Chicago', aliases: ['chicago'], type: 'city' },
  { key: 'SF', label: 'San Francisco', aliases: ['san francisco', 'sf'], type: 'city' }
];

function boundaryMatch(value: string, alias: string) {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|\\b)${escaped}(\\b|$)`, 'i').test(value);
}

export function findKnownLocations(message: string) {
  const value = message.trim().toLowerCase();
  const found: KnownLocation[] = [];
  for (const location of locations) {
    if (location.aliases.some((alias) => boundaryMatch(value, alias))) found.push(location);
  }
  return found;
}

export function canonicalLocationLabel(value: string) {
  const clean = value.trim();
  const known = findKnownLocations(clean)[0];
  return known?.label || clean;
}

export function locationSearchTerms(location: KnownLocation) {
  return Array.from(new Set([location.key, location.label, ...location.aliases].map((item) => item.toLowerCase())));
}
