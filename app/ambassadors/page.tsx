import type { Metadata } from 'next';
import { aspireLogo } from '../logo';
import styles from './ambassadors.module.css';

export const metadata: Metadata = {
  title: 'Campus Ambassador Program — Aspire 101',
  description: 'Help grow Aspire 101 on your campus and shape the student community from the beginning.'
};

const applicationUrl = process.env.NEXT_PUBLIC_AMBASSADOR_FORM_URL || 'mailto:team@aspires101.com?subject=Aspire%20101%20Campus%20Ambassador%20Application';

const benefits = [
  ['Leadership experience', 'Own real campus growth projects and build experience you can talk about.'],
  ['Founder access', 'Share feedback directly with the Aspire 101 team and help shape what gets built.'],
  ['Campus network', 'Meet student builders, organizers, creators, and early community leaders.'],
  ['Early opportunities', 'Get first look at future Aspire 101 campus initiatives and team opportunities.']
];

const responsibilities = [
  'Introduce Aspire 101 to students, clubs, and communities that would genuinely use it.',
  'Help organize small campus activations, tabling, demos, or student meetups.',
  'Recruit the first useful users and help create healthy early activity on campus.',
  'Send product feedback from your campus so Aspire can improve quickly.'
];

const ideal = [
  'Currently enrolled college student',
  'Organized, reliable, and comfortable taking initiative',
  'Connected to student communities, clubs, dorms, or campus organizations',
  'Interested in startups, community building, marketing, or product growth',
  'Able to commit a few consistent hours each week during active launch periods'
];

