'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import {
  coverSourceForAsset,
  fetchRecommendedCovers,
  readPostCoverPreference,
  savePostCoverPreference,
  type CampusCoverImage
} from '../lib/supabase/coverImages';
import { fetchActiveUniversities, type University } from '../lib/supabase/universities';
import styles from './PostCoverPicker.module.css';

export default function PostCoverPicker() {
  const [campusId, setCampusId] = useState('');
  const [campus, setCampus] = useState<University | null>(null);
  const [covers, setCovers] = useState<CampusCoverImage[]>([]);
  const [selected, setSelected] = useState<'auto' | 'none' | string>('auto');
  const [loading, setLoading] = useState(true);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const resolveTarget = () => {
      const target = document.querySelector<HTMLElement>('.requestMediaComposer');
      setPortalTarget((current) => current === target ? current : target);
    };

    resolveTarget();
    const observer = new MutationObserver(resolveTarget);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let alive = true;
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!alive || !data.user) return;
      const [{ data: profile }, universities] = await Promise.all([
        supabase.from('profiles').select('home_campus_id,current_campus_id').eq('id', data.user.id).maybeSingle(),
        fetchActiveUniversities()
      ]);
      if (!alive) return;
      const homeId = typeof profile?.home_campus_id === 'string' ? profile.home_campus_id : '';
      const currentId = typeof profile?.current_campus_id === 'string' ? profile.current_campus_id : '';
      const activeId = currentId && universities.some((item) => item.id === currentId) ? currentId : homeId;
      if (!activeId) {
        setLoading(false);
        return;
      }
      setCampusId(activeId);
      setCampus(universities.find((item) => item.id === activeId) ?? null);
      const rows = await fetchRecommendedCovers(activeId, null, 12);
      if (!alive) return;
      setCovers(rows);
      const stored = readPostCoverPreference(activeId);
      setSelected(stored?.mode === 'asset' ? stored.asset_id : stored?.mode || 'auto');
      setLoading(false);
    }).catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const visibleCovers = useMemo(() => {
    const seen = new Set<string>();
    return covers.filter((item) => {
      if (seen.has(item.image_url)) return false;
      seen.add(item.image_url);
      return true;
    }).slice(0, 6);
  }, [covers]);

  function chooseAuto() {
    if (!campusId) return;
    setSelected('auto');
    savePostCoverPreference({ mode: 'auto', campus_id: campusId });
  }

  function chooseNone() {
    if (!campusId) return;
    setSelected('none');
    savePostCoverPreference({ mode: 'none', campus_id: campusId });
  }

  function chooseAsset(item: CampusCoverImage) {
    if (!campusId) return;
    setSelected(item.id);
    savePostCoverPreference({
      mode: 'asset',
      campus_id: campusId,
      asset_id: item.id,
      image_url: item.image_url,
      source: coverSourceForAsset(item),
      title: item.title
    });
  }

  if (loading || !campusId || !portalTarget) return null;

  return createPortal(
    <div className={styles.root} aria-label="Recommended campus photos">
      <div className={styles.header}>
        <div className={styles.copy}>
          <span className={styles.eyebrow}>RECOMMENDED PHOTOS · OPTIONAL</span>
          <strong>Need a cover? Pick one from {campus?.short_name || 'your campus'}.</strong>
          <small>Choose a campus photo below, or leave it on Auto. If you upload your own photo above, your upload is used instead.</small>
        </div>
        <div className={styles.modeButtons}>
          <button type="button" onClick={chooseAuto} aria-pressed={selected === 'auto'} className={selected === 'auto' ? styles.activeMode : ''}>Auto pick</button>
          <button type="button" onClick={chooseNone} aria-pressed={selected === 'none'} className={selected === 'none' ? styles.activeMode : ''}>No photo</button>
        </div>
      </div>

      {visibleCovers.length > 0 ? (
        <div className={styles.grid}>
          {visibleCovers.map((item) => {
            const active = selected === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => chooseAsset(item)}
                aria-pressed={active}
                className={`${styles.coverCard} ${active ? styles.selectedCard : ''}`}
              >
                <img src={item.image_url} alt={item.alt_text || item.title || 'Campus cover'} />
                <span>{active ? '✓ ' : ''}{item.title || campus?.short_name || 'Campus photo'}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className={styles.empty}>Auto is on. Aspire will use a campus cover when one is available.</div>
      )}
    </div>,
    portalTarget
  );
}
