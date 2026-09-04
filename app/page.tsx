'use client';

import { FormEvent, useState } from 'react';
import { aspireLogo } from './logo';
import RequestJourney from './RequestJourney';
import FeatureTour from './FeatureTour';

const categories = ['Anything', 'Study', 'Ride', 'Buy & Sell', 'Projects', 'Campus'];

const examples = [
  { tag: 'STUDY', title: 'Need help with linear algebra before Thursday', meta: 'Tonight · 2 replies', price: '$25' },
  { tag: 'RIDE', title: 'Looking for a ride to the airport Friday morning', meta: 'Fri 7:30 AM · 3 interested', price: 'Split gas' },
  { tag: 'PROJECT', title: 'Need a designer for a weekend hackathon team', meta: 'This weekend · 5 replies', price: 'Team up' },
  { tag: 'MARKET', title: 'Looking for a mini fridge near campus', meta: 'Pickup today · 4 offers', price: 'Under $80' },
  { tag: 'CAMPUS', title: 'Need two people to help move a desk upstairs', meta: 'Today · 4 nearby', price: '$30' },
  { tag: 'NEW HERE', title: 'First week here — where do people actually study late?', meta: '8 replies · 3 spots saved', price: 'Local advice' }
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
          <a href="#journey">Request journey</a>
          <a href="#features">Everything Aspire</a>
          <a href="#home">Why Aspire</a>
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
            From your first week on campus to finals, post what you need, find students who can help, and turn an unfamiliar place into people you know.
          </p>
          <div className="heroCta">
            <a className="button buttonGold" href="#request-demo">Post a request <span>↗</span></a>
            <a className="quietLink" href="#journey">Walk the campus journey <span>↓</span></a>
          </div>
          <div className="heroMiniProof">
            <span>Students helping students.</span>
            <span>Useful from move-in week onward.</span>
            <span>Feel at home faster.</span>
          </div>
        </div>

        <div className="requestStage" id="request-demo">
          <div className="stageTape stageTapeOne">FIRST WEEK · ANY WEEK</div>
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
          <span>NEW TO CAMPUS?</span><b>✦</b>
          <span>NEED A PHOTOGRAPHER?</span><b>✦</b>
          <span>LOOKING FOR A PROJECT PARTNER?</span><b>✦</b>
          <span>RIDE TO THE AIRPORT?</span><b>✦</b>
          <span>SELLING A MINI FRIDGE?</span><b>✦</b>
          <span>NEED TUTORING?</span><b>✦</b>
          <span>ASK CAMPUS.</span>
        </div>
      </section>

      <div id="journey">
        <RequestJourney requestText={previewRequest} />
      </div>

      <FeatureTour />

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
            <p className="eyebrow darkEyebrow">BUILT FOR WHEN CAMPUS IS STILL NEW</p>
            <h2>From “where do I go?”<br />to “I know someone.”</h2>
            <p>Your first weeks can be full of tiny questions nobody puts in an orientation guide. Aspire turns those moments into help, local knowledge, and connections — then stays useful long after campus stops feeling new.</p>
          </div>
          <div className="energyStack" aria-hidden="true">
            <div className="energyCard cardA"><span>need a gym buddy</span><b>OPEN</b></div>
            <div className="energyCard cardB"><span>selling desk lamp</span><b>$12</b></div>
            <div className="energyCard cardC"><span>hackathon teammate?</span><b>CS + DESIGN</b></div>
            <div className="energyCard cardD"><span>best late study spot?</span><b>8 REPLIES</b></div>
          </div>
        </div>
      </section>

      <section id="home" className="homeMission">
        <div className="homeMissionInner shell">
          <p className="eyebrow">WHY ASPIRE EXISTS</p>
          <h2>College feels better when you’re not <span>figuring it out alone.</span></h2>
          <p>For a lot of students, arriving on campus means starting from zero: new streets, new routines, and no idea who to ask. Aspire is meant to make that transition warmer — one request, one helpful person, and one familiar connection at a time.</p>
        </div>
      </section>

      <section className="trust shell">
        <div className="trustItem"><span>01</span><h3>College-focused</h3><p>Designed around student needs from move-in week to finals and everything between.</p></div>
        <div className="trustItem"><span>02</span><h3>Request-first</h3><p>Start with what you need instead of digging through endless feeds and scattered chats.</p></div>
        <div className="trustItem"><span>03</span><h3>Identity + reputation</h3><p>Profiles and trust signals can make C2C interactions feel more accountable and more comfortable.</p></div>
      </section>

      <section className="finalCta shell">
        <div className="finalLogo"><img src={aspireLogo} alt="Aspire 101" /></div>
        <p className="eyebrow">DON’T FIGURE OUT CAMPUS ALONE.</p>
        <h2>Find help. Find people. Feel at home.</h2>
        <p>Start with one request. Let campus feel a little smaller from there.</p>
        <div className="finalActions">
          <a className="button buttonGold" href="/signup">Start with a request <span>↗</span></a>
          <a className="quietLink" href="#requests">See what students ask for</a>
        </div>
      </section>
    </main>
  );
}
