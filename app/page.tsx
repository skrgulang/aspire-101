import { aspireLogo } from './logo';

const pathways = [
  {
    number: '01',
    label: 'LEARN',
    title: 'Know what to learn next.',
    copy: 'Turn a goal into a clearer path with relevant resources, peers, and context.'
  },
  {
    number: '02',
    label: 'CONNECT',
    title: 'Find people with shared momentum.',
    copy: 'Meet collaborators, mentors, study partners, and people moving in a similar direction.'
  },
  {
    number: '03',
    label: 'BUILD',
    title: 'Move from interest to experience.',
    copy: 'Discover projects, teams, and opportunities to make something real beyond the classroom.'
  },
  {
    number: '04',
    label: 'LAUNCH',
    title: 'See the next door before it closes.',
    copy: 'Surface internships, research, programs, competitions, and other high-signal opportunities.'
  }
];

const logoStyle = {
  width: 34,
  height: 34,
  borderRadius: 10,
  objectFit: 'cover' as const,
  boxShadow: '0 0 0 1px rgba(255,255,255,.10), 0 8px 24px rgba(0,0,0,.22)'
};

export default function Home() {
  return (
    <main>
      <header className="nav shell">
        <a className="brand" href="#top" aria-label="Aspire 101 home">
          <img src={aspireLogo} alt="" style={logoStyle} />
          <span>Aspire 101</span>
        </a>
        <nav className="navLinks" aria-label="Primary navigation">
          <a href="#idea">Why Aspire</a>
          <a href="#pathways">What you can do</a>
          <a href="#about">About</a>
        </nav>
        <div className="navActions">
          <a className="textLink" href="/login">Log in</a>
          <a className="button buttonPrimary" href="/signup">Join Aspire <span>↗</span></a>
        </div>
      </header>

      <section id="top" className="hero shell">
        <div className="heroGrid" aria-hidden="true" />
        <div className="heroCopyBlock">
          <p className="kicker"><span /> BUILT FOR STUDENT MOMENTUM</p>
          <h1>Turn ambition<br />into <span>momentum.</span></h1>
          <p className="heroCopy">
            Aspire helps students discover the right people, knowledge, projects, and opportunities for what they want to do next.
          </p>
          <div className="heroCta">
            <a className="button buttonPrimary" href="/signup">Start your Aspire <span>↗</span></a>
            <a className="quietLink" href="#idea">See the idea <span>↓</span></a>
          </div>
          <div className="heroNote">
            <strong>One goal.</strong>
            <span>Useful next steps, not more noise.</span>
          </div>
        </div>

        <div className="compass" id="product">
          <div className="compassHeader">
            <span>ASPIRE COMPASS</span>
            <span className="livePill">YOUR NEXT MOVE</span>
          </div>
          <div className="goalNode">
            <small>CURRENT GOAL</small>
            <strong>I want to break into AI.</strong>
            <span>Finding high-signal paths…</span>
          </div>
          <div className="orbit orbitOne" />
          <div className="orbit orbitTwo" />
          <div className="signal signalLearn"><b>LEARN</b><span>ML roadmap</span></div>
          <div className="signal signalPeople"><b>PEOPLE</b><span>12 relevant peers</span></div>
          <div className="signal signalBuild"><b>BUILD</b><span>3 open projects</span></div>
          <div className="signal signalLaunch"><b>NEXT</b><span>5 opportunities</span></div>
          <div className="compassFooter">
            <span>◉ Personalized around your direction</span>
            <span>01 / 04</span>
          </div>
        </div>
      </section>

      <section id="idea" className="idea shell">
        <div className="ideaIntro">
          <p className="sectionLabel">THE IDEA</p>
          <h2>Aspire is not another feed.</h2>
        </div>
        <div className="ideaSteps">
          <article><span>01</span><p>Tell Aspire where you want to go.</p></article>
          <article><span>02</span><p>See people, paths, projects, and opportunities that actually relate.</p></article>
          <article><span>03</span><p>Choose the next move that creates momentum.</p></article>
        </div>
      </section>

      <section id="pathways" className="pathways shell">
        <div className="pathwayHeading">
          <p className="sectionLabel">ONE SYSTEM · FOUR DIRECTIONS</p>
          <h2>Whatever your next move is, start closer to it.</h2>
        </div>
        <div className="pathwayList">
          {pathways.map((item) => (
            <article className="pathway" key={item.number}>
              <span className="pathwayNumber">{item.number}</span>
              <span className="pathwayLabel">{item.label}</span>
              <h3>{item.title}</h3>
              <p>{item.copy}</p>
              <a href="/signup" aria-label={`Explore ${item.label}`}>↗</a>
            </article>
          ))}
        </div>
      </section>

      <section className="statement shell">
        <div className="statementLine"><span>Not more scrolling.</span><strong>More direction.</strong></div>
        <div className="statementLine"><span>Not more contacts.</span><strong>Better connections.</strong></div>
        <div className="statementLine"><span>Not more tabs.</span><strong>One place to move forward.</strong></div>
      </section>

      <section id="about" className="finalCta shell">
        <div className="finalOrb" aria-hidden="true">
          <img src={aspireLogo} alt="" style={{ width: 78, height: 78, borderRadius: 22, objectFit: 'cover', opacity: .92, boxShadow: '0 24px 70px rgba(0,0,0,.32)' }} />
        </div>
        <p className="sectionLabel">YOUR NEXT MOVE STARTS HERE</p>
        <h2>What do you want<br />to do <span>next?</span></h2>
        <p>Start with a direction. Aspire helps you find momentum.</p>
        <a className="button buttonPrimary" href="/signup">Join Aspire <span>↗</span></a>
      </section>

      <footer className="footer shell">
        <a className="brand" href="#top"><img src={aspireLogo} alt="" style={logoStyle} /><span>Aspire 101</span></a>
        <p>Learn · Connect · Build · Launch</p>
        <div>
          <a href="#idea">Why Aspire</a>
          <a href="#pathways">What you can do</a>
          <a href="/about">About</a>
        </div>
      </footer>
    </main>
  );
}
