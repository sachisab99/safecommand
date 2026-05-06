'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '../../components/AppShell';
import { apiFetch } from '../../lib/api';

interface Incident {
  id: string;
  incident_type: string;
  severity: 'SEV1' | 'SEV2' | 'SEV3';
  status: 'ACTIVE' | 'CONTAINED' | 'RESOLVED' | 'CLOSED';
  declared_at: string;
  zones: { name: string } | null;
  staff: { name: string } | null;
}

const TYPE_ICON: Record<string, string> = {
  FIRE: '🔥', MEDICAL: '🏥', SECURITY: '🔒', EVACUATION: '🚨', STRUCTURAL: '🏗️', OTHER: '⚠️',
};

const SEV_CONFIG: Record<string, { label: string; cls: string }> = {
  SEV1: { label: 'SEV 1 — Critical', cls: 'bg-red-600 text-white' },
  SEV2: { label: 'SEV 2 — Serious',  cls: 'bg-orange-500 text-white' },
  SEV3: { label: 'SEV 3 — Minor',    cls: 'bg-yellow-400 text-slate-900' },
};

const STATUS_CLS: Record<string, string> = {
  ACTIVE:    'bg-red-100 text-red-700',
  CONTAINED: 'bg-amber-100 text-amber-700',
  RESOLVED:  'bg-green-100 text-green-700',
  CLOSED:    'bg-slate-100 text-slate-600',
};

function elapsed(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      const { data, error: e } = await apiFetch<Incident[]>('/incidents');
      setLoading(false);
      if (e || !data) { setError(e ?? 'Load failed'); return; }
      setIncidents(data);
    };
    load();
    const iv = setInterval(load, 15_000);
    return () => clearInterval(iv);
  }, []);

  return (
    <AppShell>
      <div className="p-8 max-w-4xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Incidents</h1>
            <p className="text-slate-500 text-sm mt-1">Active and contained incidents · refreshes every 15s</p>
          </div>
          {incidents.filter(i => i.status === 'ACTIVE').length > 0 && (
            <div className="flex items-center gap-2 bg-red-100 text-red-700 px-3 py-1.5 rounded-full text-sm font-bold">
              <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
              {incidents.filter(i => i.status === 'ACTIVE').length} ACTIVE
            </div>
          )}
        </div>

        {loading && <div className="text-slate-400 text-sm">Loading…</div>}
        {error && <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">{error}</div>}

        {!loading && incidents.length === 0 && (
          <div className="text-center py-24">
            <div className="text-4xl mb-3">✅</div>
            <div className="text-slate-500 font-medium">No active incidents</div>
            <div className="text-slate-400 text-sm mt-1">All clear at this venue</div>
          </div>
        )}

        <div className="space-y-3">
          {incidents.map(inc => {
            const sev = SEV_CONFIG[inc.severity];
            return (
              <Link
                key={inc.id}
                href={`/incidents/${inc.id}`}
                className="block bg-white rounded-2xl shadow-sm border border-slate-100 p-5 hover:border-slate-300 hover:shadow-md transition-all"
              >
                <div className="flex items-start gap-4">
                  <span className="text-3xl shrink-0">{TYPE_ICON[inc.incident_type] ?? '⚠️'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="font-bold text-slate-900">{inc.incident_type}</h3>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${sev?.cls}`}>
                        {sev?.label}
                      </span>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_CLS[inc.status]}`}>
                        {inc.status}
                      </span>
                    </div>
                    <div className="flex gap-3 text-sm text-slate-500 flex-wrap">
                      {inc.zones?.name && <span>📍 {inc.zones.name}</span>}
                      {inc.staff?.name && <span>Declared by {inc.staff.name}</span>}
                      <span className="text-slate-400">·</span>
                      <span>{elapsed(inc.declared_at)}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0 text-right">
                    <span className="text-xs text-slate-400 font-mono">
                      {inc.id.slice(0, 8).toUpperCase()}
                    </span>
                    <span className="text-xs text-blue-600 font-medium">
                      View timeline →
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
