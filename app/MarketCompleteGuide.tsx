import UiIcon from './UiIcon';
import styles from './MarketCompleteGuide.module.css';

const steps = [
  { icon: 'search' as const, eyebrow: 'DISCOVER', title: 'Made for campus', body: 'See listings around the campus you are actually browsing.' },
  { icon: 'cart' as const, eyebrow: 'FLEXIBLE', title: 'Get it your way', body: 'Meet up, ship it, or use a delivery option when the seller offers one.' },
  { icon: 'shield' as const, eyebrow: 'CONNECTED', title: 'Keep the trail', body: 'Orders, payment status, handoff details, and support stay in one place.' }
];

export default function MarketCompleteGuide() {
  return (
    <section className={styles.wrap} aria-label="How Aspire Market works">
      <div className={styles.inner}>
        <div className={styles.heading}>
          <div><span>WHY ASPIRE MARKET</span><h2>Campus deals, minus the random DMs.</h2></div>
          <p>Browse real listings, see the handoff options before you buy, and keep the transaction organized.</p>
        </div>
        <div className={styles.steps}>
          {steps.map((step) => <article key={step.eyebrow} className={styles.step}><div className={styles.icon}><UiIcon name={step.icon} /></div><span>{step.eyebrow}</span><h3>{step.title}</h3><p>{step.body}</p></article>)}
        </div>
        <div className={styles.actions}>
          <div className={styles.actionCopy}><span>GOT SOMETHING TO MOVE?</span><strong>Turn it into a listing and put it in front of students browsing your campus.</strong></div>
          <div className={styles.links}>
            <a className={styles.primary} href="/post?mode=sell"><UiIcon name="plus" /> Sell an item</a>
            <a href="/transactions"><UiIcon name="wallet" /> Orders</a>
            <a href="/marketplace-rules"><UiIcon name="shield" /> Market rules</a>
            <a href="/safety"><UiIcon name="check" /> Safety</a>
          </div>
        </div>
      </div>
    </section>
  );
}
