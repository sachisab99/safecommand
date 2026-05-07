'use client';

/**
 * /certifications — venue-wide cert compliance view (BR-22).
 *
 * Mirrors mobile MyCertifications + Ops Console Certifications tab on
 * dashboard. Reads /v1/certifications which returns the full list with
 * staff names joined.
 *
 * Refs: BR-22 (Staff Certification Tracker), BR-14 (Health Score 15% weight),
 * BR-B (Cert Expiry Warning on Shift Activation)
 */

import { useEffect, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { apiFetch } from '../../lib/api';

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface CertWithStaff {
  id: string;
  venue_id: string;
  staff_id: string;
  certification_name: string;
  issued_at: string;
  expires_at: string;
  document_url: string | null;
  staff: { name: string; role: string } | null;
}

type ExpiryBucket = 'OK' | 'DUE_90' | 'DUE_30' | 'DUE_7' | 'EXPIRED';

/* ─── Visual config ──────────────────────────────────────────────────────── */

const BUCKET_CONFIG: Record<
  ExpiryBucket,
  { label: (d: number) => string; cls: string; rank: number }
> = {
  EXPIRED: {
    label: (d) => `EXPIRED ${Math.abs(d)}d`,
    cls: 'bg-red-700 text-white',
    rank: 5,
  },
  DUE_7: {
    label: (d) => `Expires in ${d}d`,
    cls: 'bg-red-100 text-red-700 border border-red-200',
    rank: 4,
  },
  DUE_30: {
    label: (d) => `Expires in ${d}d`,
    cls: 'bg-orange-100 text-orange-700 border border-orange-200',
    rank: 3,
  },
  DUE_90: {
    label: (d) => `Expires in ${d}d`,
    cls: 'bg-amber-100 text-amber-700 border border-amber-200',
    rank: 2,
  },
  OK: {
    label: () => 'OK',
    cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    rank: 1,
  },
};

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function daysUntil(date: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(date + 'T00:00:00+05:30');
  return Math.floor((exp.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

function bucket(days: number): ExpiryBucket {
  if (days < 0) return 'EXPIRED';
  if (days <= 7) return 'DUE_7';
  if (days <= 30) return 'DUE_30';
  if (days <= 90) return 'DUE_90';
  return 'OK';
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function CertificationsPage() {
  const [certs, setCerts] = useState<CertWithStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data, error: e } = await apiFetch<CertWithStaff[]>('/certifications');
      setLoading(false);
      if (e) setError(e);
      else setCerts(data ?? []);
    };
    void load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  // Compliance stats (matches api formula)
  const buckets = { ok: 0, due_90: 0, due_30: 0, due_7: 0, expired: 0 };
  for (const c of certs) {
    const b = bucket(daysUntil(c.expires_at));
    if (b === 'OK') buckets.ok++;
    else if (b === 'DUE_90') buckets.due_90++;
    else if (b === 'DUE_30') buckets.due_30++;
    else if (b === 'DUE_7') buckets.due_7++;
    else buckets.expired++;
  }
  const total = certs.length;
  const score = total === 0 ? 100 : Math.round((buckets.ok / total) * 100);
  const scoreColour =
    score >= 80 ? 'text-emerald-700' : score >= 60 ? 'text-amber-700' : 'text-red-700';

  // Sort: most urgent first
  const sorted = [...certs].sort((a, b) => {
    const ra = BUCKET_CONFIG[bucket(daysUntil(a.expires_at))].rank;
    const rb = BUCKET_CONFIG[bucket(daysUntil(b.expires_at))].rank;
    if (ra !== rb) return rb - ra;
    return a.expires_at.localeCompare(b.expires_at);
  });

  return (
    <AppShell>
      <div
        className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <div className="mb-4 sm:mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Certifications</h1>
          <p className="text-slate-500 text-sm mt-1">
            Staff professional credentials · 90 / 30 / 7-day expiry windows
          </p>
        </div>

        {loading && <div className="text-slate-400 text-sm">Loading certifications…</div>}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
            {error}
          </div>
        )}

        {!loading && !error && certs.length === 0 && (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">📜</div>
            <div className="font-semibold text-slate-700">No certifications registered</div>
            <p className="text-slate-500 text-sm mt-2 max-w-md mx-auto">
              Track staff professional credentials (First Aid, Fire Safety, Security
              Guard License, etc) via the Operations Console.
            </p>
          </div>
        )}

        {!loading && !error && certs.length > 0 && (
          <>
            {/* Compliance summary */}
            <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 sm:p-6 mb-4 sm:mb-6">
              <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
                <div>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Certification Compliance
                  </h2>
                  <p className="text-slate-400 text-xs mt-0.5">
                    % of certs ≥90 days to expiry
                  </p>
                </div>
                <div className={`text-4xl font-black ${scoreColour}`}>{score}</div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3">
                <Tile label="Total" value={total} tone="neutral" />
                <Tile label="OK (>90d)" value={buckets.ok} tone={buckets.ok > 0 ? 'good' : 'neutral'} />
                <Tile label="Due 30-90d" value={buckets.due_90} tone={buckets.due_90 > 0 ? 'warn' : 'neutral'} />
                <Tile label="Due 7-30d" value={buckets.due_30} tone={buckets.due_30 > 0 ? 'warn' : 'neutral'} />
                <Tile
                  label="Due ≤7d / expired"
                  value={buckets.due_7 + buckets.expired}
                  tone={buckets.due_7 + buckets.expired > 0 ? 'bad' : 'neutral'}
                />
              </div>
            </section>

            {/* Certifications list */}
            <section className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h2 className="font-bold text-slate-900">All Certifications</h2>
                <span className="text-xs text-slate-500">
                  {sorted.length} · sorted by urgency
                </span>
              </div>
              <div className="divide-y divide-slate-50">
                {sorted.map((cert) => {
                  const days = daysUntil(cert.expires_at);
                  const cfg = BUCKET_CONFIG[bucket(days)];
                  return (
                    <div
                      key={cert.id}
                      className="px-5 sm:px-6 py-4 flex items-center gap-3 sm:gap-4"
                    >
                      <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-700 font-bold text-xs shrink-0">
                        {cert.staff?.name.charAt(0) ?? '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-900 truncate">
                          {cert.certification_name}
                        </div>
                        <div className="text-slate-500 text-xs sm:text-sm truncate">
                          {cert.staff?.name ?? 'Unknown staff'}
                          {cert.staff?.role && (
                            <span className="text-slate-400 ml-1">· {cert.staff.role}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${cfg.cls}`}
                        >
                          {cfg.label(days)}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          Expires {cert.expires_at}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'good' | 'warn' | 'bad' | 'neutral';
}) {
  const cls = {
    good: 'text-emerald-700',
    warn: 'text-amber-700',
    bad: 'text-red-700',
    neutral: 'text-slate-900',
  }[tone];
  return (
    <div className="bg-slate-50 rounded-lg px-3 py-2">
      <div className={`text-2xl font-bold ${cls}`}>{value}</div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mt-0.5">
        {label}
      </div>
    </div>
  );
}
