/**
 * BR-AO Roster Materialisation Worker
 * (Pattern Engine Pass 3b — Phase 5.24 wave 2).
 *
 * Reads a PUBLISHED roster_pattern and writes shift_instances +
 * staff_zone_assignments idempotently across the [from_date, to_date]
 * horizon. Skips dates where APPROVED staff_unavailability covers the staff.
 *
 * Per-day algorithm:
 *   1) pos = (date - pattern.effective_from) % cycle_length_days
 *   2) For each (staff_id, shift_id) in roster_cycle_positions at pos:
 *      a) If APPROVED unavailability covers this date for this staff → skip
 *      b) Find-or-create shift_instance(shift_id, instance_date)
 *      c) For each zone in default_zone_assignments JSONB:
 *           find-or-create staff_zone_assignments(shift_instance_id, staff_id, zone_id)
 *
 * Idempotency: every write is find-or-create on natural keys. Re-running
 * the same job produces 0 new rows.
 *
 * Trigger:
 *   • PUBLISH         — API enqueues 30-day initial horizon on /publish success
 *   • MANUAL          — SH triggers via POST /v1/roster-patterns/:id/materialise
 *   • ROLLING_HORIZON — nightly tick extends the horizon (Pass 3c)
 *
 * Worker-paused gate: process is alive but the BullMQ Worker only constructs
 * inside the `WORKERS_PAUSED=false` branch in apps/scheduler/src/index.ts.
 * Jobs accumulate in Redis until June 1 unfreeze. Per ADR 0005.
 */

import type { Job } from 'bullmq';
import type { Logger } from 'pino';
import { getServiceClient } from '@safecommand/db';
import type { RosterMaterialisationJob } from '@safecommand/types';

interface RosterPatternRow {
  id: string;
  venue_id: string;
  status: string;
  cycle_length_days: number;
  effective_from: string;     // YYYY-MM-DD
  effective_to: string | null;
}

interface CyclePositionRow {
  staff_id: string;
  cycle_position: number;
  shift_id: string | null;
}

interface UnavailRow {
  staff_id: string;
  unavailable_from: string;
  unavailable_to: string;
}

interface StaffAssignRow {
  staff_id: string;
  default_zone_assignments: unknown;
}

interface ShiftInstanceRow {
  id: string;
  shift_id: string;
  instance_date: string;
}

interface ZoneAssignEntry {
  zone_id?: string;
  assignment_type?: 'PRIMARY' | 'SECONDARY' | 'BACKUP';
}

export interface MaterialisationSummary {
  pattern_id: string;
  days_processed: number;
  shift_instances_created: number;
  zone_assignments_created: number;
  skipped_due_to_unavailability: number;
  skipped_no_zones: number;
  errors: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function isISODate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

function daysBetween(fromISO: string, toISO: string): number {
  const ms = Date.parse(toISO) - Date.parse(fromISO);
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

function addDays(isoDate: string, n: number): string {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Parse default_zone_assignments JSONB into a normalised list. Empty/null/
 * malformed → []. Tolerant by design: SH might leave zone-assignments
 * empty on a pattern (zones get filled in later via /shift-instances/:id/zone-assignments).
 */
function parseZoneAssignments(raw: unknown): ZoneAssignEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (typeof item !== 'object' || item == null) return [];
    const it = item as { zone_id?: unknown; assignment_type?: unknown };
    if (typeof it.zone_id !== 'string' || !it.zone_id) return [];
    const t = typeof it.assignment_type === 'string' ? it.assignment_type : undefined;
    return [{
      zone_id: it.zone_id,
      ...(t === 'PRIMARY' || t === 'SECONDARY' || t === 'BACKUP' ? { assignment_type: t } : {}),
    } as ZoneAssignEntry];
  });
}

// ─── Worker processor ────────────────────────────────────────────────────