export default function AmbassadorsPage() {
  return (
    <main className={styles.page}>
      <header className={styles.nav}>
        <a className={styles.brand} href="/">
          <img src={aspireLogo} alt="" />
          <span>Aspire <b>101</b></span>
        </a>
        <nav className={styles.navLinks} aria-label="Campus ambassador navigation">
          <a href="#role">The role</a>
          <a href="#process">How it works</a>
          <a href="#faq">FAQ</a>
        </nav>
        <a className={styles.navCta} href={applicationUrl} target={applicationUrl.startsWith('http') ? '_blank' : undefined} rel="noreferrer">Apply now</a>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>CAMPUS AMBASSADOR PROGRAM</p>
          <h1>Build Aspire 101<br /><span>at your campus.</span></h1>
          <p className={styles.heroLead}>Be one of the students who helps Aspire 101 become useful locally. Build community, create opportunities, and help shape the product from the beginning.</p>
          <div className={styles.heroActions}>
            <a className={styles.primaryCta} href={applicationUrl} target={applicationUrl.startsWith('http') ? '_blank' : undefined} rel="noreferrer">Apply to your campus <span>→</span></a>
            <a className={styles.secondaryCta} href="#role">See what you’ll do</a>
          </div>
          <div className={styles.heroMeta}>
            <span><b>Student-led</b><small>Built around real campus communities</small></span>
            <span><b>Early-stage</b><small>Direct input into growth and product</small></span>
            <span><b>Multi-campus</b><small>Recruiting across U.S. universities</small></span>
          </div>
        </div>

        <aside className={styles.applyCard} aria-label="Campus ambassador application">
          <div className={styles.cardIcon}>↗</div>
          <p className={styles.cardEyebrow}>APPLICATIONS OPEN</p>
          <h2>Represent Aspire 101 on your campus.</h2>
          <p>Tell us who you are, what campus you’re part of, and why you want to help build the community.</p>
          <dl>
            <div><dt>Time</dt><dd>Flexible, campus-based</dd></div>
            <div><dt>Focus</dt><dd>Growth · Events · Community · Feedback</dd></div>
            <div><dt>Who</dt><dd>Current college students</dd></div>
          </dl>
          <a href={applicationUrl} target={applicationUrl.startsWith('http') ? '_blank' : undefined} rel="noreferrer">Open application form <span>→</span></a>
          <small>Applications are reviewed on a rolling basis.</small>
        </aside>
      </section>

      <section className={styles.section} id="role">
        <div className={styles.sectionIntro}>
          <p className={styles.eyebrow}>WHY JOIN</p>
          <h2>More than a title.<br />A real campus-building role.</h2>
          <p>You’ll work on the early problems that actually matter: finding the first users, creating trusted campus activity, and telling us what students really need.</p>
        </div>
        <div className={styles.benefitGrid}>
          {benefits.map(([title, copy], index) => (
            <article key={title}>
              <span>0{index + 1}</span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={`${styles.section} ${styles.twoColumn}`}>
        <div className={styles.panel}>
          <p className={styles.eyebrow}>WHAT YOU’LL DO</p>
          <h2>Launch with intention.</h2>
          <ul>{responsibilities.map((item) => <li key={item}><span>✓</span>{item}</li>)}</ul>
        </div>
        <div className={styles.panel}>
          <p className={styles.eyebrow}>WHO WE’RE LOOKING FOR</p>
          <h2>Students who make things happen.</h2>
          <ul>{ideal.map((item) => <li key={item}><span>✓</span>{item}</li>)}</ul>
        </div>
      </section>

      <section className={styles.process} id="process">
        <div className={styles.processHead}>
          <div><p className={styles.eyebrow}>HOW IT WORKS</p><h2>Simple application. Real ownership.</h2></div>
          <p>We care more about initiative and campus understanding than having a perfect résumé.</p>
        </div>
        <div className={styles.steps}>
          <article><span>1</span><h3>Apply</h3><p>Share your school, involvement, interests, and why Aspire 101 interests you.</p></article>
          <article><span>2</span><h3>Review</h3><p>We review applications on a rolling basis and look for campus fit and initiative.</p></article>
          <article><span>3</span><h3>Conversation</h3><p>Selected applicants have a short conversation with the Aspire 101 team.</p></article>
          <article><span>4</span><h3>Launch</h3><p>Get resources, goals, and direct team support to start building locally.</p></article>
        </div>
      </section>

      <section className={styles.schools}>
        <p className={styles.eyebrow}>EARLY CAMPUS RECRUITING</p>
        <h2>UC Berkeley · UCLA · UC Davis · UC Irvine · UC San Diego · Purdue · and more.</h2>
        <p>Don’t see your school? Apply anyway. Strong campus builders can help us decide where Aspire 101 launches next.</p>
      </section>

      <section className={styles.faq} id="faq">
        <div><p className={styles.eyebrow}>COMMON QUESTIONS</p><h2>Before you apply.</h2></div>
        <div className={styles.faqList}>
          <details><summary>Is this a paid position?</summary><p>Campus Ambassador participation is a student leadership and growth program. Any paid project, internship, stipend, reward, or other compensation opportunity will be described separately in writing before you accept it.</p></details>
          <details><summary>How much time does it take?</summary><p>The program is designed to be flexible around classes. Time varies by launch activity, but consistency matters more than being online every day.</p></details>
          <details><summary>Do I need marketing experience?</summary><p>No. We care about initiative, reliability, communication, and understanding your campus community.</p></details>
          <details><summary>Can I apply if Aspire 101 is not active at my school yet?</summary><p>Yes. That is exactly when a strong ambassador can be most useful.</p></details>
        </div>
      </section>

      <section className={styles.finalCta}>
        <div><p className={styles.eyebrow}>READY?</p><h2>Build something students at your campus will actually use.</h2></div>
        <a href={applicationUrl} target={applicationUrl.startsWith('http') ? '_blank' : undefined} rel="noreferrer">Apply for Campus Ambassador <span>→</span></a>
      </section>

      <footer className={styles.footer}>
        <a className={styles.brand} href="/"><img src={aspireLogo} alt="" /><span>Aspire <b>101</b></span></a>
        <p>Students. Ideas. Opportunities.</p>
        <div><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="mailto:team@aspires101.com">Contact</a></div>
      </footer>
    </main>
  );
}
