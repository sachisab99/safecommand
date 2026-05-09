/**
 * SIRE incident bootstrap — fans out per-role action assignments after a
 * SIRE-enabled incident is declared.
 *
 * Day 2 strategy (until BR-O shift-roster integration ships in Phase 5.22):
 *   - Per affected zone: pick 1 active GS (round-robin) + 1 active FS (round-robin)
 *   - Venue-wide: pick the declaring SH/DSH (if applicable) + 1 active DSH (if not declaring)
 *     + 1 active SHIFT_COMMANDER
 *   - For each (staff, role, action_order) tuple from the role's resolved template,
 *     insert one incident_action_assignments row
 *   - Snapshot all resolved templates (per role) into incidents.resolved_templates
 *
 * The bootstrap is best-effort: if a particular role has no template seeded
 * (e.g., MEDICAL+GS hasn't been seeded yet), that role is skipped without
 * failing the whole declaration. EC-23 already guarantees the declaring
 * role always resolves; this routine just opportunistically expands.
 *
 * @see mig 014 (incident_zone_states + incident_action_assignments schema)
 * @see mig 015 + 017 (template seed)
 * @see SafeCommand_Phase521_Clarifications_Resolved.md §4.3 (status-aware schema)
 */

import type { SupabaseClient } from '@safecommand/db';
import {
  resolveTemplate,
  EC23ViolationError,
  type ResolvedTemplate,
} from './templateResolver.js';

export interface BootstrapContext {
  client: SupabaseClient;
  incidentId: string;
  venueId: string;
  venueType: string;
  incidentType: string;
  incidentSubtype: string | null;
  declaringStaffId: string;
  declaringRole: string;
  affectedZoneIds: string[];
  declaredAt: string;
}

export interface BootstrapResult {
  resolved_templates: Record<string, unknown>;
  zone_states_created: number;
  assignments_created: number;
  errors: string[];
}

/** Roles that SIRE expands to during incident bootstrap. */
const SIRE_FAN_OUT_ROLES = ['SH', 'DSH', 'SHIFT_COMMANDER', 'FLOOR_SUPERVISOR', 'GROUND_STAFF'];

/**
 * Best-effort SIRE bootstrap. Logs errors to result.errors[] but never
 * throws — incident has already been inserted (HTTP 201 sent).
 */
