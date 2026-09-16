import AppDock from '../AppDock';
import UiIcon from '../UiIcon';
import styles from './page.module.css';

export default function DeliveryPage() {
  return (
    <main className={styles.page}>
      <AppDock active="activity" />
      <div className={styles.shell}>
        <header className={styles.hero}>
          <span>ASPIRE DELIVERY</span>
          <h1>Need something moved across campus?</h1>
          <p>Post a delivery or errand request and let another Aspirer help. Keep it free, offer a reward, or negotiate in the connection.</p>
          <div className={styles.heroActions}>
            <a className={styles.primary} href="/post"><UiIcon name="plus" /> Post a delivery request</a>
            <a href="/transactions">View order deliveries</a>
          </div>
        </header>

        <section className={styles.steps}>
          <article><i>1</i><div><strong>Post what needs moving</strong><p>Choose <b>Pick this up</b>, add the pickup area, drop-off area, timing, and what is being delivered.</p></div></article>
          <article><i>2</i><div><strong>Choose free, paid, or flexible</strong><p>Use Community for free help, Paid help for a fixed reward, or explain that the reward is negotiable in the post.</p></div></article>
          <article><i>3</i><div><strong>Pick who you trust</strong><p>Nearby Aspirers can respond. You choose who to connect with; Aspire does not force a random assignment.</p></div></article>
          <article><i>4</i><div><strong>Coordinate privately</strong><p>Share exact pickup instructions only after you connect. Keep public posts to an area such as “Hillenbrand Hall area.”</p></div></article>
        </section>

        <section className={styles.examples}>
          <div><span>STANDALONE</span><strong>Pick up my package from Hillenbrand</strong><small>Drop off: WALC area · Reward: $5</small></div>
          <div><span>FREE HELP</span><strong>Can anyone bring this textbook across campus?</strong><small>Reward: Free · Flexible timing</small></div>
          <div><span>NEGOTIABLE</span><strong>Need a small item delivered before 7 PM</strong><small>Reward: Negotiable · Make an offer in chat</small></div>
        </section>
      </div>
    </main>
  );
}
