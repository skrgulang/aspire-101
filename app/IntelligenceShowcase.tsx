import { aspireLogo } from './logo';

const core = [
  {
    icon: '✦',
    name: 'Aspire Agent',
    status: 'BETA',
    title: 'Tell Aspire the outcome, not the form.',
    text: 'Write what you are trying to make happen in normal language. Aspire understands the intent, checks campus activity, and prepares the best next step.',
    example: '“My flight lands late and I need to get back to Purdue.”',
    href: '/campus'
  },
  {
    icon: '↗',
    name: 'Aspire Match',
    status: 'LIVE BETA',
    title: 'Find the people and requests that actually fit.',
    text: 'Matches use the need, category, campus context, timing and available request details to surface strong possibilities instead of only matching keywords.',
    example: 'Strong match · ORD → Purdue · tonight',
    href: '/discover?agent=1'
  },
  {
    icon: '+',
    name: 'Smart Post',
    status: 'LIVE BETA',
    title: 'Turn a messy thought into an editable request.',
    text: 'Aspire Agent can prepare a title, category, exchange type, details and money fields. You review every field before anything is submitted.',
    example: 'Intent → structured draft → your approval',
    href: '/post?agent=1'
  }
];

const intelligence = [
  {
    icon: '◎',
    name: 'Campus Pulse',
    status: 'ON DEMAND',
    text: 'Summarizes approved Aspire activity at the campus you are browsing — rides, study, market, projects and other emerging demand.'
  },
  {
    icon: '◇',
    name: 'Connection Copilot',
    status: 'OPT-IN',
    text: 'Reads the connection you choose and helps extract timing, location, money, unresolved questions and a suggested reply. It never sends for you.'
  },
  {
    icon: '◈',
    name: 'Safety Intelligence',
    status: 'ALWAYS ON',
    text: 'Combines policy checks, scam signals, trust data and moderation gates before risky or prohibited activity reaches the public campus feed.'
  },
  {
    icon: '⚑',
    name: 'Dispute Intelligence',
    status: 'REVIEWER TOOL',
    text: 'Organizes marketplace timelines, payment state, claims, evidence gaps and risk signals for a human moderator. It cannot decide refunds or payouts by itself.'
  },
  {
    icon: '∞',
    name: 'Outcome Learning',
    status: 'FOUNDATION',
    text: 'Tracks whether an AI plan became a draft, post, connection and completed outcome. This creates the foundation for better campus matching over time.'
  },
  {
    icon: '$',
    name: 'Price Assist',
    status: 'NEXT',
    text: 'A planned marketplace layer for explaining a reasonable campus price range using listing context and relevant Aspire activity — without pretending to know a universal market price.'
  }
];

export default function IntelligenceShowcase() {
  return (
    <main className="intelligencePage">
      <header className="intelligenceNav">
        <a href="/" className="intelligenceBrand" aria-label="Aspire 101 home"><img src={aspireLogo} alt="" /><strong>Aspire 101</strong></a>
        <nav><a href="/">Home</a><a href="/safety">Safety</a><a className="intelligenceOpen" href="/campus">Open Aspire →</a></nav>
      </header>

      <section className="intelligenceHero">
        <div className="intelligenceHeroCopy">
          <p>ASPIRE INTELLIGENCE · AI DRIVE</p>
          <h1>Your campus network,<br /><em>with an intelligence layer.</em></h1>
          <span>Aspire does not just show posts. It helps understand what you need, find the right path, and move the connection forward — while you stay in control.</span>
          <div className="intelligenceHeroActions"><a className="button buttonGold" href="/campus">Try Aspire Agent <b>✦</b></a><a href="#features">See every feature ↓</a></div>
        </div>

        <div className="intelligenceDemo" aria-label="Example Aspire Agent result">
          <div className="intelligenceDemoTop"><span><i>✦</i> ASPIRE AGENT</span><b>AI DRIVE · BETA</b></div>
          <blockquote>My flight lands in Chicago at 11:30 PM and I need to get back to Purdue.</blockquote>
          <div className="intelligenceUnderstood"><small>ASPIRE UNDERSTOOD</small><strong>Ride · Chicago → Purdue</strong><p>Late-night return to campus. Aspire should check existing ride activity first, then prepare a request if nothing fits.</p></div>
          <div className="intelligenceFacts"><span><b>WHEN</b>11:30 PM</span><span><b>TYPE</b>Ride</span><span><b>PATH</b>Match first</span></div>
          <div className="intelligenceMatch"><span>STRONG MATCH</span><strong>Students returning from Chicago tonight</strong><small>View campus possibilities →</small></div>
        </div>
      </section>

      <section className="intelligenceFlow" aria-label="Aspire Intelligence flow">
        <span>NEED</span><i>→</i><strong>UNDERSTAND</strong><i>→</i><strong>MATCH</strong><i>→</i><strong>ACT</strong><i>→</i><strong>CONNECT</strong><i>→</i><span>LEARN</span>
      </section>

      <section id="features" className="intelligenceCore">
        <div className="intelligenceSectionHead"><p>THE CORE LOOP</p><h2>Three AI features students can <em>feel immediately.</em></h2></div>
        <div className="intelligenceCoreGrid">
          {core.map((feature) => <article key={feature.name}>
            <div className="intelligenceFeatureTop"><i>{feature.icon}</i><span>{feature.status}</span></div>
            <small>{feature.name}</small><h3>{feature.title}</h3><p>{feature.text}</p><blockquote>{feature.example}</blockquote><a href={feature.href}>Open feature →</a>
          </article>)}
        </div>
      </section>

      <section className="intelligenceSystem">
        <div className="intelligenceSectionHead"><p>THE INTELLIGENCE LAYER</p><h2>AI across the <em>whole connection lifecycle.</em></h2></div>
        <div className="intelligenceSystemGrid">
          {intelligence.map((feature) => <article key={feature.name} className={feature.status === 'NEXT' ? 'isNext' : ''}>
            <div><i>{feature.icon}</i><span>{feature.status}</span></div><h3>{feature.name}</h3><p>{feature.text}</p>
          </article>)}
        </div>
      </section>

      <section className="intelligenceGuardrails">
        <div><p>HUMAN CONTROL</p><h2>AI proposes.<br /><em>People decide.</em></h2></div>
        <div className="intelligenceGuardrailList">
          <span><b>01</b> No AI-created post is published without the user reviewing and submitting it.</span>
          <span><b>02</b> No AI assistant sends a private message, confirms a connection, pays, refunds or releases money by itself.</span>
          <span><b>03</b> Safety and dispute systems support human review; they do not make irreversible decisions on their own.</span>
          <span><b>04</b> Campus Pulse describes Aspire activity, not the entire university population.</span>
        </div>
      </section>

      <section className="intelligenceBottom">
        <p>POWERED BY ASPIRE INTELLIGENCE</p><h2>One campus network.<br /><em>A smarter path from need to outcome.</em></h2><a className="button buttonGold" href="/campus">Open Aspire <span>→</span></a>
      </section>
    </main>
  );
}
