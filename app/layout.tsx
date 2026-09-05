import './globals.css';
import './footer.css';
import './request-road.css';
import './campus-stories.css';
import './belonging.css';
import './journey-immersive.css';
import './expansion.css';
import './trust-loop.css';
import './exchange-ui.css';
import './ambassadors.css';
import './scroll-experience.css';
import './global-journey.css';
import './connection-vibe.css';
import './trust-simple.css';
import './auth.css';
import './auth-school-detection.css';
import './post.css';
import './campus-picker.css';
import './campus-home.css';
import './campus-circle-v2.css';
import './campus-sections.css';
import './campus-identity.css';
import './marketing-home.css';
import './marketing-story.css';
import './marketing-vibe.css';
import './marketing-expand.css';
import './marketing-motion.css';
import './marketing-trust.css';
import './cookie-banner.css';
import './safety-ui.css';
import './connections.css';
import './app-shell.css';
import './app-loader.css';
import './trust-moderation.css';
import './profile-polish.css';
import './moderator-polish.css';
import type { Metadata } from 'next';
import { Inter, Cormorant_Garamond } from 'next/font/google';
import SiteFooter from './SiteFooter';
import CookieBanner from './CookieBanner';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const display = Cormorant_Garamond({ subsets: ['latin'], weight: ['500','600','700'], variable: '--font-display' });

export const metadata: Metadata = {
  title: 'Aspire 101 — Ask campus. Feel at home.',
  description: 'A college request network that helps students find support, make connections, and feel more at home on campus.'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${display.variable}`}>
        {children}
        <SiteFooter />
        <CookieBanner />
      </body>
    </html>
  );
}
