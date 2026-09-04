import type { Metadata } from 'next';
import { aspireLogo } from '../logo';
import styles from './ambassadors.module.css';

export const metadata: Metadata = {
  title: 'Campus Ambassadors — Aspire 101',
  description: 'Help bring Aspire to your campus.'
};

export default function AmbassadorsPage() {
  return (
    <main className={styles.page}>
      <header className={styles.nav}>
        <a className={styles.brand} href="/"><img src={aspireLogo} alt="" /><span>Aspire 101</span></a>
        <a className={styles.back} href="/">Back to Aspire ↗</a>
      </header>

      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>CAMPUS AMBASSADORS</p>
          <h1>Bring Aspire<br/><span>to your campus.</span></h1>
        </div>
        <div className={styles.heroCopy}>
          <p>Help launch the first local community, hear what students need, and make Aspire useful at your school.</p>
          <a className={styles.cta} href="mailto:team@aspires101.com?subject=Aspire%20101%20Campus%20Ambassador">Apply to represent your campus ↗</a>
        </div>
      </section>

      <section className={styles.roles}>
        <article><span>01</span><h2>Launch</h2><p>Introduce Aspire to students who would actually use it.</p></article>
        <article><span>02</span><h2>Listen</h2><p>Tell us what your campus needs and what feels off.</p></article>
        <article><span>03</span><h2>Grow</h2><p>Help the first useful requests and connections happen locally.</p></article>
      </section>

      <section className={styles.schools}>
        <p>Early ambassador recruiting</p>
        <strong>UC Berkeley · UCLA · UC Davis · UC Irvine · UC San Diego · Purdue · and more.</strong>
      </section>
    </main>
  );
}
