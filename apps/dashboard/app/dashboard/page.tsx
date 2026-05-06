'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { apiFetch } from '../../lib/api';

interface AnalyticsSummary {
  health_score: number;
  active_incidents: number;
  active_incident_list: {
    id: string;
    incident_type: string;
    severity: string;
    declared_at: string;
    zones: { name: string } | null;
  }[];
  tasks_today: { total: number; complete: number; missed: number; pending: number; compliance_rate: number };
  staff: { total: number; active: number };
  zones: { total: number; all_clear: number; attention: number; incident_active: number };
}

const TYPE_ICON: Record<string, string> = {
  FIRE: '🔥', MEDICAL: '🏥', SECURITY: '🔒', EVACUATION: '🚨', STRUCTURAL: '🏗️', OTHER: '⚠️',
};
const SEV_BG: Record<string, string> = {
  SEV1: 'bg-red-100 text-red-700 border-red-200',
  SEV2: 'bg-orange-100 text-orange-700 border-orange-200',
  SEV3: 'bg-yellow-100 text-yellow-700 border-yellow-200',
};

function HealthRing({ score }: { score: number }) {
  const r = 48;
  const circ = 2 * Math.PI * r;
  const filled = (score / 100) * circ;
  const color = score >= 80 ? '#16a34a' : score >= 60 ? '#d97706' : '#dc2626';
  return (
    <svg width={120} height={120} className="rotate-[-90deg]">
      <circle cx={60} cy={60} r={r} fill="none" stroke="#e2e8f0" strokeWidth={10} />
      <circle
        cx={60} cy={60} r={r} fill="none" stroke={color} strokeWidth={10}
        strokeDasharray={`${filled} ${circ - filled}`}
        strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.6s ease' }}
      />
    </svg>
  );
}

/* ─── HealthScoreBreakdown — BR-14 component visualisation ──────────────────
 *
 * Five-component breakdown per Architecture v7 BR-14:
 *   Tasks 40 / Incidents 25 / Certs 15 / Equipment 10 / Drills 10
 *
 * Phase 1 (May 2026): Tasks and Incidents are LIVE (computed client-side
 * from /analytics/dashboard payload). The remaining three components
 * render as Phase B placeholders with explicit "ships June" badge.
 *
 * Phase B June: api endpoint will be updated to return the full 5-component
 * weighted score; this component swaps to read from it instead of computing.
 */

interface ComponentScore {
  key: 'tasks' | 'incidents' | 'certifications' | 'equipment' | 'drills';
  label: string;
  weight: number;          // % weight in the BR-14 formula
  score: number | null;    // 0-100 if live; null if Phase B not-yet-wired
  status: 'live' | 'pending';
  detail?: string;
}

function computeIncidentScore(actives: { severity: string }[]): number {
  // Penalty model:
  //   SEV1 = -30 each, SEV2 = -15 each, SEV3 = -5 each
  // The api filters to ACTIVE+CONTAINED before returning; we apply uniform
  // penalty here as a conservative client-side approximation. Phase B api
  // update will return per-incident status so we can split ACTIVE vs
  // CONTAINED precisely.
  const sev1 = actives.filter((i) => i.severity === 'SEV1').length;
  const sev2 = actives.filter((i) => i.severity === 'SEV2').length;
  const sev3 = actives.filter((i) => i.severity === 'SEV3').length;
  return Math.max(0, 100 - sev1 * 30 - sev2 * 15 - sev3 * 5);
}

