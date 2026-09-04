import './globals.css';
import type { Metadata } from 'next';
import { Inter, Cormorant_Garamond } from 'next/font/google';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const display = Cormorant_Garamond({ subsets: ['latin'], weight: ['500','600','700'], variable: '--font-display' });

export const metadata: Metadata = {
  title: 'Aspire 101 — Post what you need. Find who can help.',
  description: 'A college request network for tutoring, rides, projects, campus help, buy and sell, collaboration, and more.'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${display.variable}`}>{children}</body>
    </html>
  );
}
