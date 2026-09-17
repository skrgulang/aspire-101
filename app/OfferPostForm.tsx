'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import { createRequest } from '../lib/supabase/requests';
import { fetchActiveUniversities, type University } from '../lib/supabase/universities';
import RequestScheduleFields, { type RequestScheduleMode } from './RequestScheduleFields';
import styles from './OfferPostForm.module.css';

type OfferCategory = {
  value: string;
  label: string;
  icon: string;
  prompt: string;
  example: string;
};

const categories: OfferCategory[] = [
  { value: 'Ride', label: 'Ride / carpool', icon: '↗', prompt: 'Offer a ride you are already making.', example: 'Driving back toward campus tonight — seats available' },
  { value: 'Pickup / errand', label: 'Pickup / errand', icon: '□', prompt: 'Offer to grab something while you are already out.', example: 'Heading to Target — can pick something up for someone' },
  { value: 'Moving / help', label: 'Practical help', icon: '+', prompt: 'Offer time, hands, tools, or practical help.', example: 'Free this afternoon to help move a desk or mini fridge' },
  { value: 'Study', label: 'Study / class', icon: '✎', prompt: 'Offer study help, notes, or a study session.', example: 'I can help with linear algebra tonight' },
  { value: 'Project / collab', label: 'Project / skills', icon: '✦', prompt: 'Offer a skill or time for a project.', example: 'Can help with Unity or C# on a student project' },
  { value: 'Other', label: 'Something else', icon: '…', prompt: 'Offer something useful to people around campus.', example: 'Going to Costco this afternoon — happy to bring something back' }
];

const quickStarts = [
  {
    label: 'Ride back to campus',
    category: 'Ride',
    title: 'Driving back toward campus tonight — seats available',
    details: 'I am heading back toward campus and can take someone who needs a ride. Message me if the timing works for you.',
    origin: '',
    destination: ''
  },
  {
    label: 'Picking something up',
    category: 'Pickup / errand',
    title: 'Heading to Target — can pick something up for someone',
    details: 'I am already going, so if you need a small item picked up, send me a message.',
    origin: '',
    destination: ''
  },
  {
    label: 'Available to help',
    category: 'Moving / help',
    title: 'Free this afternoon to help move or carry something',
    details: 'I have some time available around campus and can help with a practical task.',
    origin: '',
    destination: ''
  },
  {
    label: 'Study help',
    category: 'Study',
    title: 'I can help with linear algebra tonight',
    details: 'Happy to study together or help explain a topic I know.',
    origin: '',
    destination: ''
  }
];

function browseCategory(category: string) {
  if (category === 'Ride') return 'Get me there';
  if (category === 'Pickup / errand') return 'Pick this up';
  if (category === 'Moving / help') return 'Give me a hand';
  if (category === 'Study') return 'Study / class';
  if (category === 'Project / collab') return 'Build something';
  return 'People / community';
}

function campusArea(campus: University | null) {
  if (!campus) return '';
  return [campus.city, campus.state].filter(Boolean).join(', ');
}

