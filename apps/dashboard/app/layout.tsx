import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'SafeCommand — Venue Dashboard',
  description: 'Real-time venue safety operations dashboard',
};

// Viewport + safe-area inset support for notched phones (iPhone, modern Android).
// `viewportFit: 'cover'` + Tailwind safe-area utilities ensure content respects
// the device's safe area (notch, home indicator, gesture bar).
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0f172a', // slate-900 — matches drawer background
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="min-h-full bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
