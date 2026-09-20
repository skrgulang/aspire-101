# Aspire 101 product analytics tracking plan

This tracking plan is intentionally small. It exists to answer founder-level questions about activation, matching, marketplace use, and payment progression without collecting request text, messages, names, email addresses, exact location, student IDs, or other sensitive content.

## Data destinations

- **Amplitude**: product funnel, activation, adoption, and retention analysis.
- **Datadog RUM**: frontend performance/error context and the same coarse product actions when useful for debugging.
- **Google Analytics**: acquisition/marketing analytics is managed separately and is not part of this implementation.

Analytics initializes only when the existing Aspire cookie preference has `analytics: true`.

## Event contract

| Event | Fires when | Allowed properties |
| --- | --- | --- |
| `product_session_started` | Analytics initializes after consent | `environment` |
| `signup_submitted` | Supabase accepts a signup request | `campus_id`, `confirmation_required`, `interest_count`, `has_major` |
| `request_created` | A request row is created successfully | `request_kind`, `category`, `payment_method`, `scheduled`, `language_code` |
| `response_sent` | A response to a request is saved | `with_note` |
| `connection_chosen` | A requester accepts a response | no content fields |
| `connection_confirmed` | The other party confirms the connection | no content fields |
| `connection_completion_marked` | A user marks a connection complete | `confirmation_count` |
| `marketplace_listing_created` | A seller listing is created | `item_condition`, `language_code`, `fulfillment_count`, `shipping_enabled`, `seller_delivery_enabled` |
| `marketplace_order_reserved` | A buyer successfully reserves a listing | no content fields |
| `checkout_started` | Aspire creates a Stripe Checkout session | `fee_policy_version`, `shipping_enabled`, `shipping_paid_by` |
| `payout_released` | Aspire's release endpoint confirms seller payout release | `fee_policy_version`, `transaction_type`, `duplicate` |
| `review_submitted` | A connection review is saved | `would_connect_again`, `tag_count` |

## Privacy rules

Do not send free-form user content to analytics. In particular, never send:

- email addresses, names, phone numbers, student IDs, identity-document data
- request titles/details, private messages, review notes, dispute descriptions
- exact addresses, latitude/longitude, meetup details
- passwords, auth tokens, API keys, webhook secrets
- raw payment identifiers or banking information

The client analytics helper also drops properties whose keys look like sensitive fields. This is a backstop, not a substitute for choosing safe event properties.

## Founder metrics derived from these events

1. Signup → first request conversion.
2. Request → response conversion.
3. Response → chosen connection → confirmed connection funnel.
4. Marketplace listing → reservation → checkout-start funnel.
5. Repeat creators/responders over 7 and 30 days.
6. Connection completion rate.
7. "Would connect again" rate.

Payment success, GMV, platform revenue, refunds, disputes, and payouts should remain sourced from Stripe/Supabase financial records rather than inferred solely from browser analytics.
