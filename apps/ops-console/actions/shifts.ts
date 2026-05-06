'use server';

/**
 * Shift / roster server actions — Ops Console.
 *
 * Surfaces the shift-management workflow that makes Zone Accountability
 * (BR-19) come alive: SC Ops creates shift templates, instances, and
 * staff-to-zone assignments. Once these rows exist, mobile + dashboard
 * Zone Accountability surfaces auto-populate via the existing
 * /v1/zones/accountability endpoint.
 *
 * Auth posture (matches existing pattern in venues.ts):
 *   - All writes go through getAdminClient() (service-role) — bypasses RLS
 *     by design. EC-14: Ops Console is a separate auth domain; admin client
 *     is the standard pattern for SC-Ops-driven venue setup.
 *   - Every action filters by .eq('venue_id', venue_id) as the safety net
 *     against cross-venue writes (Rule 2 — venue_id in every query).
 *
 * RLS state on these tables (validated 2026-05-06):
 *   - shifts_insert         : SH/DSH OR is_sc_ops()
 *   - shift_instances_insert: SH/DSH/SHIFT_COMMANDER (no is_sc_ops!)
 *   - zone_assignments_*    : SH/DSH/SHIFT_COMMANDER (no is_sc_ops!)
 * Service-role bypass means Ops Console is unaffected by these gates.
 *
 * Scope discipline:
 *   - No api endpoint changes here; mobile reads via existing
 *     /v1/zones/accountability (works as-is once rows exist)
 *   - 2-person validation enforced server-side in this action layer
 *   - Bulk-replace pattern for assignments (idempotent per shift_instance)
 *
 * Refs: BR-04 / BR-12 / BR-13 / BR-19 / BR-61 (MBV shift structure)
 * Refs: docs/api/conventions.md §19 (entity lifecycle pattern)
 */

import { revalidatePath } from 'next/cache';
import { getAdminClient } from '@/lib/supabase';
import type { ShiftAssignmentType, ShiftInstanceStatus } from '@safecommand/types';

// ──────────────────────────────────────────────────────────────────────────
// Helpers

function trimRequired(value: FormDataEntryValue | null, label: string): string {
  const v = (value as string | null)?.trim() ?? '';
  if (v.length === 0) throw new Error(`${label} is required`);
  return v;
}

function asTime(value: FormDataEntryValue | null, label: string): string {
  // HTML <input type="time"> sends "HH:MM"; Postgres time accepts that.
  const v = trimRequired(value, label);
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(v)) {
    throw new Error(`${label} must be a valid time (HH:MM)`);
  }
  return v;
}

function asDate(value: FormDataEntryValue | null, label: string): string {
  const v = trimRequired(value, label);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    throw new Error(`${label} must be a valid date (YYYY-MM-DD)`);
  }
  return v;
}

// ──────────────────────────────────────────────────────────────────────────
// Shift template CRUD

/**
 * createShiftAction — defines a new recurring shift for a venue.
 *
 * `building_id` may be NULL (venue-wide shift, default). Phase B / MBV
 * pilot: SH/DSH set per-building shifts (e.g. EMRG-BLOCK 24h vs MAIN 09–18).
 */
export async function createShiftAction(formData: FormData): Promise<void> {
  const venue_id = trimRequired(formData.get('venue_id'), 'Venue');
  const name = trimRequired(formData.get('name'), 'Shift name');
  const start_time = asTime(formData.get('start_time'), 'Start time');
  const end_time = asTime(formData.get('end_time'), 'End time');
  const buildingRaw = formData.get('building_id') as string | null;
  const building_id = buildingRaw && buildingRaw.length > 0 ? buildingRaw : null;

  const { error } = await getAdminClient().from('shifts').insert({
    venue_id,
    name,
    start_time,
    end_time,
    building_id,
    is_active: true,
  });

  if (error) throw new Error(error.message);
  revalidatePath(`/venues/${venue_id}`);
}

export async function updateShiftAction(formData: FormData): Promise<void> {
  const venue_id = trimRequired(formData.get('venue_id'), 'Venue');
  const id = trimRequired(formData.get('id'), 'Shift id');
  const name = trimRequired(formData.get('name'), 'Shift name');
  const start_time = asTime(formData.get('start_time'), 'Start time');
  const end_time = asTime(formData.get('end_time'), 'End time');
  const buildingRaw = formData.get('building_id') as string | null;
  const building_id = buildingRaw && buildingRaw.length > 0 ? buildingRaw : null;

  const { error } = await getAdminClient()
    .from('shifts')
    .update({ name, start_time, end_time, building_id })
    .eq('id', id)
    .eq('venue_id', venue_id);

  if (error) throw new Error(error.message);
  revalidatePath(`/venues/${venue_id}`);
}

