'use client';

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import { uploadRequestMedia, validateRequestImages } from '../lib/supabase/requestMedia';
import { fetchActiveUniversities } from '../lib/supabase/universities';
import { requestLanguageLabel, type ItemCondition, type RequestLanguageCode } from '../lib/supabase/requests';
import PostLanguagePicker from './PostLanguagePicker';
import {
  createMarketplaceListing,
  deleteMarketplaceDraft,
  downloadMarketplaceDraftPhoto,
  listMarketplaceDrafts,
  rollbackMarketplaceListing,
  saveMarketplaceDraft,
  uploadMarketplaceDraftPhoto,
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
type SellerPayoutStatus = 'NOT_STARTED' | 'ACTION_REQUIRED' | 'UNDER_REVIEW' | 'READY' | 'RESTRICTED';

const DEFAULT_OPTIONS: EnabledOptions = { meet: true, shipping: true, seller: false, aspirer: true };

function revokeLocalPhoto(url: string) {
  if (url.startsWith('blob:')) URL.revokeObjectURL(url);
}

async function fetchSellerPayoutStatus(): Promise<SellerPayoutStatus> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error('Sign in again to check Stripe payouts.');
  const response = await fetch('/api/stripe/connect/status', {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store'
  });
  const payload = await response.json().catch(() => ({})) as { status?: SellerPayoutStatus; error?: string };
  if (!response.ok) throw new Error(payload.error || 'Could not check Stripe payout verification.');
  return payload.status || 'NOT_STARTED';
}

function sellerPayoutNotice(status: SellerPayoutStatus) {
  if (status === 'READY') return 'Stripe payout setup is ready. You can now submit this item for review.';
  if (status === 'ACTION_REQUIRED') return 'Stripe needs more identity or bank information. Select Continue setup to finish it securely.';
  if (status === 'RESTRICTED') return 'Stripe paused payouts until required information is updated. Select Continue setup to resolve it.';
  if (status === 'UNDER_REVIEW') return 'Stripe is still reviewing your payout account. This page will update automatically.';
  return 'Set up Stripe payouts before publishing. You can keep saving private drafts meanwhile.';
}

