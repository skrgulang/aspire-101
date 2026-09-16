import styles from './OrderWayfinder.module.css';

const methods = [
  {
    key: 'meet',
    icon: '◎',
    title: 'Meet up',
    price: 'Free',
    description: 'Meet the seller on campus or nearby. Agree on a public place and time, then confirm the handoff.',
    action: 'Use for local pickup',
    href: '/marketplace'
  },
  {
    key: 'ship',
    icon: '▣',
    title: 'Ship to me',
    price: 'Calculated',
    description: 'Use carrier shipping for cross-campus or cross-city orders. Rates, labels, and tracking stay with the order.',
    action: 'Browse shippable items',
    href: '/marketplace'
  },
  {
    key: 'aspirer',
    icon: '↗',
    title: 'Ask an Aspirer',
    price: 'Free · Paid · Negotiable',
    description: 'Post a delivery or errand request for another student to help. They can accept, help for free, or agree on a reward.',
    action: 'Post a delivery request',
    href: '/post?delivery=1'
  }
];

export default function OrderWayfinder() {
  return (
    <section className={styles.section} aria-label="Marketplace delivery choices">
      <div className={styles.heading}>
        <div>
          <span>HOW FULFILLMENT WORKS</span>
          <h2>One order. Three ways to get it.</h2>
        </div>
        <p>Choose the handoff that fits the transaction. Marketplace orders stay in Orders; delivery help can also be posted separately.</p>
      </div>

      <div className={styles.grid}>
        {methods.map((method) => (
          <article className={styles.card} key={method.key}>
            <div className={styles.icon} aria-hidden="true">{method.icon}</div>
            <div className={styles.copy}>
              <div className={styles.titleRow}>
                <h3>{method.title}</h3>
                <strong>{method.price}</strong>
              </div>
              <p>{method.description}</p>
            </div>
            <a href={method.href}>{method.action} <span>→</span></a>
          </article>
        ))}
      </div>

      <div className={styles.flow}>
        <span>PRODUCT</span><i>→</i><span>CHOOSE DELIVERY</span><i>→</i><span>PAYMENT</span><i>→</i><span>TRACK / MEET</span><i>→</i><span>CONFIRM</span><i>→</i><span>PAYOUT</span>
      </div>
    </section>
  );
}
