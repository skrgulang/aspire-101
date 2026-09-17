-- Browser users may create request content and close their own posts, but they
-- must never be able to submit or overwrite moderation-managed fields directly.
-- RLS still enforces ownership and verified-campus checks.

revoke insert on table public.requests from authenticated;
grant insert (
  poster_id,
  kind,
  category,
  title,
  details,
  campus_id,
  latitude,
  longitude,
  scheduled_start_at,
  scheduled_end_at,
  timezone,
  meeting_label,
  amount_cents,
  currency,
  payment_method,
  market_intent,
  item_condition,
  price_negotiable,
  fulfillment_method,
  fulfillment_methods,
  shipping_paid_by_default,
  shipping_paid_by_preference,
  seller_delivery_mode,
  seller_delivery_price_cents,
  seller_area,
  quantity,
  language_code,
  cover_image_url,
  cover_image_source,
  cover_image_asset_id,
  listing_expires_at
) on table public.requests to authenticated;

revoke update on table public.requests from authenticated;
grant update (status) on table public.requests to authenticated;
