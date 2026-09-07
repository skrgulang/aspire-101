import AppDock from '../AppDock';

const covered = [
  ['Platform payment record', 'Stripe confirms the payment and Aspire keeps the transaction, amount, participants, status, and order history attached to the connection.'],
  ['Delayed seller / provider transfer', 'For eligible Pay with Aspire transactions, Aspire does not create the seller or provider transfer until the product flow says the work or handoff is complete.'],
  ['Payout pause when a marketplace problem is reported', 'If a marketplace dispute is opened before payout release, the seller transfer is paused while the case is reviewed.'],
  ['Refund and dispute workflow', 'Eligible cancellations can be refunded through Stripe. Other refund requests are reviewed using the payment timeline, connection history, and available evidence.'],
  ['Human review', 'Aspire Safety Intelligence can organize risk signals, but an AI model does not decide who receives money in a disputed transaction.']
];

const notCovered = [
  'Aspire Protected is not legal escrow, a bank account, insurance, or a guarantee that every refund request will be approved.',
  'It does not guarantee the physical safety of a meetup or delivery. Use campus/public pickup locations when possible and report unsafe behavior.',
  'It is not a product warranty and does not automatically prove authenticity, ownership, condition, or fitness of an item.',
  'Payments sent by cash, Zelle, Venmo, Cash App, bank transfer, or another off-platform method are outside the Aspire payment record and cannot be reversed by Aspire.',
  'Stripe, card networks, banks, and connected payout accounts may add processing time even after Aspire creates a refund or transfer.'
];

export default function ProtectionPage() {
  return (
    <main className="protectionPage">
      <div className="protectionShell shell">
        <a className="protectionBack" href="/connections">← Back to Connections</a>
        <section className="protectionHero">
          <p>ASPIRE PROTECTED · PAYMENT PROTECTION WORKFLOW</p>
          <h1>Protection should be<br /><em>clear, not vague.</em></h1>
          <span>Pay with Aspire means the payment stays inside a documented Stripe + Aspire transaction flow with delayed payout, refund tools, dispute review, and an audit trail. It does not mean Aspire is a legal escrow service.</span>
          <div className="protectionChoice"><article><b>PAY WITH ASPIRE ✓</b><strong>Protected transaction flow</strong><p>Aspire service fee applies. Stripe processes the payment. Release, refund, and dispute rules stay attached to the connection.</p></article><article><b>DIRECT / IN PERSON</b><strong>Not Aspire Protected</strong><p>No Aspire transaction fee on that payment, but Aspire cannot reverse, recover, or guarantee money sent outside the platform.</p></article></div>
        </section>

        <section className="protectionFlow">
          <header><p>HOW IT WORKS</p><h2>Money moves only after the <em>right event.</em></h2></header>
          <div><span><i>1</i><b>Agree</b><small>Both sides know the amount and whether payment is protected or off-platform.</small></span><strong>→</strong><span><i>2</i><b>Pay</b><small>Stripe confirms Pay with Aspire and Aspire records the transaction.</small></span><strong>→</strong><span><i>3</i><b>Complete</b><small>Marketplace: seller handoff + buyer receipt. Service: both sides mark complete.</small></span><strong>→</strong><span><i>4</i><b>Release</b><small>Aspire creates the Stripe transfer to the seller/provider payout account.</small></span></div>
        </section>

        <section className="protectionCovered">
          <header><p>WHAT ASPIRE PROTECTED DOES</p><h2>A payment flow with <em>real controls.</em></h2></header>
          <div>{covered.map(([title, text], index) => <article key={title}><i>{String(index + 1).padStart(2,'0')}</i><h3>{title}</h3><p>{text}</p></article>)}</div>
        </section>

        <section className="protectionRefunds">
          <div><p>REFUNDS</p><h2>Requesting a refund is <em>not the same as receiving one.</em></h2></div>
          <div className="protectionRefundRules">
            <article><b>Before marketplace handoff</b><p>If a protected marketplace order is still eligible for cancellation before the seller marks handoff, use <strong>Cancel + refund</strong>. Aspire creates the Stripe refund and closes the order.</p></article>
            <article><b>After handoff / after a service starts</b><p>Use <strong>Report a problem</strong> or <strong>Request refund</strong>. The request enters review instead of instantly taking money from the other student.</p></article>
            <article><b>If payout already released</b><p>A moderator reviews the case. If a refund is approved and Stripe allows the funds to be recovered, Aspire reverses the connected-account transfer before refunding the original payment. If the funds cannot be safely recovered, the case requires further manual resolution.</p></article>
            <article><b>Review window</b><p>The current beta accepts payment refund-review requests for up to <strong>7 days</strong> after the protected payment/release event. Card or bank refund timing after approval is controlled by Stripe and the financial institution.</p></article>
          </div>
        </section>

        <section className="protectionNot">
          <header><p>IMPORTANT LIMITS</p><h2>What “Protected” <em>does not promise.</em></h2></header>
          <div>{notCovered.map((text, index) => <p key={text}><b>{String(index + 1).padStart(2,'0')}</b>{text}</p>)}</div>
        </section>

        <section className="protectionDelivery">
          <div><p>MARKET DELIVERY</p><h2>The item and the delivery are <em>two separate transactions.</em></h2></div>
          <p>A seller can offer campus pickup only. If the buyer wants delivery, the buyer can create a separate Pickup / errand request for another student. That delivery can be free, a fixed amount, or “decide later.” If delivery is paid through Aspire, its payment is protected separately from the item purchase. A delivery problem does not silently change who sold the item.</p>
        </section>

        <section className="protectionBottom"><p>KEEP THE TRANSACTION INSIDE THE CONNECTION</p><h2>Want payment protection?<br /><em>Use Pay with Aspire.</em></h2><div><a className="button buttonGold" href="/connections">Open Connections →</a><a href="/money">View Aspire Money →</a></div></section>
      </div>
      <AppDock active="connections" />
    </main>
  );
}
