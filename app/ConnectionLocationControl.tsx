'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchActiveConnectionLocations,
  shareConnectionLocation,
  stopConnectionLocationShare,
  type ConnectionLocationShare
} from '../lib/supabase/liveConnections';
import styles from './ConnectionLocationControl.module.css';

type Props = {
  connectionId: string;
  userId: string;
  otherUserId: string;
  otherName: string;
  compact?: boolean;
};

function expiryCopy(expiresAt: string) {
  const minutes = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 60_000));
  return minutes > 1 ? `${minutes} min left` : 'expires soon';
}

export default function ConnectionLocationControl({ connectionId, userId, otherUserId, otherName, compact = false }: Props) {
  const [locations, setLocations] = useState<ConnectionLocationShare[]>([]);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');

  const reload = useCallback(async () => {
    try {
      setLocations(await fetchActiveConnectionLocations([connectionId]));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not refresh shared locations.');
    }
  }, [connectionId]);

  useEffect(() => {
    void reload();
    const refresh = () => {
      if (document.visibilityState === 'visible') void reload();
    };
    const timer = window.setInterval(refresh, 15_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [reload]);

  const myShare = useMemo(
    () => locations.find((item) => item.user_id === userId),
    [locations, userId]
  );
  const otherShare = useMemo(
    () => locations.find((item) => item.user_id === otherUserId),
    [locations, otherUserId]
  );
  const mapHref = otherShare
    ? `https://www.google.com/maps?q=${encodeURIComponent(`${otherShare.latitude},${otherShare.longitude}`)}`
    : '';

  function shareCurrentLocation() {
    if (!navigator.geolocation) {
      setNotice('Location sharing is not supported in this browser.');
      return;
    }
    setBusy('share');
    setNotice('Approve the browser permission to share your current location for 30 minutes.');
    navigator.geolocation.getCurrentPosition(async (position) => {
      try {
        await shareConnectionLocation(
          connectionId,
          position.coords.latitude,
          position.coords.longitude,
          Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
          30
        );
        await reload();
        setNotice(`Your current location is shared only with ${otherName} for 30 minutes.`);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'Could not share your current location.');
      } finally {
        setBusy('');
      }
    }, (error) => {
      setBusy('');
      setNotice(error.code === error.PERMISSION_DENIED
        ? 'Location was not shared because permission was not granted.'
        : 'Could not get your current location.');
    }, { enableHighAccuracy: true, timeout: 12_000, maximumAge: 15_000 });
  }

  async function stopSharing() {
    setBusy('stop');
    try {
      await stopConnectionLocationShare(connectionId);
      await reload();
      setNotice('Location sharing stopped.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not stop location sharing.');
    } finally {
      setBusy('');
    }
  }

  return (
    <section className={`${styles.control} ${compact ? styles.compact : ''}`} aria-label="Temporary location sharing">
      <div className={styles.copy}>
        <span>OPTIONAL LOCATION</span>
        <strong>Coordinate the meetup safely.</strong>
        <small>This shares one current location pin—not continuous tracking. It is visible only to {otherName} and expires automatically.</small>
      </div>

      {otherShare && (
        <div className={styles.shared}>
          <div><strong>{otherName} shared a location</strong><small>{expiryCopy(otherShare.expires_at)}{otherShare.accuracy_meters ? ` · accurate to about ${Math.round(otherShare.accuracy_meters)} m` : ''}</small></div>
          <a href={mapHref} target="_blank" rel="noreferrer">Open shared pin ↗</a>
        </div>
      )}

      <div className={styles.actions}>
        {!myShare ? (
          <button type="button" disabled={Boolean(busy)} onClick={shareCurrentLocation}>
            {busy === 'share' ? 'Getting location…' : 'Share current location · 30m'}
          </button>
        ) : (
          <>
            <span>Your pin is shared · {expiryCopy(myShare.expires_at)}</span>
            <button className={styles.stop} type="button" disabled={Boolean(busy)} onClick={() => void stopSharing()}>
              {busy === 'stop' ? 'Stopping…' : 'Stop sharing'}
            </button>
          </>
        )}
      </div>

      {notice && <p className={styles.notice} role="status">{notice}</p>}
    </section>
  );
}
