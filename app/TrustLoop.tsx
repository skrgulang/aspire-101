'use client';

import { useState } from 'react';

type Mode = {
  key: string;
  label: string;
  kind: string;
  icon: string;
  request: string;
  value: string;
  response: string;
  agreement: string[];
  review: string[];
  tone: string;
};

const modes: Mode[] = [
  {
    key: 'community', label: 'Community help', kind: 'NO MONEY EXPECTED', icon: '✦',
    request: 'Anyone in Math 55 want to review before Thursday?', value: 'Study together',
    response: 'Ryan wants to join your study session.',
    agreement: ['Confirm time', 'Choose a public study spot', 'No payment expected'],
    review: ['Helpful', 'Respectful', 'Clear'], tone: 'community'
  },
  {
    key: 'paid', label: 'Paid help', kind: 'COMPENSATION INVOLVED', icon: '$',
    request: 'Need help carrying a desk upstairs this afternoon.', value: '$30 offered',
    response: 'Tony can help after 4 PM.',
    agreement: ['$30 compensation', 'Carry one desk upstairs', 'Today · after 4 PM'],
    review: ['On time', 'Terms followed', 'Reliable'], tone: 'paid'
  },
  {
    key: 'split', label: 'Split cost', kind: 'SHARED EXPENSE', icon: '↔',
    request: 'Anyone heading to the airport Friday morning?', value: 'Split ride cost',
    response: 'Lihui is going the same way.',
    agreement: ['Confirm route', 'Confirm estimated split', 'Meetup point shared after connect'],
    review: ['Clear', 'On time', 'Easy to coordinate'], tone: 'split'
  },
  {
    key: 'market', label: 'Buy & sell', kind: 'ITEM EXCHANGE', icon: '□',
    request: 'Looking for a mini fridge near campus.', value: 'Under $80',
    response: 'Joyi has one available for pickup.',
    agreement: ['Item + condition confirmed', '$65 agreed price', 'Public meetup preferred'],
    review: ['Accurate listing', 'Responsive', 'Smooth handoff'], tone: 'market'
  },
  {
    key: 'collab', label: 'Collaboration', kind: 'NO BUYER / SELLER', icon: '+',
    request: 'Need a designer for a weekend AI project.', value: 'Build together',
    response: 'Nathan is interested in joining.',
    agreement: ['Role + expectations', 'Project timeline', 'No employment implied'],
    review: ['Collaborative', 'Communicative', 'Follow-through'], tone: 'collab'
  }
];

const people = [
  { initial: 'J', name: 'Joyi', school: 'Berkeley', completed: '8', reconnect: '100%', contexts: ['Paid help 2', 'Study 3', 'Market 2', 'Campus 1'], tags: ['Clear', 'Friendly', 'On time'] },
  { initial: 'T', name: 'Tony', school: 'Rutgers', completed: '14', reconnect: '93%', contexts: ['Community 5', 'Paid help 4', 'Study 3', 'Rides 2'], tags: ['Reliable', 'Helpful', 'Respectful'] }
];

