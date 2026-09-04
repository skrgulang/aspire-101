import type { Metadata } from 'next';
import { aspireLogo } from '../logo';
import styles from '../legal.module.css';

export const metadata: Metadata = {
  title: 'Privacy Policy — Aspire 101',
  description: 'How Aspire 101 collects, uses, and protects information.'
};

const toc = [
  ['intro','Introduction'],['collect','Information we collect'],['location','Location data'],['reputation','Reputation & reviews'],['use','How we use information'],['share','How we share information'],['cookies','Cookies & local storage'],['security','Security'],['retention','Retention'],['rights','Your choices & rights'],['children','Age requirements'],['changes','Changes'],['contact','Contact']
];

export default function PrivacyPage(){
  return <div className={styles.page}>
    <header className={styles.header}><div className={styles.headerInner}>
      <a className={styles.brand} href="/"><img src={aspireLogo} alt=""/><span>Aspire 101</span></a>
      <nav className={styles.nav}><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/guidelines">Guidelines</a><a className={styles.cta} href="/signup">Join Aspire</a></nav>
    </div></header>

    <main className={styles.main}>
      <section className={styles.hero}>
        <div><p className={styles.eyebrow}>LEGAL · ASPIRE 101</p><h1>Privacy<br/>Policy.</h1></div>
        <div className={styles.heroMeta}><p><strong>Last updated:</strong> September 4, 2026</p><p>Aspire is built around student requests, nearby discovery, mutual connections, messaging, reputation, and campus relationships. This policy explains what information we use to make those features work.</p></div>
      </section>

      <div className={styles.content}>
        <nav className={styles.toc}>{toc.map(([id,label],i)=><a key={id} href={`#${id}`}>{String(i+1).padStart(2,'0')} · {label}</a>)}</nav>
        <article className={styles.doc}>
          <section id="intro" className={styles.section}><h2>1. Introduction</h2><p>Aspire 101 (“Aspire,” “we,” “us”) provides a college-focused request and matching platform. This Privacy Policy applies to our website, app, and related services and should be read with our <a href="/terms">Terms of Service</a> and <a href="/guidelines">Community Guidelines</a>.</p><div className={styles.callout}><strong>Contact:</strong> <a href="mailto:legal@aspires101.com">legal@aspires101.com</a></div></section>

          <section id="collect" className={styles.section}><h2>2. Information we collect</h2><ul><li><strong>Account information:</strong> name or nickname, email, school, profile details, avatar, and authentication information.</li><li><strong>Request activity:</strong> requests, responses, saves, categories, budgets, timestamps, match/connection status, and completion information.</li><li><strong>Messages and interactions:</strong> chats opened from accepted connections, reports, support submissions, collaboration proposals, and related metadata.</li><li><strong>Reputation information:</strong> reviews, experience tags, completion counts, account status, and other trust signals associated with an account.</li><li><strong>Technical information:</strong> browser/device information, language, IP address, timestamps, diagnostics, and security logs.</li><li><strong>Optional submissions:</strong> information you send when applying to work with Aspire, including organization details, notes, contact information, or resumes where applicable.</li></ul></section>

          <section id="location" className={styles.section}><h2>3. Location data</h2><p>Aspire can use your location to show nearby requests and make campus discovery more useful. We request browser/device location only after you choose a location-enabled feature or grant permission.</p><ul><li>You can deny location access and use manual campus or city selection instead.</li><li>When precise coordinates are available, they may be used temporarily to calculate proximity, distance, or the nearest campus.</li><li>We aim to display approximate location context rather than exposing precise coordinates to other users unless a feature clearly requires and explains it.</li><li>Exact meetup or home addresses should be shared only when a user intentionally chooses to provide them in an appropriate private context.</li></ul></section>

          <section id="reputation" className={styles.section}><h2>4. Reputation & reviews</h2><p>Aspire may use one reputation profile per account because the same person can be a requester in one interaction and a responder in another. New accounts may appear as “New to Aspire” until enough completed interactions exist to support meaningful trust signals.</p><ul><li>Reputation may include completed-connection counts, ratings, experience tags, or a “would connect again” type signal.</li><li>Reviews may be withheld until both users submit them or until a review window closes to reduce retaliation.</li><li>Safety reports are handled separately from ordinary ratings. A serious report may be visible only to moderation staff even if a public-facing reputation score exists.</li><li>We may remove, limit, or investigate reviews that appear fraudulent, abusive, retaliatory, or manipulated.</li></ul></section>

          <section id="use" className={styles.section}><h2>5. How we use information</h2><ul><li>Operate accounts, profiles, request posting, search, responses, mutual matching, messaging, reputation, and notifications.</li><li>Show relevant requests based on campus, category, search terms, and optional location.</li><li>Help users evaluate whether they want to connect by showing appropriate profile and reputation information.</li><li>Protect users, prevent spam and abuse, moderate content, and investigate reports.</li><li>Respond to support, partnership, ambassador, and collaboration inquiries.</li><li>Improve product performance and usability using aggregated or de-identified information where practical.</li><li>Comply with law and enforce our policies.</li></ul></section>

          <section id="share" className={styles.section}><h2>6. How we share information</h2><p><strong>We do not sell personal information.</strong> We may share information with service providers that help us run Aspire, such as hosting, database, storage, email, analytics, maps, and security providers. We may also disclose information when required by law, needed to protect users, or as part of a business transaction such as a merger or reorganization.</p><p>Information you intentionally post to public or campus-visible areas, including parts of a profile or reputation signal, may be seen by other users according to the feature’s visibility settings.</p></section>

          <section id="cookies" className={styles.section}><h2>7. Cookies & local storage</h2><p>We may use cookies and browser storage for sign-in sessions, preferences, security, and performance. Blocking certain storage may prevent account or personalization features from working correctly.</p></section>

          <section id="security" className={styles.section}><h2>8. Security</h2><p>We use reasonable technical and organizational safeguards, including access controls, encrypted connections, and database/storage policies. No internet service can guarantee perfect security, so avoid sharing unnecessary sensitive information through requests or messages.</p></section>

          <section id="retention" className={styles.section}><h2>9. Retention</h2><p>We retain information for as long as needed to operate Aspire, maintain safety and records, resolve disputes, and meet legal obligations. Account information is generally kept while an account is active. Some safety, moderation, transaction-history, or reputation records may be retained for a reasonable period after an interaction or account closure when needed to prevent abuse or resolve disputes.</p></section>

          <section id="rights" className={styles.section}><h2>10. Your choices & rights</h2><ul><li>Update or correct account information.</li><li>Control browser location permission through your device or browser settings.</li><li>Request access to or deletion of personal information where applicable.</li><li>Withdraw consent for optional processing where consent is the legal basis.</li><li>Exercise additional rights available under laws such as GDPR or California privacy law.</li></ul><p>We may need to verify identity before completing certain requests.</p></section>

          <section id="children" className={styles.section}><h2>11. Age requirements</h2><p>Aspire is designed for college communities and is not directed to children. Account eligibility is governed by our Terms of Service and applicable law.</p></section>

          <section id="changes" className={styles.section}><h2>12. Changes to this policy</h2><p>We may update this policy as Aspire adds features or legal requirements change. When changes are material, we may provide notice in the product, by email, or through another prominent method.</p></section>

          <section id="contact" className={styles.section}><h2>13. Contact</h2><p>Questions about privacy can be sent to <a href="mailto:legal@aspires101.com">legal@aspires101.com</a>.</p></section>
          <p className={styles.note}>This policy carries forward the privacy framework from Aspire’s earlier site and has been updated for the current location, mutual-connection, messaging, and reputation model. Have qualified counsel review final production policies for the jurisdictions where Aspire launches.</p>
        </article>
      </div>
    </main>
  </div>;
}
