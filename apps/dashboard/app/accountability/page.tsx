'use client';

/**
 * Zone Accountability — person-first roster view (web companion to mobile
 * ZonesScreen / BR-19).
 *
 * Pairs with /zones (Zone Status Board) which is status-first. Both pages
 * consume the same /v1/zones/accountability endpoint; they invert the
 * hierarchy:
 *
 *   /zones          → status-first ("Where are the problems right now?")
 *   /accountability → person-first ("Who owns each zone this shift?")
 *
 * Roster grid groups zones by assigned staff. Unassigned zones surface
 * prominently at the top as a coverage-gap call-out (the demo's punchline:
 * the founder asks "who owns parking level B right now?" and the answer
 * is rendered in <1 second alongside any gaps).
 *
 * Refs: BR-19 (Zone Accountability — primary command-role surface)
 * Refs: Plan §22 Rec #1 (lead with this in validation conversations)
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '../../components/AppShell';
import { apiFetch } from '../../lib/api';
import { getSession } from '../../lib/auth';

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface Floor {
  id: string;
  name: string;
  floor_number: number;
}

type ZoneStatus = 'ALL_CLEAR' | 'ATTENTION' | 'INCIDENT_ACTIVE';

interface AssignedStaff {
  id: string;
  name: string;
  role: string;
}

interface Zone {
  id: string;
  name: string;
  zone_type: string;
  current_status: ZoneStatus;
  two_person_required: boolean;
  floor_id: string | null;
  floors: Floor | null;
  staff_zone_assignments: { staff: AssignedStaff[] | AssignedStaff | null }[];
}

/* ─── Visual config ──────────────────────────────────────────────────────── */

