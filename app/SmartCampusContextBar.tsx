'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import { fetchActiveUniversities, findNearbyUniversities, type NearbyUniversity, type University } from '../lib/supabase/universities';
import CampusPicker from './CampusPicker';
import styles from './SmartCampusContextBar.module.css';

type Props = {
  label?: string;
  reloadOnChange?: boolean;
};

const ACTIVE_CAMPUS_KEY = 'aspire-active-campus-id';

function campusArea(campus: Pick<University, 'city' | 'state'>) {
  return [campus.city, campus.state].filter(Boolean).join(', ');
}

function readStoredCampusId(validIds: Set<string>) {
  if (typeof window === 'undefined') return '';
  const shared = window.localStorage.getItem(ACTIVE_CAMPUS_KEY);
  if (shared && validIds.has(shared)) return shared;
  const session = window.sessionStorage.getItem(ACTIVE_CAMPUS_KEY);
  if (session && validIds.has(session)) return session;
  return '';
}

function writeStoredCampusId(campusId: string) {
  if (typeof window === 'undefined' || !campusId) return;
  window.sessionStorage.setItem(ACTIVE_CAMPUS_KEY, campusId);
  window.localStorage.setItem(ACTIVE_CAMPUS_KEY, campusId);
}

export default function SmartCampusContextBar({ label = 'CURRENT CAMPUS', reloadOnChange = true }: Props) {
  const [universities, setUniversities] = useState<University[]>([]);
  const [homeCampusId, setHomeCampusId] = useState('');
  const [activeCampusId, setActiveCampusId] = useState('');
  const [nearby, setNearby] = useState<NearbyUniversity[]>([]);
  const [locating, setLocating] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [locationUnavailable, setLocationUnavailable] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    let alive = true;
    const supabase = getSupabaseBrowserClient();
    void supabase.auth.getUser().then(async ({ data }) => {
      if (!alive || !data.user) return;
      const [{ data: profile }, campusList] = await Promise.all([
        supabase.from('profiles').select('home_campus_id,current_campus_id').eq('id', data.user.id).maybeSingle(),
        fetchActiveUniversities()
      ]);
      if (!alive) return;
      const validIds = new Set(campusList.map((campus) => campus.id));
      const stored = readStoredCampusId(validIds);
      const homeId = typeof profile?.home_campus_id === 'string' ? profile.home_campus_id : '';
      const currentId = typeof profile?.current_campus_id === 'string' ? profile.current_campus_id : '';
      const activeId = stored
        || (currentId && validIds.has(currentId) ? currentId : '')
        || (homeId && validIds.has(homeId) ? homeId : '')
        || campusList[0]?.id
        || '';
      if (activeId) writeStoredCampusId(activeId);
      setUniversities(campusList);
      setHomeCampusId(homeId);
      setActiveCampusId(activeId);
    }).catch(() => undefined);
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onStorage = (event: StorageEvent) => {
      if (event.key !== ACTIVE_CAMPUS_KEY || !event.newValue || event.newValue === activeCampusId) return;
      window.sessionStorage.setItem(ACTIVE_CAMPUS_KEY, event.newValue);
      setActiveCampusId(event.newValue);
      window.dispatchEvent(new Event('aspire-campus-context-change'));
      if (reloadOnChange) window.location.reload();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [activeCampusId, reloadOnChange]);

  useEffect(() => {
    if (!universities.length || started.current || typeof navigator === 'undefined') return;
    started.current = true;
    if (!('geolocation' in navigator)) {
      setLocationUnavailable(true);
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const result = await findNearbyUniversities(position.coords.latitude, position.coords.longitude, { limit: 5, maxMiles: 80 });
          setNearby(result);
        } catch {
          setLocationUnavailable(true);
        } finally {
          setLocating(false);
        }
      },
      () => {
        setLocationUnavailable(true);
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 7000, maximumAge: 300000 }
    );
  }, [universities.length]);

  const activeCampus = useMemo(() => universities.find((campus) => campus.id === activeCampusId) ?? null, [universities, activeCampusId]);
  const homeCampus = useMemo(() => universities.find((campus) => campus.id === homeCampusId) ?? null, [universities, homeCampusId]);
  const suggestion = useMemo(() => {
    if (!nearby.length || dismissed) return null;
    const first = nearby[0];
    if (!first || first.id === activeCampusId || first.distance_miles > 18) return null;
    const second = nearby[1];
    const clearlyClosest = !second || second.distance_miles - first.distance_miles >= 6 || first.distance_miles <= 3;
    return clearlyClosest ? first : null;
  }, [nearby, activeCampusId, dismissed]);
  const ambiguousNearby = useMemo(() => {
    if (suggestion || dismissed || !nearby.length) return [];
    const close = nearby.filter((campus) => campus.distance_miles <= 25 && campus.id !== activeCampusId).slice(0, 3);
    return close.length >= 2 ? close : [];
  }, [nearby, activeCampusId, dismissed, suggestion]);

  async function chooseCampus(nextId: string) {
    if (!nextId || nextId === activeCampusId) return;
    const supabase = getSupabaseBrowserClient();
    setActiveCampusId(nextId);
    setDismissed(true);
    writeStoredCampusId(nextId);
    window.dispatchEvent(new Event('aspire-campus-context-change'));
    try {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        await supabase.from('profiles').update({
          current_campus_id: nextId === homeCampusId ? null : nextId,
          campus_last_selected_at: new Date().toISOString()
        }).eq('id', data.user.id);
      }
    } catch {
      // Shared browser campus still works even when profile persistence is temporarily unavailable.
    }
    if (reloadOnChange) window.location.reload();
  }

  if (!activeCampus || !universities.length) return null;

  return (
    <section className={styles.root} aria-label="Smart campus context">
      <div className={styles.identity}>
        <span>{label}</span>
        <strong>{activeCampus.short_name || activeCampus.name}</strong>
        <small>{campusArea(activeCampus)}{homeCampus && homeCampus.id !== activeCampus.id ? ` · verified at ${homeCampus.short_name || homeCampus.name}` : ' · home campus'}</small>
      </div>

      <div className={styles.picker}>
        <CampusPicker
          universities={universities}
          value={activeCampusId}
          onChange={(id) => void chooseCampus(id)}
          homeCampusId={homeCampusId}
          compact
          autoDetectNearby={false}
          maxNearbyMiles={80}
        />
      </div>

      <div className={styles.status}>
        {locating && <span>◎ Detecting nearby campus…</span>}
        {!locating && suggestion && (
          <div className={styles.suggestion}>
            <div><b>Looks like you’re near {suggestion.short_name || suggestion.name}.</b><small>{campusArea(suggestion)} · {suggestion.distance_miles < 10 ? suggestion.distance_miles.toFixed(1) : Math.round(suggestion.distance_miles)} mi away</small></div>
            <button type="button" onClick={() => void chooseCampus(suggestion.id)}>Use {suggestion.short_name || suggestion.name}</button>
            <button type="button" className={styles.keep} onClick={() => setDismissed(true)}>Keep {activeCampus.short_name || activeCampus.name}</button>
          </div>
        )}
        {!locating && ambiguousNearby.length > 0 && (
          <div className={styles.suggestion}>
            <div><b>Several campuses are near you.</b><small>Choose the campus you actually want to browse or post to.</small></div>
            <div className={styles.choiceRow}>{ambiguousNearby.map((campus) => <button key={campus.id} type="button" onClick={() => void chooseCampus(campus.id)}>{campus.short_name || campus.name}</button>)}</div>
            <button type="button" className={styles.keep} onClick={() => setDismissed(true)}>Keep {activeCampus.short_name || activeCampus.name}</button>
          </div>
        )}
        {!locating && !suggestion && !ambiguousNearby.length && locationUnavailable && <span className={styles.off}>Location off · search campus manually</span>}
        {!locating && !suggestion && !ambiguousNearby.length && !locationUnavailable && nearby[0]?.id === activeCampus.id && <span className={styles.confirmed}>✓ You’re near {activeCampus.short_name || activeCampus.name}</span>}
      </div>

      <p className={styles.privacy}>Your verified school stays the same. Current campus stays synced across Post, Browse, and Market. Device coordinates are used only to suggest nearby campuses and are not saved here.</p>
    </section>
  );
}
