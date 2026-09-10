'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import { AspireRequest, fetchOpenRequests } from '../lib/supabase/requests';
import { fetchActiveUniversities, University } from '../lib/supabase/universities';
import { aspireLogo } from './logo';
import AppDock from './AppDock';
import AppLoader from './AppLoader';
import UiIcon, { UiIconName } from './UiIcon';
import styles from './CampusHomeRefresh.module.css';

type CampusDeck = {
  key: string;
  label: string;
  short: string;
  query: string;
  icon: UiIconName;
  match: (request: AspireRequest) => boolean;
};

type DemoRecentPost = {
  id: string;
  title: string;
  label: string;
  query: string;
  icon: UiIconName;
  time: string;
  image: string | 'campus';
};

const decks: CampusDeck[] = [
  { key: 'rides', label: 'Rides', short: 'Rides + pickups', query: 'Get me there', icon: 'car', match: (r) => /ride|transport|airport|chicago|indy|pickup|errand/i.test(`${r.category} ${r.title}`) },
  { key: 'study', label: 'Study', short: 'Classmates + tutoring', query: 'Study / class', icon: 'book', match: (r) => /study|class|tutor|math|calc|econ|exam/i.test(`${r.category} ${r.title}`) },
  { key: 'gaming', label: 'Gaming', short: 'Duos + teammates', query: 'Gaming / duos', icon: 'game', match: (r) => /gaming|game|valorant|league|fortnite|duo|queue|cs2/i.test(`${r.category} ${r.title}`) },
  { key: 'projects', label: 'Projects', short: 'Builders + collaborators', query: 'Build something', icon: 'code', match: (r) => /project|collab|designer|hackathon|build|startup|code/i.test(`${r.category} ${r.title}`) },
  { key: 'people', label: 'People', short: 'Friends + campus plans', query: 'People / community', icon: 'users', match: (r) => /community|people|friend|group|club|ski|gym|hang|meet/i.test(`${r.category} ${r.title}`) },
  { key: 'market', label: 'Buy & Sell', short: 'Marketplace nearby', query: 'Buy & sell', icon: 'tag', match: (r) => r.kind === 'buy_sell' || /market|sell|buy|fridge|lamp/i.test(`${r.category} ${r.title}`) }
];

const demoRecentPosts: DemoRecentPost[] = [
  {
    id: 'demo-nightshift',
    title: 'Anyone want to go to BuildPurdue Nightshift together?',
    label: 'Events',
    query: 'People / community',
    icon: 'users',
    time: '1h ago',
    image: 'https://www.buildpurdue.org/_next/image?q=75&url=%2Flanding%2Fnightshift_sample.JPG&w=3840'
  },
  {
    id: 'demo-corec',
    title: 'Anyone want to go to CoRec together later?',
    label: 'People',
    query: 'People / community',
    icon: 'users',
    time: '2h ago',
    image: 'https://localist-images.azureedge.net/photos/40101082677033/card/b82ef141532a8b4dc9f48b55bd8fce76f7c633e9.jpg'
  },
  {
    id: 'demo-gaming',
    title: 'Anyone want to game tonight?',
    label: 'Gaming',
    query: 'Gaming / duos',
    icon: 'game',
    time: '3h ago',
    image: 'https://engineering.purdue.edu/AAE/spotlights/2024/2024-0822-Purdue-Dell-Technologies-celebrate-opening-of-Alienware-Purdue-Gaming-Lounge/Purdue-Alienware-Gaming-Lounge-web.jpg'
  },
  {
    id: 'demo-airport',
    title: 'Anyone heading to IND? Looking for an airport ride.',
    label: 'Rides',
    query: 'Get me there',
    icon: 'car',
    time: '5h ago',
    image: 'campus'
  },
  {
    id: 'demo-study',
    title: 'Math 55 study group later today?',
    label: 'Study',
    query: 'Study / class',
    icon: 'book',
    time: '6h ago',
    image: 'campus'
  },
  {
    id: 'demo-hangout',
    title: 'Anyone free to grab coffee on campus?',
    label: 'People',
    query: 'People / community',
    icon: 'users',
    time: '8h ago',
    image: 'campus'
  }
];

const campusImageFallback = 'https://images.pexels.com/photos/7683692/pexels-photo-7683692.jpeg?auto=compress&cs=tinysrgb&w=1600';

