'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchCampusFeedRequests, DiscoverCategory, DiscoverRequest } from '../lib/supabase/discovery';
import { fetchActiveUniversities, University } from '../lib/supabase/universities';
import { respondToRequest } from '../lib/supabase/requests';
import { blockUser, reportSafety, SafetyReason } from '../lib/supabase/safety';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import CampusPicker from './CampusPicker';
import CampusFeedCard, { campusFeedCardStyles } from './CampusFeedCard';
import { buildDemoDiscoverRequests, filterDemoDiscoverRequests, isPreviewDemoEnabled } from './demoPreviewPosts';
import { CAMPUS_FEED_REFRESH_EVENT, CAMPUS_FEED_REFRESH_STORAGE_KEY } from './campusFeedSync';

const categories: DiscoverCategory[] = ['Anything','Get me there','Pick this up','Give me a hand','Study / class','Gaming / duos','Build something','People / community','Buy & sell'];
const suggestions = ['Math 55','IND rides','Moving help','Valorant','Study group','Photographer'];
const reportReasons: { value: SafetyReason; label: string }[] = [
  { value: 'spam', label: 'Spam / fake request' },
  { value: 'scam', label: 'Scam or payment issue' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'unsafe', label: 'Unsafe behavior' },
  { value: 'illegal', label: 'Illegal request' },
  { value: 'hate', label: 'Hate or abuse' },
  { value: 'sexual', label: 'Sexual misconduct' },
  { value: 'other', label: 'Something else' }
];

function marketActionLabel(item: DiscoverRequest) {
  if (item.kind !== 'buy_sell') return item.kind === 'community' ? 'I’m interested →' : 'I can help →';
  return item.market_intent === 'wanted' ? 'I have this →' : 'I’m interested →';
}

function marketResponseMessage(item: DiscoverRequest) {
  if (item.kind !== 'buy_sell') return 'I’m interested in this request.';
  return item.market_intent === 'wanted'
    ? 'I have this item and I’m interested in selling it.'
    : 'I’m interested in buying this item.';
}

