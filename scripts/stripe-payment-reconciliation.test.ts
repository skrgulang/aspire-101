import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyCheckoutReconciliation,
  validateStripePaymentEvidence,
  type LocalPaymentSnapshot
} from '../lib/server/stripePaymentReconciliation.ts';
import { calculateDisputeSplit, evidenceSignatureMatches, safeEvidenceFile } from '../lib/server/marketDisputeProtection.ts';

const payment: LocalPaymentSnapshot = {
  id: 'payment-1',
  status: 'processing',
  customer_total_cents: 2699,
  gross_amount_cents: 2699,
  currency: 'USD',
  stripe_livemode: false
};

test('paid checkout with succeeded intent is secured', () => {
  assert.equal(
    classifyCheckoutReconciliation(
      { status: 'complete', payment_status: 'paid' },
      { status: 'succeeded' }
    ),
    'secure'
  );
});

test('completed asynchronous checkout remains processing while unpaid', () => {
  assert.equal(
    classifyCheckoutReconciliation(
      { status: 'complete', payment_status: 'unpaid' },
      { status: 'processing' }
    ),
    'processing'
  );
});

test('expired unpaid checkout becomes failed and can be retried', () => {
  assert.equal(
    classifyCheckoutReconciliation({ status: 'expired', payment_status: 'unpaid' }),
    'failed'
  );
});

test('no-payment checkout is not treated as a successful paid order', () => {
  assert.notEqual(
    classifyCheckoutReconciliation(
      { status: 'complete', payment_status: 'no_payment_required' },
      { status: 'processing' }
    ),
    'secure'
  );
});

test('open unpaid checkout is left unchanged', () => {
  assert.equal(
    classifyCheckoutReconciliation({ status: 'open', payment_status: 'unpaid' }),
    'unchanged'
  );
});

test('payment evidence requires exact amount, currency, mode and metadata', () => {
  assert.deepEqual(validateStripePaymentEvidence(payment, {
    paymentIntentId: 'pi_123',
    chargeId: 'ch_123',
    amountReceived: 2699,
    currency: 'usd',
    livemode: false,
    aspirePaymentId: 'payment-1'
  }), { matchesMode: true });

  assert.throws(() => validateStripePaymentEvidence(payment, {
    paymentIntentId: 'pi_123',
    chargeId: 'ch_123',
    amountReceived: 2600,
    currency: 'usd',
    livemode: false,
    aspirePaymentId: 'payment-1'
  }), /amount or currency/);

  assert.throws(() => validateStripePaymentEvidence(payment, {
    paymentIntentId: 'pi_123',
    chargeId: 'ch_123',
    amountReceived: 2699,
    currency: 'usd',
    livemode: false,
    aspirePaymentId: 'another-payment'
  }), /metadata/);

  assert.deepEqual(validateStripePaymentEvidence(payment, {
    paymentIntentId: 'pi_123',
    chargeId: 'ch_123',
    amountReceived: 2699,
    currency: 'usd',
    livemode: true,
    aspirePaymentId: 'payment-1'
  }), { matchesMode: false });
});

test('partial marketplace refunds reduce seller release before platform fee', () => {
  assert.deepEqual(calculateDisputeSplit({
    customerTotalCents: 10000,
    refundedBeforeCents: 0,
    requestedRefundCents: 3000,
    platformFeeCents: 1000,
    shippingLiabilityCents: 0
  }), {
    refundedTotalCents: 3000,
    customerRemainingCents: 7000,
    sellerReleaseCents: 6000,
    fullRefund: false
  });
  assert.throws(() => calculateDisputeSplit({
    customerTotalCents: 10000,
    refundedBeforeCents: 3000,
    requestedRefundCents: 7001,
    platformFeeCents: 1000,
    shippingLiabilityCents: 0
  }), /REFUND_AMOUNT_EXCEEDS_REMAINING/);
});

test('dispute evidence accepts safe files and rejects oversized or executable files', () => {
  assert.deepEqual(safeEvidenceFile({ fileName: 'handoff photo.jpg', mimeType: 'image/jpeg', sizeBytes: 1024 }), {
    fileName: 'handoff photo.jpg', mimeType: 'image/jpeg', sizeBytes: 1024, extension: 'jpg'
  });
  assert.throws(() => safeEvidenceFile({ fileName: 'payload.exe', mimeType: 'application/octet-stream', sizeBytes: 100 }), /EVIDENCE_FILE_TYPE_INVALID/);
  assert.throws(() => safeEvidenceFile({ fileName: 'large.pdf', mimeType: 'application/pdf', sizeBytes: 9 * 1024 * 1024 }), /EVIDENCE_FILE_SIZE_INVALID/);
});

test('dispute evidence verifies file signatures instead of trusting browser MIME', () => {
  assert.equal(evidenceSignatureMatches('application/pdf', new TextEncoder().encode('%PDF-1.7')), true);
  assert.equal(evidenceSignatureMatches('image/jpeg', Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])), true);
  assert.equal(evidenceSignatureMatches('image/png', Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])), true);
  assert.equal(evidenceSignatureMatches('image/png', new TextEncoder().encode('<script>')), false);
});
