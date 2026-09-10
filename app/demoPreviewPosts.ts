import type { AspireRequest } from '../lib/supabase/requests';
import type { DiscoverCategory, DiscoverRequest } from '../lib/supabase/discovery';
import { demoRecentImages } from './demoRecentImages';

export type DemoPreviewPostDefinition = {
  id: string;
  title: string;
  details: string;
  category: DiscoverCategory;
  displayCategory: string;
  kind: AspireRequest['kind'];
  amount_cents: number | null;
  hoursAgo: number;
  imageKey?: keyof typeof demoRecentImages;
};

export const demoPreviewPostDefinitions: DemoPreviewPostDefinition[] = [
  {
    id: 'demo-preview-nightshift',
    title: 'Anyone want to go to BuildPurdue Nightshift together?',
    details: 'Looking for other Purdue students who want to head to BuildPurdue Nightshift together.',
    category: 'People / community',
    displayCategory: 'Events',
    kind: 'community',
    amount_cents: null,
    hoursAgo: 1,
    imageKey: 'nightshift'
  },
  {
    id: 'demo-preview-corec',
    title: 'Anyone want to go to CoRec together?',
    details: 'Planning to go to the CoRec later and looking for someone to work out with.',
    category: 'People / community',
    displayCategory: 'People',
    kind: 'community',
    amount_cents: null,
    hoursAgo: 2,
    imageKey: 'corec'
  },
  {
    id: 'demo-preview-gaming',
    title: 'Anyone want to game tonight?',
    details: 'Looking for Purdue students who want to play games together tonight.',
    category: 'Gaming / duos',
    displayCategory: 'Gaming',
    kind: 'community',
    amount_cents: null,
    hoursAgo: 3,
    imageKey: 'gaming'
  },
  {
    id: 'demo-preview-airport',
    title: 'Airport pickup / ride to IND',
    details: 'Looking for a ride to Indianapolis International Airport. Happy to split the cost.',
    category: 'Get me there',
    displayCategory: 'Rides',
    kind: 'split_cost',
    amount_cents: 2500,
    hoursAgo: 5
  },
  {
    id: 'demo-preview-study',
    title: 'Math 55 study group later today?',
    details: 'Looking for a few Purdue students to review Math 55 together later today.',
    category: 'Study / class',
    displayCategory: 'Study Help',
    kind: 'community',
    amount_cents: null,
    hoursAgo: 6
  },
  {
    id: 'demo-preview-coffee',
    title: 'Anyone free to grab coffee on campus?',
    details: 'Looking for someone around Purdue to grab coffee and hang out for a bit.',
    category: 'People / community',
    displayCategory: 'People',
    kind: 'community',
    amount_cents: null,
    hoursAgo: 8
  }
];

const stateKey = 'aspire-preview-demo-post-state-v1';
type DemoState = Record<string, 'open' | 'cancelled' | 'deleted'>;

export function isPreviewDemoEnabled() {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('demo') === '1' || (window.location.hostname.endsWith('.vercel.app') && window.location.hostname.includes('aspire-101'));
}

function readState(): DemoState {
  if (typeof window === 'undefined') return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(stateKey) || '{}');
    return parsed && typeof parsed === 'object' ? parsed as DemoState : {};
  } catch {
    return {};
  }
}

export function setDemoPreviewPostStatus(id: string, status: 'open' | 'cancelled' | 'deleted') {
  if (typeof window === 'undefined') return;
  const next = { ...readState(), [id]: status };
  window.localStorage.setItem(stateKey, JSON.stringify(next));
}

export function isDemoPreviewPostId(id: string) {
  return id.startsWith('demo-preview-');
}

function isPurdueDemoCampus(campusName?: string | null) {
  return /\bpurdue\b/i.test(campusName || '');
}

export function buildDemoAspireRequests(userId: string, campusName = 'Purdue University') {
  if (!isPurdueDemoCampus(campusName)) return [];

  const state = readState();
  return demoPreviewPostDefinitions
    .filter((definition) => state[definition.id] !== 'deleted')
    .map((definition) => {
      const created = new Date(Date.now() - definition.hoursAgo * 60 * 60 * 1000).toISOString();
      return {
        id: definition.id,
        poster_id: userId,
        kind: definition.kind,
        category: definition.category,
        title: definition.title,
        details: definition.details,
        campus: campusName,
        city: 'West Lafayette',
        latitude: null,
        longitude: null,
        amount_cents: definition.amount_cents,
        currency: 'USD',
        payment_method: definition.kind === 'split_cost' ? 'in_person' : 'none',
        status: state[definition.id] === 'cancelled' ? 'cancelled' : 'open',
        moderation_status: 'approved',
        created_at: created,
        updated_at: created
      } satisfies AspireRequest;
    });
}

export function buildDemoDiscoverRequests(userId: string, campusId: string, campusName = 'Purdue University', campusCover?: string | null) {
  if (!isPurdueDemoCampus(campusName)) return [];

  const requests = buildDemoAspireRequests(userId, campusName).filter((request) => request.status === 'open');
  return requests.map((request) => {
    const definition = demoPreviewPostDefinitions.find((item) => item.id === request.id)!;
    const publicUrl = definition.imageKey ? demoRecentImages[definition.imageKey] : campusCover || demoRecentImages.corec;
    return {
      ...request,
      campus_id: campusId,
      latitude: null,
      longitude: null,
      media: [{
        id: `${request.id}-image`,
        request_id: request.id,
        uploader_id: userId,
        storage_path: `preview/${request.id}.webp`,
        mime_type: 'image/webp',
        sort_order: 0,
        created_at: request.created_at,
        public_url: publicUrl
      }]
    } satisfies DiscoverRequest;
  });
}

export function filterDemoDiscoverRequests(items: DiscoverRequest[], query: string, category: DiscoverCategory) {
  const needle = query.trim().toLowerCase();
  return items.filter((item) => {
    if (category !== 'Anything' && item.category !== category) return false;
    if (!needle) return true;
    return `${item.title} ${item.details || ''} ${item.category}`.toLowerCase().includes(needle);
  });
}
