'use client';

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  fetchEditableRequest,
  removeRequestMediaStorageObjects,
  resubmitRequestForReview,
  type EditableRequest
} from '../lib/supabase/requestEditing';
import {
  fetchRequestMedia,
  uploadRequestMedia,
  validateRequestImages,
  type RequestMedia
} from '../lib/supabase/requestMedia';
import {
  requestLanguages,
  type ItemCondition,
  type RequestLanguageCode
} from '../lib/supabase/requests';
import { runRequestAiSafety } from '../lib/supabase/trust';
import UiIcon from './UiIcon';
import styles from './PostResubmitEditor.module.css';

const conditions: { value: ItemCondition; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'like_new', label: 'Like new' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
  { value: 'for_parts', label: 'For parts' }
];

const deliveryOptions = [
  { value: 'campus_pickup', label: 'Meet up', help: 'Public campus handoff' },
  { value: 'shipping', label: 'Ship it', help: 'Carrier shipping' },
  { value: 'seller_delivery', label: 'Seller delivery', help: 'Seller brings the item' },
  { value: 'aspirer_delivery', label: 'Ask an Aspirer', help: 'A third student can deliver' }
] as const;

function initialMethods(request: EditableRequest) {
  if (Array.isArray(request.fulfillment_methods) && request.fulfillment_methods.length) return request.fulfillment_methods;
  if (request.fulfillment_method) return [request.fulfillment_method];
  return request.kind === 'buy_sell' ? ['campus_pickup'] : [];
}

function dollars(cents: number | null | undefined) {
  if (cents == null) return '';
  return (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2);
}

