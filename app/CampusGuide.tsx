'use client';

import { CSSProperties, useEffect, useState } from 'react';

const stops = [
  ['nearby', 'NEAR YOU'],
  ['journey', 'REQUEST ROAD'],
  ['features', 'CAMPUS STORIES'],
  ['how', 'HOW IT WORKS'],
  ['home', 'WHY ASPIRE'],
  ['work-with-us', 'WORK WITH US'],
  ['faq', 'Q&A']
];

export default function CampusGuide() {
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const [label, setLabel] = useState('NEAR YOU');

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const start = document.getElementById('nearby');
      const end = document.getElementById('faq');
      if (!start || !end) return;
      const startY = start.offsetTop;
      const endY = end.offsetTop + end.offsetHeight - window.innerHeight * 0.65;
      const y = window.scrollY + window.innerHeight * 0.45;
      const value = Math.max(0, Math.min(1, (y - startY) / Math.max(1, endY - startY)));
      setProgress(value);
      setVisible(y >= startY && y <= endY + window.innerHeight * 0.7);

      let current = stops[0][1];
      for (const [id, nextLabel] of stops) {
        const el = document.getElementById(id);
        if (el && y >= el.offsetTop - 80) current = nextLabel;
      }
      setLabel(current);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const style = { '--guide-progress': `${progress * 100}%` } as CSSProperties;

  return (
    <aside className={visible ? 'campusGuide show' : 'campusGuide'} style={style} aria-hidden="true">
      <span className="campusGuideLabel">{label}</span>
      <div className="campusGuideTrack"><i /></div>
      <div className="campusGuideWalker">
        <span className="guideHead" />
        <span className="guideBody" />
        <span className="guideLeg guideLegA" />
        <span className="guideLeg guideLegB" />
      </div>
    </aside>
  );
}
