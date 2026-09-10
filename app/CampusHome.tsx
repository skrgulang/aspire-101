'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import { DiscoverRequest, fetchCampusFeedRequests } from '../lib/supabase/discovery';
import { fetchActiveUniversities, University } from '../lib/supabase/universities';
import { aspireLogo } from './logo';
import AppDock from './AppDock';
import AppLoader from './AppLoader';
import UiIcon, { UiIconName } from './UiIcon';
import CampusFeedCard, { campusFeedCardStyles } from './CampusFeedCard';
import { campusFeedHref } from './campusFeedPresentation';
import { buildDemoDiscoverRequests, isPreviewDemoEnabled } from './demoPreviewPosts';
import { CAMPUS_FEED_REFRESH_EVENT, CAMPUS_FEED_REFRESH_STORAGE_KEY } from './campusFeedSync';
import styles from './CampusHomeRefresh.module.css';

type CampusDeck = {
  key: string;
  label: string;
  short: string;
  query: string;
  icon: UiIconName;
  match: (request: DiscoverRequest) => boolean;
};

type FeedMode = 'latest' | 'popular';
type FeedClicks = Record<string, number>;

const FEED_CLICK_KEY = 'aspire:campus-feed-clicks:v1';

const decks: CampusDeck[] = [
  { key: 'rides', label: 'Rides', short: 'Rides + pickups', query: 'Get me there', icon: 'car', match: (r) => /ride|transport|airport|chicago|indy|pickup|errand/i.test(`${r.category} ${r.title}`) },
  { key: 'housing', label: 'Housing', short: 'Rooms + roommates', query: 'People / community', icon: 'home', match: (r) => /housing|roommate|sublet|lease|rent|apartment|dorm|room for rent/i.test(`${r.category} ${r.title}`) },
  { key: 'market', label: 'Buy & Sell', short: 'Marketplace nearby', query: 'Buy & sell', icon: 'tag', match: (r) => r.kind === 'buy_sell' || /market|sell|buy|for sale|wanted|airpods|macbook|fridge|lamp/i.test(`${r.category} ${r.title}`) },
  { key: 'study', label: 'Study Help', short: 'Classmates + tutoring', query: 'Study / class', icon: 'book', match: (r) => /study|class|tutor|math|calc|econ|exam|homework|notes/i.test(`${r.category} ${r.title}`) },
  { key: 'gaming', label: 'Gaming', short: 'Duos + teammates', query: 'Gaming / duos', icon: 'game', match: (r) => /gaming|game|valorant|league|fortnite|duo|queue|cs2|playstation|xbox/i.test(`${r.category} ${r.title}`) },
  { key: 'projects', label: 'Projects', short: 'Builders + collaborators', query: 'Build something', icon: 'code', match: (r) => /project|collab|designer|hackathon|build|startup|code|teammate/i.test(`${r.category} ${r.title}`) },
  { key: 'people', label: 'People', short: 'Friends + campus plans', query: 'People / community', icon: 'users', match: (r) => /community|people|friend|group|club|ski|gym|corec|hang|coffee|meet/i.test(`${r.category} ${r.title}`) },
  { key: 'services', label: 'Services', short: 'Campus help nearby', query: 'Give me a hand', icon: 'wrench', match: (r) => /service|moving|move|repair|clean|photograph|photographer|assemble|fix|carry|errand/i.test(`${r.category} ${r.title}`) },
  { key: 'events', label: 'Events', short: 'Meetups + campus events', query: 'People / community', icon: 'calendar', match: (r) => /event|nightshift|buildpurdue|meetup|workshop|callout|concert|party|tabling/i.test(`${r.category} ${r.title}`) }
];

const campusImageFallback = 'https://images.pexels.com/photos/7683692/pexels-photo-7683692.jpeg?auto=compress&cs=tinysrgb&w=1600';

