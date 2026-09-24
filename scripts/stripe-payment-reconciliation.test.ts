import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyCheckoutReconciliation,
  validateStripePaymentEvidence,
  type LocalPaymentSnapshot
} from '../lib/server/stripePaymentReconciliation.ts';

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
