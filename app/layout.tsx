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
import './payment-fee-preview.css';
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
import './marketing-campus-motion.css';
import './marketing-trust.css';
import './cookie-banner.css';
import './safety-ui.css';
import './connections.css';
import './connection-social.css';
import './realtime-notifications.css';
import './app-shell.css';
import './app-loader.css';
import './trust-moderation.css';
import './profile-polish.css';
import './moderator-polish.css';
import './discover-v2.css';
import './payments-connect.css';
import './connection-payments.css';
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

const authLayoutPolish = `
  @media (min-width: 1001px) {
    .authPage .authShell {
      width: min(1120px, calc(100% - 64px)) !important;
      min-height: 700px !important;
      grid-template-columns: minmax(0, 640px) minmax(360px, 420px) !important;
      justify-content: center !important;
      gap: 36px !important;
      align-items: center !important;
    }
    .authPage .authVisual {
      width: 100% !important;
      max-width: 640px !important;
      min-height: 610px !important;
      overflow: hidden !important;
      border-radius: 30px !important;
    }
    .authPage .authVisualHeadline {
      max-width: 550px !important;
      padding: 28px 24px 0 !important;
    }
    .authPage .authVisualHeadline h1 {
      max-width: 550px !important;
      font-size: clamp(50px, 5vw, 76px) !important;
      line-height: .92 !important;
    }
    .authPage .authCampusPhoto {
      width: 50% !important;
      right: 5% !important;
      bottom: 5% !important;
    }
    .authPage .authPeoplePhoto {
      width: 32% !important;
      left: 7% !important;
      bottom: 9% !important;
    }
    .authPage .authDoodle {
      left: 10% !important;
      top: 43% !important;
      font-size: 14px !important;
    }
    .authPage .authRequestBits {
      right: 7% !important;
      top: 38% !important;
    }
    .authPage .authStickerSchool {
      right: 3% !important;
      bottom: 31% !important;
      font-size: 14px !important;
    }
    .authPage .authStickerAsk {
      left: 31% !important;
      bottom: 2% !important;
      font-size: 14px !important;
    }
    .authPage .authCard {
      width: 100% !important;
      max-width: 420px !important;
      justify-self: end !important;
      padding: 26px !important;
      border-radius: 26px !important;
    }
    .authPage .authCardTop h2 { font-size: 28px !important; }
    .authPage .authCard input,
    .authPage .authCard select,
    .authPage .authSubmit { min-height: 50px !important; }
  }
`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${display.variable}`}>
        <style>{authLayoutPolish}</style>
        {children}
        <SiteFooter />
        <CookieBanner />
      </body>
    </html>
  );
}
