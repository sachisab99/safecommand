'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession } from '../lib/auth';
import { Drawer } from './Drawer';

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!getSession()) router.push('/login');
  }, [router]);

  return (
    <div className="flex min-h-screen">
      {/* Drawer — slide-over on mobile, persistent on lg:+ */}
      <Drawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />

      {/* Main content column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar with hamburger — hidden on lg:+ */}
        <header className="lg:hidden flex items-center justify-between px-3 py-3 bg-white border-b border-slate-200 sticky top-0 z-30">
          <button
            onClick={() => setDrawerOpen(true)}
            className="w-11 h-11 flex items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 transition-colors"
            aria-label="Open navigation menu"
          >
            <span className="text-2xl leading-none">☰</span>
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-red-600 flex items-center justify-center">
              <span className="text-white text-[10px] font-black">SC</span>
            </div>
            <span className="font-bold text-sm text-slate-900">SafeCommand</span>
          </div>
          <div className="w-11" aria-hidden="true" /> {/* spacer for visual balance */}
        </header>

        <main className="flex-1 overflow-y-auto bg-slate-50">{children}</main>
      </div>
    </div>
  );
}
