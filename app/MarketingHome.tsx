'use client';

import { useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import { aspireLogo } from './logo';

const campuses = [
  { key: 'purdue', school: 'Purdue University', short: 'Purdue', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Purdue%20EngineeringMall.jpg?width=1600', note: 'Boiler up ♡' },
  { key: 'berkeley', school: 'UC Berkeley', short: 'UC Berkeley', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Sather%20gate%20berkeley.jpg?width=1600', note: 'Rep your campus ♡' },
  { key: 'ucla', school: 'UCLA', short: 'UCLA', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Royce%20Hall.jpg?width=1600', note: 'Ambassadors wanted' },
  { key: 'rutgers', school: 'Rutgers University', short: 'Rutgers', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Queens%20Campus%20of%20Rutgers%20University%202026f.jpg?width=1600', note: 'Apply here ♡' },
  { key: 'uiuc', school: 'UIUC', short: 'UIUC', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Altgeld%20Hall.jpg?width=1600', note: 'Need ambassadors' },
  { key: 'osu', school: 'The Ohio State University', short: 'OSU', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/University%20Hall%20%28Ohio%20State%20University%29.jpg?width=1600', note: 'Student reps wanted' },
  { key: 'umich', school: 'University of Michigan', short: 'UMich', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Law%20Quadrangle%2C%20University%20of%20Michigan%2C%20University%20Avenue%20and%20State%20Street%2C%20Ann%20Arbor%2C%20MI%20-%2054381553310.jpg?width=1600', note: 'Join the team ♡' }
];

const features = [
  { key: 'rides', label: 'Rides', note: 'airport rides + pickups', icon: '↗', image: 'https://images.pexels.com/photos/7510863/pexels-photo-7510863.jpeg?auto=compress&cs=tinysrgb&w=1200', doodle: 'GOOD RIDES\nGOOD PEOPLE' },
  { key: 'study', label: 'Study', note: 'find a study buddy', icon: '⌑', image: 'https://images.pexels.com/photos/6146973/pexels-photo-6146973.jpeg?auto=compress&cs=tinysrgb&w=1200', doodle: 'BETTER GRADES\nTOGETHER' },
  { key: 'gaming', label: 'Gaming', note: 'duos + teammates', icon: '◉', image: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1200&q=84', doodle: 'GOOD GAMES\nBETTER PEOPLE' },
  { key: 'projects', label: 'Projects', note: 'build together', icon: '✦', image: 'https://images.pexels.com/photos/6145955/pexels-photo-6145955.jpeg?auto=compress&cs=tinysrgb&w=1200', doodle: 'IDEAS → BUILD\n→ LAUNCH' },
  { key: 'people', label: 'People', note: 'friends + campus life', icon: '+', image: 'https://images.pexels.com/photos/8198540/pexels-photo-8198540.jpeg?auto=compress&cs=tinysrgb&w=1200', doodle: 'SAME CAMPUS\nDIFFERENT STORIES ♡' }
];

const recent = [
  { label: 'Ride to IND Friday', meta: '2 min ago', icon: '↗' },
  { label: 'Math 55 study tonight', meta: '12 min ago', icon: '⌑' },
  { label: 'Valorant duo?', meta: '23 min ago', icon: '◉' },
  { label: 'Looking for project teammates', meta: '1 hour ago', icon: '✦' },
  { label: 'New to campus — meet people?', meta: '2 hours ago', icon: '+' }
];

const featureStories = [
  {
    step: '01',
    title: 'Ask campus.',
    line: 'Post what you need.',
    image: 'https://images.pexels.com/photos/6139799/pexels-photo-6139799.jpeg?auto=compress&cs=tinysrgb&w=1400',
    chips: ['Ride to IND?', 'Valorant duo?', 'Move a desk?', 'Study tonight?'],
    className: 'storyAsk'
  },
  {
    step: '02',
    title: 'Find your people.',
    line: 'Browse by what you’re actually here for.',
    image: 'https://images.pexels.com/photos/7683401/pexels-photo-7683401.jpeg?auto=compress&cs=tinysrgb&w=1400',
    chips: ['Study', 'Gaming', 'Projects', 'People'],
    className: 'storyDiscover'
  },
  {
    step: '03',
    title: 'Connect when it fits.',
    line: 'Both sides choose. Then chat opens.',
    image: 'https://images.pexels.com/photos/7969484/pexels-photo-7969484.jpeg?auto=compress&cs=tinysrgb&w=1400',
    chips: ['Interested', 'Mutual connect', 'Private chat'],
    className: 'storyConnect'
  }
];

const howItWorks = [
  { step: '01', title: 'Post it', text: 'Say what you need.', visual: 'Need a ride to IND Friday?' },
  { step: '02', title: 'Campus sees it', text: 'Nearby students can respond.', visual: 'I can help after class.' },
  { step: '03', title: 'Pick your match', text: 'Choose who works for you.', visual: 'Mutual connect ✓' },
  { step: '04', title: 'Make it happen', text: 'Chat, meet, get it done.', visual: 'See you there 👋' }
];

const productPages = [
  { label: 'Post a Request', note: 'Get help. Give help.', icon: '+', href: '/post', className: 'productPost' },
  { label: 'Discover', note: 'See what’s happening.', icon: '⌕', href: '/discover', className: 'productDiscover' },
  { label: 'Connections', note: 'Chat. Plan. Do more.', icon: '◌', href: '/connections', className: 'productConnections' },
  { label: 'Safety Center', note: 'A safer campus for all.', icon: '◇', href: '/safety', className: 'productSafety' },
  { label: 'Campus Circle', note: 'Requests, clubs, and more.', icon: '◎', href: '/campus', className: 'productCircle' }
];

const collegeStats = [
  {
    value: '16.4M',
    label: 'undergraduates enrolled at U.S. degree-granting institutions in fall 2024',
    source: 'NCES',
    href: 'https://nces.ed.gov/programs/digest/d25/tables/dt25_303.70.asp'
  },
  {
    value: '40%',
    label: 'of full-time undergraduates were employed while enrolled in 2020',
    source: 'NCES / CPS',
    href: 'https://nces.ed.gov/programs/coe/indicator/ssa/college-student-employment'
  },
  {
    value: '$27.8K',
    label: 'average 2022–23 total cost at public 4-year schools for students living off campus, not with family',
    source: 'NCES / IPEDS',
    href: 'https://nces.ed.gov/programs/coe/indicator/cua/undergrad-costs'
  }
];

function featureHref(featureKey: string, user: User | null) {
  const next = `/campus?deck=${encodeURIComponent(featureKey)}`;
  return user ? next : `/signup?next=${encodeURIComponent(next)}`;
}

function gatedHref(href: string, user: User | null) {
  return user ? href : `/signup?next=${encodeURIComponent(href)}`;
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
            <a href="#features">What is Aspire?</a>
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
          <p className="marketingKicker">ASPIRE 101 · {campus.short.toUpperCase()}</p>
          <h1>What do you need<br /><em>on campus?</em></h1>
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

      <section id="features" className="marketingStorySection">
        <div className="marketingStoryHead">
          <p>WHAT ASPIRE DOES</p>
          <h2>One campus.<br /><em>A lot going on.</em></h2>
          <span>Ask. Discover. Connect.</span>
        </div>

        <div className="marketingStoryGrid">
          {featureStories.map((story) => (
            <article className={`marketingStoryCard ${story.className}`} key={story.step}>
              <img src={story.image} alt="" />
              <span className="marketingStoryShade" />
              <div className="marketingStoryStep">{story.step}</div>
              <div className="marketingStoryCopy">
                <h3>{story.title}</h3>
                <p>{story.line}</p>
              </div>
              <div className="marketingStoryChips" aria-hidden="true">
                {story.chips.map((chip) => <span key={chip}>{chip}</span>)}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="marketingHow">
        <div className="marketingExpandHead">
          <p>HOW IT WORKS</p>
          <h2>From request to <em>real life.</em></h2>
          <span>Four steps. That’s it.</span>
        </div>
        <div className="marketingHowGrid">
          {howItWorks.map((item) => (
            <article key={item.step}>
              <b>{item.step}</b>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
              <div className="marketingHowVisual">{item.visual}</div>
            </article>
          ))}
        </div>
      </section>

      <section className="marketingProducts">
        <div className="marketingExpandHead">
          <p>EXPLORE MORE ON ASPIRE</p>
          <h2>Everything you need.<br /><em>One campus network.</em></h2>
        </div>
        <div className="marketingProductGrid">
          {productPages.map((item) => (
            <a key={item.label} className={`marketingProductCard ${item.className}`} href={gatedHref(item.href, user)}>
              <i>{item.icon}</i>
              <div><strong>{item.label}</strong><span>{item.note}</span></div>
              <b>→</b>
            </a>
          ))}
        </div>
      </section>

      <section className="marketingSafetyStrip">
        <div>
          <span>◇</span>
          <strong>A safer, stronger campus together.</strong>
        </div>
        <div><b>Verified students</b><small>Built around real campus communities.</small></div>
        <div><b>Report, block, review</b><small>Control who you interact with.</small></div>
        <div><b>Mutual connect</b><small>Both sides choose before private chat.</small></div>
        <a href="/safety">Safety Center →</a>
      </section>

      <section className="marketingDataSection">
        <div className="marketingExpandHead marketingDataHead">
          <p>COLLEGE, IN REAL NUMBERS</p>
          <h2>Campus life is <em>a lot.</em></h2>
          <span>Official U.S. education data — not Aspire estimates.</span>
        </div>
        <div className="marketingDataGrid">
          {collegeStats.map((stat) => (
            <a key={stat.value} href={stat.href} target="_blank" rel="noreferrer" className="marketingDataCard">
              <strong>{stat.value}</strong>
              <p>{stat.label}</p>
              <span>{stat.source} ↗</span>
            </a>
          ))}
        </div>
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