export default function PostResubmitEditor({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [request, setRequest] = useState<EditableRequest | null>(null);
  const [media, setMedia] = useState<RequestMedia[]>([]);
  const [removedMediaIds, setRemovedMediaIds] = useState<string[]>([]);
  const [newPhotos, setNewPhotos] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState<EditableRequest | null>(null);

  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [language, setLanguage] = useState<RequestLanguageCode>('en');
  const [amount, setAmount] = useState('');
  const [condition, setCondition] = useState<ItemCondition>('good');
  const [priceNegotiable, setPriceNegotiable] = useState(false);
  const [methods, setMethods] = useState<string[]>([]);
  const [sellerArea, setSellerArea] = useState('');
  const [shippingPaidBy, setShippingPaidBy] = useState<'buyer' | 'seller' | 'either'>('buyer');
  const [sellerDeliveryMode, setSellerDeliveryMode] = useState<'free' | 'fixed' | 'negotiable'>('negotiable');
  const [sellerDeliveryPrice, setSellerDeliveryPrice] = useState('5');

  const photoPreviews = useMemo(() => newPhotos.map((file) => ({ file, url: URL.createObjectURL(file) })), [newPhotos]);
  useEffect(() => () => photoPreviews.forEach((item) => URL.revokeObjectURL(item.url)), [photoPreviews]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void fetchEditableRequest(requestId)
      .then(async (row) => {
        const assets = await fetchRequestMedia([requestId]);
        if (!active) return;
        setRequest(row);
        setMedia(assets);
        setTitle(row.title || '');
        setDetails(row.details || '');
        setLanguage((row.language_code || 'en') as RequestLanguageCode);
        setAmount(dollars(row.amount_cents));
        setCondition((row.item_condition || 'good') as ItemCondition);
        setPriceNegotiable(Boolean(row.price_negotiable));
        setMethods(initialMethods(row));
        setSellerArea(row.seller_area || row.city || '');
        setShippingPaidBy(row.shipping_paid_by_default || row.shipping_paid_by_preference || 'buyer');
        setSellerDeliveryMode(row.seller_delivery_mode || 'negotiable');
        setSellerDeliveryPrice(dollars(row.seller_delivery_price_cents) || '5');
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Could not load this post.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [requestId]);

  const isMarket = request?.kind === 'buy_sell';
  const isSelling = isMarket && (request?.market_intent || 'sell') === 'sell';
  const moneyInvolved = Boolean(request && ['paid_help', 'split_cost', 'buy_sell'].includes(request.kind));
  const remainingMedia = media.filter((asset) => !removedMediaIds.includes(asset.id));
  const finalPhotoCount = remainingMedia.length + newPhotos.length;
  const canResubmit = request?.status === 'open' && (request.moderation_status === 'blocked' || request.moderation_status === 'rejected');

  function toggleMethod(value: string) {
    setMethods((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  }

  function choosePhotos(event: ChangeEvent<HTMLInputElement>) {
    const incoming = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!incoming.length) return;
    try {
      validateRequestImages(incoming);
      if (remainingMedia.length + newPhotos.length + incoming.length > 5) throw new Error('Keep this post to 5 photos total.');
      setNewPhotos((current) => [...current, ...incoming]);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add those photos.');
    }
  }

  function validate() {
    if (!request) return 'This post is not loaded yet.';
    if (!canResubmit) return 'This post is not currently waiting for edits.';
    if (!title.trim()) return 'Add a title before resubmitting.';
    if (title.trim().length > 180) return 'Keep the title under 180 characters.';
    if (details.length > 5000) return 'Keep the description under 5,000 characters.';
    if (moneyInvolved && (!amount || Number(amount) <= 0)) return isMarket ? 'Add a positive price or budget.' : 'Add a positive amount.';
    if (isMarket && !sellerArea.trim()) return 'Add a public campus area such as West Lafayette, IN.';
    if (isMarket && !methods.length) return 'Choose at least one delivery or pickup option.';
    if (isSelling && finalPhotoCount < 1) return 'A seller listing needs at least one real item photo.';
    if (methods.includes('seller_delivery') && sellerDeliveryMode === 'fixed' && Number(sellerDeliveryPrice) <= 0) return 'Add a seller delivery price greater than $0.';
    return '';
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const validation = validate();
    if (validation) return setError(validation);
    if (!request) return;

    setSaving(true);
    setError('');
    let resubmitAccepted = false;
    try {
      const removed = media.filter((asset) => removedMediaIds.includes(asset.id));

      await resubmitRequestForReview({
        requestId: request.id,
        title,
        details,
        languageCode: language,
        amountCents: moneyInvolved ? Math.round(Number(amount) * 100) : null,
        itemCondition: isSelling ? condition : null,
        priceNegotiable: isMarket ? priceNegotiable : false,
        fulfillmentMethods: isMarket ? methods : [],
        sellerArea: isMarket ? sellerArea : '',
        shippingPaidBy: isMarket && methods.includes('shipping') ? shippingPaidBy : null,
        sellerDeliveryMode: isMarket && methods.includes('seller_delivery') ? sellerDeliveryMode : null,
        sellerDeliveryPriceCents: isMarket && methods.includes('seller_delivery') && sellerDeliveryMode === 'fixed'
          ? Math.round(Number(sellerDeliveryPrice) * 100)
          : null,
        removeMediaIds: removed.map((asset) => asset.id)
      });
      resubmitAccepted = true;

      if (removed.length) await removeRequestMediaStorageObjects(removed);
      if (newPhotos.length) await uploadRequestMedia(request.id, newPhotos);
      else await runRequestAiSafety(request.id).catch(() => undefined);

      const refreshed = await fetchEditableRequest(request.id);
      setSubmitted(refreshed);
      setRequest(refreshed);
      setMedia(await fetchRequestMedia([request.id]));
      setRemovedMediaIds([]);
      setNewPhotos([]);
    } catch (cause) {
      if (resubmitAccepted) {
        await runRequestAiSafety(request.id).catch(() => undefined);
        const refreshed = await fetchEditableRequest(request.id).catch(() => null);
        if (refreshed) {
          setSubmitted(refreshed);
          setRequest(refreshed);
        }
        const currentMedia = await fetchRequestMedia([request.id]).catch(() => null);
        if (currentMedia) setMedia(currentMedia);
        setRemovedMediaIds([]);
        setNewPhotos([]);
        setError('Your post changes were saved, but the new photos did not finish uploading. Aspire rechecked the version that is currently stored. Review the status in My Activity before trying the photos again.');
      } else {
        setError(cause instanceof Error ? cause.message : 'Could not resubmit this post.');
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className={styles.loading}>Loading your private post…</div>;

  if (!request) return (
    <section className={styles.stateCard}>
      <strong>Could not open this post.</strong>
      <p>{error || 'Return to My Activity and try again.'}</p>
      <a href="/activity">Back to My Activity →</a>
    </section>
  );

  if (submitted) {
    const live = submitted.moderation_status === 'approved';
    const blocked = submitted.moderation_status === 'blocked';
    return (
      <section className={styles.successCard}>
        <div className={styles.successIcon}><UiIcon name={live ? 'check' : 'shield'} /></div>
        <span>{live ? 'REVIEW PASSED' : blocked ? 'MORE CHANGES NEEDED' : 'RESUBMITTED'}</span>
        <h2>{live ? 'Your post is live.' : blocked ? 'The new version still needs attention.' : 'The new version is back in review.'}</h2>
        <p>{live
          ? 'The revised post passed the required review lanes and can now appear to other students.'
          : blocked
            ? 'Aspire kept the post private. My Activity will show which review lane still needs a change.'
            : 'Aspire is reviewing the revised text, language, marketplace details, and photos. It stays private until those checks pass.'}</p>
        {error && <div className={styles.error} role="alert">{error}</div>}
        <div><a className={styles.primaryLink} href="/activity">View review status →</a><button type="button" onClick={() => router.push('/post')}>Create another post</button></div>
      </section>
    );
  }

  if (!canResubmit) return (
    <section className={styles.stateCard}>
      <strong>This post is not waiting for edits.</strong>
      <p>Its review status changed after you opened this page. Check My Activity for the latest state.</p>
      <a href="/activity">View latest status →</a>
    </section>
  );

  return (
    <section className={styles.root}>
      <header className={styles.header}>
        <div><span>EDIT PRIVATE POST</span><h2>Fix it without starting over.</h2><p>Change only what needs attention, then send the same post through a fresh review. The post stays private while review runs.</p></div>
        <a href="/activity">Cancel</a>
      </header>

      <div className={styles.reviewNote}>
        <UiIcon name="shield" />
        <div><strong>{request.moderation_status === 'rejected' ? 'Moderator review did not approve this version.' : 'This version needs changes.'}</strong><p>{request.moderation_reason || 'Use the guidance in My Activity to revise the flagged review lane.'}</p></div>
      </div>

      <form className={styles.form} onSubmit={submit}>
        <section className={styles.section}>
          <div className={styles.sectionHead}><span>01</span><div><strong>Post content</strong><small>Editing title or description invalidates the old AI scan and starts a fresh one.</small></div></div>
          <label><span>Title</span><textarea rows={2} maxLength={180} value={title} onChange={(event) => setTitle(event.target.value)} /><small>{title.length}/180</small></label>
          <label><span>Description</span><textarea rows={5} maxLength={5000} value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Clarify the item, request, timing, or scope. Keep private addresses out of public text." /><small>{details.length}/5000</small></label>
          <label><span>Post language</span><select value={language} onChange={(event) => setLanguage(event.target.value as RequestLanguageCode)}>{requestLanguages.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          {moneyInvolved && <label><span>{isMarket ? (isSelling ? 'Price' : 'Budget') : 'Amount'}</span><div className={styles.money}><b>$</b><input type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></div></label>}
        </section>

        {isMarket && (
          <section className={styles.section}>
            <div className={styles.sectionHead}><span>02</span><div><strong>Marketplace details</strong><small>Keep the public area general. Exact addresses belong in the protected order only.</small></div></div>
            {isSelling && <label><span>Condition</span><select value={condition} onChange={(event) => setCondition(event.target.value as ItemCondition)}>{conditions.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>}
            <label><span>Public selling area</span><input value={sellerArea} onChange={(event) => setSellerArea(event.target.value)} maxLength={120} placeholder="West Lafayette, IN" /><small>No street, dorm room, or apartment number.</small></label>
            <label className={styles.checkRow}><input type="checkbox" checked={priceNegotiable} onChange={(event) => setPriceNegotiable(event.target.checked)} /><span><strong>Price is negotiable</strong><small>The final amount is locked inside the protected transaction.</small></span></label>

            <div className={styles.deliveryBlock}><span>DELIVERY OPTIONS</span><div className={styles.deliveryGrid}>{deliveryOptions.map((option) => <button type="button" key={option.value} className={methods.includes(option.value) ? styles.selected : ''} onClick={() => toggleMethod(option.value)}><strong>{methods.includes(option.value) ? '✓ ' : ''}{option.label}</strong><small>{option.help}</small></button>)}</div></div>

            {methods.includes('shipping') && <label><span>Shipping cost</span><select value={shippingPaidBy} onChange={(event) => setShippingPaidBy(event.target.value as 'buyer' | 'seller' | 'either')}><option value="buyer">Buyer pays shipping</option><option value="seller">Seller covers shipping</option><option value="either">Buyer or seller can cover</option></select></label>}

            {methods.includes('seller_delivery') && <div className={styles.inlineGrid}><label><span>Seller delivery</span><select value={sellerDeliveryMode} onChange={(event) => setSellerDeliveryMode(event.target.value as 'free' | 'fixed' | 'negotiable')}><option value="free">Free</option><option value="fixed">Fixed fee</option><option value="negotiable">Negotiable</option></select></label>{sellerDeliveryMode === 'fixed' && <label><span>Delivery fee</span><div className={styles.money}><b>$</b><input type="number" min="0" step="0.01" value={sellerDeliveryPrice} onChange={(event) => setSellerDeliveryPrice(event.target.value)} /></div></label>}</div>}
          </section>
        )}

        <section className={styles.section}>
          <div className={styles.sectionHead}><span>{isMarket ? '03' : '02'}</span><div><strong>Photos</strong><small>Keep up to five. Remove a photo if the image itself caused the review problem.</small></div></div>
          <div className={styles.photos}>
            {media.map((asset) => {
              const removed = removedMediaIds.includes(asset.id);
              return <figure className={removed ? styles.removedPhoto : ''} key={asset.id}>{asset.public_url ? <img src={asset.public_url} alt="Current post" /> : <div className={styles.photoFallback}>PHOTO</div>}<button type="button" onClick={() => setRemovedMediaIds((current) => current.includes(asset.id) ? current.filter((id) => id !== asset.id) : [...current, asset.id])}>{removed ? 'Keep' : 'Remove'}</button></figure>;
            })}
            {photoPreviews.map((item, index) => <figure key={`${item.file.name}-${index}`}><img src={item.url} alt="New post preview" /><button type="button" onClick={() => setNewPhotos((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</button><figcaption>NEW</figcaption></figure>)}
            {finalPhotoCount < 5 && <label className={styles.addPhoto}><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={choosePhotos} /><b>+</b><strong>Add photos</strong><small>{finalPhotoCount}/5</small></label>}
          </div>
        </section>

        {error && <div className={styles.error} role="alert">{error}</div>}

        <footer className={styles.footer}>
          <div><UiIcon name="shield" /><span><strong>Fresh review required</strong><small>The old moderation decision cannot be reused after you change the post.</small></span></div>
          <button type="submit" disabled={saving}>{saving ? 'Resubmitting…' : 'Save changes & resubmit'}</button>
        </footer>
      </form>
    </section>
  );
}