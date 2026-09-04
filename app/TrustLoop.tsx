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
};

const modes: Mode[] = [
  {
    key: 'community', label: 'Community', kind: 'NO MONEY', icon: '✦',
    request: 'Anyone in Math 55 want to review before Thursday?', value: 'Study together',
    response: 'Ryan wants to join.',
    agreement: ['Tonight · 7 PM', 'Moffitt Library', 'No payment']
  },
  {
    key: 'paid', label: 'Paid help', kind: 'COMPENSATION', icon: '$',
    request: 'Need help carrying a desk upstairs this afternoon.', value: '$30 offered',
    response: 'Tony can help after 4 PM.',
    agreement: ['$30', 'Carry one desk', 'Today · after 4 PM']
  },
  {
    key: 'split', label: 'Split cost', kind: 'SHARED EXPENSE', icon: '↔',
    request: 'Anyone heading to the airport Friday morning?', value: 'Split ride cost',
    response: 'Lihui is going the same way.',
    agreement: ['SFO', 'Friday · 7:30 AM', 'Split agreed cost']
  },
  {
    key: 'market', label: 'Buy & sell', kind: 'ITEM EXCHANGE', icon: '□',
    request: 'Looking for a mini fridge near campus.', value: 'Under $80',
    response: 'Joyi has one available.',
    agreement: ['$65', 'Used · good condition', 'Campus pickup']
  },
  {
    key: 'collab', label: 'Collab', kind: 'BUILD TOGETHER', icon: '+',
    request: 'Need a designer for a weekend AI project.', value: 'Build together',
    response: 'Nathan is interested in joining.',
    agreement: ['Designer role', 'Weekend build', 'No payment expected']
  }
];

export default function TrustLoop() {
  const [active, setActive] = useState(1);
  const mode = modes[active];

  return (
    <section id="trust" className="trustLoop trustSimple shell">
      <div className="trustSimpleHead">
        <div>
          <p className="eyebrow">TRUST, WITHOUT THE NOISE</p>
          <h2>Clear before you connect.</h2>
        </div>
        <p>Free help, paid help, rides, and marketplace exchanges are different. Aspire keeps that visible before both sides agree.</p>
      </div>

      <div className="trustTypePills" aria-label="Choose an interaction type">
        {modes.map((item, index) => (
          <button type="button" key={item.key} className={active === index ? 'active' : ''} onClick={() => setActive(index)}>
            <i>{item.icon}</i>{item.label}
          </button>
        ))}
      </div>

      <div className="trustSingleCard" aria-live="polite">
        <div className="trustSingleHeader">
          <div>
            <span>{mode.kind}</span>
            <h3>{mode.request}</h3>
          </div>
          <strong>{mode.value}</strong>
        </div>

        <div className="trustSingleFlow">
          <div className="trustPersonLine">
            <span className="trustAvatar">J</span>
            <div><b>Joyi @ Berkeley</b><small>posted the request</small></div>
          </div>
          <div className="trustFlowArrow">→</div>
          <div className="trustResponseLine">
            <span className="trustAvatar light">T</span>
            <div><b>{mode.response}</b><small>Tony @ Rutgers</small></div>
          </div>
          <div className="trustFlowArrow">→</div>
          <div className="trustConnectedState">
            <span>✓ BOTH AGREED</span>
            <div className="trustAgreementList">
              {mode.agreement.map((item) => <b key={item}>{item}</b>)}
            </div>
          </div>
        </div>
      </div>

      <div className="trustGuardrails">
        <span><b>Mutual choice</b><small>No first-click claim.</small></span>
        <span><b>Terms stay visible</b><small>Price, scope, time, or meetup.</small></span>
        <span><b>Safety is separate</b><small>Reports go to moderation, not a star score.</small></span>
        <a href="/guidelines">Safety + guidelines ↗</a>
      </div>
    </section>
  );
}