export default function OfferPostForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [universities, setUniversities] = useState<University[]>([]);
  const [campusId, setCampusId] = useState('');
  const [homeCampusId, setHomeCampusId] = useState('');
  const [category, setCategory] = useState('Ride');
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [seats, setSeats] = useState('2');
  const [scheduleMode, setScheduleMode] = useState<RequestScheduleMode>('flexible');
  const [startLocal, setStartLocal] = useState('');
  const [endLocal, setEndLocal] = useState('');
  const [meetingLabel, setMeetingLabel] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');
  const [posted, setPosted] = useState<{ id: string; title: string } | null>(null);

  useEffect(() => {
    let alive = true;
    const supabase = getSupabaseBrowserClient();
    void supabase.auth.getUser().then(async ({ data }) => {
      if (!alive) return;
      if (!data.user) {
        router.replace('/login?next=%2Fpost%3Fmode%3Doffer');
        return;
      }
      try {
        const [{ data: profile }, campusList] = await Promise.all([
          supabase.from('profiles').select('home_campus_id,current_campus_id').eq('id', data.user.id).maybeSingle(),
          fetchActiveUniversities()
        ]);
        if (!alive) return;
        const homeId = typeof profile?.home_campus_id === 'string' ? profile.home_campus_id : '';
        const preferred = typeof profile?.current_campus_id === 'string' && profile.current_campus_id
          ? profile.current_campus_id
          : homeId;
        const nextCampus = campusList.find((item) => item.id === preferred) || campusList[0] || null;
        setUniversities(campusList);
        setHomeCampusId(homeId);
        setCampusId(nextCampus?.id || '');
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not load your campus.');
      } finally {
        if (alive) setLoading(false);
      }
    });
    return () => { alive = false; };
  }, [router]);

  const selectedCampus = useMemo(() => universities.find((item) => item.id === campusId) || null, [universities, campusId]);
  const homeCampus = useMemo(() => universities.find((item) => item.id === homeCampusId) || null, [universities, homeCampusId]);
  const selectedCategory = useMemo(() => categories.find((item) => item.value === category) || categories[0], [category]);
  const isRide = category === 'Ride';
  const selectedArea = campusArea(selectedCampus);
  const homeArea = campusArea(homeCampus);

  function applyQuickStart(item: (typeof quickStarts)[number]) {
    setCategory(item.category);
    setDetails(item.details);
    if (item.category === 'Ride') {
      const visiting = Boolean(selectedCampus && homeCampus && selectedCampus.id !== homeCampus.id);
      const nextOrigin = visiting ? selectedArea : '';
      const nextDestination = homeArea || selectedArea;
      const campusName = homeCampus?.short_name || homeCampus?.name || selectedCampus?.short_name || selectedCampus?.name || 'campus';
      setTitle(`Driving to ${campusName} tonight — seats available`);
      setOrigin(nextOrigin);
      setDestination(nextDestination);
    } else {
      setTitle(item.title);
      setOrigin(item.origin);
      setDestination(item.destination);
    }
    setError('');
    setPosted(null);
  }

  function reset() {
    setCategory('Ride');
    setTitle('');
    setDetails('');
    setOrigin('');
    setDestination('');
    setSeats('2');
    setScheduleMode('flexible');
    setStartLocal('');
    setEndLocal('');
    setMeetingLabel('');
    setError('');
    setPosted(null);
  }

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!selectedCampus) return setError('Choose a supported campus before posting.');
    if (!title.trim()) return setError('Tell campus what you can offer.');
    if (isRide && (!origin.trim() || !destination.trim())) return setError('Add where the ride starts and where you are going.');

    let scheduledStartAt: string | undefined;
    let scheduledEndAt: string | undefined;
    if (scheduleMode === 'scheduled') {
      if (!startLocal) return setError('Add the date and time for this offer.');
      const start = new Date(startLocal);
      if (!Number.isFinite(start.getTime()) || start.getTime() <= Date.now()) return setError('Choose a future start time.');
      scheduledStartAt = start.toISOString();
      if (endLocal) {
        const end = new Date(endLocal);
        if (!Number.isFinite(end.getTime()) || end.getTime() <= start.getTime()) return setError('End time must be after the start time.');
        scheduledEndAt = end.toISOString();
      }
    }

    const detailParts = [details.trim()];
    if (isRide) {
      const seatCount = Math.max(1, Math.min(8, Number(seats) || 1));
      detailParts.push(`Route: ${origin.trim()} → ${destination.trim()}. Seats available: ${seatCount}.`);
    }

    setPublishing(true);
    try {
      const request = await createRequest({
        kind: 'community',
        category,
        title: title.trim(),
        details: detailParts.filter(Boolean).join('\n\n'),
        campusId: selectedCampus.id,
        scheduled_start_at: scheduledStartAt,
        scheduled_end_at: scheduledEndAt,
        timezone: scheduledStartAt ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' : undefined,
        meeting_label: (isRide ? `${origin.trim()} → ${destination.trim()}` : meetingLabel.trim()) || undefined
      });
      setPosted({ id: request.id, title: request.title });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not post your offer.');
    } finally {
      setPublishing(false);
    }
  }

  if (loading) return <div className={styles.loading}>Opening your offer composer…</div>;

  if (posted) {
    const categoryParam = encodeURIComponent(browseCategory(category));
    return (
      <section className={styles.success}>
        <span>OFFER POSTED</span>
        <h2>{posted.title}</h2>
        <p>It is now in Browse for students at {selectedCampus?.short_name || selectedCampus?.name || 'your campus'}. People who want what you are offering can send their interest.</p>
        <div>
          <a href={`/discover?category=${categoryParam}`}>View it in Browse →</a>
          <button type="button" onClick={reset}>Post another offer</button>
        </div>
      </section>
    );
  }

  return (
    <form className={styles.root} onSubmit={publish}>
      <div className={styles.hero}>
        <div><span>I CAN HELP</span><h2>Offer something useful.</h2><p>Post what you are already doing, where you are going, or what you can help with. Students who need it can reach out to you.</p></div>
        <div className={styles.campus}><small>POSTING TO</small><strong>{selectedCampus?.short_name || selectedCampus?.name || 'Campus'}</strong><span>{selectedArea || 'Selected campus area'}</span></div>
      </div>

      <section className={styles.quickSection}>
        <div className={styles.sectionHeading}><div><span>QUICK START</span><h3>Start with a common offer.</h3></div><small>You can edit everything</small></div>
        <div className={styles.quickGrid}>{quickStarts.map((item) => <button key={item.label} type="button" onClick={() => applyQuickStart(item)}><strong>{item.label}</strong><span>{item.category === 'Ride' ? `Ride toward ${homeCampus?.short_name || selectedCampus?.short_name || 'campus'}` : item.title}</span></button>)}</div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}><div><span>01 · TYPE</span><h3>What can you offer?</h3></div><small>Choose one</small></div>
        <div className={styles.categoryGrid}>{categories.map((item) => <button key={item.value} type="button" className={category === item.value ? styles.active : ''} onClick={() => { setCategory(item.value); setError(''); }}><i>{item.icon}</i><strong>{item.label}</strong><span>{item.prompt}</span></button>)}</div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}><div><span>02 · DETAILS</span><h3>Make the offer clear.</h3></div><small>People should understand it at a glance</small></div>
        <div className={styles.fields}>
          <label className={styles.wide}><span>Title</span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={180} placeholder={selectedCategory.example} /></label>
          <label className={styles.wide}><span>Details <em>optional</em></span><textarea value={details} onChange={(event) => setDetails(event.target.value)} rows={4} placeholder="Add timing, limits, what you can carry, or anything people should know." /></label>
          {isRide && <>
            <div className={`${styles.routeAssist} ${styles.wide}`}>
              <span>SMART ROUTE</span>
              {selectedArea && <button type="button" onClick={() => setOrigin(selectedArea)}>Start near {selectedCampus?.short_name || 'current campus'}</button>}
              {selectedArea && <button type="button" onClick={() => setDestination(selectedArea)}>Go to {selectedCampus?.short_name || 'current campus'}</button>}
              {homeArea && homeCampus?.id !== selectedCampus?.id && <button type="button" onClick={() => setDestination(homeArea)}>Go home to {homeCampus?.short_name || homeCampus?.name}</button>}
            </div>
            <label><span>Leaving from</span><input value={origin} onChange={(event) => setOrigin(event.target.value)} placeholder={selectedArea || 'Chicago, IL'} /></label>
            <label><span>Going to</span><input value={destination} onChange={(event) => setDestination(event.target.value)} placeholder={homeArea || selectedArea || 'West Lafayette, IN'} /></label>
            <label className={styles.seats}><span>Seats available</span><input type="number" min="1" max="8" value={seats} onChange={(event) => setSeats(event.target.value)} /></label>
          </>}
        </div>
      </section>

      <RequestScheduleFields
        mode={scheduleMode}
        startLocal={startLocal}
        endLocal={endLocal}
        meetingLabel={meetingLabel}
        onModeChange={setScheduleMode}
        onStartChange={setStartLocal}
        onEndChange={setEndLocal}
        onMeetingLabelChange={setMeetingLabel}
      />

      <section className={styles.preview}>
        <div><span>HOW IT WILL WORK</span><strong>You offer → someone is interested → you choose whether to connect.</strong></div>
        <p>Your campus context helps Aspire show the offer to the right community, but the route itself stays flexible. You can type any city, airport, neighborhood, or campus in From and To.</p>
      </section>

      {error && <div className={styles.error} role="alert">{error}</div>}

      <div className={styles.actions}>
        <div><strong>Ready to offer this?</strong><span>It will appear in Browse at {selectedCampus?.short_name || 'your campus'}.</span></div>
        <button type="submit" disabled={publishing}>{publishing ? 'Posting…' : 'Post offer →'}</button>
      </div>
    </form>
  );
}
