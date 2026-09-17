'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  fetchMyRole,
  fetchRequestsForModeration,
  reviewRequestModeration,
  runRequestAiSafety,
  type AppRole
} from '../lib/supabase/trust';
import type { AspireRequest } from '../lib/supabase/requests';
import { fetchRequestMedia, type RequestMedia } from '../lib/supabase/requestMedia';
import AppDock from './AppDock';
import AppLoader from './AppLoader';

type Lane = 'post' | 'language' | 'market';
type ReviewStatus = 'pending' | 'pass' | 'review' | 'block' | 'not_applicable';

type LayeredRequest = AspireRequest & {
  post_review_status?: ReviewStatus;
  post_review_flags?: string[];
  post_review_summary?: string | null;
  language_review_status?: ReviewStatus;
  language_review_flags?: string[];
  language_detected?: string | null;
  language_review_summary?: string | null;
  market_review_status?: ReviewStatus;
  market_review_flags?: string[];
  market_review_summary?: string | null;
  layered_review_version?: string | null;
  layered_reviewed_at?: string | null;
  fulfillment_methods?: string[] | null;
  seller_area?: string | null;
};

const shell: React.CSSProperties = { maxWidth: 1220, margin: '0 auto', padding: '34px 22px 90px' };
const panel: React.CSSProperties = { border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.035)', borderRadius: 20, padding: 18 };
const button: React.CSSProperties = { border: '1px solid rgba(255,255,255,.16)', borderRadius: 999, padding: '9px 14px', fontWeight: 800, cursor: 'pointer' };

function money(cents?: number | null, currency = 'USD') {
  if (cents == null) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
}

