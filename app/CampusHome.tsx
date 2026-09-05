'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import { AspireRequest, fetchOpenRequests } from '../lib/supabase/requests';
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

type CampusOption = {
  key: string;
  school: string;
  aliases: string[];
  image: string;
};

const campuses: CampusOption[] = [
  { key: 'purdue', school: 'Purdue University', aliases: ['purdue'], image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Purdue%20EngineeringMall.jpg?width=1600' },
  { key: 'berkeley', school: 'UC Berkeley', aliases: ['berkeley', 'uc berkeley', 'cal'], image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Sather%20gate%20berkeley.jpg?width=1600' },
  { key: 'ucla', school: 'UCLA', aliases: ['ucla'], image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Royce%20Hall.jpg?width=1600' },
  { key: 'rutgers', school: 'Rutgers University', aliases: ['rutgers'], image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Queens%20Campus%20of%20Rutgers%20University%202026f.jpg?width=1600' },
  { key: 'uiuc', school: 'UIUC', aliases: ['uiuc', 'illinois urbana', 'university of illinois'], image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Altgeld%20Hall.jpg?width=1600' },
  { key: 'osu', school: 'The Ohio State University', aliases: ['ohio state', 'osu'], image: 'https://commons.wikimedia.org/wiki/Special:FilePath/University%20Hall%20%28Ohio%20State%20University%29.jpg?width=1600' },
  { key: 'umich', school: 'University of Michigan', aliases: ['michigan', 'umich', 'u-m'], image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Law%20Quadrangle%2C%20University%20of%20Michigan%2C%20University%20Avenue%20and%20State%20Street%2C%20Ann%20Arbor%2C%20MI%20-%2054381553310.jpg?width=1600' }
];

const decks: CampusDeck[] = [
  { key: 'rides', label: 'Rides', short: 'rides + pickups', query: 'Get me there', glyph: '↗', match: (r) => /ride|transport|airport|chicago|indy|pickup|errand/i.test(`${r.category} ${r.title}`) },
  { key: 'study', label: 'Study', short: 'classmates + tutoring', query: 'Study / class', glyph: '⌑', match: (r) => /study|class|tutor|math|calc|econ|exam/i.test(`${r.category} ${r.title}`) },
  { key: 'gaming', label: 'Gaming', short: 'duos + teammates', query: 'Gaming / duos', glyph: '◉', match: (r) => /gaming|game|valorant|league|fortnite|duo|queue|cs2/i.test(`${r.category} ${r.title}`) },
  { key: 'projects', label: 'Projects', short: 'builders + collaborators', query: 'Build something', glyph: '✦', match: (r) => /project|collab|designer|hackathon|build|startup|code/i.test(`${r.category} ${r.title}`) },
  { key: 'people', label: 'People', short: 'friends + campus plans', query: 'People / community', glyph: '+', match: (r) => /community|people|friend|group|club|ski|gym|hang|meet/i.test(`${r.category} ${r.title}`) },
  { key: 'market', label: 'Market', short: 'buy + sell nearby', query: 'Buy & sell', glyph: '$', match: (r) => r.kind === 'buy_sell' || /market|sell|buy|fridge|lamp/i.test(`${r.category} ${r.title}`) }
];

function resolveCampus(rawSchool: string) {
  const normalized = rawSchool.toLowerCase().trim();
  return campuses.find((campus) => campus.aliases.some((alias) => normalized.includes(alias))) ?? campuses[0];
}

function sameCampus(request: AspireRequest, school: string) {
  if (!request.campus) return true;
  const a = request.campus.toLowerCase();
  const b = school.toLowerCase();
  return a.includes(b) || b.includes(a) || resolveCampus(a).key === resolveCampus(b).key;
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
  const [campusKey, setCampusKey] = useState('purdue');
  const [requests, setRequests] = useState<AspireRequest[]>([]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let alive = true;
    const startedAt = Date.now();

    supabase.auth.getUser().then(async ({ data }) => {
      if (!alive) return;
      if (!data.user) {
        router.replace('/login?next=%2Fcampus');
        return;
      }

      const metadata = data.user.user_metadata ?? {};
      const rawName = typeof metadata.display_name === 'string' ? metadata.display_name : '';
      const rawSchool = typeof metadata.school === 'string' ? metadata.school : '';
      const resolved = resolveCampus(rawSchool || 'Purdue');
      setName(rawName.trim());
      setCampusKey(resolved.key);

      try {
        const open = await fetchOpenRequests(60);
        if (alive) setRequests(open);
      } catch {
        if (alive) setRequests([]);
      } finally {
        const remaining = Math.max(0, 650 - (Date.now() - startedAt));
        window.setTimeout(() => {
          if (alive) setLoading(false);
        }, remaining);
      }
    }).catch(() => {
      const remaining = Math.max(0, 650 - (Date.now() - startedAt));
      window.setTimeout(() => {
        if (alive) setLoading(false);
      }, remaining);
    });

    return () => { alive = false; };
  }, [router]);

  const selectedCampus = useMemo(() => campuses.find((item) => item.key === campusKey) ?? campuses[0], [campusKey]);
  const firstName = useMemo(() => name.split(/\s+/).filter(Boolean)[0] || '', [name]);
  const campusRequests = useMemo(() => requests.filter((request) => sameCampus(request, selectedCampus.school)), [requests, selectedCampus.school]);
  const radarRequests = campusRequests.slice(0, 6);

  const sectionData = useMemo(() => decks.map((deck) => {
    const matches = campusRequests.filter(deck.match);
    return { deck, count: matches.length, sample: matches[0] };
  }), [campusRequests]);

  async function signOut() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace('/');
    router.refresh();
  }

  if (loading) {
    return <AppLoader label="Finding your circle…" detail="Scanning your campus" />;
  }

  return (
    <main className="campusHome communityHome">
      <div className="campusBackdrop communityBackdrop" aria-hidden="true">
        <img key={selectedCampus.image} src={selectedCampus.image} alt="" />
        <span />
      </div>

      <header className="communityTopbar">
        <a className="communityBrand" href="/campus" aria-label="Aspire campus home">
          <img src={aspireLogo} alt="" />
          <span>Aspire 101</span>
        </a>

        <label className="communityCampusPicker">
          <span aria-hidden="true">●</span>
          <select value={campusKey} onChange={(event) => setCampusKey(event.target.value)} aria-label="Choose campus">
            {campuses.map((campus) => <option key={campus.key} value={campus.key}>{campus.school}</option>)}
          </select>
          <b aria-hidden="true">⌄</b>
        </label>

        <button type="button" onClick={signOut} className="communityAvatar" aria-label="Sign out">{firstName ? firstName[0].toUpperCase() : 'A'}</button>
      </header>

      <section className="communityHero">
        <div className="communityIntro">
          <p className="communityEyebrow">COMMUNITY CIRCLE · {selectedCampus.school.toUpperCase()}</p>
          <h1>Find your<br /><em>circle.</em></h1>
          <p className="communityLead">See what students on your campus are asking for, building, studying, and doing right now.</p>

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
                  <span><strong>{compactTitle(request.title, 46)}</strong><small>{deck.label} · {relativeTime(request.created_at)} · same campus</small></span>
                  <b>→</b>
                </a>
              );
            })}
            {!campusRequests.length && <a className="communityNowEmpty" href="/post"><strong>Your circle starts with one post.</strong><span>Ask campus for something →</span></a>}
          </div>
        </div>

        <div className="communityRadarWrap" aria-label="Community Circle campus activity radar">
          <div className="radarHeader">
            <div><strong>Community Circle</strong><span>Scanning campus activity…</span></div>
            <div className="radarCount"><b>{campusRequests.length}</b><span>open now</span></div>
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
                <a
                  key={request.id}
                  href={`/discover?category=${encodeURIComponent(deck.query)}`}
                  className={`radarBlip radarBlip-${index + 1}`}
                  title={request.title}
                >
                  <i>{deck.glyph}</i>
                  <span><strong>{deck.label}</strong><small>{compactTitle(request.title, 30)}</small></span>
                </a>
              );
            })}

            {!radarRequests.length && (
              <a className="radarStart" href="/post"><strong>Quiet for now.</strong><span>Post something and light up the circle →</span></a>
            )}
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

      <AppDock active="home" />
    </main>
  );
}
