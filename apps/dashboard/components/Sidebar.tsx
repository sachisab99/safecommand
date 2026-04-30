'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clearSession, getSession } from '../lib/auth';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: '▦' },
  { href: '/zones',     label: 'Zone Board', icon: '⬡' },
  { href: '/incidents', label: 'Incidents',  icon: '⚡' },
  { href: '/staff',     label: 'Staff',      icon: '◉' },
];

const SEV_COLOR: Record<string, string> = {
  SH: 'bg-red-700', DSH: 'bg-orange-700', GM: 'bg-purple-700',
  SHIFT_COMMANDER: 'bg-blue-700', FLOOR_SUPERVISOR: 'bg-sky-700',
  FM: 'bg-teal-700', AUDITOR: 'bg-slate-600', GROUND_STAFF: 'bg-slate-600',
};

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const session = getSession();

  const handleLogout = () => {
    clearSession();
    router.push('/login');
  };

  return (
    <nav className="w-56 shrink-0 bg-slate-900 flex flex-col h-screen sticky top-0">
      {/* Brand */}
      <div className="px-5 py-6 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center shadow shadow-red-900/60">
            <span className="text-white text-xs font-black">SC</span>
          </div>
          <div>
            <div className="text-white font-bold text-sm leading-tight">SafeCommand</div>
            <div className="text-slate-500 text-xs">Operations</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <div className="flex-1 px-3 py-4 space-y-1">
        {NAV.map(({ href, label, icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                active
                  ? 'bg-blue-600 text-white shadow shadow-blue-900/50'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <span className="text-base leading-none">{icon}</span>
              {label}
            </Link>
          );
        })}
      </div>

      {/* Staff info + logout */}
      {session && (
        <div className="px-4 py-4 border-t border-slate-800">
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${SEV_COLOR[session.staff.role] ?? 'bg-slate-600'}`}>
              {session.staff.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="overflow-hidden">
              <div className="text-white text-xs font-semibold truncate">{session.staff.name}</div>
              <div className="text-slate-500 text-xs">{session.staff.role}</div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full text-left text-slate-500 hover:text-red-400 text-xs transition-colors px-1"
          >
            Sign out →
          </button>
        </div>
      )}
    </nav>
  );
}
