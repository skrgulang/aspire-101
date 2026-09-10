import { aspireLogo } from '../logo';
import AppDock from '../AppDock';
import UiIcon, { UiIconName } from '../UiIcon';
import styles from '../CampusHomeRefresh.module.css';

type PreviewCategory = {
  label: string;
  icon: UiIconName;
  detail: string;
};

type PreviewPost = {
  title: string;
  category: string;
  icon: UiIconName;
  time: string;
};

const categories: PreviewCategory[] = [
  { label: 'Rides', icon: 'car', detail: '4 open' },
  { label: 'Study', icon: 'book', detail: '6 open' },
  { label: 'Gaming', icon: 'game', detail: '3 open' },
  { label: 'Projects', icon: 'code', detail: '5 open' },
  { label: 'People', icon: 'users', detail: '8 open' },
  { label: 'Buy & Sell', icon: 'tag', detail: '12 open' }
];

const posts: PreviewPost[] = [
  { title: 'Anyone heading to IND airport Friday afternoon?', category: 'Rides', icon: 'car', time: '12m ago' },
  { title: 'Looking for a Math 55 study group this week', category: 'Study', icon: 'book', time: '28m ago' },
  { title: 'Selling a mini fridge near campus — great condition', category: 'Buy & Sell', icon: 'tag', time: '43m ago' },
  { title: 'Need one more for Valorant tonight', category: 'Gaming', icon: 'game', time: '1h ago' },
  { title: 'Looking for a UI designer for a weekend build', category: 'Projects', icon: 'code', time: '2h ago' },
  { title: 'Anyone want to go to the gym around 7?', category: 'People', icon: 'users', time: '3h ago' }
];

export default function SignedInUiPreview() {
  const previewHref = '/ui-preview';

  return (
    <main className={`campusHome ${styles.page}`}>
      <AppDock active="home" preview />

      <div className={styles.shell}>
        <header className={styles.topbar}>
          <div className={styles.brandLine}>
            <img src={aspireLogo} alt="Aspire 101" />
            <div className={styles.brandText}>
              <strong>Aspire 101</strong>
              <span>Purdue community</span>
            </div>
          </div>

          <a className={styles.searchBox} href={previewHref}>
            <UiIcon name="search" />
            <span>Search requests, people, rides, items...</span>
          </a>

          <div className={styles.topActions}>
            <select className={styles.campusSelect} defaultValue="Purdue" aria-label="Preview campus">
              <option>Purdue</option>
            </select>
            <a className={styles.iconButton} href={previewHref} aria-label="Notifications">
              <UiIcon name="bell" />
            </a>
            <button type="button" className={styles.avatarButton} aria-label="Preview profile">C</button>
          </div>
        </header>

        <div className={styles.mainGrid}>
          <div className={styles.mainColumn}>
            <section className={styles.hero}>
              <img
                className={styles.heroImage}
                src="https://images.pexels.com/photos/7683692/pexels-photo-7683692.jpeg?auto=compress&cs=tinysrgb&w=1600"
                alt=""
              />
              <div className={styles.heroOverlay} aria-hidden="true" />
              <div className={styles.heroContent}>
                <p className={styles.eyebrow}>Purdue · Community</p>
                <h1>Welcome back, Congyu.</h1>
                <p className={styles.heroText}>Ask for help, find people, buy or sell nearby, join a ride, or start something with students around you.</p>
                <div className={styles.heroActions}>
                  <a className={styles.primaryButton} href={previewHref}><UiIcon name="plus" />Post something</a>
                  <a className={styles.secondaryButton} href={previewHref}><UiIcon name="compass" />Browse campus</a>
                </div>
              </div>
            </section>

            <section className={styles.sectionCard}>
              <div className={styles.sectionHead}>
                <div><p>Explore</p><h2>What do you need?</h2></div>
                <a href={previewHref}>See everything →</a>
              </div>
              <div className={styles.categoryGrid}>
                {categories.map((category) => (
                  <a key={category.label} href={previewHref} className={styles.categoryCard}>
                    <div className={styles.categoryIcon}><UiIcon name={category.icon} /></div>
                    <strong>{category.label}</strong>
                    <span>{category.detail}</span>
                  </a>
                ))}
              </div>
            </section>

            <section className={styles.sectionCard}>
              <div className={styles.sectionHead}>
                <div><p>Right now</p><h2>Recent around Purdue</h2></div>
                <a href={previewHref}>See all →</a>
              </div>
              <div className={styles.feed}>
                {posts.map((post) => (
                  <a key={post.title} href={previewHref} className={styles.feedItem}>
                    <div className={styles.feedIcon}><UiIcon name={post.icon} /></div>
                    <div className={styles.feedCopy}>
                      <strong>{post.title}</strong>
                      <span>{post.category} · {post.time} · Purdue</span>
                    </div>
                    <span className={styles.feedArrow}><UiIcon name="chevron" /></span>
                  </a>
                ))}
              </div>
            </section>
          </div>

          <aside className={styles.sideColumn}>
            <section className={styles.sideCard}>
              <div className={styles.welcomeTop}>
                <div className={styles.welcomeAvatar}>C</div>
                <div><span>Welcome</span><strong>Congyu Zhao</strong></div>
              </div>
              <div className={styles.statusRow}>
                <span className={styles.statusIcon}><UiIcon name="check" /></span>
                <div><strong>Campus account</strong><span>Purdue University</span></div>
              </div>
              <a className={styles.sideLink} href={previewHref}><span>View profile & verification</span><UiIcon name="chevron" /></a>
            </section>

            <section className={styles.sideCard}>
              <h3 className={styles.quickTitle}>Quick actions</h3>
              <div className={styles.quickGrid}>
                <a className={styles.quickAction} href={previewHref}><UiIcon name="plus" /><span>Create post</span></a>
                <a className={styles.quickAction} href={previewHref}><UiIcon name="search" /><span>Search campus</span></a>
                <a className={styles.quickAction} href={previewHref}><UiIcon name="message" /><span>Connections</span></a>
                <a className={styles.quickAction} href={previewHref}><UiIcon name="user" /><span>My account</span></a>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
