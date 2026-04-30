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
      <div className="p-8 max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
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
              <div className="mb-6 bg-red-600 rounded-2xl p-4 flex items-center gap-3 shadow-lg shadow-red-900/20">
                <span className="text-2xl">🚨</span>
                <div>
                  <div className="text-white font-bold">
                    {data.active_incidents} Active Incident{data.active_incidents > 1 ? 's' : ''}
                  </div>
                  <div className="text-red-200 text-sm">Go to Incidents tab for full detail</div>
                </div>
              </div>
            )}

            {/* KPI row */}
            <div className="grid grid-cols-2 gap-4 mb-6 lg:grid-cols-4">
              {/* Health score */}
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex flex-col items-center col-span-2 lg:col-span-1">
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

            {/* Active incident list */}
            {data.active_incident_list.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
                <div className="px-6 py-4 border-b border-slate-100">
                  <h2 className="font-bold text-slate-900">Active Incidents</h2>
                </div>
                <div className="divide-y divide-slate-50">
                  {data.active_incident_list.map(inc => (
                    <div key={inc.id} className="px-6 py-4 flex items-center gap-4">
                      <span className="text-2xl">{TYPE_ICON[inc.incident_type] ?? '⚠️'}</span>
                      <div className="flex-1">
                        <div className="font-semibold text-slate-900">{inc.incident_type}</div>
                        <div className="text-slate-500 text-sm">{inc.zones?.name ?? 'Unspecified zone'} · {elapsed(inc.declared_at)}</div>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold border ${SEV_BG[inc.severity] ?? ''}`}>
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
