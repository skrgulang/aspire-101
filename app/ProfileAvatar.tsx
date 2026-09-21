'use client';

import { ChangeEvent, useRef, useState } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabase/client';

type Props = {
  initialUrl?: string | null;
  initials: string;
  name: string;
};

function ownedAvatarPath(publicUrl: string, expectedOrigin: string, userId: string) {
  if (!publicUrl) return null;
  try {
    const parsed = new URL(publicUrl);
    if (parsed.origin !== expectedOrigin) return null;
    const prefix = '/storage/v1/object/public/avatars/';
    if (!parsed.pathname.startsWith(prefix)) return null;
    const path = decodeURIComponent(parsed.pathname.slice(prefix.length));
    return path.startsWith(`${userId}/`) ? path : null;
  } catch {
    return null;
  }
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
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) {
      setMessage('Choose a JPG, PNG, or WebP image so Aspire can review it before publishing.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMessage('Profile photos must be 5 MB or smaller.');
      return;
    }

    setBusy(true);
    setMessage('');
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!authData.user) throw new Error('Sign in again before changing your photo.');
      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      const path = `${authData.user.id}/pending-${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('avatar-pending').upload(path, file, { upsert: false, contentType: file.type, cacheControl: '3600' });
      if (uploadError) throw uploadError;

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session?.access_token) throw sessionError || new Error('Sign in again before changing your photo.');

      setMessage('Reviewing photo…');
      const response = await fetch('/api/moderation/avatar', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ storagePath: path, mimeType: file.type }),
        cache: 'no-store'
      });
      const payload = await response.json().catch(() => ({})) as { status?: string; avatarUrl?: string; message?: string; error?: string };
      if (!response.ok) throw new Error(payload.error || 'Aspire could not review this photo.');
      if (payload.status === 'approved' && payload.avatarUrl) setUrl(payload.avatarUrl);
      setMessage(payload.message || (payload.status === 'pending' ? 'Photo sent for review.' : payload.status === 'rejected' ? 'Photo was not allowed.' : 'Profile photo updated.'));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not upload your photo.');
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
      <small>{message || 'Add photo'}</small>
    </div>
  );
}
