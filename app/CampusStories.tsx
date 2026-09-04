'use client';

import { CSSProperties, useRef, useState } from 'react';

const stories = [
  {
    school: 'Rutgers',
    name: 'Tony',
    feature: 'CAMPUS LIFE',
    quote: 'I was new to campus and just asked where people actually go to study late. I got useful answers right away.',
    detail: 'Ask the everyday campus questions that are hard to find in an orientation guide or scattered group chats.',
    request: 'Where do people actually study late near campus?',
    match: '8 students replied with spots + tips',
    result: 'Saved 3 places · met 1 classmate',
    tags: ['Local advice', 'New here', 'Campus spots'],
    image: 'https://images.pexels.com/photos/7683887/pexels-photo-7683887.jpeg?auto=compress&cs=tinysrgb&w=900'
  },
  {
    school: 'Berkeley',
    name: 'Joyi',
    feature: 'MOVE-IN HELP',
    quote: 'I needed help moving a desk into my place and found students nearby who could help me that afternoon.',
    detail: 'Post practical move-in or moving requests and find students close by who can actually show up.',
    request: 'Need help carrying a desk upstairs this afternoon.',
    match: '3 nearby students were available',
    result: 'Move finished · new connection made',
    tags: ['Moving', 'Nearby help', 'Today'],
    image: 'https://images.pexels.com/photos/7683700/pexels-photo-7683700.jpeg?auto=compress&cs=tinysrgb&w=900'
  },
  {
    school: 'UC Davis',
    name: 'Lihui',
    feature: 'RIDES',
    quote: 'I found another Davis student heading the same way and split the ride instead of figuring everything out by myself.',
    detail: 'Coordinate airport rides, carpools, pickups, and the random transportation needs that come with college life.',
    request: 'Anyone heading to the airport Friday morning?',
    match: '2 students were going the same way',
    result: 'Ride shared · cost split',
    tags: ['Airport', 'Carpool', 'Split cost'],
    image: 'https://images.pexels.com/photos/7972533/pexels-photo-7972533.jpeg?auto=compress&cs=tinysrgb&w=900'
  },
  {
    school: 'Purdue',
    name: 'Nathan',
    feature: 'PROJECTS',
    quote: 'I needed someone who knew design for a weekend project and found another Purdue student who wanted to build too.',
    detail: 'Find teammates, designers, coders, and collaborators for projects, hackathons, startups, and class ideas.',
    request: 'Need a designer for a weekend AI project.',
    match: '5 builders matched across majors',
    result: 'Team formed · project started',
    tags: ['Hackathon', 'Design', 'Build together'],
    image: 'https://images.pexels.com/photos/7972544/pexels-photo-7972544.jpeg?auto=compress&cs=tinysrgb&w=900'
  },
  {
    school: 'Purdue',
    name: 'Ryan',
    feature: 'CLASSMATES',
    quote: 'I found classmates from my course who helped me figure things out and study with me before the exam.',
    detail: 'Find people taking the same classes, ask quick questions, and turn one request into a study group or familiar face.',
    request: 'Anyone in my class want to review before the exam?',
    match: '4 classmates joined the thread',
    result: 'Study group made · questions answered',
    tags: ['Same class', 'Study group', 'Exam prep'],
    image: 'https://images.pexels.com/photos/7973095/pexels-photo-7973095.jpeg?auto=compress&cs=tinysrgb&w=900'
  }
];

export default function CampusStories() {
  const railRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(0);
  const [pointer, setPointer] = useState({ x: 50, y: 45 });
  const story = stories[active];

  function goTo(index: number) {
    const next = (index + stories.length) % stories.length;
    setActive(next);
    const rail = railRef.current;
    const card = rail?.querySelector<HTMLElement>(`[data-story="${next}"]`);
    card?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }

  const style = {
    '--stories-x': `${pointer.x}%`,
    '--stories-y': `${pointer.y}%`
  } as CSSProperties;

  return (
    <section
      id="features"
      className="campusStories"
      style={style}
      onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        setPointer({
          x: ((event.clientX - rect.left) / rect.width) * 100,
          y: ((event.clientY - rect.top) / rect.height) * 100
        });
      }}
    >
      <div className="storyBgWords" aria-hidden="true"><span>ASK</span><span>CAMPUS</span><span>CONNECT</span></div>
      <div className="storyDoodles" aria-hidden="true">
        <span className="doodleA">need a ride?</span>
        <span className="doodleB">study tonight ↗</span>
        <span className="doodleC">new here?</span>
        <span className="doodleD">build something ✦</span>
      </div>

      <div className="campusStoriesTop shell">
        <div>
          <p className="eyebrow">THIS IS ASPIRE IN REAL COLLEGE LIFE</p>
          <h2>Ask campus.<br /><span>See what happens.</span></h2>
          <p className="storiesLead">One request can turn into help, classmates, a ride, a teammate, or just one less thing to figure out alone.</p>
        </div>
        <div className="storyControls" aria-label="Campus story controls">
          <button type="button" onClick={() => goTo(active - 1)} aria-label="Previous story">←</button>
          <span>{String(active + 1).padStart(2, '0')} / {String(stories.length).padStart(2, '0')}</span>
          <button type="button" onClick={() => goTo(active + 1)} aria-label="Next story">→</button>
        </div>
      </div>

      <div className="storyUseCases shell" aria-label="Explore Aspire use cases">
        {stories.map((item, index) => (
          <button
            type="button"
            key={item.feature}
            className={active === index ? 'active' : ''}
            onClick={() => goTo(index)}
          >
            <i />{item.feature}
          </button>
        ))}
      </div>

      <div className="aspireAction shell" aria-live="polite">
        <div className="actionIntro">
          <span>WHAT ASPIRE DOES</span>
          <strong>{story.feature}</strong>
          <p>{story.detail}</p>
        </div>
        <div className="actionStep">
          <b>01</b><span>ASK</span><strong>{story.request}</strong>
        </div>
        <div className="actionArrow">→</div>
        <div className="actionStep">
          <b>02</b><span>MATCH</span><strong>{story.match}</strong>
        </div>
        <div className="actionArrow">→</div>
        <div className="actionStep actionResult">
          <b>03</b><span>CONNECT</span><strong>{story.result}</strong>
        </div>
      </div>

      <div className="campusStoryRail" ref={railRef}>
        {stories.map((item, index) => (
          <article
            className={active === index ? 'campusStoryCard active' : 'campusStoryCard'}
            key={`${item.name}-${item.school}`}
            data-story={index}
            tabIndex={0}
            onClick={() => setActive(index)}
            onFocus={() => setActive(index)}
          >
            <img src={item.image} alt={`College students on campus — ${item.feature.toLowerCase()} example`} />
            <div className="storyShade" />
            <div className="storyFeature">{item.feature}</div>
            <div className="storyCardHint">TAP TO EXPLORE ↗</div>
            <div className="storyQuote">
              <span>{item.name} @ {item.school}</span>
              <strong>“{item.quote}”</strong>
              <div className="storyTags">{item.tags.map((tag) => <em key={tag}>{tag}</em>)}</div>
            </div>
          </article>
        ))}
      </div>

      <div className="campusStoriesBottom shell">
        <p><strong>Post what you need.</strong> Aspire helps the right students find it — then you take it from there.</p>
        <small>Prototype student stories shown as example copy for the concept — replace with real testimonials as Aspire grows.</small>
      </div>
    </section>
  );
}
