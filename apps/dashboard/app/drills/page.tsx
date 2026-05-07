'use client';

/**
 * /drills — venue drill compliance view (BR-A).
 *
 * Reads /v1/drill-sessions which returns the full drill list.
 * Compliance score = recency of last completed drill (best-practice
 * quarterly cadence).
 *
 * Refs: BR-A (Drill Management Module), BR-14 (Health Score 10% weight).
 */

import { useEffect, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { apiFetch } from '../../lib/api';

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface DrillSession {
  id: string;
  venue_id: string;
  building_id: string | null;
  drill_type: string;
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  scheduled_for: string;
  started_at: string | null;
  ended_at: string | null;
  total_staff_expected: number;
  total_staff_acknowledged: number;
  total_staff_safe: number;
  total_staff_missed: number;
  duration_seconds: number | null;
  notes: string | null;
}

/* ─── Visual config ──────────────────────────────────────────────────────── */

const DRILL_TYPE_LABEL: Record<string, string> = {
  FIRE_EVACUATION: 'Fire Evacuation',
  EARTHQUAKE: 'Earthquake',
  BOMB_THREAT: 'Bomb Threat',
  MEDICAL_EMERGENCY: 'Medical Emergency',
  PARTIAL_EVACUATION: 'Partial Evacuation',
  FULL_EVACUATION: 'Full Evacuation',
  OTHER: 'Other',
};

const DRILL_TYPE_ICON: Record<string, string> = {
  FIRE_EVACUATION: '🔥',
  EARTHQUAKE: '🌍',
  BOMB_THREAT: '💣',
  MEDICAL_EMERGENCY: '🏥',
  PARTIAL_EVACUATION: '🚪',
  FULL_EVACUATION: '🚨',
  OTHER: '⚠️',
};

const STATUS_CLS: Record<string, string> = {
  SCHEDULED: 'bg-blue-100 text-blue-700 border border-blue-200',
  IN_PROGRESS: 'bg-amber-100 text-amber-700 border border-amber-200',
  COMPLETED: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
  CANCELLED: 'bg-slate-100 text-slate-500 border border-slate-200',
};

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds < 0) return '—';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function computeScore(drills: DrillSession[]): number {
  const completed = drills
    .filter((d) => d.status === 'COMPLETED' && d.ended_at !== null)
    .sort((a, b) => (b.ended_at ?? '').localeCompare(a.ended_at ?? ''));
  if (completed.length === 0) return 0;
  const days = daysSince(completed[0].ended_at!);
  if (days <= 90) return 100;
  if (days <= 180) return 75;
  if (days <= 270) return 50;
  if (days <= 365) return 25;
  return 0;
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function DrillsPage() {
  const [drills, setDrills] = useState<DrillSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data, error: e } = await apiFetch<DrillSession[]>('/drill-sessions');
      setLoading(false);
      if (e) setError(e);
      else setDrills(data ?? []);
    };
    void load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  const upcoming = drills.filter((d) => d.status === 'SCHEDULED');
  const inProgress = drills.filter((d) => d.status === 'IN_PROGRESS');
  const completed = drills
    .filter((d) => d.status === 'COMPLETED' && d.ended_at !== null)
    .sort((a, b) => (b.ended_at ?? '').localeCompare(a.ended_at ?? ''));
  const score = computeScore(drills);
  const daysSinceLast = completed[0]?.ended_at ? daysSince(completed[0].ended_at) : null;
  const scoreColour =
    score >= 80 ? 'text-emerald-700' : score >= 60 ? 'text-amber-700' : 'text-red-700';

  return (
    <AppShell>
      <div
        className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <div className="mb-4 sm:mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Drills</h1>
          <p className="text-slate-500 text-sm mt-1">
            Drill compliance · best-practice quarterly cadence (90-day windows)
          </p>
        </div>

        {loading && <div className="text-slate-400 text-sm">Loading drills…</div>}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
            {error}
          </div>
        )}

        {!loading && !error && drills.length === 0 && (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">🔥</div>
            <div className="font-semibold text-slate-700">No drills scheduled yet</div>
            <p className="text-slate-500 text-sm mt-2 max-w-md mx-auto">
              Schedule your first drill via the Operations Console to start
              tracking compliance for Fire NOC / NABH audits.
            </p>
          </div>
        )}

        {!loading && !error && drills.length > 0 && (
          <>
            {/* Compliance summary */}
            <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 sm:p-6 mb-4 sm:mb-6">
              <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
                <div>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Drill Compliance Score
                  </h2>
                  <p className="text-slate-400 text-xs mt-0.5">
                    Score by recency of last completed drill
                  </p>
                </div>
                <div className={`text-4xl font-black ${scoreColour}`}>{score}</div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                <Tile
                  label="Last drill"
                  value={daysSinceLast === null ? '—' : `${daysSinceLast}d ago`}
                  tone={
                    daysSinceLast === null || daysSinceLast > 180
                      ? 'bad'
                      : daysSinceLast > 90
                        ? 'warn'
                        : 'good'
                  }
                />
                <Tile
                  label="Upcoming"
                  value={upcoming.length}
                  tone={upcoming.length > 0 ? 'good' : 'neutral'}
                />
                <Tile label="Completed" value={completed.length} tone="neutral" />
                <Tile label="Total" value={drills.length} tone="neutral" />
              </div>
            </section>

            {inProgress.length > 0 && (
              <Section title="In Progress" badge="🔴" rows={inProgress} />
            )}
            {upcoming.length > 0 && (
              <Section title="Upcoming" rows={upcoming} />
            )}
            {completed.length > 0 && (
              <Section title="Completed" rows={completed.slice(0, 20)} />
            )}
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
  value: number | string;
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

function Section({ title, badge, rows }: { title: string; badge?: string; rows: DrillSession[] }) {
  return (
    <section className="mb-4 sm:mb-6">
      <h2 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
        {badge && <span>{badge}</span>}
        {title} <span className="text-slate-400 font-normal">({rows.length})</span>
      </h2>
      <div className="space-y-2">
        {rows.map((d) => (
          <DrillRow key={d.id} drill={d} />
        ))}
      </div>
    </section>
  );
}

function DrillRow({ drill }: { drill: DrillSession }) {
  const icon = DRILL_TYPE_ICON[drill.drill_type] ?? '⚠️';
  const ackPercent =
    drill.total_staff_expected > 0
      ? Math.round((drill.total_staff_safe / drill.total_staff_expected) * 100)
      : 0;
  const cleanNotes = drill.notes?.replace(/^\[DEMO\]\s*/, '');

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="text-2xl shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-bold text-slate-900">
              {DRILL_TYPE_LABEL[drill.drill_type] ?? drill.drill_type}
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_CLS[drill.status]}`}
            >
              {drill.status}
            </span>
          </div>
          <div className="text-xs text-slate-500 flex flex-wrap gap-x-4 gap-y-1">
            <span>📅 {formatDateTime(drill.scheduled_for)}</span>
            {drill.duration_seconds !== null && (
              <span>⏱ {formatDuration(drill.duration_seconds)}</span>
            )}
          </div>
          {drill.status === 'COMPLETED' && drill.total_staff_expected > 0 && (
            <div className="text-xs mt-1.5 flex flex-wrap gap-x-3">
              <span className="text-slate-700 font-medium">
                Participation {ackPercent}% ({drill.total_staff_safe}/
                {drill.total_staff_expected})
              </span>
              {drill.total_staff_missed > 0 && (
                <span className="text-red-600 font-medium">
                  · {drill.total_staff_missed} missed
                </span>
              )}
            </div>
          )}
          {cleanNotes && (
            <p className="text-xs text-slate-600 mt-1.5 italic">"{cleanNotes}"</p>
          )}
        </div>
      </div>
    </div>
  );
}
