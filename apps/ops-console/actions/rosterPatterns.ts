'use server';

/**
 * Roster Pattern server actions — Ops Console (Pass 4a, Phase 5.24).
 *
 * SCOPE: Structural editing only (Create / Patch header / Bulk-replace
 * staff_roster_assignments / Bulk-replace roster_cycle_positions / Delete).
 *
 * NOT IN SCOPE HERE (lives on the dashboard via api, Pass 4b):
 *   - Validate (POST /v1/roster-patterns/:id/validate)
 *   - Publish (POST /:id/publish)
 *   - Sign-off (POST /:id/sign-off)
 *   - Suspend / Archive (POST /:id/{suspend,archive})
 *   - Materialise (POST /:id/materialise)
 *
 * Rationale: SC-Ops owns infrastructure setup (this file); SH/DSH at the
 * venue owns operational lifecycle moves (Pass 4b dashboard surface, via
 * the api). This matches BR-03 (Ops Console = internal tool, never venue-
 * accessible) + the existing shifts.ts pattern (SC-Ops provisions, SH
 * operates) + the v9 governance model.
 *
 * Auth posture: getAdminClient() service-role for all writes (matches
 * shifts.ts). Cross-venue safety net: every action filters by
 * .eq('venue_id', venue_id) (Rule 2).
 */

import { revalidatePath } from 'next/cache';
import { getAdminClient } from '@/lib/supabase';

// ────────────────────────────────────────────────────────────────────────
// Helpers
function trimRequired(v: FormDataEntryValue | null, label: string): string {
  const s = (v as string | null)?.trim() ?? '';
  if (s.length === 0) throw new Error(`${label} is required`);
  return s;
}

function trimOptional(v: FormDataEntryValue | null): string | null {
  const s = (v as string | null)?.trim() ?? '';
  return s.length === 0 ? null : s;
}

function asDate(v: FormDataEntryValue | null, label: string): string {
  const s = trimRequired(v, label);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`${label} must be a valid date (YYYY-MM-DD)`);
  return s;
}

function asDateOptional(v: FormDataEntryValue | null, label: string): string | null {
  const s = (v as string | null)?.trim() ?? '';
  if (s.length === 0) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`${label} must be a valid date (YYYY-MM-DD)`);
  return s;
}

function asInt(v: FormDataEntryValue | null, label: string, min: number, max: number, defaultIfEmpty?: number): number {
  const s = (v as string | null)?.trim() ?? '';
  if (s.length === 0) {
    if (defaultIfEmpty !== undefined) return defaultIfEmpty;
    throw new Error(`${label} is required`);
  }
  const n = parseInt(s, 10);
  if (Number.isNaN(n) || String(n) !== s) throw new Error(`${label} must be an integer`);
  if (n < min || n > max) throw new Error(`${label} must be between ${min} and ${max}`);
  return n;
}

const CYCLE_TYPES = ['WEEKLY', 'BIWEEKLY', 'N_WEEK_ROTATION', 'CUSTOM_DAYS'] as const;
const WEEKLY_OFF_PATTERNS = ['FIXED', 'ROTATING_WEEKLY', 'ROTATING_WITH_CYCLE'] as const;

// ────────────────────────────────────────────────────────────────────────
// CREATE — DRAFT pattern with header fields only.

