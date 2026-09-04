'use client';

import { CSSProperties, useEffect, useMemo, useRef, useState } from 'react';

type RequestJourneyProps = {
  requestText: string;
};

const stages = [
  {
    kicker: '01 · ARRIVE',
    title: 'A new campus can feel huge.',
    copy: 'New room, new routes, new people. Aspire starts where that unfamiliar feeling usually begins: one small thing you need help with.'
  },
  {
    kicker: '02 · ASK',
    title: 'Start with one small request.',
    copy: 'A ride, a study partner, help moving in, advice, a teammate — ask normally and let the campus network do the rest.'
  },
  {
    kicker: '03 · DISCOVER',
    title: 'Campus starts answering back.',
    copy: 'Relevant students, replies, and useful local context begin showing up around the thing you asked for.'
  },
  {
    kicker: '04 · CONNECT',
    title: 'Help becomes a person you know.',
    copy: 'One useful response can become a teammate, a study buddy, a friend, or simply one more familiar face on campus.'
  },
  {
    kicker: '05 · BELONG',
    title: 'Campus starts feeling like home.',
    copy: 'The request gets handled, the place feels a little smaller, and you are no longer figuring everything out alone.'
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
          <p className="eyebrow">FOLLOW A STUDENT, NOT JUST A REQUEST</p>
          <div className="journeyStageCounter">0{stageIndex + 1} / 05</div>
          <h2>{stages[stageIndex].title}</h2>
          <p>{stages[stageIndex].copy}</p>
          <div className="journeyStageLabel">{stages[stageIndex].kicker}</div>

          <div className="journeyStats">
            <div><strong>{seen}</strong><span>students around you</span></div>
            <div><strong>{matches}</strong><span>possible matches</span></div>
            <div><strong>{replies}</strong><span>replies</span></div>
          </div>
        </div>

        <div className="journeyCanvas" aria-label="A student and request moving through the Aspire campus network">
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
            <div className="journeyTraveler">
              <div className="aspireWalker" aria-hidden="true">
                <div className="walkerFigure">
                  <div className="walkerHair" />
                  <div className="walkerHead" />
                  <div className="walkerBackpack" />
                  <div className="walkerTorso" />
                  <div className="walkerArm walkerArmA" />
                  <div className="walkerArm walkerArmB" />
                  <div className="walkerLeg walkerLegA" />
                  <div className="walkerLeg walkerLegB" />
                </div>
                <div className="walkerShadow" />
                <span className="walkerTag">{stageIndex === 4 ? 'HOME' : 'YOU'}</span>
              </div>

              <div className="journeyRequestCard">
                <span className="journeyCardTag">YOUR REQUEST</span>
                <strong>{requestText}</strong>
                <small>{progress > .82 ? 'Matched ✓' : progress > .40 ? `${replies} replies arriving` : progress > .18 ? 'Moving through campus…' : 'First day, first ask'}</small>
              </div>
            </div>
          </div>

          <div className={`journeyNode nodeOne ${progress > .08 ? 'active' : ''}`}><i /><span>ARRIVE</span></div>
          <div className={`journeyNode nodeTwo ${progress > .24 ? 'active' : ''}`}><i /><span>ASK</span></div>
          <div className={`journeyNode nodeThree ${progress > .44 ? 'active' : ''}`}><i /><span>DISCOVER</span></div>
          <div className={`journeyNode nodeFour ${progress > .66 ? 'active' : ''}`}><i /><span>CONNECT</span></div>
          <div className={`journeyNode nodeFive ${progress > .88 ? 'active' : ''}`}><i /><span>HOME</span></div>

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
            <span>CONNECTED WITH MAYA</span>
            <strong>Mini fridge move · 4:00 PM</strong>
          </div>

          <div className={`journeyDone ${progress > .91 ? 'show' : ''}`}>
            <span>HOME FEELS CLOSER</span>
            <strong>One less thing to figure out alone.</strong>
            <small>The mini fridge got moved. You and Maya are now connected on Aspire.</small>
          </div>
        </div>

        <div className={`journeyScrollCue ${progress > .94 ? 'isDone' : ''}`} aria-hidden="true">
          <span>{progress < .08 ? 'SCROLL TO START WALKING' : progress < .88 ? 'KEEP SCROLLING' : 'ALMOST HOME'}</span>
          <i />
          <b>{Math.round(progress * 100)}%</b>
        </div>
      </div>
    </section>
  );
}
