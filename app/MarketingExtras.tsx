'use client';

const collegeStats = [
  {
    value: '16.4M',
    label: 'U.S. undergraduates enrolled in fall 2024',
    source: 'NCES · 2024',
    href: 'https://nces.ed.gov/programs/digest/d25/tables/dt25_303.70.asp'
  },
  {
    value: '42.4%',
    label: 'of full-time college students ages 16–24 were in the labor force',
    source: 'U.S. BLS · 2022',
    href: 'https://www.bls.gov/opub/ted/2023/labor-force-participation-rates-of-college-students-differ-by-enrollment-status-and-type-of-college.htm'
  },
  {
    value: '$27.8K',
    label: 'average public 4-year cost for students living off campus, not with family',
    source: 'NCES / IPEDS · 2022–23',
    href: 'https://nces.ed.gov/programs/coe/indicator/cua/undergrad-costs'
  }
];

const whyRows = [
  { old: 'Scattered group chats', aspire: 'One campus network', icon: '◎', note: 'Requests + people + context' },
  { old: 'Anyone on the internet', aspire: 'Verified campus identity', icon: '✓', note: 'Home campus stays attached' },
  { old: 'First reply wins', aspire: 'Both sides choose', icon: '⇄', note: 'Mutual before chat opens' },
  { old: 'Context disappears', aspire: 'History builds trust', icon: '↗', note: 'Connections become your Circle' }
];

export default function MarketingExtras() {
  return (
    <>
      <section className="marketingWhy marketingWhyRefined" id="why-aspire">
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

          <div className="whyAspireCard" data-reveal="right">
            <div className="whyPanelHead"><small>ON ASPIRE</small><span>ONE CLEAR FLOW</span></div>
            {whyRows.map((row, index) => (
              <div className={`whyRow revealDelay${index}`} key={row.aspire}>
                <i>{row.icon}</i>
                <span><del>{row.old}</del><b>{row.aspire}</b><small>{row.note}</small></span>
              </div>
            ))}
            <div className="whyIdentityStamp"><span>HOME CAMPUS</span><strong>VERIFIED ✓</strong><small>Location adds context. It never rewrites who you are.</small></div>
          </div>
        </div>

        <div className="whyWalkerLane" aria-hidden="true">
          <span className="whyWalkLabel">CAMPUS, IN MOTION →</span>
          <span className="whyWalkPath" />
          <div className="whyWalker">
            <svg viewBox="0 0 80 110" role="img">
              <circle cx="42" cy="17" r="10" />
              <path d="M41 29c-3 11-4 22-2 34m1-27 19 17m-20-12-18 16m18 6-15 31m16-31 20 29" />
              <path className="whyWalkerBag" d="M54 45c9 3 12 9 10 20l-15 1-2-19z" />
            </svg>
          </div>
          <span className="whyWalkDot dot1" /><span className="whyWalkDot dot2" /><span className="whyWalkDot dot3" />
        </div>
      </section>

      <section className="marketingSafetyStage" id="safety">
        <div className="safetyBackdrop" aria-hidden="true" />
        <div className="safetyHeadline" data-reveal="up">
          <p>BUILT FOR REAL-WORLD CONNECTIONS</p>
          <h2>Verified. Mutual. <em>Safer.</em></h2>
        </div>

        <div className="safetyObjects safetyObjectsEcosystem">
          <a href="/profile" className="safetyObject safetyVerified" data-reveal="left">
            <div className="safetySeal">✓</div><small>01</small><strong>Campus Verified</strong><span>Your school email establishes your home-campus identity.</span>
          </a>
          <a href="/profile" className="safetyObject safetyIdentity" data-reveal="pop">
            <div className="safetyShield">ID</div><small>02</small><strong>ID Verified</strong><span>Optional government-ID verification for higher-trust situations.</span>
          </a>
          <a href="/safety" className="safetyObject safetyMutual" data-reveal="pop">
            <div className="safetyPolaroid">YOU ⇄ THEM</div><small>03</small><strong>Mutual connect</strong><span>A response is not a deal. Both sides choose.</span>
          </a>
          <a href="/profile" className="safetyObject safetyControl" data-reveal="right">
            <div className="safetyShield">02</div><small>04</small><strong>Two-step security</strong><span>Optional MFA adds a second factor after your password.</span>
          </a>
        </div>

        <a className="safetyMore" href="/safety" data-reveal="up">Open Safety Center →</a>
      </section>

      <section className="marketingDataMini">
        <div className="dataMiniHead" data-reveal="left">
          <p>COLLEGE, IN REAL NUMBERS</p><h2>A little context.</h2><span>Official U.S. data.</span>
        </div>
        <div className="dataMiniCollage">
          {collegeStats.map((stat, index) => (
            <a className={`dataMiniNote dataMiniNote${index + 1}`} data-reveal={index === 1 ? 'pop' : index === 0 ? 'left' : 'right'} href={stat.href} target="_blank" rel="noreferrer" key={stat.value}>
              <strong>{stat.value}</strong><p>{stat.label}</p><span>{stat.source} ↗</span>
            </a>
          ))}
          <div className="dataMiniScribble" aria-hidden="true">REAL LIFE<br />IS BUSY ↗</div>
        </div>
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
