'use client';

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import AppDock from '../../AppDock';
import { getSupabaseBrowserClient } from '../../../lib/supabase/client';
import { createRequest, type ItemCondition } from '../../../lib/supabase/requests';
import { uploadRequestMedia, validateRequestImages } from '../../../lib/supabase/requestMedia';
import { setMarketplaceFulfillmentMethods } from '../../../lib/supabase/marketplaceListing';
import type { FlexibleFulfillmentMethod } from '../../../lib/supabase/marketplacePurchase';
import { runRequestAiSafety } from '../../../lib/supabase/trust';
import { fetchActiveUniversities } from '../../../lib/supabase/universities';
import styles from './MarketplaceSell.module.css';

const fulfillmentOptions: { value: FlexibleFulfillmentMethod; title: string; description: string }[] = [
  { value: 'campus_pickup', title: 'Local meetup', description: 'Free. Meet the buyer at a sensible public campus location.' },
  { value: 'shipping', title: 'Carrier shipping', description: 'Use Shippo for available USPS, UPS, FedEx, and other enabled carrier rates.' },
  { value: 'aspirer_delivery', title: 'Aspirer delivery', description: 'Let the buyer ask a nearby verified Aspirer to deliver it for free, a fixed reward, or a negotiated reward.' }
];

const conditions: { value: ItemCondition; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'like_new', label: 'Like new' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
  { value: 'for_parts', label: 'For parts' }
];

