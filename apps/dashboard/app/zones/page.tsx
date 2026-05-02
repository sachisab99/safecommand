'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { apiFetch } from '../../lib/api';
import { getSession } from '../../lib/auth';

interface ZoneAssignment {
  staff: { id: string; name: string; role: string }[];
}
interface Zone {
  id: string;
  name: string;
  zone_type: string;
  current_status: 'ALL_CLEAR' | 'ATTENTION' | 'INCIDENT_ACTIVE';
  two_person_required: boolean;
  staff_zone_assignments: ZoneAssignment[];
}

type IncidentType = 'FIRE' | 'MEDICAL' | 'SECURITY' | 'EVACUATION' | 'STRUCTURAL' | 'OTHER';
type Severity = 'SEV1' | 'SEV2' | 'SEV3';
type IncidentStatus = 'ACTIVE' | 'CONTAINED' | 'RESOLVED' | 'CLOSED';

interface Incident {
  id: string;
  zone_id: string | null;
  incident_type: IncidentType;
  severity: Severity;
  status: IncidentStatus;
  declared_at: string;
}

// Severity owns color (dominant signal). SEV1 pulses, SEV2 solid, SEV3 outline.
// CONTAINED uses purple to show it's stabilized but still open.
// ALL_CLEAR is slate (not green) — fights "everything's fine" alarm fatigue (hospital-grade).
type DisplayState = 'SEV1' | 'SEV2' | 'SEV3' | 'CONTAINED' | 'ATTENTION' | 'ALL_CLEAR';

