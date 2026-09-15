'use client';

import { useEffect, useMemo, useState } from 'react';
import AppDock from '../../AppDock';
import { getSupabaseBrowserClient } from '../../../lib/supabase/client';
import {
  cancelOpenDelivery,
  fetchDeliveryBoard,
  rewardLabel,
  withdrawDeliveryOffer,
  type DeliveryBoardData,
  type DeliveryJob,
  type DeliveryOffer
} from '../../../lib/supabase/delivery';
import styles from './DeliveryManage.module.css';

const EMPTY_BOARD: DeliveryBoardData = { jobs: [], requests: new Map(), offers: [], profiles: new Map() };

function titleFor(board: DeliveryBoardData, job: DeliveryJob) {
  return board.requests.get(job.request_id)?.title || 'Delivery request';
}

function money(cents: number) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function errorText(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || 'Something went wrong.');
  if (/MATCHED_DELIVERY_USE_RESOLUTION/i.test(message)) return 'This delivery is already matched. Use Resolution Center instead of cancelling the public request.';
  if (/DELIVERY_ALREADY_MATCHED/i.test(message)) return 'This offer cannot be withdrawn because the delivery is already matched.';
  return message;
}

export default function DeliveryManageCenter() {
  const [userId, setUserId] = useState<string | null>(null);
  const [campusId, setCampusId] = useState<string | null>(null);
  const [board, setBoard] = useState<DeliveryBoardData>(EMPTY_BOARD);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    void supabase.auth.getUser().then(async ({ data, error }) => {
      if (error) throw error;
      if (!data.user) {
        window.location.assign('/login?next=%2Fdelivery%2Fmanage');
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
      if (!id) throw new Error('Choose your campus in Profile before managing deliveries.');
      setBoard(await fetchDeliveryBoard(id));
    }).catch((error) => setNotice(errorText(error))).finally(() => setLoading(false));
  }, []);

  const offersByJob = useMemo(() => {
    const map = new Map<string, DeliveryOffer[]>();
    for (const offer of board.offers) map.set(offer.delivery_job_id, [...(map.get(offer.delivery_job_id) || []), offer]);
    return map;
  }, [board.offers]);

  const cancellableRequests = useMemo(() => board.jobs.filter((job) =>
    job.requester_id === userId && ['looking_for_aspirer', 'offer_received'].includes(job.status) && !job.connection_id && !job.matched_aspirer_id
  ), [board.jobs, userId]);

  const withdrawableOffers = useMemo(() => board.offers.filter((offer) => {
    if (offer.aspirer_id !== userId || !['pending', 'countered'].includes(offer.status)) return false;
    const job = board.jobs.find((entry) => entry.id === offer.delivery_job_id);
    return Boolean(job && ['looking_for_aspirer', 'offer_received'].includes(job.status) && !job.matched_aspirer_id);
  }), [board.jobs, board.offers, userId]);

  const matched = useMemo(() => board.jobs.filter((job) =>
    !['looking_for_aspirer', 'offer_received', 'cancelled', 'completed'].includes(job.status)
    && (job.requester_id === userId || job.pickup_party_id === userId || job.dropoff_party_id === userId || job.matched_aspirer_id === userId)
  ), [board.jobs, userId]);

  async function refresh() {
    if (!campusId) return;
    setBoard(await fetchDeliveryBoard(campusId));
  }

  async function cancel(job: DeliveryJob) {
    const confirmed = window.confirm('Cancel this unmatched delivery request? Active offers will be closed. This cannot be undone from this screen.');
    if (!confirmed) return;
    setBusy(`cancel:${job.id}`);
    setNotice('');
    try {
      await cancelOpenDelivery(job.id);
      setNotice('Delivery request cancelled. Aspirers with active offers are notified.');
      await refresh();
    } catch (error) {
      setNotice(errorText(error));
    } finally {
      setBusy('');
    }
  }

  async function withdraw(offer: DeliveryOffer) {
    const confirmed = window.confirm('Withdraw this delivery offer? You can make a new offer later only if the request is still open.');
    if (!confirmed) return;
    setBusy(`withdraw:${offer.id}`);
    setNotice('');
    try {
      await withdrawDeliveryOffer(offer.id);
      setNotice('Delivery offer withdrawn. The requester has been notified.');
      await refresh();
    } catch (error) {
      setNotice(errorText(error));
    } finally {
      setBusy('');
    }
  }

  return <main className={styles.page}>
    <AppDock active="delivery" />
    <div className={styles.shell}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>ASPIRE DELIVERY · MANAGE</p>
          <h1>Change plans without bypassing protection.</h1>
          <p>Unmatched requests can be cancelled and unmatched offers can be withdrawn here. Once a delivery is matched, issues move through the connection and Resolution Center so payment and dispute protections stay intact.</p>
        </div>
        <div className={styles.heroActions}>
          <a className={styles.gold} href="/delivery">Delivery Board</a>
          <a className={styles.outline} href="/delivery/activity">Delivery Activity</a>
        </div>
      </section>

      {notice && <div className={styles.notice}>{notice}</div>}

      <section className={styles.summary}>
        <div><strong>{cancellableRequests.length}</strong><span>Requests you can cancel</span></div>
        <div><strong>{withdrawableOffers.length}</strong><span>Offers you can withdraw</span></div>
        <div><strong>{matched.length}</strong><span>Matched / active</span></div>
      </section>

      {loading ? <section className={styles.panel}><div className={styles.empty}>Loading delivery controls…</div></section> : <>
        <section className={styles.panel}>
          <div className={styles.panelTop}><div><p className={styles.eyebrow}>YOUR REQUESTS</p><h2>Cancel before matching</h2></div><span>Pre-match only</span></div>
          {!cancellableRequests.length ? <div className={styles.empty}>No unmatched delivery requests are cancellable right now.</div> : <div className={styles.list}>
            {cancellableRequests.map((job) => <article className={styles.card} key={job.id}>
              <div className={styles.cardMain}><strong>{titleFor(board, job)}</strong><span>{job.pickup_area} → {job.dropoff_area}</span><small>{rewardLabel(job.reward_mode, job.reward_cents)} · {(offersByJob.get(job.id) || []).filter((offer) => ['pending','countered'].includes(offer.status)).length} active offer(s)</small></div>
              <div className={styles.actions}><a className={styles.outline} href={`/delivery?job=${encodeURIComponent(job.id)}`}>View</a><button className={styles.danger} type="button" onClick={() => void cancel(job)} disabled={busy === `cancel:${job.id}`}>{busy === `cancel:${job.id}` ? 'Cancelling…' : 'Cancel request'}</button></div>
            </article>)}
          </div>}
        </section>

        <section className={styles.panel}>
          <div className={styles.panelTop}><div><p className={styles.eyebrow}>YOUR OFFERS</p><h2>Withdraw before matching</h2></div><span>Pre-match only</span></div>
          {!withdrawableOffers.length ? <div className={styles.empty}>No active delivery offers can be withdrawn right now.</div> : <div className={styles.list}>
            {withdrawableOffers.map((offer) => {
              const job = board.jobs.find((entry) => entry.id === offer.delivery_job_id)!;
              return <article className={styles.card} key={offer.id}>
                <div className={styles.cardMain}><strong>{titleFor(board, job)}</strong><span>{job.pickup_area} → {job.dropoff_area}</span><small>Your offer: {money(offer.amount_cents)} · {offer.status}</small></div>
                <div className={styles.actions}><a className={styles.outline} href={`/delivery?job=${encodeURIComponent(job.id)}`}>View</a><button className={styles.danger} type="button" onClick={() => void withdraw(offer)} disabled={busy === `withdraw:${offer.id}`}>{busy === `withdraw:${offer.id}` ? 'Withdrawing…' : 'Withdraw offer'}</button></div>
              </article>;
            })}
          </div>}
        </section>

        <section className={styles.panel}>
          <div className={styles.panelTop}><div><p className={styles.eyebrow}>MATCHED DELIVERIES</p><h2>Problems after matching</h2></div><span>Protection stays on</span></div>
          {!matched.length ? <div className={styles.empty}>No matched delivery currently needs management.</div> : <div className={styles.list}>
            {matched.map((job) => <article className={styles.card} key={job.id}>
              <div className={styles.cardMain}><strong>{titleFor(board, job)}</strong><span>{job.pickup_area} → {job.dropoff_area}</span><small>{job.status.replaceAll('_', ' ')}{job.agreed_reward_cents != null ? ` · agreed ${money(job.agreed_reward_cents)}` : ''}</small></div>
              <div className={styles.actions}>
                <a className={styles.outline} href={`/delivery?job=${encodeURIComponent(job.id)}`}>View delivery</a>
                {job.connection_id ? <a className={styles.gold} href={`/resolution?connection=${encodeURIComponent(job.connection_id)}`}>Report issue</a> : <span className={styles.waiting}>Connection setup in progress</span>}
              </div>
            </article>)}
          </div>}
        </section>
      </>}

      <section className={styles.safety}><strong>Why matched deliveries cannot be cancelled here:</strong> once a connection exists, money state, completion evidence, refunds, and payout holds may already matter. Aspire routes those cases through the existing connection / Resolution Center flow rather than silently changing protected state from a delivery screen.</section>
    </div>
  </main>;
}