export async function bootstrapSireIncident(ctx: BootstrapContext): Promise<BootstrapResult> {
  const result: BootstrapResult = {
    resolved_templates: {},
    zone_states_created: 0,
    assignments_created: 0,
    errors: [],
  };

  // ─── 1. Fetch active staff at venue, partitioned by role ───
  const { data: allStaff, error: staffErr } = await ctx.client
    .from('staff')
    .select('id, role, name')
    .eq('venue_id', ctx.venueId)
    .eq('is_active', true)
    .in('role', SIRE_FAN_OUT_ROLES);

  if (staffErr) {
    result.errors.push(`staff fetch failed: ${staffErr.message}`);
    return result;
  }

  const staffByRole: Record<string, Array<{ id: string; role: string; name: string }>> = {};
  for (const s of allStaff ?? []) {
    if (!staffByRole[s.role]) staffByRole[s.role] = [];
    staffByRole[s.role]!.push(s);
  }

  // ─── 2. Resolve templates per role (skip roles with no template) ───
  const templates: Record<string, ResolvedTemplate> = {};
  for (const role of SIRE_FAN_OUT_ROLES) {
    try {
      const t = await resolveTemplate(ctx.client, {
        venue_id: ctx.venueId,
        venue_type: ctx.venueType,
        incident_type: ctx.incidentType,
        incident_subtype: ctx.incidentSubtype,
        staff_role: role,
      });
      templates[role] = t;
      result.resolved_templates[role] = {
        template_id: t.id,
        template_version: t.template_version,
        tier: t.tier,
        actions: t.actions,
        resolved_at: ctx.declaredAt,
      };
    } catch (err) {
      if (err instanceof EC23ViolationError) {
        // No template seeded for this role × incident_type — skip silently.
        // Non-declaring roles are best-effort; the architect's "always
        // resolve to SOMETHING" guarantee is per-role-on-demand, not
        // per-role-pre-emptive.
        continue;
      }
      result.errors.push(`template resolve for role ${role} failed: ${(err as Error).message}`);
    }
  }

  // ─── 3. Pick assignees per (zone, role) tuple ───
  // Round-robin selection deterministically based on zone index — this
  // makes the demo reproducible and fair across multiple staff.
  const assignmentRows: Array<Record<string, unknown>> = [];

  // Per-zone: assign 1 GS (gets zone-scoped state row + actions) + 1 FS
  const zoneStateRows: Array<Record<string, unknown>> = [];
  const activeGS = staffByRole['GROUND_STAFF'] ?? [];
  const activeFS = staffByRole['FLOOR_SUPERVISOR'] ?? [];

  for (let i = 0; i < ctx.affectedZoneIds.length; i++) {
    const zoneId = ctx.affectedZoneIds[i]!;

    // Pick GS round-robin
    const gs = activeGS.length > 0 ? activeGS[i % activeGS.length] : null;
    const fs = activeFS.length > 0 ? activeFS[i % activeFS.length] : null;

    // Zone state row — captures assigned_gs_id for the per-zone responsibility
    zoneStateRows.push({
      venue_id: ctx.venueId,
      incident_id: ctx.incidentId,
      zone_id: zoneId,
      state: 'UNVALIDATED',
      assigned_gs_id: gs?.id ?? null,
      state_changed_at: ctx.declaredAt,
    });

    // GS assignments for this zone (zone-scoped actions)
    if (gs && templates['GROUND_STAFF']) {
      for (const action of templates['GROUND_STAFF'].actions) {
        assignmentRows.push({
          venue_id: ctx.venueId,
          incident_id: ctx.incidentId,
          staff_id: gs.id,
          role: 'GROUND_STAFF',
          action_order: action.order,
          instruction: action.instruction,
          instruction_i18n_key: action.instruction_i18n_key,
          evidence_type: action.evidence_type,
          time_target_seconds: action.time_target_seconds,
          is_mandatory: action.is_mandatory,
          is_life_critical: action.is_life_critical,
          status: 'ASSIGNED',
        });
      }
    }

    // FS assignments for this zone (floor-scoped actions; one FS may cover
    // multiple zones — that's deduped by UNIQUE (incident_id, staff_id, action_order)
    // at DB layer if same FS picked for adjacent zones).
    if (fs && templates['FLOOR_SUPERVISOR']) {
      for (const action of templates['FLOOR_SUPERVISOR'].actions) {
        assignmentRows.push({
          venue_id: ctx.venueId,
          incident_id: ctx.incidentId,
          staff_id: fs.id,
          role: 'FLOOR_SUPERVISOR',
          action_order: action.order,
          instruction: action.instruction,
          instruction_i18n_key: action.instruction_i18n_key,
          evidence_type: action.evidence_type,
          time_target_seconds: action.time_target_seconds,
          is_mandatory: action.is_mandatory,
          is_life_critical: action.is_life_critical,
          status: 'ASSIGNED',
        });
      }
    }
  }

  // Venue-wide assignments: SH (declaring or first active), DSH, SC
  const declaringIsSH = ctx.declaringRole === 'SH';
  const declaringIsDSH = ctx.declaringRole === 'DSH';
  const activeSH = staffByRole['SH'] ?? [];
  const activeDSH = staffByRole['DSH'] ?? [];
  const activeSC = staffByRole['SHIFT_COMMANDER'] ?? [];

  // SH role: assign declaring staff if SH, else pick first active SH
  const shAssignee = declaringIsSH
    ? { id: ctx.declaringStaffId, role: 'SH', name: '' }
    : (activeSH[0] ?? null);
  if (shAssignee && templates['SH']) {
    for (const action of templates['SH'].actions) {
      assignmentRows.push({
        venue_id: ctx.venueId,
        incident_id: ctx.incidentId,
        staff_id: shAssignee.id,
        role: 'SH',
        action_order: action.order,
        instruction: action.instruction,
        instruction_i18n_key: action.instruction_i18n_key,
        evidence_type: action.evidence_type,
        time_target_seconds: action.time_target_seconds,
        is_mandatory: action.is_mandatory,
        is_life_critical: action.is_life_critical,
        status: 'ASSIGNED',
      });
    }
  }

  // DSH role: pick declaring if DSH, else first active DSH
  const dshAssignee = declaringIsDSH
    ? { id: ctx.declaringStaffId, role: 'DSH', name: '' }
    : (activeDSH[0] ?? null);
  if (dshAssignee && templates['DSH']) {
    for (const action of templates['DSH'].actions) {
      assignmentRows.push({
        venue_id: ctx.venueId,
        incident_id: ctx.incidentId,
        staff_id: dshAssignee.id,
        role: 'DSH',
        action_order: action.order,
        instruction: action.instruction,
        instruction_i18n_key: action.instruction_i18n_key,
        evidence_type: action.evidence_type,
        time_target_seconds: action.time_target_seconds,
        is_mandatory: action.is_mandatory,
        is_life_critical: action.is_life_critical,
        status: 'ASSIGNED',
      });
    }
  }

  // SC role: pick first active SHIFT_COMMANDER
  const scAssignee = activeSC[0] ?? null;
  if (scAssignee && templates['SHIFT_COMMANDER']) {
    for (const action of templates['SHIFT_COMMANDER'].actions) {
      assignmentRows.push({
        venue_id: ctx.venueId,
        incident_id: ctx.incidentId,
        staff_id: scAssignee.id,
        role: 'SHIFT_COMMANDER',
        action_order: action.order,
        instruction: action.instruction,
        instruction_i18n_key: action.instruction_i18n_key,
        evidence_type: action.evidence_type,
        time_target_seconds: action.time_target_seconds,
        is_mandatory: action.is_mandatory,
        is_life_critical: action.is_life_critical,
        status: 'ASSIGNED',
      });
    }
  }

  // ─── 4. Bulk insert zone states + zone state log ───
  if (zoneStateRows.length > 0) {
    const { error: zsErr, data: zsData } = await ctx.client
      .from('incident_zone_states')
      .insert(zoneStateRows)
      .select('id');
    if (zsErr) {
      result.errors.push(`zone_states insert failed: ${zsErr.message}`);
    } else {
      result.zone_states_created = zsData?.length ?? 0;
    }

    // Append-only audit log — initial state for each zone
    const logRows = zoneStateRows.map((zs) => ({
      venue_id: ctx.venueId,
      incident_id: ctx.incidentId,
      zone_id: zs['zone_id'],
      previous_state: null,
      new_state: 'UNVALIDATED',
      changed_by: ctx.declaringStaffId,
      changed_by_role: ctx.declaringRole,
      reason_note: 'Incident declared (SIRE bootstrap)',
      changed_at: ctx.declaredAt,
    }));
    const { error: logErr } = await ctx.client.from('incident_zone_state_log').insert(logRows);
    if (logErr) {
      result.errors.push(`zone_state_log insert failed: ${logErr.message}`);
    }
  }

  // ─── 5. Bulk insert assignments (deduplicate via UNIQUE constraint) ───
  if (assignmentRows.length > 0) {
    const { error: aErr, data: aData } = await ctx.client
      .from('incident_action_assignments')
      .insert(assignmentRows)
      .select('id');
    if (aErr) {
      result.errors.push(`assignments insert failed: ${aErr.message}`);
    } else {
      result.assignments_created = aData?.length ?? 0;
    }
  }

  return result;
}
