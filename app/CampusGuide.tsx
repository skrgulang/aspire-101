'use client';

import { CSSProperties, useEffect, useState } from 'react';

const stops = [
  ['top', 'START'],
  ['nearby', 'REQUESTS'],
  ['journey', 'JOURNEY'],
  ['how', 'HOW IT WORKS'],
  ['features', 'STORIES'],
  ['home', 'WHY ASPIRE'],
  ['trust', 'TRUST'],
  ['ambassadors', 'AMBASSADORS'],
  ['faq', 'Q&A']
] as const;

export default function CampusGuide() {
  const [progress, setProgress] = useState(0);
  const [active, setActive] = useState(0);

  useEffect(() => {
    let frame = 0;

    const update = () => {
      frame = 0;
      const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const value = Math.max(0, Math.min(1, window.scrollY / maxScroll));
      const readingLine = window.scrollY + window.innerHeight * 0.42;
      let nextActive = 0;

      stops.forEach(([id], index) => {
        const element = document.getElementById(id);
        if (element && readingLine >= element.offsetTop - 80) nextActive = index;
      });

      setProgress(value);
      setActive(nextActive);
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

  function goTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const style = {
    '--guide-progress': `${progress * 100}%`,
    '--guide-y': `${3 + progress * 94}%`
  } as CSSProperties;

  return (
    <aside className="campusGuide show" style={style} aria-label="Aspire homepage journey navigation">
      <div className="campusGuideCurrent" aria-live="polite">
        <span>{String(active + 1).padStart(2, '0')} / {String(stops.length).padStart(2, '0')}</span>
        <strong>{stops[active][1]}</strong>
      </div>

      <div className="campusGuideTrack" aria-hidden="true"><i /></div>

      <div className="campusGuideStops">
        {stops.map(([id, label], index) => (
          <button
            key={id}
            type="button"
            className={active === index ? 'active' : ''}
            style={{ top: `${(index / (stops.length - 1)) * 100}%` }}
            onClick={() => goTo(id)}
            aria-label={`Go to ${label.toLowerCase()}`}
          />
        ))}
      </div>

      <div className="campusGuideWalker" aria-hidden="true">
        <span className="guideHead" />
        <span className="guideBody" />
        <span className="guideLeg guideLegA" />
        <span className="guideLeg guideLegB" />
      </div>
    </aside>
  );
}
