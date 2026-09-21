'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabase/client';

type AvatarReviewItem = {
  id: string;
  user_id: string;
  status: 'review' | 'rejected';
  risk_level: string;
  risk_score: number | null;
  ai_summary: string | null;
  public_policy_decision: string | null;
  public_policy_reason_code: string | null;
  public_policy_summary: string | null;
  created_at: string;
  signed_url: string | null;
  display_name: string;
  school: string | null;
};

async function token() {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) throw new Error('Sign in again to review profile photos.');
  return data.session.access_token;
}

export default function AvatarModerationQueue() {
  const [items, setItems] = useState<AvatarReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const accessToken = await token();
      const response = await fetch('/api/moderation/avatar', {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store'
      });
      const payload = await response.json().catch(() => ({})) as { items?: AvatarReviewItem[]; error?: string };
      if (!response.ok) {
        if (response.status === 403 && payload.error?.includes('two-step')) {
          setNotice('Profile photo review requires two-step verification.');
          setItems([]);
          return;
        }
        throw new Error(payload.error || 'Could not load profile photo reviews.');
      }
      setItems(payload.items ?? []);
      setNotice('');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not load profile photo reviews.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function decide(item: AvatarReviewItem, decision: 'approved' | 'rejected') {
    const note = window.prompt(
      decision === 'approved' ? 'Optional approval note:' : 'Reason for rejection:',
      decision === 'approved' ? '' : 'Does not meet Aspire public profile rules.'
    );
    if (note === null) return;
    setBusy(item.id);
    setNotice('');
    try {
      const accessToken = await token();
      const response = await fetch('/api/moderation/avatar', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ reviewId: item.id, decision, note }),
        cache: 'no-store'
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Could not save this review.');
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      setNotice(decision === 'approved' ? 'Profile photo approved.' : 'Profile photo rejected.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not save this review.');
    } finally {
      setBusy('');
    }
  }

  return (
    <section style={{ maxWidth: 1180, margin: '24px auto', padding: '0 22px' }} aria-label="Profile photo moderation">
      <div className="moderatorPanel">
        <div className="moderatorPanelHead">
          <div><span>PUBLIC PROFILE SAFETY</span><h2>Profile photo review</h2></div>
          <p>Automated checks block harmful and prohibited political imagery before it becomes public. Ambiguous photos stay private until a moderator decides.</p>
        </div>
        {notice && <div className="moderatorNotice" role="status">{notice}</div>}
        <div className="moderatorList">
          {loading && <div className="moderatorEmpty"><strong>Loading profile photo reviews…</strong></div>}
          {!loading && !items.length && <div className="moderatorEmpty"><i>✓</i><strong>Profile photo queue is clear.</strong><span>No ambiguous photos are waiting for review.</span></div>}
          {items.map((item) => (
            <article className="moderatorRow moderatorContentRow attention" key={item.id}>
              <div className="moderatorRowMain">
                <span>{item.status.toUpperCase()} · {item.risk_level.toUpperCase()} {item.risk_score != null ? `· ${item.risk_score}/100` : ''}</span>
                <strong>{item.display_name}{item.school ? ` · ${item.school}` : ''}</strong>
                {item.signed_url && <div className="moderatorMediaStrip"><a href={item.signed_url} target="_blank" rel="noreferrer"><img src={item.signed_url} alt="Profile photo submitted for moderation" /></a></div>}
                <p>{item.ai_summary || 'Needs human review.'}</p>
                {item.public_policy_reason_code && <small>Public-space policy: {item.public_policy_decision || 'review'} · {item.public_policy_reason_code.replaceAll('_', ' ')}</small>}
                {item.public_policy_summary && <small>{item.public_policy_summary}</small>}
                <small>User {item.user_id.slice(0, 8)} · submitted {new Date(item.created_at).toLocaleString()}</small>
              </div>
              <div className="moderatorRowActions">
                <button type="button" className="moderatorReject" onClick={() => void decide(item, 'rejected')} disabled={busy === item.id}>Reject</button>
                <button type="button" className="button buttonGold" onClick={() => void decide(item, 'approved')} disabled={busy === item.id}>{busy === item.id ? 'Saving…' : 'Approve ✓'}</button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
