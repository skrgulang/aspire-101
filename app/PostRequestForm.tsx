'use client';

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import { createRequest, RequestKind } from '../lib/supabase/requests';
import { uploadRequestMedia, validateRequestImages } from '../lib/supabase/requestMedia';
import { acknowledgeSafety } from '../lib/supabase/safety';
import { fetchActiveUniversities, University } from '../lib/supabase/universities';
import CampusPicker from './CampusPicker';
import PaymentFeePreview from './PaymentFeePreview';

type CategoryOption = {
  label: string;
  value: string;
  icon: string;
  prompt: string;
  examples: string[];
  defaultKind: RequestKind;
};

const categories: CategoryOption[] = [
  { label: 'Get me there', value: 'Ride', icon: '↗', prompt: 'Where are you trying to go?', examples: ['Need a ride to IND Friday at 4 PM', 'Anyone heading to Chicago Saturday?'], defaultKind: 'split_cost' },
  { label: 'Pick this up', value: 'Pickup / errand', icon: '□', prompt: 'What needs picking up?', examples: ['Can someone pick up my Target order?', 'Need a package picked up before 6 PM'], defaultKind: 'paid_help' },
  { label: 'Give me a hand', value: 'Moving / help', icon: '+', prompt: 'What do you need help with?', examples: ['Need help moving a desk upstairs', 'Can someone help carry a mini fridge?'], defaultKind: 'paid_help' },
  { label: 'Study / class', value: 'Study', icon: '✎', prompt: 'What class or topic?', examples: ['Math 55 study tonight?', 'Need help with linear algebra before Thursday'], defaultKind: 'community' },
  { label: 'Build something', value: 'Project / collab', icon: '✦', prompt: 'Who are you looking for?', examples: ['Need a designer for a weekend AI project', 'Looking for a hackathon teammate'], defaultKind: 'collaboration' },
  { label: 'Buy & sell', value: 'Buy & sell', icon: '$', prompt: 'What are you buying or selling?', examples: ['Looking for a mini fridge near campus', 'Selling a desk lamp before move-out'], defaultKind: 'buy_sell' },
  { label: 'Something else', value: 'Other', icon: '…', prompt: 'Ask campus anything useful.', examples: ['Where do people actually study late?', 'Anyone want to ski Saturday?'], defaultKind: 'community' }
];

const kinds: { value: RequestKind; label: string; helper: string }[] = [
  { value: 'community', label: 'Community', helper: 'No money expected' },
  { value: 'paid_help', label: 'Paid help', helper: 'Compensation involved' },
  { value: 'split_cost', label: 'Split cost', helper: 'Share a real expense' },
  { value: 'buy_sell', label: 'Buy & sell', helper: 'An item changes hands' },
  { value: 'collaboration', label: 'Collab', helper: 'Build or do it together' }
];

function safetyContext(category: string, kind: RequestKind) {
  if (category === 'Ride') return {
    title: 'Riding together?',
    note: 'Confirm the driver, vehicle, pickup point, destination, and exact cost before leaving. If something feels wrong, do not get in the car.'
  };
  if (category === 'Moving / help') return {
    title: 'Meeting at a private place?',
    note: 'Share a detailed address only after you choose who to connect with. Consider having another person around and keep valuables out of sight.'
  };
  if (category === 'Buy & sell') return {
    title: 'Exchanging an item?',
    note: 'Meet in a sensible place, inspect the item before paying, and remember Aspire cannot verify cash or payments made outside the platform.'
  };
  if (kind === 'paid_help' || kind === 'split_cost') return {
    title: 'Money involved?',
    note: 'Agree on the amount, timing, scope, and what counts as complete before anything starts. Pay with Aspire is only released after both people mark the connection complete.'
  };
  if (kind === 'collaboration') return {
    title: 'Building together?',
    note: 'Agree on the goal and expectations first. A project connection is not employment unless both sides separately enter an employment relationship.'
  };
  return {
    title: 'Keep the connection clear.',
    note: 'Choose who you want to connect with, keep expectations clear, and use Report or Block if someone misuses Aspire.'
  };
}

