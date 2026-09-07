'use client';

import { useEffect, useState } from 'react';
import {
  AvatarModerationQueueItem,
  fetchAvatarModerationQueue,
  reviewAvatarModeration
} from '../lib/supabase/avatarModeration';

function when(value: string) {
  return new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function AvatarModerationPanel() {
  const [items, setItems] = useState<AvatarModerationQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');

  async function load() {
    setLoading(true);
    try {
      setItems(await fetchAvatarModerationQueue());
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not load profile photo reviews.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function decide(item: AvatarModerationQueueItem, decision: 'approved' | 'rejected') {
    const note = decision === 'rejected'
      ? window.prompt('Why are you rejecting this profile photo?', 'Does not meet Aspire profile-photo guidelines.') ?? ''
      : '';
    if (decision === 'rejected' && !note.trim()) return;
    setBusy(item.id);
    setNotice('');
    try {
      await reviewAvatarModeration(item.id, decision, note);
      setNotice(decision === 'approved' ? 'Profile photo approved and published.' : 'Profile photo rejected. The user’s previous approved photo remains unchanged.');
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not review this profile photo.');
    } finally {
      setBusy('');
    }
  }

  return (
    <section className="avatarModerationOps shell" aria-label="Profile photo moderation">
      <div className="avatarModerationHead">
        <div>
          <span>AI-EMPOWERED IDENTITY SURFACE</span>
          <h2>Profile photos</h2>
          <p>Low-risk photos can pass Aspire Safety Intelligence automatically. Flagged or uncertain photos stay private until a human reviewer approves them. Aspire does not use face recognition or try to identify who is in a photo.</p>
        </div>
        <b>{loading ? '…' : items.length} NEED REVIEW</b>
      </div>

      {notice && <div className="moderatorNotice" role="status">{notice}</div>}
      {loading ? (
        <div className="avatarModerationEmpty"><span />Checking private avatar queue…</div>
      ) : !items.length ? (
        <div className="avatarModerationEmpty"><i>✓</i><strong>Profile photo queue is clear.</strong><small>Only photos that need human judgment appear here.</small></div>
      ) : (
        <div className="avatarModerationGrid">
          {items.map((item) => {
            const flagged = Object.entries(item.categories || {}).filter(([, value]) => value).map(([key]) => key);
            return (
              <article key={item.id} className={`avatarModerationCard risk-${item.riskLevel}`}>
                <div className="avatarModerationPreview">
                  {item.previewUrl ? <img src={item.previewUrl} alt="Profile photo awaiting moderation" /> : <span>No preview</span>}
                </div>
                <div className="avatarModerationCopy">
                  <div className="avatarModerationMeta">
                    <span>{item.school.toUpperCase()} · {when(item.createdAt)}</span>
                    <b>{item.riskLevel.toUpperCase()}{item.riskScore != null ? ` · ${item.riskScore}/100` : ''}</b>
                  </div>
                  <h3>{item.displayName}</h3>
                  <p>{item.summary || 'Awaiting human profile-photo review.'}</p>
                  {flagged.length > 0 && <small>AI signals: {flagged.join(' · ')}</small>}
                  <div className="avatarModerationActions">
                    <button type="button" className="approve" onClick={() => decide(item, 'approved')} disabled={busy === item.id}>Approve photo</button>
                    <button type="button" className="reject" onClick={() => decide(item, 'rejected')} disabled={busy === item.id}>Reject</button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
