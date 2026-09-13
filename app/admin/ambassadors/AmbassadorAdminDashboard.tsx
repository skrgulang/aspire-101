'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../../lib/supabase/client';
import styles from './ambassador-admin.module.css';

type Status = 'new' | 'reviewing' | 'interview' | 'accepted' | 'declined';
type Filter = 'all' | Status;
type EmailStatus = 'matched' | 'unmatched' | 'unreviewed';
type EmailType = 'application_received' | 'admin_new_application' | 'interview_invite' | 'accepted' | 'declined' | 'follow_up';
type DeliveryStatus = 'queued' | 'sent' | 'failed' | 'skipped';

type Application = {
  id: string;
  full_name: string;
  school: string;
  school_email: string;
  school_email_domain: string | null;
  school_email_status: EmailStatus;
  school_email_suggestion: string | null;
  matched_university_id: string | null;
  major_year: string | null;
  why_aspire: string;
  campus_involvement: string | null;
  social_links: string | null;
  availability: string | null;
  interested_in: string[];
  status: Status;
  internal_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

type EmailEvent = {
  id: string;
  application_id: string;
  email_type: EmailType;
  recipient: string;
  status: DeliveryStatus;
  provider: string | null;
  provider_message_id: string | null;
  error_message: string | null;
  created_by: string | null;
  created_at: string;
  sent_at: string | null;
};

const statusOrder: Status[] = ['new', 'reviewing', 'interview', 'accepted', 'declined'];
const statusLabels: Record<Status, string> = {
  new: 'New', reviewing: 'Reviewing', interview: 'Interview', accepted: 'Accepted', declined: 'Declined'
};
const emailLabels: Record<EmailType, string> = {
  application_received: 'Application confirmation',
  admin_new_application: 'Admin notification',
  interview_invite: 'Interview invite',
  accepted: 'Acceptance email',
  declined: 'Decline email',
  follow_up: 'Follow-up email'
};

function formatDate(value: string) {
  return new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'A';
}

async function accessToken() {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session?.access_token || '';
}

export default function AmbassadorAdminDashboard() {
  const router = useRouter();
  const [applications, setApplications] = useState<Application[]>([]);
  const [emailEvents, setEmailEvents] = useState<EmailEvent[]>([]);
  const [emailConfigured, setEmailConfigured] = useState(false);
  const [replyToConfigured, setReplyToConfigured] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [denied, setDenied] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setNotice('');
    try {
      const token = await accessToken();
      if (!token) {
        router.replace('/login?next=%2Fadmin%2Fambassadors');
        return;
      }
      const response = await fetch('/api/admin/ambassadors', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) {
        router.replace('/login?next=%2Fadmin%2Fambassadors');
        return;
      }
      if (response.status === 403) {
        setDenied(true);
        return;
      }
      if (!response.ok) throw new Error(payload?.error || 'Could not load applications.');
      const rows = (payload.applications || []) as Application[];
      setApplications(rows);
      setEmailEvents((payload.emailEvents || []) as EmailEvent[]);
      setEmailConfigured(Boolean(payload.emailConfigured));
      setReplyToConfigured(Boolean(payload.replyToConfigured));
      setSelectedId((current) => current && rows.some((row) => row.id === current) ? current : (rows[0]?.id || ''));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not load applications.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => Object.fromEntries(statusOrder.map((status) => [status, applications.filter((item) => item.status === status).length])) as Record<Status, number>, [applications]);
  const emailReviewCount = useMemo(() => applications.filter((item) => item.school_email_status !== 'matched').length, [applications]);
  const filtered = useMemo(() => {
    const clean = query.trim().toLowerCase();
    return applications.filter((item) => {
      if (filter !== 'all' && item.status !== filter) return false;
      if (!clean) return true;
      return [item.full_name, item.school, item.school_email, item.school_email_domain || '', item.major_year || '', ...(item.interested_in || [])].join(' ').toLowerCase().includes(clean);
    });
  }, [applications, filter, query]);
  const selected = useMemo(() => applications.find((item) => item.id === selectedId) || null, [applications, selectedId]);
  const selectedEmailEvents = useMemo(
    () => selected ? emailEvents.filter((event) => event.application_id === selected.id).slice(0, 6) : [],
    [emailEvents, selected]
  );

  useEffect(() => { setNotesDraft(selected?.internal_notes || ''); }, [selected?.id, selected?.internal_notes]);

  async function patchApplication(id: string, patch: { status?: Status; internalNotes?: string | null }, successMessage: string) {
    setBusy(id);
    setNotice('');
    try {
      const token = await accessToken();
      if (!token) throw new Error('Sign in again to continue.');
      const response = await fetch('/api/admin/ambassadors', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...patch })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'Could not update application.');
      const updated = payload.application as Application;
      setApplications((current) => current.map((item) => item.id === updated.id ? updated : item));
      setNotice(successMessage);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not update application.');
    } finally {
      setBusy('');
    }
  }

  async function sendEmail(id: string, emailType: EmailType) {
    setBusy(`email:${id}`);
    setNotice('');
    try {
      const token = await accessToken();
      if (!token) throw new Error('Sign in again to continue.');
      const response = await fetch('/api/admin/ambassadors', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, emailType })
      });
      const payload = await response.json().catch(() => ({}));
      if (payload?.event) {
        const event = payload.event as EmailEvent;
        setEmailEvents((current) => [event, ...current.filter((item) => item.id !== event.id)]);
      }
      if (!response.ok) throw new Error(payload?.error || 'Could not send email.');
      setNotice(`${emailLabels[emailType]} sent.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not send email.');
    } finally {
      setBusy('');
    }
  }

  if (loading) return <main className={styles.state}><div className={styles.spinner} /><strong>Opening ambassador recruiting…</strong><span>Loading applications securely</span></main>;
  if (denied) return <main className={styles.state}><strong>Admin access required.</strong><span>This page contains private applicant information.</span><a href="/profile">Back to Aspire →</a></main>;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p>ASPIRE 101 · CAMPUS TEAM</p>
          <h1>Ambassador recruiting</h1>
          <span>Review applicants, manage interview stages, keep private notes, and handle applicant follow-up in one place.</span>
        </div>
        <nav><a href="/ambassadors" target="_blank" rel="noreferrer">Public page ↗</a><a href="/moderator">Trust &amp; Safety</a><a href="/profile">Back to Aspire →</a></nav>
      </header>

      <section className={styles.stats} style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }} aria-label="Application overview">
        <article><span>TOTAL</span><strong>{applications.length}</strong><small>All applications</small></article>
        <article className={counts.new ? styles.attention : ''}><span>NEW</span><strong>{counts.new}</strong><small>Need first review</small></article>
        <article className={emailReviewCount ? styles.attention : ''}><span>EMAIL CHECK</span><strong>{emailReviewCount}</strong><small>Domain not matched</small></article>
        <article><span>INTERVIEW</span><strong>{counts.interview}</strong><small>Conversation stage</small></article>
        <article><span>ACCEPTED</span><strong>{counts.accepted}</strong><small>Campus builders</small></article>
      </section>

      <section className={styles.toolbar}>
        <div className={styles.tabs}>
          <button className={filter === 'all' ? styles.active : ''} onClick={() => setFilter('all')} type="button">All <b>{applications.length}</b></button>
          {statusOrder.map((status) => <button key={status} className={filter === status ? styles.active : ''} onClick={() => setFilter(status)} type="button">{statusLabels[status]} <b>{counts[status]}</b></button>)}
        </div>
        <label className={styles.search}><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, school, email…" /></label>
      </section>

      {notice && <div className={styles.notice} role="status">{notice}</div>}

      <section className={styles.workspace}>
        <div className={styles.list}>
          <div className={styles.listHead}><span>{filtered.length} applicant{filtered.length === 1 ? '' : 's'}</span><button type="button" onClick={() => void load()}>Refresh</button></div>
          {!filtered.length && <div className={styles.empty}>No applicants match this view.</div>}
          {filtered.map((item) => (
            <button type="button" key={item.id} className={`${styles.applicant} ${selectedId === item.id ? styles.selected : ''}`} onClick={() => setSelectedId(item.id)}>
              <i>{initials(item.full_name)}</i>
              <span><strong>{item.full_name}</strong><small>{item.school}{item.school_email_status !== 'matched' ? ' · ⚠ Email check' : ''}</small><em>{formatDate(item.created_at)}</em></span>
              <b data-status={item.status}>{statusLabels[item.status]}</b>
            </button>
          ))}
        </div>

        <div className={styles.detail}>
          {!selected ? <div className={styles.empty}>Select an applicant to review.</div> : (
            <>
              <div className={styles.detailTop}>
                <div><p>{statusLabels[selected.status].toUpperCase()} · {formatDate(selected.created_at)}</p><h2>{selected.full_name}</h2><span>{selected.school}{selected.major_year ? ` · ${selected.major_year}` : ''}</span></div>
                <a href={`mailto:${encodeURIComponent(selected.school_email)}?subject=${encodeURIComponent('Aspire 101 Campus Ambassador')}`}>Email applicant ↗</a>
              </div>

              <div className={styles.statusActions} aria-label="Applicant status">
                {statusOrder.map((status) => <button key={status} disabled={busy === selected.id} className={selected.status === status ? styles.currentStatus : ''} type="button" onClick={() => void patchApplication(selected.id, { status }, `Moved ${selected.full_name} to ${statusLabels[status]}.`)}>{statusLabels[status]}</button>)}
              </div>

              <section className={styles.emailWorkflow}>
                <div className={styles.emailWorkflowHead}>
                  <div><span>EMAIL WORKFLOW</span><strong>{emailConfigured ? 'Automated delivery ready' : 'Delivery provider not configured'}</strong></div>
                  <small>{emailConfigured ? (replyToConfigured ? 'Replies route back to the Aspire team.' : 'Add a reply-to address before sending interview emails.') : 'Manual mailto remains available above.'}</small>
                </div>
                <div className={styles.emailActions}>
                  {selected.status === 'interview' && <button disabled={!emailConfigured || busy === `email:${selected.id}`} type="button" onClick={() => void sendEmail(selected.id, 'interview_invite')}>Send interview invite</button>}
                  {selected.status === 'accepted' && <button disabled={!emailConfigured || busy === `email:${selected.id}`} type="button" onClick={() => void sendEmail(selected.id, 'accepted')}>Send acceptance</button>}
                  {selected.status === 'declined' && <button disabled={!emailConfigured || busy === `email:${selected.id}`} type="button" onClick={() => void sendEmail(selected.id, 'declined')}>Send decline email</button>}
                  <button disabled={!emailConfigured || busy === `email:${selected.id}`} type="button" onClick={() => void sendEmail(selected.id, 'follow_up')}>Send follow-up</button>
                </div>
                <div className={styles.emailHistory}>
                  {selectedEmailEvents.length ? selectedEmailEvents.map((event) => (
                    <div className={styles.emailEvent} key={event.id}>
                      <span><strong>{emailLabels[event.email_type]}</strong><small>{formatDate(event.sent_at || event.created_at)}</small></span>
                      <b data-delivery={event.status}>{event.status}</b>
                    </div>
                  )) : <small className={styles.emailEmpty}>No email activity recorded for this applicant yet.</small>}
                </div>
              </section>

              <div className={styles.infoGrid}>
                <article style={selected.school_email_status !== 'matched' ? { borderColor: 'rgba(255,199,44,.28)', background: 'rgba(255,199,44,.035)' } : undefined}>
                  <span>SCHOOL EMAIL</span>
                  <strong>{selected.school_email}</strong>
                  <small style={{ display: 'block', marginTop: 8, color: selected.school_email_status === 'matched' ? '#91d8a1' : '#ffc85d', fontSize: 8, fontWeight: 850 }}>
                    {selected.school_email_status === 'matched' ? '✓ Campus domain matched' : selected.school_email_status === 'unmatched' ? '⚠ Domain needs review' : 'Domain not checked'}
                  </small>
                  {selected.school_email_suggestion && <small style={{ display: 'block', marginTop: 4, color: '#9f978b', fontSize: 8 }}>Possible domain: @{selected.school_email_suggestion}</small>}
                </article>
                <article><span>AVAILABILITY</span><strong>{selected.availability || 'Not provided'}</strong></article>
                <article className={styles.wide}><span>INTERESTED IN</span><div>{selected.interested_in?.length ? selected.interested_in.map((interest) => <b key={interest}>{interest}</b>) : <strong>Not specified</strong>}</div></article>
              </div>

              <section className={styles.answer}><span>WHY ASPIRE</span><p>{selected.why_aspire}</p></section>
              <section className={styles.answer}><span>CAMPUS INVOLVEMENT</span><p>{selected.campus_involvement || 'Not provided.'}</p></section>
              <section className={styles.answer}><span>SOCIAL / PORTFOLIO</span>{selected.social_links ? (/^https?:\/\//i.test(selected.social_links.trim()) ? <a href={selected.social_links.trim()} target="_blank" rel="noreferrer">{selected.social_links} ↗</a> : <p>{selected.social_links}</p>) : <p>Not provided.</p>}</section>

              <section className={styles.notes}>
                <div><span>INTERNAL NOTES</span><small>Admin-only. Never shown to the applicant.</small></div>
                <textarea value={notesDraft} maxLength={10000} rows={6} onChange={(event) => setNotesDraft(event.target.value)} placeholder="Interview notes, follow-up context, campus fit…" />
                <div className={styles.notesFoot}><small>{selected.reviewed_at ? `Last reviewed ${formatDate(selected.reviewed_at)}` : 'Not reviewed yet'}</small><button type="button" disabled={busy === selected.id || notesDraft === (selected.internal_notes || '')} onClick={() => void patchApplication(selected.id, { internalNotes: notesDraft }, 'Internal notes saved.')}>{busy === selected.id ? 'Saving…' : 'Save notes'}</button></div>
              </section>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
