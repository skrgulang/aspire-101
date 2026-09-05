'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import { aspireLogo } from './logo';

type CampusDeck = {
  key: string;
  label: string;
  note: string;
  href: string;
  className: string;
  glyph: string;
};

const decks: CampusDeck[] = [
  { key: 'rides', label: 'Rides + errands', note: 'Go somewhere. Pick something up.', href: '/discover?category=Get%20me%20there', className: 'deckRide', glyph: '↗' },
  { key: 'study', label: 'Study partners', note: 'Find people in your classes.', href: '/discover?category=Study%20%2F%20class', className: 'deckStudy', glyph: '✎' },
  { key: 'gaming', label: 'Gaming + duos', note: 'Queue with someone from campus.', href: '/discover?category=Gaming%20%2F%20duos', className: 'deckGaming', glyph: '◉' },
  { key: 'projects', label: 'Projects + builders', note: 'Hackathons, startups, side projects.', href: '/discover?category=Build%20something', className: 'deckBuild', glyph: '✦' },
  { key: 'people', label: 'Campus people', note: 'Groups, plans, people to do things with.', href: '/discover?category=People%20%2F%20community', className: 'deckPeople', glyph: '+' },
  { key: 'market', label: 'Buy + sell', note: 'Find stuff around campus.', href: '/discover?category=Buy%20%26%20sell', className: 'deckMarket', glyph: '$' }
];

export default function CampusHome() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [school, setSchool] = useState('Your campus');
  const [active, setActive] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedDeck = params.get('deck');
    if (requestedDeck) {
      const requestedIndex = decks.findIndex((deck) => deck.key === requestedDeck);
      if (requestedIndex >= 0) setActive(requestedIndex);
    }

    const supabase = getSupabaseBrowserClient();
    let alive = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!alive) return;
      if (!data.user) {
        const next = requestedDeck ? `/campus?deck=${encodeURIComponent(requestedDeck)}` : '/campus';
        router.replace(`/login?next=${encodeURIComponent(next)}`);
        return;
      }
      const metadata = data.user.user_metadata ?? {};
      const rawName = typeof metadata.display_name === 'string' ? metadata.display_name : '';
      const rawSchool = typeof metadata.school === 'string' ? metadata.school : '';
      setName(rawName.trim());
      setSchool(rawSchool.trim() || 'Your campus');
      setLoading(false);
    });

    return () => { alive = false; };
  }, [router]);

  const firstName = useMemo(() => name.split(/\s+/).filter(Boolean)[0] || '', [name]);

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
      <header className="campusHomeNav">
        <a className="campusHomeBrand" href="/campus" aria-label="Aspire campus home">
          <img src={aspireLogo} alt="" />
          <span>Aspire 101</span>
        </a>
        <div className="campusHomeActions">
          <a href="/post" className="campusPost">+ Post</a>
          <a href="/connections" className="campusIconLink" aria-label="Connections">◎</a>
          <button type="button" onClick={signOut} className="campusAvatar" aria-label="Sign out">{firstName ? firstName[0].toUpperCase() : 'A'}</button>
        </div>
      </header>

      <section className="campusHomeIntro">
        <div>
          <p className="campusLocation">{school.toUpperCase()}</p>
          <h1>{firstName ? `Hey ${firstName}.` : 'Hey.'}<br /><span>What are you here for?</span></h1>
        </div>
        <a className="campusAsk" href="/post"><span>Need something?</span><strong>Ask campus →</strong></a>
      </section>

      <section className="campusDeckArea" aria-label="Discover campus categories">
        <div className="campusDeckRail" role="tablist" aria-label="Campus discovery decks">
          {decks.map((deck, index) => (
            <button key={deck.key} type="button" role="tab" aria-selected={active === index} className={active === index ? 'active' : ''} onClick={() => setActive(index)}>
              {deck.label}
            </button>
          ))}
        </div>

        <div className="campusDeckStage">
          {decks.map((deck, index) => (
            <a
              key={deck.key}
              href={deck.href}
              className={`campusDeckCard ${deck.className} ${active === index ? 'active' : ''}`}
              style={{ '--deck-offset': index - active } as React.CSSProperties}
              aria-hidden={active !== index}
              tabIndex={active === index ? 0 : -1}
            >
              <div className="campusDeckTop"><span>{deck.glyph}</span><small>{school}</small></div>
              <div className="campusDeckCopy"><h2>{deck.label}</h2><p>{deck.note}</p></div>
              <div className="campusDeckBottom"><strong>Discover</strong><span>→</span></div>
            </a>
          ))}

          <button className="campusDeckPrev" type="button" aria-label="Previous category" onClick={() => setActive((value) => (value - 1 + decks.length) % decks.length)}>←</button>
          <button className="campusDeckNext" type="button" aria-label="Next category" onClick={() => setActive((value) => (value + 1) % decks.length)}>→</button>
        </div>
      </section>

      <section className="campusHomeBottom">
        <a href="/discover?category=Anything">See everything</a>
        <span>Requests · people · campus</span>
      </section>
    </main>
  );
}