const STATUS_PILL: Record<ZoneStatus, { dot: string; text: string; bg: string; label: string }> = {
  ALL_CLEAR:       { dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50', label: 'Clear' },
  ATTENTION:       { dot: 'bg-yellow-500',  text: 'text-yellow-800',  bg: 'bg-yellow-50',  label: 'Attention' },
  INCIDENT_ACTIVE: { dot: 'bg-red-500',     text: 'text-red-700',     bg: 'bg-red-50',     label: 'Active' },
};

const ROLE_BADGE: Record<string, string> = {
  SH:               'bg-red-100 text-red-700',
  DSH:              'bg-orange-100 text-orange-700',
  GM:               'bg-purple-100 text-purple-700',
  SHIFT_COMMANDER:  'bg-blue-100 text-blue-700',
  FLOOR_SUPERVISOR: 'bg-sky-100 text-sky-700',
  FM:               'bg-teal-100 text-teal-700',
  AUDITOR:          'bg-slate-100 text-slate-700',
  GROUND_STAFF:     'bg-slate-100 text-slate-700',
};

const ROLE_AVATAR: Record<string, string> = {
  SH:               'bg-red-700',
  DSH:              'bg-orange-700',
  GM:               'bg-purple-700',
  SHIFT_COMMANDER:  'bg-blue-700',
  FLOOR_SUPERVISOR: 'bg-sky-700',
  FM:               'bg-teal-700',
  AUDITOR:          'bg-slate-600',
  GROUND_STAFF:     'bg-slate-600',
};

/* ─── Logic helpers ──────────────────────────────────────────────────────── */

interface OwnerEntry {
  staff: AssignedStaff;
  zones: Zone[];
}

interface RosterModel {
  owners: OwnerEntry[];          // staff with at least one zone, sorted by name
  unassignedZones: Zone[];       // zones with no active staff assignment
  totalZones: number;
  totalCoverageGap: number;      // = unassignedZones.length
  totalOwners: number;
}

function flattenAssignees(zone: Zone): AssignedStaff[] {
  // staff_zone_assignments[i].staff is either an array, single, or null
  // depending on how Supabase serialised the join. Normalise to a flat list.
  const seen = new Map<string, AssignedStaff>();
  for (const a of zone.staff_zone_assignments ?? []) {
    if (!a.staff) continue;
    const list = Array.isArray(a.staff) ? a.staff : [a.staff];
    for (const s of list) {
      if (s && !seen.has(s.id)) seen.set(s.id, s);
    }
  }
  return [...seen.values()];
}

function buildRoster(zones: Zone[]): RosterModel {
  const ownerMap = new Map<string, OwnerEntry>();
  const unassigned: Zone[] = [];

  for (const zone of zones) {
    const owners = flattenAssignees(zone);
    if (owners.length === 0) {
      unassigned.push(zone);
      continue;
    }
    for (const owner of owners) {
      const existing = ownerMap.get(owner.id);
      if (existing) {
        existing.zones.push(zone);
      } else {
        ownerMap.set(owner.id, { staff: owner, zones: [zone] });
      }
    }
  }

  const owners = [...ownerMap.values()].sort((a, b) => {
    // Sort by role priority first (SH/DSH at top), then by name
    const rolePri = (r: string): number => {
      if (r === 'SH') return 0;
      if (r === 'DSH') return 1;
      if (r === 'SHIFT_COMMANDER') return 2;
      if (r === 'FLOOR_SUPERVISOR') return 3;
      return 4;
    };
    const r = rolePri(a.staff.role) - rolePri(b.staff.role);
    return r !== 0 ? r : a.staff.name.localeCompare(b.staff.name);
  });

  // Sort each owner's zones by floor → name
  for (const o of owners) {
    o.zones.sort((a, b) => {
      const fa = a.floors?.floor_number ?? 999;
      const fb = b.floors?.floor_number ?? 999;
      return fa !== fb ? fa - fb : a.name.localeCompare(b.name);
    });
  }

  unassigned.sort((a, b) => {
    const fa = a.floors?.floor_number ?? 999;
    const fb = b.floors?.floor_number ?? 999;
    return fa !== fb ? fa - fb : a.name.localeCompare(b.name);
  });

  return {
    owners,
    unassignedZones: unassigned,
    totalZones: zones.length,
    totalCoverageGap: unassigned.length,
    totalOwners: owners.length,
  };
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function AccountabilityPage() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const session = getSession();

  const fetchAll = async () => {
    const res = await apiFetch<Zone[]>('/zones/accountability');
    if (res.error) setError(res.error);
    else if (res.data) {
      setError(null);
      setZones(res.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
    // Accountability changes only on shift turnover — refresh every 60s is plenty
    const id = setInterval(fetchAll, 60_000);
    return () => clearInterval(id);
  }, [session?.staff.venue_id]);

  const roster = useMemo(() => buildRoster(zones), [zones]);

  return (
    <AppShell>
      <div
        className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <PageHeader roster={roster} />

        {loading && <div className="text-slate-400 text-sm">Loading roster…</div>}
        {error && <div className="text-red-600 text-sm">{error}</div>}

        {!loading && !error && zones.length === 0 && (
          <div className="text-center py-20 text-slate-400">
            No zones configured for this venue.
          </div>
        )}

        {!loading && !error && zones.length > 0 && (
          <>
            {roster.totalCoverageGap > 0 && (
              <CoverageGapCard zones={roster.unassignedZones} />
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
              {roster.owners.map((owner) => (
                <OwnerCard key={owner.staff.id} owner={owner} />
              ))}
            </div>

            {roster.owners.length === 0 && roster.unassignedZones.length > 0 && (
              <div className="mt-8 text-center text-slate-500 text-sm">
                No staff currently assigned to any zone.
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

/* ─── Page header ────────────────────────────────────────────────────────── */

function PageHeader({ roster }: { roster: RosterModel }) {
  return (
    <div className="mb-4 sm:mb-6">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Zone Accountability</h1>
          <p className="text-slate-500 text-sm mt-1">
            Who owns each zone — refreshes every minute
          </p>
        </div>

        {/*
          Cross-link to the status-first companion view. Same data,
          inverted hierarchy: person-first here vs status-first there.
          Operator sees a name they need context on → 1-click to live
          status of all that person's zones.
        */}
        <Link
          href="/zones"
          className="text-sm text-slate-600 hover:text-blue-700 font-medium underline-offset-4 hover:underline whitespace-nowrap"
        >
          View status board <span aria-hidden="true">→</span>
        </Link>
      </div>

      <div className="flex items-center gap-3 sm:gap-5 text-sm flex-wrap">
        <Stat label="Zones" value={roster.totalZones} colour="text-slate-900" />
        <Stat label="Owners" value={roster.totalOwners} colour="text-slate-900" />
        <Stat
          label="Coverage gaps"
          value={roster.totalCoverageGap}
          colour={roster.totalCoverageGap > 0 ? 'text-red-700' : 'text-slate-500'}
          dot={roster.totalCoverageGap > 0 ? 'bg-red-500' : 'bg-slate-300'}
          pulse={roster.totalCoverageGap > 0}
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  colour,
  dot,
  pulse,
}: {
  label: string;
  value: number;
  colour: string;
  dot?: string;
  pulse?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      {dot && (
        <span
          className={`w-2.5 h-2.5 rounded-full ${dot} ${pulse ? 'animate-pulse' : ''}`}
          aria-hidden="true"
        />
      )}
      <span className={`font-bold ${colour}`}>{value}</span>
      <span className="text-slate-500 text-xs uppercase tracking-wide">{label}</span>
    </div>
  );
}

/* ─── Coverage gap call-out ──────────────────────────────────────────────── */

function CoverageGapCard({ zones }: { zones: Zone[] }) {
  return (
    <div className="rounded-2xl border-2 border-red-300 bg-red-50 p-4 mb-2">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
        <h2 className="font-bold text-red-800 text-sm uppercase tracking-wide">
          {zones.length} zone{zones.length === 1 ? '' : 's'} with no staff this shift
        </h2>
      </div>
      <p className="text-red-700 text-xs mb-3">
        These zones have no active staff assignment. Assign coverage via the
        Operations Console or rebalance from another zone.
      </p>
      <div className="flex flex-wrap gap-2">
        {zones.map((zone) => {
          const status = STATUS_PILL[zone.current_status];
          return (
            <div
              key={zone.id}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-red-200"
            >
              <span className={`w-2 h-2 rounded-full ${status.dot}`} aria-hidden="true" />
              <span className="text-xs font-semibold text-slate-900">{zone.name}</span>
              <span className="text-[10px] text-slate-500">
                {zone.floors?.name ?? 'no floor'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Owner card ─────────────────────────────────────────────────────────── */

function OwnerCard({ owner }: { owner: OwnerEntry }) {
  const avatarBg = ROLE_AVATAR[owner.staff.role] ?? 'bg-slate-600';
  const roleBadge = ROLE_BADGE[owner.staff.role] ?? 'bg-slate-100 text-slate-700';
  const incidentZones = owner.zones.filter((z) => z.current_status === 'INCIDENT_ACTIVE').length;
  const attentionZones = owner.zones.filter((z) => z.current_status === 'ATTENTION').length;

  return (
    <div className="rounded-2xl bg-white border border-slate-200 p-4 sm:p-5">
      {/* Owner header */}
      <div className="flex items-start gap-3 mb-3">
        <div
          className={`w-11 h-11 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 ${avatarBg}`}
        >
          {owner.staff.name.slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-slate-900 truncate">{owner.staff.name}</div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span
              className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded ${roleBadge}`}
            >
              {owner.staff.role.replace('_', ' ')}
            </span>
            <span className="text-xs text-slate-500">
              {owner.zones.length} zone{owner.zones.length === 1 ? '' : 's'}
            </span>
            {incidentZones > 0 && (
              <span className="text-[10px] font-bold text-red-700 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                {incidentZones} active
              </span>
            )}
            {attentionZones > 0 && (
              <span className="text-[10px] font-bold text-yellow-800 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                {attentionZones} attention
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Zones owned */}
      <div className="space-y-1.5">
        {owner.zones.map((zone) => {
          const status = STATUS_PILL[zone.current_status];
          return (
            <div
              key={zone.id}
              className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-50"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className={`w-2 h-2 rounded-full ${status.dot} shrink-0`} aria-hidden="true" />
                <span className="text-sm font-semibold text-slate-900 truncate">
                  {zone.name}
                </span>
                {zone.two_person_required && (
                  <span
                    className="text-xs shrink-0"
                    title="2-person required"
                    aria-label="2-person required"
                  >
                    🔒
                  </span>
                )}
                <span className="text-xs text-slate-500 truncate">
                  · {zone.floors?.name ?? 'no floor'}
                </span>
              </div>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide shrink-0 ${status.bg} ${status.text}`}
              >
                {status.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
