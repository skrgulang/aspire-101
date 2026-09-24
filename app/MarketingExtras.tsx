'use client';

import { useEffect, useRef, useState } from 'react';

const whyRows = [
  { old: 'Scattered group chats', aspire: 'One campus network', icon: '◎', note: 'Requests + people + context' },
  { old: 'Anyone on the internet', aspire: 'Verified campus identity', icon: '✓', note: 'Home campus stays attached' },
  { old: 'First reply wins', aspire: 'Both sides choose', icon: '⇄', note: 'Mutual before chat opens' },
  { old: 'Context disappears', aspire: 'History builds trust', icon: '↗', note: 'Connections become your Circle' }
];

function CampusWalkerBand() {
  return (
    <div className="campusMotionBand" aria-hidden="true">
      <span className="campusMotionLabel">CAMPUS, IN MOTION →</span>
      <span className="campusMotionPath" />
      <div className="campusMotionWalker">
        <svg viewBox="0 0 72 104" fill="none" aria-hidden="true">
          <g stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="40" cy="14" r="8" />
            <path d="M38 24c-5 12-7 24-4 36l5 16" />
            <path d="M35 38 19 53" />
            <path d="M36 38 54 48" />
            <path d="m39 76-15 21" />
            <path d="m40 76 17 19" />
            <path d="M28 31c-6 7-7 18-2 29" opacity=".72" />
            <rect x="16" y="35" width="12" height="26" rx="4" opacity=".55" />
          </g>
        </svg>
      </div>
    </div>
  );
}

