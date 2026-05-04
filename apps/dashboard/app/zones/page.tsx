'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { apiFetch } from '../../lib/api';
import { getSession } from '../../lib/auth';
import { getZoneViewMode, setZoneViewMode, type ZoneViewMode } from '../../lib/zone-view-pref';

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface ZoneAssignment {
  staff: { id: string; name: string; role: string }[];
}
interface Floor {
  id: string;
  name: string;
  level_number: number;
}
interface Zone {
  id: string;
  name: string;
  zone_type: string;
  current_status: 'ALL_CLEAR' | 'ATTENTION' | 'INCIDENT_ACTIVE';
  two_person_required: boolean;
  floor_id: string | null;
  floors: Floor | null;
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

type DisplayState = 'SEV1' | 'SEV2' | 'SEV3' | 'CONTAINED' | 'ATTENTION' | 'ALL_CLEAR';

/* ─── Visual config ──────────────────────────────────────────────────────── */

const STATE_CONFIG: Record<DisplayState, {
  label: string; ring: string; bg: string; text: string; dot: string; pulse: boolean; rank: number;
}> = {
  SEV1:       { label: 'SEV1 Critical',  ring: 'border-red-500',    bg: 'bg-red-50',    text: 'text-red-700',    dot: 'bg-red-500',    pulse: true,  rank: 6 },
  SEV2:       { label: 'SEV2 Urgent',    ring: 'border-orange-500', bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500', pulse: false, rank: 5 },
  SEV3:       { label: 'SEV3 Advisory',  ring: 'border-amber-400',  bg: 'bg-amber-50',  text: 'text-amber-700',  dot: 'bg-amber-400',  pulse: false, rank: 4 },
  CONTAINED:  { label: 'Contained',      ring: 'border-purple-500', bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-500', pulse: false, rank: 3 },
  ATTENTION:  { label: 'Attention',      ring: 'border-yellow-400', bg: 'bg-yellow-50', text: 'text-yellow-800', dot: 'bg-yellow-400', pulse: false, rank: 2 },
  ALL_CLEAR:  { label: 'Clear',          ring: 'border-slate-200',  bg: 'bg-white',     text: 'text-slate-500',  dot: 'bg-slate-300',  pulse: false, rank: 1 },
};

const TYPE_GLYPH: Record<IncidentType, string> = {
  FIRE: '🔥', MEDICAL: '🩺', SECURITY: '🛡️', EVACUATION: '⚠️', STRUCTURAL: '🏗️', OTHER: '📋',
};

const SEVERITY_RANK: Record<Severity, number> = { SEV1: 3, SEV2: 2, SEV3: 1 };

const NO_FLOOR_KEY = '__no_floor__';

/* ─── Logic helpers ──────────────────────────────────────────────────────── */

function deriveState(zone: Zone, incidents: Incident[]): DisplayState {
  const zi = incidents.filter(i => i.zone_id === zone.id);
  const active = zi.filter(i => i.status === 'ACTIVE');
  if (active.length > 0) {
    const top = active.reduce((a, b) => SEVERITY_RANK[a.severity] >= SEVERITY_RANK[b.severity] ? a : b);
    return top.severity;
  }
  if (zi.some(i => i.status === 'CONTAINED')) return 'CONTAINED';
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

interface FloorBucket {
  key: string;
  floor: Floor | null;
  zones: Zone[];
  enrichedZones: Array<{ zone: Zone; state: DisplayState; zoneIncidents: Incident[]; assignees: { id: string; name: string; role: string }[] }>;
  topState: DisplayState;
  counts: { SEV1: number; SEV2: number; SEV3: number; CONTAINED: number; ATTENTION: number; CLEAR: number };
  staffCount: number;
}

function bucketByFloor(zones: Zone[], incidents: Incident[]): FloorBucket[] {
  const buckets = new Map<string, FloorBucket>();

  for (const zone of zones) {
    const key = zone.floor_id ?? NO_FLOOR_KEY;
    const existing = buckets.get(key);
    if (existing) {
      existing.zones.push(zone);
    } else {
      buckets.set(key, {
        key,
        floor: zone.floors ?? null,
        zones: [zone],
        enrichedZones: [],
        topState: 'ALL_CLEAR',
        counts: { SEV1: 0, SEV2: 0, SEV3: 0, CONTAINED: 0, ATTENTION: 0, CLEAR: 0 },
        staffCount: 0,
      });
    }
  }

  // Enrich each bucket with derived state, severity counts, top state
  for (const bucket of buckets.values()) {
    const staffSet = new Set<string>();
    for (const zone of bucket.zones) {
      const zoneIncidents = incidents.filter(i => i.zone_id === zone.id && (i.status === 'ACTIVE' || i.status === 'CONTAINED'));
      const state = deriveState(zone, incidents);
      const assignees = zone.staff_zone_assignments?.flatMap(a => a.staff) ?? [];
      bucket.enrichedZones.push({ zone, state, zoneIncidents, assignees });

      if (state === 'SEV1') bucket.counts.SEV1++;
      else if (state === 'SEV2') bucket.counts.SEV2++;
      else if (state === 'SEV3') bucket.counts.SEV3++;
      else if (state === 'CONTAINED') bucket.counts.CONTAINED++;
      else if (state === 'ATTENTION') bucket.counts.ATTENTION++;
      else bucket.counts.CLEAR++;

      if (STATE_CONFIG[state].rank > STATE_CONFIG[bucket.topState].rank) bucket.topState = state;
      for (const s of assignees) staffSet.add(s.id);
    }
    bucket.staffCount = staffSet.size;
  }

  // Sort: floors by level_number ascending; "no floor" bucket last
  return Array.from(buckets.values()).sort((a, b) => {
    if (a.key === NO_FLOOR_KEY) return 1;
    if (b.key === NO_FLOOR_KEY) return -1;
    return (a.floor?.level_number ?? 0) - (b.floor?.level_number ?? 0);
  });
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function ZonesPage() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFloorKey, setSelectedFloorKey] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ZoneViewMode>('list');
  const session = getSession();

  // Hydrate view preference on mount
  useEffect(() => { setViewMode(getZoneViewMode()); }, []);

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

  const buckets = useMemo(() => bucketByFloor(zones, incidents), [zones, incidents]);

  // Single-floor venue: auto-select the only floor
  useEffect(() => {
    if (buckets.length === 1 && selectedFloorKey === null) {
      setSelectedFloorKey(buckets[0].key);
    }
  }, [buckets, selectedFloorKey]);

  const selectedBucket = buckets.find(b => b.key === selectedFloorKey) ?? null;

  // Aggregate severity tally across all floors
  const totalCounts = useMemo(() => {
    const totals = { SEV1: 0, SEV2: 0, SEV3: 0, CONTAINED: 0 };
    for (const b of buckets) {
      totals.SEV1 += b.counts.SEV1;
      totals.SEV2 += b.counts.SEV2;
      totals.SEV3 += b.counts.SEV3;
      totals.CONTAINED += b.counts.CONTAINED;
    }
    return totals;
  }, [buckets]);

  const handleViewModeChange = (mode: ZoneViewMode) => {
    setViewMode(mode);
    setZoneViewMode(mode);
  };

  const isSingleFloor = buckets.length === 1;

  return (
    <AppShell>
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <PageHeader
          totalCounts={totalCounts}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
        />

        {loading && <div className="text-slate-400 text-sm">Loading zones…</div>}

        {!loading && buckets.length === 0 && (
          <div className="text-center py-20 text-slate-400">No zones configured for this venue.</div>
        )}

        {!loading && viewMode === 'list' && buckets.length > 0 && (
          <ListView
            buckets={buckets}
            selectedFloorKey={selectedFloorKey}
            onSelectFloor={setSelectedFloorKey}
            selectedBucket={selectedBucket}
            isSingleFloor={isSingleFloor}
          />
        )}

        {!loading && viewMode === 'building' && buckets.length > 0 && (
          <BuildingView buckets={buckets} />
        )}

        <Legend />
      </div>
    </AppShell>
  );
}

/* ─── Page header — title + severity tally + view-mode toggle ────────────── */

function PageHeader({
  totalCounts,
  viewMode,
  onViewModeChange,
}: {
  totalCounts: { SEV1: number; SEV2: number; SEV3: number; CONTAINED: number };
  viewMode: ZoneViewMode;
  onViewModeChange: (m: ZoneViewMode) => void;
}) {
  const allClear = totalCounts.SEV1 + totalCounts.SEV2 + totalCounts.SEV3 + totalCounts.CONTAINED === 0;

  return (
    <div className="mb-4 sm:mb-6">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Zone Status Board</h1>
          <p className="text-slate-500 text-sm mt-1">Severity-coded · refreshes every 5 seconds</p>
        </div>

        {/* View mode toggle */}
        <div className="inline-flex rounded-lg border border-slate-200 bg-white overflow-hidden text-sm shrink-0">
          <button
            onClick={() => onViewModeChange('list')}
            className={`min-h-[44px] px-3 sm:px-4 font-medium transition-colors ${viewMode === 'list' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
            aria-pressed={viewMode === 'list'}
          >
            <span aria-hidden="true">▤</span> <span className="hidden sm:inline">List</span>
          </button>
          <button
            onClick={() => onViewModeChange('building')}
            className={`min-h-[44px] px-3 sm:px-4 font-medium transition-colors ${viewMode === 'building' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
            aria-pressed={viewMode === 'building'}
          >
            <span aria-hidden="true">🏢</span> <span className="hidden sm:inline">Building</span>
          </button>
        </div>
      </div>

      {/* Severity tally */}
      <div className="flex items-center gap-3 sm:gap-4 text-sm flex-wrap">
        {totalCounts.SEV1 > 0 && (
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" /><span className="font-bold text-red-700">{totalCounts.SEV1} SEV1</span></div>
        )}
        {totalCounts.SEV2 > 0 && (
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-500" /><span className="font-bold text-orange-700">{totalCounts.SEV2} SEV2</span></div>
        )}
        {totalCounts.SEV3 > 0 && (
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-400" /><span className="font-bold text-amber-700">{totalCounts.SEV3} SEV3</span></div>
        )}
        {totalCounts.CONTAINED > 0 && (
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-purple-500" /><span className="font-bold text-purple-700">{totalCounts.CONTAINED} Contained</span></div>
        )}
        {allClear && <span className="text-slate-500">All zones clear</span>}
      </div>
    </div>
  );
}

/* ─── Pattern C — list view (floor list + drilldown / 2-col) ─────────────── */

function ListView({
  buckets,
  selectedFloorKey,
  onSelectFloor,
  selectedBucket,
  isSingleFloor,
}: {
  buckets: FloorBucket[];
  selectedFloorKey: string | null;
  onSelectFloor: (key: string | null) => void;
  selectedBucket: FloorBucket | null;
  isSingleFloor: boolean;
}) {
  // Mobile: if a floor is selected → drilldown view. Otherwise floor list.
  // Desktop (lg:+): always 2-column (floor list left + zones right).

  return (
    <div className="lg:flex lg:gap-6">
      {/* Floor list */}
      <aside className={`${selectedFloorKey && !isSingleFloor ? 'hidden lg:block' : 'block'} lg:w-80 lg:shrink-0 lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto`}>
        <FloorList
          buckets={buckets}
          selectedFloorKey={selectedFloorKey}
          onSelectFloor={onSelectFloor}
        />
      </aside>

      {/* Zone grid for selected floor */}
      <div className={`${selectedFloorKey || isSingleFloor ? 'block' : 'hidden lg:block'} flex-1 mt-4 lg:mt-0`}>
        {selectedBucket ? (
          <FloorZonesView
            bucket={selectedBucket}
            onBack={() => onSelectFloor(null)}
            isSingleFloor={isSingleFloor}
          />
        ) : (
          <div className="hidden lg:flex h-64 items-center justify-center text-slate-400 text-sm bg-white rounded-2xl border border-slate-200">
            Select a floor to view zones
          </div>
        )}
      </div>
    </div>
  );
}

function FloorList({
  buckets,
  selectedFloorKey,
  onSelectFloor,
}: {
  buckets: FloorBucket[];
  selectedFloorKey: string | null;
  onSelectFloor: (key: string) => void;
}) {
  return (
    <div className="space-y-2">
      {buckets.map(bucket => {
        const cfg = STATE_CONFIG[bucket.topState];
        const isSelected = bucket.key === selectedFloorKey;
        const issueCount = bucket.counts.SEV1 + bucket.counts.SEV2 + bucket.counts.SEV3 + bucket.counts.CONTAINED + bucket.counts.ATTENTION;
        const totalZones = bucket.zones.length;

        return (
          <button
            key={bucket.key}
            onClick={() => onSelectFloor(bucket.key)}
            className={`w-full text-left rounded-2xl border-2 p-4 transition-all min-h-[88px] ${cfg.ring} ${cfg.bg} ${isSelected ? 'ring-2 ring-blue-500 ring-offset-2' : ''}`}
            aria-pressed={isSelected}
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="min-w-0 flex-1">
                <div className="font-bold text-slate-900 text-sm truncate">
                  {bucket.floor?.name ?? 'Unassigned'}
                </div>
                <div className="text-slate-500 text-xs">
                  {bucket.floor ? `Level ${bucket.floor.level_number}` : 'No floor assigned'} · {totalZones} zone{totalZones !== 1 ? 's' : ''}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className={`w-2 h-2 rounded-full ${cfg.dot} ${cfg.pulse ? 'animate-pulse' : ''}`} />
                <span className={`text-xs font-bold ${cfg.text}`}>
                  {issueCount === 0 ? 'Clear' : `${issueCount} issue${issueCount > 1 ? 's' : ''}`}
                </span>
              </div>
            </div>

            {/* Mini severity tally */}
            {issueCount > 0 && (
              <div className="flex items-center gap-2 text-[11px] flex-wrap">
                {bucket.counts.SEV1 > 0 && <span className="font-bold text-red-700">🔴 {bucket.counts.SEV1}</span>}
                {bucket.counts.SEV2 > 0 && <span className="font-bold text-orange-700">🟠 {bucket.counts.SEV2}</span>}
                {bucket.counts.SEV3 > 0 && <span className="font-bold text-amber-700">🟡 {bucket.counts.SEV3}</span>}
                {bucket.counts.CONTAINED > 0 && <span className="font-bold text-purple-700">🟣 {bucket.counts.CONTAINED}</span>}
                {bucket.counts.ATTENTION > 0 && <span className="font-bold text-yellow-700">⚠ {bucket.counts.ATTENTION}</span>}
              </div>
            )}

            {/* Coverage line */}
            <div className="text-[11px] text-slate-500 mt-1">
              {bucket.staffCount} staff covering
            </div>
          </button>
        );
      })}
    </div>
  );
}

function FloorZonesView({
  bucket,
  onBack,
  isSingleFloor,
}: {
  bucket: FloorBucket;
  onBack: () => void;
  isSingleFloor: boolean;
}) {
  const [filter, setFilter] = useState<'ALL' | 'INCIDENTS' | 'CLEAR' | 'NO_COVERAGE'>('ALL');

  const displayed = bucket.enrichedZones.filter(({ state, assignees }) => {
    if (filter === 'ALL') return true;
    if (filter === 'INCIDENTS') return state === 'SEV1' || state === 'SEV2' || state === 'SEV3' || state === 'CONTAINED';
    if (filter === 'CLEAR') return state === 'ALL_CLEAR';
    if (filter === 'NO_COVERAGE') return assignees.length === 0;
    return true;
  });

  const counts = {
    ALL: bucket.enrichedZones.length,
    INCIDENTS: bucket.counts.SEV1 + bucket.counts.SEV2 + bucket.counts.SEV3 + bucket.counts.CONTAINED,
    CLEAR: bucket.counts.CLEAR,
    NO_COVERAGE: bucket.enrichedZones.filter(e => e.assignees.length === 0).length,
  };

  return (
    <div>
      {/* Back button (mobile only, hidden on lg:+ since 2-col is always visible) */}
      {!isSingleFloor && (
        <button
          onClick={onBack}
          className="lg:hidden flex items-center gap-1 text-slate-600 hover:text-slate-900 mb-3 min-h-[44px]"
          aria-label="Back to floor list"
        >
          <span aria-hidden="true">←</span> All floors
        </button>
      )}

      <div className="mb-3 flex items-baseline justify-between gap-2 flex-wrap">
        <h2 className="text-lg sm:text-xl font-bold text-slate-900">
          {bucket.floor?.name ?? 'Unassigned zones'}
        </h2>
        {bucket.floor && (
          <p className="text-slate-500 text-sm">Level {bucket.floor.level_number}</p>
        )}
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {(['ALL', 'INCIDENTS', 'CLEAR', 'NO_COVERAGE'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`min-h-[40px] px-3 sm:px-4 rounded-full text-xs sm:text-sm font-semibold border transition-colors ${
              filter === f ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
            }`}
          >
            {f === 'ALL' ? `All (${counts.ALL})` :
             f === 'INCIDENTS' ? `Active (${counts.INCIDENTS})` :
             f === 'CLEAR' ? `Clear (${counts.CLEAR})` :
             `No Coverage (${counts.NO_COVERAGE})`}
          </button>
        ))}
      </div>

      {/* Zone grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {displayed.map(({ zone, state, zoneIncidents, assignees }) => (
          <ZoneCard
            key={zone.id}
            zone={zone}
            state={state}
            zoneIncidents={zoneIncidents}
            assignees={assignees}
          />
        ))}
      </div>

      {displayed.length === 0 && (
        <div className="text-center py-12 text-slate-400 text-sm">No zones match this filter.</div>
      )}
    </div>
  );
}

function ZoneCard({
  zone,
  state,
  zoneIncidents,
  assignees,
}: {
  zone: Zone;
  state: DisplayState;
  zoneIncidents: Incident[];
  assignees: { id: string; name: string; role: string }[];
}) {
  const cfg = STATE_CONFIG[state];
  const noCoverage = assignees.length === 0;
  const types = Array.from(new Set(zoneIncidents.map(i => i.incident_type)));
  const newest = zoneIncidents.length > 0
    ? zoneIncidents.reduce((a, b) => new Date(a.declared_at) > new Date(b.declared_at) ? a : b)
    : null;

  return (
    <div className={`relative rounded-2xl border-2 p-4 transition-all ${cfg.ring} ${cfg.bg} ${cfg.pulse ? 'shadow-lg shadow-red-200/50' : ''}`}>
      {cfg.pulse && (
        <div className="absolute inset-0 rounded-2xl border-2 border-red-500 animate-ping pointer-events-none opacity-30" />
      )}

      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
            <h3 className="font-bold text-slate-900 text-sm leading-tight truncate">{zone.name}</h3>
            {zone.two_person_required && <span title="2-person required" aria-label="2-person required" className="text-xs">🔒</span>}
          </div>
          <p className="text-slate-500 text-xs">{zone.zone_type}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot} ${cfg.pulse ? 'animate-pulse' : ''}`} />
          <span className={`text-xs font-bold ${cfg.text}`}>{cfg.label}</span>
        </div>
      </div>

      {types.length > 0 && (
        <div className="flex items-center gap-1 mb-2">
          {types.map(t => <span key={t} title={t} aria-label={t} className="text-base leading-none">{TYPE_GLYPH[t]}</span>)}
          {newest && <span className={`ml-auto text-xs font-medium ${cfg.text}`}>{timeAgo(newest.declared_at)}</span>}
        </div>
      )}

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
          {assignees.length > 2 && <p className="text-[11px] text-slate-400 pl-7">+{assignees.length - 2} more</p>}
        </div>
      )}
    </div>
  );
}

/* ─── Pattern D — building heatmap ───────────────────────────────────────── */

function BuildingView({ buckets }: { buckets: FloorBucket[] }) {
  // Render top-down (highest floor first)
  const ordered = [...buckets].sort((a, b) => {
    if (a.key === NO_FLOOR_KEY) return 1;
    if (b.key === NO_FLOOR_KEY) return -1;
    return (b.floor?.level_number ?? 0) - (a.floor?.level_number ?? 0);
  });

  const [selectedZone, setSelectedZone] = useState<{ zone: Zone; state: DisplayState; zoneIncidents: Incident[]; assignees: { id: string; name: string; role: string }[] } | null>(null);

  return (
    <div>
      <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 overflow-x-auto">
        <div className="space-y-2 min-w-fit">
          {ordered.map(bucket => (
            <div key={bucket.key} className="flex items-center gap-3">
              <div className="w-16 sm:w-20 shrink-0 text-right">
                <div className="text-xs font-bold text-slate-700 truncate">
                  {bucket.floor?.name ?? 'Other'}
                </div>
                {bucket.floor && (
                  <div className="text-[10px] text-slate-400">L{bucket.floor.level_number}</div>
                )}
              </div>
              <div className="flex flex-1 gap-1 flex-wrap min-w-0">
                {bucket.enrichedZones.length === 0 ? (
                  <div className="text-[10px] text-slate-400 italic">no zones</div>
                ) : (
                  bucket.enrichedZones.map(({ zone, state, zoneIncidents, assignees }) => {
                    const cfg = STATE_CONFIG[state];
                    const types = Array.from(new Set(zoneIncidents.map(i => i.incident_type)));
                    return (
                      <button
                        key={zone.id}
                        onClick={() => setSelectedZone({ zone, state, zoneIncidents, assignees })}
                        className={`relative w-10 h-10 sm:w-12 sm:h-12 rounded border-2 ${cfg.ring} ${cfg.bg} ${cfg.pulse ? 'shadow shadow-red-300' : ''} flex items-center justify-center transition-transform hover:scale-110 hover:z-10`}
                        title={`${zone.name} — ${cfg.label}`}
                        aria-label={`${zone.name}, status ${cfg.label}`}
                      >
                        {types.length > 0 ? (
                          <span className="text-xs sm:text-sm leading-none" aria-hidden="true">{TYPE_GLYPH[types[0]]}</span>
                        ) : (
                          <span className={`w-2 h-2 rounded-full ${cfg.dot} ${cfg.pulse ? 'animate-pulse' : ''}`} aria-hidden="true" />
                        )}
                        {cfg.pulse && (
                          <span className="absolute inset-0 rounded border-2 border-red-500 animate-ping opacity-30" aria-hidden="true" />
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-slate-400 mt-2">Tap a zone for details. Floors top-to-bottom by level number.</p>

      {/* Zone detail bottom sheet */}
      {selectedZone && (
        <ZoneDetailSheet zone={selectedZone.zone} state={selectedZone.state} zoneIncidents={selectedZone.zoneIncidents} assignees={selectedZone.assignees} onClose={() => setSelectedZone(null)} />
      )}
    </div>
  );
}

function ZoneDetailSheet({
  zone,
  state,
  zoneIncidents,
  assignees,
  onClose,
}: {
  zone: Zone;
  state: DisplayState;
  zoneIncidents: Incident[];
  assignees: { id: string; name: string; role: string }[];
  onClose: () => void;
}) {
  const cfg = STATE_CONFIG[state];
  const types = Array.from(new Set(zoneIncidents.map(i => i.incident_type)));
  const newest = zoneIncidents.length > 0
    ? zoneIncidents.reduce((a, b) => new Date(a.declared_at) > new Date(b.declared_at) ? a : b)
    : null;

  // Esc to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} aria-hidden="true" />
      <div className={`fixed left-0 right-0 bottom-0 z-50 ${cfg.bg} border-t-4 ${cfg.ring} rounded-t-2xl p-5 shadow-2xl max-h-[80vh] overflow-y-auto`}
           style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
              <h3 className="font-bold text-slate-900 text-lg truncate">{zone.name}</h3>
              {zone.two_person_required && <span title="2-person required">🔒</span>}
            </div>
            <p className="text-slate-500 text-sm">{zone.zone_type} · {zone.floors?.name ?? 'Unassigned floor'}</p>
          </div>
          <button onClick={onClose} className="w-11 h-11 flex items-center justify-center text-slate-500 hover:text-slate-900 -mr-2 -mt-2" aria-label="Close">
            <span className="text-xl">✕</span>
          </button>
        </div>

        <div className="flex items-center gap-2 mb-3">
          <span className={`w-3 h-3 rounded-full ${cfg.dot} ${cfg.pulse ? 'animate-pulse' : ''}`} />
          <span className={`text-sm font-bold ${cfg.text}`}>{cfg.label}</span>
          {newest && <span className="text-slate-400 text-xs ml-2">{timeAgo(newest.declared_at)}</span>}
        </div>

        {types.length > 0 && (
          <div className="flex items-center gap-2 mb-4">
            {types.map(t => <span key={t} className="text-xl" title={t}>{TYPE_GLYPH[t]}</span>)}
            <span className="text-slate-600 text-sm">{types.join(' · ')}</span>
          </div>
        )}

        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Coverage</div>
        {assignees.length === 0 ? (
          <div className="px-3 py-2 rounded bg-slate-100 text-slate-600 text-sm border border-slate-200">⊘ No staff assigned this shift</div>
        ) : (
          <div className="space-y-1.5">
            {assignees.map(s => (
              <div key={s.id} className="flex items-center gap-2 text-sm text-slate-700">
                <div className="w-7 h-7 rounded-full bg-slate-300 flex items-center justify-center text-slate-700 font-bold text-xs shrink-0">{s.name.charAt(0)}</div>
                <span>{s.name}</span>
                <span className="text-slate-400 ml-auto text-xs">{s.role.replace('_', ' ')}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

/* ─── Legend ─────────────────────────────────────────────────────────────── */

function Legend() {
  return (
    <div className="mt-8 pt-6 border-t border-slate-200">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Legend</p>
      <div className="flex flex-wrap gap-3 sm:gap-4 text-xs text-slate-600">
        <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" /> SEV1 critical</div>
        <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-500" /> SEV2 urgent</div>
        <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> SEV3 advisory</div>
        <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-purple-500" /> Contained</div>
        <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-yellow-400" /> Attention</div>
        <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-slate-300" /> Clear</div>
      </div>
    </div>
  );
}
