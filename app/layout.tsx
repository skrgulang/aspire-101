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
import './post.css';
import './campus-picker.css';
import './campus-home.css';
import './safety-ui.css';
import './connections.css';
import type { Metadata } from 'next';
import { Inter, Cormorant_Garamond } from 'next/font/google';
import SiteFooter from './SiteFooter';

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
      </body>
    </html>
  );
}