function HealthScoreBreakdown({ data }: { data: AnalyticsSummary }) {
  const taskScore = data.tasks_today.compliance_rate;
  const incidentScore = computeIncidentScore(
    data.active_incident_list.map((i) => ({ severity: i.severity })),
  );

  const components: ComponentScore[] = [
    {
      key: 'tasks',
      label: 'Tasks',
      weight: 40,
      score: taskScore,
      status: 'live',
      detail:
        data.tasks_today.total === 0
          ? 'No tasks scheduled today'
          : `${data.tasks_today.complete}/${data.tasks_today.total} complete today`,
    },
    {
      key: 'incidents',
      label: 'Incidents',
      weight: 25,
      score: incidentScore,
      status: 'live',
      // api returns ACTIVE+CONTAINED in active_incidents count; "open" is the
      // accurate term covering both states.
      detail:
        data.active_incidents === 0
          ? 'No open incidents'
          : `${data.active_incidents} open`,
    },
    {
      key: 'certifications',
      label: 'Certifications',
      weight: 15,
      score: null,
      status: 'pending',
      detail: 'Module activates Phase B (June)',
    },
    {
      key: 'equipment',
      label: 'Equipment',
      weight: 10,
      score: null,
      status: 'pending',
      detail: 'Module activates Phase B (June)',
    },
    {
      key: 'drills',
      label: 'Drills',
      weight: 10,
      score: null,
      status: 'pending',
      detail: 'Module activates Phase B (June)',
    },
  ];

  const liveWeight = components
    .filter((c) => c.status === 'live')
    .reduce((sum, c) => sum + c.weight, 0);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
      <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-bold text-slate-900">Health Score Breakdown</h2>
          <p className="text-slate-500 text-xs mt-0.5">
            Component weighting per BR-14 — Architecture v7
          </p>
        </div>
        <div className="text-xs text-slate-500 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          {liveWeight}% of full surface live
        </div>
      </div>

      <div className="divide-y divide-slate-50">
        {components.map((c) => (
          <ComponentRow key={c.key} component={c} />
        ))}
      </div>

      <div className="px-4 sm:px-6 py-3 bg-slate-50 border-t border-slate-100 text-xs text-slate-500">
        <span className="font-medium text-slate-700">Tasks + Incidents</span> compute
        live today. Certifications, Equipment and Drills modules ship in Phase B
        (June 2026) per <span className="font-mono">JUNE-2026-REVIEW-REQUIRED.md</span>.
      </div>
    </div>
  );
}

