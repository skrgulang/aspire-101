import type { Metadata } from 'next';
import { aspireLogo } from '../logo';
import styles from '../legal.module.css';

export const metadata: Metadata = {
  title: 'Community Guidelines — Aspire 101',
  description: 'Community standards for Aspire 101.'
};

export default function GuidelinesPage(){
  return <div className={styles.page}>
    <header className={styles.header}><div className={styles.headerInner}>
      <a className={styles.brand} href="/"><img src={aspireLogo} alt=""/><span>Aspire 101</span></a>
      <nav className={styles.nav}><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/guidelines">Guidelines</a><a className={styles.cta} href="/signup">Join Aspire</a></nav>
    </div></header>
    <main className={styles.main}>
      <section className={styles.hero}><div><p className={styles.eyebrow}>COMMUNITY · ASPIRE 101</p><h1>Keep campus<br/>helpful.</h1></div><div className={styles.heroMeta}><p><strong>Last updated:</strong> September 4, 2026</p><p>Aspire works best when requests are clear, respectful, voluntary, useful, and safe for the students on both sides.</p></div></section>
      <div className={styles.content}><nav className={styles.toc}><a href="#respect">01 · Respect people</a><a href="#consent">02 · Mutual choice</a><a href="#honest">03 · Be honest</a><a href="#reviews">04 · Review fairly</a><a href="#safe">05 · Keep it safe</a><a href="#academic">06 · Academic integrity</a><a href="#privacy">07 · Protect privacy</a><a href="#report">08 · Report problems</a></nav><article className={styles.doc}>
        <section id="respect" className={styles.section}><h2>1. Respect people</h2><p>No harassment, threats, hate, discriminatory abuse, sexual exploitation, stalking, targeted intimidation, coercion, or violence. Treat other students like people you may actually see on campus tomorrow.</p></section>
        <section id="consent" className={styles.section}><h2>2. Connections require mutual choice</h2><p>A response is an expression of interest, not ownership of a request or entitlement to another person’s time. Requesters may choose whom they want to connect with, responders may withdraw before confirming, and either side should be able to decline respectfully. Do not pressure someone to meet, pay, share contact information, reveal an address, or continue a conversation.</p></section>
        <section id="honest" className={styles.section}><h2>3. Be honest about requests</h2><p>Describe what you need accurately. Do not misrepresent prices, identity, availability, qualifications, items for sale, project expectations, transportation, or where a meetup will occur. Do not spam or create deceptive listings.</p></section>
        <section id="reviews" className={styles.section}><h2>4. Review fairly</h2><p>Reviews and reputation should reflect genuine completed interactions. Do not trade fake reviews, threaten someone over a rating, retaliate because of feedback, manipulate multiple accounts, or use reviews to harass another user. Serious safety issues belong in the reporting system, not only in a star rating.</p></section>
        <section id="safe" className={styles.section}><h2>5. Keep it safe and legal</h2><p>Do not use Aspire for illegal goods or services, weapons, dangerous materials, fraud, theft, unlicensed regulated services, or activities that create unreasonable risk. Follow campus rules and local law. If a situation feels unsafe, end the interaction.</p></section>
        <section id="academic" className={styles.section}><h2>6. Academic integrity</h2><p>Study partners, tutoring, explanations, class advice, and collaboration are welcome when allowed by the course. Requests for cheating, impersonation, taking exams for someone else, or completing prohibited coursework are not.</p></section>
        <section id="privacy" className={styles.section}><h2>7. Protect privacy</h2><p>Do not post someone else’s private contact information, exact address, identity documents, private messages, or sensitive personal data without permission. Approximate campus or distance information is not permission to expose a precise location. Share only what is necessary to complete a request.</p></section>
        <section id="report" className={styles.section}><h2>8. Report problems</h2><p>If a request, account, message, meetup, or interaction seems unsafe or abusive, stop the interaction and use available reporting tools or contact <a href="mailto:team@aspires101.com">team@aspires101.com</a>. Aspire may investigate, remove content, limit contact, suspend accounts, or take other platform-level action when appropriate. For emergencies or imminent danger, contact local authorities or campus emergency services.</p></section>
        <p className={styles.note}>These guidelines carry forward the safety principles from Aspire’s earlier site and now reflect mutual matching, two-way reputation, private request-based chat, and location-aware discovery.</p>
      </article></div>
    </main>
  </div>;
}
