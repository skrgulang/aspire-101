const profiles = [
  {
    initial: 'J',
    name: 'Joyi',
    school: 'Berkeley',
    score: '4.9',
    completed: '8 connections',
    reconnect: '100% would connect again',
    tags: ['Clear', 'Friendly', 'On time']
  },
  {
    initial: 'T',
    name: 'Tony',
    school: 'Rutgers',
    score: '4.8',
    completed: '14 connections',
    reconnect: '93% would connect again',
    tags: ['Reliable', 'Helpful', 'Respectful']
  }
];

export default function TrustLoop() {
  return (
    <section id="trust" className="trustLoop shell">
      <div className="trustLoopIntro">
        <p className="eyebrow">ONE ACCOUNT · BOTH SIDES ACCOUNTABLE</p>
        <h2>No “worker” account.<br/><span>Just students choosing each other.</span></h2>
        <p>
          On Aspire, the same person can ask for help today and help someone else tomorrow. Every account builds one reputation across requests, responses, and completed connections.
        </p>
      </div>

      <div className="trustFlow" aria-label="How mutual matching works">
        <article><span>01</span><strong>Respond</strong><p>Interested students send a response instead of instantly claiming the request.</p></article>
        <i>→</i>
        <article><span>02</span><strong>Choose each other</strong><p>The requester accepts a response, and either person can still step away before confirming.</p></article>
        <i>→</i>
        <article><span>03</span><strong>Private chat opens</strong><p>Conversation starts from a real request — not random unsolicited DMs.</p></article>
        <i>→</i>
        <article><span>04</span><strong>Complete + review</strong><p>After the connection is finished, both sides can leave a private blind review.</p></article>
      </div>

      <div className="trustProfileStage">
        <div className="trustProfileCopy">
          <span className="trustMiniLabel">REPUTATION FOLLOWS THE PERSON</span>
          <h3>Requester today.<br/>Responder tomorrow.</h3>
          <p>
            New accounts begin as <strong>New to Aspire</strong>, not with a fake 5.0. Once enough completed connections exist, reputation can show reliability, behavior tags, and whether other students would connect again.
          </p>
          <div className="trustPrinciples">
            <span>Mutual connection</span>
            <span>Two-way reviews</span>
            <span>Report ≠ rating</span>
            <span>No precise address before sharing</span>
          </div>
        </div>

        <div className="profileDeck">
          {profiles.map((profile, index) => (
            <article className={`reputationCard reputationCard${index + 1}`} key={profile.name}>
              <div className="repTop">
                <span className="repAvatar">{profile.initial}</span>
                <div><strong>{profile.name}</strong><small>@ {profile.school}</small></div>
                <b>★ {profile.score}</b>
              </div>
              <div className="repStats">
                <span><strong>{profile.completed}</strong><small>completed</small></span>
                <span><strong>{profile.reconnect}</strong><small>community signal</small></span>
              </div>
              <div className="repTags">{profile.tags.map((tag) => <em key={tag}>{tag}</em>)}</div>
              <small className="repPrototype">Prototype profile example</small>
            </article>
          ))}
          <article className="reputationCard newMemberCard">
            <div className="repTop"><span className="repAvatar">N</span><div><strong>New member</strong><small>@ campus</small></div><b>NEW</b></div>
            <p>No score yet. Build reputation through real completed connections.</p>
            <small className="repPrototype">New to Aspire</small>
          </article>
        </div>
      </div>

      <div className="safetyLine">
        <strong>Ratings are for experience. Reports are for safety.</strong>
        <p>Harassment, threats, scams, violence, or illegal activity should go through reporting and moderation — not just a low star rating.</p>
        <a href="/guidelines">Community Guidelines ↗</a>
      </div>
    </section>
  );
}