/**
 * deactivateShiftAction — soft-disable. Hard delete is risky because
 * shift_instances FK back to shifts; we soft-disable so historical
 * instances remain queryable while the template is hidden from new
 * instance creation.
 */
export async function deactivateShiftAction(formData: FormData): Promise<void> {
  const venue_id = trimRequired(formData.get('venue_id'), 'Venue');
  const id = trimRequired(formData.get('id'), 'Shift id');

  const { error } = await getAdminClient()
    .from('shifts')
    .update({ is_active: false })
    .eq('id', id)
    .eq('venue_id', venue_id);

  if (error) throw new Error(error.message);
  revalidatePath(`/venues/${venue_id}`);
}

export async function reactivateShiftAction(formData: FormData): Promise<void> {
  const venue_id = trimRequired(formData.get('venue_id'), 'Venue');
  const id = trimRequired(formData.get('id'), 'Shift id');

  const { error } = await getAdminClient()
    .from('shifts')
    .update({ is_active: true })
    .eq('id', id)
    .eq('venue_id', venue_id);

  if (error) throw new Error(error.message);
  revalidatePath(`/venues/${venue_id}`);
}

// ──────────────────────────────────────────────────────────────────────────
// Shift instance lifecycle

/**
 * createShiftInstanceAction — creates today's (or specified-date) instance
 * of a shift template. Idempotent via the (venue_id, shift_id, shift_date)
 * UNIQUE constraint — second call with same params just no-ops at DB level.
 *
 * status defaults to PENDING; activate via activateShiftInstanceAction.
 */
export async function createShiftInstanceAction(formData: FormData): Promise<void> {
  const venue_id = trimRequired(formData.get('venue_id'), 'Venue');
  const shift_id = trimRequired(formData.get('shift_id'), 'Shift');
  const shift_date = asDate(formData.get('shift_date'), 'Shift date');

  // Inherit building_id from the shift template (denormalised for RLS speed)
  const { data: shift, error: shiftErr } = await getAdminClient()
    .from('shifts')
    .select('building_id')
    .eq('id', shift_id)
    .eq('venue_id', venue_id)
    .single();
  if (shiftErr || !shift) throw new Error('Shift template not found');

  const { error } = await getAdminClient()
    .from('shift_instances')
    .upsert(
      {
        venue_id,
        shift_id,
        shift_date,
        building_id: shift.building_id,
        status: 'PENDING',
      },
      { onConflict: 'venue_id,shift_id,shift_date', ignoreDuplicates: true },
    );

  if (error) throw new Error(error.message);
  revalidatePath(`/venues/${venue_id}`);
}

/**
 * activateShiftInstanceAction — sets status=ACTIVE + commander_staff_id +
 * activated_at. This is the moment a shift "goes live" operationally.
 *
 * Validates that the proposed commander is an active staff member of the
 * venue with command authority (SH/DSH/SHIFT_COMMANDER). Rejects otherwise.
 */
