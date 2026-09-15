'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AppDock from '../AppDock';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';
import {
  acceptDeliveryOffer,
  completeDelivery,
  counterDeliveryOffer,
  createStandaloneDelivery,
  deliveryStatusLabel,
  fetchDeliveryBoard,
  getDeliveryConfirmationCode,
  getPrivateDeliveryLocations,
  makeDeliveryOffer,
  rewardLabel,
  setDeliveryStatus,
  setPrivateDeliveryLocations,
  verifyDeliveryConfirmationCode,
  type DeliveryBoardData,
  type DeliveryJob,
  type DeliveryOffer,
  type DeliveryStatus
} from '../../lib/supabase/delivery';
import { releaseAspirePayment } from '../../lib/supabase/payments';
import type { DeliveryRewardMode } from '../../lib/supabase/marketplacePurchase';
import styles from './DeliveryBoard.module.css';

type RewardPreset = 'free' | '500' | '1000' | 'custom' | 'negotiable';
type DeliveryBoardView = 'open' | 'my_requests' | 'my_deliveries' | 'active' | 'completed';
type DeliveryRewardFilter = 'all' | 'free' | 'paid' | 'negotiable';

type Draft = {
  title: string;
  details: string;
  pickupArea: string;
  dropoffArea: string;
  pickupInstructions: string;
  dropoffInstructions: string;
  preferredAt: string;
  rewardPreset: RewardPreset;
  customReward: string;
};

const EMPTY_BOARD: DeliveryBoardData = {
  jobs: [],
  requests: new Map(),
  offers: [],
  profiles: new Map()
};

const STATUS_ORDER: DeliveryStatus[] = [
  'looking_for_aspirer',
  'offer_received',
  'matched',
  'heading_to_pickup',
  'picked_up',
  'on_the_way',
  'delivered',
  'completed'
];

function money(cents: number) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function friendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || 'Something went wrong.');
  if (/VERIFY_EMAIL_AND_PHONE/i.test(message)) return 'Verify both your email and phone number in Profile before offering to deliver.';
  if (/REQUEST_NOT_APPROVED/i.test(message)) return 'This request is still in safety review. Try again after it is approved.';
  if (/PAYOUT_NOT_READY/i.test(message)) return 'The matched Aspirer must finish payout setup before a paid reward can be released.';
  if (/PAYMENT_NOT_SECURED/i.test(message)) return 'The delivery reward has not been secured yet.';
  if (/COMPLETION_NOT_READY/i.test(message)) return 'Both delivery completion confirmations are required before releasing the reward.';
  if (/RESOLUTION_CASE_OPEN|PAYOUT_HOLD_OPEN/i.test(message)) return 'The reward payout is paused while an Aspire Resolution Center case or payment hold is open.';
  if (/DELIVERY_PAYMENT_NOT_SECURED/i.test(message)) return 'The paid delivery reward must be secured through Aspire before pickup can begin.';
  if (/CANNOT_SELF_DELIVER/i.test(message)) return 'The buyer, seller, or requester cannot claim their own Aspirer delivery reward.';
  if (/ACCOUNT_RESTRICTED/i.test(message)) return 'This account is currently restricted from new Aspire interactions.';
  if (/CONTENT_POLICY_BLOCKED/i.test(message)) return 'This delivery request contains something Aspire cannot allow. Edit the request and try again.';
  return message;
}

function rewardFromDraft(draft: Draft): { mode: DeliveryRewardMode; cents: number | null } {
  if (draft.rewardPreset === 'free') return { mode: 'free', cents: 0 };
  if (draft.rewardPreset === 'negotiable') return { mode: 'negotiable', cents: null };
  if (draft.rewardPreset === '500') return { mode: 'fixed', cents: 500 };
  if (draft.rewardPreset === '1000') return { mode: 'fixed', cents: 1000 };
  const dollars = Number(draft.customReward);
  return { mode: 'fixed', cents: Number.isFinite(dollars) ? Math.round(dollars * 100) : 0 };
}

function profileName(board: DeliveryBoardData, userId: string) {
  const profile = board.profiles.get(userId);
  return profile?.display_name || profile?.full_name || profile?.name || 'Aspirer';
}

function statusProgress(status: DeliveryStatus) {
  const index = STATUS_ORDER.indexOf(status);
  return index < 0 ? 0 : index;
}

function rewardMatches(job: DeliveryJob, filter: DeliveryRewardFilter) {
  if (filter === 'all') return true;
  if (filter === 'free') return job.reward_mode === 'free' || Number(job.reward_cents || 0) === 0;
  if (filter === 'negotiable') return job.reward_mode === 'negotiable';
  return Number(job.reward_cents || job.agreed_reward_cents || 0) > 0;
}

