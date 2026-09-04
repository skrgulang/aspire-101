'use client';

import { useRef, useState } from 'react';

const stories = [
  {
    school: 'Rutgers',
    name: 'Tony',
    feature: 'CAMPUS LIFE',
    quote: 'I was new to campus and just asked where people actually go to study late. I got useful answers right away.',
    detail: 'Ask the everyday campus questions that are hard to find in an orientation guide or scattered group chats.',
    image: 'https://images.pexels.com/photos/7683887/pexels-photo-7683887.jpeg?auto=compress&cs=tinysrgb&w=900'
  },
  {
    school: 'Berkeley',
    name: 'Joyi',
    feature: 'MOVE-IN HELP',
    quote: 'I needed help moving a desk into my place and found students nearby who could help me that afternoon.',
    detail: 'Post practical move-in or moving requests and find students close by who can actually show up.',
    image: 'https://images.pexels.com/photos/7683700/pexels-photo-7683700.jpeg?auto=compress&cs=tinysrgb&w=900'
  },
  {
    school: 'UC Davis',
    name: 'Lihui',
    feature: 'RIDES',
    quote: 'I found another Davis student heading the same way and split the ride instead of figuring everything out by myself.',
    detail: 'Coordinate airport rides, carpools, pickups, and the random transportation needs that come with college life.',
    image: 'https://images.pexels.com/photos/7972533/pexels-photo-7972533.jpeg?auto=compress&cs=tinysrgb&w=900'
  },
  {
    school: 'Purdue',
    name: 'Nathan',
    feature: 'PROJECTS',
    quote: 'I needed someone who knew design for a weekend project and found another Purdue student who wanted to build too.',
    detail: 'Find teammates, designers, coders, and collaborators for projects, hackathons, startups, and class ideas.',
    image: 'https://images.pexels.com/photos/7972544/pexels-photo-7972544.jpeg?auto=compress&cs=tinysrgb&w=900'
  },
  {
    school: 'Purdue',
    name: 'Ryan',
    feature: 'CLASSMATES',
    quote: 'I found classmates from my course who helped me figure things out and study with me before the exam.',
    detail: 'Find people taking the same classes, ask quick questions, and turn one request into a study group or familiar face.',
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
