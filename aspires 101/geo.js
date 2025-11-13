// geo.js — location helpers + Supabase RPC wrappers
// -------------------------------------------------

// Your project (fallback if <meta> tags are missing)
const FALLBACK_SUPABASE_URL  = 'https://ikxjemnugoodfuxjaqoe.supabase.co';
const FALLBACK_SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlreGplbW51Z29vZGZ1eGphcW9lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk0MzA5NzgsImV4cCI6MjA3NTAwNjk3OH0.lD79rdsoaUYnKuEISTO5V2sQwwAdi0yindiEg60NkZI';

/* Create a Supabase client using <meta> tags, falling back to constants */
function createClient() {
  const metaURL  = document.querySelector('meta[name="supabase-url"]')?.content?.trim();
  const metaAnon = document.querySelector('meta[name="supabase-anon"]')?.content?.trim();
  const url  = metaURL  || FALLBACK_SUPABASE_URL;
  const anon = metaAnon || FALLBACK_SUPABASE_ANON;
  if (!window.supabase) throw new Error('Supabase library not loaded.');
  return window.supabase.createClient(url, anon);
}

export const supabase = (() => { try { return createClient(); }
  catch (e) { console.error('[geo.js] init:', e); return null; }})();

const num = v => (v === '' || v === null || v === undefined) ? NaN : Number(v);
const toWKT = (lat, lng) => {
  const LA = num(lat), LO = num(lng);
  return (Number.isFinite(LA) && Number.isFinite(LO)) ? `SRID=4326;POINT(${LO} ${LA})` : null;
};

async function getUser() {
  if (!supabase) throw new Error('Supabase not initialized.');
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user ?? null;
}

/** High-accuracy browser GPS (null if blocked) */
export function getBrowserLocation(opts = { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 }) {
  return new Promise(resolve => {
    if (!('geolocation' in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords || {};
        resolve(Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng, accuracy } : null);
      },
      () => resolve(null),
      opts
    );
  });
}

/** Upsert my profile with optional location */
export async function upsertMyProfile({ display_name, school, city, lat, lng, image_url }) {
  if (!supabase) throw new Error('Supabase not initialized.');
  const user = await getUser();
  if (!user) throw new Error('Not signed in');

  const payload = {
    user_id:      user.id,
    display_name: display_name ?? null,
    school:       school ?? null,
    city:         city ?? null,
    image_url:    image_url ?? null,
    location:     toWKT(lat, lng)
  };

  const { error } = await supabase.from('profiles').upsert(payload, { onConflict: 'user_id' });
  if (error) throw error;
  return true;
}

/** One-click: read GPS and save into profile.location */
export async function setProfileLocationFromBrowser() {
  const coords = await getBrowserLocation();
  if (!coords) throw new Error('Location permission denied or unavailable.');
  await upsertMyProfile({ lat: coords.lat, lng: coords.lng });
  return coords;
}

/** Create a geo-tagged post (title required) */
export async function createPost({ title, body, city, image_url, lat, lng }) {
  if (!supabase) throw new Error('Supabase not initialized.');
  const user = await getUser();
  if (!user) throw new Error('Not signed in');
  if (!title || !title.trim()) throw new Error('Title is required');

  const row = {
    user_id:   user.id,
    title:     title.trim(),
    body:      body ?? null,
    city:      city ?? null,
    image_url: image_url ?? null,
    location:  toWKT(lat, lng),
    created_at: new Date().toISOString()
  };

  const { data, error } = await supabase.from('posts').insert(row).select().maybeSingle();
  if (error) throw error;
  return data;
}

/** Nearby search via RPCs (distance in km) */
export async function fetchNearbyProfiles({ lat, lng, km = 25 }) {
  if (!supabase) throw new Error('Supabase not initialized.');
  const LA = num(lat), LO = num(lng);
  if (!Number.isFinite(LA) || !Number.isFinite(LO)) throw new Error('lat/lng required');
  const { data, error } = await supabase.rpc('nearby_profiles', { lat: LA, lng: LO, km });
  if (error) throw error;
  return data ?? [];
}

export async function fetchNearbyPosts({ lat, lng, km = 25 }) {
  if (!supabase) throw new Error('Supabase not initialized.');
  const LA = num(lat), LO = num(lng);
  if (!Number.isFinite(LA) || !Number.isFinite(LO)) throw new Error('lat/lng required');
  const { data, error } = await supabase.rpc('nearby_posts', { lat: LA, lng: LO, km });
  if (error) throw error;
  return data ?? [];
}

/** Best-effort coords: try browser, fall back to profile.location */
export async function getBestCoords() {
  const loc = await getBrowserLocation();
  if (loc) return loc;

  const user = await getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('location')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw error;

  const g = data?.location;
  if (!g) return null;

  if (g?.coordinates && Array.isArray(g.coordinates)) {
    const [lng, lat] = g.coordinates;
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  if (typeof g === 'string') {
    const m = g.match(/POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)/i);
    if (m) return { lng: parseFloat(m[1]), lat: parseFloat(m[2]) };
  }
  return null;
}

/** Tiny escape helper */
function escapeHtml(s) {
  return (s ?? '').toString().replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])
  );
}

/** Auto-hydrate if lists are present */
export async function hydrateNearbyLists() {
  try {
    const coords = await getBestCoords();
    if (!coords) return;

    const [profiles, posts] = await Promise.all([
      fetchNearbyProfiles({ ...coords, km: 25 }),
      fetchNearbyPosts({ ...coords, km: 25 })
    ]);

    const $prof = document.querySelector('#nearby-profiles');
    const $post = document.querySelector('#nearby-posts');

    if ($prof) {
      $prof.innerHTML = profiles.map(p => `
        <li class="card" style="list-style:none;margin:0 0 10px;padding:12px">
          <div style="display:flex;gap:10px;align-items:center">
            <img src="${p.image_url || 'pictures/19171758147211_.pic_hd.jpg'}" alt=""
                 style="width:36px;height:36px;border-radius:50%;object-fit:cover;border:1px solid #e5e7eb">
            <div>
              <strong>${escapeHtml(p.display_name || 'User')}</strong>
              <div class="muted" style="font-size:12px">${escapeHtml(p.school || p.city || '')}</div>
            </div>
            <span style="margin-left:auto" class="muted">${Number(p.distance_km ?? 0).toFixed(1)} km</span>
          </div>
        </li>
      `).join('');
    }

    if ($post) {
      $post.innerHTML = posts.map(r => `
        <li class="card" style="list-style:none;margin:0 0 10px;padding:12px">
          <div style="display:flex;gap:10px;align-items:flex-start">
            <img src="${r.image_url || 'pictures/19171758147211_.pic_hd.jpg'}" alt=""
                 style="width:48px;height:48px;border-radius:10px;object-fit:cover;border:1px solid #e5e7eb">
            <div style="flex:1">
              <strong>${escapeHtml(r.title || '')}</strong>
              <div class="muted" style="font-size:12px;margin-top:4px">${escapeHtml(r.body || '')}</div>
              <div class="muted" style="font-size:12px;margin-top:6px">
                ${Number(r.distance_km ?? 0).toFixed(1)} km · ${new Date(r.created_at).toLocaleString()}
              </div>
            </div>
          </div>
        </li>
      `).join('');
    }
  } catch (e) {
    console.error('[geo.js] hydrateNearbyLists()', e);
  }
}

const ready = () => {
  if (document.querySelector('#nearby-profiles, #nearby-posts')) hydrateNearbyLists();
};
document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', ready) : ready();
