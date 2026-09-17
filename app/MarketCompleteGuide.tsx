import UiIcon from './UiIcon';
import styles from './MarketCompleteGuide.module.css';

const steps = [
  {
    icon: 'search' as const,
    eyebrow: '01 · FIND',
    title: 'Shop your campus',
    body: 'Search real student listings and filter by meetup, shipping, or Aspirer delivery.'
  },
  {
    icon: 'cart' as const,
    eyebrow: '02 · CHOOSE',
    title: 'Pick the handoff',
    body: 'See the delivery choices and expected cost before you reserve an item.'
  },
  {
    icon: 'shield' as const,
    eyebrow: '03 · COMPLETE',
    title: 'Keep the order together',
    body: 'Protected checkout, order status, delivery details, and resolution tools stay connected.'
  }
];

export default function MarketCompleteGuide() {
  return (
    <section className={styles.wrap} aria-label="How Aspire Market works">
      <div className={styles.inner}>
        <div className={styles.heading}>
          <div>
            <span>ASPIRE MARKET</span>
            <h2>One place from listing to handoff.</h2>
          </div>
          <p>Market is only for items that are actually for sale. Campus requests and wanted posts stay in Browse.</p>
        </div>

        <div className={styles.steps}>
          {steps.map((step) => (
            <article key={step.eyebrow} className={styles.step}>
              <div className={styles.icon}><UiIcon name={step.icon} /></div>
              <span>{step.eyebrow}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </article>
          ))}
        </div>

        <div className={styles.actions}>
          <div className={styles.actionCopy}>
            <span>SELLING SOMETHING?</span>
            <strong>Create the listing in Post, save a private draft, then publish it to Market.</strong>
          </div>
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
