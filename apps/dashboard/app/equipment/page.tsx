'use client';

/**
 * /equipment — venue-wide compliance view (BR-21).
 *
 * Mirrors mobile EquipmentScreen + Ops Console Equipment tab on dashboard.
 * Reads /v1/equipment which returns the active items list. Compliance
 * stats computed client-side from the list (matches api /analytics/dashboard
 * formula exactly: ok_count / total * 100).
 *
 * Refs: BR-21 (Equipment & Maintenance Tracker), BR-14 (Health Score 10%
 * weight). The dashboard `/dashboard` Health Score Breakdown also displays
 * a single equipment row pulling from /v1/analytics/dashboard; this page
 * is the drill-down detail view.
 */

import { useEffect, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { apiFetch } from '../../lib/api';

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface EquipmentItem {
  id: string;
  venue_id: string;
  building_id: string | null;
  name: string;
  category: string;
  location_description: string | null;
  last_serviced_at: string | null;
  next_service_due: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

type ExpiryBucket = 'OK' | 'DUE_90' | 'DUE_30' | 'DUE_7' | 'OVERDUE';

/* ─── Visual config ──────────────────────────────────────────────────────── */

const CATEGORY_LABEL: Record<string, string> = {
  FIRE_EXTINGUISHER: 'Fire Extinguisher',
  AED: 'AED (Defibrillator)',
  SMOKE_DETECTOR: 'Smoke Detector',
  EMERGENCY_LIGHT: 'Emergency Light',
  FIRST_AID_KIT: 'First Aid Kit',
  ALARM_PANEL: 'Alarm Panel',
  EVACUATION_SIGN: 'Evacuation Sign',
  OTHER: 'Other',
};

const CATEGORY_ICON: Record<string, string> = {
  FIRE_EXTINGUISHER: '🧯',
  AED: '❤️‍🩹',
  SMOKE_DETECTOR: '🚨',
  EMERGENCY_LIGHT: '💡',
  FIRST_AID_KIT: '🩹',
  ALARM_PANEL: '🔔',
  EVACUATION_SIGN: '🚪',
  OTHER: '🛠️',
};

const BUCKET_CONFIG: Record<
  ExpiryBucket,
  { label: (d: number) => string; cls: string; rank: number }
> = {
  OVERDUE: {
    label: (d) => `OVERDUE ${Math.abs(d)}d`,
    cls: 'bg-red-700 text-white',
    rank: 5,
  },
  DUE_7: {
    label: (d) => `Due in ${d}d`,
    cls: 'bg-red-100 text-red-700 border border-red-200',
    rank: 4,
  },
  DUE_30: {
    label: (d) => `Due in ${d}d`,
    cls: 'bg-orange-100 text-orange-700 border border-orange-200',
    rank: 3,
  },
  DUE_90: {
    label: (d) => `Due in ${d}d`,
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

function daysUntilDue(dueDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + 'T00:00:00+05:30');
  return Math.floor((due.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

function expiryBucket(days: number): ExpiryBucket {
  if (days < 0) return 'OVERDUE';
  if (days <= 7) return 'DUE_7';
  if (days <= 30) return 'DUE_30';
  if (days <= 90) return 'DUE_90';
  return 'OK';
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function EquipmentPage() {
  const [items, setItems] = useState<EquipmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data, error: e } = await apiFetch<EquipmentItem[]>('/equipment');
      setLoading(false);
      if (e) setError(e);
      else setItems(data ?? []);
    };
    void load();
    const id = setInterval(load, 60_000); // refresh every minute
    return () => clearInterval(id);
  }, []);

  // Compliance stats (matches api /analytics/dashboard formula)
  const buckets = { ok: 0, due_90: 0, due_30: 0, due_7: 0, overdue: 0 };
  for (const item of items) {
    const b = expiryBucket(daysUntilDue(item.next_service_due));
    if (b === 'OK') buckets.ok++;
    else if (b === 'DUE_90') buckets.due_90++;
    else if (b === 'DUE_30') buckets.due_30++;
    else if (b === 'DUE_7') buckets.due_7++;
    else buckets.overdue++;
  }
  const total = items.length;
  const score = total === 0 ? 100 : Math.round((buckets.ok / total) * 100);
  const scoreColour =
    score >= 80 ? 'text-emerald-700' : score >= 60 ? 'text-amber-700' : 'text-red-700';

  // Sort: most urgent first; then by next_service_due ascending
  const sorted = [...items].sort((a, b) => {
    const ra = BUCKET_CONFIG[expiryBucket(daysUntilDue(a.next_service_due))].rank;
    const rb = BUCKET_CONFIG[expiryBucket(daysUntilDue(b.next_service_due))].rank;
    if (ra !== rb) return rb - ra;
    return a.next_service_due.localeCompare(b.next_service_due);
  });

  return (
    <AppShell>
      <div
        className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <PageHeader />

        {loading && <div className="text-slate-400 text-sm">Loading equipment…</div>}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
            {error}
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">🛠️</div>
            <div className="font-semibold text-slate-700">No equipment registered</div>
            <p className="text-slate-500 text-sm mt-2 max-w-md mx-auto">
              Your venue's safety equipment hasn't been registered yet. Ask
              Operations to add fire extinguishers, AEDs, smoke detectors, etc.
              via the Operations Console.
            </p>
          </div>
        )}

        {!loading && !error && items.length > 0 && (
          <>
            <ComplianceCard
              score={score}
              scoreColour={scoreColour}
              buckets={buckets}
              total={total}
            />
            <EquipmentList items={sorted} />
          </>
        )}
      </div>
    </AppShell>
  );
}

/* ─── Sub-components ─────────────────────────────────────────────────────── */

function PageHeader() {
  return (
    <div className="mb-4 sm:mb-6">
      <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Equipment</h1>
      <p className="text-slate-500 text-sm mt-1">
        Safety equipment compliance · 90 / 30 / 7-day expiry windows
      </p>
    </div>
  );
}

function ComplianceCard({
  score,
  scoreColour,
  buckets,
  total,
}: {
  score: number;
  scoreColour: string;
  buckets: { ok: number; due_90: number; due_30: number; due_7: number; overdue: number };
  total: number;
}) {
  return (
    <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 sm:p-6 mb-4 sm:mb-6">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Compliance Score
          </h2>
          <p className="text-slate-400 text-xs mt-0.5">
            % of items ≥ 90 days to next service
          </p>
        </div>
        <div className={`text-4xl font-black ${scoreColour}`}>{score}</div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3">
        <BucketTile label="Total" value={total} tone="neutral" />
        <BucketTile label="OK (>90d)" value={buckets.ok} tone={buckets.ok > 0 ? 'good' : 'neutral'} />
        <BucketTile
          label="Due 30-90d"
          value={buckets.due_90}
          tone={buckets.due_90 > 0 ? 'warn' : 'neutral'}
        />
        <BucketTile
          label="Due 7-30d"
          value={buckets.due_30}
          tone={buckets.due_30 > 0 ? 'warn' : 'neutral'}
        />
        <BucketTile
          label="Due ≤7d / overdue"
          value={buckets.due_7 + buckets.overdue}
          tone={buckets.due_7 + buckets.overdue > 0 ? 'bad' : 'neutral'}
        />
      </div>
    </section>
  );
}

function BucketTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'good' | 'warn' | 'bad' | 'neutral';
}) {
  const toneClass = {
    good: 'text-emerald-700',
    warn: 'text-amber-700',
    bad: 'text-red-700',
    neutral: 'text-slate-900',
  }[tone];
  return (
    <div className="bg-slate-50 rounded-lg px-3 py-2">
      <div className={`text-2xl font-bold ${toneClass}`}>{value}</div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mt-0.5">
        {label}
      </div>
    </div>
  );
}