export async function createPatternDraftAction(formData: FormData): Promise<void> {
  const venueId = trimRequired(formData.get('venue_id'), 'venue_id');
  const name = trimRequired(formData.get('name'), 'name');
  const cycleType = trimRequired(formData.get('cycle_type'), 'cycle_type');
  if (!(CYCLE_TYPES as readonly string[]).includes(cycleType)) {
    throw new Error(`cycle_type must be one of ${CYCLE_TYPES.join(', ')}`);
  }
  const cycleLength = asInt(formData.get('cycle_length_days'), 'cycle_length_days', 1, 60);
  const rotationCode = trimOptional(formData.get('rotation_pattern_code'));
  const effectiveFrom = asDate(formData.get('effective_from'), 'effective_from');
  const effectiveTo = asDateOptional(formData.get('effective_to'), 'effective_to');

  if (effectiveTo && effectiveTo < effectiveFrom) {
    throw new Error('effective_to must be on or after effective_from');
  }

  const db = getAdminClient();
  const { data, error } = await db
    .from('roster_patterns')
    .insert({
      venue_id: venueId,
      name,
      cycle_type: cycleType,
      cycle_length_days: cycleLength,
      rotation_pattern_code: rotationCode,
      effective_from: effectiveFrom,
      effective_to: effectiveTo,
      status: 'DRAFT',
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`Could not create pattern: ${error?.message ?? 'unknown'}`);

  revalidatePath(`/venues/${venueId}/patterns`);
}

// ────────────────────────────────────────────────────────────────────────
// PATCH — header fields (DRAFT only).

export async function patchPatternAction(formData: FormData): Promise<void> {
  const venueId = trimRequired(formData.get('venue_id'), 'venue_id');
  const id = trimRequired(formData.get('id'), 'id');
  const db = getAdminClient();

  const { data: existing, error: gErr } = await db
    .from('roster_patterns')
    .select('status')
    .eq('id', id).eq('venue_id', venueId).single();
  if (gErr || !existing) throw new Error('Pattern not found');
  if (existing.status !== 'DRAFT') throw new Error(`Cannot edit a ${existing.status} pattern`);

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const name = trimOptional(formData.get('name'));
  if (name) update['name'] = name;
  const cycleType = trimOptional(formData.get('cycle_type'));
  if (cycleType) {
    if (!(CYCLE_TYPES as readonly string[]).includes(cycleType)) {
      throw new Error(`cycle_type must be one of ${CYCLE_TYPES.join(', ')}`);
    }
    update['cycle_type'] = cycleType;
  }
  const cycleLen = formData.get('cycle_length_days');
  if (cycleLen && (cycleLen as string).trim() !== '') {
    update['cycle_length_days'] = asInt(cycleLen, 'cycle_length_days', 1, 60);
  }
  const rotationCode = formData.get('rotation_pattern_code');
  if (rotationCode !== null) {
    const v = trimOptional(rotationCode);
    update['rotation_pattern_code'] = v;  // null = clear
  }
  const effFrom = formData.get('effective_from');
  if (effFrom && (effFrom as string).trim() !== '') {
    update['effective_from'] = asDate(effFrom, 'effective_from');
  }
  const effTo = formData.get('effective_to');
  if (effTo !== null) {
    update['effective_to'] = asDateOptional(effTo, 'effective_to');
  }

  const { error } = await db
    .from('roster_patterns')
    .update(update)
    .eq('id', id).eq('venue_id', venueId);
  if (error) throw new Error(`Update failed: ${error.message}`);

  revalidatePath(`/venues/${venueId}/patterns/${id}`);
}

// ────────────────────────────────────────────────────────────────────────
// REPLACE — staff_roster_assignments (DRAFT only; bulk).
// FormData encoding (per-row):
//   staff[i].staff_id              = "<uuid>"
//   staff[i].weekly_off_pattern    = "FIXED" | ...
//   staff[i].weekly_off_day        = "0".."6" or ""
//   staff[i].weekly_max_hours      = "48"
//   staff[i].daily_max_hours       = "9"
//   staff[i].default_zone_assignments  = (JSON string, optional)
// Where i = 0..N-1; iteration stops at the first missing staff_id.

export async function replaceStaffAssignmentsAction(formData: FormData): Promise<void> {
  const venueId = trimRequired(formData.get('venue_id'), 'venue_id');
  const patternId = trimRequired(formData.get('pattern_id'), 'pattern_id');
  const db = getAdminClient();

  const { data: existing, error: gErr } = await db
    .from('roster_patterns')
    .select('status')
    .eq('id', patternId).eq('venue_id', venueId).single();
  if (gErr || !existing) throw new Error('Pattern not found');
  if (existing.status !== 'DRAFT') throw new Error('Only DRAFT patterns are editable here');

  const rows: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  let i = 0;
  while (true) {
    const staffId = (formData.get(`staff[${i}].staff_id`) as string | null)?.trim();
    if (!staffId) break;
    if (seen.has(staffId)) throw new Error(`Duplicate staff_id at row ${i + 1}: ${staffId}`);
    seen.add(staffId);

    const woPattern = trimOptional(formData.get(`staff[${i}].weekly_off_pattern`)) ?? 'FIXED';
    if (!(WEEKLY_OFF_PATTERNS as readonly string[]).includes(woPattern)) {
      throw new Error(`Row ${i + 1}: weekly_off_pattern must be one of ${WEEKLY_OFF_PATTERNS.join(', ')}`);
    }
    const woDayRaw = (formData.get(`staff[${i}].weekly_off_day`) as string | null)?.trim() ?? '';
    const woDay = woDayRaw === '' ? null : asInt(woDayRaw, 'weekly_off_day', 0, 6);
    const weeklyMax = asInt(formData.get(`staff[${i}].weekly_max_hours`), 'weekly_max_hours', 1, 84, 48);
    const dailyMax = asInt(formData.get(`staff[${i}].daily_max_hours`), 'daily_max_hours', 1, 16, 9);
    const zonesRaw = (formData.get(`staff[${i}].default_zone_assignments`) as string | null)?.trim() ?? '';
    let zones: unknown = null;
    if (zonesRaw.length > 0) {
      try {
        zones = JSON.parse(zonesRaw);
      } catch {
        throw new Error(`Row ${i + 1}: default_zone_assignments must be valid JSON array`);
      }
      if (!Array.isArray(zones)) throw new Error(`Row ${i + 1}: default_zone_assignments must be an array`);
    }

    rows.push({
      venue_id: venueId,
      pattern_id: patternId,
      staff_id: staffId,
      weekly_off_pattern: woPattern,
      weekly_off_day: woDay,
      weekly_max_hours: weeklyMax,
      daily_max_hours: dailyMax,
      default_zone_assignments: zones,
    });
    i++;
  }

  // DELETE + INSERT bulk-replace
  const { error: delErr } = await db
    .from('staff_roster_assignments')
    .delete()
    .eq('pattern_id', patternId).eq('venue_id', venueId);
  if (delErr) throw new Error(`Could not clear existing staff: ${delErr.message}`);

  if (rows.length > 0) {
    const { error: insErr } = await db.from('staff_roster_assignments').insert(rows);
    if (insErr) throw new Error(`Could not insert staff: ${insErr.message}`);
  }

  revalidatePath(`/venues/${venueId}/patterns/${patternId}`);
}

// ────────────────────────────────────────────────────────────────────────
// REPLACE — roster_cycle_positions (DRAFT only; bulk).
// FormData encoding:
//   position__<staffId>__<dayIndex> = "<shiftId>" | "OFF" | ""
// Empty value = unspecified (not stored); "OFF" = explicit OFF row (shift_id NULL);
// any other value = shift_id.

export async function replaceCyclePositionsAction(formData: FormData): Promise<void> {
  const venueId = trimRequired(formData.get('venue_id'), 'venue_id');
  const patternId = trimRequired(formData.get('pattern_id'), 'pattern_id');
  const db = getAdminClient();

  const { data: existing, error: gErr } = await db
    .from('roster_patterns')
    .select('status, cycle_length_days')
    .eq('id', patternId).eq('venue_id', venueId).single();
  if (gErr || !existing) throw new Error('Pattern not found');
  if (existing.status !== 'DRAFT') throw new Error('Only DRAFT patterns are editable here');
  const cycleLen = (existing as { cycle_length_days: number }).cycle_length_days;

  const rows: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  for (const [key, raw] of formData.entries()) {
    const m = key.match(/^position__([0-9a-f-]+)__(\d+)$/i);
    if (!m) continue;
    const staffId = m[1] as string;
    const dayIdx = parseInt(m[2] as string, 10);
    if (Number.isNaN(dayIdx) || dayIdx < 0 || dayIdx >= cycleLen) continue;
    const val = (raw as string).trim();
    if (val === '') continue;  // unspecified — no row written

    const dedupKey = `${staffId}__${dayIdx}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    rows.push({
      venue_id: venueId,
      pattern_id: patternId,
      staff_id: staffId,
      cycle_position: dayIdx,
      shift_id: val === 'OFF' ? null : val,
    });
  }

  // DELETE + INSERT
  const { error: delErr } = await db
    .from('roster_cycle_positions')
    .delete()
    .eq('pattern_id', patternId).eq('venue_id', venueId);
  if (delErr) throw new Error(`Could not clear positions: ${delErr.message}`);

  if (rows.length > 0) {
    const { error: insErr } = await db.from('roster_cycle_positions').insert(rows);
    if (insErr) throw new Error(`Could not insert positions: ${insErr.message}`);
  }

  revalidatePath(`/venues/${venueId}/patterns/${patternId}`);
}

// ────────────────────────────────────────────────────────────────────────
// DELETE — DRAFT pattern (convenience for cleanup).

export async function deletePatternAction(formData: FormData): Promise<void> {
  const venueId = trimRequired(formData.get('venue_id'), 'venue_id');
  const id = trimRequired(formData.get('id'), 'id');
  const db = getAdminClient();

  const { data: existing, error: gErr } = await db
    .from('roster_patterns')
    .select('status')
    .eq('id', id).eq('venue_id', venueId).single();
  if (gErr || !existing) throw new Error('Pattern not found');
  if (existing.status !== 'DRAFT') {
    throw new Error(`Cannot delete a ${existing.status} pattern. Use Archive from the venue dashboard instead.`);
  }

  // CASCADE clears child rows (staff_roster_assignments + roster_cycle_positions
  // both ON DELETE CASCADE per mig 022).
  const { error } = await db
    .from('roster_patterns')
    .delete()
    .eq('id', id).eq('venue_id', venueId);
  if (error) throw new Error(`Delete failed: ${error.message}`);

  revalidatePath(`/venues/${venueId}/patterns`);
}
