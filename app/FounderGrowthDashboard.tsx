'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import { fetchMyRole } from '../lib/supabase/trust';
import AppLoader from './AppLoader';

type DailyPoint = { date:string; dau:number; signups:number; posts:number; responses:number; connections:number; payments:number; processedVolumeCents:number; uniqueSessions:number; pageViews:number; clicks:number; ctrBps:number; signupViews:number; signupStarts:number; signupCompletions:number; signupRateBps:number };
type ClickPoint = { target:string; clicks:number; uniqueSessions:number };
type CampusRegistration = { campus:string; users:number };
type RecentUser = { email:string; displayName:string|null; school:string|null; createdAt:string; emailConfirmed:boolean };
type Metrics = {
  generatedAt:string; todayDau:number; yesterdayDau:number; wau:number; mau:number; newUsersToday:number; totalUsers:number; verifiedStudents:number;
  postsToday:number; responsesToday:number; connectionsToday:number; successfulTransactionsToday:number; gmvCentsToday:number; platformFeeRevenueCentsToday:number; takeRateBpsToday:number;
  uniqueSessionsToday:number; pageViewsToday:number; trackedClicksToday:number; uniqueClickSessionsToday:number; clickThroughRateBpsToday:number;
  signupViewsToday:number; signupStartsToday:number; signupCompletionsToday:number; signupRateBpsToday:number;
  daily:DailyPoint[]; topClicksToday:ClickPoint[]; campusRegistrations:CampusRegistration[]; recentUsers:RecentUser[];
};

const n = (value:unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const pct = (bps:number) => `${(bps / 100).toFixed(1)}%`;
const money = (cents:number) => new Intl.NumberFormat(undefined,{style:'currency',currency:'USD'}).format(cents/100);
const day = (value:string) => new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined,{month:'short',day:'numeric',timeZone:'UTC'});
const clickLabel = (value:string) => value.replace(/^nav_/,'').replaceAll('_',' ').replace(/\b\w/g,(c)=>c.toUpperCase());

function normalize(raw:any):Metrics {
  return {
    generatedAt:String(raw?.generatedAt || new Date().toISOString()), todayDau:n(raw?.todayDau), yesterdayDau:n(raw?.yesterdayDau), wau:n(raw?.wau), mau:n(raw?.mau), newUsersToday:n(raw?.newUsersToday), totalUsers:n(raw?.totalUsers), verifiedStudents:n(raw?.verifiedStudents),
    postsToday:n(raw?.postsToday), responsesToday:n(raw?.responsesToday), connectionsToday:n(raw?.connectionsToday), successfulTransactionsToday:n(raw?.successfulTransactionsToday), gmvCentsToday:n(raw?.gmvCentsToday), platformFeeRevenueCentsToday:n(raw?.platformFeeRevenueCentsToday), takeRateBpsToday:n(raw?.takeRateBpsToday),
    uniqueSessionsToday:n(raw?.uniqueSessionsToday), pageViewsToday:n(raw?.pageViewsToday), trackedClicksToday:n(raw?.trackedClicksToday), uniqueClickSessionsToday:n(raw?.uniqueClickSessionsToday), clickThroughRateBpsToday:n(raw?.clickThroughRateBpsToday), signupViewsToday:n(raw?.signupViewsToday), signupStartsToday:n(raw?.signupStartsToday), signupCompletionsToday:n(raw?.signupCompletionsToday), signupRateBpsToday:n(raw?.signupRateBpsToday),
    daily:Array.isArray(raw?.daily)?raw.daily.map((x:any)=>({date:String(x.date),dau:n(x.dau),signups:n(x.signups),posts:n(x.posts),responses:n(x.responses),connections:n(x.connections),payments:n(x.payments),processedVolumeCents:n(x.processedVolumeCents),uniqueSessions:n(x.uniqueSessions),pageViews:n(x.pageViews),clicks:n(x.clicks),ctrBps:n(x.ctrBps),signupViews:n(x.signupViews),signupStarts:n(x.signupStarts),signupCompletions:n(x.signupCompletions),signupRateBps:n(x.signupRateBps)})):[],
    topClicksToday:Array.isArray(raw?.topClicksToday)?raw.topClicksToday.map((x:any)=>({target:String(x.target||'other'),clicks:n(x.clicks),uniqueSessions:n(x.uniqueSessions)})):[],
    campusRegistrations:Array.isArray(raw?.campusRegistrations)?raw.campusRegistrations.map((x:any)=>({campus:String(x.campus||'Unknown'),users:n(x.users)})):[],
    recentUsers:Array.isArray(raw?.recentUsers)?raw.recentUsers.map((x:any)=>({email:String(x.email||''),displayName:x.displayName?String(x.displayName):null,school:x.school?String(x.school):null,createdAt:String(x.createdAt||''),emailConfirmed:Boolean(x.emailConfirmed)})):[]
  };
}