export async function processRosterMaterialisation(
  job: Job<RosterMaterialisationJob>,
  logger: Logger,
): Promise<MaterialisationSummary> {
  const { venue_id, pattern_id, from_date, to_date, trigger } = job.data;

  if (!isISODate(from_date) || !isISODate(to_date)) {
    throw new Error(`Invalid date range: from=${from_date} to=${to_date}`);
  }
  const totalDays = daysBetween(from_date, to_date) + 1;
  if (totalDays < 1 || totalDays > 90) {
    throw new Error(`Date range too large/small: ${totalDays} days (allowed 1..90)`);
  }

  const db = getServiceClient();
  const summary: MaterialisationSummary = {
    pattern_id,
    days_processed: 0,
    shift_instances_created: 0,
    zone_assignments_created: 0,
    skipped_due_to_unavailability: 0,
    skipped_no_zones: 0,
    errors: [],
  };

  // ── Load pattern + supporting rows
  const { data: pattern, error: pErr } = await db
    .from('roster_patterns')
    .select('id, venue_id, status, cycle_length_days, effective_from, effective_to')
    .eq('id', pattern_id)
    .eq('venue_id', venue_id)
    .single();
  if (pErr || !pattern) throw new Error(`Pattern ${pattern_id} not found in venue ${venue_id}`);
  const p = pattern as RosterPatternRow;
  if (p.status !== 'PUBLISHED') {
    logger.warn({ pattern_id, status: p.status }, 'Skipping materialisation — pattern not PUBLISHED');
    return summary;
  }

  const [cyclePosRes, staffAssignRes, unavailRes] = await Promise.all([
    db.from('roster_cycle_positions')
      .select('staff_id, cycle_position, shift_id')
      .eq('pattern_id', pattern_id).eq('venue_id', venue_id),
    db.from('staff_roster_assignments')
      .select('staff_id, default_zone_assignments')
      .eq('pattern_id', pattern_id).eq('venue_id', venue_id),
    db.from('staff_unavailability')
      .select('staff_id, unavailable_from, unavailable_to')
      .eq('venue_id', venue_id)
      .eq('status', 'APPROVED')
      .lte('unavailable_from', to_date)
      .gte('unavailable_to', from_date),
  ]);

  const cyclePositions = (cyclePosRes.data ?? []) as CyclePositionRow[];
  const staffAssigns = (staffAssignRes.data ?? []) as StaffAssignRow[];
  const unavail = (unavailRes.data ?? []) as UnavailRow[];

  // Index per-staff for fast lookups
  const zonesByStaff = new Map<string, ZoneAssignEntry[]>();
  for (const sa of staffAssigns) {
    zonesByStaff.set(sa.staff_id, parseZoneAssignments(sa.default_zone_assignments));
  }
  const unavailByStaff = new Map<string, UnavailRow[]>();
  for (const u of unavail) {
    let arr = unavailByStaff.get(u.staff_id);
    if (!arr) { arr = []; unavailByStaff.set(u.staff_id, arr); }
    arr.push(u);
  }
  function isUnavailable(staffId: string, dateISO: string): boolean {
    const arr = unavailByStaff.get(staffId);
    if (!arr) return false;
    for (const u of arr) if (dateISO >= u.unavailable_from && dateISO <= u.unavailable_to) return true;
    return false;
  }

  // Cache shift_instance rows by `${shift_id}__${date}` to avoid duplicate lookups in same job
  const shiftInstanceCache = new Map<string, ShiftInstanceRow>();
  async function findOrCreateShiftInstance(shiftId: string, dateISO: string): Promise<ShiftInstanceRow | null> {
    const k = `${shiftId}__${dateISO}`;
    const cached = shiftInstanceCache.get(k);
    if (cached) return cached;

    const { data: existing } = await db
      .from('shift_instances')
      .select('id, shift_id, instance_date')
      .eq('venue_id', venue_id)
      .eq('shift_id', shiftId)
      .eq('instance_date', dateISO)
      .maybeSingle();
    if (existing) {
      const row = existing as ShiftInstanceRow;
      shiftInstanceCache.set(k, row);
      return row;
    }

    const { data: created, error: cErr } = await db
      .from('shift_instances')
      .insert({
        venue_id,
        shift_id: shiftId,
        instance_date: dateISO,
        status: 'PENDING',
      })
      .select('id, shift_id, instance_date')
      .single();
    if (cErr || !created) {
      // 23505 unique_violation = race: another worker beat us; re-fetch
      if ((cErr as { code?: string } | null)?.code === '23505') {
        const { data: refetched } = await db
          .from('shift_instances')
          .select('id, shift_id, instance_date')
          .eq('venue_id', venue_id)
          .eq('shift_id', shiftId)
          .eq('instance_date', dateISO)
          .maybeSingle();
        if (refetched) {
          const row = refetched as ShiftInstanceRow;
          shiftInstanceCache.set(k, row);
          return row;
        }
      }
      summary.errors.push(`shift_instance create failed for ${shiftId} on ${dateISO}: ${cErr?.message}`);
      return null;
    }
    const row = created as ShiftInstanceRow;
    shiftInstanceCache.set(k, row);
    summary.shift_instances_created++;
    return row;
  }

  async function ensureZoneAssignment(
    shiftInstanceId: string,
    staffId: string,
    zoneId: string,
    assignmentType: ZoneAssignEntry['assignment_type'] | undefined,
  ): Promise<void> {
    const { data: existing } = await db
      .from('staff_zone_assignments')
      .select('id')
      .eq('shift_instance_id', shiftInstanceId)
      .eq('staff_id', staffId)
      .eq('zone_id', zoneId)
      .maybeSingle();
    if (existing) return;

    const { error: aErr } = await db
      .from('staff_zone_assignments')
      .insert({
        venue_id,
        shift_instance_id: shiftInstanceId,
        staff_id: staffId,
        zone_id: zoneId,
        ...(assignmentType && { assignment_type: assignmentType }),
      });
    if (aErr) {
      if ((aErr as { code?: string } | null)?.code === '23505') return;  // race: another insert won
      summary.errors.push(`zone_assignment failed for ${staffId} @ ${zoneId} on shift_instance ${shiftInstanceId}: ${aErr.message}`);
      return;
    }
    summary.zone_assignments_created++;
  }

  // ── Walk the date range
  const effFromOffset = (() => {
    const startISO = from_date >= p.effective_from ? from_date : p.effective_from;
    return daysBetween(p.effective_from, startISO);
  })();
  const startISO = from_date >= p.effective_from ? from_date : p.effective_from;
  const endISO = (() => {
    if (!p.effective_to) return to_date;
    return to_date <= p.effective_to ? to_date : p.effective_to;
  })();
  if (endISO < startISO) {
    logger.info({ pattern_id, startISO, endISO }, 'No overlap between job range and pattern effective range');
    return summary;
  }
  const span = daysBetween(startISO, endISO) + 1;

  // Index cycle_positions by position for fast inner-loop lookup
  const positionMap = new Map<number, Array<{ staff_id: string; shift_id: string }>>();
  for (const cp of cyclePositions) {
    if (!cp.shift_id) continue;
    let arr = positionMap.get(cp.cycle_position);
    if (!arr) { arr = []; positionMap.set(cp.cycle_position, arr); }
    arr.push({ staff_id: cp.staff_id, shift_id: cp.shift_id });
  }

  for (let i = 0; i < span; i++) {
    const dateISO = addDays(startISO, i);
    const pos = (effFromOffset + i) % p.cycle_length_days;
    const slots = positionMap.get(pos) ?? [];
    summary.days_processed++;

    for (const slot of slots) {
      if (isUnavailable(slot.staff_id, dateISO)) {
        summary.skipped_due_to_unavailability++;
        continue;
      }
      const si = await findOrCreateShiftInstance(slot.shift_id, dateISO);
      if (!si) continue;

      const zones = zonesByStaff.get(slot.staff_id) ?? [];
      if (zones.length === 0) {
        summary.skipped_no_zones++;
        continue;
      }
      for (const z of zones) {
        if (!z.zone_id) continue;
        await ensureZoneAssignment(si.id, slot.staff_id, z.zone_id, z.assignment_type);
      }
    }
  }

  logger.info(
    {
      trigger,
      from_date: startISO,
      to_date: endISO,
      ...summary,  // includes pattern_id + counts
    },
    'Roster materialisation complete',
  );
  return summary;
}
