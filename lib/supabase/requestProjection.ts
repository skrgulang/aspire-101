// Public/browser request projection. Keep internal moderation scores, model
// summaries, behavior signals, trust snapshots, and review rule internals out of
// ordinary table reads. Owner-facing review details come from
// get_my_activity_requests(); moderator-only details come from
// moderator_fetch_requests().
export const REQUEST_PUBLIC_SELECT = 'id,poster_id,kind,category,title,details,campus,campus_id,city,amount_cents,currency,payment_method,market_intent,item_condition,price_negotiable,fulfillment_method,fulfillment_methods,shipping_paid_by_preference,shipping_paid_by_default,seller_delivery_mode,seller_delivery_price_cents,seller_area,quantity,language_code,cover_image_url,cover_image_source,cover_image_asset_id,scheduled_start_at,scheduled_end_at,timezone,meeting_label,listing_expires_at,moderation_status,status,created_at,updated_at' as const;