const STATE_CONFIG: Record<DisplayState, {
  label: string; ring: string; bg: string; text: string; dot: string; pulse: boolean;
}> = {
  SEV1:       { label: 'SEV1 Critical',  ring: 'border-red-500',    bg: 'bg-red-50',    text: 'text-red-700',    dot: 'bg-red-500',    pulse: true  },
  SEV2:       { label: 'SEV2 Urgent',    ring: 'border-orange-500', bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500', pulse: false },
  SEV3:       { label: 'SEV3 Advisory',  ring: 'border-amber-400',  bg: 'bg-amber-50',  text: 'text-amber-700',  dot: 'bg-amber-400',  pulse: false },
  CONTAINED:  { label: 'Contained',      ring: 'border-purple-500', bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-500', pulse: false },
  ATTENTION:  { label: 'Attention',      ring: 'border-yellow-400', bg: 'bg-yellow-50', text: 'text-yellow-800', dot: 'bg-yellow-400', pulse: false },
  ALL_CLEAR:  { label: 'Clear',          ring: 'border-slate-200',  bg: 'bg-white',     text: 'text-slate-500',  dot: 'bg-slate-300',  pulse: false },
};

const TYPE_GLYPH: Record<IncidentType, string> = {
  FIRE:       '🔥',
  MEDICAL:    '🩺',
  SECURITY:   '🛡️',
  EVACUATION: '⚠️',
  STRUCTURAL: '🏗️',
  OTHER:      '📋',
};

const SEVERITY_RANK: Record<Severity, number> = { SEV1: 3, SEV2: 2, SEV3: 1 };

// Determine the dominant display state for a zone, given its raw status + active incidents.
// Highest-severity ACTIVE incident wins. CONTAINED-only zones get the contained badge.
function deriveState(zone: Zone, incidents: Incident[]): DisplayState {
  const zoneIncidents = incidents.filter(i => i.zone_id === zone.id);
  const active = zoneIncidents.filter(i => i.status === 'ACTIVE');
  if (active.length > 0) {
    const top = active.reduce((a, b) => (SEVERITY_RANK[a.severity] >= SEVERITY_RANK[b.severity] ? a : b));
    return top.severity;
  }
  if (zoneIncidents.some(i => i.status === 'CONTAINED')) return 'CONTAINED';
  if (zone.current_status === 'ATTENTION') return 'ATTENTION';
  return 'ALL_CLEAR';
}

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

type FilterKey = 'ALL' | 'INCIDENTS' | 'CLEAR' | 'NO_COVERAGE';

export default function ZonesPage() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>('ALL');
  const session = getSession();

  const fetchAll = async () => {
    const [zonesRes, incRes] = await Promise.all([
      apiFetch<Zone[]>('/zones/accountability'),
      apiFetch<Incident[]>('/incidents'),
    ]);
    if (zonesRes.data) setZones(zonesRes.data);
    if (incRes.data) setIncidents(incRes.data);
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 5000);
    return () => clearInterval(interval);
  }, [session?.staff.venue_id]);

  // Pre-compute derived state per zone for filter + render
  const enriched = zones.map(z => {
    const zoneIncidents = incidents.filter(i => i.zone_id === z.id && (i.status === 'ACTIVE' || i.status === 'CONTAINED'));
    const state = deriveState(z, incidents);
    const assignees = z.staff_zone_assignments?.flatMap(a => a.staff) ?? [];
    return { zone: z, state, zoneIncidents, assignees };
  });

  const displayed = enriched.filter(({ state, assignees }) => {
    if (filter === 'ALL') return true;
    if (filter === 'INCIDENTS') return state === 'SEV1' || state === 'SEV2' || state === 'SEV3' || state === 'CONTAINED';
    if (filter === 'CLEAR') return state === 'ALL_CLEAR';
    if (filter === 'NO_COVERAGE') return assignees.length === 0;
    return true;
  });

  const counts = {
    ALL: enriched.length,
    INCIDENTS: enriched.filter(e => e.state === 'SEV1' || e.state === 'SEV2' || e.state === 'SEV3' || e.state === 'CONTAINED').length,
    CLEAR: enriched.filter(e => e.state === 'ALL_CLEAR').length,
    NO_COVERAGE: enriched.filter(e => e.assignees.length === 0).length,
  };

  const sev1Count = enriched.filter(e => e.state === 'SEV1').length;
  const sev2Count = enriched.filter(e => e.state === 'SEV2').length;
  const sev3Count = enriched.filter(e => e.state === 'SEV3').length;
  const containedCount = enriched.filter(e => e.state === 'CONTAINED').length;

  return (
    <AppShell>
      <div className="p-8 max-w-7xl mx-auto">
        <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Zone Status Board</h1>
            <p className="text-slate-500 text-sm mt-1">Severity-coded · refreshes every 5 seconds</p>
          </div>

          {/* Severity tally */}
          <div className="flex items-center gap-3 text-sm">
            {sev1Count > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                <span className="font-bold text-red-700">{sev1Count} SEV1</span>
              </div>
            )}
            {sev2Count > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-orange-500" />
                <span className="font-bold text-orange-700">{sev2Count} SEV2</span>
              </div>
            )}
            {sev3Count > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                <span className="font-bold text-amber-700">{sev3Count} SEV3</span>
              </div>
            )}
            {containedCount > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                <span className="font-bold text-purple-700">{containedCount} Contained</span>
              </div>
            )}
            {sev1Count + sev2Count + sev3Count + containedCount === 0 && (
              <span className="text-slate-500 text-sm">All zones clear</span>
            )}
          </div>
        </div>

        {/* Filter pills */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {(['ALL', 'INCIDENTS', 'CLEAR', 'NO_COVERAGE'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold border transition-colors ${
                filter === f
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
              }`}
            >
              {f === 'ALL' ? `All (${counts.ALL})` :
               f === 'INCIDENTS' ? `Active Incidents (${counts.INCIDENTS})` :
               f === 'CLEAR' ? `Clear (${counts.CLEAR})` :
               `No Coverage (${counts.NO_COVERAGE})`}
            </button>
          ))}
        </div>

        {loading && <div className="text-slate-400 text-sm">Loading zones…</div>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {displayed.map(({ zone, state, zoneIncidents, assignees }) => {
            const cfg = STATE_CONFIG[state];
            const noCoverage = assignees.length === 0;
            const types = Array.from(new Set(zoneIncidents.map(i => i.incident_type)));
            const newest = zoneIncidents.length > 0
              ? zoneIncidents.reduce((a, b) => new Date(a.declared_at) > new Date(b.declared_at) ? a : b)
              : null;

            return (
              <div
                key={zone.id}
                className={`relative rounded-2xl border-2 p-4 transition-all ${cfg.ring} ${cfg.bg} ${cfg.pulse ? 'shadow-lg shadow-red-200/50' : ''}`}
              >
                {/* SEV1 pulsing ring overlay */}
                {cfg.pulse && (
                  <div className="absolute inset-0 rounded-2xl border-2 border-red-500 animate-ping pointer-events-none opacity-30" />
                )}

                {/* Top row: zone name + status badge */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                      <h3 className="font-bold text-slate-900 text-sm leading-tight truncate">{zone.name}</h3>
                      {zone.two_person_required && <span title="2-person required" className="text-xs">🔒</span>}
                    </div>
                    <p className="text-slate-500 text-xs">{zone.zone_type}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot} ${cfg.pulse ? 'animate-pulse' : ''}`} />
                    <span className={`text-xs font-bold ${cfg.text}`}>{cfg.label}</span>
                  </div>
                </div>

                {/* Incident types row */}
                {types.length > 0 && (
                  <div className="flex items-center gap-1 mb-2">
                    {types.map(t => (
                      <span key={t} title={t} className="text-base leading-none">{TYPE_GLYPH[t]}</span>
                    ))}
                    {newest && (
                      <span className={`ml-auto text-xs font-medium ${cfg.text}`}>
                        {timeAgo(newest.declared_at)}
                      </span>
                    )}
                  </div>
                )}

                {/* Coverage row */}
                {noCoverage ? (
                  <div className="mt-2 px-2 py-1 rounded bg-slate-100 text-slate-600 text-xs font-medium border border-slate-200">
                    ⊘ No staff assigned this shift
                  </div>
                ) : (
                  <div className="mt-2 space-y-1">
                    {assignees.slice(0, 2).map(s => (
                      <div key={s.id} className="flex items-center gap-2 text-xs text-slate-600">
                        <div className="w-5 h-5 rounded-full bg-slate-300 flex items-center justify-center text-slate-700 font-bold text-[10px] shrink-0">
                          {s.name.charAt(0)}
                        </div>
                        <span className="truncate">{s.name}</span>
                        <span className="text-slate-400 ml-auto shrink-0 text-[10px]">{s.role.replace('_', ' ')}</span>
                      </div>
                    ))}
                    {assignees.length > 2 && (
                      <p className="text-[11px] text-slate-400 pl-7">+{assignees.length - 2} more</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {!loading && displayed.length === 0 && (
          <div className="text-center py-20 text-slate-400">No zones match this filter.</div>
        )}

        {/* Legend */}
        <div className="mt-8 pt-6 border-t border-slate-200">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Legend</p>
          <div className="flex flex-wrap gap-4 text-xs text-slate-600">
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" /> SEV1 critical</div>
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-500" /> SEV2 urgent</div>
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> SEV3 advisory</div>
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-purple-500" /> Contained</div>
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-yellow-400" /> Attention</div>
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-slate-300" /> Clear</div>
            <span className="text-slate-400">·</span>
            <div className="flex items-center gap-1">🔥 Fire</div>
            <div className="flex items-center gap-1">🩺 Medical</div>
            <div className="flex items-center gap-1">🛡️ Security</div>
            <div className="flex items-center gap-1">⚠️ Evacuation</div>
            <div className="flex items-center gap-1">🏗️ Structural</div>
            <div className="flex items-center gap-1">🔒 2-person zone</div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
