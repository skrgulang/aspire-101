import type { Metadata } from 'next';
import { aspireLogo } from '../logo';

export const metadata: Metadata = {
  title: 'Safety Center — Aspire 101',
  description: 'Safety guidance, reporting, blocking, and interaction controls for Aspire 101.'
};

const logoStyle = { width: 38, height: 38, borderRadius: 11, objectFit: 'cover' as const };

export default function SafetyPage() {
  return (
    <main className="safetyPage">
      <header className="safetyNav shell">
        <a className="brand" href="/" aria-label="Aspire 101 home"><img src={aspireLogo} alt="" style={logoStyle} /><span>Aspire 101</span></a>
        <nav className="safetyNavLinks"><a href="/discover">Discover</a><a href="/guidelines">Guidelines</a><a href="/terms">Terms</a><a className="button buttonGold" href="/post">Ask campus</a></nav>
      </header>

      <section className="safetyHero shell">
        <div>
          <p className="eyebrow">ASPIRE SAFETY CENTER</p>
          <h1>Connect.<br /><span>Stay in control.</span></h1>
        </div>
        <div className="safetyHeroSide">
          <p>Aspire helps students find each other around real campus needs. You decide who to respond to, who to connect with, and what happens offline.</p>
          <div className="safetyEmergency"><strong>Immediate danger?</strong> Aspire is not an emergency service. Contact local emergency services or your campus safety department.</div>
        </div>
      </section>

      <section className="safetyPrinciples shell" aria-label="Core safety principles">
        <article><span>01</span><strong>Mutual choice</strong><p>A response never forces a match. Both sides choose before private coordination begins.</p></article>
        <article><span>02</span><strong>Context stays visible</strong><p>Paid help, split cost, community help, buying and selling, and collaboration are clearly labeled.</p></article>
        <article><span>03</span><strong>Report + block</strong><p>Report unsafe or abusive conduct and block accounts you do not want to interact with.</p></article>
        <article><span>04</span><strong>Safety ≠ a star score</strong><p>Serious safety reports are handled separately from ordinary reputation signals.</p></article>
      </section>

      <section className="safetySection shell">
        <div className="safetySectionHead"><h2>Different request.<br />Different risk.</h2><p>Safety prompts should match what students are actually doing — not interrupt every interaction with the same generic warning.</p></div>
        <div className="safetyScenarioGrid">
          <article className="safetyScenario safetyScenarioGold"><i>↗</i><h3>Rides</h3><p>Confirm the driver, vehicle, route, pickup point, destination, and cost before leaving.</p><ul><li>Do not enter a vehicle if something feels wrong.</li><li>Share trip details with someone you trust when appropriate.</li><li>Drivers are responsible for required licenses, insurance, and legal compliance.</li></ul></article>
          <article className="safetyScenario"><i>$</i><h3>Paid help</h3><p>Agree on the scope, amount, timing, and what counts as complete before work begins.</p><ul><li>Do not change the deal after work starts without mutual agreement.</li><li>Keep a record of the agreed details.</li><li>Off-platform payments may not be verifiable by Aspire.</li></ul></article>
          <article className="safetyScenario"><i>□</i><h3>Buy & sell</h3><p>Inspect items before paying and use a sensible meetup location.</p><ul><li>Be cautious with deposits or pressure to pay early.</li><li>Do not trade prohibited or illegal items.</li><li>Keep item condition and price clear.</li></ul></article>
          <article className="safetyScenario"><i>+</i><h3>Private residences</h3><p>Share exact addresses only after you choose who to connect with.</p><ul><li>Consider having another person present.</li><li>Keep valuables and sensitive documents secured.</li><li>End the interaction if boundaries are ignored.</li></ul></article>
          <article className="safetyScenario"><i>✦</i><h3>Study + community</h3><p>Community help should stay voluntary and clear.</p><ul><li>No money should be implied when a request is labeled community help.</li><li>Academic help must follow school rules.</li><li>Do not use Aspire for contract cheating or exam misconduct.</li></ul></article>
          <article className="safetyScenario"><i>!</i><h3>Scams + pressure</h3><p>Slow down when someone creates urgency, changes payment instructions, or asks for sensitive information.</p><ul><li>Never share passwords or verification codes.</li><li>Be cautious with unusual payment links.</li><li>Report suspicious behavior through Aspire.</li></ul></article>
        </div>
      </section>

      <section className="safetySection shell">
        <div className="safetySectionHead"><h2>How a connection<br />should happen.</h2><p>Aspire is designed around mutual consent. The platform should make it obvious when someone is only interested versus when both people have actually agreed to connect.</p></div>
        <div className="safetyFlow">
          <article><b>01</b><h3>Request</h3><p>A student posts a need with its category and exchange type.</p></article>
          <article><b>02</b><h3>Respond</h3><p>Another student says they can help. That is interest, not a commitment.</p></article>
          <article><b>03</b><h3>Choose</h3><p>The requester chooses whether they want to connect with that responder.</p></article>
          <article><b>04</b><h3>Confirm</h3><p>The responder confirms. Only then should private coordination open.</p></article>
          <article><b>05</b><h3>Complete</h3><p>After the interaction, both sides can give context-specific feedback or report a problem.</p></article>
        </div>
      </section>

      <section className="safetySection shell">
        <div className="safetySectionHead"><h2>Your controls.</h2><p>Safety tools should be easy to reach from requests, profiles, connections, and private chat — not hidden in legal pages.</p></div>
        <div className="safetyControlGrid">
          <article className="safetyControlCard"><span>REPORT</span><h3>Tell Aspire what happened.</h3><p>Reports can include scams, harassment, unsafe conduct, illegal activity, hate, sexual misconduct, or other misuse. Serious reports belong in the safety system, not public ratings.</p><a href="/guidelines">See what is not allowed ↗</a></article>
          <article className="safetyControlCard"><span>BLOCK</span><h3>Stop seeing an account.</h3><p>Blocking removes that account from your discovery experience and should prevent unwanted future contact through Aspire where technically supported.</p><a href="/discover">Try request discovery ↗</a></article>
          <article className="safetyControlCard"><span>VERIFICATION</span><h3>A signal, not a guarantee.</h3><p>Email, school, or future identity verification can add context. Verification does not mean Aspire guarantees a person is safe, qualified, licensed, or trustworthy.</p></article>
          <article className="safetyControlCard"><span>REPUTATION</span><h3>Would you connect again?</h3><p>Aspire can show completed interactions and context-specific feedback instead of reducing a person to one giant star score. Safety enforcement remains separate.</p></article>
        </div>
      </section>

      <section className="safetyLegalStrip shell">
        <div><h3>Safety works with rules, not instead of them.</h3><p>Our product controls work alongside Aspire’s Community Guidelines, Terms, and Privacy Policy. Final production legal language should be reviewed by qualified counsel before broad launch or regulated payment/transport expansion.</p></div>
        <nav><a href="/guidelines">Guidelines</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a></nav>
      </section>
    </main>
  );
}
