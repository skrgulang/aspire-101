import type { Metadata } from 'next';
import { aspireLogo } from '../logo';
import styles from '../legal.module.css';

export const metadata: Metadata = {
  title: 'Terms of Service — Aspire 101',
  description: 'Terms governing use of Aspire 101.'
};

const toc = [
  ['scope','Scope & acceptance'],['role','What Aspire is'],['eligibility','Eligibility & accounts'],['conduct','User conduct'],['connections','Responses & mutual connections'],['requests','Requests, meetups & safety'],['reputation','Reviews & reputation'],['payments','Payments'],['content','Content & IP'],['third','Third-party services'],['liability','Disclaimers & liability'],['changes','Changes & termination'],['law','Law & disputes'],['contact','Contact']
];

export default function TermsPage(){
  return <div className={styles.page}>
    <header className={styles.header}><div className={styles.headerInner}>
      <a className={styles.brand} href="/"><img src={aspireLogo} alt=""/><span>Aspire 101</span></a>
      <nav className={styles.nav}><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/guidelines">Guidelines</a><a className={styles.cta} href="/signup">Join Aspire</a></nav>
    </div></header>

    <main className={styles.main}>
      <section className={styles.hero}>
        <div><p className={styles.eyebrow}>LEGAL · ASPIRE 101</p><h1>Terms of<br/>Service.</h1></div>
        <div className={styles.heroMeta}><p><strong>Last updated:</strong> September 4, 2026</p><p>These Terms govern access to Aspire’s request, discovery, mutual matching, messaging, reputation, and community features.</p></div>
      </section>

      <div className={styles.content}>
        <nav className={styles.toc}>{toc.map(([id,label],i)=><a key={id} href={`#${id}`}>{String(i+1).padStart(2,'0')} · {label}</a>)}</nav>
        <article className={styles.doc}>
          <section id="scope" className={styles.section}><h2>1. Scope & acceptance</h2><p>By accessing or using Aspire 101 (“Aspire,” “Platform,” “we,” “us”), you agree to these Terms, our <a href="/privacy">Privacy Policy</a>, and our <a href="/guidelines">Community Guidelines</a>. If you do not agree, do not use the Platform.</p></section>

          <section id="role" className={styles.section}><h2>2. What Aspire is</h2><p>Aspire provides tools that help students discover requests, post needs, find classmates or collaborators, coordinate rides or practical help, exchange items, and connect around campus life. Aspire is a discovery and coordination platform; unless explicitly stated otherwise, we do not perform, employ, supervise, insure, or guarantee the offline services or interactions arranged between users.</p><div className={styles.callout}><strong>Important:</strong> Users remain responsible for deciding whom to interact with, what arrangements to accept, and whether an offline activity is appropriate and safe.</div></section>

          <section id="eligibility" className={styles.section}><h2>3. Eligibility & accounts</h2><ul><li>You must satisfy the minimum age required by applicable law and any age requirement shown during registration.</li><li>Provide accurate information and protect your login credentials.</li><li>You are responsible for activity under your account.</li><li>Aspire may use one account reputation across requester and responder activity because users are not assigned a permanent worker or customer role.</li><li>We may limit or suspend access when reasonably necessary for safety, compliance, fraud prevention, or enforcement of these Terms.</li></ul></section>

          <section id="conduct" className={styles.section}><h2>4. User conduct</h2><p>You may not use Aspire to facilitate illegal, fraudulent, dangerous, abusive, harassing, hateful, exploitative, privacy-invasive, or infringing activity. This includes illegal goods or services, weapons, hazardous materials, academic cheating or contract cheating, scams, impersonation, scraping, spam, unauthorized access, threats, violence, coercion, stalking, or conduct that puts other users at unreasonable risk.</p></section>

          <section id="connections" className={styles.section}><h2>5. Responses & mutual connections</h2><ul><li>Responding to a request shows interest; it does not automatically create an obligation, employment relationship, transaction, or guaranteed match.</li><li>The requester may choose whether to accept a response, and a responder may withdraw or decline before a connection is confirmed, subject to any separate agreement already made between users.</li><li>Aspire may limit private messaging so that conversation begins from a request or accepted connection rather than unsolicited contact.</li><li>Both users remain responsible for communicating clearly and voluntarily agreeing to timing, scope, price, transportation, meetup details, or other terms.</li></ul></section>

          <section id="requests" className={styles.section}><h2>6. Requests, meetups & safety</h2><ul><li>Check request details and the other user before meeting, paying, giving access to property, or sharing sensitive information.</li><li>Use public, well-lit locations when appropriate and follow campus and local rules.</li><li>Clarify price, timing, scope, transportation, and expectations before committing.</li><li>Do not assume an approximate distance or campus label reveals another person’s precise address; users should intentionally share exact meetup details only when appropriate.</li><li>For rides, moving help, professional work, or other higher-risk activities, users are responsible for any licenses, insurance, permissions, or qualifications that may be required.</li><li>Use reporting tools or contact us if you encounter abuse, fraud, threats, violence, or unsafe behavior. For emergencies or imminent danger, contact local authorities or campus emergency services.</li></ul></section>

          <section id="reputation" className={styles.section}><h2>7. Reviews & reputation</h2><p>Aspire may allow users to review one another after eligible completed connections. Reputation may include ratings, experience tags, completed-connection counts, account status, or a “would connect again” style signal.</p><ul><li>Reviews must reflect genuine interactions and may not be purchased, fabricated, manipulated, extorted, or used for retaliation.</li><li>Aspire may use blind or delayed review publication to reduce retaliatory behavior.</li><li>Safety reports are separate from ordinary ratings. A low rating is not a substitute for reporting serious misconduct.</li><li>We may remove reviews or adjust reputation systems when necessary to address fraud, abuse, manipulation, or product integrity.</li></ul></section>

          <section id="payments" className={styles.section}><h2>8. Payments</h2><p>Some requests may include a suggested budget or payment arrangement between users. Unless Aspire expressly offers an in-product payment service, payment terms are arranged directly between users and Aspire is not the merchant, employer, or escrow agent. If paid Aspire features are introduced, pricing and any refund terms will be shown before purchase.</p></section>

          <section id="content" className={styles.section}><h2>9. Content & intellectual property</h2><p>You retain ownership of content you create. By submitting content to Aspire, you grant us a non-exclusive license to host, store, display, transmit, moderate, and technically process that content as needed to operate and improve the Platform. You must have the rights needed to post what you submit.</p><p>Aspire’s name, branding, software, design, and original platform materials are owned by Aspire or its licensors and may not be copied or misused without permission.</p></section>

          <section id="third" className={styles.section}><h2>10. Third-party services</h2><p>Aspire may use or link to third-party services such as hosting, databases, maps, email, analytics, social platforms, payment providers, or campus/partner tools. Those services are governed by their own terms and policies.</p></section>

          <section id="liability" className={styles.section}><h2>11. Disclaimers & liability</h2><p>Aspire is provided on an “as is” and “as available” basis to the maximum extent permitted by law. We do not guarantee that every request will receive a response, that another user is reliable or qualified, that a rating is perfectly accurate, or that an interaction will achieve a particular result.</p><p>To the maximum extent permitted by applicable law, Aspire is not responsible for losses arising from arrangements, transactions, rides, meetups, services, property exchanges, or other offline interactions between users. Nothing in these Terms limits rights or liabilities that cannot legally be excluded.</p></section>

          <section id="changes" className={styles.section}><h2>12. Changes, suspension & termination</h2><p>We may change features, update these Terms, remove content, or suspend or terminate access when reasonably necessary to operate Aspire, protect the community, comply with law, or address misuse. Material changes to these Terms may be communicated through the Platform or another appropriate channel.</p></section>

          <section id="law" className={styles.section}><h2>13. Law & disputes</h2><p>These Terms are subject to applicable law and do not override mandatory consumer or privacy rights. The governing-law, venue, and any arbitration provisions for Aspire’s final operating entity should be confirmed before paid or broad public launch.</p></section>

          <section id="contact" className={styles.section}><h2>14. Contact</h2><p>Legal questions can be sent to <a href="mailto:legal@aspires101.com">legal@aspires101.com</a>.</p></section>
          <p className={styles.note}>These Terms preserve the core framework from Aspire’s earlier site while reflecting the current request, response, mutual connection, messaging, and reputation model. Final production terms should be reviewed by qualified counsel.</p>
        </article>
      </div>
    </main>
  </div>;
}
