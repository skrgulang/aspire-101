'use client';

import { CSSProperties, useEffect, useMemo, useRef, useState } from 'react';

type RequestJourneyProps = {
  requestText: string;
};

const stages = [
  {
    kicker: '01 · POSTED',
    title: 'Your request starts moving.',
    copy: 'One post enters the campus network instead of disappearing into another group chat.'
  },
  {
    kicker: '02 · DISCOVERED',
    title: 'The right people start seeing it.',
    copy: 'Aspire brings the request closer to students who are nearby, relevant, or able to help.'
  },
  {
    kicker: '03 · RESPONSES',
    title: 'Replies turn into real options.',
    copy: 'Offers, people, and useful context gather around the original request as you move forward.'
  },
  {
    kicker: '04 · MATCHED',
    title: 'Choose the response that fits.',
    copy: 'The noise falls away. One useful connection moves to the center.'
  },
  {
    kicker: '05 · DONE',
    title: 'A request becomes momentum.',
    copy: 'The task gets handled — and sometimes the person who helped becomes part of your network.'
  }
];

export default function RequestJourney({ requestText }: RequestJourneyProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [progress, setProgress] = useState(0);
  const [pointer, setPointer] = useState({ x: 50, y: 45 });

  useEffect(() => {
    let frame = 0;

    const update = () => {
      frame = 0;
      const section = sectionRef.current;
      if (!section) return;

      const rect = section.getBoundingClientRect();
      const scrollable = Math.max(section.offsetHeight - window.innerHeight, 1);
      const value = Math.min(1, Math.max(0, -rect.top / scrollable));
      setProgress(value);
    };

    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  const stageIndex = useMemo(() => Math.min(4, Math.floor(progress * 5)), [progress]);
  const seen = progress < .22 ? 0 : Math.min(14, Math.floor((progress - .18) * 23));
  const matches = progress < .34 ? 0 : Math.min(5, Math.floor((progress - .30) * 9));
  const replies = progress < .48 ? 0 : Math.min(3, Math.floor((progress - .44) * 7));

  const style = {
    '--journey-progress': `${progress * 100}%`,
    '--journey-glow-x': `${pointer.x}%`,
    '--journey-glow-y': `${pointer.y}%`
  } as CSSProperties;

  return (
    <section
      ref={sectionRef}
      className="requestJourney"
      style={style}
      onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        setPointer({
          x: ((event.clientX - rect.left) / rect.width) * 100,
          y: ((event.clientY - rect.top) / rect.height) * 100
        });
      }}
    >
      <div className="journeySticky shell">
        <div className="journeyAmbient" aria-hidden="true" />

        <div className="journeyCopy">
          <p className="eyebrow">FOLLOW ONE REQUEST</p>
          <div className="journeyStageCounter">0{stageIndex + 1} / 05</div>
          <h2>{stages[stageIndex].title}</h2>
          <p>{stages[stageIndex].copy}</p>
          <div className="journeyStageLabel">{stages[stageIndex].kicker}</div>

          <div className="journeyStats">
            <div><strong>{seen}</strong><span>students reached</span></div>
            <div><strong>{matches}</strong><span>possible matches</span></div>
            <div><strong>{replies}</strong><span>replies</span></div>
          </div>
        </div>

        <div className="journeyCanvas" aria-label="A request moving through the Aspire network">
          <svg className="journeyRoad" viewBox="0 0 620 760" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
            <path className="journeyRoadBase" d="M120 62 C 465 48, 510 168, 330 230 S 92 322, 224 408 S 548 456, 438 565 S 170 610, 325 710" />
            <path
              className="journeyRoadActive"
              pathLength="1"
              d="M120 62 C 465 48, 510 168, 330 230 S 92 322, 224 408 S 548 456, 438 565 S 170 610, 325 710"
              style={{ strokeDasharray: 1, strokeDashoffset: 1 - progress }}
            />
          </svg>

          <div className="journeyRequestMover">
            <div className="journeyRequestCard">
              <span className="journeyCardTag">OPEN REQUEST</span>
              <strong>{requestText}</strong>
              <small>{progress > .82 ? 'Matched ✓' : progress > .40 ? `${replies} replies arriving` : 'Moving through campus…'}</small>
            </div>
          </div>

          <div className={`journeyNode nodeOne ${progress > .10 ? 'active' : ''}`}><i /><span>POSTED</span></div>
          <div className={`journeyNode nodeTwo ${progress > .28 ? 'active' : ''}`}><i /><span>SEEN</span></div>
          <div className={`journeyNode nodeThree ${progress > .47 ? 'active' : ''}`}><i /><span>REPLIES</span></div>
          <div className={`journeyNode nodeFour ${progress > .68 ? 'active' : ''}`}><i /><span>MATCH</span></div>
          <div className={`journeyNode nodeFive ${progress > .88 ? 'active' : ''}`}><i /><span>DONE</span></div>

          <article className={`journeyResponse responseA ${progress > .46 ? 'show' : ''} ${progress > .70 ? 'fade' : ''}`}>
            <div className="responseAvatar">M</div>
            <div><strong>Maya</strong><span>I can help around 4 PM — I have a dolly too.</span></div>
          </article>
          <article className={`journeyResponse responseB ${progress > .52 ? 'show' : ''} ${progress > .70 ? 'fade' : ''}`}>
            <div className="responseAvatar">A</div>
            <div><strong>Alex</strong><span>I’m nearby after class if you still need someone.</span></div>
          </article>
          <article className={`journeyResponse responseC ${progress > .58 ? 'show' : ''} ${progress > .70 ? 'fade' : ''}`}>
            <div className="responseAvatar">J</div>
            <div><strong>Jason</strong><span>Free tonight. Happy to help carry it upstairs.</span></div>
          </article>

          <div className={`journeyMatch ${progress > .72 ? 'show' : ''}`}>
            <div className="matchPulse" />
            <span>MATCHED WITH MAYA</span>
            <strong>Mini fridge move · 4:00 PM</strong>
          </div>

          <div className={`journeyDone ${progress > .91 ? 'show' : ''}`}>
            <span>REQUEST COMPLETE</span>
            <strong>Mini fridge moved.</strong>
            <small>You and Maya are now connected on Aspire.</small>
          </div>
        </div>
      </div>
    </section>
  );
}
