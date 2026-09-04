'use client';

import { FormEvent, useState } from 'react';
import { aspireLogo } from './logo';
import RequestJourney from './RequestJourney';
import FeatureTour from './FeatureTour';
import NearYou from './NearYou';
import WorkWithAspire from './WorkWithAspire';
import FAQ from './FAQ';
import CampusGuide from './CampusGuide';
import TrustLoop from './TrustLoop';

const categories = ['Anything', 'Study', 'Ride', 'Buy & Sell', 'Projects', 'Campus'];

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
          <a href="#nearby">Browse requests</a>
          <a href="#how">How it works</a>
          <a href="#work-with-us">Work with Aspire</a>
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
            Aspire is where college students post what they need — study help, rides, moving help, items, teammates, or local advice — and connect with nearby students when both sides choose to.
          </p>
          <div className="heroCta">
            <a className="button buttonGold" href="/login">Log in to post <span>↗</span></a>
            <a className="quietLink" href="#nearby">Browse requests near you <span>↓</span></a>
          </div>
          <div className="heroMiniProof">
            <span>Browse nearby requests.</span>
            <span>Respond when you can help.</span>
            <span>Connect only when both sides agree.</span>
          </div>
        </div>

        <div className="requestStage" id="request-demo">
          <div className="stageTape stageTapeOne">FIRST WEEK · ANY WEEK</div>
          <div className="stageTape stageTapeTwo">OPEN REQUESTS</div>

          <form className="requestComposer" onSubmit={previewMatch}>
            <div className="composerTop">
              <div>
                <span className="composerLabel">WHAT DO YOU NEED?</span>
                <strong>Try a request</strong>
              </div>
              <span className="demoPill">PREVIEW</span>
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
              <div><strong>5</strong><span>possible responses</span></div>
              <a href="/login">Log in to publish ↗</a>
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

      <NearYou />

      <div id="journey">
        <RequestJourney requestText={previewRequest} />
      </div>

      <section id="how" className="how shell">
        <div className="howIntro">
          <p className="eyebrow">HOW ASPIRE WORKS</p>
          <h2>Post.<br />Respond.<br /><span>Choose each other.</span></h2>
        </div>

        <div className="howSteps">
          <article>
            <div className="stepNumber">01</div>
            <div><h3>Post what you need</h3><p>Ask for study help, a ride, moving help, an item, a teammate, or something else happening around campus.</p></div>
          </article>
          <article>
            <div className="stepNumber">02</div>
            <div><h3>Students respond</h3><p>People nearby can answer, offer help, join, or make an offer. Nobody instantly claims you or your request.</p></div>
          </article>
          <article>
            <div className="stepNumber">03</div>
            <div><h3>You both choose to connect</h3><p>Once both sides agree, private chat opens so you can coordinate the details and complete the request.</p></div>
          </article>
        </div>
      </section>

      <FeatureTour />

      <section id="home" className="homeMission">
        <div className="homeMissionInner shell">
          <p className="eyebrow">WHY ASPIRE EXISTS</p>
          <h2>College feels better when you’re not <span>figuring it out alone.</span></h2>
          <p>For a lot of students, arriving on campus means starting from zero: new streets, new routines, and no idea who to ask. Aspire is meant to make that transition warmer — one request, one helpful person, and one familiar connection at a time.</p>
        </div>
      </section>

      <TrustLoop />
      <WorkWithAspire />

      <section className="finalCta shell">
        <div className="finalLogo"><img src={aspireLogo} alt="Aspire 101" /></div>
        <p className="eyebrow">DON’T FIGURE OUT CAMPUS ALONE.</p>
        <h2>Find help. Find people. Feel at home.</h2>
        <p>Browse what’s happening nearby. When you’re ready to ask, log in and put your own request into motion.</p>
        <div className="finalActions">
          <a className="button buttonGold" href="/login">Log in to post <span>↗</span></a>
          <a className="quietLink" href="#nearby">Browse near you</a>
        </div>
      </section>

      <FAQ />
      <CampusGuide />
    </main>
  );
}
