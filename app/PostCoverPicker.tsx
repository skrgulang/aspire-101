'use client';

import { useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import {
  coverSourceForAsset,
  fetchRecommendedCovers,
  readPostCoverPreference,
  savePostCoverPreference,
  type CampusCoverImage
} from '../lib/supabase/coverImages';
import { fetchActiveUniversities, type University } from '../lib/supabase/universities';

export default function PostCoverPicker() {
  const [campusId, setCampusId] = useState('');
  const [campus, setCampus] = useState<University | null>(null);
  const [covers, setCovers] = useState<CampusCoverImage[]>([]);
  const [selected, setSelected] = useState<'auto' | 'none' | string>('auto');
  const [loading, setLoading] = useState(true);

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

  if (loading || !campusId) return null;

  return (
    <section style={{ marginBottom: 18, padding: 18, border: '1px solid rgba(255,190,30,.25)', borderRadius: 18, background: 'rgba(255,190,30,.035)' }} aria-label="Recommended campus cover">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 18, marginBottom: 14, flexWrap: 'wrap' }}>
        <div>
          <span style={{ display: 'block', color: '#f7b916', fontSize: 11, fontWeight: 900, letterSpacing: '.1em', marginBottom: 4 }}>RECOMMENDED COVER</span>
          <strong style={{ display: 'block', fontSize: 18 }}>No photo? Aspire can pick one for you.</strong>
          <small style={{ display: 'block', marginTop: 4, opacity: .68 }}>Auto matches your {campus?.short_name || 'campus'} + post category. Or choose a campus image now. Your own upload always wins.</small>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={chooseAuto} aria-pressed={selected === 'auto'} style={{ borderRadius: 999, border: selected === 'auto' ? '1px solid #f7b916' : '1px solid rgba(255,255,255,.16)', background: selected === 'auto' ? 'rgba(247,185,22,.16)' : 'transparent', color: 'inherit', padding: '9px 13px', fontWeight: 800, cursor: 'pointer' }}>Auto</button>
          <button type="button" onClick={chooseNone} aria-pressed={selected === 'none'} style={{ borderRadius: 999, border: selected === 'none' ? '1px solid #f7b916' : '1px solid rgba(255,255,255,.16)', background: selected === 'none' ? 'rgba(247,185,22,.16)' : 'transparent', color: 'inherit', padding: '9px 13px', fontWeight: 800, cursor: 'pointer' }}>No photo</button>
        </div>
      </div>

      {visibleCovers.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: 10 }}>
          {visibleCovers.map((item) => {
            const active = selected === item.id;
            return (
              <button key={item.id} type="button" onClick={() => chooseAsset(item)} aria-pressed={active} style={{ position: 'relative', overflow: 'hidden', minHeight: 105, padding: 0, borderRadius: 14, border: active ? '2px solid #f7b916' : '1px solid rgba(255,255,255,.13)', background: '#171714', cursor: 'pointer', textAlign: 'left', color: 'white' }}>
                <img src={item.image_url} alt={item.alt_text || item.title || 'Campus cover'} style={{ width: '100%', height: 105, objectFit: 'cover', display: 'block', opacity: active ? 1 : .82 }} />
                <span style={{ position: 'absolute', left: 8, right: 8, bottom: 8, padding: '5px 7px', borderRadius: 8, background: 'rgba(0,0,0,.68)', fontSize: 11, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{active ? '✓ ' : ''}{item.title || campus?.short_name || 'Campus cover'}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <p style={{ margin: 0, opacity: .62, fontSize: 13 }}>Auto is on. We&apos;ll use a campus cover when one is available; you can also upload your own photo in the form below.</p>
      )}
    </section>
  );
}