export async function activateShiftInstanceAction(formData: FormData): Promise<void> {
  const venue_id = trimRequired(formData.get('venue_id'), 'Venue');
  const id = trimRequired(formData.get('id'), 'Shift instance id');
  const commander_staff_id = trimRequired(
    formData.get('commander_staff_id'),
    'Commander',
  );

  // Validate commander has command authority
  const { data: commander, error: commErr } = await getAdminClient()
    .from('staff')
    .select('role, is_active')
    .eq('id', commander_staff_id)
    .eq('venue_id', venue_id)
    .single();
  if (commErr || !commander) throw new Error('Commander staff not found in this venue');
  if (!commander.is_active) throw new Error('Commander staff must be ACTIVE');
  if (!['SH', 'DSH', 'SHIFT_COMMANDER'].includes(commander.role)) {
    throw new Error(
      'Commander must be Security Head, Deputy Security Head, or Shift Commander',
    );
  }

  const { error } = await getAdminClient()
    .from('shift_instances')
    .update({
      status: 'ACTIVE' as ShiftInstanceStatus,
      commander_staff_id,
      activated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('venue_id', venue_id);

  if (error) throw new Error(error.message);
  revalidatePath(`/venues/${venue_id}`);
}

export async function closeShiftInstanceAction(formData: FormData): Promise<void> {
  const venue_id = trimRequired(formData.get('venue_id'), 'Venue');
  const id = trimRequired(formData.get('id'), 'Shift instance id');

  const { error } = await getAdminClient()
    .from('shift_instances')
    .update({
      status: 'CLOSED' as ShiftInstanceStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('venue_id', venue_id);

  if (error) throw new Error(error.message);
  revalidatePath(`/venues/${venue_id}`);
}

// ──────────────────────────────────────────────────────────────────────────
// Zone assignments (the heart of accountability)

interface AssignmentInput {
  staff_id: string;
  zone_id: string;
  assignment_type: ShiftAssignmentType;
}

/**
 * replaceZoneAssignmentsAction — bulk REPLACE all assignments for a shift
 * instance in one transaction. Idempotent semantics: the form represents
 * the complete desired state; we delete existing rows and insert the
 * submitted set.
 *
 * Why bulk-replace (industry pattern from Quinyx / Deputy):
 *   - Operator submits the full grid state once
 *   - No partial-update race conditions ("did my last click save?")
 *   - Trivial to undo (re-submit prior state)
 *
 * Validation enforced before write:
 *   - Each (staff_id, zone_id) pair belongs to the venue
 *   - Two-person zones must have ≥2 staff assigned (or 0 — entirely uncovered)
 *
 * The form serialises the assignment set as a JSON string in the
 * `assignments` field (array of {staff_id, zone_id, assignment_type}).
 *
 * Returns nothing on success; throws on validation failure.
 */
export async function replaceZoneAssignmentsAction(formData: FormData): Promise<void> {
  const venue_id = trimRequired(formData.get('venue_id'), 'Venue');
  const shift_instance_id = trimRequired(
    formData.get('shift_instance_id'),
    'Shift instance',
  );
  const raw = trimRequired(formData.get('assignments'), 'Assignments payload');

  let parsed: AssignmentInput[];
  try {
    parsed = JSON.parse(raw) as AssignmentInput[];
  } catch {
    throw new Error('Invalid assignments payload (not JSON)');
  }
  if (!Array.isArray(parsed)) {
    throw new Error('Assignments payload must be an array');
  }

  // Validate all referenced zones require two-person coverage where flagged
  if (parsed.length > 0) {
    const zoneIds = [...new Set(parsed.map((a) => a.zone_id))];
    const { data: zones, error: zErr } = await getAdminClient()
      .from('zones')
      .select('id, name, two_person_required')
      .eq('venue_id', venue_id)
      .in('id', zoneIds);
    if (zErr) throw new Error(`Failed to validate zones: ${zErr.message}`);

    // Group assignments by zone, count staff per zone
    const staffPerZone = new Map<string, Set<string>>();
    for (const a of parsed) {
      const set = staffPerZone.get(a.zone_id) ?? new Set<string>();
      set.add(a.staff_id);
      staffPerZone.set(a.zone_id, set);
    }

    // 2-person rule: any zone with two_person_required=true must have ≥2 staff
    for (const zone of zones ?? []) {
      if (!zone.two_person_required) continue;
      const count = staffPerZone.get(zone.id)?.size ?? 0;
      if (count > 0 && count < 2) {
        throw new Error(
          `Zone "${zone.name}" requires 2-person coverage (currently ${count}). ` +
            `Either assign a second staff member or remove the existing assignment.`,
        );
      }
    }
  }

  // Validate shift_instance belongs to venue
  const { data: instance, error: iErr } = await getAdminClient()
    .from('shift_instances')
    .select('id')
    .eq('id', shift_instance_id)
    .eq('venue_id', venue_id)
    .single();
  if (iErr || !instance) throw new Error('Shift instance not found in this venue');

  // Bulk replace: delete existing → insert new (within a single revalidation cycle)
  const { error: delErr } = await getAdminClient()
    .from('staff_zone_assignments')
    .delete()
    .eq('shift_instance_id', shift_instance_id)
    .eq('venue_id', venue_id);
  if (delErr) throw new Error(`Failed to clear assignments: ${delErr.message}`);

  if (parsed.length > 0) {
    const rows = parsed.map((a) => ({
      venue_id,
      shift_instance_id,
      staff_id: a.staff_id,
      zone_id: a.zone_id,
      assignment_type: a.assignment_type,
    }));
    const { error: insErr } = await getAdminClient()
      .from('staff_zone_assignments')
      .insert(rows);
    if (insErr) throw new Error(`Failed to save assignments: ${insErr.message}`);
  }

  revalidatePath(`/venues/${venue_id}`);
}