export default function PostRequestForm() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [universities, setUniversities] = useState<University[]>([]);
  const [homeCampusId, setHomeCampusId] = useState('');
  const [campusId, setCampusId] = useState('');
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [category, setCategory] = useState('Ride');
  const [kind, setKind] = useState<RequestKind>('split_cost');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'none' | 'in_person' | 'aspire'>('none');
  const [photos, setPhotos] = useState<File[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');
  const [posted, setPosted] = useState<{ id: string; title: string; campus: string; warning?: string } | null>(null);

  const selectedCategory = categories.find((item) => item.value === category) ?? categories[0];
  const context = safetyContext(category, kind);
  const moneyInvolved = useMemo(() => kind === 'paid_help' || kind === 'buy_sell' || kind === 'split_cost', [kind]);
  const selectedCampus = useMemo(() => universities.find((item) => item.id === campusId) ?? null, [universities, campusId]);
  const homeCampus = useMemo(() => universities.find((item) => item.id === homeCampusId) ?? null, [universities, homeCampusId]);
  const visiting = Boolean(selectedCampus && homeCampus && selectedCampus.id !== homeCampus.id);
  const photoPreviews = useMemo(() => photos.map((file) => ({ file, url: URL.createObjectURL(file) })), [photos]);

  useEffect(() => () => photoPreviews.forEach((item) => URL.revokeObjectURL(item.url)), [photoPreviews]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let active = true;

    supabase.auth.getUser().then(async ({ data }) => {
      if (!active) return;
      if (!data.user) {
        router.replace('/login?next=/post');
        return;
      }

      try {
        const [{ data: profile }, campusList] = await Promise.all([
          supabase.from('profiles').select('home_campus_id,current_campus_id').eq('id', data.user.id).maybeSingle(),
          fetchActiveUniversities()
        ]);
        if (!active) return;
        const homeId = typeof profile?.home_campus_id === 'string' ? profile.home_campus_id : '';
        const currentId = typeof profile?.current_campus_id === 'string' ? profile.current_campus_id : '';
        setUniversities(campusList);
        setHomeCampusId(homeId);
        setCampusId(currentId && campusList.some((item) => item.id === currentId) ? currentId : homeId);
        if (!homeId) setError('We could not resolve your verified home campus. Open Profile before posting.');
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Could not load your campus identity.');
      } finally {
        if (active) setCheckingAuth(false);
      }
    });

    return () => { active = false; };
  }, [router]);

  function chooseCategory(item: CategoryOption) {
    setCategory(item.value);
    setKind(item.defaultKind);
    if (item.defaultKind === 'community' || item.defaultKind === 'collaboration') {
      setAmount('');
      setPaymentMethod('none');
    }
  }

  function chooseKind(next: RequestKind) {
    setKind(next);
    if (next === 'community' || next === 'collaboration') {
      setAmount('');
      setPaymentMethod('none');
    }
  }

  function choosePhotos(event: ChangeEvent<HTMLInputElement>) {
    const incoming = Array.from(event.target.files ?? []);
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

  function removePhoto(index: number) {
    setPhotos((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function openConfirmation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!title.trim()) return setError('Tell campus what you need first.');
    if (!selectedCampus) return setError('Choose a supported campus for this request.');
    if (kind === 'paid_help' && (!amount || Number(amount) <= 0)) return setError('Add the amount you are offering for paid help.');
    if (paymentMethod === 'aspire' && (!amount || Number(amount) <= 0)) return setError('Add a positive amount before choosing Pay with Aspire.');
    try {
      validateRequestImages(photos);
    } catch (photoError) {
      return setError(photoError instanceof Error ? photoError.message : 'Check your request photos.');
    }
    setConfirming(true);
  }

  async function publish() {
    if (!selectedCampus) return;
    setPublishing(true);
    setError('');
    try {
      const amountCents = amount ? Math.round(Number(amount) * 100) : undefined;
      const request = await createRequest({
        kind,
        category,
        title,
        details,
        campusId: selectedCampus.id,
        amount_cents: amountCents,
        payment_method: moneyInvolved ? paymentMethod : 'none'
      });

      let warning = '';
      if (photos.length) {
        try {
          await uploadRequestMedia(request.id, photos);
        } catch (mediaError) {
          warning = mediaError instanceof Error ? `Request posted, but photos could not upload: ${mediaError.message}` : 'Request posted, but photos could not upload.';
        }
      }

      await acknowledgeSafety(`${category}:${kind}`, request.id).catch(() => undefined);
      const supabase = getSupabaseBrowserClient();
      await supabase.from('profiles').update({
        current_campus_id: visiting ? selectedCampus.id : null,
        campus_last_selected_at: new Date().toISOString()
      }).eq('id', request.poster_id).catch(() => undefined);

      setPosted({ id: request.id, title: request.title, campus: request.campus || selectedCampus.name, warning });
      setConfirming(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not publish this request. Try again.');
      setConfirming(false);
    } finally {
      setPublishing(false);
    }
  }

  if (checkingAuth) return <div className="postLoading"><span /><p>Loading your campus identity…</p></div>;

  if (posted) {
    return (
      <section className="postSuccess">
        <p className="eyebrow">REQUEST POSTED</p>
        <h1>It&apos;s live.</h1>
        <article>
          <span>{selectedCategory.label.toUpperCase()}</span>
          <strong>{posted.title}</strong>
          <small>{posted.campus} · #{posted.id.slice(0, 8)} · open now</small>
        </article>
        {posted.warning && <p className="postError">{posted.warning}</p>}
        <p className="postSuccessNote">Students can respond. You still choose who — if anyone — you connect with.</p>
        <div className="postSuccessActions">
          <a className="button buttonGold" href="/discover">Discover requests <span>↗</span></a>
          <button className="quietPostButton" type="button" onClick={() => { setPosted(null); setTitle(''); setDetails(''); setAmount(''); setPhotos([]); }}>Post another</button>
        </div>
      </section>
    );
  }

  return (
    <>
      <form className="postForm" onSubmit={openConfirmation} noValidate>
        <div className="postFormHeading">
          <div className="postModeSwitch"><a className="active" href="/post">I need something</a><a href="/discover">I can help</a></div>
          <p className="eyebrow">ASK CAMPUS</p>
          <h1>What do you need?</h1>
          <p>Start with the need. Your verified home campus stays attached even when you&apos;re visiting somewhere else.</p>
        </div>

        <div className="postCategoryPicker" aria-label="Choose a request category">
          {categories.map((item) => (
            <button key={item.value} type="button" className={category === item.value ? 'active' : ''} onClick={() => chooseCategory(item)}>
              <i>{item.icon}</i><strong>{item.label}</strong><span>{item.prompt}</span>
            </button>
          ))}
        </div>

        <div className="postQuickStarts"><span>TRY ONE</span>{selectedCategory.examples.map((example) => <button type="button" key={example} onClick={() => setTitle(example)}>{example} ↗</button>)}</div>

        <label className="postField postFieldLarge postComposerField">
          <span>{selectedCategory.prompt}</span>
          <textarea value={title} onChange={(e) => setTitle(e.target.value)} maxLength={180} rows={3} placeholder={selectedCategory.examples[0]} />
          <small>{title.length}/180</small>
        </label>

        <section className={`requestMediaComposer ${category === 'Buy & sell' ? 'isRecommended' : ''}`}>
          <div className="requestMediaHead">
            <div><span>PHOTOS {category === 'Buy & sell' ? '· RECOMMENDED' : '· OPTIONAL'}</span><strong>Show people what you mean.</strong></div>
            <small>Up to 5 · JPG, PNG, WebP or HEIC · 8 MB each</small>
          </div>
          <div className="requestMediaRail">
            {photoPreviews.map((item, index) => (
              <figure key={`${item.file.name}-${index}`}>
                <img src={item.url} alt={`Request preview ${index + 1}`} />
                <button type="button" onClick={() => removePhoto(index)} aria-label={`Remove photo ${index + 1}`}>×</button>
                {index === 0 && <figcaption>COVER</figcaption>}
              </figure>
            ))}
            {photos.length < 5 && (
              <label className="requestMediaAdd">
                <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple onChange={choosePhotos} />
                <i>+</i><strong>Add photos</strong><span>{photos.length}/5</span>
              </label>
            )}
          </div>
        </section>

        <div className="postEssentials">
          <div className="postField postCampusField">
            <span>Campus context</span>
            <CampusPicker universities={universities} value={campusId} onChange={setCampusId} homeCampusId={homeCampusId} maxNearbyMiles={300} />
            <small>{visiting ? `VISITING · You are posting at ${selectedCampus?.short_name}, but your verified identity remains ${homeCampus?.short_name}.` : `HOME CAMPUS · ${homeCampus?.name || 'Your verified university'} stays attached to your identity.`}</small>
          </div>

          <fieldset className="postKinds">
            <legend>Exchange</legend>
            <div className="postKindGrid">
              {kinds.map((item) => (
                <button type="button" key={item.value} className={kind === item.value ? 'postKind active' : 'postKind'} onClick={() => chooseKind(item.value)}>
                  <strong>{item.label}</strong><span>{item.helper}</span>
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        {moneyInvolved && (
          <>
            <div className="postMoney postMoneyFresh">
              <label className="postField">
                <span>{kind === 'paid_help' ? 'What are you offering?' : 'Amount / share'}</span>
                <div className="moneyInput"><b>$</b><input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="25" /></div>
              </label>
              <label className="postField">
                <span>Payment plan</span>
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as 'none' | 'in_person' | 'aspire')}>
                  <option value="none">Agree after you connect</option>
                  <option value="aspire">Pay with Aspire</option>
                  <option value="in_person">Pay in person</option>
                </select>
                <small>{paymentMethod === 'aspire' ? 'After a mutual connection, Stripe secures the agreed amount. Release happens after both people mark complete.' : 'Off-platform payments are not processed or protected as Aspire payments.'}</small>
              </label>
            </div>
            {paymentMethod === 'aspire' && <PaymentFeePreview amount={amount} campusId={campusId} />}
          </>
        )}

        <label className="postField postDetailsField">
          <span>Anything else? <em>optional</em></span>
          <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={3} placeholder="Timing, approximate area, what to bring, or anything that helps someone decide. Share exact addresses only after connecting." />
        </label>

        <div className="postContextCard"><div><span>SAFETY FOR THIS REQUEST</span><strong>{context.title}</strong></div><p>{context.note}</p><a href="/safety">Safety center ↗</a></div>
        {error && <p className="postError" role="alert">{error}</p>}

        <div className="postSubmitRow"><p>Posting makes this request visible on the selected campus. It never automatically commits you to a person, payment, ride, purchase, or meetup.</p><button className="button buttonGold" type="submit">Review + post <span>→</span></button></div>
      </form>

      {confirming && selectedCampus && (
        <div className="publishOverlay" role="dialog" aria-modal="true" aria-labelledby="publish-title">
          <div className="publishModal publishModalContext">
            <span className="publishKicker">BEFORE YOU POST · {selectedCategory.label.toUpperCase()}</span>
            <h2 id="publish-title">{context.title}</h2>
            <p>{context.note}</p>
            <div className="publishPreviewMeta">
              <span>{selectedCampus.short_name}</span>
              {visiting && <span>Visiting from {homeCampus?.short_name} ✓</span>}
              {photos.length > 0 && <span>{photos.length} photo{photos.length === 1 ? '' : 's'}</span>}
            </div>
            <div className="publishRules">
              <span><b>01</b> Posting to {selectedCampus.short_name}. {visiting ? `Your identity remains ${homeCampus?.short_name}.` : 'This is your home campus.'}</span>
              <span><b>02</b> You choose who to connect with. A response is not an agreement.</span>
              <span><b>03</b> {paymentMethod === 'aspire' ? 'Pay with Aspire starts only after mutual confirmation; Stripe confirms payment status.' : 'Confirm timing, location, scope, and money before anything starts.'}</span>
            </div>
            <p className="publishFinePrint">Aspire facilitates the connection and can review platform activity and reports. Aspire cannot observe or verify every offline interaction. Follow the <a href="/guidelines" target="_blank">Community Guidelines ↗</a> and <a href="/safety" target="_blank">Safety Center ↗</a>.</p>
            <div className="publishActions"><button className="quietPostButton" type="button" onClick={() => setConfirming(false)} disabled={publishing}>Go back</button><button className="button buttonGold" type="button" onClick={publish} disabled={publishing}>{publishing ? (photos.length ? 'Publishing + uploading…' : 'Publishing…') : 'I understand — post it'}</button></div>
          </div>
        </div>
      )}
    </>
  );
}
