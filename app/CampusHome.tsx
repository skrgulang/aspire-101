'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import { AspireRequest, fetchOpenRequests } from '../lib/supabase/requests';
import { fetchActiveUniversities, University } from '../lib/supabase/universities';
import { aspireLogo } from './logo';
import AppDock from './AppDock';
import AppLoader from './AppLoader';

type CampusDeck = {
  key: string;
  label: string;
  short: string;
  query: string;
  glyph: string;
  match: (request: AspireRequest) => boolean;
};

const decks: CampusDeck[] = [
  { key: 'rides', label: 'Rides', short: 'rides + pickups', query: 'Get me there', glyph: '↗', match: (r) => /ride|transport|airport|chicago|indy|pickup|errand/i.test(`${r.category} ${r.title}`) },
  { key: 'study', label: 'Study', short: 'classmates + tutoring', query: 'Study / class', glyph: '⌑', match: (r) => /study|class|tutor|math|calc|econ|exam/i.test(`${r.category} ${r.title}`) },
  { key: 'gaming', label: 'Gaming', short: 'duos + teammates', query: 'Gaming / duos', glyph: '◉', match: (r) => /gaming|game|valorant|league|fortnite|duo|queue|cs2/i.test(`${r.category} ${r.title}`) },
  { key: 'projects', label: 'Projects', short: 'builders + collaborators', query: 'Build something', glyph: '✦', match: (r) => /project|collab|designer|hackathon|build|startup|code/i.test(`${r.category} ${r.title}`) },
  { key: 'people', label: 'People', short: 'friends + campus plans', query: 'People / community', glyph: '+', match: (r) => /community|people|friend|group|club|ski|gym|hang|meet/i.test(`${r.category} ${r.title}`) },
  { key: 'market', label: 'Market', short: 'buy + sell nearby', query: 'Buy & sell', glyph: '$', match: (r) => r.kind === 'buy_sell' || /market|sell|buy|fridge|lamp/i.test(`${r.category} ${r.title}`) }
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
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function compactTitle(title: string, limit = 38) {
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
  const radarRequests = campusRequests.slice(0, 6);

  const sectionData = useMemo(() => decks.map((deck) => {
    const matches = campusRequests.filter(deck.match);
    return { deck, count: matches.length, sample: matches[0] };
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
      <main className="campusHome communityHome campusUnknownState">
        <section className="campusUnknownCard">
          <img src={aspireLogo} alt="" />
          <span>CAMPUS IDENTITY</span>
          <h1>We couldn’t resolve your home campus.</h1>
          <p>New Aspire accounts use a supported university email. Existing beta accounts may need their campus identity updated.</p>
          <a className="button buttonGold" href="/profile">Open profile →</a>
        </section>
        <AppDock active="home" />
      </main>
    );
  }

  return (
    <main className="campusHome communityHome">
      <div className="campusBackdrop communityBackdrop" aria-hidden="true">
        <img key={selectedCampus.id} src={selectedCampus.cover_image || campusImageFallback} alt="" />
        <span />
      </div>

      <header className="communityTopbar">
        <a className="communityBrand" href="/campus" aria-label="Aspire campus home">
          <img src={aspireLogo} alt="" />
          <span>Aspire 101</span>
        </a>

        <div className="communityCampusIdentity">
          <label className="communityCampusPicker">
            <span aria-hidden="true">●</span>
            <select value={activeCampusId || ''} onChange={(event) => chooseCampus(event.target.value)} aria-label="Choose campus to browse">
              {universities.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
            </select>
            <b aria-hidden="true">⌄</b>
          </label>
          <span className={`campusIdentityTag ${visiting ? 'isVisiting' : ''}`}>{visiting ? 'VISITING' : 'HOME CAMPUS'}</span>
          {visiting && <button className="returnHomeCampus" type="button" onClick={() => setActiveCampusId(homeCampus.id)}>Return to {homeCampus.short_name}</button>}
        </div>

        <div className="communityProfileMenuWrap">
          <button type="button" onClick={() => setProfileMenuOpen((value) => !value)} className="communityAvatar" aria-label="Open profile menu" aria-expanded={profileMenuOpen}>{firstName ? firstName[0].toUpperCase() : 'A'}</button>
          {profileMenuOpen && (
            <div className="communityProfileMenu">
              <strong>{name || 'Aspire student'}</strong>
              <span>{homeCampus.name} · verified campus</span>
              <a href="/profile">View profile</a>
              <button type="button" onClick={signOut}>Log out</button>
            </div>
          )}
        </div>
      </header>

      <section className="communityHero">
        <div className="communityIntro">
          <p className="communityEyebrow">COMMUNITY CIRCLE · {selectedCampus.short_name.toUpperCase()} · {visiting ? 'VISITING' : 'HOME'}</p>
          <h1>Find your<br /><em>circle.</em></h1>
          <p className="communityLead">See what students around {selectedCampus.short_name} are asking for, building, studying, and doing right now.</p>

          <div className="communityQuickFilters" aria-label="Explore sections">
            <a className="active" href="/discover">All</a>
            {decks.map((deck) => <a key={deck.key} href={`/discover?category=${encodeURIComponent(deck.query)}`}>{deck.label}</a>)}
          </div>

          <div className="communityNowHead">
            <strong>Right now on campus</strong>
            <a href="/discover">See all →</a>
          </div>

          <div className="communityNowList">
            {campusRequests.slice(0, 3).map((request) => {
              const deck = deckForRequest(request);
              return (
                <a key={request.id} href={`/discover?category=${encodeURIComponent(deck.query)}`} className="communityNowItem">
                  <i className={`topic-${deck.key}`}>{deck.glyph}</i>
                  <span><strong>{compactTitle(request.title, 46)}</strong><small>{deck.label} · {relativeTime(request.created_at)} · {selectedCampus.short_name}</small></span>
                  <b>→</b>
                </a>
              );
            })}
            {!campusRequests.length && <a className="communityNowEmpty" href="/post"><strong>Your circle is quiet right now.</strong><span>Start something on {selectedCampus.short_name} →</span></a>}
          </div>
        </div>

        <div className="communityRadarWrap" aria-label="Community Circle campus activity radar">
          <div className="radarHeader">
            <div><strong>Community Circle</strong><span>Scanning {selectedCampus.short_name}…</span></div>
            <div className="radarCount"><b>{campusRequests.length}</b><span>open around campus</span></div>
          </div>

          <div className="communityRadar">
            <div className="radarSweep" aria-hidden="true" />
            <div className="radarCross radarCrossX" aria-hidden="true" />
            <div className="radarCross radarCrossY" aria-hidden="true" />
            <div className="radarCenter" aria-hidden="true"><span /></div>
            <span className="radarDirection radarN">N</span>
            <span className="radarDirection radarE">E</span>
            <span className="radarDirection radarS">S</span>
            <span className="radarDirection radarW">W</span>

            {radarRequests.map((request, index) => {
              const deck = deckForRequest(request);
              return (
                <a key={request.id} href={`/discover?category=${encodeURIComponent(deck.query)}`} className={`radarBlip radarBlip-${index + 1}`} title={request.title}>
                  <i>{deck.glyph}</i>
                  <span><strong>{deck.label}</strong><small>{compactTitle(request.title, 30)}</small></span>
                </a>
              );
            })}

            {!radarRequests.length && <a className="radarStart" href="/post"><strong>Your circle is quiet right now.</strong><span>Try another section or start something →</span></a>}
          </div>

          <p className="radarPrivacy">Campus activity only — no precise location is shown.</p>
        </div>
      </section>

      <section className="communitySections">
        <div className="communitySectionsHead"><div><p>EXPLORE BY SECTION</p><h2>Pick what you need.</h2></div><span>One campus. Different reasons to connect.</span></div>
        <div className="communitySectionGrid">
          {sectionData.map(({ deck, count, sample }) => (
            <a key={deck.key} href={`/discover?category=${encodeURIComponent(deck.query)}`} className={`communitySectionCard section-${deck.key}`}>
              <div className="sectionIcon">{deck.glyph}</div>
              <div className="sectionCopy">
                <span>{count ? `${count} OPEN` : 'EXPLORE'}</span>
                <h3>{deck.label}</h3>
                <p>{sample ? compactTitle(sample.title, 48) : deck.short}</p>
              </div>
              <b>→</b>
            </a>
          ))}
        </div>
      </section>

      {pendingCampus && (
        <div className="campusSwitchOverlay" role="dialog" aria-modal="true" aria-labelledby="campus-switch-title">
          <div className="campusSwitchModal">
            <span>BROWSE ANOTHER CAMPUS</span>
            <h2 id="campus-switch-title">Browse {pendingCampus.short_name}?</h2>
            <p>You’re verified at {homeCampus.name}. Posts, activity, and discovery shown here will temporarily be based on {pendingCampus.name}. Your Aspire identity will stay tied to {homeCampus.short_name}.</p>
            <div><button type="button" onClick={() => setPendingCampusId(null)}>Stay at {homeCampus.short_name}</button><button type="button" className="button buttonGold" onClick={confirmCampusSwitch}>Browse {pendingCampus.short_name}</button></div>
          </div>
        </div>
      )}

      <AppDock active="home" />
    </main>
  );
}
