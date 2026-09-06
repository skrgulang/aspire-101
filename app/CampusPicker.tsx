'use client';

import { useMemo, useState } from 'react';
import { findNearbyUniversities, NearbyUniversity, University } from '../lib/supabase/universities';

type Props = {
  universities: University[];
  value: string;
  onChange: (campusId: string) => void;
  homeCampusId?: string;
  className?: string;
  compact?: boolean;
  label?: string;
  maxNearbyMiles?: number;
};

export default function CampusPicker({
  universities,
  value,
  onChange,
  homeCampusId,
  className = '',
  compact = false,
  label = 'Campus',
  maxNearbyMiles = 250
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [nearby, setNearby] = useState<NearbyUniversity[]>([]);
  const [locating, setLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState('');

  const selected = universities.find((item) => item.id === value) ?? universities[0] ?? null;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return universities.slice(0, compact ? 14 : 30);
    return universities
      .filter((campus) => [campus.name, campus.short_name, campus.city, campus.state]
        .filter(Boolean)
        .some((part) => String(part).toLowerCase().includes(q)))
      .slice(0, 30);
  }, [universities, query, compact]);

  function choose(id: string) {
    onChange(id);
    setOpen(false);
    setQuery('');
  }

  async function useLocation() {
    if (!('geolocation' in navigator)) {
      setLocationMessage('Location is not available in this browser.');
      return;
    }
    setLocating(true);
    setLocationMessage('');
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const result = await findNearbyUniversities(position.coords.latitude, position.coords.longitude, {
            limit: 8,
            maxMiles: maxNearbyMiles
          });
          setNearby(result);
          setLocationMessage(result.length ? `${result.length} nearby campuses found.` : 'No supported campuses found nearby yet.');
        } catch (error) {
          setLocationMessage(error instanceof Error ? error.message : 'Could not find nearby campuses.');
        } finally {
          setLocating(false);
        }
      },
      () => {
        setLocationMessage('Location permission was not shared. You can still search by school.');
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    );
  }

  return (
    <div className={`campusPickerV2 ${compact ? 'isCompact' : ''} ${className}`}>
      {!compact && <span className="campusPickerLabel">{label}</span>}
      <button className="campusPickerTrigger" type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open}>
        <i aria-hidden="true">●</i>
        <span>
          <strong>{selected?.short_name ?? 'Choose campus'}</strong>
          {!compact && selected && <small>{selected.city}{selected.state ? `, ${selected.state}` : ''}</small>}
        </span>
        <b aria-hidden="true">⌄</b>
      </button>

      {open && (
        <div className="campusPickerPopover">
          <div className="campusPickerSearch">
            <span aria-hidden="true">⌕</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search school, city, or state" autoFocus />
          </div>

          <button className="campusLocationButton" type="button" onClick={useLocation} disabled={locating}>
            <span>◎</span>
            <div><strong>{locating ? 'Finding nearby campuses…' : 'Use my location'}</strong><small>Only when you choose to share it</small></div>
            <b>→</b>
          </button>
          {locationMessage && <p className="campusLocationMessage">{locationMessage}</p>}

          {nearby.length > 0 && (
            <section className="campusPickerNearby">
              <span>NEAR YOU</span>
              {nearby.slice(0, 6).map((campus) => (
                <button type="button" key={campus.id} onClick={() => choose(campus.id)} className={campus.id === value ? 'active' : ''}>
                  <div><strong>{campus.name}</strong><small>{campus.city}{campus.state ? `, ${campus.state}` : ''}</small></div>
                  <b>{campus.distance_miles < 10 ? campus.distance_miles.toFixed(1) : Math.round(campus.distance_miles)} mi</b>
                </button>
              ))}
            </section>
          )}

          <section className="campusPickerResults">
            <span>{query ? 'SEARCH RESULTS' : 'EXPLORE CAMPUSES'}</span>
            {filtered.map((campus) => (
              <button type="button" key={campus.id} onClick={() => choose(campus.id)} className={campus.id === value ? 'active' : ''}>
                <div>
                  <strong>{campus.name}</strong>
                  <small>{campus.city}{campus.state ? `, ${campus.state}` : ''}</small>
                </div>
                <b>{campus.id === homeCampusId ? 'HOME ✓' : campus.launch_status === 'live' ? 'LIVE' : 'BETA'}</b>
              </button>
            ))}
            {!filtered.length && <p className="campusPickerEmpty">That campus is not in Aspire yet.</p>}
          </section>
        </div>
      )}
    </div>
  );
}
