'use client';

import { ChangeEvent, useRef, useState } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabase/client';

type Props = {
  initialUrl?: string | null;
  initials: string;
  name: string;
};

type UploadPayload = {
  ok?: boolean;
  status?: 'approved' | 'review' | 'rejected';
  avatarUrl?: string;
  message?: string;
  error?: string;
};

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
      setMessage('Use a JPG, PNG, or WebP image. Profile photos are checked before they become public.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMessage('Profile photos must be 5 MB or smaller.');
      return;
    }

    setBusy(true);
    setMessage('Checking photo before it becomes public…');
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session?.access_token) throw new Error('Sign in again before changing your photo.');

      const form = new FormData();
      form.append('avatar', file);
      const response = await fetch('/api/profile/avatar', {
        method: 'POST',
        headers: { Authorization: `Bearer ${data.session.access_token}` },
        body: form,
        cache: 'no-store'
      });
      const payload = await response.json().catch(() => ({})) as UploadPayload;
      if (!response.ok) throw new Error(payload.error || 'Could not process your photo.');

      if (payload.status === 'approved' && payload.avatarUrl) setUrl(payload.avatarUrl);
      setMessage(payload.message || (payload.status === 'approved' ? 'Profile photo updated.' : 'Photo is waiting for review. Your current photo stays visible.'));
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