export default function MarketingExtras() {
  const whyRef = useRef<HTMLElement | null>(null);
  const whyCardRef = useRef<HTMLDivElement | null>(null);
  const whyRowRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [activeWhyRow, setActiveWhyRow] = useState(-1);
  const [guideTop, setGuideTop] = useState(92);
  const safetyRef = useRef<HTMLElement | null>(null);
  const [safetyStep, setSafetyStep] = useState(-1);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const section = whyRef.current;
      if (!section) return;
      const sectionRect = section.getBoundingClientRect();
      const viewportFocus = window.innerHeight * 0.52;
      const inRange = sectionRect.top < window.innerHeight * 0.82 && sectionRect.bottom > window.innerHeight * 0.18;

      if (!inRange) {
        setActiveWhyRow(-1);
        return;
      }

      let closestIndex = -1;
      let closestDistance = Number.POSITIVE_INFINITY;
      whyRowRefs.current.forEach((row, index) => {
        if (!row) return;
        const rect = row.getBoundingClientRect();
        const center = rect.top + rect.height / 2;
        const distance = Math.abs(center - viewportFocus);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = index;
        }
      });
      setActiveWhyRow(closestIndex);
      const activeRow = closestIndex >= 0 ? whyRowRefs.current[closestIndex] : null;
      const card = whyCardRef.current;
      if (activeRow && card) {
        const rowRect = activeRow.getBoundingClientRect();
        const cardRect = card.getBoundingClientRect();
        setGuideTop(rowRect.top - cardRect.top + rowRect.height / 2);
      }
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

  useEffect(() => {
    let frame = 0;

    const updateSafetyJourney = () => {
      frame = 0;
      const section = safetyRef.current;
      if (!section) return;

      const rect = section.getBoundingClientRect();
      const viewportH = window.innerHeight;
      const startLine = viewportH * 0.82;
      const endLine = viewportH * 0.24;

      if (rect.top > startLine) {
        setSafetyStep(-1);
        return;
      }

      if (rect.bottom < endLine) {
        setSafetyStep(3);
        return;
      }

      const travel = Math.max(1, rect.height + startLine - endLine);
      const progress = Math.max(0, Math.min(0.999, (startLine - rect.top) / travel));
      const eased = Math.max(0, Math.min(0.999, (progress - 0.05) / 0.9));
      setSafetyStep(Math.min(3, Math.floor(eased * 4)));
    };

    const onSafetyScroll = () => {
      if (!frame) frame = requestAnimationFrame(updateSafetyJourney);
    };

    updateSafetyJourney();
    window.addEventListener('scroll', onSafetyScroll, { passive: true });
    window.addEventListener('resize', onSafetyScroll);
    return () => {
      window.removeEventListener('scroll', onSafetyScroll);
      window.removeEventListener('resize', onSafetyScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <>
      <section ref={whyRef} className="marketingWhy marketingWhyRefined" id="why-aspire">
        <div className="whyIntro" data-reveal="left">
          <div className="whyIntroTop"><p>LESS ASKING AROUND</p><span className="whySticker">WHY ASPIRE? ↗</span></div>
          <h2>Campus already helps itself.<br /><em>Aspire gives it one place.</em></h2>
          <span>Requests, people, identity, and context stay together — even when campus life moves.</span>
        </div>

        <div className="whyCompare whyCompareRefined">
          <div className="whyOld" data-reveal="left">
            <div className="whyPanelHead"><small>THE USUAL WAY</small><span>CHAOS, EVERYWHERE</span></div>
            <strong>DMs. Group chats. Random posts.</strong>
            <p>Useful people are already around you. Finding the right one is the messy part.</p>
            <div className="whyMess" aria-hidden="true">
              <span>“anyone driving?”</span>
              <span>“who can help?”</span>
              <span>“is this still available?”</span>
              <span>“wait who are you?”</span>
              <span>“which group chat?”</span>
              <span>“did you see my DM?”</span>
            </div>
            <div className="whyScribble" aria-hidden="true">ASK → WAIT → ASK AGAIN</div>
          </div>

          <div ref={whyCardRef} className="whyAspireCard" data-reveal="right">
            <div className="whyPanelHead"><small>ON ASPIRE</small><span>ONE CLEAR FLOW</span></div>
            {whyRows.map((row, index) => (
              <div ref={(node) => { whyRowRefs.current[index] = node; }} className={`whyRow revealDelay${index} ${activeWhyRow === index ? "whyRowActive" : ""}`} key={row.aspire}>
                <i>{row.icon}</i>
                <span><del>{row.old}</del><b>{row.aspire}</b><small>{row.note}</small></span>
              </div>
            ))}
            <div className="whyIdentityStamp"><span>HOME CAMPUS</span><strong>VERIFIED ✓</strong><small>Location adds context. It never rewrites who you are.</small></div>
          </div>

          <div className="whySideGuide" aria-hidden="true">
            <span className="whySideGuideLine" />
            <div className="whySideGuideDots">
              {whyRows.map((row, index) => <i key={row.aspire} className={activeWhyRow === index ? 'active' : ''} />)}
            </div>
            <div className={`whyGuideWalker ${activeWhyRow >= 0 ? 'show' : ''}`} style={{ top: guideTop }}>
              <span className="whyGuideHead" />
              <span className="whyGuideBody" />
              <span className="whyGuideArm a" />
              <span className="whyGuideArm b" />
              <span className="whyGuideLeg a" />
              <span className="whyGuideLeg b" />
            </div>
            <small className="whySideGuideStep">{activeWhyRow >= 0 ? `0${activeWhyRow + 1} / 04` : 'WHY ASPIRE'}</small>
          </div>
        </div>
      </section>

      <CampusWalkerBand />

      <section ref={safetyRef} className="marketingSafetyStage safetyJourneyStage" id="safety">
        <div className="safetyBackdrop" aria-hidden="true" />
        <div className="safetyHeadline" data-reveal="up">
          <p>BUILT FOR REAL-WORLD CONNECTIONS</p>
          <h2>Verified. Mutual. <em>Safer.</em></h2>
        </div>

        <div className="safetyObjects safetyObjectsEcosystem">
          {[
            { href: '/profile', className: 'safetyVerified', icon: <div className="safetySeal">✓</div>, step: '01', title: 'Campus Verified', copy: 'Your school email establishes your home-campus identity.' },
            { href: '/profile', className: 'safetyIdentity', icon: <div className="safetyShield">ID</div>, step: '02', title: 'ID Verified', copy: 'Optional government-ID verification for higher-trust situations.' },
            { href: '/safety', className: 'safetyMutual', icon: <div className="safetyPolaroid safetyMutualIcon" aria-hidden="true">⇄</div>, step: '03', title: 'Mutual connect', copy: 'A response is not a deal. Both sides choose.' },
            { href: '/profile', className: 'safetyControl', icon: <div className="safetyShield">04</div>, step: '04', title: 'Two-step security', copy: 'Optional MFA adds a second factor after your password.' }
          ].map((item, index) => {
            const state = index === safetyStep ? 'active' : index < safetyStep ? 'shown' : 'hidden';
            return (
              <a href={item.href} className={`safetyObject ${item.className} safetyJourney-${state}`} data-step={item.step} key={item.step}>
                {item.icon}<small>{item.step}</small><strong>{item.title}</strong><span>{item.copy}</span>
              </a>
            );
          })}
        </div>

        <a className="safetyMore" href="/safety" data-reveal="up">Open Safety Center →</a>
      </section>

      <section className="marketingCommunityRules" id="community-rules">
        <div className="rulesCopy" data-reveal="left">
          <p>ONE CAMPUS. ONE STANDARD.</p><h2>Be useful.<br /><em>Be respectful.</em></h2><span>No scams. No harassment. No dangerous or illegal requests. Keep commitments and respect boundaries.</span>
        </div>
        <div className="rulesLinks" data-reveal="right">
          <a href="/guidelines"><span>Community Guidelines</span><b>How members are expected to act →</b></a>
          <a href="/terms"><span>Terms of Service</span><b>The rules for using Aspire →</b></a>
          <a href="/privacy"><span>Privacy</span><b>What data we use and why →</b></a>
          <a href="/safety"><span>Safety Center</span><b>Report, block, and meet safely →</b></a>
        </div>
        <p className="rulesDiscipline" data-reveal="up">Reports can lead to warnings, feature restrictions, suspension, or removal depending on severity and repeat behavior.</p>
      </section>
    </>
  );
}