export default function DeliveryBoard() {
  const [userId, setUserId] = useState<string | null>(null);
  const [campusId, setCampusId] = useState<string | null>(null);
  const [board, setBoard] = useState<DeliveryBoardData>(EMPTY_BOARD);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [focusJobId, setFocusJobId] = useState('');
  const [boardView, setBoardView] = useState<DeliveryBoardView>('open');
  const [boardSearch, setBoardSearch] = useState('');
  const [rewardFilter, setRewardFilter] = useState<DeliveryRewardFilter>('all');
  const [offerAmount, setOfferAmount] = useState<Record<string, string>>({});
  const [offerMessage, setOfferMessage] = useState<Record<string, string>>({});
  const [codeInput, setCodeInput] = useState<Record<string, string>>({});
  const [shownCodes, setShownCodes] = useState<Record<string, string>>({});
  const [privateDetails, setPrivateDetails] = useState<Record<string, { pickup_instructions: string | null; dropoff_instructions: string | null }>>({});
  const [privateDraft, setPrivateDraft] = useState<Record<string, { pickup: string; dropoff: string }>>({});
  const [draft, setDraft] = useState<Draft>({
    title: '',
    details: '',
    pickupArea: '',
    dropoffArea: '',
    pickupInstructions: '',
    dropoffInstructions: '',
    preferredAt: '',
    rewardPreset: 'negotiable',
    customReward: ''
  });

  const load = useCallback(async (nextCampusId?: string | null) => {
    const id = nextCampusId || campusId;
    if (!id) return;
    try {
      const data = await fetchDeliveryBoard(id);
      setBoard(data);
    } catch (error) {
      setNotice(friendlyError(error));
    }
  }, [campusId]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setFocusJobId(new URLSearchParams(window.location.search).get('job') || '');
    }
    const supabase = getSupabaseBrowserClient();
    void supabase.auth.getUser().then(async ({ data, error }) => {
      if (error) throw error;
      if (!data.user) {
        window.location.assign('/login?next=%2Fdelivery');
        return;
      }
      setUserId(data.user.id);
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('current_campus_id,home_campus_id')
        .eq('id', data.user.id)
        .maybeSingle();
      if (profileError) throw profileError;
      const id = profile?.current_campus_id || profile?.home_campus_id || null;
      setCampusId(id);
      if (id) await load(id);
      else setNotice('Choose your campus in Profile before posting a delivery request.');
    }).catch((error) => setNotice(friendlyError(error))).finally(() => setLoading(false));
  }, [load]);

  const offersByJob = useMemo(() => {
    const map = new Map<string, DeliveryOffer[]>();
    for (const offer of board.offers) {
      map.set(offer.delivery_job_id, [...(map.get(offer.delivery_job_id) || []), offer]);
    }
    return map;
  }, [board.offers]);

  const boardStats = useMemo(() => {
    const open = board.jobs.filter((job) => ['looking_for_aspirer', 'offer_received'].includes(job.status)).length;
    const active = board.jobs.filter((job) => ['matched', 'heading_to_pickup', 'picked_up', 'on_the_way', 'delivered'].includes(job.status)).length;
    const mine = board.jobs.filter((job) => job.requester_id === userId).length;
    const helping = board.jobs.filter((job) => job.matched_aspirer_id === userId || (offersByJob.get(job.id) || []).some((offer) => offer.aspirer_id === userId)).length;
    const completed = board.jobs.filter((job) => job.status === 'completed').length;
    return { open, active, mine, helping, completed };
  }, [board.jobs, offersByJob, userId]);

  const visibleJobs = useMemo(() => {
    const needle = boardSearch.trim().toLowerCase();
    return board.jobs.filter((job) => {
      const offers = offersByJob.get(job.id) || [];
      const isRequester = job.requester_id === userId;
      const isMatchedAspirer = job.matched_aspirer_id === userId;
      const hasOwnOffer = offers.some((offer) => offer.aspirer_id === userId);
      const isOpen = ['looking_for_aspirer', 'offer_received'].includes(job.status);
      const isActive = ['matched', 'heading_to_pickup', 'picked_up', 'on_the_way', 'delivered'].includes(job.status);

      if (boardView === 'open' && !isOpen) return false;
      if (boardView === 'my_requests' && !isRequester) return false;
      if (boardView === 'my_deliveries' && !isMatchedAspirer && !hasOwnOffer) return false;
      if (boardView === 'active' && !isActive) return false;
      if (boardView === 'completed' && job.status !== 'completed') return false;
      if (!rewardMatches(job, rewardFilter)) return false;

      if (needle) {
        const request = board.requests.get(job.request_id);
        const haystack = `${request?.title || ''} ${request?.details || ''} ${job.pickup_area || ''} ${job.dropoff_area || ''}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [board.jobs, board.requests, boardSearch, boardView, offersByJob, rewardFilter, userId]);

  useEffect(() => {
    if (!focusJobId || loading) return;
    const job = board.jobs.find((item) => item.id === focusJobId);
    if (!job) return;
    if (job.status === 'completed') setBoardView('completed');
    else if (job.requester_id === userId) setBoardView('my_requests');
    else if (job.matched_aspirer_id === userId) setBoardView('my_deliveries');
    window.setTimeout(() => document.getElementById(`delivery-job-${focusJobId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 120);
  }, [board.jobs, focusJobId, loading, userId]);

  async function refresh() {
    await load();
  }

  async function submitDelivery(event: React.FormEvent) {
    event.preventDefault();
    if (!campusId) return;
    const reward = rewardFromDraft(draft);
    if (!draft.title.trim() || !draft.pickupArea.trim() || !draft.dropoffArea.trim()) {
      setNotice('Add a title plus a public pickup area and drop-off area.');
      return;
    }
    if (reward.mode === 'fixed' && (!reward.cents || reward.cents <= 0)) {
      setNotice('Enter a paid reward greater than $0.');
      return;
    }

    setBusy('create');
    setNotice('');
    try {
      const job = await createStandaloneDelivery({
        campusId,
        title: draft.title.trim(),
        details: draft.details.trim(),
        pickupArea: draft.pickupArea.trim(),
        dropoffArea: draft.dropoffArea.trim(),
        pickupInstructions: draft.pickupInstructions.trim(),
        dropoffInstructions: draft.dropoffInstructions.trim(),
        preferredAt: draft.preferredAt ? new Date(draft.preferredAt).toISOString() : null,
        rewardMode: reward.mode,
        rewardCents: reward.cents
      });
      setDraft({
        title: '', details: '', pickupArea: '', dropoffArea: '', pickupInstructions: '', dropoffInstructions: '',
        preferredAt: '', rewardPreset: 'negotiable', customReward: ''
      });
      setFocusJobId(job.id);
      setBoardView('my_requests');
      setNotice('Delivery request posted. Only the public areas are visible before a match.');
      await refresh();
    } catch (error) {
      setNotice(friendlyError(error));
    } finally {
      setBusy('');
    }
  }

  async function submitOffer(job: DeliveryJob) {
    const amount = job.reward_mode === 'free'
      ? 0
      : job.reward_mode === 'fixed'
        ? Number(job.reward_cents || 0)
        : Math.max(0, Math.round(Number(offerAmount[job.id] || 0) * 100));
    if (job.reward_mode === 'negotiable' && !Number.isFinite(amount)) {
      setNotice('Enter a valid offer amount.');
      return;
    }
    setBusy(`offer:${job.id}`);
    setNotice('');
    try {
      await makeDeliveryOffer(job.id, amount, offerMessage[job.id]);
      setNotice(amount === 0 ? 'Volunteer offer sent.' : `Offer sent for ${money(amount)}.`);
      setBoardView('my_deliveries');
      await refresh();
    } catch (error) {
      setNotice(friendlyError(error));
    } finally {
      setBusy('');
    }
  }

  async function acceptOffer(offer: DeliveryOffer) {
    setBusy(`accept:${offer.id}`);
    setNotice('');
    try {
      const job = await acceptDeliveryOffer(offer.id);
      setFocusJobId(job.id);
      setNotice(job.agreed_reward_cents && job.agreed_reward_cents > 0
        ? 'Matched. The requester must secure the delivery reward before pickup starts.'
        : 'Matched. This is a free community delivery, so Stripe is not used.');
      await refresh();
    } catch (error) {
      setNotice(friendlyError(error));
    } finally {
      setBusy('');
    }
  }

  async function counterOffer(offer: DeliveryOffer) {
    const current = (offer.amount_cents / 100).toFixed(2);
    const next = window.prompt('Counter offer amount in dollars', current);
    if (next == null) return;
    const cents = Math.round(Number(next) * 100);
    if (!Number.isFinite(cents) || cents < 0) {
      setNotice('Enter a valid counter amount.');
      return;
    }
    setBusy(`counter:${offer.id}`);
    try {
      await counterDeliveryOffer(offer.id, cents);
      setNotice(`Counter sent for ${money(cents)}.`);
      await refresh();
    } catch (error) {
      setNotice(friendlyError(error));
    } finally {
      setBusy('');
    }
  }

  async function changeStatus(job: DeliveryJob, next: 'heading_to_pickup' | 'on_the_way') {
    setBusy(`status:${job.id}`);
    try {
      await setDeliveryStatus(job.id, next);
      await refresh();
    } catch (error) {
      setNotice(friendlyError(error));
    } finally {
      setBusy('');
    }
  }

  async function showCode(job: DeliveryJob, kind: 'pickup' | 'delivery') {
    setBusy(`code:${job.id}:${kind}`);
    try {
      const code = await getDeliveryConfirmationCode(job.id, kind);
      setShownCodes((previous) => ({ ...previous, [`${job.id}:${kind}`]: code }));
    } catch (error) {
      setNotice(friendlyError(error));
    } finally {
      setBusy('');
    }
  }

  async function verifyCode(job: DeliveryJob, kind: 'pickup' | 'delivery') {
    const key = `${job.id}:${kind}`;
    const code = (codeInput[key] || '').trim();
    if (!/^\d{4}$/.test(code)) {
      setNotice('Enter the 4-digit confirmation code.');
      return;
    }
    setBusy(`verify:${key}`);
    try {
      const result = await verifyDeliveryConfirmationCode(job.id, kind, code);
      if (!result.ok) {
        setNotice(result.error === 'CODE_LOCKED'
          ? 'Too many incorrect attempts. Contact support before continuing.'
          : `That code is not correct.${typeof result.attempts_remaining === 'number' ? ` ${result.attempts_remaining} attempts remaining.` : ''}`);
        return;
      }
      setCodeInput((previous) => ({ ...previous, [key]: '' }));
      setNotice(kind === 'pickup' ? 'Pickup confirmed.' : 'Delivery confirmed. The Aspirer side of closeout is recorded.');
      await refresh();
    } catch (error) {
      setNotice(friendlyError(error));
    } finally {
      setBusy('');
    }
  }

  async function finishDelivery(job: DeliveryJob) {
    setBusy(`complete:${job.id}`);
    try {
      await completeDelivery(job.id);
      setBoardView('completed');
      setNotice('Delivery completed. Review the Aspirer below; if this was paid help, the requester can release the protected reward here too.');
      await refresh();
    } catch (error) {
      setNotice(friendlyError(error));
    } finally {
      setBusy('');
    }
  }

  async function releaseReward(job: DeliveryJob) {
    if (!job.connection_id) return;
    setBusy(`release:${job.id}`);
    setNotice('');
    try {
      await releaseAspirePayment(job.connection_id);
      setNotice('Protected delivery reward released to the Aspirer ✓ You can now leave a review.');
      await refresh();
    } catch (error) {
      setNotice(friendlyError(error));
    } finally {
      setBusy('');
    }
  }

  async function revealPrivate(job: DeliveryJob) {
    setBusy(`private:${job.id}`);
    try {
      const details = await getPrivateDeliveryLocations(job.id);
      setPrivateDetails((previous) => ({ ...previous, [job.id]: details }));
    } catch (error) {
      setNotice(friendlyError(error));
    } finally {
      setBusy('');
    }
  }

  async function savePrivate(job: DeliveryJob) {
    const values = privateDraft[job.id] || { pickup: '', dropoff: '' };
    setBusy(`private-save:${job.id}`);
    try {
      await setPrivateDeliveryLocations(
        job.id,
        userId === job.pickup_party_id || userId === job.requester_id ? values.pickup : undefined,
        userId === job.dropoff_party_id || userId === job.requester_id ? values.dropoff : undefined
      );
      setNotice('Private handoff details saved. They stay hidden until the delivery is matched.');
      await revealPrivate(job);
    } catch (error) {
      setNotice(friendlyError(error));
    } finally {
      setBusy('');
    }
  }

  return <main className={styles.page}>
    <AppDock active="discover" />
    <div className={styles.shell}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>ASPIRE NETWORK · DELIVERY / ERRAND</p>
          <h1>Ask the Aspire Network.</h1>
          <p>Post a campus delivery, volunteer to help, negotiate a reward, then confirm pickup and drop-off with one-time 4-digit codes. Exact handoff details stay private until a match.</p>
        </div>
        <div className={styles.heroActions}>
          <a className={styles.goldButton} href="#post-delivery">Post a delivery</a>
          <a className={styles.outlineButton} href="/marketplace">Marketplace</a>
        </div>
      </section>

      {notice && <div className={styles.notice} role="status">{notice}</div>}

      <div className={styles.grid}>
        <section className={styles.panel} id="post-delivery">
          <p className={styles.eyebrow}>STANDALONE REQUEST</p>
          <h2>Post a Delivery / Errand</h2>
          <p className={styles.panelIntro}>Use public areas such as “Hillenbrand Hall area” or “WALC area.” Apartment numbers and exact instructions belong in the private fields.</p>
          <form className={styles.form} onSubmit={submitDelivery}>
            <label className={styles.label}>Title
              <input className={styles.input} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Pick up my package from Hillenbrand" maxLength={140} />
            </label>
            <label className={styles.label}>Description
              <textarea className={styles.textarea} value={draft.details} onChange={(event) => setDraft({ ...draft, details: event.target.value })} placeholder="What should the Aspirer know? Do not put private addresses here." maxLength={3000} />
            </label>
            <div className={styles.routeGrid}>
              <label className={styles.label}>Public pickup area
                <input className={styles.input} value={draft.pickupArea} onChange={(event) => setDraft({ ...draft, pickupArea: event.target.value })} placeholder="Hillenbrand Hall area" maxLength={160} />
              </label>
              <label className={styles.label}>Public drop-off area
                <input className={styles.input} value={draft.dropoffArea} onChange={(event) => setDraft({ ...draft, dropoffArea: event.target.value })} placeholder="WALC area" maxLength={160} />
              </label>
            </div>
            <div className={styles.routeGrid}>
              <label className={styles.label}>Exact pickup instructions · private
                <input className={styles.input} value={draft.pickupInstructions} onChange={(event) => setDraft({ ...draft, pickupInstructions: event.target.value })} placeholder="Optional — only revealed after match" maxLength={1000} />
              </label>
              <label className={styles.label}>Exact drop-off instructions · private
                <input className={styles.input} value={draft.dropoffInstructions} onChange={(event) => setDraft({ ...draft, dropoffInstructions: event.target.value })} placeholder="Optional — only revealed after match" maxLength={1000} />
              </label>
            </div>
            <label className={styles.label}>Preferred time
              <input className={styles.input} type="datetime-local" value={draft.preferredAt} onChange={(event) => setDraft({ ...draft, preferredAt: event.target.value })} />
            </label>
            <div className={styles.label}>Reward
              <div className={styles.rewardRow}>
                {([
                  ['free', 'Free / Volunteer'], ['500', '$5'], ['1000', '$10'], ['custom', 'Custom'], ['negotiable', 'Negotiable']
                ] as [RewardPreset, string][]).map(([value, label]) => <button key={value} type="button" className={`${styles.rewardChip} ${draft.rewardPreset === value ? styles.rewardChipActive : ''}`} onClick={() => setDraft({ ...draft, rewardPreset: value })}>{label}</button>)}
              </div>
            </div>
            {draft.rewardPreset === 'custom' && <label className={styles.label}>Custom reward in dollars
              <input className={styles.input} type="number" min="0.01" step="0.01" value={draft.customReward} onChange={(event) => setDraft({ ...draft, customReward: event.target.value })} placeholder="6.00" />
            </label>}
            <div className={styles.privacyNote}><strong>Privacy & safety:</strong> exact addresses are not public. Alcohol, tobacco, medication, weapons, illegal items, high-value cash, and other regulated deliveries are not allowed. Aspirers must verify email and phone before offering.</div>
            <button className={styles.goldButton} type="submit" disabled={busy === 'create' || !campusId}>{busy === 'create' ? 'Posting…' : 'Post Delivery Request'}</button>
          </form>
        </section>

        <section className={styles.panel}>
          <div className={styles.boardHeader}>
            <div><p className={styles.eyebrow}>ASPIRE DELIVERY BOARD</p><h2>Find help or help someone</h2></div>
            <button className={styles.outlineButton} type="button" onClick={() => void refresh()} disabled={!campusId || Boolean(busy)}>Refresh</button>
          </div>

          <div className={styles.statsGrid}>
            <div className={styles.statCard}><strong>{boardStats.open}</strong><span>Need an Aspirer</span></div>
            <div className={styles.statCard}><strong>{boardStats.active}</strong><span>Active now</span></div>
            <div className={styles.statCard}><strong>{boardStats.mine}</strong><span>Your requests</span></div>
            <div className={styles.statCard}><strong>{boardStats.helping}</strong><span>You’re helping</span></div>
          </div>

          <div className={styles.viewTabs} aria-label="Delivery board view">
            {([
              ['open', 'Open', boardStats.open],
              ['my_requests', 'My Requests', boardStats.mine],
              ['my_deliveries', 'My Deliveries', boardStats.helping],
              ['active', 'Active', boardStats.active],
              ['completed', 'Completed', boardStats.completed]
            ] as [DeliveryBoardView, string, number][]).map(([value, label, count]) => <button key={value} type="button" className={`${styles.viewTab} ${boardView === value ? styles.viewTabActive : ''}`} onClick={() => setBoardView(value)}><span>{label}</span><b>{count}</b></button>)}
          </div>

          <div className={styles.boardFilters}>
            <input className={styles.input} value={boardSearch} onChange={(event) => setBoardSearch(event.target.value)} placeholder="Search title, route, or details" aria-label="Search delivery requests" />
            <select className={styles.select} value={rewardFilter} onChange={(event) => setRewardFilter(event.target.value as DeliveryRewardFilter)} aria-label="Filter delivery rewards">
              <option value="all">All rewards</option>
              <option value="free">Free / volunteer</option>
              <option value="paid">Paid</option>
              <option value="negotiable">Negotiable</option>
            </select>
            {(boardSearch || rewardFilter !== 'all') && <button className={styles.clearButton} type="button" onClick={() => { setBoardSearch(''); setRewardFilter('all'); }}>Clear</button>}
          </div>

          <div className={styles.boardSummary}><strong>{visibleJobs.length}</strong> {visibleJobs.length === 1 ? 'delivery' : 'deliveries'} shown · public areas only until match</div>

          {loading ? <div className={styles.empty}>Loading delivery requests…</div> : !visibleJobs.length ? <div className={styles.empty}><strong>No deliveries in this view.</strong><span>{boardView === 'open' ? 'Try another reward filter or post a new delivery request.' : 'Switch tabs or clear your search to see more.'}</span></div> : <div className={styles.jobList}>
            {visibleJobs.map((job) => {
              const request = board.requests.get(job.request_id);
              const offers = offersByJob.get(job.id) || [];
              const isRequester = userId === job.requester_id;
              const isPickupParty = userId === job.pickup_party_id;
              const isDropoffParty = userId === job.dropoff_party_id;
              const isMatchedAspirer = userId === job.matched_aspirer_id;
              const canOffer = Boolean(userId && ['looking_for_aspirer','offer_received'].includes(job.status) && !isRequester && !isPickupParty && !isDropoffParty);
              const progress = statusProgress(job.status);
              const ownOffer = offers.find((offer) => offer.aspirer_id === userId);
              const active = focusJobId === job.id;
              const preferred = job.preferred_at ? new Date(job.preferred_at).toLocaleString() : 'Flexible time';
              const paid = Number(job.agreed_reward_cents || 0) > 0;
              const privateValue = privateDetails[job.id];
              const pd = privateDraft[job.id] || { pickup: '', dropoff: '' };

              return <article id={`delivery-job-${job.id}`} key={job.id} className={`${styles.jobCard} ${active ? styles.focused : ''}`}>
                <div className={styles.jobTop}>
                  <div><h3>{request?.title || 'Delivery request'}</h3><p className={styles.jobDetails}>{request?.details || 'No public description.'}</p></div>
                  <span className={`${styles.status} ${['looking_for_aspirer','offer_received'].includes(job.status) ? styles.statusOpen : ''}`}>{deliveryStatusLabel(job.status)}</span>
                </div>
                <div className={styles.route}>
                  <div><strong>Pick up</strong><span>{job.pickup_area}</span></div>
                  <span className={styles.routeArrow}>→</span>
                  <div><strong>Drop off</strong><span>{job.dropoff_area}</span></div>
                </div>
                <div className={styles.meta}>
                  <span>{rewardLabel(job.reward_mode, job.reward_cents)}</span>
                  <span>{preferred}</span>
                  {job.approx_distance_miles != null && <span>{job.approx_distance_miles.toFixed(1)} mi approx.</span>}
                  {job.market_order_id && <span>Marketplace delivery</span>}
                  {isRequester && <span className={styles.roleBadge}>Your request</span>}
                  {isMatchedAspirer && <span className={styles.roleBadge}>You’re delivering</span>}
                  {!isMatchedAspirer && ownOffer && <span className={styles.roleBadge}>You offered {money(ownOffer.amount_cents)}</span>}
                </div>

                {!['cancelled'].includes(job.status) && <div className={styles.timeline} aria-label="Delivery progress">
                  {STATUS_ORDER.slice(0).map((status, index) => <span key={status} className={`${styles.step} ${index <= progress ? styles.stepDone : ''}`}>{deliveryStatusLabel(status)}</span>)}
                </div>}

                {canOffer && <div className={styles.actionBox}>
                  <strong>{job.reward_mode === 'negotiable' ? 'Make your offer' : job.reward_mode === 'free' ? 'Volunteer to help' : 'Take this delivery'}</strong>
                  {job.reward_mode === 'negotiable' && <div className={styles.actionRow}>
                    <input className={styles.input} type="number" min="0" step="0.01" placeholder="Your offer, e.g. 6" value={offerAmount[job.id] || ''} onChange={(event) => setOfferAmount({ ...offerAmount, [job.id]: event.target.value })} />
                  </div>}
                  <div className={styles.actionRow}>
                    <input className={styles.input} placeholder="Optional message" value={offerMessage[job.id] || ''} onChange={(event) => setOfferMessage({ ...offerMessage, [job.id]: event.target.value })} maxLength={1000} />
                    <button className={styles.goldButton} type="button" onClick={() => void submitOffer(job)} disabled={busy === `offer:${job.id}`}>
                      {job.reward_mode === 'free' ? 'Help for free' : job.reward_mode === 'fixed' ? `Accept ${money(job.reward_cents || 0)}` : ownOffer ? 'Update offer' : 'Make an offer'}
                    </button>
                  </div>
                  {ownOffer && <span className={styles.waiting}>Your current offer: {money(ownOffer.amount_cents)} · {ownOffer.status}</span>}
                </div>}

                {isRequester && offers.length > 0 && ['offer_received','matched','heading_to_pickup','picked_up','on_the_way','delivered','completed'].includes(job.status) && <div className={styles.actionBox}>
                  <div className={styles.sectionHeading}><strong>Offers</strong><span>{offers.length} received</span></div>
                  <div className={styles.offerList}>{offers.map((offer) => <div className={`${styles.offer} ${['pending','countered'].includes(offer.status) ? styles.offerActionable : ''}`} key={offer.id}>
                    <div><strong>{profileName(board, offer.aspirer_id)} · {money(offer.amount_cents)}</strong><small>{offer.status === 'countered' ? 'Counter offer' : offer.status === 'pending' ? 'Ready for your response' : offer.status}</small></div>
                    {['pending','countered'].includes(offer.status) && job.status === 'offer_received' && <div className={styles.actionRow}>
                      {offer.last_actor_id !== userId ? <button className={styles.smallButton} type="button" disabled={busy === `accept:${offer.id}`} onClick={() => void acceptOffer(offer)}>Accept offer</button> : <span className={styles.waiting}>Waiting for Aspirer</span>}
                      {job.reward_mode === 'negotiable' && offer.last_actor_id !== userId && <button className={styles.outlineButton} type="button" onClick={() => void counterOffer(offer)}>Counter</button>}
                    </div>}
                    {offer.message && <p className={styles.offerMessage}>{offer.message}</p>}
                  </div>)}</div>
                </div>}

                {job.connection_id && !['looking_for_aspirer','offer_received'].includes(job.status) && <div className={styles.actionBox}>
                  <div className={styles.actionRow}>
                    <strong>Matched with {job.matched_aspirer_id ? profileName(board, job.matched_aspirer_id) : 'an Aspirer'}</strong>
                    <a className={styles.outlineButton} href={`/connections?connection=${encodeURIComponent(job.connection_id)}`}>Message / connection</a>
                    {paid && isRequester && job.status !== 'completed' && <a className={styles.goldButton} href={`/transactions?connection=${encodeURIComponent(job.connection_id)}`}>Secure delivery reward</a>}
                  </div>
                  {paid && job.status !== 'completed' && <span className={styles.waiting}>Paid reward is a separate Aspire Protected connection and is not released until both proof-backed completion confirmations exist.</span>}
                </div>}

                {!['looking_for_aspirer','offer_received','cancelled','completed'].includes(job.status) && (isRequester || isPickupParty || isDropoffParty || isMatchedAspirer) && <div className={styles.actionBox}>
                  <strong>Private handoff details</strong>
                  {(isRequester || isPickupParty || isDropoffParty) && <>
                    {(isPickupParty || isRequester) && <input className={styles.input} placeholder="Exact pickup instructions" value={pd.pickup} onChange={(event) => setPrivateDraft({ ...privateDraft, [job.id]: { ...pd, pickup: event.target.value } })} />}
                    {(isDropoffParty || isRequester) && <input className={styles.input} placeholder="Exact drop-off instructions" value={pd.dropoff} onChange={(event) => setPrivateDraft({ ...privateDraft, [job.id]: { ...pd, dropoff: event.target.value } })} />}
                    <button className={styles.outlineButton} type="button" onClick={() => void savePrivate(job)} disabled={busy === `private-save:${job.id}`}>Save private details</button>
                  </>}
                  <button className={styles.outlineButton} type="button" onClick={() => void revealPrivate(job)} disabled={busy === `private:${job.id}`}>View matched handoff details</button>
                  {privateValue && <div className={styles.privateBox}><b>Pickup:</b> {privateValue.pickup_instructions || 'Not added yet'}<br /><b>Drop-off:</b> {privateValue.dropoff_instructions || 'Not added yet'}</div>}
                </div>}

                {isPickupParty && ['matched','heading_to_pickup'].includes(job.status) && <div className={styles.actionBox}>
                  <strong>Pickup confirmation</strong>
                  <div className={styles.codeBox}>
                    {shownCodes[`${job.id}:pickup`] ? <span className={styles.code}>{shownCodes[`${job.id}:pickup`]}</span> : <button className={styles.outlineButton} type="button" onClick={() => void showCode(job, 'pickup')}>Show pickup code</button>}
                    <span className={styles.waiting}>Give this one-time code to the Aspirer only after the item is handed over.</span>
                  </div>
                </div>}

                {isMatchedAspirer && job.status === 'matched' && <div className={styles.actionBox}><button className={styles.goldButton} type="button" onClick={() => void changeStatus(job, 'heading_to_pickup')} disabled={busy === `status:${job.id}`}>I’m heading to pickup</button></div>}
                {isMatchedAspirer && ['matched','heading_to_pickup'].includes(job.status) && <div className={styles.actionBox}>
                  <strong>Confirm pickup</strong>
                  <div className={styles.codeBox}><input className={`${styles.input} ${styles.codeInput}`} inputMode="numeric" maxLength={4} placeholder="4-digit" value={codeInput[`${job.id}:pickup`] || ''} onChange={(event) => setCodeInput({ ...codeInput, [`${job.id}:pickup`]: event.target.value.replace(/\D/g, '').slice(0, 4) })} /><button className={styles.goldButton} type="button" onClick={() => void verifyCode(job, 'pickup')}>Confirm Pickup</button></div>
                </div>}
                {isMatchedAspirer && job.status === 'picked_up' && <div className={styles.actionBox}><button className={styles.goldButton} type="button" onClick={() => void changeStatus(job, 'on_the_way')}>Start delivery</button></div>}

                {isDropoffParty && ['picked_up','on_the_way'].includes(job.status) && <div className={styles.actionBox}>
                  <strong>Delivery confirmation</strong>
                  <div className={styles.codeBox}>
                    {shownCodes[`${job.id}:delivery`] ? <span className={styles.code}>{shownCodes[`${job.id}:delivery`]}</span> : <button className={styles.outlineButton} type="button" onClick={() => void showCode(job, 'delivery')}>Show delivery code</button>}
                    <span className={styles.waiting}>Give this code only after you receive the item.</span>
                  </div>
                </div>}

                {isMatchedAspirer && ['picked_up','on_the_way'].includes(job.status) && <div className={styles.actionBox}>
                  <strong>Confirm delivery</strong>
                  <div className={styles.codeBox}><input className={`${styles.input} ${styles.codeInput}`} inputMode="numeric" maxLength={4} placeholder="4-digit" value={codeInput[`${job.id}:delivery`] || ''} onChange={(event) => setCodeInput({ ...codeInput, [`${job.id}:delivery`]: event.target.value.replace(/\D/g, '').slice(0, 4) })} /><button className={styles.goldButton} type="button" onClick={() => void verifyCode(job, 'delivery')}>Confirm Delivery</button></div>
                </div>}

                {(isRequester || isDropoffParty) && job.status === 'delivered' && <div className={styles.actionBox}>
                  <button className={styles.goldButton} type="button" onClick={() => void finishDelivery(job)} disabled={busy === `complete:${job.id}`}>Delivery received · Complete</button>
                  <span className={styles.waiting}>This records the receiver side of closeout. Paid rewards remain protected until payout release succeeds.</span>
                </div>}

                {job.connection_id && job.status === 'completed' && (isRequester || isMatchedAspirer || isDropoffParty) && <div className={styles.actionBox}>
                  <strong>Delivery complete ✓</strong>
                  <div className={styles.actionRow}>
                    {paid && isRequester && <button className={styles.goldButton} type="button" onClick={() => void releaseReward(job)} disabled={busy === `release:${job.id}`}>{busy === `release:${job.id}` ? 'Releasing reward…' : 'Release protected reward'}</button>}
                    <a className={styles.goldButton} href={`/connections?connection=${encodeURIComponent(job.connection_id)}&tab=history`}>Review this delivery</a>
                    <a className={styles.outlineButton} href={`/connections?connection=${encodeURIComponent(job.connection_id)}`}>View connection</a>
                    {paid && <a className={styles.outlineButton} href={`/transactions?connection=${encodeURIComponent(job.connection_id)}`}>Payment details</a>}
                  </div>
                  <span className={styles.waiting}>{paid ? 'Completion is recorded. Reward release still respects payout readiness, disputes, refunds, and Resolution Center holds.' : 'Free delivery is closed with no Stripe payment. You can now leave a review.'}</span>
                </div>}
              </article>;
            })}
          </div>}
        </section>
      </div>

      <section className={styles.safety}><strong>Built for flexible fulfillment, not anonymous courier work.</strong> Public posts show only coarse areas. Exact instructions unlock after matching. Free help never touches Stripe; paid rewards become a separate Aspire Protected connection. Email + phone verification is required before an Aspirer can make an offer, and regulated or unsafe deliveries remain prohibited.</section>
    </div>
  </main>;
}
