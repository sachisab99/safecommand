'use client';

/**
 * ZoneAssignmentGrid — client-side roster editor for a single shift_instance.
 *
 * Surface pattern: per-staff cards with zone checkboxes grouped by floor.
 * Operator thinks "what zones does Rajesh cover?" — the UI mirrors that.
 *
 * Industry reference: Quinyx / Deputy / When I Work — bulk-replace pattern
 * (operator submits the complete desired state once; server replaces all
 * existing assignments for the shift_instance in one transaction). No
 * partial-update race conditions; trivial to revert (re-submit prior).
 *
 * 2-person validation runs client-side (instant feedback) AND server-side
 * (defensive — never trust client). Matches NFR-08 touch target sizing.
 *
 * Props:
 *   - venueId / shiftInstanceId: identifiers passed to server action
 *   - staff: active venue staff (filtered to non-command roles upstream)
 *   - floors / zones: venue topology with two_person flag
 *   - existingAssignments: current rows for this shift_instance — pre-populates
 *   - onSubmit: server action reference (replaceZoneAssignmentsAction)
 */

import { useMemo, useState, useTransition } from 'react';

interface Staff {
  id: string;
  name: string;
  role: string;
  is_active: boolean;
}

interface Floor {
  id: string;
  name: string;
  floor_number: number;
}

interface Zone {
  id: string;
  name: string;
  floor_id: string | null;
  two_person_required: boolean;
}

interface Assignment {
  staff_id: string;
  zone_id: string;
  assignment_type: 'PRIMARY' | 'SECONDARY' | 'BACKUP';
}

interface Props {
  venueId: string;
  shiftInstanceId: string;
  staff: Staff[];
  floors: Floor[];
  zones: Zone[];
  existingAssignments: Assignment[];
  /** Server action ref — preserves form-action semantics */
  onSubmit: (formData: FormData) => Promise<void>;
}

const ROLE_LABEL: Record<string, string> = {
  SH: 'Security Head',
  DSH: 'Deputy SH',
  SHIFT_COMMANDER: 'Shift Commander',
  GM: 'General Manager',
  AUDITOR: 'Auditor',
  FM: 'Facility Manager',
  FLOOR_SUPERVISOR: 'Floor Supervisor',
  GROUND_STAFF: 'Ground Staff',
};

const ROLE_BADGE: Record<string, string> = {
  SH: 'bg-red-100 text-red-700',
  DSH: 'bg-orange-100 text-orange-700',
  SHIFT_COMMANDER: 'bg-blue-100 text-blue-700',
  FLOOR_SUPERVISOR: 'bg-sky-100 text-sky-700',
  FM: 'bg-teal-100 text-teal-700',
  GROUND_STAFF: 'bg-slate-100 text-slate-700',
  AUDITOR: 'bg-slate-100 text-slate-700',
  GM: 'bg-purple-100 text-purple-700',
};

