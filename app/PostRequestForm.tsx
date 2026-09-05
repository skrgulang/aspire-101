'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import { createRequest, RequestKind } from '../lib/supabase/requests';
import { acknowledgeSafety } from '../lib/supabase/safety';

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

const campusOptions = [
  'Purdue University',
  'UC Berkeley',
  'UCLA',
  'UC Davis',
  'UC Irvine',
  'UC San Diego',
  'USC',
  'Rutgers University',
  'University of Illinois Urbana-Champaign',
  'The Ohio State University',
  'University of Michigan',
  'Indiana University Bloomington',
  'Northwestern University',
  'Penn State University',
  'University of Wisconsin–Madison',
  'New York University',
  'Columbia University',
  'Boston University',
  'Northeastern University',
  'UT Austin',
  'Georgia Tech',
  'Arizona State University'
];

const kinds: { value: RequestKind; label: string; helper: string }[] = [
  { value: 'community', label: 'Community', helper: 'No money expected' },
  { value: 'paid_help', label: 'Paid help', helper: 'Compensation involved' },
  { value: 'split_cost', label: 'Split cost', helper: 'Share a real expense' },
  { value: 'buy_sell', label: 'Buy & sell', helper: 'An item changes hands' },
  { value: 'collaboration', label: 'Collab', helper: 'Build or do it together' }
];