export default function FounderGrowthDashboard(){
  const router=useRouter(); const [days,setDays]=useState(30); const [metrics,setMetrics]=useState<Metrics|null>(null); const [loading,setLoading]=useState(true); const [refreshing,setRefreshing]=useState(false); const [error,setError]=useState('');
  const load=useCallback(async(quiet=false)=>{ quiet?setRefreshing(true):setLoading(true); setError(''); try{ if(await fetchMyRole()!=='admin'){router.replace('/profile');return;} const supabase=getSupabaseBrowserClient(); const {data,error}=await supabase.rpc('admin_activity_metrics',{p_days:days}); if(error)throw error; setMetrics(normalize(data)); }catch(e){setError(e instanceof Error?e.message:'Could not load growth metrics.');}finally{setLoading(false);setRefreshing(false);}},[days,router]);
  useEffect(()=>{void load(); const timer=window.setInterval(()=>void load(true),60000); return()=>window.clearInterval(timer);},[load]);
  const maxDau=useMemo(()=>Math.max(1,...(metrics?.daily.map(x=>x.dau)??[1])),[metrics]);
  if(loading&&!metrics)return <AppLoader label="Opening founder monitor…" detail="DAU · CTR · signup conversion"/>;
  const dauDelta=metrics?metrics.todayDau-metrics.yesterdayDau:0;
  return <main className="founderMonitor"><div className="founderWrap">
    <header className="founderHead"><div><span>ASPIRE 101 · PRIVATE BETA</span><h1>Founder Growth Monitor</h1><p>DAU, click-through, signup conversion, campus growth, marketplace activity, and recent registrations. Analytics stores only coarse product surfaces + named actions with a random browser session ID — no IP, device fingerprint, message content, card number, or bank details.</p></div><button onClick={()=>void load(true)} disabled={refreshing}>{refreshing?'Refreshing…':'Refresh'}</button></header>
    {error&&<div className="founderError">{error}</div>}
    {metrics&&<>
      <section className="founderKpis">
        <article className="hero"><span>DAU TODAY</span><strong>{metrics.todayDau}</strong><small>{dauDelta>=0?'+':''}{dauDelta} vs yesterday · WAU {metrics.wau} · MAU {metrics.mau}</small></article>
        <article><span>CLICK RATE</span><strong>{pct(metrics.clickThroughRateBpsToday)}</strong><small>{metrics.uniqueClickSessionsToday}/{metrics.uniqueSessionsToday} sessions clicked a tracked CTA</small></article>
        <article><span>SIGNUP RATE</span><strong>{pct(metrics.signupRateBpsToday)}</strong><small>{metrics.signupCompletionsToday}/{metrics.signupViewsToday} signup-page sessions converted</small></article>
        <article><span>SESSIONS</span><strong>{metrics.uniqueSessionsToday}</strong><small>{metrics.pageViewsToday} page views · {metrics.trackedClicksToday} tracked clicks</small></article>
        <article><span>NEW USERS</span><strong>{metrics.newUsersToday}</strong><small>{metrics.totalUsers} total · {metrics.verifiedStudents} email verified</small></article>
        <article><span>NETWORK ACTIONS</span><strong>{metrics.postsToday+metrics.responsesToday}</strong><small>{metrics.postsToday} posts · {metrics.responsesToday} interests · {metrics.connectionsToday} connections</small></article>
        <article><span>GMV / GTV</span><strong>{money(metrics.gmvCentsToday)}</strong><small>{metrics.successfulTransactionsToday} successful transactions</small></article>
        <article><span>TAKE RATE</span><strong>{pct(metrics.takeRateBpsToday)}</strong><small>{money(metrics.platformFeeRevenueCentsToday)} platform fees</small></article>
      </section>

      <section className="founderPanel"><div className="panelTop"><div><span>ENGAGEMENT</span><h2>Daily active users</h2></div><div>{[14,30,60,90].map(v=><button className={days===v?'active':''} key={v} onClick={()=>setDays(v)}>{v}D</button>)}</div></div><div className="bars">{metrics.daily.map(x=><div key={x.date} title={`${day(x.date)} · ${x.dau} DAU`}><i><b style={{height:`${Math.max(x.dau?8:2,(x.dau/maxDau)*100)}%`}}/></i><strong>{x.dau}</strong><span>{day(x.date)}</span></div>)}</div></section>

      <div className="founderTwoCol">
        <section className="founderPanel"><div className="panelTop"><div><span>CONVERSION FUNNEL</span><h2>Last 14 days</h2></div><small>UTC</small></div><div className="tableWrap"><table><thead><tr><th>Date</th><th>DAU</th><th>Sessions</th><th>Clicks</th><th>CTR</th><th>Signup views</th><th>Signups</th><th>Signup rate</th><th>Posts</th><th>Interests</th></tr></thead><tbody>{metrics.daily.slice(-14).reverse().map(x=><tr key={x.date}><td>{day(x.date)}</td><td><b>{x.dau}</b></td><td>{x.uniqueSessions}</td><td>{x.clicks}</td><td>{pct(x.ctrBps)}</td><td>{x.signupViews}</td><td>{x.signupCompletions}</td><td>{pct(x.signupRateBps)}</td><td>{x.posts}</td><td>{x.responses}</td></tr>)}</tbody></table></div></section>
        <section className="founderPanel"><div className="panelTop"><div><span>CLICK MAP</span><h2>Top actions today</h2></div><small>tracked CTAs</small></div><div className="clickList">{metrics.topClicksToday.length?metrics.topClicksToday.map(x=><div key={x.target}><span><b>{clickLabel(x.target)}</b><small>{x.uniqueSessions} unique sessions</small></span><strong>{x.clicks}</strong></div>):<p>No tracked clicks yet. Metrics begin after this analytics build is deployed.</p>}</div></section>
      </div>

      <div className="founderTwoCol bottom">
        <section className="founderPanel"><div className="panelTop"><div><span>REGISTRATIONS</span><h2>Users by campus</h2></div><small>all accounts</small></div><div className="clickList">{metrics.campusRegistrations.map(x=><div key={x.campus}><span><b>{x.campus}</b></span><strong>{x.users}</strong></div>)}</div></section>
        <section className="founderPanel"><div className="panelTop"><div><span>RECENT USERS</span><h2>Latest registrations</h2></div><small>admin only</small></div><div className="recentUsers">{metrics.recentUsers.map(x=><div key={`${x.email}-${x.createdAt}`}><span><b>{x.displayName||x.email}</b><small>{x.email} · {x.school||'School not set'}</small></span><em className={x.emailConfirmed?'ok':''}>{x.emailConfirmed?'Verified':'Pending'}</em></div>)}</div></section>
      </div>
      <footer>Updated {new Date(metrics.generatedAt).toLocaleString()} · CTR = unique sessions with a tracked CTA click ÷ unique page-view sessions. Signup rate = accounts created ÷ unique signup-page sessions after analytics tracking starts.</footer>
    </>}
    <style jsx>{styles}</style>
  </div></main>;
}

