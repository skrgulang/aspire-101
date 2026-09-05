'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import { AspireRequest, fetchOpenRequests } from '../lib/supabase/requests';
import { aspireLogo } from './logo';

type CampusDeck = {
  key: string;
  label: string;
  short: string;
  href: string;
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
  { key: 'rides', label: 'Rides', short: 'rides + pickups', href: '/discover?category=Get%20me%20there', glyph: '↗', match: (r) => /ride|transport|airport|chicago|indy|pickup|errand/i.test(`${r.category} ${r.title}`) },
  { key: 'study', label: 'Study', short: 'classmates + tutoring', href: '/discover?category=Study%20%2F%20class', glyph: '⌑', match: (r) => /study|class|tutor|math|calc|econ|exam/i.test(`${r.category} ${r.title}`) },
  { key: 'gaming', label: 'Gaming', short: 'duos + teammates', href: '/discover?category=Gaming%20%2F%20duos', glyph: '◉', match: (r) => /gaming|game|valorant|league|fortnite|duo|queue|cs2/i.test(`${r.category} ${r.title}`) },
  { key: 'projects', label: 'Projects', short: 'builders + collaborators', href: '/discover?category=Build%20something', glyph: '✦', match: (r) => /project|collab|designer|hackathon|build|startup|code/i.test(`${r.category} ${r.title}`) },
  { key: 'people', label: 'People', short: 'friends + campus plans', href: '/discover?category=People%20%2F%20community', glyph: '+', match: (r) => /community|people|friend|group|club|ski|gym|hang|meet/i.test(`${r.category} ${r.title}`) },
  { key: 'market', label: 'Market', short: 'buy + sell nearby', href: '/discover?category=Buy%20%26%20sell', glyph: '$', match: (r) => r.kind === 'buy_sell' || /market|sell|buy|fridge|lamp/i.test(`${r.category} ${r.title}`) }
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

export default function CampusHome() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [school, setSchool] = useState('Purdue University');
  const [campusKey, setCampusKey] = useState('purdue');
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

      const metadata = data.user.user_metadata ?? {};
      const rawName = typeof metadata.display_name === 'string' ? metadata.display_name : '';
      const rawSchool = typeof metadata.school === 'string' ? metadata.school : '';
      const resolved = resolveCampus(rawSchool || 'Purdue');
      setName(rawName.trim());
      setSchool(rawSchool.trim() || resolved.school);
      setCampusKey(resolved.key);
      setLoading(false);

      try {
        const open = await fetchOpenRequests(40);
        if (alive) setRequests(open);
      } catch {
        if (alive) setRequests([]);
      }
    });

    return () => { alive = false; };
  }, [router]);

  const selectedCampus = useMemo(() => campuses.find((item) => item.key === campusKey) ?? campuses[0], [campusKey]);
  const firstName = useMemo(() => name.split(/\s+/).filter(Boolean)[0] || '', [name]);
  const campusRequests = useMemo(() => requests.filter((request) => sameCampus(request, selectedCampus.school)), [requests, selectedCampus.school]);
  const recent = campusRequests.slice(0, 4);

  async function signOut() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace('/');
    router.refresh();
  }

  if (loading) {
    return <main className="campusHome campusHomeLoading"><span className="campusPulse" /><p>Opening campus…</p></main>;
  }

  return (
    <main className="campusHome">
      <div className="campusBackdrop" aria-hidden="true">
        <img key={selectedCampus.image} src={selectedCampus.image} alt="" />
        <span />
      </div>

      <header className="campusHomeNav">
        <a className="campusHomeBrand" href="/campus" aria-label="Aspire campus home">
          <img src={aspireLogo} alt="" />
          <span>Aspire 101</span>
        </a>

        <label className="campusSwitcher">
          <span>●</span>
          <select value={campusKey} onChange={(event) => setCampusKey(event.target.value)} aria-label="Choose campus">
            {campuses.map((campus) => <option key={campus.key} value={campus.key}>{campus.school}</option>)}
          </select>
          <b>⌄</b>
        </label>

        <div className="campusHomeActions">
          <a href="/connections" className="campusIconLink" aria-label="Connections">◎</a>
          <a href="/post" className="campusPost">+ Post</a>
          <button type="button" onClick={signOut} className="campusAvatar" aria-label="Sign out">{firstName ? firstName[0].toUpperCase() : 'A'}</button>
        </div>
      </header>

      <section className="campusWelcome">
        <div>
          <p>{firstName ? `HEY ${firstName.toUpperCase()} · ` : ''}{selectedCampus.school.toUpperCase()}</p>
          <h1>Your campus.<br /><em>One place.</em></h1>
        </div>
        <div className="campusWelcomeNote" aria-hidden="true">PICK A CIRCLE<br />SEE WHAT&apos;S UP ↘</div>
      </section>

      <section className="campusCircleSection" aria-label="Explore your campus">
        <div className="campusCircleGlow" aria-hidden="true" />
        <div className="campusOrbit" aria-hidden="true" />

        <a className="campusCircleCenter" href="/discover">
          <span className="campusCircleLogo"><img src={aspireLogo} alt="" /></span>
          <strong>Discover</strong>
          <small>{campusRequests.length ? `${campusRequests.length} open now` : 'see campus'}</small>
          <b>→</b>
        </a>

        {decks.map((deck, index) => {
          const count = campusRequests.filter(deck.match).length;
          return (
            <a key={deck.key} href={deck.href} className={`campusOrbitNode node-${index + 1}`}>
              <i>{deck.glyph}</i>
              <span><strong>{deck.label}</strong><small>{count ? `${count} open` : deck.short}</small></span>
            </a>
          );
        })}

        <a className="campusPostNote" href="/post"><small>NEED SOMETHING?</small><strong>Post it ↗</strong></a>
      </section>

      <section className="campusNow">
        <div className="campusNowHead">
          <div><p>RIGHT NOW</p><h2>What&apos;s happening on campus?</h2></div>
          <a href="/discover">See all →</a>
        </div>

        {recent.length ? (
          <div className="campusNowRail">
            {recent.map((request) => (
              <a key={request.id} href="/discover" className="campusNowCard">
                <span>{request.category || 'REQUEST'}</span>
                <strong>{request.title}</strong>
                <small>{relativeTime(request.created_at)} · {request.kind === 'paid_help' && request.amount_cents ? `$${Math.round(request.amount_cents / 100)}` : request.kind === 'split_cost' ? 'split cost' : 'campus'}</small>
              </a>
            ))}
          </div>
        ) : (
          <a className="campusQuiet" href="/post"><span>Campus is quiet here.</span><strong>Be the first to post something →</strong></a>
        )}
      </section>

      <nav className="campusDock" aria-label="Aspire app navigation">
        <a className="active" href="/campus"><i>◎</i><span>Home</span></a>
        <a href="/discover"><i>⌕</i><span>Discover</span></a>
        <a className="campusDockPost" href="/post"><i>+</i><span>Post</span></a>
        <a href="/connections"><i>◌</i><span>Connections</span></a>
        <a href="/profile"><i>○</i><span>Profile</span></a>
      </nav>
    </main>
  );
}
