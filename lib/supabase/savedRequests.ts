import { getSupabaseBrowserClient } from './client';

export type SavedRequestSnapshot = {
  id: string;
  title: string;
  category?: string;
  campus?: string;
  meta?: string;
  image?: string;
  href?: string;
};

type SavedRow = {
  request_id: string;
  snapshot: Record<string, unknown> | null;
  created_at: string;
};

const LEGACY_STORAGE_KEY = 'aspire-saved-posts';
const savedKey = (userId: string) => `aspire-saved-posts:${userId}`;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let cacheUserId = '';
let cachedIds: Set<string> | null = null;
let idsPromise: Promise<Set<string>> | null = null;
const migrationPromises = new Map<string, Promise<void>>();

function normalizeSnapshot(value: unknown, requestId?: string): SavedRequestSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const id = requestId || (typeof raw.id === 'string' ? raw.id : '');
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  if (!id || !title) return null;

  const optional = (key: string) => typeof raw[key] === 'string' && raw[key] ? String(raw[key]) : undefined;
  const hrefRaw = optional('href');
  const href = hrefRaw && hrefRaw.startsWith('/') ? hrefRaw : undefined;

  return {
    id,
    title,
    category: optional('category'),
    campus: optional('campus'),
    meta: optional('meta'),
    image: optional('image'),
    href
  };
}

function readLocalItems(userId: string) {
  if (typeof window === 'undefined') return [] as SavedRequestSnapshot[];
  const keys = [savedKey(userId), LEGACY_STORAGE_KEY];
  const merged = new Map<string, SavedRequestSnapshot>();
  keys.forEach((key) => {
    try {
      const raw = window.localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return;
      parsed.forEach((item) => {
        const normalized = normalizeSnapshot(item);
        if (normalized) merged.set(normalized.id, normalized);
      });
    } catch {
      // Ignore malformed browser cache; cloud Saved remains authoritative.
    }
  });
  return [...merged.values()];
}

function writeLocalItems(userId: string, items: SavedRequestSnapshot[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(savedKey(userId), JSON.stringify(items));
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // Browser storage is only a migration/offline fallback.
  }
}

async function currentUserId() {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error('You must be signed in.');
  return data.user.id;
}

async function migrateLocalSaved(userId: string) {
  if (migrationPromises.has(userId)) return migrationPromises.get(userId)!;

  const promise = (async () => {
    const localItems = readLocalItems(userId).filter((item) => uuidPattern.test(item.id));
    if (!localItems.length) return;

    const supabase = getSupabaseBrowserClient();
    let allSynced = true;
    for (const item of localItems) {
      const { error } = await supabase.from('saved_requests').upsert({
        user_id: userId,
        request_id: item.id,
        snapshot: item,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,request_id' });
      if (error) allSynced = false;
    }

    if (allSynced) writeLocalItems(userId, []);
  })().catch(() => undefined);

  migrationPromises.set(userId, promise);
  return promise;
}

export async function fetchSavedRequestIds(force = false) {
  const userId = await currentUserId();
  await migrateLocalSaved(userId);

  if (!force && cacheUserId === userId && cachedIds) return new Set(cachedIds);
  if (!force && cacheUserId === userId && idsPromise) return new Set(await idsPromise);

  cacheUserId = userId;
  idsPromise = (async () => {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from('saved_requests')
      .select('request_id')
      .eq('user_id', userId);

    if (error) {
      const fallback = new Set(readLocalItems(userId).map((item) => item.id));
      cachedIds = fallback;
      return fallback;
    }

    const next = new Set((data ?? []).map((row) => String(row.request_id)));
    cachedIds = next;
    return next;
  })();

  try {
    return new Set(await idsPromise);
  } finally {
    idsPromise = null;
  }
}

export async function isRequestSaved(requestId: string) {
  const ids = await fetchSavedRequestIds();
  return ids.has(requestId);
}

export async function saveRequest(snapshot: SavedRequestSnapshot) {
  const userId = await currentUserId();
  const normalized = normalizeSnapshot(snapshot, snapshot.id);
  if (!normalized || !uuidPattern.test(normalized.id)) throw new Error('This request cannot be saved.');

  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from('saved_requests').upsert({
    user_id: userId,
    request_id: normalized.id,
    snapshot: normalized,
    updated_at: new Date().toISOString()
  }, { onConflict: 'user_id,request_id' });

  if (error) {
    const local = readLocalItems(userId).filter((item) => item.id !== normalized.id);
    writeLocalItems(userId, [normalized, ...local]);
  }

  if (cacheUserId !== userId || !cachedIds) {
    cacheUserId = userId;
    cachedIds = new Set();
  }
  cachedIds.add(normalized.id);
  return { synced: !error };
}

export async function removeSavedRequest(requestId: string) {
  const userId = await currentUserId();

  // Remove the local/offline copy and cached state first so the bookmark always
  // behaves like a true toggle, even if cloud Saved is temporarily unavailable.
  const local = readLocalItems(userId).filter((item) => item.id !== requestId);
  writeLocalItems(userId, local);
  if (cacheUserId === userId && cachedIds) cachedIds.delete(requestId);

  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase
    .from('saved_requests')
    .delete()
    .eq('user_id', userId)
    .eq('request_id', requestId);

  // Saving already supports a local fallback. Match that behavior on removal
  // rather than leaving a yellow bookmark stuck because cloud sync failed.
  return { synced: !error };
}

export async function fetchSavedRequests() {
  const userId = await currentUserId();
  await migrateLocalSaved(userId);
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('saved_requests')
    .select('request_id,snapshot,created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) return readLocalItems(userId);

  const items = ((data ?? []) as SavedRow[])
    .map((row) => normalizeSnapshot(row.snapshot, row.request_id))
    .filter(Boolean) as SavedRequestSnapshot[];

  cacheUserId = userId;
  cachedIds = new Set(items.map((item) => item.id));
  return items;
}