export default function MarketplaceSellForm() {
  const [campusId, setCampusId] = useState('');
  const [campusName, setCampusName] = useState('');
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [price, setPrice] = useState('');
  const [condition, setCondition] = useState<ItemCondition>('good');
  const [negotiable, setNegotiable] = useState(false);
  const [pickupArea, setPickupArea] = useState('');
  const [methods, setMethods] = useState<FlexibleFulfillmentMethod[]>(['campus_pickup']);
  const [photos, setPhotos] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const previews = useMemo(() => photos.map((file) => ({ file, url: URL.createObjectURL(file) })), [photos]);
  useEffect(() => () => previews.forEach((item) => URL.revokeObjectURL(item.url)), [previews]);

  const reachSummary = useMemo(() => {
    if (methods.includes('shipping')) return {
      title: 'Network reach enabled',
      body: 'Because Carrier Shipping is on, this listing can appear in Shippable Anywhere and remote-campus discovery. Remote buyers will use the protected Shippo rate + label flow.'
    };
    if (methods.includes('aspirer_delivery')) return {
      title: 'Campus network delivery enabled',
      body: 'Buyers can create an Aspire Network delivery request and choose Free, Paid, Custom, or Negotiable help from verified Aspirers.'
    };
    return {
      title: 'Local campus only',
      body: 'This listing stays focused on local meetup. Add Carrier Shipping if you want buyers from other Aspire campuses to discover it.'
    };
  }, [methods]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    void supabase.auth.getUser().then(async ({ data, error: authError }) => {
      if (authError) throw authError;
      if (!data.user) {
        window.location.assign('/login?next=%2Fmarketplace%2Fsell');
        return;
      }
      const [{ data: profile }, universities] = await Promise.all([
        supabase.from('profiles').select('current_campus_id,home_campus_id').eq('id', data.user.id).maybeSingle(),
        fetchActiveUniversities()
      ]);
      const id = profile?.current_campus_id || profile?.home_campus_id || universities[0]?.id || '';
      const university = universities.find((entry) => entry.id === id) || universities[0];
      setCampusId(university?.id || '');
      setCampusName(university?.name || 'your campus');
    }).catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Could not load your campus.')).finally(() => setLoading(false));
  }, []);

  function toggleMethod(method: FlexibleFulfillmentMethod) {
    setMethods((current) => current.includes(method) ? current.filter((item) => item !== method) : [...current, method]);
  }

  function setPreset(preset: 'local' | 'campus_flexible' | 'all') {
    if (preset === 'local') setMethods(['campus_pickup']);
    else if (preset === 'campus_flexible') setMethods(['campus_pickup', 'aspirer_delivery']);
    else setMethods(['campus_pickup', 'shipping', 'aspirer_delivery']);
  }

  function choosePhotos(event: ChangeEvent<HTMLInputElement>) {
    const incoming = Array.from(event.target.files || []);
    if (!incoming.length) return;
    try {
      const next = [...photos, ...incoming].slice(0, 5);
      validateRequestImages(next);
      setPhotos(next);
      setError('');
    } catch (photoError) {
      setError(photoError instanceof Error ? photoError.message : 'Could not add those photos.');
    } finally {
      event.target.value = '';
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSuccess('');
    const dollars = Number(price);
    if (!campusId) return setError('Choose a campus before posting.');
    if (!title.trim()) return setError('Add a listing title.');
    if (!Number.isFinite(dollars) || dollars <= 0) return setError('Add a valid item price.');
    if (!methods.length) return setError('Choose at least one fulfillment method.');
    if (photos.length < 1) return setError('Add at least one real photo of the item.');
    if (methods.includes('aspirer_delivery') && pickupArea.trim().length < 2) return setError('Add a public pickup area so buyers can create an Aspirer delivery request without exposing your exact address.');
    try { validateRequestImages(photos); } catch (photoError) { return setError(photoError instanceof Error ? photoError.message : 'Check your photos.'); }

    setBusy(true);
    try {
      const request = await createRequest({
        kind: 'buy_sell',
        category: 'Buy & sell',
        title: title.trim(),
        details: details.trim(),
        campusId,
        meeting_label: pickupArea.trim() || undefined,
        amount_cents: Math.round(dollars * 100),
        currency: 'USD',
        market_intent: 'sell',
        item_condition: condition,
        price_negotiable: negotiable,
        fulfillment_method: methods.includes('shipping') ? 'shipping' : 'campus_pickup',
        quantity: 1
      });

      await setMarketplaceFulfillmentMethods(request.id, methods);
      await uploadRequestMedia(request.id, photos);
      const safety = await runRequestAiSafety(request.id);
      if (safety.moderationStatus === 'approved') {
        setSuccess(methods.includes('shipping')
          ? 'Listing published. Carrier shipping is enabled, so it can be discovered across Aspire campuses.'
          : 'Listing published with your selected fulfillment methods.');
      } else if (safety.moderationStatus === 'pending') {
        setSuccess('Listing saved. It will stay private until the remaining safety review is complete.');
      } else {
        setError('The listing was not published because the safety review found a policy concern.');
        return;
      }
      setTitle('');
      setDetails('');
      setPrice('');
      setCondition('good');
      setNegotiable(false);
      setPickupArea('');
      setMethods(['campus_pickup']);
      setPhotos([]);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not publish the listing.');
    } finally {
      setBusy(false);
    }
  }

  return <main className={styles.page}>
    <AppDock active="discover" />
    <div className={styles.shell}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>ASPIRE MARKET · SELL</p>
        <h1>Choose how buyers can get it.</h1>
        <p>You can allow one or several fulfillment methods. Buyers only see the methods you approve, then choose at checkout.</p>
      </section>

      <section className={styles.card}>
        {loading ? <p>Loading your campus…</p> : <form className={styles.form} onSubmit={submit}>
          <label className={styles.label}>Listing title
            <input className={styles.input} value={title} onChange={(event) => setTitle(event.target.value)} maxLength={180} placeholder="Calculus Textbook (Stewart 8e)" />
          </label>
          <div className={styles.two}>
            <label className={styles.label}>Price
              <input className={styles.input} type="number" min="0.01" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="25.00" />
            </label>
            <label className={styles.label}>Condition
              <select className={styles.select} value={condition} onChange={(event) => setCondition(event.target.value as ItemCondition)}>{conditions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
            </label>
          </div>
          <label className={styles.check}><input type="checkbox" checked={negotiable} onChange={(event) => setNegotiable(event.target.checked)} /><span><strong>Price is negotiable</strong><br />The final item price is locked in the protected order.</span></label>
          <label className={styles.label}>Description
            <textarea className={styles.textarea} value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Edition, condition, defects, included accessories, and anything else the buyer should know." maxLength={3000} />
          </label>

          <div className={styles.label}>Fulfillment methods · choose one or more
            <div className={styles.presetRow}>
              <button type="button" onClick={() => setPreset('local')}>Local only</button>
              <button type="button" onClick={() => setPreset('campus_flexible')}>Meetup + Aspirer</button>
              <button type="button" onClick={() => setPreset('all')}>Maximum reach</button>
            </div>
            <div className={styles.fulfillment}>{fulfillmentOptions.map((option) => <label key={option.value} className={`${styles.option} ${methods.includes(option.value) ? styles.optionActive : ''}`}>
              <input type="checkbox" checked={methods.includes(option.value)} onChange={() => toggleMethod(option.value)} />
              <span><strong>{option.title}</strong><small>{option.description}</small></span>
            </label>)}</div>
          </div>

          <div className={styles.reachNote}><strong>{reachSummary.title}</strong><span>{reachSummary.body}</span></div>

          {(methods.includes('campus_pickup') || methods.includes('aspirer_delivery')) && <label className={styles.label}>Public pickup area
            <input className={styles.input} value={pickupArea} onChange={(event) => setPickupArea(event.target.value)} placeholder="Hillenbrand Hall area" maxLength={160} />
            <small>Use only a coarse public area. Exact handoff instructions stay in the private connection after a match.</small>
          </label>}

          <div className={styles.photos}>
            <span className={styles.label}>Item photos · at least 1</span>
            <label className={styles.photoInput}><input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple onChange={choosePhotos} /></label>
            {previews.length > 0 && <div className={styles.previews}>{previews.map((item, index) => <div className={styles.preview} key={`${item.file.name}-${index}`}><img src={item.url} alt={`Listing preview ${index + 1}`} /><button type="button" aria-label={`Remove photo ${index + 1}`} onClick={() => setPhotos((current) => current.filter((_, itemIndex) => itemIndex !== index))}>×</button></div>)}</div>}
          </div>

          <div className={styles.note}><strong>{campusName}</strong> · Marketplace item payment always uses Aspire Protected. Carrier shipping uses Shippo. Free Aspirer help never enters Stripe; a paid Aspirer reward becomes a separate protected connection and cannot start pickup until that reward is secured.</div>
          <div className={styles.note}><strong>Not allowed:</strong> alcohol, tobacco, medication, weapons, illegal or stolen goods, counterfeit items, high-value cash, account credentials, or other regulated/prohibited goods.</div>
          {success && <p className={styles.success}>{success}</p>}
          {error && <p className={styles.error} role="alert">{error}</p>}
          <div className={styles.actions}><button className={styles.primary} type="submit" disabled={busy}>{busy ? 'Publishing…' : 'Publish listing'}</button><a className={styles.secondary} href="/marketplace">Back to Marketplace</a><a className={styles.secondary} href="/post">Post something else</a></div>
        </form>}
      </section>
    </div>
  </main>;
}
