'use client';

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppDock from '../../AppDock';
import { getSupabaseBrowserClient } from '../../../lib/supabase/client';
import { createRequest, type ItemCondition } from '../../../lib/supabase/requests';
import { uploadRequestMedia, validateRequestImages } from '../../../lib/supabase/requestMedia';
import { fetchActiveUniversities } from '../../../lib/supabase/universities';
import './seller-preview.css';
import './seller-composer.css';

type OptionKey = 'meet' | 'shipping' | 'seller' | 'aspirer';
type ShippingPayer = 'buyer' | 'seller' | 'either';
type SellerDeliveryMode = 'free' | 'fixed' | 'negotiable';

type EnabledOptions = Record<OptionKey, boolean>;

const conditions: { value: ItemCondition; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'like_new', label: 'Like new' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
  { value: 'for_parts', label: 'For parts' }
];

export default function MarketplaceSellerComposer() {
  const router = useRouter();
  const [campusId, setCampusId] = useState('');
  const [campusName, setCampusName] = useState('');
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [condition, setCondition] = useState<ItemCondition>('good');
  const [details, setDetails] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState('');
  const [enabled, setEnabled] = useState<EnabledOptions>({ meet: true, shipping: true, seller: false, aspirer: true });
  const [shippingPayer, setShippingPayer] = useState<ShippingPayer>('buyer');
  const [sellerDeliveryMode, setSellerDeliveryMode] = useState<SellerDeliveryMode>('negotiable');
  const [sellerDeliveryPrice, setSellerDeliveryPrice] = useState('5');
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let active = true;
    supabase.auth.getUser().then(async ({ data }) => {
      if (!active) return;
      if (!data.user) {
        router.replace('/login?next=%2Fmarketplace%2Fsell');
        return;
      }
      const [{ data: profile }, universities] = await Promise.all([
        supabase.from('profiles').select('current_campus_id,home_campus_id').eq('id', data.user.id).maybeSingle(),
        fetchActiveUniversities()
      ]);
      const nextId = profile?.current_campus_id || profile?.home_campus_id || universities[0]?.id || '';
      const campus = universities.find((item) => item.id === nextId) || universities[0];
      if (campus) {
        setCampusId(campus.id);
        setCampusName(campus.short_name || campus.name);
      }
      setLoading(false);
    }).catch((cause) => {
      setError(cause instanceof Error ? cause.message : 'Could not load your seller account.');
      setLoading(false);
    });
    return () => { active = false; };
  }, [router]);

  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl); }, [photoUrl]);

  const buyerOptions = useMemo(() => {
    const result: string[] = [];
    if (enabled.meet) result.push('Meet up · Free');
    if (enabled.shipping) result.push(`Ship to me · ${shippingPayer === 'buyer' ? 'Buyer pays shipping' : shippingPayer === 'seller' ? 'Seller covers shipping' : 'Buyer or seller can cover'}`);
    if (enabled.seller) result.push(`Ask seller to deliver · ${sellerDeliveryMode === 'free' ? 'Free' : sellerDeliveryMode === 'fixed' ? `$${sellerDeliveryPrice || '0'}` : 'Negotiable'}`);
    if (enabled.aspirer) result.push('Ask an Aspirer · Free / Paid / Negotiable');
    return result;
  }, [enabled, shippingPayer, sellerDeliveryMode, sellerDeliveryPrice]);

  function toggle(key: OptionKey) {
    setEnabled((current) => ({ ...current, [key]: !current[key] }));
    setError('');
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

  async function publish(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (!campusId) return setError('Could not resolve your campus.');
    if (!title.trim()) return setError('Add an item title.');
    if (!price || Number(price) <= 0) return setError('Add a price greater than $0.');
    if (!photo) return setError('Add at least one real photo of the item.');
    if (!buyerOptions.length) return setError('Choose at least one delivery option.');
    if (enabled.seller && sellerDeliveryMode === 'fixed' && Number(sellerDeliveryPrice) <= 0) return setError('Add a seller delivery price greater than $0.');

    setPublishing(true);
    try {
      const fallbackFulfillment = enabled.shipping && !enabled.meet ? 'shipping' : 'campus_pickup';
      const request = await createRequest({
        kind: 'buy_sell',
        category: 'Buy & sell',
        title: title.trim(),
        details: details.trim(),
        campusId,
        amount_cents: Math.round(Number(price) * 100),
        currency: 'USD',
        payment_method: 'aspire',
        market_intent: 'sell',
        item_condition: condition,
        price_negotiable: false,
        fulfillment_method: fallbackFulfillment,
        quantity: 1,
        language_code: 'en'
      });

      await uploadRequestMedia(request.id, [photo]);

      const methods = [
        enabled.meet ? 'campus_pickup' : null,
        enabled.shipping ? 'shipping' : null,
        enabled.seller ? 'seller_delivery' : null,
        enabled.aspirer ? 'aspirer_delivery' : null
      ].filter(Boolean);

      const supabase = getSupabaseBrowserClient();
      const { error: updateError } = await supabase
        .from('requests')
        .update({
          fulfillment_methods: methods,
          shipping_paid_by_default: enabled.shipping ? shippingPayer : null,
          seller_delivery_mode: enabled.seller ? sellerDeliveryMode : null,
          seller_delivery_price_cents: enabled.seller && sellerDeliveryMode === 'fixed' ? Math.round(Number(sellerDeliveryPrice) * 100) : null
        })
        .eq('id', request.id);
      if (updateError) throw updateError;

      router.push(`/connections?posted=${request.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not publish this listing.');
    } finally {
      setPublishing(false);
    }
  }

  if (loading) return <main className="sellerPreviewPage"><AppDock active="post" /><div className="sellerPreviewShell"><p>Loading seller tools…</p></div></main>;

  return (
    <main className="sellerPreviewPage">
      <AppDock active="post" />
      <form className="sellerPreviewShell" onSubmit={publish}>
        <header className="sellerPreviewHeader">
          <p>SELL ON ASPIRE MARKET · {campusName || 'CAMPUS'}</p>
          <h1>List the item, then choose how buyers can get it.</h1>
          <span>This creates a real marketplace listing. Your selected delivery methods are saved with the item and shown to buyers at Buy Now.</span>
        </header>

        {error && <div className="sellerComposerError" role="alert">{error}</div>}

        <div className="sellerPreviewLayout sellerComposerLayout">
          <section className="sellerPreviewPanel">
            <div className="sellerComposerBasics">
              <div className="sellerComposerPhoto">
                {photoUrl ? <img src={photoUrl} alt="Item preview" /> : <span>ITEM PHOTO</span>}
                <label><input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={choosePhoto} />{photo ? 'Change photo' : 'Add photo'}</label>
              </div>
              <div className="sellerComposerFields">
                <label><span>Item title</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Calculus textbook" maxLength={180} /></label>
                <div className="sellerComposerTwo"><label><span>Price</span><div className="sellerMoneyInput">$ <input type="number" min="0.01" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="25" /></div></label><label><span>Condition</span><select value={condition} onChange={(e) => setCondition(e.target.value as ItemCondition)}>{conditions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label></div>
                <label><span>Description</span><textarea rows={3} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Size, model, defects, accessories, pickup notes…" /></label>
              </div>
            </div>

            <div className="sellerPreviewSectionHead"><div><small>DELIVERY OPTIONS</small><h2>What are you willing to offer?</h2></div><span>Choose one or more</span></div>

            <button type="button" className={`sellerOption ${enabled.meet ? 'active' : ''}`} onClick={() => toggle('meet')}><span className="sellerCheck">{enabled.meet ? '✓' : ''}</span><div><b>Meet up / Local pickup</b><small>Meet the buyer on campus or nearby.</small></div><em>Free</em></button>

            <button type="button" className={`sellerOption ${enabled.shipping ? 'active' : ''}`} onClick={() => toggle('shipping')}><span className="sellerCheck">{enabled.shipping ? '✓' : ''}</span><div><b>Carrier shipping</b><small>Buyer enters an address and chooses an available carrier rate.</small></div><em>Calculated</em></button>
            {enabled.shipping && <div className="sellerSubPanel"><h3>Who can cover shipping?</h3><label><input type="radio" checked={shippingPayer === 'buyer'} onChange={() => setShippingPayer('buyer')} /><span><b>Buyer pays shipping</b><small>Added to buyer checkout.</small></span></label><label><input type="radio" checked={shippingPayer === 'seller'} onChange={() => setShippingPayer('seller')} /><span><b>I&apos;ll cover shipping</b><small>Deducted from your proceeds.</small></span></label><label><input type="radio" checked={shippingPayer === 'either'} onChange={() => setShippingPayer('either')} /><span><b>Either is okay</b><small>Final payer can be agreed before checkout.</small></span></label></div>}

            <button type="button" className={`sellerOption ${enabled.seller ? 'active' : ''}`} onClick={() => toggle('seller')}><span className="sellerCheck">{enabled.seller ? '✓' : ''}</span><div><b>I may deliver it myself</b><small>Let the buyer ask you to bring the item directly.</small></div><em>{enabled.seller ? 'On' : 'Off'}</em></button>
            {enabled.seller && <div className="sellerSubPanel"><h3>Your delivery terms</h3><div className="sellerPills">{(['free','fixed','negotiable'] as const).map((mode) => <button type="button" key={mode} className={sellerDeliveryMode === mode ? 'active' : ''} onClick={() => setSellerDeliveryMode(mode)}>{mode === 'free' ? 'Free' : mode === 'fixed' ? 'Fixed price' : 'Negotiable'}</button>)}</div>{sellerDeliveryMode === 'fixed' && <label className="sellerPrice"><span>Delivery price</span><div>$ <input value={sellerDeliveryPrice} onChange={(e) => setSellerDeliveryPrice(e.target.value.replace(/[^0-9.]/g,''))} /></div></label>}<p>Buyer sends a request first. You can accept or decline before checkout.</p></div>}

            <button type="button" className={`sellerOption ${enabled.aspirer ? 'active' : ''}`} onClick={() => toggle('aspirer')}><span className="sellerCheck">{enabled.aspirer ? '✓' : ''}</span><div><b>Allow Aspirer delivery</b><small>A third student can pick the item up from you and deliver it to the buyer.</small></div><em>Flexible</em></button>

            <button className="sellerPreviewPrimary" type="submit" disabled={publishing}>{publishing ? 'Publishing…' : 'Publish item →'}</button>
          </section>

          <aside className="sellerBuyerPreview">
            <small>BUYER PREVIEW</small><h2>What the buyer will see</h2><p>Only the options you enable appear when a buyer presses Buy Now.</p>
            <div className="sellerBuyerList">{buyerOptions.map((option) => <div key={option}><span>✓</span><b>{option}</b></div>)}{!buyerOptions.length && <div><span>!</span><b>Choose at least one option</b></div>}</div>
            <div className="sellerMoneyExample"><small>LISTING PREVIEW</small><div><span>Item</span><b>{price ? `$${Number(price).toFixed(2)}` : 'Add a price'}</b></div><div><span>Shipping</span><b>{enabled.shipping ? (shippingPayer === 'seller' ? 'Seller can cover' : shippingPayer === 'buyer' ? 'Buyer pays' : 'Flexible') : 'Not offered'}</b></div><div><span>Payment</span><b>Aspire Protected</b></div></div>
          </aside>
        </div>
      </form>
    </main>
  );
}
