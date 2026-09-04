const campus = ['UC Berkeley', 'Purdue', 'UCI', 'USC', 'UCLA'];

const pillars = [
  {
    eyebrow: 'LEARN',
    title: 'Turn goals into a path.',
    copy: 'Find the right resources, study circles, and people for what you want to learn next.'
  },
  {
    eyebrow: 'CONNECT',
    title: 'Meet people who move you forward.',
    copy: 'Discover classmates, mentors, collaborators, and communities around your campus.'
  },
  {
    eyebrow: 'BUILD',
    title: 'Make something real.',
    copy: 'Join projects, find teammates, and create a portfolio beyond the classroom.'
  },
  {
    eyebrow: 'LAUNCH',
    title: 'Find your next opportunity.',
    copy: 'Explore internships, research, accelerators, and student opportunities in one place.'
  }
];

export default function Home() {
  return (
    <main>
      <header className="nav shell">
        <a className="brand" href="#top" aria-label="Aspire 101 home">
          <span className="brandMark">A</span>
          <span>Aspire 101</span>
        </a>
        <nav className="navLinks" aria-label="Primary navigation">
          <a href="#product">Product</a>
          <a href="#how">How it works</a>
          <a href="#campus">Campus</a>
          <a href="#schools">For schools</a>
        </nav>
        <div className="navActions">
          <a className="textLink" href="/login">Log in</a>
          <a className="button buttonLight" href="/signup">Join Aspire</a>
        </div>
      </header>

      <section id="top" className="hero shell">
        <div className="heroGlow heroGlowOne" />
        <div className="heroGlow heroGlowTwo" />
        <p className="kicker">THE STUDENT NETWORK FOR WHAT COMES NEXT.</p>
        <h1>
          Find your people.
          <br />
          Build your <em>future.</em>
        </h1>
        <p className="heroCopy">
          Aspire connects students with the people, knowledge, projects, and opportunities that help them move forward.
        </p>
        <div className="heroCta">
          <a className="button buttonAccent" href="/signup">Join with your school email</a>
          <a className="quietLink" href="#how">See how it works <span>↗</span></a>
        </div>
        <p className="micro">Built for college students · School email verification</p>

        <div className="goalCard" id="product">
          <div className="goalTopline">
            <span>YOUR GOAL</span>
            <span className="statusDot">Live preview</span>
          </div>
          <p className="goalPrompt">“I want to break into AI.”</p>
          <div className="resultGrid">
            <article>
              <span>LEARN</span>
              <strong>Machine learning path</strong>
              <p>Python · Linear algebra · Intro ML</p>
            </article>
            <article>
              <span>CONNECT</span>
              <strong>12 relevant students</strong>
              <p>Peers learning or building in AI</p>
            </article>
            <article>
              <span>BUILD</span>
              <strong>3 student projects</strong>
              <p>Open roles for new contributors</p>
            </article>
            <article>
              <span>LAUNCH</span>
              <strong>5 opportunities</strong>
              <p>Internships · research · hackathons</p>
            </article>
          </div>
        </div>
      </section>

      <section id="campus" className="socialProof shell">
        <p>Built for ambitious students across campus communities.</p>
        <div className="campusRow">
          {campus.map((school) => <span key={school}>{school}</span>)}
        </div>
      </section>

      <section id="how" className="manifesto shell">
        <p className="sectionLabel">ONE PLATFORM, FOUR WAYS FORWARD.</p>
        <h2>College gives you a campus. Aspire helps you use it.</h2>
        <div className="pillarGrid">
          {pillars.map((pillar) => (
            <article className="pillar" key={pillar.eyebrow}>
              <span>{pillar.eyebrow}</span>
              <h3>{pillar.title}</h3>
              <p>{pillar.copy}</p>
              <a href="/signup">Explore <span>↗</span></a>
            </article>
          ))}
        </div>
      </section>

      <section id="schools" className="campusPanel shell">
        <div>
          <p className="sectionLabel">VERIFIED CAMPUS COMMUNITIES</p>
          <h2>Your school becomes your network.</h2>
          <p>Use your school email to join a trusted campus layer designed around learning, collaboration, and opportunity.</p>
        </div>
        <div className="emailCard">
          <label htmlFor="school-email">School email</label>
          <div className="emailRow">
            <input id="school-email" placeholder="you@school.edu" type="email" />
            <a className="button buttonAccent" href="/signup">Continue</a>
          </div>
          <small>We use your school email to verify your campus identity.</small>
        </div>
      </section>

      <section className="finalCta shell">
        <p className="sectionLabel">ASPIRE 101</p>
        <h2>Don’t just go to college.<br /><em>Go somewhere.</em></h2>
        <p>Start with the people, projects, and opportunities already around you.</p>
        <a className="button buttonLight" href="/signup">Join Aspire</a>
      </section>

      <footer className="footer shell">
        <a className="brand" href="#top"><span className="brandMark">A</span><span>Aspire 101</span></a>
        <p>Learn · Connect · Build · Launch</p>
        <div>
          <a href="#product">Product</a>
          <a href="#schools">For schools</a>
          <a href="/about">About</a>
        </div>
      </footer>
    </main>
  );
}
