'use client';

import { useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import { aspireLogo } from './logo';

const campuses = [
  {
    key: 'purdue',
    school: 'Purdue University',
    short: 'Purdue',
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Purdue%20EngineeringMall.jpg?width=1600',
    note: 'Boiler up ♡'
  },
  {
    key: 'berkeley',
    school: 'UC Berkeley',
    short: 'UC Berkeley',
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Sather%20gate%20berkeley.jpg?width=1600',
    note: 'Rep your campus ♡'
  },
  {
    key: 'ucla',
    school: 'UCLA',
    short: 'UCLA',
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Royce%20Hall.jpg?width=1600',
    note: 'Ambassadors wanted'
  },
  {
    key: 'rutgers',
    school: 'Rutgers University',
    short: 'Rutgers',
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Queens%20Campus%20of%20Rutgers%20University%202026f.jpg?width=1600',
    note: 'Apply here ♡'
  },
  {
    key: 'uiuc',
    school: 'UIUC',
    short: 'UIUC',
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Altgeld%20Hall.jpg?width=1600',
    note: 'Need ambassadors'
  },
  {
    key: 'osu',
    school: 'The Ohio State University',
    short: 'OSU',
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/University%20Hall%20%28Ohio%20State%20University%29.jpg?width=1600',
    note: 'Student reps wanted'
  },
  {
    key: 'umich',
    school: 'University of Michigan',
    short: 'UMich',
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Law%20Quadrangle%2C%20University%20of%20Michigan%2C%20University%20Avenue%20and%20State%20Street%2C%20Ann%20Arbor%2C%20MI%20-%2054381553310.jpg?width=1600',
    note: 'Join the team ♡'
  }
];

const features = [
  {
    key: 'rides',
    label: 'Rides',
    note: 'airport rides + pickups',
    icon: '↗',
    image: 'https://images.pexels.com/photos/7683887/pexels-photo-7683887.jpeg?auto=compress&cs=tinysrgb&w=1000',
    doodle: 'GOOD RIDES\nGOOD PEOPLE'
  },
  {
    key: 'study',
    label: 'Study',
    note: 'find a study buddy',
    icon: '⌑',
    image: 'https://images.pexels.com/photos/7683700/pexels-photo-7683700.jpeg?auto=compress&cs=tinysrgb&w=1000',
    doodle: 'BETTER GRADES\nTOGETHER'
  },
  {
    key: 'gaming',
    label: 'Gaming',
    note: 'duos + teammates',
    icon: '◉',
    image: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1000&q=82',
    doodle: 'GOOD GAMES\nBETTER PEOPLE'
  },
  {
    key: 'projects',
    label: 'Projects',
    note: 'build together',
    icon: '✦',
    image: 'https://images.pexels.com/photos/7972544/pexels-photo-7972544.jpeg?auto=compress&cs=tinysrgb&w=1000',
    doodle: 'IDEAS → BUILD\n→ LAUNCH'
  },
  {
    key: 'people',
    label: 'People',
    note: 'friends + campus life',
    icon: '+',
    image: 'https://images.pexels.com/photos/7973095/pexels-photo-7973095.jpeg?auto=compress&cs=tinysrgb&w=1000',
    doodle: 'SAME CAMPUS\nDIFFERENT STORIES ♡'
  }
];

const recent = [
  { label: 'Ride to IND Friday', meta: '2 min ago', icon: '↗' },
  { label: 'Math 55 study tonight', meta: '12 min ago', icon: '⌑' },
  { label: 'Valorant duo?', meta: '23 min ago', icon: '◉' },
  { label: 'Looking for project teammates', meta: '1 hour ago', icon: '✦' },
  { label: 'New to campus — meet people?', meta: '2 hours ago', icon: '+' }
];

function featureHref(featureKey: string, user: User | null) {
  const next = `/campus?deck=${encodeURIComponent(featureKey)}`;
  return user ? next : `/signup?next=${encodeURIComponent(next)}`;
}

export default function MarketingHome() {
  const [campusKey, setCampusKey] = useState('purdue');
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let alive = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!alive) return;
      setUser(data.user ?? null);
      setAuthReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthReady(true);
    });
    return () => {
      alive = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const campus = useMemo(() => campuses.find((item) => item.key === campusKey) ?? campuses[0], [campusKey]);

  return (
    <main className="marketingHome">
      <section className="marketingHero">
        <div className="marketingHeroMedia" aria-hidden="true">
          <img key={campus.image} src={campus.image} alt="" />
          <div />
        </div>

        <header className="marketingNav">
          <a className="marketingBrand" href="/" aria-label="Aspire 101 home">
            <img src={aspireLogo} alt="" />
            <strong>Aspire 101</strong>
          </a>

          <label className="marketingCampusSelect">
            <span aria-hidden="true">●</span>
            <select value={campusKey} onChange={(event) => setCampusKey(event.target.value)} aria-label="Choose campus">
              {campuses.map((item) => <option key={item.key} value={item.key}>{item.school}</option>)}
            </select>
            <b aria-hidden="true">⌄</b>
          </label>

          <nav className="marketingNavRight" aria-label="Main navigation">
            <a href="#campuses">For campuses</a>
            {authReady && user ? (
              <a className="marketingJoin" href="/campus">Open campus →</a>
            ) : (
              <>
                <a href="/login">Log in</a>
                <a className="marketingJoin" href="/signup">Join Aspire →</a>
              </>
            )}
          </nav>
        </header>

        <div className="marketingHeroCopy">
          <p className="marketingKicker">ASPire 101 · {campus.short.toUpperCase()}</p>
          <h1>What are you here<br />for <em>tonight?</em></h1>
          <p>Pick one and start exploring.</p>
        </div>

        <div className="marketingCampusDoodle" aria-hidden="true">
          <span>SAME<br />CAMPUS.<br />REAL PEOPLE.</span>
          <i>↗</i>
        </div>
        <a className="marketingHeroSticky" href="/ambassadors">REP YOUR<br />CAMPUS ♡</a>

        <section className="marketingFeatureRail" aria-label="Explore Aspire features">
          {features.map((feature, index) => (
            <a className="marketingFeatureCard" href={featureHref(feature.key, user)} key={feature.key}>
              <img src={feature.image} alt="" />
              <span className="marketingFeatureShade" />
              <span className="marketingFeatureDoodle">{feature.doodle.split('\n').map((line) => <span key={line}>{line}</span>)}</span>
              <span className="marketingFeatureInfo">
                <i>{feature.icon}</i>
                <strong>{feature.label}</strong>
                <small>{feature.note}</small>
              </span>
              <b className="marketingFeatureArrow">→</b>
              {index === 0 && <span className="marketingFeatureActive" />}
            </a>
          ))}
        </section>

        <section className="marketingRecent" aria-label="Recent campus activity">
          <div className="marketingRecentHead"><span>RECENT REQUESTS NEAR YOU</span><a href={user ? '/discover' : '/signup?next=%2Fdiscover'}>See more →</a></div>
          <div className="marketingRecentRail">
            {recent.map((item) => (
              <a href={user ? '/discover' : '/signup?next=%2Fdiscover'} key={item.label}>
                <i>{item.icon}</i><span><strong>{item.label}</strong><small>{item.meta}</small></span>
              </a>
            ))}
          </div>
        </section>
      </section>

      <section id="campuses" className="marketingCampuses">
        <div className="marketingCampusesHead">
          <div><p>STUDENT-LED, CAMPUS BY CAMPUS</p><h2>Bring Aspire to <em>your campus.</em></h2></div>
          <a href="/ambassadors">Become an ambassador →</a>
        </div>

        <div className="marketingCampusRail">
          {campuses.map((item, index) => (
            <article className="marketingCampusCard" key={item.key}>
              <img src={item.image} alt={`${item.short} campus`} />
              <span className="marketingCampusShade" />
              <strong>{item.short}</strong>
              <a className={`campusSticky sticky-${index % 4}`} href="/ambassadors">{item.note}</a>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
