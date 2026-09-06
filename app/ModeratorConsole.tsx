'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AppRole,
  fetchMyRole,
  fetchRequestsForModeration,
  fetchSafetyReportsForModeration,
  fetchVerificationQueue,
  removeRequestAsModerator,
  reviewRequestModeration,
  reviewSafetyReport,
  reviewSchoolVerification,
  SafetyReportForModeration,
  SchoolVerification,
  setModeratorByEmail
} from '../lib/supabase/trust';
import type { AspireRequest } from '../lib/supabase/requests';
import AppDock from './AppDock';
import AppLoader from './AppLoader';

type Tab = 'ids' | 'reports' | 'requests' | 'team';

function when(value: string) {
  return new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function moderationLabel(request: AspireRequest) {
  const state = request.moderation_status || 'approved';
  return state.toUpperCase();
}

export default function ModeratorConsole() {
  const router = useRouter();
  const [role, setRole] = useState<AppRole>('member');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('ids');
  const [verifications, setVerifications] = useState<SchoolVerification[]>([]);
  const [reports, setReports] = useState<SafetyReportForModeration[]>([]);
  const [requests, setRequests] = useState<AspireRequest[]>([]);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [teamEmail, setTeamEmail] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setNotice('');
    try {
      const nextRole = await fetchMyRole();
      setRole(nextRole);
      if (nextRole !== 'moderator' && nextRole !== 'admin') {
        router.replace('/profile');
        return;
      }
      const [ids, safety, activeRequests] = await Promise.all([
        fetchVerificationQueue(),
        fetchSafetyReportsForModeration(),
        fetchRequestsForModeration()
      ]);
      setVerifications(ids);
      setReports(safety);
      setRequests(activeRequests);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not load moderation tools.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { void reload(); }, [reload]);

  const pendingIds = useMemo(() => verifications.filter((item) => item.status === 'pending'), [verifications]);
  const openReports = useMemo(() => reports.filter((item) => item.status === 'submitted' || item.status === 'reviewing'), [reports]);
  const pendingRequests = useMemo(() => requests.filter((request) => request.moderation_status === 'pending'), [requests]);
  const activeRequests = useMemo(() => requests.filter((request) => ['open', 'matched', 'in_progress'].includes(request.status)), [requests]);

  async function decideId(item: SchoolVerification, decision: 'verified' | 'rejected') {
    const note = decision === 'rejected' ? window.prompt('Short note for the student:', 'School ID could not be confirmed.') ?? '' : '';
    if (decision === 'rejected' && !note.trim()) return;
    setBusy(`id-${item.user_id}`);
    try {
      await reviewSchoolVerification(item.user_id, decision, note);
      setNotice(decision === 'verified' ? 'School ID verified.' : 'School ID rejected with a note.');
      await reload();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not review this ID.');
    } finally { setBusy(''); }
  }

  async function updateReport(report: SafetyReportForModeration, status: 'reviewing' | 'resolved' | 'dismissed') {
    const note = status === 'reviewing' ? '' : window.prompt('Internal resolution note (optional):', '') ?? '';
    setBusy(`report-${report.id}`);
    try {
      await reviewSafetyReport(report.id, status, note);
      setNotice(`Report marked ${status}.`);
      await reload();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not update this report.');
    } finally { setBusy(''); }
  }

  async function decideRequest(request: AspireRequest, decision: 'approved' | 'rejected') {
    const defaultNote = decision === 'rejected' ? 'Does not meet Aspire Community Guidelines.' : '';
    const note = decision === 'rejected' ? window.prompt('Why are you rejecting this post?', defaultNote) ?? '' : '';
    if (decision === 'rejected' && !note.trim()) return;
    setBusy(`moderate-${request.id}`);
    try {
      await reviewRequestModeration(request.id, decision, note);
      setNotice(decision === 'approved' ? 'Post approved and now eligible for Discover.' : 'Post rejected and kept out of Discover.');
      await reload();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not review this post.');
    } finally { setBusy(''); }
  }

  async function removeRequest(request: AspireRequest) {
    const reason = window.prompt('Why are you removing this request?', 'Violates Community Guidelines');
    if (!reason?.trim()) return;
    setBusy(`request-${request.id}`);
    try {
      await removeRequestAsModerator(request.id, reason);
      setNotice('Request removed from active campus feeds.');
      await reload();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not remove this request.');
    } finally { setBusy(''); }
  }

  async function changeModerator(enabled: boolean) {
    if (!teamEmail.trim()) return;
    setBusy('team');
    try {
      await setModeratorByEmail(teamEmail, enabled);
      setNotice(enabled ? `Moderator access granted to ${teamEmail.trim()}.` : `Moderator access removed from ${teamEmail.trim()}.`);
      setTeamEmail('');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not change moderator access.');
    } finally { setBusy(''); }
  }

  function grantModerator(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void changeModerator(true);
  }

  if (loading) return <AppLoader label="Opening moderation…" detail="Trust + safety queue" />;

  return (
    <main className="moderatorPage moderatorPagePolished">
      <div className="moderatorShell">
        <header className="moderatorTop moderatorTopPolished">
          <div>
            <span>CLOUDORA LABS, INC. · ASPIRE 101</span>
            <div className="moderatorTitleRow"><h1>Trust &amp; Safety</h1><b>{role.toUpperCase()}</b></div>
            <p>New posts do not enter Discover until they pass the review gate. Automated policy checks block obvious abusive language first; human reviewers handle the remaining context.</p>
          </div>
          <a href="/profile">Back to profile →</a>
        </header>

        <section className="moderatorOverview" aria-label="Moderation overview">
          <article className={pendingRequests.length ? 'attention' : ''}><span>PENDING POSTS</span><strong>{pendingRequests.length}</strong><small>Not public yet</small></article>
          <article><span>PENDING IDS</span><strong>{pendingIds.length}</strong><small>Manual exceptions</small></article>
          <article className={openReports.length ? 'attention' : ''}><span>OPEN REPORTS</span><strong>{openReports.length}</strong><small>Need review</small></article>
          <article className="role"><span>YOUR ACCESS</span><strong>{role === 'admin' ? 'Admin' : 'Moderator'}</strong><small>{role === 'admin' ? 'Can manage moderators' : 'Review access only'}</small></article>
        </section>

        <nav className="moderatorTabs" aria-label="Moderation sections">
          <button className={tab === 'requests' ? 'active' : ''} onClick={() => setTab('requests')} type="button">Posts <b>{pendingRequests.length}</b></button>
          <button className={tab === 'ids' ? 'active' : ''} onClick={() => setTab('ids')} type="button">School IDs <b>{pendingIds.length}</b></button>
          <button className={tab === 'reports' ? 'active' : ''} onClick={() => setTab('reports')} type="button">Safety <b>{openReports.length}</b></button>
          {role === 'admin' && <button className={tab === 'team' ? 'active' : ''} onClick={() => setTab('team')} type="button">Team</button>}
        </nav>

        {notice && <div className="moderatorNotice" role="status">{notice}</div>}

        {tab === 'requests' && (
          <section className="moderatorPanel">
            <div className="moderatorPanelHead"><div><span>CONTENT REVIEW GATE</span><h2>Posts</h2></div><p>Pending posts are visible to their author and moderators, but not to the campus Discover feed. Approve only content that is appropriate, lawful, and consistent with Aspire rules.</p></div>
            <div className="moderatorList">
              {!activeRequests.length && <div className="moderatorEmpty"><i>✓</i><strong>Post queue is clear.</strong><span>New submissions will appear here before they can go public.</span></div>}
              {activeRequests
                .slice()
                .sort((a, b) => Number(b.moderation_status === 'pending') - Number(a.moderation_status === 'pending'))
                .map((request) => {
                  const pending = request.moderation_status === 'pending';
                  const flags = request.moderation_flags ?? [];
                  return (
                    <article className={`moderatorRow ${pending ? 'attention' : ''}`} key={request.id}>
                      <div className="moderatorRowMain">
                        <span>{moderationLabel(request)} · {request.category.toUpperCase()} · {request.kind.replace('_', ' ').toUpperCase()}</span>
                        <strong>{request.title}</strong>
                        {request.details && <p>{request.details}</p>}
                        <small>{request.campus || 'Campus'} · {when(request.created_at)} · {request.status}{flags.length ? ` · AUTO FLAGS: ${flags.join(', ')}` : ''}</small>
                      </div>
                      <div className="moderatorRowActions">
                        {pending ? <>
                          <button type="button" className="moderatorReject" onClick={() => decideRequest(request, 'rejected')} disabled={busy === `moderate-${request.id}`}>Reject</button>
                          <button type="button" className="button buttonGold" onClick={() => decideRequest(request, 'approved')} disabled={busy === `moderate-${request.id}`}>{busy === `moderate-${request.id}` ? 'Saving…' : 'Approve ✓'}</button>
                        </> : <>
                          <a href="/discover" target="_blank" rel="noreferrer">Open</a>
                          {request.moderation_status === 'approved' && <button type="button" className="moderatorReject" onClick={() => removeRequest(request)} disabled={busy === `request-${request.id}`}>Remove</button>}
                        </>}
                      </div>
                    </article>
                  );
                })}
            </div>
          </section>
        )}

        {tab === 'ids' && (
          <section className="moderatorPanel">
            <div className="moderatorPanelHead"><div><span>VERIFICATION EXCEPTIONS</span><h2>School IDs</h2></div><p>Most students should verify through an approved university email. Manual ID review is the fallback, not the default.</p></div>
            <div className="moderatorList">
              {!pendingIds.length && <div className="moderatorEmpty"><i>✓</i><strong>Verification queue is clear.</strong><span>No manual school IDs are waiting for review.</span></div>}
              {pendingIds.map((item) => (
                <article className="moderatorRow" key={item.user_id}>
                  <div className="moderatorRowMain"><span>{item.school} · MANUAL ID</span><strong>{item.student_id}</strong><small>User {item.user_id.slice(0, 8)} · submitted {when(item.submitted_at)}</small></div>
                  <div className="moderatorRowActions"><button type="button" className="moderatorReject" onClick={() => decideId(item, 'rejected')} disabled={busy === `id-${item.user_id}`}>Reject</button><button type="button" className="button buttonGold" onClick={() => decideId(item, 'verified')} disabled={busy === `id-${item.user_id}`}>{busy === `id-${item.user_id}` ? 'Saving…' : 'Verify ✓'}</button></div>
                </article>
              ))}
            </div>
          </section>
        )}

        {tab === 'reports' && (
          <section className="moderatorPanel">
            <div className="moderatorPanelHead"><div><span>SAFETY QUEUE</span><h2>Reports</h2></div><p>Review platform records and submitted context. Aspire should not claim it can independently verify everything that happens offline.</p></div>
            <div className="moderatorList">
              {!openReports.length && <div className="moderatorEmpty"><i>✓</i><strong>No open safety reports.</strong><span>New reports that need human judgment will appear here.</span></div>}
              {openReports.map((report) => (
                <article className="moderatorRow moderatorReportRow" key={report.id}>
                  <div className="moderatorRowMain"><span>{report.reason.toUpperCase()} · {report.status.toUpperCase()}</span><strong>{report.details || 'No additional details.'}</strong><small>Report {report.id.slice(0, 8)} · {when(report.created_at)}</small></div>
                  <div className="moderatorRowActions"><button type="button" onClick={() => updateReport(report, 'reviewing')} disabled={busy === `report-${report.id}`}>Reviewing</button><button type="button" className="moderatorReject" onClick={() => updateReport(report, 'dismissed')} disabled={busy === `report-${report.id}`}>Dismiss</button><button type="button" className="button buttonGold" onClick={() => updateReport(report, 'resolved')} disabled={busy === `report-${report.id}`}>Resolve</button></div>
                </article>
              ))}
            </div>
          </section>
        )}

        {tab === 'team' && role === 'admin' && (
          <section className="moderatorPanel moderatorTeamPanel">
            <div className="moderatorPanelHead"><div><span>ADMIN ONLY</span><h2>Moderator access</h2></div><p>Only grant this role to people you trust with verification exceptions, safety reports, content review, and enforcement actions.</p></div>
            <form className="moderatorTeamForm" onSubmit={grantModerator}>
              <label><span>Existing Aspire account email</span><input type="email" value={teamEmail} onChange={(event) => setTeamEmail(event.target.value)} placeholder="moderator@school.edu" required /></label>
              <div><button className="button buttonGold" type="submit" disabled={busy === 'team'}>{busy === 'team' ? 'Saving…' : 'Grant moderator'}</button><button className="moderatorReject" type="button" onClick={() => void changeModerator(false)} disabled={busy === 'team' || !teamEmail.trim()}>Remove moderator</button></div>
            </form>
          </section>
        )}

        <footer className="moderatorOperator">Internal operations · Aspire 101 · Cloudora Labs, Inc.</footer>
      </div>
      <AppDock active="profile" />
    </main>
  );
}
