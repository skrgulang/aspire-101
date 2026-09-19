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
      <AppDock active="activity" />

      <div className={styles.shell}>
        <header className={styles.hero}>
          <div className={styles.heroCopy}>
            <span>ASPIRE DELIVERY</span>
            <h1>Delivery Requests</h1>
            <p>Post a pickup, errand, or campus delivery request. You choose who to connect with, then coordinate privately.</p>
            <div className={styles.heroActions}>
              <a className={styles.primary} href="/post"><UiIcon name="plus" /> Post a delivery request</a>
              <a href="/activity">My delivery requests</a>
            </div>
          </div>

          <aside className={styles.heroNote}>
            <span>SAME CAMPUS</span>
            <strong>Ask nearby students for a hand.</strong>
            <p>Free help, a fixed reward, or something flexible — set the expectation in your post.</p>
          </aside>
        </header>

        <section className={styles.flow} aria-label="How Aspire Delivery works">
          <div className={styles.flowHeading}>
            <div><span>HOW IT WORKS</span><h2>Post. Connect. Coordinate.</h2></div>
            <p>Exact pickup details stay private until you choose a person.</p>
          </div>
          <div className={styles.steps}>
            <article><i>1</i><div><strong>Post a request</strong><p>Add the pickup area, drop-off area, timing, and what needs moving.</p></div></article>
            <article><i>2</i><div><strong>Choose who helps</strong><p>Nearby Aspirers can respond. You decide who you want to connect with.</p></div></article>
            <article><i>3</i><div><strong>Coordinate & complete</strong><p>Chat privately, confirm the details, then close the request when it is done.</p></div></article>
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
