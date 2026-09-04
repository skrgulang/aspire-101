import './globals.css';
import './footer.css';
import './request-road.css';
import './feature-tour.css';
import './belonging.css';
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