export function ZoneAssignmentGrid({
  venueId,
  shiftInstanceId,
  staff,
  floors,
  zones,
  existingAssignments,
  onSubmit,
}: Props) {
  // Working state: Map<staff_id, Set<zone_id>>
  const [coverage, setCoverage] = useState<Record<string, Set<string>>>(() => {
    const init: Record<string, Set<string>> = {};
    for (const s of staff) init[s.id] = new Set();
    for (const a of existingAssignments) {
      if (init[a.staff_id]) init[a.staff_id]!.add(a.zone_id);
    }
    return init;
  });

  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const toggleAssignment = (staffId: string, zoneId: string) => {
    setCoverage((prev) => {
      const next = { ...prev };
      const set = new Set(next[staffId] ?? []);
      if (set.has(zoneId)) set.delete(zoneId);
      else set.add(zoneId);
      next[staffId] = set;
      return next;
    });
  };

  // Compute coverage stats for visual feedback
  const stats = useMemo(() => {
    const staffPerZone: Record<string, number> = {};
    for (const set of Object.values(coverage)) {
      for (const zoneId of set) {
        staffPerZone[zoneId] = (staffPerZone[zoneId] ?? 0) + 1;
      }
    }
    const uncovered = zones.filter((z) => (staffPerZone[z.id] ?? 0) === 0);
    const twoPersonViolations = zones.filter(
      (z) => z.two_person_required && (staffPerZone[z.id] ?? 0) === 1,
    );
    const totalAssignments = Object.values(coverage).reduce(
      (sum, set) => sum + set.size,
      0,
    );
    return { staffPerZone, uncovered, twoPersonViolations, totalAssignments };
  }, [coverage, zones]);

  const canSubmit = stats.twoPersonViolations.length === 0;

  // Group zones by floor for display
  const zonesByFloor = useMemo(() => {
    const sortedFloors = [...floors].sort((a, b) => a.floor_number - b.floor_number);
    return sortedFloors
      .map((f) => ({
        floor: f,
        zones: zones
          .filter((z) => z.floor_id === f.id)
          .sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .filter((g) => g.zones.length > 0);
  }, [floors, zones]);

  const handleSubmit = (formData: FormData) => {
    setError(null);
    // Serialise coverage state into the JSON `assignments` field
    const assignments: Assignment[] = [];
    for (const [staffId, zoneSet] of Object.entries(coverage)) {
      for (const zoneId of zoneSet) {
        assignments.push({
          staff_id: staffId,
          zone_id: zoneId,
          assignment_type: 'PRIMARY',
        });
      }
    }
    formData.set('assignments', JSON.stringify(assignments));
    startTransition(async () => {
      try {
        await onSubmit(formData);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to save assignments');
      }
    });
  };

  if (staff.length === 0) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
        No active staff to assign. Add staff via the Staff tab first.
      </div>
    );
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <input type="hidden" name="venue_id" value={venueId} />
      <input type="hidden" name="shift_instance_id" value={shiftInstanceId} />

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCell label="Total assignments" value={stats.totalAssignments} tone="neutral" />
        <StatCell
          label="Zones covered"
          value={zones.length - stats.uncovered.length}
          subValue={`of ${zones.length}`}
          tone={stats.uncovered.length === 0 ? 'good' : 'warn'}
        />
        <StatCell
          label="Uncovered zones"
          value={stats.uncovered.length}
          tone={stats.uncovered.length > 0 ? 'warn' : 'neutral'}
        />
        <StatCell
          label="2-person violations"
          value={stats.twoPersonViolations.length}
          tone={stats.twoPersonViolations.length > 0 ? 'bad' : 'good'}
        />
      </div>

      {/* 2-person violation alert */}
      {stats.twoPersonViolations.length > 0 && (
        <div className="bg-red-50 border-2 border-red-200 rounded-lg p-3 text-sm">
          <div className="font-bold text-red-800 mb-1">
            ⚠ {stats.twoPersonViolations.length} zone
            {stats.twoPersonViolations.length === 1 ? '' : 's'} need a 2nd staff member
          </div>
          <ul className="text-red-700 text-xs space-y-0.5">
            {stats.twoPersonViolations.map((z) => (
              <li key={z.id}>
                • <span className="font-medium">{z.name}</span> — currently 1 staff
                (requires 2)
              </li>
            ))}
          </ul>
          <p className="text-red-600 text-xs mt-2">
            Either add a second staff member to each, or remove the existing single
            assignment.
          </p>
        </div>
      )}

      {/* Per-staff cards */}
      <div className="space-y-3">
        {staff.map((s) => {
          const assignedSet = coverage[s.id] ?? new Set();
          const roleBadge = ROLE_BADGE[s.role] ?? 'bg-slate-100 text-slate-700';
          return (
            <div key={s.id} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900">{s.name}</span>
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${roleBadge}`}
                  >
                    {ROLE_LABEL[s.role] ?? s.role}
                  </span>
                </div>
                <span className="text-xs text-gray-500">
                  {assignedSet.size} zone{assignedSet.size === 1 ? '' : 's'}
                </span>
              </div>

              <div className="space-y-2">
                {zonesByFloor.map(({ floor, zones: floorZones }) => (
                  <div key={floor.id}>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                      {floor.name}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {floorZones.map((z) => {
                        const isAssigned = assignedSet.has(z.id);
                        const zoneCount = stats.staffPerZone[z.id] ?? 0;
                        const isViolation =
                          z.two_person_required && zoneCount === 1 && isAssigned;
                        return (
                          <button
                            key={z.id}
                            type="button"
                            onClick={() => toggleAssignment(s.id, z.id)}
                            className={`text-xs px-2.5 py-1.5 rounded-md border transition-colors min-h-[32px] ${
                              isAssigned
                                ? isViolation
                                  ? 'bg-red-100 border-red-300 text-red-800'
                                  : 'bg-blue-100 border-blue-300 text-blue-800 font-medium'
                                : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                            }`}
                            aria-pressed={isAssigned}
                          >
                            {isAssigned && <span aria-hidden="true">✓ </span>}
                            {z.name}
                            {z.two_person_required && (
                              <span className="ml-1 opacity-60" title="2-person required">
                                🔒
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Submit row */}
      <div className="flex items-center justify-between gap-4 pt-3 border-t border-gray-200 flex-wrap">
        <div className="text-xs text-gray-500">
          {canSubmit
            ? 'Click Save to apply this roster.'
            : 'Resolve 2-person violations before saving.'}
        </div>
        {error && (
          <div className="text-sm text-red-600 font-medium">{error}</div>
        )}
        <button
          type="submit"
          disabled={!canSubmit || isPending}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            canSubmit && !isPending
              ? 'bg-blue-600 hover:bg-blue-700 text-white'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          {isPending ? 'Saving…' : 'Save assignments'}
        </button>
      </div>
    </form>
  );
}

function StatCell({
  label,
  value,
  subValue,
  tone,
}: {
  label: string;
  value: number;
  subValue?: string;
  tone: 'good' | 'warn' | 'bad' | 'neutral';
}) {
  const toneClass = {
    good: 'text-emerald-700',
    warn: 'text-amber-700',
    bad: 'text-red-700',
    neutral: 'text-gray-900',
  }[tone];
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <div className={`text-2xl font-bold ${toneClass}`}>
        {value}
        {subValue && (
          <span className="text-sm text-gray-500 font-normal ml-1">{subValue}</span>
        )}
      </div>
      <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500 mt-0.5">
        {label}
      </div>
    </div>
  );
}
