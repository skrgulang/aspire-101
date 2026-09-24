'use client';

import { ChangeEvent, useRef, useState } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabase/client';

type Props = {
  initialUrl?: string | null;
};

export default function ProfileBanner({ initialUrl }: Props) {
  const [url, setUrl] = useState(initialUrl || '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) {
      setMessage('Choose a JPG, PNG, or WebP image.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setMessage('Profile banners must be 8 MB or smaller.');
      return;
    }

    setBusy(true);
    setMessage('');
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!authData.user) throw new Error('Sign in again before changing your banner.');

      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      const path = `${authData.user.id}/banner-pending-${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('avatar-pending')
        .upload(path, file, { upsert: false, contentType: file.type, cacheControl: '3600' });
      if (uploadError) throw uploadError;

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session?.access_token) {
        throw sessionError || new Error('Sign in again before changing your banner.');
      }

      setMessage('Reviewing banner…');
      const response = await fetch('/api/moderation/avatar', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ storagePath: path, mimeType: file.type, kind: 'banner' }),
        cache: 'no-store'
      });

      const payload = await response.json().catch(() => ({})) as {
        status?: string;
        bannerUrl?: string;
        message?: string;
        error?: string;
      };

      if (!response.ok) throw new Error(payload.error || 'Aspire could not review this banner.');
      if (payload.status === 'approved' && payload.bannerUrl) {
        setUrl(payload.bannerUrl);
      }
      setMessage(payload.message || (payload.status === 'approved' ? 'Profile banner updated.' : 'Choose a different banner.'));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not upload your banner.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`profileBannerEditor ${url ? 'hasBanner' : ''}`}>
      {url ? <img src={url} alt="" aria-hidden="true" /> : <div className="profileBannerFallback" />}
      <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}>
        {busy ? 'Updating…' : url ? 'Change banner' : 'Add banner'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={upload}
      />
      {message && <small role="status">{message}</small>}
    </div>
  );
}
