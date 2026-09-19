import AppDock from '../AppDock';
import UiIcon from '../UiIcon';
import styles from './page.module.css';

const examples = [
  {
    tag: 'PICKUP',
    reward: '$5',
    title: 'Pick up my package from Hillenbrand',
    meta: 'Hillenbrand Hall → WALC area · Today'
  },
  {
    tag: 'FREE HELP',
    reward: 'Free',
    title: 'Bring this textbook across campus',
    meta: 'Library → residence hall · Flexible timing'
  },
  {
    tag: 'FLEXIBLE',
    reward: 'Discuss',
    title: 'Need a small item delivered before 7 PM',
    meta: 'Campus pickup → drop-off · Reward negotiable'
  }
];

export default function DeliveryPage() {
  return (
    <main className={styles.page}>
      <AppDock active="delivery" />

      <div className={styles.shell}>
        <header className={styles.hero}>
          <div className={styles.heroCopy}>
            <span>ASPIRE DELIVERY</span>
            <h1>Delivery Requests</h1>
            <p>Post a pickup, errand, or campus delivery request.</p>
            <div className={styles.heroActions}>
              <a className={styles.primary} href="/post"><UiIcon name="plus" /> Post a delivery request</a>
              <a href="/activity">My delivery requests</a>
            </div>
          </div>

          <aside className={styles.heroNote}>
            <span>SAME CAMPUS</span>
            <strong>Ask nearby students for a hand.</strong>
            <p>Choose free help, a fixed reward, or a flexible amount.</p>
          </aside>
        </header>

        <section className={styles.flow} aria-label="How Aspire Delivery works">
          <div className={styles.flowHeading}>
            <div><span>HOW IT WORKS</span><h2>Three simple steps.</h2></div>
            <p>Choose someone first. Share exact details privately.</p>
          </div>
          <div className={styles.steps}>
            <article><i>1</i><div><strong>Post a request</strong><p>Add pickup, drop-off, timing, and the item.</p></div></article>
            <article><i>2</i><div><strong>Choose who helps</strong><p>Nearby students respond. You choose who to connect with.</p></div></article>
            <article><i>3</i><div><strong>Coordinate & complete</strong><p>Chat, confirm the plan, and mark it complete.</p></div></article>
          </div>
        </section>

        <section className={styles.requestSection}>
          <div className={styles.sectionHeading}>
            <div><span>EXAMPLES</span><h2>What people can ask for</h2></div>
            <a href="/discover">Browse campus requests →</a>
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
            <span>DELIVERY REQUESTS ≠ MARKETPLACE ORDERS</span>
            <strong>Buying or selling an item?</strong>
            <p>Orders keeps payment, meetup, carrier shipping, receipt confirmation, and payout attached to the marketplace transaction.</p>
          </div>
          <a href="/transactions">Go to Orders →</a>
        </section>
      </div>
    </main>
  );
}
