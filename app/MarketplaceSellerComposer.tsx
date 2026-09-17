'use client';

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import { uploadRequestMedia, validateRequestImages } from '../lib/supabase/requestMedia';
import { fetchActiveUniversities } from '../lib/supabase/universities';
import type { ItemCondition } from '../lib/supabase/requests';
import {
  createMarketplaceListing,
  deleteMarketplaceDraft,
  listMarketplaceDrafts,
  rollbackMarketplaceListing,
  saveMarketplaceDraft,
  type MarketplaceDeliveryMethod,
  type MarketplaceDraft,
  type SellerDeliveryMode,
  type ShippingPayer
} from '../lib/supabase/marketplaceSeller';
import styles from './MarketplaceSellerComposer.module.css';

const conditions: { value: ItemCondition; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'like_new', label: 'Like new' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
  { value: 'for_parts', label: 'For parts' }
];

type OptionKey = 'meet' | 'shipping' | 'seller' | 'aspirer';
type EnabledOptions = Record<OptionKey, boolean>;

const DEFAULT_OPTIONS: EnabledOptions = { meet: true, shipping: true, seller: false, aspirer: true };

export default function MarketplaceSellerComposer() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [campusId, setCampusId] = useState('');
  const [campusName, setCampusName] = useState('');
  const [campusCity, setCampusCity] = useState('');
  const [campusState, setCampusState] = useState('');
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [condition, setCondition] = useState<ItemCondition>('good');
  const [details, setDetails] = useState('');
  const [sellerArea, setSellerArea] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState('');
  const [enabled, setEnabled] = useState<EnabledOptions>(DEFAULT_OPTIONS);
  const [shippingPayer, setShippingPayer] = useState<ShippingPayer>('buyer');
  const [sellerDeliveryMode, setSellerDeliveryMode] = useState<SellerDeliveryMode>('negotiable');
  const [sellerDeliveryPrice, setSellerDeliveryPrice] = useState('5');
  const [drafts, setDrafts] = useState<MarketplaceDraft[]>([]);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!active) return;
      if (!data.user) {
        router.replace('/login?next=%2Fpost%3Fmode%3Dsell');
        return;
      }
      try {
        const [{ data: profile }, universities, savedDrafts] = await Promise.all([
          supabase.from('profiles').select('current_campus_id,home_campus_id').eq('id', data.user.id).maybeSingle(),
          fetchActiveUniversities(),
          listMarketplaceDrafts()
        ]);
        if (!active) return;
        const nextId = profile?.current_campus_id || profile?.home_campus_id || universities[0]?.id || '';
        const campus = universities.find((item) => item.id === nextId) || universities[0];
        if (campus) {
          setCampusId(campus.id);
          setCampusName(campus.short_name || campus.name);
          setCampusCity(campus.city || '');
          setCampusState(campus.state || '');
        }
        setDrafts(savedDrafts);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not load seller tools.');
      } finally {
        if (active) setLoading(false);
      }
    });
    return () => { active = false; };
  }, [router]);

  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl); }, [photoUrl]);

  const methods = useMemo<MarketplaceDeliveryMethod[]>(() => {
    const result: MarketplaceDeliveryMethod[] = [];
    if (enabled.meet) result.push('campus_pickup');
    if (enabled.shipping) result.push('shipping');
    if (enabled.seller) result.push('seller_delivery');
    if (enabled.aspirer) result.push('aspirer_delivery');
    return result;
  }, [enabled]);

  const buyerOptions = useMemo(() => {
    const result: string[] = [];
    if (enabled.meet) result.push('Meet up · Free');
    if (enabled.shipping) result.push(`Ship to me · ${shippingPayer === 'buyer' ? 'Buyer pays shipping' : shippingPayer === 'seller' ? 'Seller covers shipping' : 'Buyer or seller can cover'}`);
    if (enabled.seller) result.push(`Ask seller to deliver · ${sellerDeliveryMode === 'free' ? 'Free' : sellerDeliveryMode === 'fixed' ? `$${sellerDeliveryPrice || '0'}` : 'Negotiable'}`);
    if (enabled.aspirer) result.push('Ask an Aspirer · Free / Paid / Negotiable');
    return result;
  }, [enabled, shippingPayer, sellerDeliveryMode, sellerDeliveryPrice]);

  const publicLocation = [sellerArea.trim(), campusCity, campusState].filter(Boolean).join(', ');

  function toggle(key: OptionKey) {
    setEnabled((current) => ({ ...current, [key]: !current[key] }));
    setError('');
    setNotice('');
  }

  function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0] || null;
    event.target.value = '';
    if (!next) return;
    try {
      validateRequestImages([next]);
      if (photoUrl) URL.revokeObjectURL(photoUrl);
      setPhoto(next);
      setPhotoUrl(URL.createObjectURL(next));
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not use that photo.');
    }
  }

  function resetComposer() {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setTitle('');
    setPrice('');
    setCondition('good');
    setDetails('');
    setSellerArea('');
    setPhoto(null);
    setPhotoUrl('');
    setEnabled(DEFAULT_OPTIONS);
    setShippingPayer('buyer');
    setSellerDeliveryMode('negotiable');
    setSellerDeliveryPrice('5');
    setCurrentDraftId(null);
    setError('');
    setNotice('');
  }

  function loadDraft(draft: MarketplaceDraft) {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setCurrentDraftId(draft.id);
    setTitle(draft.title || '');
    setPrice(draft.price_cents == null ? '' : (draft.price_cents / 100).toFixed(draft.price_cents % 100 === 0 ? 0 : 2));
    setCondition(draft.item_condition || 'good');
    setDetails(draft.details || '');
    setSellerArea(draft.seller_area || '');
    setEnabled({
      meet: draft.fulfillment_methods.includes('campus_pickup'),
      shipping: draft.fulfillment_methods.includes('shipping'),
      seller: draft.fulfillment_methods.includes('seller_delivery'),
      aspirer: draft.fulfillment_methods.includes('aspirer_delivery')
    });
    setShippingPayer(draft.shipping_paid_by || 'buyer');
    setSellerDeliveryMode(draft.seller_delivery_mode || 'negotiable');
    setSellerDeliveryPrice(draft.seller_delivery_price_cents == null ? '5' : String(draft.seller_delivery_price_cents / 100));
    setPhoto(null);
    setPhotoUrl('');
    setError('');
    setNotice('Draft loaded. Add or reattach the item photo before publishing.');
  }

  async function refreshDrafts() {
    setDrafts(await listMarketplaceDrafts());
  }

  async function saveDraft() {
    setError('');
    setNotice('');
    if (!campusId) return setError('Could not resolve your campus.');
    if (!methods.length) return setError('Choose at least one delivery option before saving.');
    if (enabled.seller && sellerDeliveryMode === 'fixed' && Number(sellerDeliveryPrice) <= 0) return setError('Add a seller delivery price greater than $0.');
    setSavingDraft(true);
    try {
      const saved = await saveMarketplaceDraft({
        id: currentDraftId,
        campusId,
        title,
        priceCents: price && Number(price) > 0 ? Math.round(Number(price) * 100) : null,
        itemCondition: condition,
        details,
        sellerArea,
        fulfillmentMethods: methods,
        shippingPaidBy: enabled.shipping ? shippingPayer : null,
        sellerDeliveryMode: enabled.seller ? sellerDeliveryMode : null,
        sellerDeliveryPriceCents: enabled.seller && sellerDeliveryMode === 'fixed' ? Math.round(Number(sellerDeliveryPrice) * 100) : null
      });
      setCurrentDraftId(saved.id);
      await refreshDrafts();
      setNotice('Draft saved privately. It is not visible in Market yet.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save this draft.');
    } finally {
      setSavingDraft(false);
    }
  }

  async function removeDraft(draftId: string) {
    setError('');
    try {
      await deleteMarketplaceDraft(draftId);
      if (currentDraftId === draftId) resetComposer();
      await refreshDrafts();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete this draft.');
    }
  }

  async function publish(event: FormEvent) {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!campusId) return setError('Could not resolve your campus.');
    if (!title.trim()) return setError('Add an item title before publishing.');
    if (!price || Number(price) <= 0) return setError('Add a price greater than $0 before publishing.');
    if (!sellerArea.trim()) return setError('Add an approximate seller area, like a campus area or neighborhood.');
    if (!photo) return setError('Add at least one real photo before publishing. Drafts can be saved without a photo.');
    if (!methods.length) return setError('Choose at least one delivery option.');
    if (enabled.seller && sellerDeliveryMode === 'fixed' && Number(sellerDeliveryPrice) <= 0) return setError('Add a seller delivery price greater than $0.');

    setPublishing(true);
    let createdId = '';
    try {
      const listing = await createMarketplaceListing({
        campusId,
        title,
        priceCents: Math.round(Number(price) * 100),
        itemCondition: condition,
        details,
        sellerArea,
        fulfillmentMethods: methods,
        shippingPaidBy: enabled.shipping ? shippingPayer : null,
        sellerDeliveryMode: enabled.seller ? sellerDeliveryMode : null,
        sellerDeliveryPriceCents: enabled.seller && sellerDeliveryMode === 'fixed' ? Math.round(Number(sellerDeliveryPrice) * 100) : null,
        languageCode: 'en'
      });
      createdId = listing.id;
      await uploadRequestMedia(listing.id, [photo]);
      if (currentDraftId) await deleteMarketplaceDraft(currentDraftId).catch(() => undefined);
      setNotice('Published. Moving this item from Drafts into Market…');
      router.push(`/marketplace?item=${listing.id}&published=1`);
    } catch (cause) {
      if (createdId) await rollbackMarketplaceListing(createdId).catch(() => undefined);
      setError(cause instanceof Error ? cause.message : 'Could not publish this item.');
    } finally {
      setPublishing(false);
    }
  }

  if (loading) return <div className={styles.loading}>Loading seller tools…</div>;

  return (
    <section className={styles.root}>
      <div className={styles.topline}>
        <div><span>SELL ON ASPIRE MARKET · {campusName || 'CAMPUS'}</span><h2>List an item.</h2><p>Save it as a private draft, or publish it to Market when it is ready.</p></div>
        <button type="button" className={styles.newButton} onClick={resetComposer}>+ New item</button>
      </div>

      <section className={styles.drafts} aria-label="Draft items">
        <div className={styles.draftHead}><div><span>DRAFT ITEMS</span><strong>{drafts.length} saved</strong></div><small>Drafts stay private. Publishing removes the draft and creates the Market listing.</small></div>
        {drafts.length ? <div className={styles.draftRail}>{drafts.map((draft) => (
          <article key={draft.id} className={`${styles.draftCard} ${currentDraftId === draft.id ? styles.currentDraft : ''}`}>
            <button type="button" onClick={() => loadDraft(draft)}><small>{draft.price_cents == null ? 'PRICE NOT SET' : `$${(draft.price_cents / 100).toFixed(2)}`}</small><strong>{draft.title || 'Untitled item'}</strong><span>{new Date(draft.updated_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span></button>
            <button type="button" className={styles.deleteDraft} onClick={() => removeDraft(draft.id)} aria-label={`Delete ${draft.title || 'draft'}`}>×</button>
          </article>
        ))}</div> : <div className={styles.emptyDraft}>No draft items yet. Start below and press <b>Save draft</b> whenever you want to finish later.</div>}
      </section>

      <form className={styles.form} onSubmit={publish}>
        <div className={styles.basics}>
          <div className={styles.photoBox}>
            {photoUrl ? <img src={photoUrl} alt="Item preview" /> : <div><b>ITEM PHOTO</b><span>Required to publish</span></div>}
            <label><input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={choosePhoto} />{photo ? 'Change photo' : 'Add photo'}</label>
          </div>
          <div className={styles.fields}>
            <label><span>Item title</span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={180} placeholder="e.g. Calculus textbook" /></label>
            <div className={styles.twoCols}>
              <label><span>Price</span><div className={styles.money}>$ <input type="number" min="0.01" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="25" /></div></label>
              <label><span>Condition</span><select value={condition} onChange={(event) => setCondition(event.target.value as ItemCondition)}>{conditions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
            </div>
            <label><span>Description</span><textarea rows={4} value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Model, size, defects, accessories, pickup notes…" /></label>
            <div className={styles.twoCols}>
              <label><span>Seller area *</span><input value={sellerArea} onChange={(event) => setSellerArea(event.target.value)} maxLength={120} placeholder="e.g. Chauncey Hill, Purdue campus, Hillenbrand area" /><small>No street address needed. Buyers only see this approximate area.</small></label>
              <label><span>City / State</span><input value={[campusCity, campusState].filter(Boolean).join(', ')} readOnly aria-readonly="true" /><small>Fixed from your selected campus.</small></label>
            </div>
          </div>
        </div>

        <div className={styles.sectionHead}><div><span>DELIVERY OPTIONS</span><h3>What are you willing to offer?</h3></div><small>Choose one or more</small></div>
        <div className={styles.optionGrid}>
          <button type="button" className={`${styles.option} ${enabled.meet ? styles.active : ''}`} onClick={() => toggle('meet')}><i>{enabled.meet ? '✓' : ''}</i><span><b>Meet up / Local pickup</b><small>Meet the buyer on campus or nearby.</small></span><em>Free</em></button>
          <button type="button" className={`${styles.option} ${enabled.shipping ? styles.active : ''}`} onClick={() => toggle('shipping')}><i>{enabled.shipping ? '✓' : ''}</i><span><b>Carrier shipping</b><small>Buyer enters an address and chooses an available carrier rate.</small></span><em>Calculated</em></button>
          <button type="button" className={`${styles.option} ${enabled.seller ? styles.active : ''}`} onClick={() => toggle('seller')}><i>{enabled.seller ? '✓' : ''}</i><span><b>I may deliver it myself</b><small>Let the buyer ask you to bring it directly.</small></span><em>{enabled.seller ? 'On' : 'Off'}</em></button>
          <button type="button" className={`${styles.option} ${enabled.aspirer ? styles.active : ''}`} onClick={() => toggle('aspirer')}><i>{enabled.aspirer ? '✓' : ''}</i><span><b>Allow Aspirer delivery</b><small>A third student can pick it up from you and deliver it.</small></span><em>Flexible</em></button>
        </div>

        {enabled.shipping && <div className={styles.subPanel}><h4>Who can cover carrier shipping?</h4><label><input type="radio" checked={shippingPayer === 'buyer'} onChange={() => setShippingPayer('buyer')} /><span><b>Buyer pays shipping</b><small>Added to the buyer checkout.</small></span></label><label><input type="radio" checked={shippingPayer === 'seller'} onChange={() => setShippingPayer('seller')} /><span><b>I’ll cover shipping</b><small>Deducted from your seller proceeds.</small></span></label><label><input type="radio" checked={shippingPayer === 'either'} onChange={() => setShippingPayer('either')} /><span><b>Either is okay</b><small>Buyer can choose who covers it at checkout.</small></span></label></div>}

        {enabled.seller && <div className={styles.subPanel}><h4>Your own delivery terms</h4><div className={styles.pills}>{(['free','fixed','negotiable'] as SellerDeliveryMode[]).map((mode) => <button type="button" key={mode} className={sellerDeliveryMode === mode ? styles.activePill : ''} onClick={() => setSellerDeliveryMode(mode)}>{mode === 'free' ? 'Free' : mode === 'fixed' ? 'Fixed price' : 'Negotiable'}</button>)}</div>{sellerDeliveryMode === 'fixed' && <label className={styles.deliveryPrice}><span>Delivery price</span><div className={styles.money}>$ <input value={sellerDeliveryPrice} inputMode="decimal" onChange={(event) => setSellerDeliveryPrice(event.target.value.replace(/[^0-9.]/g, ''))} /></div></label>}<p>The buyer asks first. You can accept or decline before checkout.</p></div>}

        <section className={styles.buyerPreview}><div><span>BUYER PREVIEW</span><strong>What buyers will see at Buy Now</strong><small>{publicLocation ? `Seller area: ${publicLocation}` : 'Add a seller area so buyers know roughly where the item is.'}</small></div><div className={styles.previewTags}>{buyerOptions.map((option) => <span key={option}>✓ {option}</span>)}{!buyerOptions.length && <span>Choose at least one delivery option.</span>}</div></section>

        {(error || notice) && <div id="marketplace-seller-status" className={error ? styles.error : styles.notice} role="status">{error || notice}</div>}

        <div className={styles.actions}>
          <div><strong>{currentDraftId ? 'Editing saved draft' : 'New item'}</strong><span>Save keeps it private. Publish sends it to Market and removes the saved draft.</span></div>
          <button type="button" className={styles.saveDraft} onClick={saveDraft} disabled={savingDraft || publishing}>{savingDraft ? 'Saving…' : 'Save draft'}</button>
          <button type="submit" className={styles.publish} disabled={publishing || savingDraft}>{publishing ? 'Publishing…' : 'Publish to Market →'}</button>
        </div>
        {error && <div className={styles.bottomError} role="alert">{error}</div>}
      </form>
    </section>
  );
}
