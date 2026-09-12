export default function ResolutionPolicyPage() {
  return (
    <main className="legalPage">
      <div className="legalShell">
        <a className="legalBack" href="/">← Aspire 101</a>
        <p className="eyebrow">ASPIRE RESOLUTION CENTER</p>
        <h1>Cancellation, No-Show &amp; Refund Policy</h1>
        <p className="legalLead">This beta policy explains how Aspire 101 handles connection problems when users coordinate or pay through Aspire. It supplements the Terms, Community Guidelines, marketplace rules, and the payment terms shown before checkout.</p>

        <section><h2>1. Pay with Aspire protection</h2><p>When a connection uses Pay with Aspire, Aspire records the buyer/requester payment as secured after Stripe confirms the charge. Provider payout is delayed until the applicable completion or handoff conditions are satisfied. “Secured” is an Aspire transaction status and is not represented as a bank account, stored-value wallet, or legal escrow service.</p></section>
        <section><h2>2. Open issues pause payout</h2><p>An eligible Resolution Center case opened before provider release pauses the Aspire payout workflow while the issue is reviewed. Users should keep coordination, schedule changes, arrival updates, and relevant messages inside Aspire when possible so the platform record can help resolve a dispute.</p></section>
        <section><h2>3. No-show grace period</h2><p>A no-show claim becomes available after the agreed start time plus a short grace period. The current beta uses 10 minutes. Aspire may consider the agreed time, rescheduling history, arrival/status events, platform messages, payment state, and other relevant account activity. Location sharing is optional and is not required to file or win a claim.</p></section>
        <section><h2>4. Provider no-show</h2><p>If the paying requester reports that the provider did not show and Aspire confirms the claim before provider release, the protected payment may be eligible for a full refund. Confirmed no-shows may also be recorded for trust, safety, and marketplace-enforcement purposes.</p></section>
        <section><h2>5. Requester no-show</h2><p>If a provider reports that the requester did not show after the provider reasonably relied on the confirmed connection, Aspire may review whether a cancellation or no-show payment is appropriate under the policy displayed for that transaction. Provider compensation is not automatic and should not be assumed unless the checkout or connection explicitly states the applicable amount or formula.</p></section>
        <section><h2>6. Cancellations</h2><p>Cancellation treatment depends on transaction state, timing, and the terms displayed before payment. A cancellation before a protected payment is secured does not create a refund. After payment but before service or handoff, a full or partial refund may be available. Once funds have already been transferred to a provider, additional reconciliation may be required.</p></section>
        <section><h2>7. Partial outcomes</h2><p>Incomplete work, materially different service, or other mixed outcomes may require a partial refund, partial provider payment, or another reviewed resolution. These outcomes are not automated in the beta unless Aspire clearly displays the applicable rule in advance.</p></section>
        <section><h2>8. Safety concerns</h2><p>Safety reports can be escalated separately from a payment claim. Aspire may pause platform activity, preserve relevant platform records, restrict an account, or take other action reasonably necessary for safety, fraud prevention, policy enforcement, or legal compliance.</p></section>
        <section><h2>9. Off-platform payments</h2><p>Cash, Venmo, Zelle, cryptocurrency, or other payments made outside Pay with Aspire are not processed as Aspire payments. Aspire therefore cannot issue a Stripe refund or provider payout for those off-platform transfers, although trust-and-safety or account-enforcement action may still be available.</p></section>
        <section><h2>10. Card disputes and banks</h2><p>A Resolution Center case is separate from a card-network dispute or chargeback. Stripe, card networks, and financial institutions may apply their own rules and timelines. Refund timing can also depend on Stripe and the customer&apos;s bank.</p></section>
        <section><h2>11. Fair review</h2><p>Filing a report does not automatically prove that the other user is at fault. Aspire may ask for additional context, dismiss unsupported claims, and take action against repeated false or abusive reports. Financial resolutions that move or return money require the applicable Aspire review and authorization.</p></section>
        <section><h2>12. Contact</h2><p>For a transaction that needs human follow-up, use the Resolution Center from the active connection. Business questions can also be sent to business@aspires101.com.</p></section>
      </div>
    </main>
  );
}
