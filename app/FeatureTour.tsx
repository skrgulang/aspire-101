'use client';

import { CSSProperties, useEffect, useRef, useState } from 'react';

const features = [
  {
    number: '01',
    label: 'REQUESTS',
    title: 'Ask campus for what you need.',
    copy: 'Post a need in normal language and give it the context that matters — time, place, price, or just the kind of person you are looking for.',
    tags: ['Nearby', 'Today', 'Flexible'],
    demoTitle: 'Need help moving a mini fridge this afternoon',
    demoMeta: 'Campus · Today · $30',
    accent: 'REQUEST OPEN'
  },
  {
    number: '02',
    label: 'STUDY',
    title: 'Find help before the exam finds you.',
    copy: 'Tutors, study partners, quick concept checks, and people who have already taken the class — without digging through five different group chats.',
    tags: ['Tutoring', 'Study groups', 'Course help'],
    demoTitle: 'Math 55 review before Thursday?',
    demoMeta: '3 students available · Tonight',
    accent: 'STUDY MODE'
  },
  {
    number: '03',
    label: 'RIDES + LOGISTICS',
    title: 'Get across campus — or out of town.',
    copy: 'Airport rides, weekend carpools, moving help, pickups, and the random logistics that college constantly creates.',
    tags: ['Airport', 'Carpool', 'Moving'],
    demoTitle: 'Ride to SFO Friday morning',
    demoMeta: '3 interested · Split gas',
    accent: 'ON THE MOVE'
  },
  {
    number: '04',
    label: 'MARKET',
    title: 'Campus stuff should stay on campus.',
    copy: 'Buy, sell, borrow, or find the things students actually need — desks, mini fridges, textbooks, lamps, monitors, and more.',
    tags: ['Buy', 'Sell', 'Borrow'],
    demoTitle: 'Looking for a mini fridge under $80',
    demoMeta: '4 nearby offers · Pickup today',
    accent: 'LOCAL MARKET'
  },
  {
    number: '05',
    label: 'PROJECTS',
    title: 'Find the missing person for the thing you want to build.',
    copy: 'Hackathon teams, startups, class projects, creators, coders, designers, and collaborators who can turn an idea into something real.',
    tags: ['Hackathons', 'Startups', 'Collabs'],
    demoTitle: 'Need a designer for a weekend AI build',
    demoMeta: '5 replies · CS + Design',
    accent: 'BUILD TOGETHER'
  },
  {
    number: '06',
    label: 'OPPORTUNITIES',
    title: 'Useful opportunities should find students earlier.',
    copy: 'Research, internships, campus programs, events, referrals, and high-signal opportunities can surface around what you are already trying to do.',
    tags: ['Research', 'Internships', 'Events'],
    demoTitle: 'Looking for product internships for spring',
    demoMeta: '6 shared opportunities',
    accent: 'WHAT’S NEXT'
  },
  {
    number: '07',
    label: 'PEOPLE',
    title: 'A useful request can become a useful connection.',
    copy: 'The person who helps once might become a study partner, teammate, collaborator, friend, or simply someone worth knowing on campus.',
    tags: ['Profiles', 'Connections', 'Community'],
    demoTitle: 'Maya helped with your request',
    demoMeta: 'You are now connected on Aspire',
    accent: 'PEOPLE > POSTS'
  },
  {
    number: '08',
    label: 'TRUST',
    title: 'Know who you are dealing with.',
    copy: 'College-focused identity, profiles, response history, and reputation signals can make student-to-student interactions feel more accountable.',
    tags: ['Student identity', 'Reputation', 'History'],
    demoTitle: 'Verified student profile',
    demoMeta: '4.9 rating · 18 completed requests',
    accent: 'TRUST LAYER'
  }
];

export default function FeatureTour() {
  const ref = useRef<HTMLElement | null>(null);
  const [progress, setProgress] = useState(0);
  const [active, setActive] = useState(0);

  useEffect(() => {
    let frame = 0;

    const update = () => {
      frame = 0;
      const section = ref.current;
      if (!section) return;
      const rect = section.getBoundingClientRect();
      const scrollable = Math.max(section.offsetHeight - window.innerHeight, 1);
      const next = Math.min(1, Math.max(0, -rect.top / scrollable));
      setProgress(next);
      setActive(Math.min(features.length - 1, Math.floor(next * features.length)));
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const feature = features[active];
  const style = { '--feature-progress': `${progress * 100}%` } as CSSProperties;

  return (
    <section ref={ref} id="features" className="featureTour" style={style}>
      <div className="featureSticky shell">
        <div className="featureTourIntro">
          <p className="eyebrow">THE ASPIRE UNIVERSE</p>
          <h2>One request can open a lot more than one door.</h2>
          <p className="featureTourLead">Keep scrolling. Aspire expands from a simple request into the everyday network around college life.</p>

          <div className="featureRail" aria-hidden="true">
            <div className="featureRailFill" />
            {features.map((item, index) => (
              <div className={`featureRailStop ${index <= active ? 'active' : ''}`} key={item.number}>
                <span>{item.number}</span>
                <b>{item.label}</b>
              </div>
            ))}
          </div>
        </div>

        <div className="featureScene">
          <div className="featureSceneGlow" aria-hidden="true" />
          <div className="featureSceneTop">
            <span>{feature.number} / 08</span>
            <span>{feature.accent}</span>
          </div>

          <div className="featureSceneCopy" key={`${feature.number}-copy`}>
            <p>{feature.label}</p>
            <h3>{feature.title}</h3>
            <div>{feature.copy}</div>
          </div>

          <div className="featureDemo" key={`${feature.number}-demo`}>
            <div className="featureDemoHeader">
              <span className="featureDemoDot" />
              <span>{feature.accent}</span>
              <small>just now</small>
            </div>
            <strong>{feature.demoTitle}</strong>
            <p>{feature.demoMeta}</p>
            <div className="featureTagRow">
              {feature.tags.map((tag) => <span key={tag}>{tag}</span>)}
            </div>
            <div className="featureDemoAction">
              <span>ASPIRE 101</span>
              <b>↗</b>
            </div>
          </div>

          <div className="featureGhostCards" aria-hidden="true">
            <div className="featureGhost ghostOne" />
            <div className="featureGhost ghostTwo" />
            <div className="featureGhost ghostThree" />
          </div>
        </div>
      </div>

      <div className="featureMobile shell">
        {features.map((item) => (
          <article key={item.number}>
            <div><span>{item.number}</span><b>{item.label}</b></div>
            <h3>{item.title}</h3>
            <p>{item.copy}</p>
            <div className="featureMobileDemo"><strong>{item.demoTitle}</strong><span>{item.demoMeta}</span></div>
          </article>
        ))}
      </div>
    </section>
  );
}