function normalizeSchool(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function matchCampus(value: string) {
  const normalized = normalizeSchool(value);
  if (!normalized) return null;

  const aliases: Record<string, string> = {
    purdue: 'Purdue University',
    berkeley: 'UC Berkeley',
    ucberkeley: 'UC Berkeley',
    ucla: 'UCLA',
    ucd: 'UC Davis',
    ucdavis: 'UC Davis',
    uci: 'UC Irvine',
    ucirvine: 'UC Irvine',
    ucsd: 'UC San Diego',
    ucsandiego: 'UC San Diego',
    rutgers: 'Rutgers University',
    uiuc: 'University of Illinois Urbana-Champaign',
    osu: 'The Ohio State University',
    ohiostate: 'The Ohio State University',
    umich: 'University of Michigan',
    michigan: 'University of Michigan',
    iub: 'Indiana University Bloomington',
    indiana: 'Indiana University Bloomington',
    uwmadison: 'University of Wisconsin–Madison',
    nyu: 'New York University',
    gatech: 'Georgia Tech',
    asu: 'Arizona State University'
  };

  if (aliases[normalized]) return aliases[normalized];
  return campusOptions.find((item) => {
    const option = normalizeSchool(item);
    return option === normalized || option.includes(normalized) || normalized.includes(option);
  }) ?? null;
}

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
  if (kind === 'paid_help') return {
    title: 'Money involved?',
    note: 'Agree on the job, amount, timing, and what counts as complete before anyone starts. Avoid changing the deal after work begins.'
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
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [campus, setCampus] = useState('');
  const [customCampus, setCustomCampus] = useState('');
  const [category, setCategory] = useState('Ride');
  const [kind, setKind] = useState<RequestKind>('split_cost');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'none' | 'in_person'>('none');
  const [confirming, setConfirming] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');
  const [posted, setPosted] = useState<{ id: string; title: string } | null>(null);

  const selectedCategory = categories.find((item) => item.value === category) ?? categories[0];
  const context = safetyContext(category, kind);
  const moneyInvolved = useMemo(() => kind === 'paid_help' || kind === 'buy_sell' || kind === 'split_cost', [kind]);
  const selectedCampus = campus === '__other__' ? customCampus.trim() : campus;

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let active = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      if (!data.user) {
        router.replace('/login?next=/post');
        return;
      }
      const school = data.user.user_metadata?.school;
      if (typeof school === 'string' && school.trim()) {
        const matched = matchCampus(school.trim());
        if (matched) {
          setCampus(matched);
        } else {
          setCampus('__other__');
          setCustomCampus(school.trim());
        }
      }
      setCheckingAuth(false);
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

  function openConfirmation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!title.trim()) {
      setError('Tell campus what you need first.');
      return;
    }
    if (!selectedCampus) {
      setError('Choose the campus where you want this request to appear.');
      return;
    }
    if (kind === 'paid_help' && (!amount || Number(amount) <= 0)) {
      setError('Add the amount you are offering for paid help.');
      return;
    }
    setConfirming(true);
  }

  async function publish() {
    setPublishing(true);
    setError('');
    try {
      const amountCents = amount ? Math.round(Number(amount) * 100) : undefined;
      const request = await createRequest({
        kind,
        category,
        title,
        details,
        campus: selectedCampus,
        amount_cents: amountCents,
        payment_method: moneyInvolved ? paymentMethod : 'none'
      });
      await acknowledgeSafety(`${category}:${kind}`, request.id).catch(() => undefined);
      setPosted({ id: request.id, title: request.title });
      setConfirming(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not publish this request. Try again.');
      setConfirming(false);
    } finally {
      setPublishing(false);
    }
  }

  if (checkingAuth) {
    return <div className="postLoading"><span /><p>Checking your Aspire account…</p></div>;
  }

  if (posted) {
    return (
      <section className="postSuccess">
        <p className="eyebrow">REQUEST POSTED</p>
        <h1>It&apos;s live.</h1>
        <article>
          <span>{selectedCategory.label.toUpperCase()}</span>
          <strong>{posted.title}</strong>
          <small>{selectedCampus} · #{posted.id.slice(0, 8)} · open now</small>
        </article>
        <p className="postSuccessNote">Students can respond. You still choose who — if anyone — you connect with.</p>
        <div className="postSuccessActions">
          <a className="button buttonGold" href="/discover">Discover requests <span>↗</span></a>
          <button className="quietPostButton" type="button" onClick={() => {
            setPosted(null); setTitle(''); setDetails(''); setAmount('');
          }}>Post another</button>
        </div>
      </section>
    );
  }

  return (
    <>
      <form className="postForm" onSubmit={openConfirmation}>
        <div className="postFormHeading">
          <div className="postModeSwitch">
            <a className="active" href="/post">I need something</a>
            <a href="/discover">I can help</a>
          </div>
          <p className="eyebrow">ASK CAMPUS</p>
          <h1>What do you need?</h1>
          <p>Start with the kind of need. Aspire keeps the rest simple.</p>
        </div>

        <div className="postCategoryPicker" aria-label="Choose a request category">
          {categories.map((item) => (
            <button key={item.value} type="button" className={category === item.value ? 'active' : ''} onClick={() => chooseCategory(item)}>
              <i>{item.icon}</i><strong>{item.label}</strong><span>{item.prompt}</span>
            </button>
          ))}
        </div>

        <div className="postQuickStarts">
          <span>TRY ONE</span>
          {selectedCategory.examples.map((example) => <button type="button" key={example} onClick={() => setTitle(example)}>{example} ↗</button>)}
        </div>

        <label className="postField postFieldLarge postComposerField">
          <span>{selectedCategory.prompt}</span>
          <textarea value={title} onChange={(e) => setTitle(e.target.value)} maxLength={180} rows={3} placeholder={selectedCategory.examples[0]} required />
          <small>{title.length}/180</small>
        </label>

        <div className="postEssentials">
          <label className="postField postCampusField">
            <span>Campus</span>
            <div className="campusSelectWrap">
              <select value={campus} onChange={(e) => setCampus(e.target.value)} required>
                <option value="" disabled>Choose your campus</option>
                {campusOptions.map((school) => <option key={school} value={school}>{school}</option>)}
                <option value="__other__">Other campus…</option>
              </select>
              <i aria-hidden="true">⌄</i>
            </div>
            {campus === '__other__' && (
              <input className="campusOtherInput" value={customCampus} onChange={(e) => setCustomCampus(e.target.value)} placeholder="Type your school name" required />
            )}
            <small>Your request will be shown in this campus feed.</small>
          </label>

          <fieldset className="postKinds">
            <legend>Exchange</legend>
            <div className="postKindGrid">
              {kinds.map((item) => (
                <button type="button" key={item.value} className={kind === item.value ? 'postKind active' : 'postKind'} onClick={() => {
                  setKind(item.value);
                  if (item.value === 'community' || item.value === 'collaboration') { setAmount(''); setPaymentMethod('none'); }
                }}>
                  <strong>{item.label}</strong><span>{item.helper}</span>
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        {moneyInvolved && (
          <div className="postMoney postMoneyFresh">
            <label className="postField">
              <span>{kind === 'paid_help' ? 'What are you offering?' : 'Amount / share'}</span>
              <div className="moneyInput"><b>$</b><input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="25" /></div>
            </label>
            <label className="postField">
              <span>Payment plan</span>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as 'none' | 'in_person')}>
                <option value="none">Agree after you connect</option>
                <option value="in_person">Pay in person</option>
              </select>
              <small>Platform checkout is not live yet. Off-platform payments are not verified by Aspire.</small>
            </label>
          </div>
        )}

        <label className="postField postDetailsField">
          <span>Anything else? <em>optional</em></span>
          <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={3} placeholder="Timing, pickup details, what to bring, or anything that helps someone decide." />
        </label>

        <div className="postContextCard">
          <div><span>SAFETY FOR THIS REQUEST</span><strong>{context.title}</strong></div>
          <p>{context.note}</p>
          <a href="/safety">Safety center ↗</a>
        </div>

        {error && <p className="postError" role="alert">{error}</p>}

        <div className="postSubmitRow">
          <p>Posting makes this request visible. It never automatically commits you to a person, payment, ride, purchase, or meetup.</p>
          <button className="button buttonGold" type="submit">Review + post <span>→</span></button>
        </div>
      </form>

      {confirming && (
        <div className="publishOverlay" role="dialog" aria-modal="true" aria-labelledby="publish-title">
          <div className="publishModal publishModalContext">
            <span className="publishKicker">BEFORE YOU POST · {selectedCategory.label.toUpperCase()}</span>
            <h2 id="publish-title">{context.title}</h2>
            <p>{context.note}</p>
            <div className="publishRules">
              <span><b>01</b> You choose who to connect with. A response is not an agreement.</span>
              <span><b>02</b> Confirm timing, location, scope, and money before anything starts.</span>
              <span><b>03</b> Use Report or Block for scams, harassment, unsafe conduct, or misuse.</span>
            </div>
            <p className="publishFinePrint">Aspire facilitates the connection and can review platform activity and reports. Aspire cannot observe or verify every offline interaction. Follow the <a href="/guidelines" target="_blank">Community Guidelines ↗</a> and <a href="/safety" target="_blank">Safety Center ↗</a>.</p>
            <div className="publishActions">
              <button className="quietPostButton" type="button" onClick={() => setConfirming(false)} disabled={publishing}>Go back</button>
              <button className="button buttonGold" type="button" onClick={publish} disabled={publishing}>{publishing ? 'Publishing…' : 'I understand — post it'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
