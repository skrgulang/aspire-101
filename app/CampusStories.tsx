'use client';

import { useRef, useState } from 'react';

const stories = [
  {
    school: 'Berkeley',
    name: 'Mia',
    feature: 'MOVE-IN HELP',
    quote: 'I moved in yesterday and had someone help carry a desk upstairs in like 15 minutes.',
    detail: 'Post practical campus help and find students nearby who can actually show up.',
    image: 'https://images.pexels.com/photos/7683887/pexels-photo-7683887.jpeg?auto=compress&cs=tinysrgb&w=900'
  },
  {
    school: 'Purdue',
    name: 'Noah',
    feature: 'STUDY',
    quote: 'Found a study buddy in one post instead of asking five different group chats.',
    detail: 'Find tutors, study partners, course advice, and people taking the same classes.',
    image: 'https://images.pexels.com/photos/7683700/pexels-photo-7683700.jpeg?auto=compress&cs=tinysrgb&w=900'
  },
  {
    school: 'UCLA',
    name: 'Ari',
    feature: 'RIDES',
    quote: 'Split a ride to the airport with two students from campus. Way easier than figuring it out alone.',
    detail: 'Coordinate airport rides, carpools, pickups, and everyday student logistics.',
    image: 'https://images.pexels.com/photos/7972533/pexels-photo-7972533.jpeg?auto=compress&cs=tinysrgb&w=900'
  },
  {
    school: 'USC',
    name: 'Jordan',
    feature: 'PROJECTS',
    quote: 'Needed a designer for a hackathon and met someone from another major that same night.',
    detail: 'Recruit teammates, collaborators, coders, designers, and builders around campus.',
    image: 'https://images.pexels.com/photos/7972544/pexels-photo-7972544.jpeg?auto=compress&cs=tinysrgb&w=900'
  },
  {
    school: 'UCSD',
    name: 'Sofia',
    feature: 'CAMPUS LIFE',
    quote: 'The best part is I can just ask the random campus question I would normally keep to myself.',
    detail: 'Ask for local advice, places, people, and the little things that help campus feel familiar.',
    image: 'https://images.pexels.com/photos/7973095/pexels-photo-7973095.jpeg?auto=compress&cs=tinysrgb&w=900'
  }
];

export default function CampusStories() {
  const railRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(0);

  function move(direction: number) {
    const next = (active + direction + stories.length) % stories.length;
    setActive(next);
    const rail = railRef.current;
    const card = rail?.querySelector<HTMLElement>(`[data-story="${next}"]`);
    card?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }

  return (
    <section id="features" className="campusStories">
      <div className="campusStoriesTop shell">
        <div>
          <p className="eyebrow">REAL CAMPUS MOMENTS</p>
          <h2>One app for the little things that make college feel easier.</h2>
        </div>
        <div className="storyControls" aria-label="Campus story controls">
          <button type="button" onClick={() => move(-1)} aria-label="Previous story">←</button>
          <span>{String(active + 1).padStart(2, '0')} / {String(stories.length).padStart(2, '0')}</span>
          <button type="button" onClick={() => move(1)} aria-label="Next story">→</button>
        </div>
      </div>

      <div className="campusStoryRail" ref={railRef}>
        {stories.map((story, index) => (
          <article
            className={active === index ? 'campusStoryCard active' : 'campusStoryCard'}
            key={`${story.name}-${story.school}`}
            data-story={index}
            tabIndex={0}
            onClick={() => setActive(index)}
            onFocus={() => setActive(index)}
          >
            <img src={story.image} alt={`College students on campus — ${story.feature.toLowerCase()} example`} />
            <div className="storyShade" />
            <div className="storyFeature">{story.feature}</div>
            <div className="storyQuote">
              <span>{story.name} @ {story.school}</span>
              <strong>“{story.quote}”</strong>
              <p>{story.detail}</p>
            </div>
          </article>
        ))}
      </div>

      <div className="campusStoriesBottom shell">
        <p>Requests can be practical, academic, social, or completely random. Aspire gives students one place to ask and one campus network to answer.</p>
        <small>Prototype student stories shown as example copy for the concept — replace with real testimonials as Aspire grows.</small>
      </div>
    </section>
  );
}
