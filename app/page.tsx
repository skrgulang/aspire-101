'use client';

import { FormEvent, useState } from 'react';
import { aspireLogo } from './logo';
import FeatureTour from './FeatureTour';
import NearYou from './NearYou';
import WorkWithAspire from './WorkWithAspire';
import FAQ from './FAQ';
import TrustLoop from './TrustLoop';
import GlobalJourney from './GlobalJourney';
import NavAuth from './NavAuth';

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
          <a href="#nearby">Browse</a>
          <a href="#how">How it works</a>
          <a href="#ambassadors">Ambassadors</a>
        </nav>
        <NavAuth />
      </header>

      <section id="top" className="hero shell">
        <div className="heroSun" aria-hidden="true" />
        <div className="heroNoise" aria-hidden="true" />

        <div className="heroCopyBlock">
          <p className="eyebrow"><span className="eyebrowDot" /> THE COLLEGE REQUEST NETWORK</p>
          <h1>Need something?<br /><span>Ask campus.</span></h1>
          <p className="heroCopy">Post what you need. Students nearby can respond. You choose who to connect with.</p>
          <div className="heroCta">
            <a className="button buttonGold" href="/post">Post a request <span>↗</span></a>
            <a className="quietLink" href="#nearby">See what's happening ↓</a>
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
              <button className="button buttonGold" type="submit">Preview <span>→</span></button>
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
              <a href="/post">Post this request ↗</a>
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

      <div className="journeyWorld">
        <GlobalJourney />

        <NearYou />

        <section id="how" className="how shell">
          <div className="howIntro">
            <p className="eyebrow">HOW ASPIRE WORKS</p>
            <h2>Post.<br />Respond.<br /><span>Connect.</span></h2>
          </div>

          <div className="howSteps">
            <article>
              <div className="stepNumber">01</div>
              <div><h3>Post what you need</h3><p>Help, rides, items, classmates, projects, or local advice.</p></div>
            </article>
            <article>
              <div className="stepNumber">02</div>
              <div><h3>Students respond</h3><p>People nearby answer, offer help, join, or make an offer.</p></div>
            </article>
            <article>
              <div className="stepNumber">03</div>
              <div><h3>You both connect</h3><p>When both sides agree, private chat opens.</p></div>
            </article>
          </div>
        </section>

        <FeatureTour />

        <section id="home" className="homeMission connectionMoment">
          <div className="connectionMomentMedia" aria-hidden="true">
            <img src="https://images.pexels.com/photos/7972544/pexels-photo-7972544.jpeg?auto=compress&cs=tinysrgb&w=1800" alt="" />
          </div>
          <div className="connectionMomentInner">
            <div className="connectionMomentCopy">
              <p className="eyebrow">CONNECTIONS START WITH DOING</p>
              <h2>Do more <span>together.</span></h2>
              <p>Find classmates, teammates, collaborators, and people who are up for the same thing.</p>
            </div>
            <div className="connectionMomentNotes" aria-hidden="true">
              <span className="connectionNote noteA"><b>✦</b> Math 55 study tonight?</span>
              <span className="connectionNote noteB"><b>↗</b> Need a designer for a weekend build</span>
              <span className="connectionNote noteC"><b>+</b> Anyone want to ski Saturday?</span>
              <span className="connectionNote noteD"><b>◎</b> Looking for a photographer</span>
            </div>
          </div>
          <span className="connectionMomentTag">one ask → people you know</span>
        </section>

        <TrustLoop />
        <WorkWithAspire />
        <FAQ />
      </div>
    </main>
  );
}
