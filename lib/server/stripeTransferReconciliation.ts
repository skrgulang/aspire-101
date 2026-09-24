export type ExpectedTransfer = {
  id: string;
  transfer_group: string | null;
  provider_net_cents: number | null;
  provider_amount_cents: number | null;
  stripe_transfer_attempted_amount_cents?: number | null;
  stripe_livemode: boolean;
};

export type ObservedTransfer = {
  id?: string | null;
  amount?: number | null;
  livemode?: boolean | null;
  transfer_group?: string | null;
  metadata?: Record<string, string> | null;
};

export function matchesSellerTransfer(payment: ExpectedTransfer, transfer: ObservedTransfer): boolean {
  const amount = Number(payment.stripe_transfer_attempted_amount_cents
    ?? payment.provider_net_cents ?? payment.provider_amount_cents ?? 0);
  return /^tr_[A-Za-z0-9]+$/.test(String(transfer.id || ''))
    && amount > 0 && Number.isInteger(amount)
    && transfer.amount === amount
    && transfer.livemode === payment.stripe_livemode
    && Boolean(payment.transfer_group)
    && transfer.transfer_group === payment.transfer_group
    && transfer.metadata?.aspire_payment_id === payment.id;
}
