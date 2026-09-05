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
  { old: 'Scattered group chats', aspire: 'One campus network', icon: '◎' },
  { old: 'Anyone on the internet', aspire: 'School-based identity', icon: '✓' },
  { old: 'First reply wins', aspire: 'Both sides choose', icon: '⇄' },
  { old: 'Context disappears', aspire: 'Request history stays visible', icon: '↗' }
];

export default function MarketingExtras() {
  return (
    <>
      <section className="marketingWhy" id="why-aspire">
        <div className="whySticker" data-reveal="pop">WHY ASPIRE?</div>
        <div className="whyIntro" data-reveal="left">
          <p>LESS ASKING AROUND</p>
          <h2>Campus already helps itself.<br /><em>Aspire gives it one place.</em></h2>
          <span>Requests, people, and context stay together.</span>
        </div>

        <div className="whyCompare">
          <div className="whyOld" data-reveal="left">
            <small>THE USUAL WAY</small>
            <strong>DMs. Group chats. Random posts.</strong>
            <div className="whyMess" aria-hidden="true">
              <span>“anyone driving?”</span>
              <span>“who can help?”</span>
              <span>“is this still available?”</span>
              <span>“wait who are you?”</span>
            </div>
          </div>

          <div className="whyAspireCard" data-reveal="right">
            <small>ON ASPIRE</small>
            {whyRows.map((row, index) => (
              <div className={`whyRow revealDelay${index}`} key={row.aspire}>
                <i>{row.icon}</i>
                <span><del>{row.old}</del><b>{row.aspire}</b></span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="marketingSafetyStage" id="safety">
        <div className="safetyBackdrop" aria-hidden="true" />
        <div className="safetyHeadline" data-reveal="up">
          <p>BUILT FOR REAL-WORLD CONNECTIONS</p>
          <h2>Verified. Mutual. <em>Safer.</em></h2>
        </div>

        <div className="safetyObjects">
          <a href="/safety" className="safetyObject safetyVerified" data-reveal="left">
            <div className="safetySeal">✓</div>
            <small>01</small>
            <strong>School-based identity</strong>
            <span>Know the campus context behind the account.</span>
          </a>
          <a href="/safety" className="safetyObject safetyMutual" data-reveal="pop">
            <div className="safetyPolaroid">YOU ⇄ THEM</div>
            <small>02</small>
            <strong>Mutual connect</strong>
            <span>A response is not a deal. Both sides choose.</span>
          </a>
          <a href="/safety" className="safetyObject safetyControl" data-reveal="right">
            <div className="safetyShield">◇</div>
            <small>03</small>
            <strong>Report + block</strong>
            <span>Controls stay available before and after connecting.</span>
          </a>
        </div>

        <a className="safetyMore" href="/safety" data-reveal="up">Open Safety Center →</a>
      </section>

      <section className="marketingDataMini">
        <div className="dataMiniHead" data-reveal="left">
          <p>COLLEGE, IN REAL NUMBERS</p>
          <h2>A little context.</h2>
          <span>Official U.S. data.</span>
        </div>
        <div className="dataMiniCollage">
          {collegeStats.map((stat, index) => (
            <a className={`dataMiniNote dataMiniNote${index + 1}`} data-reveal={index === 1 ? 'pop' : index === 0 ? 'left' : 'right'} href={stat.href} target="_blank" rel="noreferrer" key={stat.value}>
              <strong>{stat.value}</strong>
              <p>{stat.label}</p>
              <span>{stat.source} ↗</span>
            </a>
          ))}
          <div className="dataMiniScribble" aria-hidden="true">REAL LIFE<br />IS BUSY ↗</div>
        </div>
      </section>

      <section className="marketingCommunityRules" id="community-rules">
        <div className="rulesCopy" data-reveal="left">
          <p>ONE CAMPUS. ONE STANDARD.</p>
          <h2>Be useful.<br /><em>Be respectful.</em></h2>
          <span>No scams. No harassment. No dangerous or illegal requests. Keep commitments and respect boundaries.</span>
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
