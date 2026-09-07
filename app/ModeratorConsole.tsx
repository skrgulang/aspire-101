'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AppRole,
  fetchEnforcementStates,
  fetchMyRole,
  fetchRequestsForModeration,
  fetchSafetyReportsForModeration,
  fetchVerificationQueue,
  removeRequestAsModerator,
  reviewRequestModeration,
  reviewSafetyReport,
  reviewSchoolVerification,
  runRequestAiSafety,
  SafetyReportForModeration,
  SchoolVerification,
  setModeratorByEmail,
  setUserEnforcement,
  UserEnforcementState
} from '../lib/supabase/trust';
import type { AspireRequest } from '../lib/supabase/requests';
import { fetchRequestMedia, RequestMedia } from '../lib/supabase/requestMedia';
import AppDock from './AppDock';
import AppLoader from './AppLoader';

type Tab = 'ids' | 'reports' | 'requests' | 'team';

function when(value: string) {
  return new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function moderationLabel(request: AspireRequest) {
  return (request.moderation_status || 'approved').toUpperCase();
}

function riskLabel(request: AspireRequest) {
  const level = request.ai_risk_level || 'unknown';
  if (request.ai_moderation_status === 'scanning') return 'SCANNING';
  if (request.ai_moderation_status === 'error') return 'AI UNAVAILABLE';
  if (level === 'unknown') return 'NOT SCANNED';
  return `${level.toUpperCase()} · ${request.ai_risk_score ?? 0}/100`;
}

function effectiveEnforcement(item?: UserEnforcementState) {
  if (!item) return 'active' as const;
  if (item.expires_at && new Date(item.expires_at).getTime() <= Date.now()) return 'active' as const;
  return item.state;
}

export default function ModeratorConsole() {
  const router = useRouter();
  const [role, setRole] = useState<AppRole>('member');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('requests');
  const [verifications, setVerifications] = useState<SchoolVerification[]>([]);
  const [reports, setReports] = useState<SafetyReportForModeration[]>([]);
  const [requests, setRequests] = useState<AspireRequest[]>([]);
  const [requestMedia, setRequestMedia] = useState<RequestMedia[]>([]);
  const [enforcementStates, setEnforcementStates] = useState<UserEnforcementState[]>([]);
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
      const userIds = [...new Set(activeRequests.map((request) => request.poster_id))];
      const [media, enforcements] = await Promise.all([
        fetchRequestMedia(activeRequests.map((request) => request.id)).catch(() => [] as RequestMedia[]),
        fetchEnforcementStates(userIds).catch(() => [] as UserEnforcementState[])
      ]);
      setVerifications(ids);
      setReports(safety);
      setRequests(activeRequests);
      setRequestMedia(media);
      setEnforcementStates(enforcements);
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
  const highRiskRequests = useMemo(() => pendingRequests.filter((request) =>
    request.ai_risk_level === 'high' || request.ai_risk_level === 'critical' || (request.behavior_risk_score ?? 0) >= 60
  ), [pendingRequests]);
  const activeRequests = useMemo(() => requests.filter((request) => ['open', 'matched', 'in_progress'].includes(request.status)), [requests]);
  const mediaMap = useMemo(() => {
    const map = new Map<string, RequestMedia[]>();
    requestMedia.forEach((media) => {
      const current = map.get(media.request_id) ?? [];
      current.push(media);
      map.set(media.request_id, current);
    });
    return map;
  }, [requestMedia]);
  const enforcementMap = useMemo(() => new Map(enforcementStates.map((item) => [item.user_id, item])), [enforcementStates]);

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

  async function scanRequest(request: AspireRequest) {
    setBusy(`ai-${request.id}`);
    try {
      const result = await runRequestAiSafety(request.id);
      const trust = result.trustBand ? ` · trust ${result.trustBand} ${result.trustScore ?? '—'}/100` : '';
      setNotice(`Safety Intelligence: ${result.riskLevel.toUpperCase()} risk · ${result.riskScore}/100 · ${result.recommendedAction}${trust}.`);
      await reload();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not run the AI safety scan. Human review is still available.');
      await reload();
    } finally { setBusy(''); }
  }

  async function changeEnforcement(request: AspireRequest, next: 'active' | 'restricted' | 'suspended') {
    const current = effectiveEnforcement(enforcementMap.get(request.poster_id));
    if (current === next) return;
    let reason = 'Restored by Trust & Safety review.';
    let expiresAt: string | null = null;
    if (next === 'restricted') {
      reason = window.prompt('Reason for a 7-day account restriction:', 'Repeated policy or scam-risk signals require additional review.') ?? '';
      if (!reason.trim()) return;
      expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    } else if (next === 'suspended') {
      reason = window.prompt('Reason for suspension:', 'Serious or repeated Community Guidelines violations.') ?? '';
      if (!reason.trim()) return;
      if (!window.confirm('Suspend this account from new posts, responses, and private messages? This action is audited.')) return;
    } else if (!window.confirm('Restore this account to active status? This action is audited.')) {
      return;
    }

    setBusy(`enforce-${request.poster_id}`);
    try {
      await setUserEnforcement(request.poster_id, next, reason, expiresAt);
      setNotice(next === 'active' ? 'Account restored.' : next === 'restricted' ? 'Account restricted for 7 days.' : 'Account suspended.');
      await reload();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not update account enforcement.');
    } finally { setBusy(''); }
  }

  async function decideRequest(request: AspireRequest, decision: 'approved' | 'rejected') {
    const highAi = request.ai_risk_level === 'high' || request.ai_risk_level === 'critical';
    const highBehavior = (request.behavior_risk_score ?? 0) >= 60;
    if (decision === 'approved' && (highAi || highBehavior)) {
      const warning = highAi
        ? `Aspire Safety Intelligence marked this ${request.ai_risk_level?.toUpperCase()} risk (${request.ai_risk_score ?? 0}/100).`
        : `Aspire Scam Intelligence marked unusual account behavior (${request.behavior_risk_score ?? 0}/100).`;
      if (!window.confirm(`${warning} Approve anyway? This override is audited.`)) return;
    }
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
            <p>Every post stays private until a reviewer approves it. Safety Intelligence checks content; Scam Intelligence adds posting velocity, duplicate behavior, price anomalies, prior enforcement, and an internal trust history. Account restrictions always require a human action.</p>
          </div>
          <a href="/profile">Back to profile →</a>
        </header>

        <section className="moderatorOverview" aria-label="Moderation overview">
          <article className={pendingRequests.length ? 'attention' : ''}><span>PENDING POSTS</span><strong>{pendingRequests.length}</strong><small>{highRiskRequests.length ? `${highRiskRequests.length} high-risk review` : 'Not public yet'}</small></article>
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
            <div className="moderatorPanelHead"><div><span>ASPIRE SAFETY + SCAM INTELLIGENCE</span><h2>Posts</h2></div><p>AI scores text and images. Aspire-specific checks add scam language, off-platform payment, duplicate/burst posting, price anomalies, and internal trust context. Humans still make publication and account-enforcement decisions.</p></div>
            <div className="moderatorList">
              {!activeRequests.length && <div className="moderatorEmpty"><i>✓</i><strong>Post queue is clear.</strong><span>New submissions will appear here before they can go public.</span></div>}
              {activeRequests
                .slice()
                .sort((a, b) => {
                  const priority = (item: AspireRequest) => {
                    const ai = item.ai_risk_level === 'critical' ? 100 : item.ai_risk_level === 'high' ? 80 : item.ai_risk_level === 'medium' ? 40 : 0;
                    return Math.max(ai, item.behavior_risk_score ?? 0, item.moderation_status === 'pending' ? 10 : 0);
                  };
                  return priority(b) - priority(a);
                })
                .map((request) => {
                  const pending = request.moderation_status === 'pending';
                  const ruleFlags = request.moderation_flags ?? [];
                  const aiFlags = request.ai_policy_flags ?? [];
                  const behaviorFlags = request.behavior_flags ?? [];
                  const photos = mediaMap.get(request.id) ?? [];
                  const risk = request.ai_risk_level || 'unknown';
                  const allSignals = [...new Set([...aiFlags, ...ruleFlags, ...behaviorFlags])];
                  const enforcement = enforcementMap.get(request.poster_id);
                  const enforcementState = effectiveEnforcement(enforcement);
                  return (
                    <article className={`moderatorRow moderatorContentRow ${pending ? 'attention' : ''} risk-${risk}`} key={request.id}>
                      <div className="moderatorRowMain">
                        <div className="moderatorContentMeta">
                          <span>{moderationLabel(request)} · {request.category.toUpperCase()} · {request.kind.replace('_', ' ').toUpperCase()}</span>
                          <b className={`aiRiskBadge risk-${risk}`}>{riskLabel(request)}</b>
                        </div>
                        <strong>{request.title}</strong>
                        {request.details && <p>{request.details}</p>}
                        {photos.length > 0 && <div className="moderatorMediaStrip" aria-label={`${photos.length} submitted photo${photos.length === 1 ? '' : 's'}`}>{photos.map((photo, index) => photo.public_url ? <a href={photo.public_url} target="_blank" rel="noreferrer" key={photo.id}><img src={photo.public_url} alt={`Submitted request photo ${index + 1}`} /></a> : null)}</div>}
                        <div className="scamContextRow">
                          <span><b>TRUST</b>{request.trust_band_snapshot ? `${request.trust_band_snapshot.toUpperCase()} · ${request.trust_score_snapshot ?? '—'}/100` : 'NOT SCORED'}</span>
                          <span><b>BEHAVIOR</b>{request.behavior_risk_score ?? 0}/100</span>
                          <span><b>SIGNALS</b>{behaviorFlags.length ? `${behaviorFlags.length} DETECTED` : 'NORMAL'}</span>
                          <span className={`enforcement-${enforcementState}`}><b>ACCOUNT</b>{enforcementState.toUpperCase()}</span>
                        </div>
                        <div className="aiSafetyPanel">
                          <div><span>AI RECOMMENDATION</span><strong>{(request.ai_recommended_action || 'review').toUpperCase()}</strong></div>
                          <p>{request.ai_summary || 'No AI assessment yet. Scam rules and human review can still continue.'}</p>
                          {allSignals.length > 0 && <small>Signals: {allSignals.join(' · ')}</small>}
                        </div>
                        <div className="enforcementBar">
                          <div><span>HUMAN ENFORCEMENT</span><strong>{enforcementState === 'active' ? 'No account restriction' : enforcement?.reason || enforcementState}</strong>{enforcement?.expires_at && enforcementState !== 'active' && <small>Expires {when(enforcement.expires_at)}</small>}</div>
                          <div>
                            {enforcementState === 'active' ? <>
                              <button type="button" onClick={() => changeEnforcement(request, 'restricted')} disabled={busy === `enforce-${request.poster_id}`}>Restrict 7d</button>
                              <button type="button" className="moderatorReject" onClick={() => changeEnforcement(request, 'suspended')} disabled={busy === `enforce-${request.poster_id}`}>Suspend</button>
                            </> : <>
                              <button type="button" onClick={() => changeEnforcement(request, 'active')} disabled={busy === `enforce-${request.poster_id}`}>Restore</button>
                              {enforcementState === 'restricted' && <button type="button" className="moderatorReject" onClick={() => changeEnforcement(request, 'suspended')} disabled={busy === `enforce-${request.poster_id}`}>Suspend</button>}
                            </>}
                          </div>
                        </div>
                        <small>{request.campus || 'Campus'} · {when(request.created_at)} · {request.status}{request.ai_last_scanned_at ? ` · AI scanned ${when(request.ai_last_scanned_at)}` : ''}</small>
                      </div>
                      <div className="moderatorRowActions moderatorAiActions">
                        <button type="button" onClick={() => scanRequest(request)} disabled={busy === `ai-${request.id}`}>{busy === `ai-${request.id}` ? 'Scanning…' : request.ai_moderation_status === 'complete' ? 'Rescan AI' : 'Run AI scan'}</button>
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
