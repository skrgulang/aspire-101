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
import './marketplace.css';
import './marketplace-empty-state-fix.css';
import './marketplace-modal-theme.css';
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
import './marketing-cards-polish.css';
import './cookie-banner.css';
import './safety-ui.css';
import './connections.css';
import './connections-refresh.css';
import './connection-social.css';
import './realtime-notifications.css';
import './app-shell.css';
import './app-loader.css';
import './trust-moderation.css';
import './profile-polish.css';
import './student-profile-settings.css';
import './student-profile-controls.css';
import './moderator-polish.css';
import './discover-v2.css';
import './payments-connect.css';
import './connection-payments.css';
import './ecosystem-v2.css';
import './discover-ecosystem.css';
import './ecosystem-polish.css';
import './market-discover.css';
import './walker-fix.css';
import './updates.css';
import './aspire-ai.css';
import './aspire-ai-launcher.css';
import './campus-pulse-ai.css';
import './connection-copilot.css';
import './dispute-intelligence.css';
import './aspire-match.css';
import './aspire-intelligence.css';
import './aspire-money.css';
import './sidebar-popout.css';
import './post-refresh.css';
import './discover-reference.css';
import './discover-unified-feed.css';
import './campus-demo-feed.css';
import './campus-demo-feed-fix.css';
import './legal.css';
import './production-typography.css';
import type { Metadata } from 'next';
import { Inter, Cormorant_Garamond } from 'next/font/google';
import SiteFooter from './SiteFooter';
import CookieBanner from './CookieBanner';
import { aspireLogo } from './logo';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const display = Cormorant_Garamond({ subsets: ['latin'], weight: ['500','600','700'], variable: '--font-display' });

const siteDescription = 'Aspire 101 is a campus request and connection network for college students to find study partners and rides, exchange items, coordinate help, and connect with verified campus communities.';

export const metadata: Metadata = {
  metadataBase: new URL('https://aspires101.com'),
  title: 'Aspire 101 — Ask campus. Feel at home.',
  description: siteDescription,
  applicationName: 'Aspire 101',
  alternates: { canonical: '/' },
  icons: { icon: '/favicon.png', shortcut: '/favicon.png', apple: '/favicon.png' },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1
    }
  },
  openGraph: {
    type: 'website',
    url: 'https://aspires101.com/',
    siteName: 'Aspire 101',
    title: 'Aspire 101 — Ask campus. Feel at home.',
    description: siteDescription,
    images: [{
      url: '/og-image.png',
      width: 1200,
      height: 630,
      alt: 'Aspire 101 — Ask campus. Feel at home.'
    }]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Aspire 101 — Ask campus. Feel at home.',
    description: siteDescription,
    images: ['/og-image.png']
  }
};

const siteStructuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': 'https://aspires101.com/#organization',
      name: 'Aspire 101',
      url: 'https://aspires101.com/',
      logo: {
        '@type': 'ImageObject',
        url: 'https://aspires101.com/logo-512.png',
        width: 512,
        height: 512
      },
      sameAs: [
        'https://www.instagram.com/aspire.101/',
        'https://www.linkedin.com/company/108901932/'
      ],
      parentOrganization: {
        '@type': 'Organization',
        name: 'Cloudora Labs, Inc.'
      },
      description: siteDescription
    },
    {
      '@type': 'WebSite',
      '@id': 'https://aspires101.com/#website',
      url: 'https://aspires101.com/',
      name: 'Aspire 101',
      description: siteDescription,
      publisher: { '@id': 'https://aspires101.com/#organization' }
    }
  ]
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-aspire-theme="dark">
      <body className={`${inter.variable} ${display.variable}`}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(siteStructuredData) }}
        />
        {children}
        <SiteFooter />
        <CookieBanner />
      </body>
    </html>
  );
}