function mergeRequests(primary: DiscoverRequest[], extra: DiscoverRequest[]) {
  const merged = new Map<string, DiscoverRequest>();
  primary.forEach((item) => merged.set(item.id, item));
  extra.forEach((item) => { if (!merged.has(item.id)) merged.set(item.id, item); });
  return Array.from(merged.values()).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export default function CampusHome() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [universities, setUniversities] = useState<University[]>([]);
  const [homeCampusId, setHomeCampusId] = useState<string | null>(null);
  const [activeCampusId, setActiveCampusId] = useState<string | null>(null);
  const [pendingCampusId, setPendingCampusId] = useState<string | null>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [requests, setRequests] = useState<DiscoverRequest[]>([]);
  const [feedMode, setFeedMode] = useState<FeedMode>('latest');
  const [feedClicks, setFeedClicks] = useState<FeedClicks>({});
  const [feedRefreshKey, setFeedRefreshKey] = useState(0);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let alive = true;

    supabase.auth.getUser().then(async ({ data }) => {
      if (!alive) return;
      if (!data.user) {
        router.replace('/login?next=%2Fcampus');
        return;
      }

      try {
        const [profileResult, campusList] = await Promise.all([
          supabase.from('profiles').select('display_name,name,full_name,home_campus_id,current_campus_id,school').eq('id', data.user.id).maybeSingle(),
          fetchActiveUniversities()
        ]);
        if (!alive) return;

        const metadata = data.user.user_metadata ?? {};
        const profileRow = profileResult.data;
        const rawName = profileRow?.display_name || profileRow?.full_name || profileRow?.name || (typeof metadata.display_name === 'string' ? metadata.display_name : '');
        const homeId = typeof profileRow?.home_campus_id === 'string' ? profileRow.home_campus_id : null;
        const currentId = typeof profileRow?.current_campus_id === 'string' ? profileRow.current_campus_id : null;
        const storedCampus = window.sessionStorage.getItem('aspire-active-campus-id');
        const validIds = new Set(campusList.map((campus) => campus.id));
        const nextActive = storedCampus && validIds.has(storedCampus)
          ? storedCampus
          : currentId && validIds.has(currentId)
            ? currentId
            : homeId;

        setName((rawName || '').trim());
        setCurrentUserId(data.user.id);
        setUniversities(campusList);
        setHomeCampusId(homeId);
        setActiveCampusId(nextActive);
        if (nextActive) window.sessionStorage.setItem('aspire-active-campus-id', nextActive);
      } finally {
        if (alive) setLoading(false);
      }
    }).catch(() => {
      if (alive) setLoading(false);
    });

    return () => { alive = false; };
  }, [router]);

  useEffect(() => {
    const refresh = () => setFeedRefreshKey((value) => value + 1);
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
    if (!activeCampusId || !currentUserId) return;
    const campus = universities.find((item) => item.id === activeCampusId);
    if (!campus) return;
    let alive = true;

    fetchCampusFeedRequests({ campusId: activeCampusId, category: 'Anything', limit: 60 })
      .then((data) => {
        if (!alive) return;
        let next = data;
        if (isPreviewDemoEnabled()) {
          next = mergeRequests(next, buildDemoDiscoverRequests(currentUserId, campus.id, campus.name, campus.cover_image));
        }
        setRequests(next);
      })
      .catch(() => { if (alive) setRequests([]); });

    return () => { alive = false; };
  }, [activeCampusId, currentUserId, universities, feedRefreshKey]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(FEED_CLICK_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved) as FeedClicks;
      if (parsed && typeof parsed === 'object') setFeedClicks(parsed);
    } catch {
      // Latest sorting still works without local engagement history.
    }
  }, []);

  const homeCampus = useMemo(() => universities.find((item) => item.id === homeCampusId) ?? null, [universities, homeCampusId]);
  const selectedCampus = useMemo(() => universities.find((item) => item.id === activeCampusId) ?? null, [universities, activeCampusId]);
  const pendingCampus = useMemo(() => universities.find((item) => item.id === pendingCampusId) ?? null, [universities, pendingCampusId]);
  const firstName = useMemo(() => name.split(/\s+/).filter(Boolean)[0] || '', [name]);
  const visiting = Boolean(selectedCampus && homeCampus && selectedCampus.id !== homeCampus.id);

  const sectionData = useMemo(() => decks.map((deck) => {
    const matches = requests.filter(deck.match);
    return { deck, count: matches.length };
  }), [requests]);

  const feedEntries = useMemo(() => [...requests].sort((a, b) => {
    if (feedMode === 'popular') {
      const scoreA = feedClicks[a.id] || 0;
      const scoreB = feedClicks[b.id] || 0;
      if (scoreA !== scoreB) return scoreB - scoreA;
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  }).slice(0, 8), [requests, feedMode, feedClicks]);

  function chooseCampus(nextId: string) {
    if (nextId === activeCampusId) return;
    if (nextId === homeCampusId) {
      setActiveCampusId(nextId);
      window.sessionStorage.setItem('aspire-active-campus-id', nextId);
      setPendingCampusId(null);
      return;
    }
    const key = `aspire-campus-confirmed:${nextId}`;
    if (window.sessionStorage.getItem(key) === '1') {
      setActiveCampusId(nextId);
      window.sessionStorage.setItem('aspire-active-campus-id', nextId);
      return;
    }
    setPendingCampusId(nextId);
  }

  function confirmCampusSwitch() {
    if (!pendingCampusId) return;
    window.sessionStorage.setItem(`aspire-campus-confirmed:${pendingCampusId}`, '1');
    window.sessionStorage.setItem('aspire-active-campus-id', pendingCampusId);
    setActiveCampusId(pendingCampusId);
    setPendingCampusId(null);
  }

  function recordFeedClick(id: string) {
    setFeedClicks((current) => {
      const next = { ...current, [id]: (current[id] || 0) + 1 };
      try { window.localStorage.setItem(FEED_CLICK_KEY, JSON.stringify(next)); } catch { /* ignore storage errors */ }
      return next;
    });
  }

  async function signOut() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace('/');
    router.refresh();
  }

  if (loading) return <AppLoader label="Finding your circle…" detail="Loading your home campus" />;

  if (!selectedCampus || !homeCampus) {
    return (
      <main className={`campusHome ${styles.page}`}>
        <section className={styles.unknown}>
          <img src={aspireLogo} alt="" />
          <span>Campus identity</span>
          <h1>We couldn’t resolve your home campus.</h1>
          <p>New Aspire accounts use a supported university email. Existing beta accounts may need their campus identity updated.</p>
          <a className={styles.primaryButton} href="/profile">Open profile</a>
        </section>
        <AppDock active="home" />
      </main>
    );
  }

  const campusCardImage = selectedCampus.cover_image || campusImageFallback;
  const authorName = name || 'Aspire student';

  return (
    <main className={`campusHome ${styles.page}`}>
      <AppDock active="home" />

      <div className={styles.shell}>
        <header className={styles.topbar}>
          <div className={styles.brandLine}>
            <img src={aspireLogo} alt="Aspire 101" />
            <div className={styles.brandText}>
              <strong>Aspire 101</strong>
              <span>{visiting ? `Visiting ${selectedCampus.short_name}` : `${selectedCampus.short_name} community`}</span>
            </div>
          </div>

          <a className={styles.searchBox} href="/discover" aria-label="Search Aspire 101">
            <UiIcon name="search" />
            <span>Search requests, people, rides, items...</span>
          </a>

          <div className={styles.topActions}>
            <select className={styles.campusSelect} value={activeCampusId || ''} onChange={(event) => chooseCampus(event.target.value)} aria-label="Choose campus to browse">
              {universities.map((campus) => <option key={campus.id} value={campus.id}>{campus.short_name}</option>)}
            </select>
            {visiting && <button className={styles.returnButton} type="button" onClick={() => chooseCampus(homeCampus.id)}>Home campus</button>}
            <a className={styles.iconButton} href="/connections" aria-label="Open connections"><UiIcon name="bell" /></a>
            <div className={styles.profileWrap}>
              <button type="button" onClick={() => setProfileMenuOpen((value) => !value)} className={styles.avatarButton} aria-label="Open profile menu" aria-expanded={profileMenuOpen}>{firstName ? firstName[0].toUpperCase() : 'A'}</button>
              {profileMenuOpen && (
                <div className={styles.profileMenu}>
                  <strong>{authorName}</strong>
                  <span>{homeCampus.name}</span>
                  <a href="/profile">View profile</a>
                  <button type="button" onClick={signOut}>Log out</button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className={styles.mainGrid}>
          <div className={styles.mainColumn}>
            <section className={styles.hero}>
              <img className={styles.heroImage} src={campusCardImage} alt="" />
              <div className={styles.heroOverlay} aria-hidden="true" />
              <div className={styles.heroContent}>
                <p className={styles.eyebrow}>{selectedCampus.short_name} · Community</p>
                <h1>{firstName ? `Welcome back, ${firstName}.` : 'Find what you need on campus.'}</h1>
                <p className={styles.heroText}>Ask for help, find people, buy or sell nearby, join a ride, or start something with students around you.</p>
                <div className={styles.heroActions}>
                  <a className={styles.primaryButton} href="/post"><UiIcon name="plus" />Post something</a>
                  <a className={styles.secondaryButton} href="/discover"><UiIcon name="compass" />Browse campus</a>
                </div>
              </div>
            </section>

            <section className={styles.sectionCard}>
              <div className={styles.sectionHead}>
                <div><p>Explore</p><h2>What do you need?</h2></div>
                <a href="/discover">See everything →</a>
              </div>
              <div className={styles.categoryGrid}>
                {sectionData.map(({ deck, count }) => (
                  <a key={deck.key} href={`/discover?category=${encodeURIComponent(deck.query)}&campus=${encodeURIComponent(selectedCampus.id)}`} className={styles.categoryCard}>
                    <div className={styles.categoryIcon}><UiIcon name={deck.icon} /></div>
                    <strong>{deck.label}</strong>
                    <span>{count ? `${count} open` : deck.short}</span>
                  </a>
                ))}
              </div>
            </section>

            <section className={styles.sectionCard}>
              <div className={`${styles.sectionHead} campusFeedHead`}>
                <div>
                  <p>Right now</p>
                  <h2>Recent Posts</h2>
                  <span className="campusFeedSubtitle">{selectedCampus.short_name} · same live feed as Browse</span>
                </div>
                <div className="campusFeedControls" role="group" aria-label="Sort recent campus posts">
                  <button type="button" className={feedMode === 'latest' ? 'active' : ''} onClick={() => setFeedMode('latest')}>Latest</button>
                  <button type="button" className={feedMode === 'popular' ? 'active' : ''} onClick={() => setFeedMode('popular')}><UiIcon name="flame" />Popular</button>
                  <a href={`/discover?campus=${encodeURIComponent(selectedCampus.id)}`} aria-label="Open browse filters"><UiIcon name="sliders" /></a>
                </div>
              </div>

              <div className={styles.feed}>
                {feedEntries.map((item) => {
                  const mine = Boolean(currentUserId && item.poster_id === currentUserId);
                  return <CampusFeedCard
                    key={item.id}
                    item={item}
                    campusLabel={selectedCampus.short_name}
                    currentUserId={currentUserId}
                    authorName={authorName}
                    fallbackImage={campusCardImage}
                    footerLeft={<span className={campusFeedCardStyles.secondaryAction}>{mine ? 'Your post' : 'Campus post'}</span>}
                    footerRight={<a className={campusFeedCardStyles.primaryAction} href={campusFeedHref(item, selectedCampus.id)} onClick={() => recordFeedClick(item.id)}>Open →</a>}
                  />;
                })}
                {!feedEntries.length && (
                  <a className={styles.emptyFeed} href="/post">
                    <strong>Your campus feed is quiet right now.</strong>
                    <span>Start the first post for {selectedCampus.short_name} →</span>
                  </a>
                )}
              </div>
            </section>
          </div>

          <aside className={styles.sideColumn}>
            <section className={styles.sideCard}>
              <div className={styles.welcomeTop}>
                <div className={styles.welcomeAvatar}>{firstName ? firstName[0].toUpperCase() : 'A'}</div>
                <div><span>Welcome</span><strong>{authorName}</strong></div>
              </div>
              <div className={styles.statusRow}>
                <span className={styles.statusIcon}><UiIcon name="check" /></span>
                <div><strong>Campus account</strong><span>{homeCampus.name}</span></div>
              </div>
              <a className={styles.sideLink} href="/profile"><span>View profile & verification</span><UiIcon name="chevron" /></a>
            </section>

            <section className={styles.sideCard}>
              <h3 className={styles.quickTitle}>Quick actions</h3>
              <div className={styles.quickGrid}>
                <a className={styles.quickAction} href="/post"><UiIcon name="plus" /><span>Create post</span></a>
                <a className={styles.quickAction} href="/discover"><UiIcon name="search" /><span>Search campus</span></a>
                <a className={styles.quickAction} href="/connections"><UiIcon name="message" /><span>Connections</span></a>
                <a className={styles.quickAction} href="/profile"><UiIcon name="user" /><span>My account</span></a>
              </div>
            </section>
          </aside>
        </div>
      </div>

      {pendingCampus && (
        <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="campus-switch-title">
          <div className={styles.modal}>
            <span>Browse another campus</span>
            <h2 id="campus-switch-title">Browse {pendingCampus.short_name}?</h2>
            <p>You’re verified at {homeCampus.name}. Posts, activity, and discovery shown here will temporarily be based on {pendingCampus.name}. Your Aspire identity will stay tied to {homeCampus.short_name}.</p>
            <div className={styles.modalActions}>
              <button type="button" onClick={() => setPendingCampusId(null)}>Stay at {homeCampus.short_name}</button>
              <button type="button" className={styles.confirm} onClick={confirmCampusSwitch}>Browse {pendingCampus.short_name}</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
