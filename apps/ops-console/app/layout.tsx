import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '../lib/theme';
import { TopNav } from '../components/TopNav';

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' });

export const metadata: Metadata = {
  title: 'SafeCommand Ops Console',
  description: 'Internal SC team operations console',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} h-full`}>
      <body className="min-h-full bg-gray-50 font-sans antialiased">
        {/*
         * ThemeProvider — Ops Console always uses SafeCommand brand (EC-14).
         * No corporate brand override is possible here; even when SC Ops
         * configures Apollo's brand_config, the surrounding console chrome
         * stays as SafeCommand to prevent cross-brand confusion.
         */}
        <ThemeProvider>
          {/* Persistent global nav. Renders nothing on /login (no ops_auth cookie). */}
          <TopNav />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
