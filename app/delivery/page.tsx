import AppDock from '../AppDock';
import UiIcon from '../UiIcon';
import styles from './page.module.css';

const examples = [
  { tag: 'PICKUP', reward: '$5', title: 'Pick up my package from Hillenbrand', meta: 'Hillenbrand Hall → WALC · Today' },
  { tag: 'FREE HELP', reward: 'Free', title: 'Bring this textbook across campus', meta: 'Library → residence hall · Flexible' },
  { tag: 'FLEXIBLE', reward: 'Discuss', title: 'Need a small item delivered before 7 PM', meta: 'Campus pickup → drop-off · Reward negotiable' }
];

export default function DeliveryPage() {
  return (
    <main className={styles.page}>
      <AppDock active="activity" />

      <div className={styles.shell}>
        <header className={styles.hero}>
          <div className={styles.heroCopy}>
            <span>DELIVERY</span>
            <h1>Campus delivery</h1>
            <p>Ask another student to pick something up, carry it across campus, or help with a quick errand.</p>
            <div className={styles.heroActions}>
              <a className={styles.primary} href="/post"><UiIcon name="plus" /> Create request</a>
              <a href="/activity">View my posts</a>
            </div>
          </div>

          <aside className={styles.heroNote}>
            <span>PRIVATE BY DEFAULT</span>
            <strong>Share the broad area first.</strong>
            <p>Choose who helps before sharing exact pickup or drop-off details.</p>
          </aside>
        </header>

        <section className={styles.flow} aria-label="How campus delivery works">
          <div className={styles.flowHeading}>
            <div><span>HOW IT WORKS</span><h2>Simple from post to handoff.</h2></div>
            <p>One clear flow, with details moving private only after you connect.</p>
          </div>
          <div className={styles.steps}>
            <article><i>01</i><div><strong>Post the job</strong><p>Describe the item, broad pickup area, timing, and reward.</p></div></article>
            <article><i>02</i><div><strong>Pick a helper</strong><p>Students respond and you choose who you want to work with.</p></div></article>
            <article><i>03</i><div><strong>Coordinate privately</strong><p>Confirm exact details in chat and mark it complete when finished.</p></div></article>
          </div>
        </section>

        <section className={styles.requestSection}>
          <div className={styles.sectionHeading}>
            <div><span>EXAMPLES</span><h2>Common campus requests</h2></div>
            <a href="/discover">Browse requests →</a>
          </div>

          <div className={styles.requestList}>
            {examples.map((item) => (
              <article key={item.title}>
                <div className={styles.requestIcon} aria-hidden="true">↗</div>
                <div className={styles.requestCopy}>
                  <div><span>{item.tag}</span><b>{item.reward}</b></div>
                  <strong>{item.title}</strong>
                  <small>{item.meta}</small>
                </div>
                <a href="/post">Post similar →</a>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.ordersNote}>
          <div>
            <span>BUYING OR SELLING?</span>
            <strong>Marketplace orders stay separate.</strong>
            <p>Orders keeps payment, meetup or shipping, receipt confirmation, refunds, and payout attached to the purchase.</p>
          </div>
          <a href="/transactions">Open Orders →</a>
        </section>
      </div>
    </main>
  );
}