export default function MarketplaceSellerComposer() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [campusId, setCampusId] = useState('');
  const [campusName, setCampusName] = useState('');
  const [sellerArea, setSellerArea] = useState('');
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [condition, setCondition] = useState<ItemCondition>('good');
  const [details, setDetails] = useState('');
  const [language, setLanguage] = useState<RequestLanguageCode>('any');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState('');
  const [savedPhotoPath, setSavedPhotoPath] = useState<string | null>(null);
  const [savedPhotoMime, setSavedPhotoMime] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<EnabledOptions>(DEFAULT_OPTIONS);
  const [shippingPayer, setShippingPayer] = useState<ShippingPayer>('buyer');
  const [sellerDeliveryMode, setSellerDeliveryMode] = useState<SellerDeliveryMode>('negotiable');
  const [sellerDeliveryPrice, setSellerDeliveryPrice] = useState('5');
  const [drafts, setDrafts] = useState<MarketplaceDraft[]>([]);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [payoutStatus, setPayoutStatus] = useState<SellerPayoutStatus>('NOT_STARTED');
  const [payoutStatusError, setPayoutStatusError] = useState('');
  const [payoutBusy, setPayoutBusy] = useState(false);
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
        const [{ data: profile }, universities, savedDrafts, payoutResult] = await Promise.all([
          supabase.from('profiles').select('current_campus_id,home_campus_id').eq('id', data.user.id).maybeSingle(),
          fetchActiveUniversities(),
          listMarketplaceDrafts(),
          fetchSellerPayoutStatus()
            .then((status) => ({ status, error: '' }))
            .catch((cause) => ({
              status: 'NOT_STARTED' as SellerPayoutStatus,
              error: cause instanceof Error ? cause.message : 'Could not check Stripe payout verification.'
            }))
        ]);
        if (!active) return;
        const nextId = profile?.current_campus_id || profile?.home_campus_id || universities[0]?.id || '';
        const campus = universities.find((item) => item.id === nextId) || universities[0];
        if (campus) {
          setCampusId(campus.id);
          setCampusName(campus.short_name || campus.name);
          setSellerArea((current) => current || [campus.city, campus.state].filter(Boolean).join(', '));
        }
        setDrafts(savedDrafts);
        const requestedDraftId = typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search).get('draft')?.trim() || ''
          : '';
        if (requestedDraftId) {
          const requestedDraft = savedDrafts.find((draft) => draft.id === requestedDraftId);
          if (requestedDraft) loadDraft(requestedDraft);
          else setNotice('That saved item draft is no longer available.');
        }
        setPayoutStatus(payoutResult.status);
        setPayoutStatusError(payoutResult.error);
        if (typeof window !== 'undefined') {
          const paymentReturn = new URLSearchParams(window.location.search).get('payments');
          if (paymentReturn === 'return') {
            setNotice(sellerPayoutNotice(payoutResult.status));
          } else if (paymentReturn === 'refresh') {
            setNotice('That Stripe setup link expired. Select Continue setup to open a fresh secure link.');
          }
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not load seller tools.');
      } finally {
        if (active) setLoading(false);
      }
    });
    return () => { active = false; };
  }, [router]);

  useEffect(() => () => { revokeLocalPhoto(photoUrl); }, [photoUrl]);

  useEffect(() => {
    if (payoutStatus !== 'UNDER_REVIEW') return;
    let active = true;
    const timer = window.setInterval(() => {
      void fetchSellerPayoutStatus()
        .then((nextStatus) => {
          if (!active || nextStatus === 'UNDER_REVIEW') return;
          setPayoutStatus(nextStatus);
          setPayoutStatusError('');
          setNotice(sellerPayoutNotice(nextStatus));
        })
        .catch((cause) => {
          if (active) setPayoutStatusError(cause instanceof Error ? cause.message : 'Could not refresh Stripe payout status.');
        });
    }, 30000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [payoutStatus]);

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
    if (sellerArea.trim()) result.push(`Seller area · ${sellerArea.trim()}`);
    if (enabled.meet) result.push('Meet up · Free');
    if (enabled.shipping) result.push(`Ship to me · ${shippingPayer === 'buyer' ? 'Buyer pays shipping' : shippingPayer === 'seller' ? 'Seller covers shipping' : 'Buyer or seller can cover'}`);
    if (enabled.seller) result.push(`Ask seller to deliver · ${sellerDeliveryMode === 'free' ? 'Free' : sellerDeliveryMode === 'fixed' ? `$${sellerDeliveryPrice || '0'}` : 'Negotiable'}`);
    if (enabled.aspirer) result.push('Ask an Aspirer · Free / Paid / Negotiable');
    return result;
  }, [enabled, shippingPayer, sellerDeliveryMode, sellerDeliveryPrice, sellerArea]);

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
      revokeLocalPhoto(photoUrl);
      setPhoto(next);
      setPhotoUrl(URL.createObjectURL(next));
      setError('');
      setNotice(savedPhotoPath ? 'New photo selected. Save the draft to replace the stored photo.' : 'Photo ready. Save the draft to keep it for later.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not use that photo.');
    }
  }

  function resetComposer() {
    revokeLocalPhoto(photoUrl);
    setTitle('');
    setPrice('');
    setCondition('good');
    setDetails('');
    setLanguage('any');
    setPhoto(null);
    setPhotoUrl('');
    setSavedPhotoPath(null);
    setSavedPhotoMime(null);
    setEnabled(DEFAULT_OPTIONS);
    setShippingPayer('buyer');
    setSellerDeliveryMode('negotiable');
    setSellerDeliveryPrice('5');
    setCurrentDraftId(null);
    setError('');
    setNotice('');
  }

  function loadDraft(draft: MarketplaceDraft) {
    revokeLocalPhoto(photoUrl);
    setCurrentDraftId(draft.id);
    setTitle(draft.title || '');
    setPrice(draft.price_cents == null ? '' : (draft.price_cents / 100).toFixed(draft.price_cents % 100 === 0 ? 0 : 2));
    setCondition(draft.item_condition || 'good');
    setDetails(draft.details || '');
    setLanguage(draft.language_code || 'any');
    if (draft.seller_area) setSellerArea(draft.seller_area);
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
    setPhotoUrl(draft.photo_url || '');
    setSavedPhotoPath(draft.photo_storage_path || null);
    setSavedPhotoMime(draft.photo_mime_type || null);
    setError('');
    setNotice(draft.photo_storage_path ? 'Draft loaded. Its saved photo is ready to submit for review.' : 'Draft loaded. Add a photo before submitting for review.');
  }

  async function refreshDrafts() {
    setDrafts(await listMarketplaceDrafts());
  }

  async function openPayoutFlow() {
    setPayoutBusy(true);
    setPayoutStatusError('');
    setError('');
    setNotice('');
    try {
      if (payoutStatus === 'UNDER_REVIEW') {
        const nextStatus = await fetchSellerPayoutStatus();
        setPayoutStatus(nextStatus);
        setNotice(sellerPayoutNotice(nextStatus));
        return;
      }

      const supabase = getSupabaseBrowserClient();
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const token = data.session?.access_token;
      if (!token) throw new Error('Sign in again to set up payouts.');

      const ready = payoutStatus === 'READY';
      const response = await fetch(ready ? '/api/stripe/connect/dashboard' : '/api/stripe/connect/onboard', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          ...(ready ? {} : { 'Content-Type': 'application/json' })
        },
        ...(ready ? {} : { body: JSON.stringify({ returnTo: 'seller' }) })
      });
      const payload = await response.json().catch(() => ({})) as { url?: string; error?: string; code?: string };
      if (!response.ok || !payload.url) {
        if (payload.code === 'SCHOOL_REQUIRED') throw new Error('Verify your school email before setting up seller payouts.');
        if (payload.code === 'PHONE_REQUIRED') throw new Error('Verify your phone before setting up seller payouts.');
        throw new Error(payload.error || 'Could not open Stripe payout setup.');
      }
      window.location.assign(payload.url);
    } catch (cause) {
      setPayoutStatusError(cause instanceof Error ? cause.message : 'Could not open Stripe payout setup.');
    } finally {
      setPayoutBusy(false);
    }
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
        fulfillmentMethods: methods,
        shippingPaidBy: enabled.shipping ? shippingPayer : null,
        sellerDeliveryMode: enabled.seller ? sellerDeliveryMode : null,
        sellerDeliveryPriceCents: enabled.seller && sellerDeliveryMode === 'fixed' ? Math.round(Number(sellerDeliveryPrice) * 100) : null,
        sellerArea,
        languageCode: language
      });
      setCurrentDraftId(saved.id);

      let finalDraft = saved;
      if (photo) {
        try {
          finalDraft = await uploadMarketplaceDraftPhoto(saved.id, photo);
          revokeLocalPhoto(photoUrl);
          setPhoto(null);
          setPhotoUrl(finalDraft.photo_url || '');
        } catch (photoCause) {
          await refreshDrafts();
          const detail = photoCause instanceof Error ? photoCause.message : 'Photo upload failed.';
          throw new Error(`Draft details were saved, but the photo was not. ${detail}`);
        }
      }

      setSavedPhotoPath(finalDraft.photo_storage_path || null);
      setSavedPhotoMime(finalDraft.photo_mime_type || null);
      await refreshDrafts();
      setNotice(finalDraft.photo_storage_path
        ? 'Draft saved privately, including the item photo. You can close this page and come back later.'
        : 'Draft saved privately. It is not visible in Market yet.');
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
    if (payoutStatus !== 'READY') return setError('Stripe payout verification is required before you can submit an item for sale. You can still save this listing as a private draft.');
    if (!campusId) return setError('Could not resolve your campus.');
    if (!title.trim()) return setError('Add an item title before submitting for review.');
    if (!price || Number(price) <= 0) return setError('Add a price greater than $0 before submitting for review.');
    if (!sellerArea.trim()) return setError('Add a public selling area, such as West Lafayette, IN.');
    if (!photo && !savedPhotoPath) return setError('Add at least one real photo before submitting for review.');
    if (!methods.length) return setError('Choose at least one delivery option.');
    if (enabled.seller && sellerDeliveryMode === 'fixed' && Number(sellerDeliveryPrice) <= 0) return setError('Add a seller delivery price greater than $0.');

    setPublishing(true);
    let createdId = '';
    try {
      const listingPhoto = photo || (savedPhotoPath ? await downloadMarketplaceDraftPhoto(savedPhotoPath, savedPhotoMime) : null);
      if (!listingPhoto) throw new Error('Could not restore the saved draft photo. Add the photo again and retry.');

      const listing = await createMarketplaceListing({
        campusId,
        title,
        priceCents: Math.round(Number(price) * 100),
        itemCondition: condition,
        details,
        fulfillmentMethods: methods,
        shippingPaidBy: enabled.shipping ? shippingPayer : null,
        sellerDeliveryMode: enabled.seller ? sellerDeliveryMode : null,
        sellerDeliveryPriceCents: enabled.seller && sellerDeliveryMode === 'fixed' ? Math.round(Number(sellerDeliveryPrice) * 100) : null,
        sellerArea,
        languageCode: language
      });
      createdId = listing.id;
      await uploadRequestMedia(listing.id, [listingPhoto]);
      if (currentDraftId) await deleteMarketplaceDraft(currentDraftId).catch(() => undefined);
      setNotice('Submitted for review. Opening My Activity…');
      router.push(`/activity?submitted=1&review=${encodeURIComponent(listing.id)}`);
    } catch (cause) {
      if (createdId) await rollbackMarketplaceListing(createdId).catch(() => undefined);
      setError(cause instanceof Error ? cause.message : 'Could not submit this item for review.');
    } finally {
      setPublishing(false);
    }
  }

  if (loading) return <div className={styles.loading}>Loading seller tools…</div>;

  return (
    <section className={styles.root}>
      <div className={styles.topline}>
        <div><span>SELL ON ASPIRE MARKET · {campusName || 'CAMPUS'}</span><h2>List an item.</h2><p>Save it as a private draft, or submit it for review when it is ready. Approved listings appear in Market.</p></div>
        <button type="button" className={styles.newButton} onClick={resetComposer}>+ New item</button>
      </div>

      <section className={`${styles.payoutGate} ${payoutStatus === 'READY' ? styles.payoutReady : styles.payoutNeedsAction}`} aria-label="Seller payout account">
        <div className={styles.payoutHeader}>
          <div className={styles.payoutMark}>{payoutStatus === 'READY' ? '✓' : 'PAY'}</div>
          <div className={styles.payoutCopy}>
            <span>SELLER PAYOUT ACCOUNT</span>
            <strong>{payoutStatus === 'READY'
              ? 'Ready to get paid'
              : payoutStatus === 'UNDER_REVIEW'
                ? 'Stripe is reviewing your account'
                : payoutStatus === 'ACTION_REQUIRED' || payoutStatus === 'RESTRICTED'
                  ? 'Finish setting up your payout account'
                  : 'Set up how you’ll get paid'}</strong>
            <p>{payoutStatus === 'READY'
              ? 'Your bank account and routing details are entered and stored only with Stripe. Aspire can send your seller earnings after an order is completed.'
              : 'Aspire uses Stripe to verify sellers, collect bank details, and send earnings securely. Aspire never receives or stores those bank details. You can save drafts now, but setup is required before publishing.'}</p>
          </div>
          <button type="button" className={styles.payoutAction} onClick={openPayoutFlow} disabled={payoutBusy}>
            {payoutBusy
              ? 'Opening…'
              : payoutStatus === 'READY'
                ? 'Manage payouts'
                : payoutStatus === 'UNDER_REVIEW'
                  ? 'Check status'
                  : payoutStatus === 'NOT_STARTED'
                    ? 'Set up payouts'
                    : 'Continue setup'} →
          </button>
        </div>
        {payoutStatus !== 'READY' && <div className={styles.payoutSteps} aria-label="Payout setup steps">
          <div><i>1</i><span><b>Verify identity</b><small>Handled securely by Stripe</small></span></div>
          <div><i>2</i><span><b>Add bank account</b><small>Aspire never stores bank details</small></span></div>
          <div><i>3</i><span><b>Receive earnings</b><small>After the order is completed</small></span></div>
        </div>}
        {payoutStatusError && <div className={styles.payoutError} role="status">{payoutStatusError}</div>}
      </section>

      <section className={styles.drafts} aria-label="Draft items">
        <div className={styles.draftHead}><div><span>DRAFT ITEMS</span><strong>{drafts.length} saved</strong></div><small>Drafts and photos stay private. Submitting removes the draft and creates a private listing for review; it appears in Market only after approval.</small></div>
        {drafts.length ? <div className={styles.draftRail}>{drafts.map((draft) => (
          <article key={draft.id} className={`${styles.draftCard} ${currentDraftId === draft.id ? styles.currentDraft : ''}`}>
            <button type="button" onClick={() => loadDraft(draft)}>
              {draft.photo_url ? <img className={styles.draftThumb} src={draft.photo_url} alt="" /> : <div className={styles.draftThumbEmpty}>NO PHOTO</div>}
              <small>{draft.price_cents == null ? 'PRICE NOT SET' : `$${(draft.price_cents / 100).toFixed(2)}`}</small>
              <strong>{draft.title || 'Untitled item'}</strong>
              <span>{draft.seller_area || 'Selling area not set'}</span>
              <span>{new Date(draft.updated_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
            </button>
            <button type="button" className={styles.deleteDraft} onClick={() => removeDraft(draft.id)} aria-label={`Delete ${draft.title || 'draft'}`}>×</button>
          </article>
        ))}</div> : <div className={styles.emptyDraft}>No draft items yet. Start below and press <b>Save draft</b> whenever you want to finish later.</div>}
      </section>

      <form className={styles.form} onSubmit={publish}>
        <div className={styles.basics}>
          <div className={styles.photoBox}>
            {photoUrl ? <img src={photoUrl} alt="Item preview" /> : <div><b>ITEM PHOTO</b><span>Required to submit</span></div>}
            <label><input type="file" accept="image/jpeg,image/png,image/webp" onChange={choosePhoto} />{photoUrl ? 'Change photo' : 'Add photo'}</label>
          </div>
          <div className={styles.fields}>
            <label><span>Item title</span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={180} placeholder="e.g. Calculus textbook" /></label>
            <div className={styles.twoCols}>
              <label><span>Price</span><div className={styles.money}>$ <input type="number" min="0.01" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="25" /></div></label>
              <label><span>Condition</span><select value={condition} onChange={(event) => setCondition(event.target.value as ItemCondition)}>{conditions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
            </div>
            <label><span>Description</span><textarea rows={4} value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Model, size, defects, accessories, pickup notes…" /><small>Reach · {requestLanguageLabel(language)}</small></label>
            <label className={styles.areaField}><span>Selling area <b>Public</b></span><input value={sellerArea} onChange={(event) => setSellerArea(event.target.value)} maxLength={120} placeholder="West Lafayette, IN" /><small>City + state only. Do not enter a street, dorm, room, or exact meetup spot.</small></label>
          </div>
        </div>

        <PostLanguagePicker value={language} onChange={setLanguage} compact />

        <div className={styles.sectionHead}><div><span>DELIVERY OPTIONS</span><h3>What are you willing to offer?</h3></div><small>Choose one or more</small></div>
        <div className={styles.optionGrid}>
          <button type="button" className={`${styles.option} ${enabled.meet ? styles.active : ''}`} onClick={() => toggle('meet')}><i>{enabled.meet ? '✓' : ''}</i><span><b>Meet up / Local pickup</b><small>Meet the buyer on campus or nearby.</small></span><em>Free</em></button>
          <button type="button" className={`${styles.option} ${enabled.shipping ? styles.active : ''}`} onClick={() => toggle('shipping')}><i>{enabled.shipping ? '✓' : ''}</i><span><b>Carrier shipping</b><small>Buyer enters an address and chooses an available carrier rate.</small></span><em>Calculated</em></button>
          <button type="button" className={`${styles.option} ${enabled.seller ? styles.active : ''}`} onClick={() => toggle('seller')}><i>{enabled.seller ? '✓' : ''}</i><span><b>I may deliver it myself</b><small>Let the buyer ask you to bring it directly.</small></span><em>{enabled.seller ? 'On' : 'Off'}</em></button>
          <button type="button" className={`${styles.option} ${enabled.aspirer ? styles.active : ''}`} onClick={() => toggle('aspirer')}><i>{enabled.aspirer ? '✓' : ''}</i><span><b>Allow Aspirer delivery</b><small>A third student can pick it up from you and deliver it.</small></span><em>Flexible</em></button>
        </div>

        {enabled.shipping && <div className={styles.subPanel}><h4>Who can cover carrier shipping?</h4><label><input type="radio" checked={shippingPayer === 'buyer'} onChange={() => setShippingPayer('buyer')} /><span><b>Buyer pays shipping</b><small>Added to the buyer checkout.</small></span></label><label><input type="radio" checked={shippingPayer === 'seller'} onChange={() => setShippingPayer('seller')} /><span><b>I’ll cover shipping</b><small>Deducted from your seller proceeds.</small></span></label><label><input type="radio" checked={shippingPayer === 'either'} onChange={() => setShippingPayer('either')} /><span><b>Either is okay</b><small>Buyer can choose who covers it at checkout.</small></span></label></div>}

        {enabled.seller && <div className={styles.subPanel}><h4>Your own delivery terms</h4><div className={styles.pills}>{(['free','fixed','negotiable'] as SellerDeliveryMode[]).map((mode) => <button type="button" key={mode} className={sellerDeliveryMode === mode ? styles.activePill : ''} onClick={() => setSellerDeliveryMode(mode)}>{mode === 'free' ? 'Free' : mode === 'fixed' ? 'Fixed price' : 'Negotiable'}</button>)}</div>{sellerDeliveryMode === 'fixed' && <label className={styles.deliveryPrice}><span>Delivery price</span><div className={styles.money}>$ <input value={sellerDeliveryPrice} inputMode="decimal" onChange={(event) => setSellerDeliveryPrice(event.target.value.replace(/[^0-9.]/g, ''))} /></div></label>}<p>The buyer asks first. You can accept or decline before checkout.</p></div>}

        <section className={styles.buyerPreview}><div><span>BUYER PREVIEW</span><strong>What buyers will see after approval</strong></div><div className={styles.previewTags}>{buyerOptions.map((option) => <span key={option}>✓ {option}</span>)}{!buyerOptions.length && <span>Choose at least one delivery option.</span>}</div></section>

        {(error || notice) && <div id="marketplace-seller-status" className={error ? styles.error : styles.notice} role="status">{error || notice}</div>}

        <div className={styles.actions}>
          <div><strong>{currentDraftId ? 'Editing saved draft' : 'New item'}</strong><span>{payoutStatus === 'READY' ? 'Stripe verified ✓ · Submit sends the listing through Post, Language, and Market review.' : 'Save keeps everything private. Publishing unlocks after Stripe payout verification is ready.'}</span></div>
          <button type="button" className={styles.saveDraft} onClick={saveDraft} disabled={savingDraft || publishing}>{savingDraft ? 'Saving…' : currentDraftId ? 'Save changes' : 'Save draft'}</button>
          <button type="submit" className={styles.publish} disabled={publishing || savingDraft || payoutStatus !== 'READY'}>{publishing ? 'Submitting…' : payoutStatus === 'READY' ? 'Submit for review →' : 'Stripe verification required'}</button>
        </div>
      </form>
    </section>
  );
}
