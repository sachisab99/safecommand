'use client';

/**
 * BR-23 Festival/Event Mode — dashboard UI (reuses shipped api).
 *
 *  - FestivalPostureBanner: app-wide read-only indicator, mounted in
 *    AppShell. FAIL-SAFE BY DESIGN — returns null on loading / error /
 *    inactive and never throws, so it can never affect page rendering
 *    (it is a sibling of {children}; worst case it shows nothing).
 *  - FestivalModeControl: deliberate command-gated toggle, on /dashboard.
 */

import { useCallback, useEffect, useState } from 'react';
import { getSession } from '../lib/auth';
import { fetchVenue, setFestivalMode, canToggleFestival } from '../lib/venue';

export function FestivalPostureBanner() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchVenue()
      .then(({ data }) => {
        if (alive && data) setActive(data.festival_mode === true);
      })
      .catch(() => {
        /* fail-safe: stay inactive, render nothing */
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!active) return null;

  return (
    <div className="flex items-center gap-3 bg-amber-500 px-4 py-2 text-sm font-semibold text-amber-950">
      <span className="text-base" aria-hidden="true">⚡</span>
      <span>
        Festival / Event Mode — <strong>elevated safety posture active</strong>. Heightened
        vigilance across all zones.
      </span>
    </div>
  );
}

export function FestivalModeControl() {
  const [role, setRole] = useState<string | null>(null);
  const [active, setActive] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    fetchVenue()
      .then(({ data }) => setActive(data ? data.festival_mode === true : false))
      .catch(() => setActive(false));
  }, []);

  useEffect(() => {
    setRole(getSession()?.staff.role ?? null);
    refresh();
  }, [refresh]);

  // Defence-in-depth — api also enforces requireRole(SH/DSH/GM).
  if (!canToggleFestival(role) || active === null) return null;

  const toggle = async () => {
    const next = !active;
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        next
          ? 'Activate Festival / Event Mode? This signals an elevated safety posture venue-wide.'
          : 'Stand down Festival / Event Mode and return to normal posture?',
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    const res = await setFestivalMode(next);
    setBusy(false);
    if (res.ok) refresh();
    else setError(res.error ?? 'Could not update festival mode');
  };

  return (
    <section
      className={`mb-6 rounded-2xl border p-4 ${
        active ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            ⚡ Festival / Event Mode {active ? '— ACTIVE' : ''}
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            One-tap elevated safety posture for high-footfall events (festivals, large gatherings).
          </p>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          className={`rounded-md px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-50 ${
            active ? 'bg-slate-600 hover:bg-slate-700' : 'bg-amber-600 hover:bg-amber-700'
          }`}
        >
          {busy ? 'Updating…' : active ? 'Stand down' : 'Activate'}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  );
}