function ComponentRow({ component }: { component: ComponentScore }) {
  const isLive = component.status === 'live';
  const score = component.score ?? 0;
  const barColor =
    !isLive
      ? 'bg-slate-200'
      : score >= 80
        ? 'bg-emerald-500'
        : score >= 60
          ? 'bg-amber-500'
          : 'bg-red-500';
  const scoreText = !isLive ? '—' : `${score}`;
  const scoreColor = !isLive
    ? 'text-slate-400'
    : score >= 80
      ? 'text-emerald-700'
      : score >= 60
        ? 'text-amber-700'
        : 'text-red-700';

  return (
    <div className="px-4 sm:px-6 py-3 sm:py-4 flex items-center gap-3 sm:gap-4">
      {/* Label + weight */}
      <div className="w-32 sm:w-40 shrink-0">
        <div className="font-semibold text-slate-900 text-sm">{component.label}</div>
        <div className="text-xs text-slate-500">{component.weight}% weight</div>
      </div>

      {/* Progress bar */}
      <div className="flex-1 min-w-0">
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-2 rounded-full transition-all ${barColor} ${
              !isLive ? 'opacity-30' : ''
            }`}
            style={{ width: isLive ? `${score}%` : '100%' }}
          />
        </div>
        <div className="text-xs text-slate-500 mt-1 truncate">{component.detail}</div>
      </div>

      {/* Score + status */}
      <div className="text-right shrink-0">
        <div className={`text-2xl font-black ${scoreColor}`}>{scoreText}</div>
        {isLive ? (
          <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
            Live
          </span>
        ) : (
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
            Phase B
          </span>
        )}
      </div>
    </div>
  );
}

function elapsed(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
}

export default function DashboardPage() {
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      const { data: d, error: e } = await apiFetch<AnalyticsSummary>('/analytics/dashboard');
      setLoading(false);
      if (e || !d) { setError(e ?? 'Load failed'); return; }
      setData(d);
    };
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <AppShell>
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <div className="mb-6 lg:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500 text-sm mt-1">Live venue safety overview · refreshes every 30s</p>
        </div>

        {loading && (
          <div className="flex items-center justify-center h-64 text-slate-400">Loading…</div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">{error}</div>
        )}

        {data && (
          <>
            {/* Active incident alert banner */}
            {data.active_incidents > 0 && (
              <div className="mb-4 sm:mb-6 bg-red-600 rounded-2xl p-4 flex items-center gap-3 shadow-lg shadow-red-900/20">
                <span className="text-2xl shrink-0">🚨</span>
                <div className="min-w-0 flex-1">
                  <div className="text-white font-bold truncate">
                    {data.active_incidents} Active Incident{data.active_incidents > 1 ? 's' : ''}
                  </div>
                  <div className="text-red-200 text-sm">Tap Incidents in menu for detail</div>
                </div>
              </div>
            )}

            {/* KPI row — vertical stack on tiny phones, 2-col tablet, 4-col desktop */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4 sm:mb-6 lg:grid-cols-4">
              {/* Health score — full width on tiny phones, full row on tablet, single tile on desktop */}
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex flex-col items-center sm:col-span-2 lg:col-span-1">
                <div className="relative">
                  <HealthRing score={data.health_score} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-black text-slate-900">{data.health_score}</span>
                    <span className="text-xs text-slate-400 font-medium">Health</span>
                  </div>
                </div>
                <p className="text-slate-600 text-xs font-semibold mt-2 uppercase tracking-wide">Safety Score</p>
              </div>

              {/* Task compliance */}
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-2">Task Compliance</p>
                <p className="text-3xl font-black text-slate-900">{data.tasks_today.compliance_rate}%</p>
                <div className="mt-3 bg-slate-100 rounded-full h-2">
                  <div
                    className="h-2 rounded-full bg-green-500 transition-all"
                    style={{ width: `${data.tasks_today.compliance_rate}%` }}
                  />
                </div>
                <div className="mt-2 flex gap-3 text-xs text-slate-500">
                  <span className="text-green-600 font-medium">✓ {data.tasks_today.complete}</span>
                  <span className="text-red-500 font-medium">✗ {data.tasks_today.missed}</span>
                  <span>{data.tasks_today.pending} pending</span>
                </div>
              </div>

              {/* Zones */}
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-3">Zone Status</p>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-green-600 font-medium">● All Clear</span>
                    <span className="font-bold text-slate-800">{data.zones.all_clear}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-amber-600 font-medium">● Attention</span>
                    <span className="font-bold text-slate-800">{data.zones.attention}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-red-600 font-medium">● Incident</span>
                    <span className="font-bold text-slate-800">{data.zones.incident_active}</span>
                  </div>
                </div>
              </div>

              {/* Staff */}
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-2">Staff</p>
                <p className="text-3xl font-black text-slate-900">{data.staff.active}</p>
                <p className="text-slate-500 text-sm">of {data.staff.total} total active</p>
              </div>
            </div>

            {/* BR-14 Health Score Breakdown — 5-component visualisation */}
            <div className="mb-4 sm:mb-6">
              <HealthScoreBreakdown data={data} />
            </div>

            {/* Active incident list */}
            {data.active_incident_list.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
                <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100">
                  <h2 className="font-bold text-slate-900">Active Incidents</h2>
                </div>
                <div className="divide-y divide-slate-50">
                  {data.active_incident_list.map(inc => (
                    <div key={inc.id} className="px-4 sm:px-6 py-3 sm:py-4 flex items-center gap-3 sm:gap-4">
                      <span className="text-2xl shrink-0" aria-hidden="true">{TYPE_ICON[inc.incident_type] ?? '⚠️'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-900 truncate">{inc.incident_type}</div>
                        <div className="text-slate-500 text-xs sm:text-sm truncate">{inc.zones?.name ?? 'Unspecified zone'} · {elapsed(inc.declared_at)}</div>
                      </div>
                      <span className={`px-2 py-1 sm:px-3 rounded-full text-[10px] sm:text-xs font-bold border shrink-0 ${SEV_BG[inc.severity] ?? ''}`}>
                        {inc.severity}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
