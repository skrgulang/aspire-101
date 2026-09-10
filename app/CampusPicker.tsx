'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
  autoDetectNearby?: boolean;
};

export default function CampusPicker({
  universities,
  value,
  onChange,
  homeCampusId,
  className = '',
  compact = false,
  label = 'Campus',
  maxNearbyMiles = 250,
  autoDetectNearby
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [nearby, setNearby] = useState<NearbyUniversity[]>([]);
  const [locating, setLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState('');
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const autoLocateStarted = useRef(false);

  const selected = universities.find((item) => item.id === value) ?? universities[0] ?? null;
  const shouldAutoDetect = autoDetectNearby ?? !compact;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  async function loadNearby(latitude: number, longitude: number, showMessage = true) {
    try {
      const result = await findNearbyUniversities(latitude, longitude, {
        limit: compact ? 5 : 8,
        maxMiles: maxNearbyMiles
      });
      setNearby(result);
      if (showMessage) {
        setLocationMessage(result.length ? `${result.length} nearby campuses found.` : 'No supported campuses found nearby yet.');
      }
    } catch (error) {
      if (showMessage) setLocationMessage(error instanceof Error ? error.message : 'Could not find nearby campuses.');
    } finally {
      setLocating(false);
    }
  }

  function requestNearbyLocation(showMessage = true) {
    if (!('geolocation' in navigator)) {
      if (showMessage) setLocationMessage('Location is not available in this browser.');
      return;
    }

    setLocating(true);
    if (showMessage) setLocationMessage('');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        void loadNearby(position.coords.latitude, position.coords.longitude, showMessage);
      },
      () => {
        if (showMessage) setLocationMessage('Location permission was not shared. You can still search by school.');
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    );
  }

  useEffect(() => {
    if (!shouldAutoDetect || !universities.length || autoLocateStarted.current) return;
    autoLocateStarted.current = true;

    // Signed-in campus pickers automatically resolve nearby supported campuses.
    // The browser still controls location permission, and Aspire never stores
    // the user's precise coordinates here.
    requestNearbyLocation(false);
  }, [shouldAutoDetect, universities.length]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q) {
      return universities
        .filter((campus) => [campus.name, campus.short_name, campus.city, campus.state]
          .filter(Boolean)
          .some((part) => String(part).toLowerCase().includes(q)))
        .slice(0, compact ? 8 : 30);
    }

    const selectedCampus = universities.find((item) => item.id === value) ?? null;
    const nearbyRank = new Map(nearby.map((campus, index) => [campus.id, index]));
    const ranked = [...universities].sort((a, b) => {
      const aNearby = nearbyRank.has(a.id);
      const bNearby = nearbyRank.has(b.id);
      if (aNearby !== bNearby) return aNearby ? -1 : 1;
      if (aNearby && bNearby) return (nearbyRank.get(a.id) ?? 999) - (nearbyRank.get(b.id) ?? 999);
      if (a.id === value) return -1;
      if (b.id === value) return 1;
      const aSameState = Boolean(selectedCampus?.state && a.state === selectedCampus.state);
      const bSameState = Boolean(selectedCampus?.state && b.state === selectedCampus.state);
      if (aSameState !== bSameState) return aSameState ? -1 : 1;
      const aLive = a.launch_status === 'live';
      const bLive = b.launch_status === 'live';
      if (aLive !== bLive) return aLive ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return ranked.slice(0, compact ? 4 : 30);
  }, [universities, query, compact, value, nearby]);

  function choose(id: string) {
    onChange(id);
    setOpen(false);
    setQuery('');
  }

  function useLocation() {
    requestNearbyLocation(true);
  }

  return (
    <div ref={pickerRef} className={`campusPickerV2 ${compact ? 'isCompact' : ''} ${className}`}>
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
        <div className="campusPickerPopover" role="dialog" aria-label="Choose a campus">
          <div className="campusPickerSearch">
            <span aria-hidden="true">⌕</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search campus" autoFocus />
          </div>

          <button className="campusLocationButton" type="button" onClick={useLocation} disabled={locating}>
            <span>◎</span>
            <div><strong>{locating ? 'Finding campuses…' : nearby.length ? 'Refresh nearby campuses' : 'Nearby campuses'}</strong><small>{nearby.length ? 'Based on your current location' : 'Use my location'}</small></div>
            <b>→</b>
          </button>
          {locationMessage && <p className="campusLocationMessage">{locationMessage}</p>}

          {nearby.length > 0 && (
            <section className="campusPickerNearby">
              <span>NEAR YOU</span>
              {nearby.slice(0, compact ? 3 : 6).map((campus) => (
                <button type="button" key={campus.id} onClick={() => choose(campus.id)} className={campus.id === value ? 'active' : ''}>
                  <div><strong>{campus.name}</strong><small>{campus.city}{campus.state ? `, ${campus.state}` : ''}</small></div>
                  <b>{campus.distance_miles < 10 ? campus.distance_miles.toFixed(1) : Math.round(campus.distance_miles)} mi</b>
                </button>
              ))}
            </section>
          )}

          <section className="campusPickerResults">
            <span>{query ? 'RESULTS' : nearby.length ? 'NEARBY + SUGGESTED' : compact ? 'SUGGESTED' : 'EXPLORE CAMPUSES'}</span>
            {filtered.map((campus) => (
              <button type="button" key={campus.id} onClick={() => choose(campus.id)} className={campus.id === value ? 'active' : ''}>
                <div>
                  <strong>{campus.name}</strong>
                  <small>{campus.city}{campus.state ? `, ${campus.state}` : ''}</small>
                </div>
                <b>{campus.id === homeCampusId ? 'HOME ✓' : campus.id === value ? 'SELECTED' : nearbyRankLabel(nearby, campus.id) || (campus.launch_status === 'live' ? 'LIVE' : 'BETA')}</b>
              </button>
            ))}
            {!filtered.length && <p className="campusPickerEmpty">That campus is not in Aspire yet.</p>}
            {compact && !query && <p className="campusPickerHint">Search to see all supported campuses.</p>}
          </section>
        </div>
      )}
    </div>
  );
}

function nearbyRankLabel(nearby: NearbyUniversity[], campusId: string) {
  const match = nearby.find((campus) => campus.id === campusId);
  if (!match) return '';
  return match.distance_miles < 10 ? `${match.distance_miles.toFixed(1)} MI` : `${Math.round(match.distance_miles)} MI`;
}
