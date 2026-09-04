'use client';

import { FormEvent, useState } from 'react';
import { aspireLogo } from './logo';

const categories = ['Anything', 'Study', 'Ride', 'Buy & Sell', 'Projects', 'Campus'];

const examples = [
  { tag: 'STUDY', title: 'Need help with linear algebra before Thursday', meta: 'Tonight · 2 replies', price: '$25' },
  { tag: 'RIDE', title: 'Looking for a ride to the airport Friday morning', meta: 'Fri 7:30 AM · 3 interested', price: 'Split gas' },
  { tag: 'PROJECT', title: 'Need a designer for a weekend hackathon team', meta: 'This weekend · 5 replies', price: 'Team up' },
  { tag: 'MARKET', title: 'Looking for a mini fridge near campus', meta: 'Pickup today · 4 offers', price: 'Under $80' },
  { tag: 'CAMPUS', title: 'Need two people to help move a desk upstairs', meta: 'Today · 4 nearby', price: '$30' },
  { tag: 'CAREER', title: 'Can someone review my resume for product roles?', meta: 'Remote · 6 replies', price: '$15' }
];

const featureCards = [
  {
    number: '01',
    label: 'GET HELP',
    title: 'Ask for what you actually need.',
    copy: 'Tutoring, moving help, advice, rides, errands, creative work — post it once and let the right students find it.',
    className: 'feature featureGold'
  },
  {
    number: '02',
    label: 'FIND PEOPLE',
    title: 'Turn a request into a connection.',
    copy: 'Find classmates, collaborators, project partners, creators, and people who are useful to know beyond one request.',
    className: 'feature featureDark'
  },
  {
    number: '03',
    label: 'BUILD THINGS',
    title: 'Start with “who wants in?”',
    copy: 'Post a project, recruit a teammate, find a skill you are missing, or join something already moving.',
    className: 'feature featureCream'
  },
  {
    number: '04',
    label: 'DISCOVER MORE',
    title: 'Useful campus signal, minus the noise.',
    copy: 'Opportunities, events, requests, and useful student-to-student activity in one place built around college life.',
    className: 'feature featureOutline'
  }
];

const logoStyle = {
  width: 38,
  height: 38,
  borderRadius: 11,
  objectFit: 'cover' as const
};