const styles=`
.founderMonitor{min-height:100vh;background:#080705;color:#fffaf0;padding:52px 20px 100px}.founderWrap{max-width:1280px;margin:auto}.founderHead{display:flex;justify-content:space-between;gap:34px;align-items:flex-end}.founderHead span,.panelTop span{color:#ffc21c;font-size:9px;font-weight:900;letter-spacing:.14em}.founderHead h1{margin:9px 0 10px;font-size:clamp(42px,6vw,76px);letter-spacing:-.06em}.founderHead p{max-width:850px;color:#928a7d;line-height:1.6;font-size:13px}.founderHead>button,.panelTop button{border:1px solid rgba(255,255,255,.1);background:#11100c;color:#d6cebf;border-radius:12px;padding:11px 15px;font-weight:800}.founderError{margin:18px 0;padding:13px;border:1px solid rgba(255,100,100,.25);border-radius:12px;color:#f3a3a3}.founderKpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:28px}.founderKpis article{min-height:145px;padding:20px;border:1px solid rgba(255,255,255,.08);border-radius:18px;background:#0e0d09}.founderKpis article.hero{border-color:rgba(255,194,28,.3);background:linear-gradient(145deg,rgba(255,194,28,.12),#0e0d09)}.founderKpis span{color:#81796d;font-size:8px;font-weight:900;letter-spacing:.12em}.founderKpis strong{display:block;margin-top:17px;font-size:38px;letter-spacing:-.05em}.founderKpis small{display:block;margin-top:8px;color:#777064;font-size:9px;line-height:1.45}.founderPanel{margin-top:12px;padding:20px;border:1px solid rgba(255,255,255,.08);border-radius:20px;background:#0d0c09}.panelTop{display:flex;align-items:flex-end;justify-content:space-between;gap:18px}.panelTop h2{margin:5px 0 0;font-size:24px}.panelTop>div:last-child{display:flex;gap:5px}.panelTop button{padding:7px 10px;font-size:9px;cursor:pointer}.panelTop button.active{background:#ffc21c;color:#111;border-color:#ffc21c}.panelTop small{color:#6f685d;font-size:9px}.bars{height:210px;margin-top:24px;display:flex;gap:7px;align-items:flex-end;overflow-x:auto}.bars>div{min-width:28px;flex:1;text-align:center}.bars i{height:150px;display:flex;align-items:flex-end;border-radius:8px;background:rgba(255,255,255,.025);overflow:hidden}.bars i b{width:100%;display:block;background:#ffc21c;border-radius:7px 7px 0 0}.bars strong{display:block;margin-top:6px;font-size:9px}.bars span{display:block;margin-top:3px;color:#625c53;font-size:7px}.founderTwoCol{display:grid;grid-template-columns:1.6fr .8fr;gap:12px}.founderTwoCol.bottom{grid-template-columns:.8fr 1.2fr}.tableWrap{overflow:auto;margin-top:17px}table{width:100%;border-collapse:collapse;white-space:nowrap}th,td{padding:10px 9px;border-bottom:1px solid rgba(255,255,255,.055);text-align:left;font-size:9px}th{color:#6e675d;font-size:7px;letter-spacing:.08em;text-transform:uppercase}td{color:#aaa194}.clickList,.recentUsers{display:grid;gap:7px;margin-top:15px}.clickList>div,.recentUsers>div{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:11px 12px;border:1px solid rgba(255,255,255,.055);border-radius:12px}.clickList b,.recentUsers b{font-size:10px}.clickList small,.recentUsers small{display:block;margin-top:3px;color:#6f685d;font-size:8px}.clickList strong{font-size:18px}.clickList p{color:#70695e;font-size:10px;line-height:1.5}.recentUsers em{font-style:normal;color:#81796d;font-size:8px}.recentUsers em.ok{color:#79d8a5}footer{margin-top:18px;color:#655f56;font-size:8px;line-height:1.5}
@media(max-width:900px){.founderKpis{grid-template-columns:repeat(2,1fr)}.founderTwoCol,.founderTwoCol.bottom{grid-template-columns:1fr}.founderHead{align-items:flex-start;flex-direction:column}.founderHead>button{width:100%}}
@media(max-width:520px){.founderMonitor{padding:24px 12px 90px}.founderKpis{grid-template-columns:1fr 1fr}.founderKpis article{min-height:130px;padding:15px}.founderKpis strong{font-size:30px}.founderPanel{padding:15px}.bars{height:180px}.bars i{height:120px}}
`;
