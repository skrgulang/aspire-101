'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import type { AspireRequest } from '../lib/supabase/requests';
import { fetchRequestMedia } from '../lib/supabase/requestMedia';
import { deleteRequestDraft, listRequestDrafts, type RequestDraft } from '../lib/supabase/requestDrafts';
import { deleteMarketplaceDraft, listMarketplaceDrafts, type MarketplaceDraft } from '../lib/supabase/marketplaceSeller';
import UiIcon from './UiIcon';
import { buildDemoAspireRequests, isDemoPreviewPostId, isPreviewDemoEnabled, setDemoPreviewPostStatus } from './demoPreviewPosts';
import styles from './MyActivityManager.module.css';

type ConnectionRow = { request_id: string; status: string };
type Filter = 'all' | 'drafts' | 'open' | 'review' | 'action' | 'closed';
type LaneStatus = 'pending' | 'pass' | 'review' | 'block' | 'not_applicable';
type ActivityRequest = AspireRequest & {
  post_review_status?: LaneStatus;
  post_review_flags?: string[];
  post_review_summary?: string | null;
  language_review_status?: LaneStatus;
  language_review_flags?: string[];
  language_review_summary?: string | null;
  language_detected?: string | null;
  market_review_status?: LaneStatus;
  market_review_flags?: string[];
  market_review_summary?: string | null;
  layered_reviewed_at?: string | null;
};

type UserReviewState = {
  key: 'submitted' | 'reviewing' | 'approved' | 'changes' | 'rejected' | 'delayed';
  label: string;
  title: string;
  description: string;
};

const flagHelp: Record<string, string> = {
  profanity: 'Edit profanity or abusive wording before posting again.',
  hate_slur: 'Remove hateful or slur language before posting again.',
  threat_or_abuse: 'Remove threatening or abusive language before posting again.',
  hidden_unicode: 'Remove hidden or unusual text formatting.',
  link_spam: 'Reduce repeated links in the post.',
  contact_information: 'Remove personal contact information and keep contact inside Aspire.',
  excessive_punctuation: 'Reduce repeated punctuation or spam-like formatting.',
  declared_language_mismatch: 'Check that the selected post language matches the text.',
  missing_item_photo: 'Add at least one real photo of the item.',
  missing_public_seller_area: 'Add a public city or selling area, not an exact address.',
  missing_price: 'Add a price or budget.',
  missing_condition: 'Choose the item condition.',
  missing_fulfillment_method: 'Choose at least one delivery or pickup option.',
  regulated_or_prohibited_item: 'This item may be restricted under Aspire Marketplace rules.',
  regulated_item_needs_review: 'This item needs a Marketplace policy review before it can go live.',
  marketplace_prohibited_listing: 'This listing type is not allowed in Aspire Market.',
  prohibited_listing_type: 'This listing type is not allowed in Aspire Market.',
  credential_trade: 'Account credentials and account sales are not allowed.',
  sensitive_personal_data: 'Remove sensitive personal information from the post.',
  off_platform_payment_or_evasion: 'Keep payment and checkout inside Aspire.',
  price_anomaly: 'The price needs an additional Marketplace review.',
  duplicate_listing: 'A similar recent listing needs additional review.'
};

function money(request: AspireRequest) {
  if (request.kind === 'community' || request.kind === 'collaboration') return 'Free';
  if (request.amount_cents == null) return request.kind === 'split_cost' ? 'Split cost' : 'Price not set';
  return `$${(request.amount_cents / 100).toFixed(request.amount_cents % 100 ? 2 : 0)}`;
}