function mergeRequests(primary: DiscoverRequest[], extra: DiscoverRequest[]) {
  const merged = new Map<string, DiscoverRequest>();
  primary.forEach((item) => merged.set(item.id, item));
  extra.forEach((item) => { if (!merged.has(item.id)) merged.set(item.id, item); });
  return Array.from(merged.values()).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export default function DiscoverRequestsV2() {
  const router = useRouter();
  const [bootLoading,setBootLoading] = useState(true);
  const [currentUserId,setCurrentUserId] = useState<string|null>(null);
  const [homeCampusId,setHomeCampusId] = useState<string|null>(null);
  const [activeCampusId,setActiveCampusId] = useState<string|null>(null);
  const [pendingCampusId,setPendingCampusId] = useState<string|null>(null);
  const [universities,setUniversities] = useState<University[]>([]);
  const [query,setQuery] = useState('');
  const [debouncedQuery,setDebouncedQuery] = useState('');
  const [category,setCategory] = useState<DiscoverCategory>('Anything');
  const [items,setItems] = useState<DiscoverRequest[]>([]);
  const [dataLoading,setDataLoading] = useState(false);
  const [showSkeleton,setShowSkeleton] = useState(false);
  const [error,setError] = useState('');
  const [retryKey,setRetryKey] = useState(0);
  const [busyId,setBusyId] = useState('');
  const [message,setMessage] = useState('');
  const [safetyItem,setSafetyItem] = useState<DiscoverRequest|null>(null);
  const [reportReason,setReportReason] = useState<SafetyReason>('spam');
  const [reportDetails,setReportDetails] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 280);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let alive = true;
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!alive) return;
      if (!data.user) {
        router.replace('/login?next=%2Fdiscover');
        return;
      }
      const [{ data: profile }, campusList] = await Promise.all([
        supabase.from('profiles').select('home_campus_id,current_campus_id').eq('id', data.user.id).maybeSingle(),
        fetchActiveUniversities()
      ]);
      if (!alive) return;
      const homeId = typeof profile?.home_campus_id === 'string' ? profile.home_campus_id : null;
      const currentId = typeof profile?.current_campus_id === 'string' ? profile.current_campus_id : null;
      const params = new URLSearchParams(window.location.search);
      const requestedCategory = params.get('category');
      const requestedCampus = params.get('campus');
      const storedCampus = window.sessionStorage.getItem('aspire-active-campus-id');
      const validIds = new Set(campusList.map((campus) => campus.id));
      const nextActive = requestedCampus && validIds.has(requestedCampus)
        ? requestedCampus
        : storedCampus && validIds.has(storedCampus)
          ? storedCampus
          : currentId && validIds.has(currentId)
            ? currentId
            : homeId;
      if (requestedCategory && categories.includes(requestedCategory as DiscoverCategory)) setCategory(requestedCategory as DiscoverCategory);
      setCurrentUserId(data.user.id);
      setUniversities(campusList);
      setHomeCampusId(homeId);
      setActiveCampusId(nextActive);
      if (nextActive) window.sessionStorage.setItem('aspire-active-campus-id', nextActive);
      setBootLoading(false);
    }).catch(() => {
      if (alive) {
        setError('We couldn’t load your campus identity.');
        setBootLoading(false);
      }
    });
    return () => { alive = false; };
  }, [router]);

  useEffect(() => {
    const refresh = () => setRetryKey((value) => value + 1);
    const onStorage = (event: StorageEvent) => {
      if (event.key === CAMPUS_FEED_REFRESH_STORAGE_KEY) refresh();
    };
    const onFocus = () => refresh();
    window.addEventListener(CAMPUS_FEED_REFRESH_EVENT, refresh);
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener(CAMPUS_FEED_REFRESH_EVENT, refresh);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  useEffect(() => {
    if (!activeCampusId) return;
    let alive = true;
    setDataLoading(true);
    setError('');
    setMessage('');
    const skeletonTimer = window.setTimeout(() => { if (alive) setShowSkeleton(true); }, 260);

    const campusForPreview = universities.find((campus) => campus.id === activeCampusId) ?? null;
    fetchCampusFeedRequests({ campusId: activeCampusId, query: debouncedQuery, category, limit: 50 })
      .then((data) => {
        if (!alive) return;
        let next = data;
        if (currentUserId && campusForPreview && isPreviewDemoEnabled()) {
          const demos = buildDemoDiscoverRequests(
            currentUserId,
            campusForPreview.id,
            campusForPreview.name,
            campusForPreview.cover_image
          );
          next = mergeRequests(next, filterDemoDiscoverRequests(demos, debouncedQuery, category));
        }
        setItems(next);
      })
      .catch((err) => { if (alive) setError(err instanceof Error ? err.message : 'We couldn’t load campus requests.'); })
      .finally(() => {
        window.clearTimeout(skeletonTimer);
        if (alive) {
          setDataLoading(false);
          setShowSkeleton(false);
        }
      });
    return () => {
      alive = false;
      window.clearTimeout(skeletonTimer);
    };
  }, [activeCampusId, currentUserId, debouncedQuery, category, retryKey, universities]);

  const homeCampus = useMemo(() => universities.find((c) => c.id === homeCampusId) ?? null, [universities, homeCampusId]);
  const activeCampus = useMemo(() => universities.find((c) => c.id === activeCampusId) ?? null, [universities, activeCampusId]);
  const pendingCampus = useMemo(() => universities.find((c) => c.id === pendingCampusId) ?? null, [universities, pendingCampusId]);
  const visiting = Boolean(homeCampus && activeCampus && homeCampus.id !== activeCampus.id);

  function chooseCampus(nextId: string) {
    if (nextId === activeCampusId) return;
    if (nextId === homeCampusId || window.sessionStorage.getItem(`aspire-campus-confirmed:${nextId}`) === '1') {
      setActiveCampusId(nextId);
      window.sessionStorage.setItem('aspire-active-campus-id', nextId);
      return;
    }
    setPendingCampusId(nextId);
  }

  async function persistCurrentCampus(nextId: string|null) {
    try {
      const supabase = getSupabaseBrowserClient();
      const { data } = await supabase.auth.getUser();
      if (data.user) await supabase.from('profiles').update({ current_campus_id: nextId, campus_last_selected_at: new Date().toISOString() }).eq('id', data.user.id);
    } catch {
      // Browsing still works without persistence.
    }
  }

  function confirmCampusSwitch() {
    if (!pendingCampusId) return;
    window.sessionStorage.setItem(`aspire-campus-confirmed:${pendingCampusId}`, '1');
    window.sessionStorage.setItem('aspire-active-campus-id', pendingCampusId);
    setActiveCampusId(pendingCampusId);
    void persistCurrentCampus(pendingCampusId === homeCampusId ? null : pendingCampusId);
    setPendingCampusId(null);
  }

  async function respond(item: DiscoverRequest) {
    setBusyId(item.id);
    setMessage('');
    try {
      await respondToRequest(item.id, marketResponseMessage(item));
      if (item.kind === 'buy_sell') {
        setMessage(item.market_intent === 'wanted'
          ? 'Interest sent. The buyer can choose whether to connect with you as the seller.'
          : 'Interest sent. The seller can choose whether to connect with you as the buyer.');
      } else {
        setMessage('Interest sent. Nothing opens until both sides choose the connection.');
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not send your interest.');
    } finally {
      setBusyId('');
    }
  }

  async function submitReport() {
    if (!safetyItem) return;
    setBusyId(`report:${safetyItem.id}`);
    try {
      await reportSafety({ reason: reportReason, details: reportDetails, targetUserId: safetyItem.poster_id, requestId: safetyItem.id });
      setSafetyItem(null);
      setReportDetails('');
      setMessage('Report received. Aspire will review the platform activity connected to this request.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not submit the report.');
    } finally {
      setBusyId('');
    }
  }

  async function blockCurrent() {
    if (!safetyItem) return;
    setBusyId(`block:${safetyItem.id}`);
    try {
      await blockUser(safetyItem.poster_id);
      setItems((current) => current.filter((item) => item.poster_id !== safetyItem.poster_id));
      setSafetyItem(null);
      setMessage('Blocked. You won’t see each other in Aspire discovery.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not block this account.');
    } finally {
      setBusyId('');
    }
  }

  if (bootLoading) return <section className="discoverV2Boot" aria-live="polite"><div className="discoverV2BootRadar"><span /></div><strong>Opening Discover…</strong><small>Finding your campus</small></section>;
  if (!activeCampus || !homeCampus) return <section className="discoverV2State"><span>CAMPUS IDENTITY</span><h1>Your campus needs attention.</h1><p>We couldn’t resolve a supported home campus for this Aspire account.</p><a className="button buttonGold" href="/profile">Open profile →</a></section>;

  return <section className="discoverV2Experience">
    <header className="discoverV2Header">
      <div><p className="eyebrow">DISCOVER · {visiting ? 'VISITING' : 'HOME CAMPUS'}</p><h1>Search {activeCampus.short_name}.</h1><p>Find requests around the campus you’re browsing without changing your verified school identity.</p></div>
      <div className="discoverV2CampusControl discoverCampusPickerControl"><span>ACTIVE CAMPUS</span><CampusPicker universities={universities} value={activeCampusId || ''} onChange={chooseCampus} homeCampusId={homeCampusId || ''} maxNearbyMiles={300} /><b className={visiting ? 'visiting' : ''}>{visiting ? `VISITING FROM ${homeCampus.short_name.toUpperCase()}` : 'HOME CAMPUS ✓'}</b>{visiting && <button type="button" onClick={() => { setActiveCampusId(homeCampus.id); window.sessionStorage.setItem('aspire-active-campus-id', homeCampus.id); void persistCurrentCampus(null); }}>Return to {homeCampus.short_name}</button>}</div>
    </header>

    <div className="discoverV2SearchWrap"><div className="discoverV2SearchBox"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${activeCampus.short_name} — Math 55, ride to IND, Valorant...`} aria-label={`Search ${activeCampus.short_name} requests`} />{query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search">×</button>}</div>{!query && <div className="discoverV2Suggestions" aria-label="Suggested searches"><span>TRY</span>{suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => setQuery(suggestion)}>{suggestion}</button>)}</div>}</div>
    <div className="discoverV2Categories" aria-label="Request categories">{categories.map((item) => <button key={item} className={category === item ? 'active' : ''} type="button" onClick={() => setCategory(item)}>{item}</button>)}</div>
    <div className="discoverV2ResultMeta"><div><strong>{dataLoading && !items.length ? 'Searching campus…' : `${items.length} open ${items.length === 1 ? 'request' : 'requests'}`}</strong><span>{debouncedQuery ? `for “${debouncedQuery}” · ` : ''}{activeCampus.name}</span></div><span>Newest first</span></div>
    {message && <div className="discoverV2Notice" role="status">{message}</div>}

    {error ? <div className="discoverV2State error" role="alert"><span>DISCOVER UNAVAILABLE</span><h2>We couldn’t load nearby campus requests.</h2><p>{error}</p><button className="button buttonGold" type="button" onClick={() => setRetryKey((value) => value + 1)}>Try again</button></div>
      : showSkeleton ? <div className="discoverV2SkeletonList" aria-label="Loading requests">{[0,1,2].map((item) => <div className="discoverV2Skeleton" key={item}><i /><div><span /><span /><span /></div></div>)}</div>
      : !dataLoading && !items.length ? <div className="discoverV2State empty"><span>NOTHING MATCHED</span><h2>{debouncedQuery ? `No results for “${debouncedQuery}” at ${activeCampus.short_name}.` : `Your ${category === 'Anything' ? 'campus feed' : category} is quiet right now.`}</h2><p>Try another keyword, clear your filters, or start the request yourself.</p><div className="discoverV2EmptyActions">{(query || category !== 'Anything') && <button type="button" onClick={() => { setQuery(''); setCategory('Anything'); }}>Clear filters</button>}<a className="button buttonGold" href="/post">Post what you need →</a></div></div>
      : <div className={`discoverV2List campusUnifiedFeed ${dataLoading ? 'isRefreshing' : ''}`}>{items.map((item) => {
          const mine = Boolean(currentUserId && item.poster_id === currentUserId);
          const demo = item.id.startsWith('demo-preview-');
          const pending = mine && item.moderation_status && item.moderation_status !== 'approved';
          return <CampusFeedCard
            key={item.id}
            item={item}
            campusLabel={activeCampus.short_name}
            currentUserId={currentUserId}
            authorName="You"
            fallbackImage={activeCampus.cover_image || undefined}
            footerLeft={mine
              ? <span className={campusFeedCardStyles.secondaryAction}>{pending ? 'Pending review' : 'Your post'}</span>
              : <button className={campusFeedCardStyles.secondaryAction} type="button" onClick={() => setSafetyItem(item)}>Safety</button>}
            footerRight={mine
              ? <a className={campusFeedCardStyles.primaryAction} href="/activity">{demo ? 'Manage preview →' : 'Manage post →'}</a>
              : <button className={campusFeedCardStyles.primaryAction} type="button" onClick={() => respond(item)} disabled={busyId === item.id}>{busyId === item.id ? 'Sending…' : marketActionLabel(item)}</button>}
          />;
        })}</div>}

    {pendingCampus && <div className="discoverV2ModalBackdrop" role="dialog" aria-modal="true" aria-label="Browse another campus"><div className="discoverV2Modal"><span>VISITING CAMPUS</span><h2>Browse {pendingCampus.short_name}?</h2><p>{pendingCampus.name} is different from your home campus, {homeCampus.name}. Requests and campus activity shown here will now be based on {pendingCampus.short_name}. Your verified Aspire identity stays tied to {homeCampus.short_name}.</p><div><button type="button" onClick={() => setPendingCampusId(null)}>Stay at {activeCampus.short_name}</button><button className="button buttonGold" type="button" onClick={confirmCampusSwitch}>Browse {pendingCampus.short_name}</button></div></div></div>}
    {safetyItem && <div className="discoverV2ModalBackdrop" role="dialog" aria-modal="true" aria-label="Request safety options"><div className="discoverV2Modal safety"><button className="discoverV2ModalClose" type="button" onClick={() => setSafetyItem(null)} aria-label="Close">×</button><span>REQUEST SAFETY</span><h2>Something off?</h2><p>Report what happened or block this account. Normal private messages are not manually reviewed unless there is a safety reason to do so.</p><label><span>Reason</span><select value={reportReason} onChange={(event) => setReportReason(event.target.value as SafetyReason)}>{reportReasons.map((reason) => <option key={reason.value} value={reason.value}>{reason.label}</option>)}</select></label><label><span>Details <em>optional</em></span><textarea rows={3} value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} placeholder="Keep it factual and specific." /></label><div><button className="discoverV2Danger" type="button" onClick={blockCurrent} disabled={busyId === `block:${safetyItem.id}`}>Block account</button><button className="button buttonGold" type="button" onClick={submitReport} disabled={busyId === `report:${safetyItem.id}`}>Submit report</button></div></div></div>}
  </section>;
}
