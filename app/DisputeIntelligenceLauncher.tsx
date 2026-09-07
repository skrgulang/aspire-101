'use client';

import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabase/client';

type QueueItem = { id: string; title: string; reason: string; details: string; status: string; order_status: string | null; amount_cents: number | null; currency: string; created_at: string };
type Brief = {
  summary: string;
  timeline: string[];
  buyer_claims: string[];
  seller_claims: string[];
  evidence_gaps: string[];
  risk_signals: string[];
  suggested_next_steps: string[];
  review_direction: 'need_more_evidence' | 'review_buyer_remedy' | 'review_seller_release' | 'manual_review';
  confidence: 'low' | 'medium' | 'high';
};

function money(cents: number | null, currency = 'USD') {
  if (cents == null) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
}

export default function DisputeIntelligenceLauncher() {
  const [open, setOpen] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [brief, setBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [authorized, setAuthorized] = useState(false);

  async function token() {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (!data.session?.access_token) throw new Error('Sign in again.');
    return data.session.access_token;
  }

  useEffect(() => {
    let alive = true;
    token().then(async (accessToken) => {
      const response = await fetch('/api/ai/dispute', { headers: { Authorization: `Bearer ${accessToken}` } });
      const payload = await response.json().catch(() => ({})) as { disputes?: QueueItem[]; error?: string };
      if (!alive) return;
      if (response.status === 403) return;
      if (!response.ok) throw new Error(payload.error || 'Could not load dispute intelligence.');
      setAuthorized(true);
      const next = payload.disputes ?? [];
      setQueue(next);
      if (next[0]) setSelectedId(next[0].id);
    }).catch((err) => { if (alive) setError(err instanceof Error ? err.message : 'Could not load dispute intelligence.'); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  async function analyze() {
    if (!selectedId) return;
    setBusy(true);
    setBrief(null);
    setError('');
    try {
      const accessToken = await token();
      const response = await fetch('/api/ai/dispute', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ disputeId: selectedId })
      });
      const payload = await response.json().catch(() => ({})) as { brief?: Brief; error?: string };
      if (!response.ok || !payload.brief) throw new Error(payload.error || 'Dispute Intelligence could not run.');
      setBrief(payload.brief);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dispute Intelligence could not run.');
    } finally { setBusy(false); }
  }

  if (loading || !authorized) return null;
  const selected = queue.find((item) => item.id === selectedId) ?? null;

  return <>
    <button className="disputeAiLauncher" type="button" onClick={() => setOpen(true)}><i>✦</i><span>Dispute Intelligence</span>{queue.length > 0 && <b>{queue.length}</b>}</button>
    {open && <div className="disputeAiOverlay" role="dialog" aria-modal="true" aria-label="Aspire Dispute Intelligence">
      <section className="disputeAiModal">
        <button className="disputeAiClose" type="button" onClick={() => setOpen(false)}>×</button>
        <header><span>✦ ASPIRE DISPUTE INTELLIGENCE</span><h2>Evidence first. Human decision.</h2><p>AI prepares a neutral brief from Aspire records. It cannot refund a buyer, release a seller payout, or decide who is truthful.</p></header>
        {!queue.length ? <div className="disputeAiEmpty"><b>✓</b><strong>No open marketplace disputes.</strong></div> : <>
          <div className="disputeAiControls"><label><span>OPEN CASE</span><select value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setBrief(null); }}>{queue.map((item) => <option value={item.id} key={item.id}>{item.title} · {item.reason.replaceAll('_',' ')}</option>)}</select></label><button className="button buttonGold" type="button" onClick={analyze} disabled={busy}>{busy ? 'Reading evidence…' : 'Analyze case ✦'}</button></div>
          {selected && <div className="disputeAiCaseMeta"><span><b>ORDER</b>{selected.order_status || '—'}</span><span><b>AMOUNT</b>{money(selected.amount_cents, selected.currency)}</span><span><b>REASON</b>{selected.reason.replaceAll('_',' ')}</span></div>}
        </>}
        {error && <p className="disputeAiError">{error}</p>}
        {brief && <div className="disputeAiBrief">
          <div className="disputeAiBriefHead"><span>AI CASE BRIEF</span><b>{brief.review_direction.replaceAll('_',' ').toUpperCase()} · {brief.confidence.toUpperCase()} CONFIDENCE</b></div>
          <p>{brief.summary}</p>
          <div className="disputeAiColumns">
            <article><strong>Buyer claims</strong>{brief.buyer_claims.length ? brief.buyer_claims.map((item) => <span key={item}>· {item}</span>) : <span>· No buyer claim identified in the supplied records.</span>}</article>
            <article><strong>Seller claims</strong>{brief.seller_claims.length ? brief.seller_claims.map((item) => <span key={item}>· {item}</span>) : <span>· No seller claim identified in the supplied records.</span>}</article>
          </div>
          {brief.timeline.length > 0 && <article className="disputeAiList"><strong>Platform timeline</strong>{brief.timeline.map((item) => <span key={item}>· {item}</span>)}</article>}
          {brief.evidence_gaps.length > 0 && <article className="disputeAiList caution"><strong>Evidence gaps</strong>{brief.evidence_gaps.map((item) => <span key={item}>· {item}</span>)}</article>}
          {brief.risk_signals.length > 0 && <article className="disputeAiList"><strong>Risk signals</strong>{brief.risk_signals.map((item) => <span key={item}>· {item}</span>)}</article>}
          <article className="disputeAiList next"><strong>Suggested reviewer next steps</strong>{brief.suggested_next_steps.map((item) => <span key={item}>· {item}</span>)}</article>
          <small>Internal decision support only. Platform records can show what happened inside Aspire, but they do not independently prove what happened offline.</small>
        </div>}
      </section>
    </div>}
  </>;
}
