'use client';

import { useEffect, useMemo, useState } from 'react';
import AppDock from '../AppDock';
import UiIcon from '../UiIcon';
import { aspireLogo } from '../logo';
import styles from './demo.module.css';

type Scene = 'logo' | 'login' | 'home' | 'browse' | 'post' | 'connection' | 'chat' | 'complete' | 'circle';

type SceneMeta = {
  key: Scene;
  eyebrow: string;
  title: string;
  caption: string;
  active?: 'home' | 'discover' | 'post' | 'connections' | 'profile';
  unread?: number;
};

const scenes: SceneMeta[] = [
  { key: 'logo', eyebrow: 'ASPIRE 101', title: 'Ask campus. Feel at home.', caption: 'A real campus network, built around the things students actually need.' },
  { key: 'login', eyebrow: 'SIGN IN', title: 'One account. Your campus.', caption: 'Use a university account to enter your Aspire community.' },
  { key: 'home', eyebrow: 'HOME', title: 'Your campus at a glance.', caption: 'See what is happening, what people need, and where you can jump in.', active: 'home' },
  { key: 'browse', eyebrow: 'BROWSE', title: 'Find something worth joining.', caption: 'Requests are organized around real needs: rides, studying, activities, projects, and more.', active: 'discover' },
  { key: 'post', eyebrow: 'POST', title: 'Ask your campus.', caption: 'Turn a need into a clear request in a few seconds.', active: 'post' },
  { key: 'connection', eyebrow: 'CONNECT', title: 'Mutual choice before private chat.', caption: 'A requester chooses, the responder confirms, and only then does a private connection open.', active: 'connections', unread: 1 },
  { key: 'chat', eyebrow: 'INBOX', title: 'Coordinate privately.', caption: 'Keep the timing, place, scope, and money clear inside one connection.', active: 'connections', unread: 1 },
  { key: 'complete', eyebrow: 'COMPLETE', title: 'Close the loop together.', caption: 'Both students confirm the activity is finished before the request becomes read-only.', active: 'connections' },
  { key: 'circle', eyebrow: 'MY CIRCLE', title: 'One useful moment can become a real connection.', caption: 'If both people want to keep in touch, the relationship continues in My Circle.', active: 'connections' }
];

const browseCards = [
  ['Anyone want to go to CoRec together?', 'People · Today · Purdue', 'users'],
  ['Need a ride to Target after class', 'Rides · 18m ago · Purdue', 'car'],
  ['Math 55 study group tonight?', 'Study · 31m ago · Purdue', 'book'],
  ['Looking for a teammate for a weekend build', 'Projects · 1h ago · Purdue', 'code']
] as const;