function relativeTime(value: string) {
  const ms = Date.now() - new Date(value).getTime();
  const hours = Math.max(1, Math.round(ms / 3600000));
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function laneStatus(request: ActivityRequest, lane: 'post' | 'language' | 'market'): LaneStatus {
  if (lane === 'post') return request.post_review_status || (request.moderation_status === 'approved' ? 'pass' : 'pending');
  if (lane === 'language') return request.language_review_status || (request.moderation_status === 'approved' ? 'pass' : 'pending');
  if (request.kind !== 'buy_sell') return 'not_applicable';
  return request.market_review_status || (request.moderation_status === 'approved' ? 'pass' : 'pending');
}

function laneFlags(request: ActivityRequest, lane: 'post' | 'language' | 'market') {
  if (lane === 'post') return request.post_review_flags || [];
  if (lane === 'language') return request.language_review_flags || [];
  return request.market_review_flags || [];
}

function laneMessage(request: ActivityRequest, lane: 'post' | 'language' | 'market') {
  const flags = laneFlags(request, lane);
  const helpful = flags.map((flag) => flagHelp[flag]).find(Boolean);
  if (helpful) return helpful;
  const status = laneStatus(request, lane);
  if (status === 'pass') return lane === 'market' ? 'Marketplace checks passed.' : lane === 'language' ? 'Language checks passed.' : 'Post safety checks passed.';
  if (status === 'not_applicable') return 'Not needed for this post.';
  if (status === 'block') return 'This part of the post needs changes before it can be published.';
  if (status === 'review') return 'This part of the post needs a human review.';
  return 'Waiting for review.';
}

function userReviewState(request: ActivityRequest): UserReviewState {
  if (request.moderation_status === 'approved') {
    return { key: 'approved', label: 'Live', title: 'Approved', description: 'This post passed review and can appear to other students.' };
  }
  if (request.moderation_status === 'rejected') {
    return { key: 'rejected', label: 'Rejected', title: 'Not approved', description: request.moderation_reason || 'A moderator did not approve this version. Edit the same post and resubmit it for a fresh review.' };
  }
  if (request.moderation_status === 'blocked') {
    return { key: 'changes', label: 'Needs changes', title: 'Changes needed', description: 'One or more safety or Marketplace checks found something that must be changed before this can go live.' };
  }
  if (request.ai_moderation_status === 'error') {
    return { key: 'delayed', label: 'Review delayed', title: 'Still private', description: 'The automated review could not finish. Your post is still private and remains in the review queue.' };
  }
  if (request.ai_moderation_status === 'not_scanned') {
    return { key: 'submitted', label: 'Submitted', title: 'Submitted for review', description: 'Your post is saved privately and is waiting for the review process to start.' };
  }
  return { key: 'reviewing', label: 'Reviewing', title: 'Review in progress', description: 'Your post stays private while Aspire finishes the required review lanes.' };
}

function isInReview(request: ActivityRequest) {
  return request.moderation_status === 'pending' && request.status === 'open';
}

function needsAction(request: ActivityRequest) {
  return (request.moderation_status === 'blocked' || request.moderation_status === 'rejected') && request.status === 'open';
}

export default function MyActivityManager() {
  const [requests, setRequests] = useState<ActivityRequest[]>([]);
  const [requestDrafts, setRequestDrafts] = useState<RequestDraft[]>([]);
  const [sellerDrafts, setSellerDrafts] = useState<MarketplaceDraft[]>([]);
  const [connections, setConnections] = useState<ConnectionRow[]>([]);
  const [mediaByRequest, setMediaByRequest] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async (quiet = false) => {
    if (!quiet) {
      setLoading(true);
      setNotice('');
    }
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!auth.user) {
        window.location.assign('/login?next=/activity');
        return;
      }

      const [requestResult, profileResult, savedRequestDrafts, savedSellerDrafts] = await Promise.all([
        supabase.rpc('get_my_activity_requests'),
        supabase.from('profiles').select('school').eq('id', auth.user.id).maybeSingle(),
        listRequestDrafts(),
        listMarketplaceDrafts()
      ]);
      if (requestResult.error) throw requestResult.error;
      setRequestDrafts(savedRequestDrafts);
      setSellerDrafts(savedSellerDrafts);

      const realRequests = (requestResult.data ?? []) as ActivityRequest[];
      const previewCampus = typeof profileResult.data?.school === 'string' && profileResult.data.school.trim()
        ? profileResult.data.school.trim()
        : 'Campus';
      const previewRequests = (isPreviewDemoEnabled() ? buildDemoAspireRequests(auth.user.id, previewCampus) : []) as ActivityRequest[];
      setRequests([...previewRequests, ...realRequests].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));

      const media = realRequests.length
        ? await fetchRequestMedia(realRequests.map((request) => request.id)).catch(() => [])
        : [];
      const coverMap: Record<string, string> = {};
      media.forEach((item) => {
        if (!coverMap[item.request_id] && item.public_url) coverMap[item.request_id] = item.public_url;
      });
      setMediaByRequest(coverMap);

      if (!realRequests.length) {
        setConnections([]);
        return;
      }

      const { data: connectionRows, error: connectionError } = await supabase
        .from('connections')
        .select('request_id,status')
        .in('request_id', realRequests.map((request) => request.id));
      if (connectionError) throw connectionError;
      setConnections((connectionRows ?? []) as ConnectionRow[]);
    } catch (error) {
      if (!quiet) setNotice(error instanceof Error ? error.message : 'Could not load your posts.');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const hasPendingReview = requests.some((request) => request.moderation_status === 'pending');
  useEffect(() => {
    if (!hasPendingReview) return;
    const timer = window.setInterval(() => void load(true), 15000);
    return () => window.clearInterval(timer);
  }, [hasPendingReview, load]);

  const visible = useMemo(() => requests.filter((request) => {
    if (filter === 'drafts') return false;
    if (filter === 'open') return request.status === 'open';
    if (filter === 'review') return isInReview(request);
    if (filter === 'action') return needsAction(request);
    if (filter === 'closed') return request.status !== 'open';
    return true;
  }), [filter, requests]);

  const counts = useMemo(() => ({
    all: requests.length,
    drafts: requestDrafts.length + sellerDrafts.length,
    open: requests.filter((request) => request.status === 'open').length,
    review: requests.filter(isInReview).length,
    action: requests.filter(needsAction).length,
    closed: requests.filter((request) => request.status !== 'open').length
  }), [requests, requestDrafts, sellerDrafts]);

  const draftItems = useMemo(() => [
    ...requestDrafts.map((draft) => ({
      id: draft.id,
      mode: draft.composer_mode === 'offer' ? 'OFFER' : 'NEED',
      title: draft.title || (draft.composer_mode === 'offer' ? 'Untitled offer' : 'Untitled request'),
      detail: draft.category || 'Draft post',
      updatedAt: draft.updated_at,
      href: draft.composer_mode === 'offer'
        ? `/post?mode=offer&draft=${encodeURIComponent(draft.id)}`
        : `/post?draft=${encodeURIComponent(draft.id)}`,
      deleteKind: 'request' as const
    })),
    ...sellerDrafts.map((draft) => ({
      id: draft.id,
      mode: 'SELL',
      title: draft.title || 'Untitled item',
      detail: draft.seller_area || 'Marketplace draft',
      updatedAt: draft.updated_at,
      href: `/post?mode=sell&draft=${encodeURIComponent(draft.id)}`,
      deleteKind: 'seller' as const
    }))
  ].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()), [requestDrafts, sellerDrafts]);

  function hasActiveConnection(requestId: string) {
    if (isDemoPreviewPostId(requestId)) return false;
    return connections.some((connection) => connection.request_id === requestId && connection.status !== 'cancelled');
  }

  async function deleteDraft(id: string, kind: 'request' | 'seller', title: string) {
    if (!window.confirm(`Delete “${title}” draft? This cannot be undone.`)) return;
    setBusyId(`draft-${id}`);
    setNotice('');
    try {
      if (kind === 'seller') {
        await deleteMarketplaceDraft(id);
        setSellerDrafts((current) => current.filter((draft) => draft.id !== id));
      } else {
        await deleteRequestDraft(id);
        setRequestDrafts((current) => current.filter((draft) => draft.id !== id));
      }
      setNotice('Draft deleted.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not delete this draft.');
    } finally {
      setBusyId('');
    }
  }

  async function closePost(request: ActivityRequest) {
    if (!window.confirm(`Close “${request.title}”? It will stop appearing in Browse, but its history will be preserved.`)) return;
    setBusyId(request.id);
    setNotice('');
    try {
      if (isDemoPreviewPostId(request.id)) {
        setDemoPreviewPostStatus(request.id, 'cancelled');
        setRequests((current) => current.map((item) => item.id === request.id ? { ...item, status: 'cancelled' } : item));
        setNotice('Preview post closed. It is now hidden from Home and Browse.');
        return;
      }
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.from('requests').update({ status: 'cancelled' }).eq('id', request.id);
      if (error) throw error;
      setRequests((current) => current.map((item) => item.id === request.id ? { ...item, status: 'cancelled' } : item));
      setNotice('Post closed.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not close this post.');
    } finally {
      setBusyId('');
    }
  }

  async function deletePost(request: ActivityRequest) {
    if (hasActiveConnection(request.id)) {
      setNotice('This post has an active or completed connection, so it cannot be permanently deleted. Close it instead to preserve the transaction and safety trail.');
      return;
    }
    if (!window.confirm(`Permanently delete “${request.title}”? This also removes pending responses to this post and cannot be undone.`)) return;

    setBusyId(request.id);
    setNotice('');
    try {
      if (isDemoPreviewPostId(request.id)) {
        setDemoPreviewPostStatus(request.id, 'deleted');
        setRequests((current) => current.filter((item) => item.id !== request.id));
        setNotice('Preview post deleted.');
        return;
      }
      const supabase = getSupabaseBrowserClient();
      const { data: mediaRows, error: mediaError } = await supabase
        .from('request_media')
        .select('storage_path')
        .eq('request_id', request.id);
      if (mediaError) throw mediaError;

      const { data: deleted, error } = await supabase
        .from('requests')
        .delete()
        .eq('id', request.id)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!deleted?.id) {
        throw new Error('This post could not be permanently deleted because it has protected activity history.');
      }

      const mediaPaths = (mediaRows || []).map((row) => String(row.storage_path || '')).filter(Boolean);
      let photoCleanupFailed = false;
      if (mediaPaths.length) {
        const { error: storageError } = await supabase.storage.from('request-media').remove(mediaPaths);
        photoCleanupFailed = Boolean(storageError);
      }

      setRequests((current) => current.filter((item) => item.id !== request.id));
      setNotice(photoCleanupFailed
        ? 'Post deleted. Aspire could not finish photo cleanup right away.'
        : 'Post deleted permanently.');
    } catch (error) {
      const raw = error instanceof Error ? error.message : '';
      setNotice(/permission denied|row-level security|policy/i.test(raw)
        ? 'Aspire could not delete this post right now. Refresh and try again.'
        : raw || 'Could not delete this post.');
    } finally {
      setBusyId('');
    }
  }

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <span>YOUR STUFF</span>
          <h1>My Posts</h1>
          <p>Draft privately, come back anytime, then track each post from review through publication and completion.</p>
        </div>
        <a href="/post"><UiIcon name="plus" /> New post</a>
      </header>

      <div className={styles.stats}>
        <article><strong>{counts.all}</strong><span>Published / submitted</span></article>
        <article className={counts.drafts ? styles.draftStat : ''}><strong>{counts.drafts}</strong><span>Drafts</span></article>
        <article><strong>{counts.open}</strong><span>Open</span></article>
        <article><strong>{counts.review}</strong><span>In review</span></article>
        <article className={counts.action ? styles.attentionStat : ''}><strong>{counts.action}</strong><span>Needs action</span></article>
        <article><strong>{counts.closed}</strong><span>Closed</span></article>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.tabs}>
          <button className={filter === 'all' ? styles.active : ''} onClick={() => setFilter('all')}>All <b>{counts.all}</b></button>
          <button className={filter === 'drafts' ? styles.active : ''} onClick={() => setFilter('drafts')}>Drafts <b>{counts.drafts}</b></button>
          <button className={filter === 'open' ? styles.active : ''} onClick={() => setFilter('open')}>Open <b>{counts.open}</b></button>
          <button className={filter === 'review' ? styles.active : ''} onClick={() => setFilter('review')}>In review <b>{counts.review}</b></button>
          <button className={`${filter === 'action' ? styles.active : ''} ${counts.action ? styles.actionTab : ''}`.trim()} onClick={() => setFilter('action')}>Needs action <b>{counts.action}</b></button>
          <button className={filter === 'closed' ? styles.active : ''} onClick={() => setFilter('closed')}>Closed <b>{counts.closed}</b></button>
        </div>
        <div className={styles.toolbarLinks}><button type="button" onClick={() => void load(true)}>Refresh review status</button><a href="/connections">Responses & messages →</a></div>
      </div>

      {notice && <div className={styles.notice} role="status">{notice}</div>}
      {!loading && counts.action > 0 && filter !== 'action' && (
        <button type="button" className={styles.actionNotice} onClick={() => setFilter('action')}>
          <span><strong>{counts.action} {counts.action === 1 ? 'post needs' : 'posts need'} your attention.</strong> Edit the flagged version and resubmit it for review.</span>
          <b>Review now →</b>
        </button>
      )}

      {loading ? (
        <div className={styles.empty}>Loading your posts…</div>
      ) : filter === 'drafts' ? (
        draftItems.length ? (
          <div className={styles.draftList}>
            {draftItems.map((draft) => (
              <article className={styles.draftCard} key={`${draft.deleteKind}-${draft.id}`}>
                <div className={styles.draftIcon}>{draft.mode === 'SELL' ? '$' : draft.mode === 'OFFER' ? '↑' : '+'}</div>
                <div className={styles.draftCopy}>
                  <div>
                    <span>{draft.mode} DRAFT</span>
                    <small>Updated {relativeTime(draft.updatedAt)}</small>
                  </div>
                  <h2>{draft.title}</h2>
                  <p>{draft.detail}</p>
                </div>
                <div className={styles.draftActions}>
                  <a href={draft.href}>Continue →</a>
                  <button
                    type="button"
                    onClick={() => void deleteDraft(draft.id, draft.deleteKind, draft.title)}
                    disabled={busyId === `draft-${draft.id}`}
                  >
                    {busyId === `draft-${draft.id}` ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>
            <strong>No drafts yet.</strong>
            <span>Use Save draft from Need, Offer, or Sell and it will appear here.</span>
            <a href="/post">Start a post →</a>
          </div>
        )
      ) : !visible.length ? (
        <div className={styles.empty}>
          <strong>{filter === 'action' ? 'Nothing needs your attention.' : filter === 'review' ? 'No posts are under review.' : filter === 'closed' ? 'No closed posts yet.' : 'No posts here yet.'}</strong>
          <span>{filter === 'action' ? 'Blocked or rejected posts will appear here when you need to edit and resubmit them.' : filter === 'review' ? 'Posts waiting on automated or human review will appear here.' : filter === 'closed' ? 'Posts you close or finish will stay here as history.' : 'Create a post and it will show up here for you to manage.'}</span>
          {(filter === 'all' || filter === 'open') && <a href="/post">Post something →</a>}
        </div>
      ) : (
        <div className={styles.list}>
          {visible.map((request) => {
            const protectedHistory = hasActiveConnection(request.id);
            const preview = isDemoPreviewPostId(request.id);
            const review = preview ? null : userReviewState(request);
            const lanes = (['post', 'language', 'market'] as const).filter((lane) => lane !== 'market' || request.kind === 'buy_sell');
            return (
              <article className={styles.card} key={request.id}>
                <div className={styles.cardMedia}>
                  {mediaByRequest[request.id]
                    ? <img src={mediaByRequest[request.id]} alt="" />
                    : <div className={styles.mediaPlaceholder}><UiIcon name="activity" /></div>}
                </div>
                <div className={styles.cardMain}>
                  <div className={styles.category}>{preview ? 'Preview · ' : ''}{request.category}</div>
                  <h2>{request.title}</h2>
                  <p>{request.details || 'No description added.'}</p>
                  <div className={styles.meta}>
                    <span>{money(request)}</span>
                    <span>{request.campus || 'Campus'}</span>
                    <span>{relativeTime(request.created_at)}</span>
                  </div>

                  {review && (
                    <section className={`${styles.reviewPanel} ${styles[`review_${review.key}`] || ''}`} aria-label="Post review status">
                      <div className={styles.reviewHead}>
                        <div><span>REVIEW STATUS</span><strong>{review.title}</strong><p>{review.description}</p></div>
                        <b>{review.label}</b>
                      </div>
                      <div className={styles.reviewLanes}>
                        {lanes.map((lane) => {
                          const status = laneStatus(request, lane);
                          const name = lane === 'post' ? 'Post' : lane === 'language' ? 'Language' : 'Market';
                          return (
                            <div className={styles.reviewLane} key={lane}>
                              <span>{name}</span>
                              <b className={styles[`lane_${status}`] || ''}>{status === 'not_applicable' ? 'N/A' : status}</b>
                              <small>{laneMessage(request, lane)}</small>
                            </div>
                          );
                        })}
                      </div>
                      {request.moderation_status === 'pending' && <small className={styles.autoRefresh}>Status refreshes automatically while this post is under review.</small>}
                      {(review.key === 'changes' || review.key === 'rejected') && (
                        <div className={styles.reviewActions}>
                          <a className={styles.primaryReviewAction} href={`/post?edit=${encodeURIComponent(request.id)}`}>Edit &amp; resubmit →</a>
                          {request.kind === 'buy_sell' && <a href="/marketplace-rules">Marketplace rules</a>}
                        </div>
                      )}
                    </section>
                  )}
                </div>

                <div className={styles.cardSide}>
                  <span className={`${styles.status} ${styles[`status_${request.status}`] || ''}`}>{request.status.replace('_', ' ')}</span>
                  {preview && <small>Posted by your current preview account</small>}
                  {protectedHistory && <small><UiIcon name="shield" /> Activity history protected</small>}
                  <div className={styles.actions}>
                    {request.status === 'open' && (
                      <button type="button" onClick={() => closePost(request)} disabled={busyId === request.id}>Close post</button>
                    )}
                    {!protectedHistory && (
                      <button type="button" className={styles.delete} onClick={() => deletePost(request)} disabled={busyId === request.id}>
                        {busyId === request.id ? 'Working…' : 'Delete'}
                      </button>
                    )}
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