function normalizeCampus(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function sameCampus(request: AspireRequest, campus: University) {
  if (!request.campus) return false;
  const requestCampus = normalizeCampus(request.campus);
  const campusName = normalizeCampus(campus.name);
  const campusShort = normalizeCampus(campus.short_name);
  const campusSlug = normalizeCampus(campus.slug);
  return requestCampus === campusName || requestCampus === campusShort || requestCampus === campusSlug || requestCampus.includes(campusShort) || campusName.includes(requestCampus);
}

function relativeTime(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.floor(diff / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function compactTitle(title: string, limit = 46) {
  return title.length <= limit ? title : `${title.slice(0, limit - 1).trim()}…`;
}

function deckForRequest(request: AspireRequest) {
  return decks.find((deck) => deck.match(request)) ?? decks[4];
}

export default function CampusHome() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [universities, setUniversities] = useState<University[]>([]);
  const [homeCampusId, setHomeCampusId] = useState<string | null>(null);
  const [activeCampusId, setActiveCampusId] = useState<string | null>(null);
  const [pendingCampusId, setPendingCampusId] = useState<string | null>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [requests, setRequests] = useState<AspireRequest[]>([]);

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
        const [profileResult, campusList, open] = await Promise.all([
          supabase.from('profiles').select('display_name,name,full_name,home_campus_id,school').eq('id', data.user.id).maybeSingle(),
          fetchActiveUniversities(),
          fetchOpenRequests(60)
        ]);
        if (!alive) return;

        const metadata = data.user.user_metadata ?? {};
        const profileRow = profileResult.data;
        const rawName = profileRow?.display_name || profileRow?.full_name || profileRow?.name || (typeof metadata.display_name === 'string' ? metadata.display_name : '');
        const homeId = typeof profileRow?.home_campus_id === 'string' ? profileRow.home_campus_id : null;

        setName((rawName || '').trim());
        setUniversities(campusList);
        setHomeCampusId(homeId);
        setActiveCampusId(homeId);
        setRequests(open);
      } catch {
        if (alive) setRequests([]);
      } finally {
        if (alive) setLoading(false);
      }
    }).catch(() => {
      if (alive) setLoading(false);
    });

    return () => { alive = false; };
  }, [router]);

  const homeCampus = useMemo(() => universities.find((item) => item.id === homeCampusId) ?? null, [universities, homeCampusId]);
  const selectedCampus = useMemo(() => universities.find((item) => item.id === activeCampusId) ?? null, [universities, activeCampusId]);
  const pendingCampus = useMemo(() => universities.find((item) => item.id === pendingCampusId) ?? null, [universities, pendingCampusId]);
  const firstName = useMemo(() => name.split(/\s+/).filter(Boolean)[0] || '', [name]);
  const visiting = Boolean(selectedCampus && homeCampus && selectedCampus.id !== homeCampus.id);
  const campusRequests = useMemo(() => selectedCampus ? requests.filter((request) => sameCampus(request, selectedCampus)) : [], [requests, selectedCampus]);
  const demoCards = useMemo(() => demoRecentPosts.slice(0, Math.max(0, 6 - Math.min(campusRequests.length, 6))), [campusRequests.length]);

  const sectionData = useMemo(() => decks.map((deck) => {
    const matches = campusRequests.filter(deck.match);
    return { deck, count: matches.length };
  }), [campusRequests]);

  function chooseCampus(nextId: string) {
    if (nextId === activeCampusId) return;
    if (nextId === homeCampusId) {
      setActiveCampusId(nextId);
      setPendingCampusId(null);
      return;
    }
    const key = `aspire-campus-confirmed:${nextId}`;
    if (typeof window !== 'undefined' && window.sessionStorage.getItem(key) === '1') {
      setActiveCampusId(nextId);
      return;
    }
    setPendingCampusId(nextId);
  }

  function confirmCampusSwitch() {
    if (!pendingCampusId) return;
    if (typeof window !== 'undefined') window.sessionStorage.setItem(`aspire-campus-confirmed:${pendingCampusId}`, '1');
    setActiveCampusId(pendingCampusId);
    setPendingCampusId(null);
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
            {visiting && <button className={styles.returnButton} type="button" onClick={() => setActiveCampusId(homeCampus.id)}>Home campus</button>}
            <a className={styles.iconButton} href="/connections" aria-label="Open connections">
              <UiIcon name="bell" />
            </a>
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
                  <a key={deck.key} href={`/discover?category=${encodeURIComponent(deck.query)}`} className={styles.categoryCard}>
                    <div className={styles.categoryIcon}><UiIcon name={deck.icon} /></div>
                    <strong>{deck.label}</strong>
                    <span>{count ? `${count} open` : deck.short}</span>
                  </a>
                ))}
              </div>
            </section>

            <section className={styles.sectionCard}>
              <div className={styles.sectionHead}>
                <div><p>Right now</p><h2>Recent around {selectedCampus.short_name}</h2></div>
                <a href="/discover">See all →</a>
              </div>

              <div className={styles.feed}>
                {campusRequests.slice(0, 6).map((request) => {
                  const deck = deckForRequest(request);
                  return (
                    <a key={request.id} href={`/discover?category=${encodeURIComponent(deck.query)}`} className={styles.feedItem}>
                      <div className={styles.feedIcon}><UiIcon name={deck.icon} /></div>
                      <div className={styles.feedCopy}>
                        <strong>{compactTitle(request.title)}</strong>
                        <span>{deck.label} · {relativeTime(request.created_at)} · {selectedCampus.short_name}</span>
                      </div>
                      <span className={styles.feedArrow}><UiIcon name="chevron" /></span>
                    </a>
                  );
                })}

                {demoCards.map((post) => (
                  <a key={post.id} href={`/discover?category=${encodeURIComponent(post.query)}`} className={`${styles.feedItem} demoRecentCard`}>
                    <div className="demoRecentImageWrap">
                      <img className="demoRecentImage" src={post.image === 'campus' ? campusCardImage : post.image} alt="" />
                      <span className="demoRecentCategory">{post.label}</span>
                    </div>
                    <div className={`${styles.feedCopy} demoRecentCopy`}>
                      <strong>{post.title}</strong>
                      <span className="demoRecentAuthor"><b>{firstName ? firstName[0].toUpperCase() : 'A'}</b>{authorName}</span>
                      <span>{selectedCampus.short_name} · {post.time}</span>
                    </div>
                    <span className={styles.feedArrow}><UiIcon name="chevron" /></span>
                  </a>
                ))}
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
