/**
 * Roster Pattern Validation Engine
 * (Pattern Engine Pass 3a — Phase 5.24 wave 2).
 *
 * Three pre-publish checks gate `POST /v1/roster-patterns/:id/publish`:
 *
 *   1. Factories Act §51 / §54 hours
 *      • §51: 48-hour week. Per-staff weekly_max_hours (column default 48,
 *        configurable up to 84 per the DB CHECK). Sliding 7-day window
 *        within the first cycle catches the worst case.
 *      • §54: 9-hour day. Per-staff daily_max_hours (column default 9,
 *        configurable up to 16). Maximum single-day duration across cycle.
 *
 *   2. Coverage rules (BR-AQ, mig 023)
 *      • For every active coverage_rules row in the venue, count the
 *        staff working the rule's shift_id (filtered by role_code if set)
 *        on each day of the cycle. If < min_staff: violation. Priority
 *        MANDATORY → blocks publish; WARNING → publishes with warnings.
 *      • Zone-level coverage (rule.zone_id NOT NULL) — Pass 3c-ii: a staff
 *        is counted toward a zone-specific rule iff their
 *        staff_roster_assignments.default_zone_assignments JSONB array
 *        contains an entry with matching zone_id. Canonical JSONB shape:
 *        `[{zone_id: string, assignment_type?: 'PRIMARY'|'SECONDARY'|'BACKUP'}]`.
 *        Parsed tolerantly — malformed entries are ignored.
 *
 *   3. Pattern overlap
 *      • No two PUBLISHED roster_patterns for the same venue may overlap
 *        in time AND share at least one staff member. Detection: query
 *        for time-overlapping patterns, then check staff_roster_assignments
 *        intersection. MANDATORY violation (DB-level partial UNIQUE
 *        idx_swap_active_per_assignment is the swap analogue; this is its
 *        roster analogue, enforced at the application layer because the
 *        spec allows non-overlapping staff between time-overlapping patterns).
 *
 * Materialisation primitive: given a pattern + its first-cycle slice,
 * produce the array of (day_index, staff_id, shift_id, duration_minutes)
 * tuples. The BR-AO materialisation worker (Pass 3b) reuses the same
 * primitive against a 30-day horizon to actually write shift_instances.
 *
 * Public surface:
 *   • validateRosterPattern(patternId, venueId) → ValidationResult
 *   • materialiseFirstCycle(pattern, …) — exported for the worker
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient } from '@safecommand/db';

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

export type ViolationPriority = 'MANDATORY' | 'WARNING';

export interface Violation {
  code:
    | 'FACTORIES_ACT_WEEKLY_OVER_CAP'
    | 'FACTORIES_ACT_DAILY_OVER_CAP'
    | 'COVERAGE_SHORTFALL'
    | 'PATTERN_OVERLAP_WITH_PUBLISHED';
  priority: ViolationPriority;
  message: string;
  // Context fields (any subset; populated per check)
  staff_id?: string;
  staff_name?: string;
  day_index?: number;
  weekly_hours?: number;
  daily_hours?: number;
  weekly_cap?: number;
  daily_cap?: number;
  zone_id?: string | null;
  role_code?: string | null;
  shift_id?: string | null;
  observed_staff_count?: number;
  required_staff_count?: number;
  conflicting_pattern_id?: string;
  conflicting_pattern_name?: string;
  shared_staff_ids?: string[];
}

export interface ValidationResult {
  ok: boolean;
  mandatory_violations: Violation[];
  warnings: Violation[];
  // Counts for client-side UX (no need to re-walk arrays)
  summary: {
    mandatory_count: number;
    warning_count: number;
    cycle_length_days: number;
    staff_count: number;
    coverage_rules_checked: number;
  };
}

interface RosterPattern {
  id: string;
  venue_id: string;
  name: string;
  cycle_type: string;
  cycle_length_days: number;
  effective_from: string;
  effective_to: string | null;
  status: string;
}

interface StaffRosterAssignment {
  id: string;
  staff_id: string;
  weekly_off_pattern: 'FIXED' | 'ROTATING_WEEKLY' | 'ROTATING_WITH_CYCLE';
  weekly_off_day: number | null;
  weekly_max_hours: number;
  daily_max_hours: number;
  default_zone_assignments?: unknown;  // JSONB: [{zone_id, assignment_type?}] — Pass 3c-ii
}

interface CyclePosition {
  staff_id: string;
  cycle_position: number;
  shift_id: string | null;
}

interface Shift {
  id: string;
  name: string | null;
  start_time: string; // 'HH:MM:SS'
  end_time: string;   // 'HH:MM:SS'
  is_overnight: boolean | null;
}

interface CoverageRule {
  id: string;
  zone_id: string | null;
  role_code: string | null;
  shift_id: string | null;
  min_staff: number;
  priority: ViolationPriority;
}

interface StaffMeta {
  id: string;
  name: string | null;
  role: string;
}

/** One materialised (day, staff, shift) tuple in the first cycle projection. */
export interface MaterialisedSlot {
  day_index: number;            // 0 .. cycle_length_days - 1
  staff_id: string;
  shift_id: string;             // non-null in a slot; OFF is represented by row absence
  duration_minutes: number;
  staff_role: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Shift duration helper
// ─────────────────────────────────────────────────────────────────────────

/**
 * Compute shift duration in minutes from start_time / end_time / is_overnight.
 * Times come as 'HH:MM:SS' strings from Postgres TIME columns. is_overnight
 * is the GENERATED column from mig 021 (TRUE when end_time < start_time).
 */
export function shiftDurationMinutes(shift: Pick<Shift, 'start_time' | 'end_time' | 'is_overnight'>): number {
  const [sh, sm] = shift.start_time.split(':').map(Number);
  const [eh, em] = shift.end_time.split(':').map(Number);
  const startMin = (sh ?? 0) * 60 + (sm ?? 0);
  let endMin = (eh ?? 0) * 60 + (em ?? 0);
  if (shift.is_overnight || endMin < startMin) endMin += 24 * 60;
  return Math.max(0, endMin - startMin);
}

// ─────────────────────────────────────────────────────────────────────────
// Materialisation primitive
// ─────────────────────────────────────────────────────────────────────────

/**
 * Project the pattern over its first cycle (day 0 .. cycle_length_days - 1).
 * Returns one MaterialisedSlot per (day, staff) where the staff has a
 * non-NULL shift_id in roster_cycle_positions. OFF days produce no slot.
 *
 * Reused by Pass 3b BR-AO materialisation worker against a rolling
 * 30-day horizon (apply same projection per day, mapping each calendar
 * date to (date - effective_from) % cycle_length_days).
 */
export function materialiseFirstCycle(
  pattern: RosterPattern,
  cyclePositions: CyclePosition[],
  shiftsById: Map<string, Shift>,
  staffById: Map<string, StaffMeta>,
): MaterialisedSlot[] {
  const out: MaterialisedSlot[] = [];
  for (const cp of cyclePositions) {
    if (!cp.shift_id) continue;                                      // OFF
    if (cp.cycle_position >= pattern.cycle_length_days) continue;    // defensive: ignore stray rows
    const shift = shiftsById.get(cp.shift_id);
    if (!shift) continue;
    const staff = staffById.get(cp.staff_id);
    if (!staff) continue;
    out.push({
      day_index: cp.cycle_position,
      staff_id: cp.staff_id,
      shift_id: cp.shift_id,
      duration_minutes: shiftDurationMinutes(shift),
      staff_role: staff.role,
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// Check 1 — Factories Act §51 / §54 hours
// ─────────────────────────────────────────────────────────────────────────

function checkFactoriesActHours(
  pattern: RosterPattern,
  staffAssignments: StaffRosterAssignment[],
  materialised: MaterialisedSlot[],
  staffById: Map<string, StaffMeta>,
): Violation[] {
  const violations: Violation[] = [];

  // Group minutes by (staff_id, day_index)
  const minutesByStaffDay = new Map<string, Map<number, number>>();
  for (const slot of materialised) {
    let m = minutesByStaffDay.get(slot.staff_id);
    if (!m) { m = new Map(); minutesByStaffDay.set(slot.staff_id, m); }
    m.set(slot.day_index, (m.get(slot.day_index) ?? 0) + slot.duration_minutes);
  }

  for (const sra of staffAssignments) {
    const dailyMap = minutesByStaffDay.get(sra.staff_id);
    if (!dailyMap) continue;  // staff scheduled OFF all cycle → no hour-cap concern
    const staffName = staffById.get(sra.staff_id)?.name ?? null;

    // §54 — daily cap. Maximum single-day duration.
    let maxDailyMinutes = 0;
    let maxDayIdx = -1;
    for (const [day, minutes] of dailyMap.entries()) {
      if (minutes > maxDailyMinutes) { maxDailyMinutes = minutes; maxDayIdx = day; }
    }
    const dailyCapMinutes = sra.daily_max_hours * 60;
    if (maxDailyMinutes > dailyCapMinutes) {
      violations.push({
        code: 'FACTORIES_ACT_DAILY_OVER_CAP',
        priority: 'MANDATORY',
        message: `${staffName ?? sra.staff_id} scheduled ${(maxDailyMinutes / 60).toFixed(1)}h on day ${maxDayIdx + 1} — exceeds ${sra.daily_max_hours}h daily cap (Factories Act §54)`,
        staff_id: sra.staff_id,
        ...(staffName != null && { staff_name: staffName }),
        day_index: maxDayIdx,
        daily_hours: maxDailyMinutes / 60,
        daily_cap: sra.daily_max_hours,
      });
    }

    // §51 — weekly cap. Sliding 7-day window across the cycle.
    // For cycle_length_days < 7 the window covers the whole cycle wrapped;
    // for >= 7 we slide from offset 0..(cycle_length - 7) and also wrap one window over the cycle boundary.
    const L = pattern.cycle_length_days;
    const weeklyCapMinutes = sra.weekly_max_hours * 60;
    let maxWeeklyMinutes = 0;
    let maxWeekStart = -1;
    const windowSize = Math.min(7, L);
    for (let start = 0; start < L; start++) {
      let sum = 0;
      for (let i = 0; i < windowSize; i++) {
        const day = (start + i) % L;
        sum += dailyMap.get(day) ?? 0;
      }
      if (sum > maxWeeklyMinutes) { maxWeeklyMinutes = sum; maxWeekStart = start; }
    }
    if (maxWeeklyMinutes > weeklyCapMinutes) {
      violations.push({
        code: 'FACTORIES_ACT_WEEKLY_OVER_CAP',
        priority: 'MANDATORY',
        message: `${staffName ?? sra.staff_id} scheduled ${(maxWeeklyMinutes / 60).toFixed(1)}h in 7-day window starting day ${maxWeekStart + 1} — exceeds ${sra.weekly_max_hours}h weekly cap (Factories Act §51)`,
        staff_id: sra.staff_id,
        ...(staffName != null && { staff_name: staffName }),
        day_index: maxWeekStart,
        weekly_hours: maxWeeklyMinutes / 60,
        weekly_cap: sra.weekly_max_hours,
      });
    }
  }

  return violations;
}

// ─────────────────────────────────────────────────────────────────────────
// Check 2 — Coverage rules
// ─────────────────────────────────────────────────────────────────────────

/**
 * Parse default_zone_assignments JSONB (per-staff) into a zone-id Set.
 * Canonical shape: `[{zone_id: string, assignment_type?: 'PRIMARY'|'SECONDARY'|'BACKUP'}]`.
 * Tolerant of malformed entries — returns empty Set if shape is wrong.
 */
function parseZoneIds(raw: unknown): Set<string> {
  if (!Array.isArray(raw)) return new Set();
  const out = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'object' || item == null) continue;
    const zid = (item as { zone_id?: unknown }).zone_id;
    if (typeof zid === 'string' && zid.length > 0) out.add(zid);
  }
  return out;
}

function checkCoverageRules(
  pattern: RosterPattern,
  materialised: MaterialisedSlot[],
  coverageRules: CoverageRule[],
  staffAssignments: StaffRosterAssignment[],
): Violation[] {
  const violations: Violation[] = [];
  if (coverageRules.length === 0) return violations;

  // ★ Pass 3c-ii: build zone coverage index per staff from default_zone_assignments
  const zonesByStaff = new Map<string, Set<string>>();
  for (const sra of staffAssignments) {
    zonesByStaff.set(sra.staff_id, parseZoneIds(sra.default_zone_assignments));
  }

  for (const rule of coverageRules) {
    // Worst-day staffing count across the cycle for this rule
    let worstObserved = Number.POSITIVE_INFINITY;
    let worstDayIdx = 0;
    for (let day = 0; day < pattern.cycle_length_days; day++) {
      let count = 0;
      const seenStaff = new Set<string>();  // dedupe in case a staff has two slots same day
      for (const slot of materialised) {
        if (slot.day_index !== day) continue;
        if (rule.shift_id && slot.shift_id !== rule.shift_id) continue;
        if (rule.role_code && slot.staff_role !== rule.role_code) continue;
        // ★ Pass 3c-ii: zone-level check. If rule.zone_id is set, the staff
        // must have that zone in their default_zone_assignments to be counted.
        // A staff with no default_zone_assignments (NULL/empty) is NOT counted
        // for zone-specific rules — they need explicit zone coverage assignment.
        if (rule.zone_id) {
          const zones = zonesByStaff.get(slot.staff_id);
          if (!zones || !zones.has(rule.zone_id)) continue;
        }
        if (seenStaff.has(slot.staff_id)) continue;
        seenStaff.add(slot.staff_id);
        count++;
      }
      if (count < worstObserved) { worstObserved = count; worstDayIdx = day; }
    }
    if (worstObserved === Number.POSITIVE_INFINITY) worstObserved = 0;

    if (worstObserved < rule.min_staff) {
      violations.push({
        code: 'COVERAGE_SHORTFALL',
        priority: rule.priority,
        message: `Coverage shortfall on day ${worstDayIdx + 1}: only ${worstObserved} ${rule.role_code ?? 'staff'} scheduled, ${rule.min_staff} required${rule.shift_id ? ' for this shift' : ''}${rule.zone_id ? ` for zone ${rule.zone_id.slice(0, 8)}` : ''}`,
        zone_id: rule.zone_id,
        role_code: rule.role_code,
        shift_id: rule.shift_id,
        day_index: worstDayIdx,
        observed_staff_count: worstObserved,
        required_staff_count: rule.min_staff,
      });
    }
  }

  return violations;
}

// ─────────────────────────────────────────────────────────────────────────
// Check 3 — Pattern overlap
// ─────────────────────────────────────────────────────────────────────────

async function checkPatternOverlap(
  db: SupabaseClient,
  pattern: RosterPattern,
  staffAssignments: StaffRosterAssignment[],
): Promise<Violation[]> {
  const violations: Violation[] = [];
  if (staffAssignments.length === 0) return violations;

  // 1) Find time-overlapping PUBLISHED patterns in the same venue (excluding self).
  // Two date ranges overlap iff A.start <= B.end (or B.end IS NULL) AND B.start <= A.end (or A.end IS NULL).
  // We let Supabase do the date arithmetic with two clauses + a NULL-safe expansion.
  const myFrom = pattern.effective_from;
  const myTo = pattern.effective_to;

  let q = db.from('roster_patterns')
    .select('id, name, effective_from, effective_to')
    .eq('venue_id', pattern.venue_id)
    .eq('status', 'PUBLISHED')
    .neq('id', pattern.id);

  // other.effective_from <= myTo (or myTo NULL — open-ended self)
  if (myTo) q = q.lte('effective_from', myTo);
  // other.effective_to >= myFrom OR other.effective_to IS NULL
  q = q.or(`effective_to.gte.${myFrom},effective_to.is.null`);

  const { data: overlappers, error } = await q;
  if (error || !overlappers || overlappers.length === 0) return violations;

  // 2) For each candidate, check staff intersection.
  const selfStaffIds = new Set(staffAssignments.map((sra) => sra.staff_id));
  for (const other of overlappers as Array<{ id: string; name: string }>) {
    const { data: otherStaff } = await db
      .from('staff_roster_assignments')
      .select('staff_id')
      .eq('pattern_id', other.id)
      .eq('venue_id', pattern.venue_id);

    const sharedIds = (otherStaff ?? [])
      .map((r) => (r as { staff_id: string }).staff_id)
      .filter((sid) => selfStaffIds.has(sid));

    if (sharedIds.length > 0) {
      violations.push({
        code: 'PATTERN_OVERLAP_WITH_PUBLISHED',
        priority: 'MANDATORY',
        message: `Pattern overlaps in time with PUBLISHED pattern "${other.name}" and shares ${sharedIds.length} staff member${sharedIds.length === 1 ? '' : 's'}. Suspend or archive the other pattern first, or remove the shared staff from this pattern.`,
        conflicting_pattern_id: other.id,
        conflicting_pattern_name: other.name,
        shared_staff_ids: sharedIds,
      });
    }
  }

  return violations;
}

// ─────────────────────────────────────────────────────────────────────────
// Public orchestrator
// ─────────────────────────────────────────────────────────────────────────

/**
 * Run all three checks against the pattern. Pure-read; no mutations.
 * Caller uses the result to (a) preview as a dry-run, or (b) gate publish
 * (block on `mandatory_violations.length > 0`).
 */
export async function validateRosterPattern(
  patternId: string,
  venueId: string,
): Promise<ValidationResult> {
  const db = getServiceClient();

  // ── 1) Pattern row
  const { data: pattern, error: pErr } = await db
    .from('roster_patterns')
    .select('id, venue_id, name, cycle_type, cycle_length_days, effective_from, effective_to, status')
    .eq('id', patternId)
    .eq('venue_id', venueId)
    .single();
  if (pErr || !pattern) {
    return {
      ok: false,
      mandatory_violations: [
        {
          code: 'PATTERN_OVERLAP_WITH_PUBLISHED',  // closest existing code; really a pre-condition error
          priority: 'MANDATORY',
          message: 'Pattern not found',
        },
      ],
      warnings: [],
      summary: { mandatory_count: 1, warning_count: 0, cycle_length_days: 0, staff_count: 0, coverage_rules_checked: 0 },
    };
  }
  const p = pattern as RosterPattern;

  // ── 2) Inputs in parallel
  const [
    { data: sraRows },
    { data: cpRows },
    { data: coverageRows },
  ] = await Promise.all([
    db.from('staff_roster_assignments')
      .select('id, staff_id, weekly_off_pattern, weekly_off_day, weekly_max_hours, daily_max_hours, default_zone_assignments')
      .eq('pattern_id', patternId).eq('venue_id', venueId),
    db.from('roster_cycle_positions')
      .select('staff_id, cycle_position, shift_id')
      .eq('pattern_id', patternId).eq('venue_id', venueId),
    db.from('coverage_rules')
      .select('id, zone_id, role_code, shift_id, min_staff, priority')
      .eq('venue_id', venueId),
  ]);

  const staffAssignments = (sraRows ?? []) as StaffRosterAssignment[];
  const cyclePositions = (cpRows ?? []) as CyclePosition[];
  const coverageRules = (coverageRows ?? []) as CoverageRule[];

  // ── 3) Lookup tables for shifts + staff used in this pattern
  const shiftIds = Array.from(new Set(cyclePositions.map((cp) => cp.shift_id).filter(Boolean) as string[]));
  const staffIds = Array.from(new Set(staffAssignments.map((sra) => sra.staff_id)));

  const [{ data: shiftRows }, { data: staffRows }] = await Promise.all([
    shiftIds.length > 0
      ? db.from('shifts')
          .select('id, name, start_time, end_time, is_overnight')
          .in('id', shiftIds)
          .eq('venue_id', venueId)
      : Promise.resolve({ data: [] as Shift[] }),
    staffIds.length > 0
      ? db.from('staff')
          .select('id, name, role')
          .in('id', staffIds)
          .eq('venue_id', venueId)
      : Promise.resolve({ data: [] as StaffMeta[] }),
  ]);

  const shiftsById = new Map<string, Shift>(
    (shiftRows ?? []).map((s) => [(s as Shift).id, s as Shift]),
  );
  const staffById = new Map<string, StaffMeta>(
    (staffRows ?? []).map((s) => [(s as StaffMeta).id, s as StaffMeta]),
  );

  // ── 4) Materialise first cycle (the shared primitive)
  const materialised = materialiseFirstCycle(p, cyclePositions, shiftsById, staffById);

  // ── 5) Run the three checks
  const factoriesActViolations = checkFactoriesActHours(p, staffAssignments, materialised, staffById);
  const coverageViolations = checkCoverageRules(p, materialised, coverageRules, staffAssignments);
  const overlapViolations = await checkPatternOverlap(db, p, staffAssignments);

  const all = [...factoriesActViolations, ...coverageViolations, ...overlapViolations];
  const mandatory = all.filter((v) => v.priority === 'MANDATORY');
  const warnings = all.filter((v) => v.priority === 'WARNING');

  return {
    ok: mandatory.length === 0,
    mandatory_violations: mandatory,
    warnings,
    summary: {
      mandatory_count: mandatory.length,
      warning_count: warnings.length,
      cycle_length_days: p.cycle_length_days,
      staff_count: staffAssignments.length,
      coverage_rules_checked: coverageRules.length,
    },
  };
}
