'use client';

import { ChangeEvent, useRef, useState } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabase/client';

type Props = {
  initialUrl?: string | null;
  initials: string;
  name: string;
};

type AvatarReviewResponse = {
  ok?: boolean;
  status?: 'approved' | 'review';
  avatarUrl?: string;
  summary?: string;
  error?: string;
};

const supportedTypes = ['image/jpeg', 'image/png', 'image/webp'];

function extensionForMime(mimeType: string) {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

export default function ProfileAvatar({ initialUrl, initials, name }: Props) {
  const [url, setUrl] = useState(initialUrl || '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!supportedTypes.includes(file.type)) {
      setMessage('Choose a JPG, PNG, or WebP image so Aspire Safety Intelligence can review it.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMessage('Profile photos must be 5 MB or smaller.');
      return;
    }

    setBusy(true);
    setMessage('Uploading privately for Aspire Safety Intelligence…');
    try {
      const supabase = getSupabaseBrowserClient();
      const [{ data: authData, error: authError }, { data: sessionData, error: sessionError }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.auth.getSession()
      ]);
      if (authError) throw authError;
      if (sessionError) throw sessionError;
      if (!authData.user || !sessionData.session?.access_token) throw new Error('Sign in again before changing your photo.');

      const path = `${authData.user.id}/avatar-${Date.now()}.${extensionForMime(file.type)}`;
      const { error: uploadError } = await supabase.storage.from('avatar-review').upload(path, file, {
        upsert: false,
        contentType: file.type,
        cacheControl: '300'
      });
      if (uploadError) throw uploadError;

      setMessage('Aspire Safety Intelligence is reviewing your photo…');
      const response = await fetch('/api/moderation/avatar', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ storagePath: path, mimeType: file.type })
      });
      const payload = await response.json().catch(() => ({})) as AvatarReviewResponse;
      if (!response.ok) throw new Error(payload.error || 'Could not finish the profile photo review.');

      if (payload.status === 'approved' && payload.avatarUrl) {
        setUrl(payload.avatarUrl);
        setMessage('Profile photo approved by Aspire Safety Intelligence ✓');
      } else {
        setMessage('Photo submitted for human review. Your current approved photo stays visible for now.');
      }
    } catch (error) {
      const raw = error instanceof Error ? error.message : 'Could not upload your photo.';
      setMessage(/AVATAR_MODERATION_REQUIRED/i.test(raw)
        ? 'Profile photos must pass Aspire Safety Intelligence before they can appear.'
        : raw);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="profileAvatarWrap">
      <button type="button" className={`profileAvatar profileAvatarEditable ${url ? 'hasPhoto' : ''}`} onClick={() => inputRef.current?.click()} disabled={busy} aria-label="Change profile photo">
        {url ? <img src={url} alt={`${name} profile`} /> : initials}
        <span>{busy ? '…' : '+'}</span>
      </button>
      <input ref={inputRef} className="profileAvatarInput" type="file" accept="image/jpeg,image/png,image/webp" onChange={upload} />
      <small>{message || 'Add photo · AI safety reviewed'}</small>
    </div>
  );
}