export default function Home() {
  const [activeCategory, setActiveCategory] = useState('Anything');
  const [request, setRequest] = useState('Need help moving a mini fridge this afternoon');
  const [previewRequest, setPreviewRequest] = useState('Need help moving a mini fridge this afternoon');

  function previewMatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (request.trim()) setPreviewRequest(request.trim());
  }

  return (
    <main>
      <header className="nav shell">
        <a className="brand" href="#top" aria-label="Aspire 101 home">
          <img src={aspireLogo} alt="" style={logoStyle} />
          <span>Aspire 101</span>
        </a>
        <nav className="navLinks" aria-label="Primary navigation">
          <a href="#requests">Requests</a>
          <a href="#possibilities">What you can do</a>
          <a href="#how">How it works</a>
        </nav>
        <div className="navActions">
          <a className="textLink" href="/login">Log in</a>
          <a className="button buttonGold buttonSmall" href="/signup">Join Aspire <span>↗</span></a>
        </div>
      </header>

      <section id="top" className="hero shell">
        <div className="heroSun" aria-hidden="true" />
        <div className="heroNoise" aria-hidden="true" />

        <div className="heroCopyBlock">
          <p className="eyebrow"><span className="eyebrowDot" /> THE COLLEGE REQUEST NETWORK</p>
          <h1>Need something?<br /><span>Ask campus.</span></h1>
          <p className="heroCopy">
            Post what you need, find students who can help, and get things moving — from tutoring and rides to projects, campus life, and everything in between.
          </p>
          <div className="heroCta">
            <a className="button buttonGold" href="#request-demo">Post a request <span>↗</span></a>
            <a className="quietLink" href="#requests">See what students ask for <span>↓</span></a>
          </div>
          <div className="heroMiniProof">
            <span>Students helping students.</span>
            <span>Request-first.</span>
            <span>Built for college life.</span>
          </div>
        </div>

        <div className="requestStage" id="request-demo">
          <div className="stageTape stageTapeOne">CAMPUS MODE</div>
          <div className="stageTape stageTapeTwo">OPEN REQUESTS</div>

          <form className="requestComposer" onSubmit={previewMatch}>
            <div className="composerTop">
              <div>
                <span className="composerLabel">WHAT DO YOU NEED?</span>
                <strong>Make a request</strong>
              </div>
              <span className="demoPill">DEMO</span>
            </div>

            <div className="categoryRow" aria-label="Request category">
              {categories.map((category) => (
                <button
                  type="button"
                  key={category}
                  className={activeCategory === category ? 'categoryChip active' : 'categoryChip'}
                  onClick={() => setActiveCategory(category)}
                >
                  {category}
                </button>
              ))}
            </div>

            <textarea
              value={request}
              onChange={(event) => setRequest(event.target.value)}
              rows={3}
              aria-label="Request description"
            />

            <div className="composerBottom">
              <div className="composerMeta">
                <span>◎ Nearby</span>
                <span>◷ Today</span>
                <span>#{activeCategory}</span>
              </div>
              <button className="button buttonGold" type="submit">See a preview <span>→</span></button>
            </div>
          </form>

          <article className="matchCard">
            <div className="matchHeader">
              <span className="matchStatus"><i /> REQUEST PREVIEW</span>
              <span>just now</span>
            </div>
            <h3>{previewRequest}</h3>
            <div className="avatarStack" aria-hidden="true">
              <span>A</span><span>M</span><span>J</span><span>+2</span>
            </div>
            <div className="matchBottom">
              <div><strong>5</strong><span>possible matches</span></div>
              <a href="/signup">Open request ↗</a>
            </div>
          </article>

          <article className="floatingRequest floatingOne">
            <span>RIDE</span>
            <strong>Airport Friday?</strong>
            <small>3 interested · Split gas</small>
          </article>
          <article className="floatingRequest floatingTwo">
            <span>STUDY</span>
            <strong>Calc help tonight</strong>
            <small>2 replies · $20</small>
          </article>
        </div>
      </section>

      <section className="goldTicker" aria-label="Example Aspire requests">
        <div>
          <span>NEED A PHOTOGRAPHER?</span><b>✦</b>
          <span>LOOKING FOR A PROJECT PARTNER?</span><b>✦</b>
          <span>RIDE TO THE AIRPORT?</span><b>✦</b>
          <span>SELLING A MINI FRIDGE?</span><b>✦</b>
          <span>NEED TUTORING?</span><b>✦</b>
          <span>POST IT ON ASPIRE.</span>
        </div>
      </section>

      <section id="requests" className="requestWall shell">
        <div className="sectionHeading">
          <p className="eyebrow">REAL COLLEGE LIFE IS MESSY. GOOD.</p>
          <h2>One place for the random stuff that makes campus work.</h2>
          <p>Not just rides. Not just tutoring. Aspire is built around the simple idea that students constantly need things — and other students can often help.</p>
        </div>

        <div className="requestGrid">
          {examples.map((item, index) => (
            <article className={`requestTile requestTile${index + 1}`} key={item.title}>
              <div className="requestTileTop"><span>{item.tag}</span><span>↗</span></div>
              <h3>{item.title}</h3>
              <div className="requestTileBottom"><span>{item.meta}</span><strong>{item.price}</strong></div>
            </article>
          ))}
        </div>
      </section>

      <section id="possibilities" className="possibilities shell">
        <div className="sectionHeading compact">
          <p className="eyebrow">MORE THAN A MARKETPLACE</p>
          <h2>The request is the beginning, not the whole product.</h2>
        </div>

        <div className="featureGrid">
          {featureCards.map((feature) => (
            <article className={feature.className} key={feature.number}>
              <div className="featureTop"><span>{feature.number}</span><span>{feature.label}</span></div>
              <h3>{feature.title}</h3>
              <p>{feature.copy}</p>
              <a href="/signup">Explore <span>↗</span></a>
            </article>
          ))}
        </div>
      </section>

      <section id="how" className="how shell">
        <div className="howIntro">
          <p className="eyebrow">THREE MOVES. THAT'S IT.</p>
          <h2>Ask.<br />Match.<br /><span>Make it happen.</span></h2>
        </div>

        <div className="howSteps">
          <article>
            <div className="stepNumber">01</div>
            <div><h3>Post what you need</h3><p>Say it normally. Add the details that matter. Choose a category if you want.</p></div>
          </article>
          <article>
            <div className="stepNumber">02</div>
            <div><h3>Find the right response</h3><p>See people, replies, offers, or related campus activity around your request.</p></div>
          </article>
          <article>
            <div className="stepNumber">03</div>
            <div><h3>Connect and move</h3><p>Message, coordinate, collaborate, exchange, or simply get the thing done.</p></div>
          </article>
        </div>
      </section>

      <section className="campusEnergy">
        <div className="shell campusEnergyInner">
          <div className="energyCopy">
            <p className="eyebrow darkEyebrow">BUILT TO FEEL LIKE COLLEGE</p>
            <h2>Useful enough for Monday.<br />Social enough for Friday.</h2>
            <p>Aspire should feel alive because campus is alive. Practical requests can turn into collaborators, friendships, opportunities, or simply a much easier day.</p>
          </div>
          <div className="energyStack" aria-hidden="true">
            <div className="energyCard cardA"><span>need a gym buddy</span><b>OPEN</b></div>
            <div className="energyCard cardB"><span>selling desk lamp</span><b>$12</b></div>
            <div className="energyCard cardC"><span>hackathon teammate?</span><b>CS + DESIGN</b></div>
            <div className="energyCard cardD"><span>resume feedback</span><b>TONIGHT</b></div>
          </div>
        </div>
      </section>

      <section className="trust shell">
        <div className="trustItem"><span>01</span><h3>College-focused</h3><p>Designed around student needs and the rhythms of campus life.</p></div>
        <div className="trustItem"><span>02</span><h3>Request-first</h3><p>Start with what you need instead of digging through endless feeds.</p></div>
        <div className="trustItem"><span>03</span><h3>Identity + reputation</h3><p>Profiles and trust signals can make C2C interactions feel more accountable.</p></div>
      </section>

      <section className="finalCta shell">
        <div className="finalLogo"><img src={aspireLogo} alt="Aspire 101" /></div>
        <p className="eyebrow">YOUR CAMPUS CAN PROBABLY HELP.</p>
        <h2>So... what do you need?</h2>
        <p>Start with one request. See where it takes you.</p>
        <div className="finalActions">
          <a className="button buttonGold" href="/signup">Post your first request <span>↗</span></a>
          <a className="quietLink" href="#requests">Browse examples</a>
        </div>
      </section>

      <footer className="footer shell">
        <a className="brand" href="#top"><img src={aspireLogo} alt="" style={logoStyle} /><span>Aspire 101</span></a>
        <p>Post what you need. Find who can help.</p>
        <div><a href="#requests">Requests</a><a href="#how">How it works</a><a href="/about">About</a></div>
      </footer>
    </main>
  );
}