function EquipmentList({ items }: { items: EquipmentItem[] }) {
  return (
    <section className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <h2 className="font-bold text-slate-900">Equipment Items</h2>
        <span className="text-xs text-slate-500">
          {items.length} active · sorted by urgency
        </span>
      </div>

      {/* Mobile-first: card list. lg:+ table */}
      <div className="divide-y divide-slate-50">
        {items.map((item) => {
          const days = daysUntilDue(item.next_service_due);
          const bucket = expiryBucket(days);
          const cfg = BUCKET_CONFIG[bucket];
          const icon = CATEGORY_ICON[item.category] ?? '🛠️';
          const cleanName = item.name.replace(/^\[DEMO\]\s*/, '');

          return (
            <div
              key={item.id}
              className="px-5 sm:px-6 py-4 flex items-center gap-3 sm:gap-4"
            >
              <span className="text-2xl shrink-0" aria-hidden="true">
                {icon}
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-slate-900 truncate">{cleanName}</div>
                <div className="text-slate-500 text-xs sm:text-sm truncate">
                  {CATEGORY_LABEL[item.category] ?? item.category}
                  {item.location_description ? ` · ${item.location_description}` : ''}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${cfg.cls}`}
                >
                  {cfg.label(days)}
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  Due {item.next_service_due}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
