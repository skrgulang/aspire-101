'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import { createRequest, RequestKind } from '../lib/supabase/requests';

const categories = [
  'Ride',
  'Pickup / errand',
  'Moving / help',
  'Study',
  'Buy & sell',
  'Project / collab',
  'Other'
];

const kinds: { value: RequestKind; label: string; helper: string }[] = [
  { value: 'community', label: 'Community help', helper: 'No money expected' },
  { value: 'paid_help', label: 'Paid help', helper: 'You are offering compensation' },
  { value: 'split_cost', label: 'Split cost', helper: 'Share gas or another expense' },
  { value: 'buy_sell', label: 'Buy & sell', helper: 'An item changes hands' },
  { value: 'collaboration', label: 'Collaboration', helper: 'Build or do something together' }
];

export default function PostRequestForm() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [campus, setCampus] = useState('');
  const [category, setCategory] = useState('Ride');
  const [kind, setKind] = useState<RequestKind>('community');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'none' | 'in_person'>('none');
  const [confirming, setConfirming] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');
  const [posted, setPosted] = useState<{ id: string; title: string } | null>(null);

  const moneyInvolved = useMemo(
    () => kind === 'paid_help' || kind === 'buy_sell' || kind === 'split_cost',
    [kind]
  );

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
      if (typeof school === 'string' && school.trim()) setCampus(school.trim());
      setCheckingAuth(false);
    });

    return () => {
      active = false;
    };
  }, [router]);

  function openConfirmation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (!title.trim()) {
      setError('Tell campus what you need first.');
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
        campus,
        amount_cents: amountCents,
        payment_method: moneyInvolved ? paymentMethod : 'none'
      });

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
    return (
      <div className="postLoading">
        <span />
        <p>Checking your Aspire account…</p>
      </div>
    );
  }

  if (posted) {
    return (
      <section className="postSuccess">
        <p className="eyebrow">REQUEST POSTED</p>
        <h1>Campus can see it.</h1>
        <article>
          <span>OPEN REQUEST</span>
          <strong>{posted.title}</strong>
          <small>#{posted.id.slice(0, 8)} · just now</small>
        </article>
        <div className="postSuccessActions">
          <a className="button buttonGold" href="/#nearby">Back to campus <span>↗</span></a>
          <button className="quietPostButton" type="button" onClick={() => {
            setPosted(null);
            setTitle('');
            setDetails('');
            setAmount('');
          }}>Post another</button>
        </div>
      </section>
    );
  }

  return (
    <>
      <form className="postForm" onSubmit={openConfirmation}>
        <div className="postFormHeading">
          <p className="eyebrow">NEW REQUEST</p>
          <h1>What do you need?</h1>
          <p>Keep it simple. Students should understand the request in a few seconds.</p>
        </div>

        <label className="postField postFieldLarge">
          <span>Request</span>
          <textarea
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={180}
            rows={3}
            placeholder="Need a ride to IND Friday at 4 PM"
            required
          />
          <small>{title.length}/180</small>
        </label>

        <div className="postGridTwo">
          <label className="postField">
            <span>Category</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>

          <label className="postField">
            <span>Campus</span>
            <input value={campus} onChange={(e) => setCampus(e.target.value)} placeholder="Purdue, Berkeley, Rutgers…" />
          </label>
        </div>

        <fieldset className="postKinds">
          <legend>What kind of exchange is this?</legend>
          <div className="postKindGrid">
            {kinds.map((item) => (
              <button
                type="button"
                key={item.value}
                className={kind === item.value ? 'postKind active' : 'postKind'}
                onClick={() => {
                  setKind(item.value);
                  if (item.value === 'community' || item.value === 'collaboration') {
                    setAmount('');
                    setPaymentMethod('none');
                  }
                }}
              >
                <strong>{item.label}</strong>
                <span>{item.helper}</span>
              </button>
            ))}
          </div>
        </fieldset>

        {moneyInvolved && (
          <div className="postMoney">
            <label className="postField">
              <span>{kind === 'paid_help' ? 'What are you offering?' : 'Amount (optional)'}</span>
              <div className="moneyInput"><b>$</b><input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="25" /></div>
            </label>
            <label className="postField">
              <span>Payment plan</span>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as 'none' | 'in_person')}>
                <option value="none">Agree after you connect</option>
                <option value="in_person">Pay in person</option>
              </select>
              <small>Aspire checkout will be added later.</small>
            </label>
          </div>
        )}

        <label className="postField">
          <span>Details <em>optional</em></span>
          <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={4} placeholder="Timing, pickup details, what to bring, or anything that helps someone decide." />
        </label>

        {error && <p className="postError" role="alert">{error}</p>}

        <div className="postSubmitRow">
          <p>You stay in control. Posting does not automatically connect you with anyone.</p>
          <button className="button buttonGold" type="submit">Review request <span>→</span></button>
        </div>
      </form>

      {confirming && (
        <div className="publishOverlay" role="dialog" aria-modal="true" aria-labelledby="publish-title">
          <div className="publishModal">
            <span className="publishKicker">BEFORE YOU POST</span>
            <h2 id="publish-title">You choose what happens next.</h2>
            <p>Posting creates an open request. It does not mean you have agreed to meet, pay, hire, ride with, or work with anyone yet.</p>
            <div className="publishRules">
              <span><b>01</b> Review responses before you connect.</span>
              <span><b>02</b> Agree on expectations, timing, and money clearly.</span>
              <span><b>03</b> Report unsafe behavior or misuse to Aspire.</span>
            </div>
            <p className="publishFinePrint">Aspire can moderate platform activity and reports, but cannot verify every offline interaction. Use your judgment and follow the <a href="/guidelines" target="_blank">community guidelines ↗</a>.</p>
            <div className="publishActions">
              <button className="quietPostButton" type="button" onClick={() => setConfirming(false)} disabled={publishing}>Go back</button>
              <button className="button buttonGold" type="button" onClick={publish} disabled={publishing}>{publishing ? 'Publishing…' : 'I understand — publish'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