export default function TrustLoop() {
  const [active, setActive] = useState(1);
  const mode = modes[active];

  return (
    <section id="trust" className="trustLoop shell">
      <div className="trustLoopIntro">
        <p className="eyebrow">TRUST SHOULD MATCH THE SITUATION</p>
        <h2>One account.<br/><span>Different kinds of trust.</span></h2>
        <p>Helping a classmate for free is not the same as a $30 moving job, splitting a ride, or buying a mini fridge. Aspire keeps one identity, but the context stays visible.</p>
      </div>

      <div className="trustModeTabs" aria-label="Choose an interaction type">
        {modes.map((item, index) => (
          <button type="button" key={item.key} className={active === index ? 'active' : ''} onClick={() => setActive(index)}>
            <i>{item.icon}</i><span>{item.label}</span><small>{item.kind}</small>
          </button>
        ))}
      </div>

      <div className={`trustPlayground ${mode.tone}`} aria-live="polite">
        <div className="trustScene trustRequestScene">
          <span className="sceneLabel">01 · REQUEST</span>
          <article className="miniRequestCard">
            <div className="miniRequestTop"><span>{mode.kind}</span><b>{mode.icon}</b></div>
            <h3>{mode.request}</h3>
            <strong>{mode.value}</strong>
            <div className="miniRequestPerson"><i>J</i><span><b>Joyi @ Berkeley</b><small>8 completed connections</small></span></div>
          </article>
        </div>

        <div className="trustConnector"><span>RESPOND</span><i>→</i></div>

        <div className="trustScene trustResponseScene">
          <span className="sceneLabel">02 · MUTUAL CHOICE</span>
          <article className="responseBubble">
            <div className="responsePerson"><i>T</i><span><b>Tony @ Rutgers</b><small>Reliable · Helpful</small></span></div>
            <p>{mode.response}</p>
            <div className="responseActions"><button type="button">Pass</button><button type="button">Connect</button></div>
          </article>
          <small className="mutualNote">No first-click claim. The requester chooses, and the responder still confirms.</small>
        </div>

        <div className="trustConnector"><span>CONNECT</span><i>→</i></div>

        <div className="trustScene trustAgreementScene">
          <span className="sceneLabel">03 · PRIVATE ROOM</span>
          <article className="agreementCard">
            <div className="agreementHeader"><span><i /> BOTH CONNECTED</span><b>{mode.label}</b></div>
            <div className="agreementChat">
              <p className="chatThem">Hey — this works for me.</p>
              <p className="chatMe">Perfect. Let&apos;s confirm the details.</p>
            </div>
            <div className="agreementTerms">
              <small>AGREED DETAILS</small>
              {mode.agreement.map((item) => <span key={item}><b>✓</b>{item}</span>)}
            </div>
            <button type="button" className="agreementReady">Mark ready</button>
          </article>
        </div>
      </div>

      <div className="trustReviewRow">
        <div>
          <span className="trustMiniLabel">AFTER COMPLETION</span>
          <h3>Don&apos;t rate the person like a product.</h3>
          <p>Start with one simple question — <strong>Would you connect with this person again?</strong> Then add context-specific tags. Reviews stay blind until both sides submit or the review window closes.</p>
        </div>
        <div className="reviewMock">
          <span>WOULD YOU CONNECT AGAIN?</span>
          <div><button type="button">Yes</button><button type="button">No</button></div>
          <small>WHAT STOOD OUT?</small>
          <div className="reviewTags">{mode.review.map((tag) => <button type="button" key={tag}>{tag}</button>)}</div>
          <textarea aria-label="Optional review note" placeholder="Optional note…" rows={2} />
        </div>
      </div>

      <div className="trustPassportStage">
        <div className="passportIntro">
          <span className="trustMiniLabel">ASPIRE TRUST PASSPORT</span>
          <h3>Reputation follows the person — not one giant star score.</h3>
          <p>Public trust should show completed interactions, repeat-connect sentiment, and where that experience came from. Serious reports stay in the safety system instead of becoming a public shame score.</p>
          <div className="trustPrinciples"><span>One identity</span><span>Context visible</span><span>Blind two-way review</span><span>Report ≠ review</span></div>
        </div>

        <div className="passportDeck">
          {people.map((person) => (
            <article className="trustPassport" key={person.name}>
              <div className="passportTop"><span className="repAvatar">{person.initial}</span><div><strong>{person.name}</strong><small>@ {person.school}</small></div><b>TRUST PASSPORT</b></div>
              <div className="passportSignals"><span><strong>{person.completed}</strong><small>completed</small></span><span><strong>{person.reconnect}</strong><small>would connect again</small></span></div>
              <div className="passportContext">{person.contexts.map((item) => <em key={item}>{item}</em>)}</div>
              <div className="repTags">{person.tags.map((tag) => <em key={tag}>{tag}</em>)}</div>
              <small className="repPrototype">Prototype profile example</small>
            </article>
          ))}
          <article className="trustPassport newPassport">
            <div className="passportTop"><span className="repAvatar">N</span><div><strong>New member</strong><small>@ campus</small></div><b>NEW</b></div>
            <p>No fake 5.0. New members simply show <strong>New to Aspire</strong> until real completed interactions build context.</p>
          </article>
        </div>
      </div>

      <div className="safetyLine">
        <strong>Money changes the flow. Safety issues change the system.</strong>
        <p>When compensation is involved, Aspire should surface the amount, scope, timing, and agreement before the request is marked in progress. Harassment, threats, scams, violence, or illegal activity go to reporting and moderation — not a one-star review.</p>
        <a href="/guidelines">Community Guidelines ↗</a>
      </div>
    </section>
  );
}
