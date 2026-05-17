'use client';

/**
 * /incidents — unified Incidents view: Active / Past / Scheduled.
 *
 *  - Active   : ACTIVE+CONTAINED, 15s poll. Uses GET /incidents with NO
 *               params → byte-identical to the original behaviour
 *               (backward-compatible; the param-additive api default).
 *  - Past     : RESOLVED/CLOSED with text search + time-range presets +
 *               status chips + result count + Clear-all (industry filter
 *               pattern). Opt-in api params.
 *  - Scheduled: upcoming drills (the only "future-scheduled" incident-type
 *               entity; reuses GET /drill-sessions, read-only, →/drills).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '../../components/AppShell';
import { DeclareIncidentButton } from '../../components/DeclareIncidentModal';
import { apiFetch } from '../../lib/api';

interface Incident {
  id: string;
  incident_type: string;
  incident_subtype?: string | null;
  severity: 'SEV1' | 'SEV2' | 'SEV3';
  status: 'ACTIVE' | 'CONTAINED' | 'RESOLVED' | 'CLOSED';
  declared_at: string;
  resolved_at?: string | null;
  zones: { name: string } | null;
  staff: { name: string } | null;
}
interface DrillRow {
  id: string;
  status: string;
  scheduled_for: string | null;
  drill_type?: string | null;
}

const TYPE_ICON: Record<string, string> = {
  FIRE: '🔥', MEDICAL: '🏥', SECURITY: '🔒', EVACUATION: '🚨', STRUCTURAL: '🏗️', OTHER: '⚠️',
};
const SEV_CONFIG: Record<string, { label: string; cls: string }> = {
  SEV1: { label: 'SEV 1 — Critical', cls: 'bg-red-600 text-white' },
  SEV2: { label: 'SEV 2 — Serious', cls: 'bg-orange-500 text-white' },
  SEV3: { label: 'SEV 3 — Minor', cls: 'bg-yellow-400 text-slate-900' },
};
const STATUS_CLS: Record<string, string> = {
  ACTIVE: 'bg-red-100 text-red-700',
  CONTAINED: 'bg-amber-100 text-amber-700',
  RESOLVED: 'bg-green-100 text-green-700',
  CLOSED: 'bg-slate-100 text-slate-600',
};
const RANGES = [
  { key: '24h', label: 'Last 24h', ms: 864e5 },
  { key: '7d', label: 'Last 7 days', ms: 7 * 864e5 },
  { key: '30d', label: 'Last 30 days', ms: 30 * 864e5 },
  { key: 'all', label: 'All time', ms: 0 },
  { key: 'custom', label: 'Custom', ms: -1 },
] as const;
type RangeKey = (typeof RANGES)[number]['key'];

function elapsed(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function IncidentCard({ inc }: { inc: Incident }) {
  const sev = SEV_CONFIG[inc.severity];
  return (
    <Link
      href={`/incidents/${inc.id}`}
      className="block bg-white rounded-2xl shadow-sm border border-slate-100 p-5 hover:border-slate-300 hover:shadow-md transition-all"
    >
      <div className="flex items-start gap-4">
        <span className="text-3xl shrink-0">{TYPE_ICON[inc.incident_type] ?? '⚠️'}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="font-bold text-slate-900">
              {inc.incident_type}
              {inc.incident_subtype ? ` · ${inc.incident_subtype}` : ''}
            </h3>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${sev?.cls}`}>{sev?.label}</span>
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
          <span className="text-xs text-slate-400 font-mono">{inc.id.slice(0, 8).toUpperCase()}</span>
          <span className="text-xs text-blue-600 font-medium">View timeline →</span>
        </div>
      </div>
    </Link>
  );
}

export default function IncidentsPage() {
  const [tab, setTab] = useState<'active' | 'past' | 'scheduled'>('active');

  // Active (unchanged behaviour + 15s poll)
  const [active, setActive] = useState<Incident[]>([]);
  const [activeLoading, setActiveLoading] = useState(true);
  useEffect(() => {
    const load = async () => {
      const { data } = await apiFetch<Incident[]>('/incidents');
      setActiveLoading(false);
      if (data) setActive(data);
    };
    load();
    const iv = setInterval(load, 15_000);
    return () => clearInterval(iv);
  }, []);

  // Past (search + filters)
  const [q, setQ] = useState('');
  const [range, setRange] = useState<RangeKey>('30d');
  const [cFrom, setCFrom] = useState('');
  const [cTo, setCTo] = useState('');
  const [statusSel, setStatusSel] = useState<Record<string, boolean>>({ RESOLVED: true, CLOSED: true });
  const [past, setPast] = useState<Incident[]>([]);
  const [pastLoading, setPastLoading] = useState(false);
  const [pastErr, setPastErr] = useState('');
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadPast = useCallback(async () => {
    setPastLoading(true);
    setPastErr('');
    const params = new URLSearchParams();
    const sel = Object.entries(statusSel).filter(([, v]) => v).map(([k]) => k);
    params.set('status', sel.length ? sel.join(',') : 'RESOLVED,CLOSED');
    const r = RANGES.find((x) => x.key === range)!;
    if (range === 'custom') {
      if (cFrom) params.set('from', new Date(cFrom).toISOString());
      if (cTo) params.set('to', new Date(cTo + 'T23:59:59').toISOString());
    } else if (r.ms > 0) {
      params.set('from', new Date(Date.now() - r.ms).toISOString());
    }
    if (q.trim()) params.set('q', q.trim());
    params.set('limit', '200');
    const { data, error } = await apiFetch<Incident[]>(`/incidents?${params.toString()}`);
    setPastLoading(false);
    if (error || !data) { setPastErr(error ?? 'Load failed'); return; }
    setPast(data);
  }, [q, range, cFrom, cTo, statusSel]);

  useEffect(() => {
    if (tab !== 'past') return;
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(loadPast, 350);
    return () => {
      if (debRef.current) clearTimeout(debRef.current);
    };
  }, [tab, loadPast]);

  // Scheduled (drills)
  const [drills, setDrills] = useState<DrillRow[]>([]);
  const [drillsLoading, setDrillsLoading] = useState(false);
  useEffect(() => {
    if (tab !== 'scheduled') return;
    setDrillsLoading(true);
    apiFetch<DrillRow[]>('/drill-sessions').then(({ data }) => {
      setDrillsLoading(false);
      setDrills((data ?? []).filter((d) => d.status === 'SCHEDULED'));
    });
  }, [tab]);

  const clearFilters = () => {
    setQ('');
    setRange('30d');
    setCFrom('');
    setCTo('');
    setStatusSel({ RESOLVED: true, CLOSED: true });
  };
  const filtersDirty =
    q !== '' || range !== '30d' || !statusSel.RESOLVED || !statusSel.CLOSED;

  const TabBtn = ({ k, label }: { k: typeof tab; label: string }) => (
    <button
      type="button"
      onClick={() => setTab(k)}
      className={`px-4 py-2 text-sm font-semibold rounded-lg transition ${
        tab === k ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
      }`}
    >
      {label}
    </button>
  );

  return (
    <AppShell>
      <div className="p-8 max-w-4xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Incidents</h1>
            <p className="text-slate-500 text-sm mt-1">Current, past &amp; scheduled — across this venue</p>
          </div>
          <DeclareIncidentButton />
        </div>

        <div className="mb-5 flex gap-2">
          <TabBtn k="active" label={`Active${active.length ? ` (${active.length})` : ''}`} />
          <TabBtn k="past" label="Past" />
          <TabBtn k="scheduled" label="Scheduled" />
        </div>

        {/* ── Active ── */}
        {tab === 'active' && (
          <>
            {activeLoading && <div className="text-slate-400 text-sm">Loading…</div>}
            {!activeLoading && active.length === 0 && (
              <div className="text-center py-24">
                <div className="text-4xl mb-3">✅</div>
                <div className="text-slate-500 font-medium">No active incidents</div>
                <div className="text-slate-400 text-sm mt-1">All clear at this venue</div>
              </div>
            )}
            <div className="space-y-3">
              {active.map((inc) => <IncidentCard key={inc.id} inc={inc} />)}
            </div>
          </>
        )}

        {/* ── Past ── */}
        {tab === 'past' && (
          <>
            <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search type, sub-type, zone, description, or ID…"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <div className="flex flex-wrap gap-2">
                {RANGES.map((r) => (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => setRange(r.key)}
                    className={`rounded-full px-3 py-1 text-xs font-medium border transition ${
                      range === r.key
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              {range === 'custom' && (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <input type="date" value={cFrom} onChange={(e) => setCFrom(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1" />
                  <span className="text-slate-400">to</span>
                  <input type="date" value={cTo} onChange={(e) => setCTo(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1" />
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                {['RESOLVED', 'CLOSED'].map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusSel((s) => ({ ...s, [st]: !s[st] }))}
                    className={`rounded-full px-3 py-1 text-xs font-semibold border transition ${
                      statusSel[st]
                        ? 'border-green-400 bg-green-50 text-green-800'
                        : 'border-slate-300 bg-white text-slate-400'
                    }`}
                  >
                    {statusSel[st] ? '✓ ' : ''}{st}
                  </button>
                ))}
                <span className="ml-auto text-xs text-slate-500">
                  {pastLoading ? 'Searching…' : `${past.length} result${past.length === 1 ? '' : 's'}`}
                </span>
                {filtersDirty && (
                  <button type="button" onClick={clearFilters} className="text-xs font-medium text-blue-600 hover:underline">
                    Clear all
                  </button>
                )}
              </div>
            </div>
            {pastErr && <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">{pastErr}</div>}
            {!pastLoading && past.length === 0 && !pastErr && (
              <div className="text-center py-16 text-slate-400 text-sm">No past incidents match these filters.</div>
            )}
            <div className="space-y-3">
              {past.map((inc) => <IncidentCard key={inc.id} inc={inc} />)}
            </div>
          </>
        )}

        {/* ── Scheduled (drills) ── */}
        {tab === 'scheduled' && (
          <>
            <p className="mb-4 text-sm text-slate-500">
              Upcoming scheduled drills (incident-response exercises).{' '}
              <Link href="/drills" className="text-blue-600 hover:underline">Manage in Drills →</Link>
            </p>
            {drillsLoading && <div className="text-slate-400 text-sm">Loading…</div>}
            {!drillsLoading && drills.length === 0 && (
              <div className="text-center py-16 text-slate-400 text-sm">No drills scheduled.</div>
            )}
            <div className="space-y-3">
              {drills.map((d) => (
                <Link
                  key={d.id}
                  href={`/drills/${d.id}`}
                  className="block bg-white rounded-2xl border border-slate-100 p-5 hover:border-slate-300 hover:shadow-md transition-all"
                >
                  <div className="flex items-center gap-4">
                    <span className="text-2xl">🗓️</span>
                    <div className="flex-1">
                      <div className="font-semibold text-slate-900">
                        {(d.drill_type ?? 'Drill').toString()} drill
                      </div>
                      <div className="text-sm text-slate-500">
                        Scheduled {d.scheduled_for ? new Date(d.scheduled_for).toLocaleString('en-IN') : '—'}
                      </div>
                    </div>
                    <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                      SCHEDULED
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
