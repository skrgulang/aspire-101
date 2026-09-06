'use client';

import { useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabase/client';

type FeeQuoteRow = {
  fee_policy_version: string;
  base_amount_cents: number;
  requester_fee_cents: number;
  provider_fee_cents: number;
  customer_total_cents: number;
  provider_net_cents: number;
  minimum_paid_order_cents: number;
};

function money(cents: number) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export default function PaymentFeePreview({ amount, campusId }: { amount: string; campusId: string }) {
  const amountCents = useMemo(() => {
    const value = Number(amount);
    return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : 0;
  }, [amount]);
  const [quote, setQuote] = useState<FeeQuoteRow | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!campusId || amountCents <= 0) {
      setQuote(null);
      setLoading(false);
      return;
    }

    let alive = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase.rpc('quote_aspire_fees', {
        p_base_amount_cents: amountCents,
        p_campus_id: campusId,
        p_tip_amount_cents: 0
      });
      if (!alive) return;
      if (!error && data?.[0]) setQuote(data[0] as FeeQuoteRow);
      else setQuote(null);
      setLoading(false);
    }, 220);

    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [amountCents, campusId]);

  if (amountCents <= 0) return <div className="paymentFeePreview muted">Enter an amount to preview the Aspire checkout.</div>;
  if (loading && !quote) return <div className="paymentFeePreview muted">Calculating fees from the current Aspire policy…</div>;
  if (!quote) return null;

  const belowMinimum = quote.base_amount_cents < quote.minimum_paid_order_cents;

  return (
    <div className={`paymentFeePreview${belowMinimum ? ' warning' : ''}`}>
      <div className="paymentFeePreviewHead"><span>PAY WITH ASPIRE</span><small>{quote.fee_policy_version}</small></div>
      <div><span>Service</span><strong>{money(quote.base_amount_cents)}</strong></div>
      <div><span>Aspire 101 Service Fee</span><strong>{money(quote.requester_fee_cents)}</strong></div>
      <div className="total"><span>You would pay</span><strong>{money(quote.customer_total_cents)}</strong></div>
      {belowMinimum ? (
        <p>Pay with Aspire currently starts at {money(quote.minimum_paid_order_cents)}. You can raise the amount or choose an off-platform payment method.</p>
      ) : (
        <p>The provider sees their own fee and net earnings before payment. Final fees are recalculated and snapshotted server-side at checkout.</p>
      )}
    </div>
  );
}
