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
      <section className={styles.hero}><div><p className={styles.eyebrow}>COMMUNITY · ASPIRE 101</p><h1>Keep campus<br/>helpful.</h1></div><div className={styles.heroMeta}><p><strong>Last updated:</strong> September 4, 2026</p><p>Aspire works best when requests are clear, respectful, useful, and safe for the students on both sides.</p></div></section>
      <div className={styles.content}><nav className={styles.toc}><a href="#respect">01 · Respect people</a><a href="#honest">02 · Be honest</a><a href="#safe">03 · Keep it safe</a><a href="#academic">04 · Academic integrity</a><a href="#privacy">05 · Protect privacy</a><a href="#report">06 · Report problems</a></nav><article className={styles.doc}>
        <section id="respect" className={styles.section}><h2>1. Respect people</h2><p>No harassment, threats, hate, discriminatory abuse, sexual exploitation, stalking, or targeted intimidation. Treat other students like people you may actually see on campus tomorrow.</p></section>
        <section id="honest" className={styles.section}><h2>2. Be honest about requests</h2><p>Describe what you need accurately. Do not misrepresent prices, identity, availability, qualifications, items for sale, project expectations, or where a meetup will occur. Do not spam or create deceptive listings.</p></section>
        <section id="safe" className={styles.section}><h2>3. Keep it safe and legal</h2><p>Do not use Aspire for illegal goods or services, weapons, dangerous materials, fraud, theft, unlicensed regulated services, or activities that create unreasonable risk. Follow campus rules and local law.</p></section>
        <section id="academic" className={styles.section}><h2>4. Academic integrity</h2><p>Study partners, tutoring, explanations, class advice, and collaboration are welcome when allowed by the course. Requests for cheating, impersonation, taking exams for someone else, or completing prohibited coursework are not.</p></section>
        <section id="privacy" className={styles.section}><h2>5. Protect privacy</h2><p>Do not post someone else’s private contact information, exact address, identity documents, private messages, or sensitive personal data without permission. Share only what is necessary to complete a request.</p></section>
        <section id="report" className={styles.section}><h2>6. Report problems</h2><p>If a request, account, or interaction seems unsafe or abusive, stop the interaction and use available reporting tools or contact <a href="mailto:team@aspires101.com">team@aspires101.com</a>. For emergencies or imminent danger, contact local authorities or campus emergency services.</p></section>
        <p className={styles.note}>These guidelines carry forward the safety principles from Aspire’s earlier site and will continue to evolve as new request types and campus communities are added.</p>
      </article></div>
    </main>
  </div>;
}