export default function DemoWalkthrough() {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const scene = scenes[index];
  const progress = ((index + 1) / scenes.length) * 100;

  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => {
      setIndex((current) => {
        if (current >= scenes.length - 1) {
          setPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, scene.key === 'logo' ? 3000 : 5200);
    return () => window.clearTimeout(timer);
  }, [playing, index, scene.key]);

  const active = scene.active || 'home';
  const chromeTitle = useMemo(() => {
    if (scene.key === 'login') return 'Sign in · Aspire 101';
    if (scene.key === 'logo') return 'Aspire 101';
    return `${scene.title} · Aspire 101`;
  }, [scene]);

  function next() {
    setIndex((value) => Math.min(value + 1, scenes.length - 1));
  }

  function previous() {
    setIndex((value) => Math.max(value - 1, 0));
  }

  function restart() {
    setIndex(0);
    setPlaying(true);
  }

  return (
    <main className={styles.page}>
      <div className={styles.ambientOne} aria-hidden="true" />
      <div className={styles.ambientTwo} aria-hidden="true" />

      <header className={styles.demoHeader}>
        <a href="/" className={styles.demoBrand}><img src={aspireLogo} alt="" /><span>Aspire 101</span></a>
        <div className={styles.demoHeaderRight}>
          <span>Product walkthrough · Demo data only</span>
          <button type="button" onClick={() => setPlaying((value) => !value)}>{playing ? 'Pause' : 'Play 60s demo'}</button>
        </div>
      </header>

      <section className={styles.stageWrap}>
        <div className={styles.copyRail}>
          <p>{scene.eyebrow}</p>
          <h1>{scene.title}</h1>
          <span>{scene.caption}</span>
          <div className={styles.sceneDots} aria-label="Demo scenes">
            {scenes.map((item, itemIndex) => (
              <button key={item.key} className={itemIndex === index ? styles.dotActive : ''} onClick={() => setIndex(itemIndex)} aria-label={`Go to ${item.title}`} />
            ))}
          </div>
        </div>

        <div className={styles.perspective}>
          <div className={`${styles.device} ${scene.key === 'logo' ? styles.logoDevice : ''}`}>
            <div className={styles.browserTop}>
              <div className={styles.browserDots}><i /><i /><i /></div>
              <div className={styles.browserAddress}>aspires101.com</div>
              <span>{chromeTitle}</span>
            </div>
            <div className={styles.screen}>
              {scene.key === 'logo' ? <LogoScene /> : scene.key === 'login' ? <LoginScene /> : (
                <div className={styles.signedInFrame}>
                  <AppDock active={active} preview previewUnread={scene.unread || 0} />
                  <div className={styles.appViewport}>
                    {scene.key === 'home' && <HomeScene />}
                    {scene.key === 'browse' && <BrowseScene />}
                    {scene.key === 'post' && <PostScene />}
                    {scene.key === 'connection' && <ConnectionScene />}
                    {scene.key === 'chat' && <ChatScene />}
                    {scene.key === 'complete' && <CompleteScene />}
                    {scene.key === 'circle' && <CircleScene />}
                  </div>
                </div>
              )}
            </div>
            {scene.key !== 'logo' && <div className={`${styles.cursor} ${styles[`cursor_${scene.key}`] || ''}`}><span /></div>}
          </div>
          <div className={styles.deviceShadow} aria-hidden="true" />
        </div>
      </section>

      <footer className={styles.controls}>
        <div className={styles.progressTrack}><span style={{ width: `${progress}%` }} /></div>
        <button type="button" onClick={previous} disabled={index === 0}>← Previous</button>
        <strong>{String(index + 1).padStart(2, '0')} / {String(scenes.length).padStart(2, '0')}</strong>
        {index === scenes.length - 1
          ? <button type="button" onClick={restart}>Replay ↻</button>
          : <button type="button" onClick={next}>Next →</button>}
      </footer>
    </main>
  );
}

function LogoScene() {
  return (
    <div className={styles.logoScene}>
      <div className={styles.logoHalo} />
      <img src={aspireLogo} alt="Aspire 101" />
      <strong>ASPIRE 101</strong>
      <p>Ask campus. Feel at home.</p>
    </div>
  );
}

function LoginScene() {
  return (
    <div className={styles.loginScene}>
      <div className={styles.loginVisual}>
        <div className={styles.loginBrand}><img src={aspireLogo} alt="" /><span>Aspire 101</span></div>
        <p>WELCOME BACK</p>
        <h2>Your campus<br /><em>is still moving.</em></h2>
        <div className={styles.campusPhoto}>
          <img src="https://images.pexels.com/photos/7683692/pexels-photo-7683692.jpeg?auto=compress&cs=tinysrgb&w=1200" alt="" />
          <span>Purdue</span>
        </div>
        <div className={styles.loginSticker}>SAME CAMPUS.<br />REAL PEOPLE. ✓</div>
      </div>
      <div className={styles.loginCard}>
        <div className={styles.loginCardTop}><div><span>SIGN IN</span><h3>Good to see you.</h3></div><b>Sign up ↗</b></div>
        <label><span>Email</span><div className={styles.fakeInput}>student@demo.edu</div></label>
        <label><span>Password</span><div className={styles.fakeInput}>••••••••••••</div></label>
        <div className={styles.forgot}>Forgot password?</div>
        <button type="button">Sign in →</button>
        <small>Demo mode uses fictional data and never writes to production.</small>
      </div>
    </div>
  );
}

function AppTopbar({ title = 'Purdue community' }: { title?: string }) {
  return (
    <header className={styles.appTopbar}>
      <div className={styles.appBrand}><img src={aspireLogo} alt="" /><div><strong>Aspire 101</strong><span>{title}</span></div></div>
      <div className={styles.appSearch}><UiIcon name="search" /><span>Search requests, people, rides, items...</span></div>
      <div className={styles.appTopActions}><span>Purdue</span><i><UiIcon name="bell" /></i><b>A</b></div>
    </header>
  );
}

function HomeScene() {
  return (
    <div className={styles.demoAppPage}>
      <AppTopbar />
      <div className={styles.homeGrid}>
        <section className={styles.homeMain}>
          <div className={styles.homeHero}>
            <img src="https://images.pexels.com/photos/7683692/pexels-photo-7683692.jpeg?auto=compress&cs=tinysrgb&w=1400" alt="" />
            <div />
            <article><span>PURDUE · COMMUNITY</span><h2>Welcome back, Alex.</h2><p>Ask for help, find people, buy or sell nearby, join a ride, or start something with students around you.</p><button>+ Post something</button><button className={styles.ghostButton}>Browse campus</button></article>
          </div>
          <div className={styles.exploreCard}>
            <div className={styles.cardHeading}><div><span>EXPLORE</span><h3>What do you need?</h3></div><b>See everything →</b></div>
            <div className={styles.categoryRow}>
              {['Rides','Study','Gaming','Projects','People','Buy & Sell'].map((item, i) => <div key={item}><i>{['↗','B','G','<>','●','Tag'][i]}</i><strong>{item}</strong><span>{4 + i * 2} open</span></div>)}
            </div>
          </div>
        </section>
        <aside className={styles.profileMini}><div className={styles.profileTop}><b>A</b><div><span>WELCOME</span><strong>Alex Chen</strong></div></div><p>✓ Campus account</p><span>Purdue University</span><hr /><b>Quick actions</b><div className={styles.quickGrid}><span>+ Create post</span><span>⌕ Search campus</span><span>💬 Connections</span><span>◎ My account</span></div></aside>
      </div>
    </div>
  );
}

function BrowseScene() {
  return (
    <div className={styles.demoAppPage}>
      <AppTopbar title="Browse Purdue" />
      <div className={styles.browseShell}>
        <div className={styles.browseHeader}><div><span>DISCOVER</span><h2>What’s happening around campus?</h2><p>Real requests from students nearby.</p></div><button>Filters</button></div>
        <div className={styles.filterPills}><b>All</b><span>Rides</span><span>Study</span><span>People</span><span>Projects</span><span>Buy & Sell</span></div>
        <div className={styles.browseGrid}>
          {browseCards.map(([title, detail, icon], index) => <article key={title} className={index === 0 ? styles.featuredRequest : ''}><i><UiIcon name={icon} /></i><span>{detail}</span><h3>{title}</h3><p>{index === 0 ? 'Looking for someone to work out with after classes.' : 'A student near campus posted this recently.'}</p><footer><b>{index === 0 ? 'Alexis · Purdue' : 'Purdue student'}</b><button>View request →</button></footer></article>)}
        </div>
      </div>
    </div>
  );
}

function PostScene() {
  return (
    <div className={styles.demoAppPage}>
      <AppTopbar title="Create a request" />
      <div className={styles.postShell}>
        <div className={styles.postIntro}><span>POST TO YOUR CAMPUS</span><h2>What do you need?</h2><p>Be specific enough that the right person can say yes quickly.</p></div>
        <div className={styles.postGrid}>
          <section className={styles.postCard}>
            <label><span>Title</span><div className={styles.demoField}>Anyone want to go to CoRec together?</div></label>
            <div className={styles.twoFields}><label><span>Category</span><div className={styles.demoField}>People / Activity</div></label><label><span>When</span><div className={styles.demoField}>Today · 6:00 PM</div></label></div>
            <label><span>Details</span><div className={`${styles.demoField} ${styles.textarea}`}>Looking for someone to work out with after class. Meet at the main entrance.</div></label>
            <button type="button">Post request →</button>
          </section>
          <aside className={styles.postPreview}><span>LIVE PREVIEW</span><article><i><UiIcon name="users" /></i><b>PEOPLE · TODAY</b><h3>Anyone want to go to CoRec together?</h3><p>Looking for someone to work out with after class. Meet at the main entrance.</p><footer><span>Alex Chen</span><strong>Purdue</strong></footer></article></aside>
        </div>
      </div>
    </div>
  );
}

function ConnectionScene() {
  return (
    <div className={styles.demoAppPage}>
      <AppTopbar title="Your Aspire" />
      <div className={styles.connectionsShell}>
        <div className={styles.tabs}><span>My requests</span><b>Connections</b><span>My Circle</span></div>
        <article className={styles.connectionCard}>
          <span>CONNECTED</span>
          <h2>Anyone want to go to CoRec together?</h2>
          <div className={styles.personRow}><b>J</b><div><strong>Jamie Chen</strong><span>Purdue University</span></div></div>
          <div className={styles.connectionChecks}><span>Requester chose ✓</span><span>Responder confirmed ✓</span></div>
          <div className={styles.connectionButtons}><button>Open chat</button><button>Mark complete ✓</button><button className={styles.cancelButton}>Cancel</button></div>
        </article>
      </div>
    </div>
  );
}

function ChatScene() {
  return (
    <div className={`${styles.demoAppPage} ${styles.darkApp}`}>
      <AppTopbar title="Inbox" />
      <div className={styles.chatBackdrop}>
        <div className={styles.chatWindow}>
          <header><div><span>PRIVATE CONNECTION · LIVE</span><strong>Jamie Chen · Anyone want to go to CoRec together?</strong><small>● Online now</small></div><b>×</b></header>
          <div className={styles.safetyStrip}>Both sides confirmed. Keep timing, location, scope, and money clear. <b>Safety center ↗</b></div>
          <div className={styles.messages}><div className={styles.theirBubble}><p>Hey! Want to meet at 6?</p><span>5:42 PM</span></div><div className={styles.myBubble}><p>Sounds good — front entrance?</p><span>5:43 PM</span></div><div className={styles.theirBubble}><p>Perfect. See you there!</p><span>5:44 PM</span></div></div>
          <div className={styles.composer}><span>Message about the request...</span><button>Send ↑</button></div>
        </div>
      </div>
    </div>
  );
}

function CompleteScene() {
  return (
    <div className={styles.demoAppPage}>
      <AppTopbar title="Connection complete" />
      <div className={styles.connectionsShell}>
        <div className={styles.tabs}><span>My requests</span><b>Connections</b><span>My Circle</span></div>
        <article className={`${styles.connectionCard} ${styles.completedCard}`}>
          <span>COMPLETED · ARCHIVED</span>
          <h2>Anyone want to go to CoRec together?</h2>
          <div className={styles.personRow}><b>J</b><div><strong>Jamie Chen</strong><span>Purdue University</span></div></div>
          <div className={styles.connectionChecks}><span>Requester chose ✓</span><span>Responder confirmed ✓</span><span>You marked complete ✓</span><span>Jamie marked complete ✓</span></div>
          <div className={styles.completePanel}><span>✓ ACTIVITY COMPLETE</span><strong>The request chat is now read-only.</strong><p>Review the connection, keep the chat history, and decide whether you want to stay connected.</p><div><button>Keep in my Circle</button><button>Archive chat</button><button className={styles.blockButton}>Block</button></div></div>
        </article>
      </div>
    </div>
  );
}

function CircleScene() {
  return (
    <div className={styles.demoAppPage}>
      <AppTopbar title="My Circle" />
      <div className={styles.circleShell}>
        <div className={styles.tabs}><span>My requests</span><span>Connections</span><b>My Circle</b></div>
        <section className={styles.circleHero}><span>MY CIRCLE</span><h2>People you actually met through Aspire.</h2><p>No random follows. A lasting connection opens only when both people choose it.</p></section>
        <article className={styles.circleCard}><div className={styles.circleAvatar}>J</div><div><span>MY CIRCLE · PURDUE</span><h3>Jamie Chen</h3><p>Connected through “Anyone want to go to CoRec together?”. You both chose to keep in touch.</p></div><button>Message Jamie</button></article>
        <div className={styles.endMark}><img src={aspireLogo} alt="" /><div><strong>Aspire 101</strong><span>Ask campus. Feel at home.</span></div></div>
      </div>
    </div>
  );
}