function when(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function laneStatus(item: LayeredRequest, lane: Lane): ReviewStatus {
  if (lane === 'post') return item.post_review_status || 'pending';
  if (lane === 'language') return item.language_review_status || 'pending';
  return item.market_review_status || (item.kind === 'buy_sell' ? 'pending' : 'not_applicable');
}

function laneFlags(item: LayeredRequest, lane: Lane) {
  if (lane === 'post') return item.post_review_flags || [];
  if (lane === 'language') return item.language_review_flags || [];
  return item.market_review_flags || [];
}

function laneSummary(item: LayeredRequest, lane: Lane) {
  if (lane === 'post') return item.post_review_summary || 'Waiting for post safety review.';
  if (lane === 'language') return item.language_review_summary || 'Waiting for language review.';
  return item.market_review_summary || 'Waiting for marketplace review.';
}

function statusStyle(status: ReviewStatus): React.CSSProperties {
  const base: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', borderRadius: 999, padding: '5px 9px', fontSize: 11, fontWeight: 900, letterSpacing: '.06em' };
  if (status === 'pass') return { ...base, background: 'rgba(79,196,125,.15)', border: '1px solid rgba(79,196,125,.35)' };
  if (status === 'block') return { ...base, background: 'rgba(255,80,80,.14)', border: '1px solid rgba(255,80,80,.35)' };
  if (status === 'review') return { ...base, background: 'rgba(255,196,71,.13)', border: '1px solid rgba(255,196,71,.32)' };
  return { ...base, background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.15)' };
}

function priority(status: ReviewStatus) {
  if (status === 'block') return 4;
  if (status === 'review') return 3;
  if (status === 'pending') return 2;
  if (status === 'pass') return 1;
  return 0;
}

export default function LayeredModerationConsole() {
  const router = useRouter();
  const [role, setRole] = useState<AppRole>('member');
  const [lane, setLane] = useState<Lane>('post');
  const [requests, setRequests] = useState<LayeredRequest[]>([]);
  const [media, setMedia] = useState<RequestMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const nextRole = await fetchMyRole();
      setRole(nextRole);
      if (nextRole !== 'moderator' && nextRole !== 'admin') {
        router.replace('/profile');
        return;
      }
      const rows = await fetchRequestsForModeration(140) as LayeredRequest[];
      setRequests(rows);
      setMedia(await fetchRequestMedia(rows.map((item) => item.id)).catch(() => []));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not load content moderation.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { void reload(); }, [reload]);

  const mediaMap = useMemo(() => {
    const map = new Map<string, RequestMedia[]>();
    for (const asset of media) map.set(asset.request_id, [...(map.get(asset.request_id) || []), asset]);
    return map;
  }, [media]);

  const counts = useMemo(() => {
    const needs = (value?: ReviewStatus) => value === 'pending' || value === 'review' || value === 'block';
    return {
      post: requests.filter((item) => needs(item.post_review_status || 'pending')).length,
      language: requests.filter((item) => needs(item.language_review_status || 'pending')).length,
      market: requests.filter((item) => item.kind === 'buy_sell' && needs(item.market_review_status || 'pending')).length
    };
  }, [requests]);

  const visible = useMemo(() => {
    return requests
      .filter((item) => lane !== 'market' || item.kind === 'buy_sell')
      .slice()
      .sort((a, b) => {
        const delta = priority(laneStatus(b, lane)) - priority(laneStatus(a, lane));
        if (delta) return delta;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [requests, lane]);

  async function rescan(item: LayeredRequest) {
    setBusy(`scan-${item.id}`); setNotice('');
    try {
      await runRequestAiSafety(item.id);
      setNotice(`Rescanned “${item.title}”. All three review lanes have been recalculated.`);
      await reload();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not run the safety scan.');
      await reload();
    } finally { setBusy(''); }
  }

  async function decide(item: LayeredRequest, decision: 'approved' | 'rejected') {
    const currentStatus = laneStatus(item, lane);
    if (decision === 'approved' && currentStatus === 'block') {
      if (!window.confirm(`${lane.toUpperCase()} review is BLOCK. Approve anyway? This human override is audited.`)) return;
    }
    const note = decision === 'rejected'
      ? window.prompt('Why are you rejecting this content?', lane === 'market' ? 'Does not meet Aspire Marketplace Rules.' : lane === 'language' ? 'Language does not meet Aspire Community Guidelines.' : 'Does not meet Aspire Community Guidelines.') ?? ''
      : '';
    if (decision === 'rejected' && !note.trim()) return;
    setBusy(`${decision}-${item.id}`); setNotice('');
    try {
      await reviewRequestModeration(item.id, decision, note);
      setNotice(decision === 'approved' ? 'Approved by human review.' : 'Rejected and kept out of public feeds.');
      await reload();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not save the moderation decision.');
    } finally { setBusy(''); }
  }

  if (loading) return <AppLoader label="Opening content review…" detail="Post · Language · Market" />;

  return (
    <main className="connectionsPage">
      <AppDock active="profile" />
      <div style={shell}>
        <header style={{ ...panel, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ maxWidth: 760 }}>
              <p style={{ margin: 0, opacity: .62, fontSize: 12, fontWeight: 900, letterSpacing: '.09em' }}>TRUST & SAFETY · LAYERED CONTENT REVIEW</p>
              <h1 style={{ margin: '7px 0 8px', fontSize: 34 }}>Post · Language · Market</h1>
              <p style={{ margin: 0, opacity: .72, lineHeight: 1.55 }}>Every submission receives separate general-post, language, and marketplace checks. Automatic publication happens only when every applicable lane passes. Anything uncertain stays in the human queue.</p>
            </div>
            <div style={{ textAlign: 'right' }}><strong>{role.toUpperCase()}</strong><br /><a href="/moderator" style={{ opacity: .75 }}>Back to full Trust & Safety →</a></div>
          </div>
        </header>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 10, marginBottom: 14 }}>
          <button type="button" onClick={() => setLane('post')} style={{ ...panel, textAlign: 'left', cursor: 'pointer', outline: lane === 'post' ? '2px solid currentColor' : 'none' }}><span style={{ opacity: .65, fontSize: 12 }}>POST REVIEW</span><div style={{ fontSize: 30, fontWeight: 900 }}>{counts.post}</div><small>Need attention</small></button>
          <button type="button" onClick={() => setLane('language')} style={{ ...panel, textAlign: 'left', cursor: 'pointer', outline: lane === 'language' ? '2px solid currentColor' : 'none' }}><span style={{ opacity: .65, fontSize: 12 }}>LANGUAGE REVIEW</span><div style={{ fontSize: 30, fontWeight: 900 }}>{counts.language}</div><small>Need attention</small></button>
          <button type="button" onClick={() => setLane('market')} style={{ ...panel, textAlign: 'left', cursor: 'pointer', outline: lane === 'market' ? '2px solid currentColor' : 'none' }}><span style={{ opacity: .65, fontSize: 12 }}>MARKET REVIEW</span><div style={{ fontSize: 30, fontWeight: 900 }}>{counts.market}</div><small>Listings to check</small></button>
        </section>

        {notice ? <div role="status" style={{ ...panel, marginBottom: 14 }}>{notice}</div> : null}

        <section style={{ ...panel, display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <div><span style={{ opacity: .6, fontSize: 12, fontWeight: 900 }}>{lane.toUpperCase()} QUEUE</span><h2 style={{ margin: '4px 0 0' }}>{lane === 'post' ? 'General post safety' : lane === 'language' ? 'Language & abuse review' : 'Marketplace policy review'}</h2></div>
            <small style={{ opacity: .65 }}>{visible.length} active submissions · block/review/pending first</small>
          </div>

          {!visible.length ? <div style={{ padding: 24, textAlign: 'center', opacity: .7 }}>Queue is clear.</div> : visible.map((item) => {
            const status = laneStatus(item, lane);
            const flags = laneFlags(item, lane);
            const photos = mediaMap.get(item.id) || [];
            return (
              <article key={item.id} style={{ ...panel, display: 'grid', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><span style={statusStyle(status)}>{status.replace('_',' ').toUpperCase()}</span><small style={{ opacity: .65 }}>{item.kind.replace('_',' ').toUpperCase()} · {item.moderation_status?.toUpperCase() || 'PENDING'}</small></div>
                    <h3 style={{ margin: '8px 0 5px', fontSize: 20 }}>{item.title}</h3>
                    {item.details ? <p style={{ margin: 0, opacity: .78, lineHeight: 1.5 }}>{item.details}</p> : null}
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 12, opacity: .66 }}>Created {when(item.created_at)}<br />AI {item.ai_moderation_status || 'not_scanned'} · {item.ai_risk_level || 'unknown'} {item.ai_risk_score ?? '—'}/100</div>
                </div>

                {lane === 'language' ? <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 13 }}><span><b>Declared:</b> {item.language_code || 'en'}</span><span><b>Detected:</b> {item.language_detected || 'unknown'}</span></div> : null}

                {lane === 'market' ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 8, fontSize: 13 }}>
                  <span><b>Price</b><br />{money(item.amount_cents,item.currency)}</span>
                  <span><b>Condition</b><br />{item.item_condition?.replace('_',' ') || '—'}</span>
                  <span><b>Intent</b><br />{item.market_intent || 'sell'}</span>
                  <span><b>Seller area</b><br />{item.seller_area || '—'}</span>
                  <span><b>Fulfillment</b><br />{item.fulfillment_methods?.join(', ') || item.fulfillment_method || '—'}</span>
                </div> : null}

                {lane === 'market' && photos.length ? <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>{photos.map((asset) => asset.public_url ? <img key={asset.id} src={asset.public_url} alt="Listing evidence" style={{ width: 104, height: 82, objectFit: 'cover', borderRadius: 10, border: '1px solid rgba(255,255,255,.12)' }} /> : null)}</div> : null}

                <div style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,.045)' }}>
                  <strong>{laneSummary(item,lane)}</strong>
                  {flags.length ? <div style={{ marginTop: 7, display: 'flex', gap: 6, flexWrap: 'wrap' }}>{flags.map((flag) => <span key={flag} style={{ fontSize: 11, border: '1px solid rgba(255,255,255,.14)', borderRadius: 999, padding: '4px 7px' }}>{flag}</span>)}</div> : <div style={{ marginTop: 5, opacity: .6, fontSize: 12 }}>No lane-specific flags.</div>}
                </div>

                <details>
                  <summary style={{ cursor: 'pointer', fontWeight: 800 }}>All three review lanes</summary>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 8, marginTop: 9 }}>
                    {(['post','language','market'] as Lane[]).map((name) => <div key={name} style={{ padding: 10, border: '1px solid rgba(255,255,255,.1)', borderRadius: 11 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><b>{name.toUpperCase()}</b><span style={statusStyle(laneStatus(item,name))}>{laneStatus(item,name).toUpperCase()}</span></div><small style={{ opacity: .68 }}>{laneSummary(item,name)}</small></div>)}
                  </div>
                </details>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" style={button} disabled={!!busy} onClick={() => void rescan(item)}>{busy === `scan-${item.id}` ? 'Scanning…' : 'Rescan all layers'}</button>
                  {(item.moderation_status === 'pending' || item.moderation_status === 'blocked') ? <>
                    <button type="button" style={button} disabled={!!busy} onClick={() => void decide(item,'rejected')}>Reject</button>
                    <button type="button" style={button} disabled={!!busy} onClick={() => void decide(item,'approved')}>{busy === `approved-${item.id}` ? 'Saving…' : 'Human approve'}</button>
                  </> : <span style={{ alignSelf: 'center', opacity: .65, fontSize: 12 }}>Final status: {item.moderation_status?.toUpperCase()}</span>}
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}
