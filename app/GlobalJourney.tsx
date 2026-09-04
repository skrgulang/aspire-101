'use client';

import { CSSProperties, useEffect, useRef, useState } from 'react';

const chapters = [
  ['nearby', 'EXPLORE'],
  ['how', 'CONNECT'],
  ['features', 'STORIES'],
  ['home', 'WHY ASPIRE'],
  ['trust', 'TRUST'],
  ['ambassadors', 'CAMPUS'],
  ['faq', 'Q&A']
] as const;

const road = 'M 835 -40 C 970 105 785 205 650 245 C 505 290 235 315 285 455 C 335 590 835 545 760 690 C 685 835 230 760 320 915 C 390 1035 720 1015 835 1095';

export default function GlobalJourney() {
  const pathRef = useRef<SVGPathElement | null>(null);
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const [chapter, setChapter] = useState(0);
  const [walker, setWalker] = useState({ x: 83.5, y: 0, angle: 0 });

  useEffect(() => {
    let frame = 0;

    const update = () => {
      frame = 0;
      const start = document.getElementById('nearby');
      const end = document.getElementById('faq');
      if (!start || !end) return;

      const startY = start.offsetTop - window.innerHeight * 0.25;
      const endY = end.offsetTop + end.offsetHeight - window.innerHeight * 0.42;
      const focusY = window.scrollY + window.innerHeight * 0.48;
      const value = Math.max(0, Math.min(1, (focusY - startY) / Math.max(1, endY - startY)));

      setProgress(value);
      setVisible(focusY >= startY && focusY <= endY + window.innerHeight * 0.28);

      let nextChapter = 0;
      chapters.forEach(([id], index) => {
        const el = document.getElementById(id);
        if (el && focusY >= el.offsetTop - window.innerHeight * 0.18) nextChapter = index;
      });
      setChapter(nextChapter);

      const path = pathRef.current;
      if (path) {
        const length = path.getTotalLength();
        const point = path.getPointAtLength(length * value);
        const nearby = path.getPointAtLength(Math.min(length, length * value + 3));
        const angle = Math.atan2(nearby.y - point.y, nearby.x - point.x) * 180 / Math.PI;
        setWalker({ x: point.x / 10, y: point.y / 10, angle });
      }
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

  const style = {
    '--global-journey-progress': `${progress * 100}%`,
    '--global-walker-x': `${walker.x}%`,
    '--global-walker-y': `${walker.y}%`,
    '--global-walker-angle': `${walker.angle}deg`
  } as CSSProperties;

  function goTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className={visible ? 'globalJourney isVisible' : 'globalJourney'} style={style} aria-hidden={!visible}>
      <div className="globalJourneyGlow" />
      <svg className="globalJourneyRoad" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
        <path className="globalRoadHalo" d={road} />
        <path className="globalRoadBase" d={road} />
        <path
          ref={pathRef}
          className="globalRoadActive"
          pathLength="1"
          d={road}
          style={{ strokeDasharray: 1, strokeDashoffset: 1 - progress }}
        />
      </svg>

      <div className="globalWalker" aria-hidden="true">
        <span className="globalWalkerShadow" />
        <span className="globalWalkerHead" />
        <span className="globalWalkerBody" />
        <span className="globalWalkerArm armA" />
        <span className="globalWalkerArm armB" />
        <span className="globalWalkerLeg legA" />
        <span className="globalWalkerLeg legB" />
      </div>

      <nav className="globalJourneyNav" aria-label="Homepage journey">
        <div className="globalJourneyNow">
          <span>{String(chapter + 1).padStart(2, '0')} / {String(chapters.length).padStart(2, '0')}</span>
          <strong>{chapters[chapter][1]}</strong>
        </div>
        <div className="globalJourneyDots">
          {chapters.map(([id, label], index) => (
            <button
              type="button"
              key={id}
              className={index === chapter ? 'active' : index < chapter ? 'passed' : ''}
              onClick={() => goTo(id)}
              title={label}
              aria-label={`Go to ${label}`}
            ><i /></button>
          ))}
        </div>
      </nav>
    </div>
  );
}
