'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { clearSession, getSession, type DashboardSession } from '../lib/auth';
import { NAV_GROUPS, STAFF_ROLE_AVATAR_BG, type NavItem } from '../lib/nav-config';
import { getPinned, setPinned } from '../lib/drawer-state';

interface DrawerProps {
  isOpen: boolean;        // mobile open state
  onClose: () => void;    // mobile close handler
}

export function Drawer({ isOpen, onClose }: DrawerProps) {
  const pathname = usePathname();
  const router = useRouter();

  // Desktop pin state — persisted in localStorage, default = pinned
  const [pinned, setPinnedState] = useState<boolean>(true);

  // Session state — read from localStorage AFTER mount only.
  // Calling getSession() during render causes a hydration mismatch
  // (server returns null because window/localStorage is undefined; client
  // returns the actual session, so the JSX trees differ). We mirror the
  // same useState+useEffect pattern as `pinned` above.
  const [session, setSession] = useState<DashboardSession | null>(null);

  // Hydrate pin + session state from localStorage on mount (avoid SSR mismatch)
  useEffect(() => {
    setPinnedState(getPinned());
    setSession(getSession());
  }, []);

  const togglePin = () => {
    const next = !pinned;
    setPinnedState(next);
    setPinned(next);
  };

  // Esc key closes drawer on mobile
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  // Body-scroll lock on mobile when drawer is open
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const handleLogout = () => {
    clearSession();
    router.push('/login');
  };

  const handleNavTap = () => {
    onClose(); // auto-close on mobile after nav
  };

  // Width classes:
  //   Mobile: hidden by default, slides in to 80vw max 320px when isOpen
  //   Desktop (lg:+): always visible; pinned=240px / collapsed=64px
  const drawerWidth = pinned ? 'lg:w-60' : 'lg:w-16';
  const mobileTranslate = isOpen ? 'translate-x-0' : '-translate-x-full';

  return (
    <>
      {/* Backdrop (mobile only) */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Drawer */}
      <nav
        className={`
          fixed inset-y-0 left-0 z-50 bg-slate-900 flex flex-col
          w-[80vw] max-w-[320px]
          transform transition-all duration-250 ease-out
          ${mobileTranslate}
          lg:relative lg:translate-x-0 lg:transition-[width] lg:duration-200
          ${drawerWidth}
        `}
        aria-label="Main navigation"
      >
        {/* Header — sticky, GM/venue/health context */}
        <DrawerHeader pinned={pinned} onTogglePin={togglePin} session={session} />

        {/* Nav groups — scrollable */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
          {NAV_GROUPS.map((group) => (
            <DrawerSection
              key={group.id}
              label={group.label}
              items={group.items}
              currentPath={pathname}
              compact={!pinned}
              onItemTap={handleNavTap}
            />
          ))}
        </div>

        {/* Footer — staff info + logout */}
        {session && (
          <div className="px-3 py-4 border-t border-slate-800">
            <div className={`flex items-center gap-3 mb-3 ${!pinned ? 'lg:justify-center' : ''}`}>
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${STAFF_ROLE_AVATAR_BG[session.staff.role] ?? 'bg-slate-600'}`}>
                {session.staff.name.slice(0, 2).toUpperCase()}
              </div>
              {(pinned || isOpen) && (
                <div className="overflow-hidden lg:block">
                  <div className="text-white text-xs font-semibold truncate">{session.staff.name}</div>
                  <div className="text-slate-500 text-xs">{session.staff.role}</div>
                </div>
              )}
            </div>
            <button
              onClick={handleLogout}
              className={`w-full text-left text-slate-500 hover:text-red-400 text-xs font-medium transition-colors px-1 min-h-[32px] flex items-center gap-2 ${!pinned ? 'lg:justify-center' : ''}`}
              aria-label="Sign out"
            >
              <span aria-hidden="true">↩</span>
              {(pinned || isOpen) && <span className="lg:inline">Sign out</span>}
            </button>
          </div>
        )}
      </nav>
    </>
  );
}

/* ─── Drawer subcomponents ───────────────────────────────────────────────── */

function DrawerHeader({
  pinned,
  onTogglePin,
  session,
}: {
  pinned: boolean;
  onTogglePin: () => void;
  session: DashboardSession | null;
}) {
  return (
    <div className="px-4 py-4 border-b border-slate-800 shrink-0">
      <div className="flex items-center gap-2.5">
        {/* Brand mark */}
        <div className="w-9 h-9 rounded-lg bg-red-600 flex items-center justify-center shadow shadow-red-900/60 shrink-0">
          <span className="text-white text-xs font-black">SC</span>
        </div>

        {/* Brand label — hidden when collapsed on desktop */}
        {pinned && (
          <div className="flex-1 min-w-0 lg:block">
            <div className="text-white font-bold text-sm leading-tight truncate">SafeCommand</div>
            {session && (
              <div className="text-slate-500 text-xs truncate" title={session.staff.venue_id}>
                Venue · live
              </div>
            )}
          </div>
        )}

        {/* Pin/collapse toggle — desktop only */}
        <button
          onClick={onTogglePin}
          className="hidden lg:flex items-center justify-center w-8 h-8 rounded text-slate-500 hover:text-white hover:bg-slate-800 transition-colors"
          aria-label={pinned ? 'Collapse drawer' : 'Expand drawer'}
          title={pinned ? 'Collapse' : 'Expand'}
        >
          <span className="text-base leading-none">{pinned ? '⇤' : '⇥'}</span>
        </button>
      </div>
    </div>
  );
}

function DrawerSection({
  label,
  items,
  currentPath,
  compact,
  onItemTap,
}: {
  label: string;
  items: NavItem[];
  currentPath: string;
  compact: boolean;       // collapsed mode (lg: only — icon rail)
  onItemTap: () => void;
}) {
  return (
    <div>
      {/* Section header — hidden in compact mode */}
      {!compact && (
        <div className="px-2 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 lg:block">
          {label}
        </div>
      )}

      <div className="space-y-0.5">
        {items.map((item) => (
          <DrawerNavItem
            key={item.id}
            item={item}
            active={currentPath === item.href || currentPath.startsWith(`${item.href}/`)}
            compact={compact}
            onTap={onItemTap}
          />
        ))}
      </div>
    </div>
  );
}

function DrawerNavItem({
  item,
  active,
  compact,
  onTap,
}: {
  item: NavItem;
  active: boolean;
  compact: boolean;
  onTap: () => void;
}) {
  const baseClasses = `
    flex items-center gap-3 px-3 rounded-lg text-sm font-medium
    transition-colors min-h-[44px]
    ${compact ? 'lg:justify-center lg:px-0' : ''}
  `;

  if (!item.enabled) {
    return (
      <div
        className={`${baseClasses} text-slate-600 cursor-not-allowed select-none`}
        title={`${item.label} — coming soon`}
        aria-disabled="true"
      >
        <span className="text-base leading-none shrink-0" aria-hidden="true">{item.icon}</span>
        {!compact && (
          <>
            <span className="truncate flex-1">{item.label}</span>
            <span className="text-[9px] text-slate-700 uppercase tracking-wider shrink-0">soon</span>
          </>
        )}
      </div>
    );
  }

  return (
    <Link
      href={item.href}
      onClick={onTap}
      className={`${baseClasses} ${
        active
          ? 'bg-blue-600 text-white shadow shadow-blue-900/50'
          : 'text-slate-400 hover:bg-slate-800 hover:text-white'
      }`}
      aria-current={active ? 'page' : undefined}
    >
      <span className="text-base leading-none shrink-0" aria-hidden="true">{item.icon}</span>
      {!compact && (
        <>
          <span className="truncate flex-1">{item.label}</span>
          {item.newBadge && (
            <span className="text-[9px] bg-red-500 text-white px-1.5 py-0.5 rounded-full uppercase tracking-wider shrink-0">new</span>
          )}
        </>
      )}
    </Link>
  );
}
