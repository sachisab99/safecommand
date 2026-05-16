/**
 * /v1/sire/* routes — Phase 5.21 SIRE read endpoints.
 *
 * Day 2 surface for the demo end-to-end build:
 *   GET  /v1/sire/templates/resolve   resolve EC-23 chain for a (sub-type, role) tuple
 *   GET  /v1/sire/state/:incidentId   zone state grid + per-staff assignments
 *
 * Both endpoints are READ-ONLY. Mutations (PATCH zone state, PATCH action
 * assignments, POST evacuation triggers) ship Day 2.5+.
 *
 * Refs:
 *   - apps/api/src/services/sire/templateResolver.ts (EC-23 chain logic)
 *   - mig 014 lines 119-141 (incident_zone_states schema)
 *   - mig 014 lines 271-325 (incident_action_templates schema)
 *   - mig 014 lines 327-394 (incident_action_assignments schema)
 *   - docs/api/conventions.md §3 (error envelope), §4 (auth), §5 (tenant isolation)
 */

import { Router, Request, Response } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { setTenantContext } from '../middleware/tenant.js';
import { auditLog } from '../middleware/audit.js';
import { getServiceClient } from '@safecommand/db';
import {
  isValidZoneTransition,
  getValidTransitions,
  requiresReasonNote,
  requiresEvidence,
  draftPaAnnouncement,
  type IncidentZoneState,
  INCIDENT_ZONE_STATES,
} from '@safecommand/types';
import { logger } from '../services/logger.js';
import {
  resolveTemplate,
  EC23ViolationError,
  type TemplateResolveContext,
} from '../services/sire/templateResolver.js';

export const sireRouter = Router();
sireRouter.use(requireAuth, setTenantContext);

// ──────────────────────────────────────────────────────────────────────────
// Validation: 32 sub-types + 6 incident types + 8 staff roles
// (Mirrored from mig 014 CHECK constraint + Plan v8 §7.)

const VALID_INCIDENT_TYPES = ['FIRE', 'MEDICAL', 'SECURITY', 'EVACUATION', 'STRUCTURAL', 'OTHER'];
const VALID_INCIDENT_SUBTYPES = [
  'FIRE_CONTAINED', 'FIRE_SPREADING', 'FIRE_SUSPECTED', 'FIRE_DRILL',
  'MEDICAL_CARDIAC', 'MEDICAL_TRAUMA', 'MEDICAL_MASS_CASUALTY',
  'MEDICAL_MENTAL_HEALTH', 'MEDICAL_OBSTETRIC',
  'SECURITY_ACTIVE_AGGRESSOR', 'SECURITY_BOMB_THREAT', 'SECURITY_SUSPICIOUS_ITEM',
  'SECURITY_ABDUCTION', 'SECURITY_TRESPASS', 'SECURITY_CIVIL_UNREST',
  'SECURITY_CYBER_PHYSICAL',
  'EVACUATION_FULL', 'EVACUATION_PARTIAL_ZONE', 'EVACUATION_PARTIAL_FLOOR',
  'EVACUATION_SHELTER_IN_PLACE', 'EVACUATION_DRILL',
  'STRUCTURAL_GAS_LEAK', 'STRUCTURAL_FLOOD_WATER', 'STRUCTURAL_BUILDING_DAMAGE',
  'STRUCTURAL_POWER_FAILURE', 'STRUCTURAL_LIFT_ENTRAPMENT',
  'STRUCTURAL_HAZMAT', 'STRUCTURAL_SEVERE_WEATHER',
  'OTHER_VIP_EVENT', 'OTHER_MEDIA_INCIDENT',
  'OTHER_UTILITY_SERVICE', 'OTHER_UNKNOWN',
];
const VALID_STAFF_ROLES = [
  'SH', 'DSH', 'SHIFT_COMMANDER', 'GM', 'AUDITOR',
  'FM', 'FLOOR_SUPERVISOR', 'GROUND_STAFF',
];

// ──────────────────────────────────────────────────────────────────────────
// GET /v1/sire/templates/resolve
//
// Resolves the EC-23 chain for a (incident_type, sub-type, role) tuple at
// the caller's venue. Used by:
//   - mobile UI to preview action templates before incident declaration
//   - dashboard incident-detail page to fetch the per-role action list
//   - SC Ops Console to confirm what a venue would see for a given incident
//
// Query params (all required except incident_subtype):
//   incident_type   — FIRE | MEDICAL | SECURITY | EVACUATION | STRUCTURAL | OTHER
//   incident_subtype — one of 32 enum values, or omitted for parent-only chain
//   staff_role      — full StaffRole enum value
//
// Response: ResolvedTemplate (see templateResolver.ts).

sireRouter.get('/templates/resolve', async (req: Request, res: Response): Promise<void> => {
  const { incident_type, incident_subtype, staff_role } = req.query as {
    incident_type?: string;
    incident_subtype?: string;
    staff_role?: string;
  };

  // Hand-validation (Zod-equivalent — single-route, keep dependencies tight)
  if (!incident_type || !VALID_INCIDENT_TYPES.includes(incident_type)) {
    res.status(400).json({
      error: { code: 'INVALID_INCIDENT_TYPE', message: 'incident_type must be one of: ' + VALID_INCIDENT_TYPES.join(', ') },
    });
    return;
  }
  if (incident_subtype && !VALID_INCIDENT_SUBTYPES.includes(incident_subtype)) {
    res.status(400).json({
      error: { code: 'INVALID_INCIDENT_SUBTYPE', message: 'incident_subtype must be one of the 32 valid sub-types' },
    });
    return;
  }
  if (!staff_role || !VALID_STAFF_ROLES.includes(staff_role)) {
    res.status(400).json({
      error: { code: 'INVALID_STAFF_ROLE', message: 'staff_role must be a valid StaffRole' },
    });
    return;
  }

  // Look up venue_type from the caller's venue (for tier 3/4 chain matching)
  const { data: venue, error: venueErr } = await getServiceClient()
    .from('venues')
    .select('type')
    .eq('id', req.auth.venue_id)
    .single();

  if (venueErr || !venue) {
    res.status(500).json({
      error: { code: 'VENUE_LOOKUP_FAILED', message: 'Could not determine caller venue type' },
    });
    return;
  }

  const ctx: TemplateResolveContext = {
    venue_id: req.auth.venue_id,
    venue_type: venue.type,
    incident_type,
    incident_subtype: incident_subtype ?? null,
    staff_role,
  };

  try {
    const resolved = await resolveTemplate(getServiceClient(), ctx);
    res.json(resolved);
  } catch (err) {
    if (err instanceof EC23ViolationError) {
      // Should never happen in production given mig 015 floor seed.
      res.status(500).json({
        error: {
          code: 'EC23_VIOLATION',
          message: `No template found for ${ctx.incident_type}+${ctx.staff_role}. Contact SC Ops to seed.`,
        },
      });
      return;
    }
    res.status(500).json({
      error: { code: 'RESOLVE_FAILED', message: 'Template resolution error' },
    });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// GET /v1/sire/state/:incidentId
//
// Returns the live SIRE state for an incident:
//   - zone_states: Array<{ zone_id, zone_name, state, assigned_gs_id,
//                          reason_note, evidence_url, state_changed_at }>
//   - assignments: Array<{ staff_id, staff_name, role, action_order,
//                          instruction, status, started_at, completed_at }>
//   - evacuation_triggers: Array<{ trigger_type, zones_affected,
//                                  triggered_by_role, reason_note,
//                                  triggered_at }>
//
// Used by:
//   - dashboard /incidents/[id] SIRE extension (zone state grid + per-staff
//     completion view) — polled every 3s
//   - mobile IncidentDetailScreen v2 — polled every 3s
//
// 404 if incident not found in caller's venue. 200 + empty arrays for
// non-SIRE incidents (has_sire_data=false) — caller falls back to v1 layout.

sireRouter.get('/state/:incidentId', async (req: Request, res: Response): Promise<void> => {
  const incidentId = req.params['incidentId'];
  const venueId = req.auth.venue_id;

  // 1. Fetch the incident — confirm it exists in caller's venue
  const { data: incident, error: iErr } = await getServiceClient()
    .from('incidents')
    .select('id, venue_id, has_sire_data, incident_type, incident_subtype, status, declared_at')
    .eq('id', incidentId!)
    .eq('venue_id', venueId)
    .single();

  if (iErr || !incident) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Incident not found' } });
    return;
  }

  // ── Shared incident photo wall (mig 018) — present on EVERY incident,
  // SIRE or legacy, per founder Rec 2b. Fetched before the has_sire_data
  // branch so the legacy fallback still carries the wall. Newest first.
  const { data: evidenceWall } = await getServiceClient()
    .from('incident_evidence')
    .select(
      'id, incident_id, posted_by, posted_by_role, evidence_url, content_type, ' +
        'caption, gps_latitude, gps_longitude, created_at, staff:posted_by(name)',
    )
    .eq('incident_id', incidentId!)
    .eq('venue_id', venueId)
    .order('created_at', { ascending: false });

  // Non-SIRE incidents return 200 + empty SIRE payload (caller falls back)
  // but still carry the photo wall (generic incident feature, not SIRE-only).
  if (!incident.has_sire_data) {
    res.json({
      incident_id: incident.id,
      has_sire_data: false,
      zone_states: [],
      assignments: [],
      evacuation_triggers: [],
      evidence_wall: evidenceWall ?? [],
      active_prompts: [],
    });
    return;
  }

  // 2. Fetch zone states + zones name (joined via zones table)
  const { data: zoneStates, error: zErr } = await getServiceClient()
    .from('incident_zone_states')
    .select(
      'id, zone_id, state, assigned_gs_id, reason_note, evidence_url, last_updated_by, last_updated_by_role, state_changed_at, zones(name, floor_id)',
    )
    .eq('incident_id', incidentId!)
    .eq('venue_id', venueId)
    .order('state_changed_at', { ascending: false });

  if (zErr) {
    res.status(500).json({
      error: { code: 'ZONE_STATE_QUERY_FAILED', message: 'Could not fetch zone states' },
    });
    return;
  }

  // 3. Fetch action assignments (the per-staff per-action rows)
  const { data: assignments, error: aErr } = await getServiceClient()
    .from('incident_action_assignments')
    .select(
      'id, staff_id, role, action_order, instruction, instruction_i18n_key, ' +
        'evidence_type, time_target_seconds, is_mandatory, is_life_critical, ' +
        'status, started_at, completed_at, blocked_reason, ' +
        'staff(name)',
    )
    .eq('incident_id', incidentId!)
    .eq('venue_id', venueId)
    .order('staff_id', { ascending: true })
    .order('action_order', { ascending: true });

  if (aErr) {
    res.status(500).json({
      error: { code: 'ASSIGNMENT_QUERY_FAILED', message: 'Could not fetch action assignments' },
    });
    return;
  }

  // 4. Fetch evacuation triggers (immutable per-decision audit rows)
  const { data: triggers, error: tErr } = await getServiceClient()
    .from('incident_evacuation_triggers')
    .select(
      'id, trigger_type, triggered_by, triggered_by_role, zones_affected, ' +
        'building_id, reason_note, pa_text_generated, pa_text_broadcast, ' +
        'pa_language, notification_count, triggered_at',
    )
    .eq('incident_id', incidentId!)
    .eq('venue_id', venueId)
    .order('triggered_at', { ascending: false });

  if (tErr) {
    res.status(500).json({
      error: { code: 'TRIGGER_QUERY_FAILED', message: 'Could not fetch evacuation triggers' },
    });
    return;
  }

  // 5. Active BR-L soft prompts (un-dismissed AUTO_EVAC_SUGGESTION etc.)
  //    Hard Rule 23: these are SUGGESTIONS only — is_auto_trigger is FALSE
  //    by DB CHECK; no code path here triggers an evacuation.
  //    Command-only: mirrors incident_dashboard_prompts.command_only_read
  //    RESTRICTIVE RLS (service_role bypasses RLS, so gate explicitly here).
  const isCommandViewer =
    req.auth.role === 'SH' || req.auth.role === 'DSH' || req.auth.role === 'SHIFT_COMMANDER';
  let prompts: unknown[] = [];
  if (isCommandViewer) {
    const { data: promptRows } = await getServiceClient()
      .from('incident_dashboard_prompts')
      .select(
        'id, prompt_type, message, trigger_metadata, created_at, dismissed_at, dismissed_by',
      )
      .eq('incident_id', incidentId!)
      .eq('venue_id', venueId)
      .is('dismissed_at', null)
      .order('created_at', { ascending: false });
    prompts = promptRows ?? [];
  }

  res.json({
    incident_id: incident.id,
    has_sire_data: true,
    incident_type: incident.incident_type,
    incident_subtype: incident.incident_subtype,
    status: incident.status,
    declared_at: incident.declared_at,
    zone_states: zoneStates ?? [],
    assignments: assignments ?? [],
    evacuation_triggers: triggers ?? [],
    evidence_wall: evidenceWall ?? [],
    active_prompts: prompts ?? [],
  });
});

// ──────────────────────────────────────────────────────────────────────────
// PATCH /v1/sire/incidents/:incidentId/zones/:zoneId/state
//
// Drive the zone state machine. Validates the proposed transition against
// the shared VALID_TRANSITIONS matrix (the single source of truth for
// role-authority). Enforces the architect's safety rules:
//   - GS cannot exit EVACUATION_TRIGGERED (false-green prevention; §3 R1)
//   - SH_CONFIRMED_CLEAR is terminal
//   - LOCKED_DOWN release: SH/DSH only
//   - reason_note mandatory for NEEDS_ATTENTION/INACCESSIBLE/LOCKED_DOWN
//   - evidence_url mandatory for EVACUATION_COMPLETE
//
// Optimistic lock: caller passes the current state_changed_at as a
// precondition. If another caller updated in between, returns 409
// STATE_CHANGED with the latest row so the client can merge + retry.
//
// Body: {
//   to_state: IncidentZoneState,
//   prev_state_changed_at: ISO timestamp (current row's state_changed_at),
//   reason_note?: string,
//   evidence_url?: string
// }
//
// Authorisation:
//   - Caller's staff_id matches incident_zone_states.assigned_gs_id, OR
//   - Caller's role ∈ {SH, DSH, SHIFT_COMMANDER, FM}
//   Anything else → 403.

sireRouter.patch(
  '/incidents/:incidentId/zones/:zoneId/state',
  auditLog('SIRE_ZONE_STATE_CHANGE'),
  async (req: Request, res: Response): Promise<void> => {
    const { incidentId, zoneId } = req.params as { incidentId: string; zoneId: string };
    const venueId = req.auth.venue_id;
    const staffId = req.auth.staff_id;
    const role = req.auth.role;

    const { to_state, prev_state_changed_at, reason_note, evidence_url } = (req.body ?? {}) as {
      to_state?: string;
      prev_state_changed_at?: string;
      reason_note?: string;
      evidence_url?: string;
    };

    // ─── Validate to_state is a real zone state ───
    if (!to_state || !(INCIDENT_ZONE_STATES as readonly string[]).includes(to_state)) {
      res.status(400).json({
        error: { code: 'INVALID_TO_STATE', message: 'to_state must be one of: ' + INCIDENT_ZONE_STATES.join(', ') },
      });
      return;
    }
    const targetState = to_state as IncidentZoneState;

    // ─── Read current row + verify caller can update ───
    const { data: currentRow, error: readErr } = await getServiceClient()
      .from('incident_zone_states')
      .select('id, state, assigned_gs_id, state_changed_at')
      .eq('incident_id', incidentId)
      .eq('zone_id', zoneId)
      .eq('venue_id', venueId)
      .single();

    if (readErr || !currentRow) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Incident zone state not found' },
      });
      return;
    }

    // ─── Authorisation check ───
    const isCommandRole = role === 'SH' || role === 'DSH' || role === 'SHIFT_COMMANDER' || role === 'FM';
    const isAssignedGs = currentRow.assigned_gs_id === staffId;
    if (!isCommandRole && !isAssignedGs) {
      res.status(403).json({
        error: {
          code: 'NOT_AUTHORISED',
          message: 'Only the assigned ground staff or command roles (SH/DSH/SC/FM) can update this zone state',
        },
      });
      return;
    }

    const fromState = currentRow.state as IncidentZoneState;

    // ─── Same-state idempotent no-op ───
    if (fromState === targetState) {
      res.json({ status: 'NO_OP', current: currentRow });
      return;
    }

    // ─── Transition matrix validation ───
    if (!isValidZoneTransition(fromState, targetState, role)) {
      const valid = getValidTransitions(fromState, role);
      res.status(422).json({
        error: {
          code: 'INVALID_TRANSITION',
          message: `Role ${role} cannot transition zone from ${fromState} to ${targetState}.`,
          valid_transitions: valid,
        },
      });
      return;
    }

    // ─── Required-field gates per state semantic ───
    if (requiresReasonNote(targetState) && (!reason_note || reason_note.trim().length === 0)) {
      res.status(400).json({
        error: {
          code: 'REASON_NOTE_REQUIRED',
          message: `${targetState} requires a non-empty reason_note`,
        },
      });
      return;
    }
    if (requiresEvidence(targetState) && (!evidence_url || evidence_url.trim().length === 0)) {
      res.status(400).json({
        error: {
          code: 'EVIDENCE_REQUIRED',
          message: `${targetState} requires evidence_url (photo of cleared zone)`,
        },
      });
      return;
    }

    // ─── Optimistic lock check ───
    if (
      prev_state_changed_at &&
      new Date(prev_state_changed_at).getTime() !== new Date(currentRow.state_changed_at).getTime()
    ) {
      res.status(409).json({
        error: {
          code: 'STATE_CHANGED',
          message: 'Zone state was updated by another caller; reload and retry',
        },
        current: currentRow,
      });
      return;
    }

    // ─── Apply the transition ───
    const now = new Date().toISOString();
    const { data: updated, error: upErr } = await getServiceClient()
      .from('incident_zone_states')
      .update({
        state: targetState,
        reason_note: reason_note ?? null,
        evidence_url: evidence_url ?? null,
        last_updated_by: staffId,
        last_updated_by_role: role,
        state_changed_at: now,
      })
      .eq('id', currentRow.id)
      .eq('venue_id', venueId)
      // Defence-in-depth: re-check the prev state_changed_at to catch races
      // between the read above and the write here.
      .eq('state_changed_at', currentRow.state_changed_at)
      .select()
      .single();

    if (upErr || !updated) {
      // Race lost or DB error — return 409 (assume race) and let client retry
      res.status(409).json({
        error: {
          code: 'STATE_CHANGED',
          message: 'Zone state was updated by another caller; reload and retry',
        },
      });
      return;
    }

    // ─── Append-only audit log row ───
    const { error: logErr } = await getServiceClient()
      .from('incident_zone_state_log')
      .insert({
        venue_id: venueId,
        incident_id: incidentId,
        zone_id: zoneId,
        previous_state: fromState,
        new_state: targetState,
        changed_by: staffId,
        changed_by_role: role,
        reason_note: reason_note ?? null,
        evidence_url: evidence_url ?? null,
        changed_at: now,
      });
    if (logErr) {
      // Audit-log write failure is non-fatal (zone state already updated)
      // but should be logged for ops investigation.
      logger.error({ logErr, incidentId, zoneId }, 'Failed to write zone_state_log row');
    }

    // ─── BR-L auto-evacuation SUGGESTION detector (Hard Rule 23) ───
    //
    // CRITICAL: this NEVER triggers an evacuation. It only inserts a soft
    // prompt row for the SH dashboard. is_auto_trigger is FALSE by DB CHECK;
    // there is deliberately NO call to the evacuation path here. Wrapped so
    // any failure is swallowed — it must never affect the zone-state result.
    //
    // Fires when: a zone enters NEEDS_ATTENTION during an active FIRE and
    // ≥2 zones are in NEEDS_ATTENTION within a 3-minute window, and no
    // un-dismissed AUTO_EVAC_SUGGESTION already exists for this incident.
    if (targetState === 'NEEDS_ATTENTION') {
      try {
        const { data: inc } = await getServiceClient()
          .from('incidents')
          .select('incident_type')
          .eq('id', incidentId)
          .eq('venue_id', venueId)
          .single();

        if (inc?.incident_type === 'FIRE') {
          const WINDOW_MIN = 3;
          const THRESHOLD = 2;
          const since = new Date(Date.now() - WINDOW_MIN * 60_000).toISOString();

          const { data: hotZones } = await getServiceClient()
            .from('incident_zone_states')
            .select('zone_id')
            .eq('incident_id', incidentId)
            .eq('venue_id', venueId)
            .eq('state', 'NEEDS_ATTENTION')
            .gte('state_changed_at', since);

          const zoneIds = (hotZones ?? []).map((z) => z.zone_id);

          if (zoneIds.length >= THRESHOLD) {
            // Only one active suggestion per incident — don't spam the SH.
            const { data: existing } = await getServiceClient()
              .from('incident_dashboard_prompts')
              .select('id')
              .eq('incident_id', incidentId)
              .eq('venue_id', venueId)
              .eq('prompt_type', 'AUTO_EVAC_SUGGESTION')
              .is('dismissed_at', null)
              .limit(1);

            if (!existing || existing.length === 0) {
              const { error: promptErr } = await getServiceClient()
                .from('incident_dashboard_prompts')
                .insert({
                  venue_id: venueId,
                  incident_id: incidentId,
                  prompt_type: 'AUTO_EVAC_SUGGESTION',
                  message:
                    `${zoneIds.length} zones reported NEEDS ATTENTION within ${WINDOW_MIN} ` +
                    `minutes during an active FIRE. Consider a selective or full evacuation. ` +
                    `This is a suggestion only — you must explicitly trigger any evacuation.`,
                  // is_auto_trigger intentionally omitted → DB default FALSE
                  // (CHECK constraint also enforces FALSE — Hard Rule 23).
                  trigger_metadata: {
                    zones_in_attention: zoneIds,
                    window_minutes: WINDOW_MIN,
                    threshold_zones: THRESHOLD,
                  },
                });
              if (promptErr) {
                logger.error({ promptErr, incidentId }, 'BR-L: failed to insert suggestion prompt');
              } else {
                logger.info(
                  { incidentId, zoneCount: zoneIds.length },
                  'BR-L: auto-evac SUGGESTION raised (no auto-trigger — Hard Rule 23)',
                );
              }
            }
          }
        }
      } catch (brlErr) {
        // Absolutely non-fatal: the zone state change already succeeded.
        logger.error({ brlErr, incidentId, zoneId }, 'BR-L detector errored (non-fatal)');
      }
    }

    res.json(updated);
  },
);

// ──────────────────────────────────────────────────────────────────────────
// PATCH /v1/sire/action-assignments/:id
//
// Drive the per-staff action status machine: ASSIGNED → IN_PROGRESS →
// DONE / SKIPPED / BLOCKED.
//
// Sets started_at on first IN_PROGRESS and completed_at on terminal states.
// On DONE: writes a row to incident_response_actions (the evidence ledger).
// blocked_reason mandatory when status=BLOCKED.
//
// Authorisation: only the assigned staff_id can update. (Command roles
// override on someone-else's-behalf is Day 4+ if needed.)
//
// Body: {
//   status: 'IN_PROGRESS' | 'DONE' | 'SKIPPED' | 'BLOCKED',
//   blocked_reason?: string,
//   evidence?: {
//     evidence_url?: string,
//     evidence_note?: string,
//     signature_data?: string,
//     gps_latitude?: number,
//     gps_longitude?: number,
//   }
// }

const VALID_ASSIGNMENT_STATUSES = ['ASSIGNED', 'IN_PROGRESS', 'DONE', 'SKIPPED', 'BLOCKED'] as const;
type AssignmentStatus = (typeof VALID_ASSIGNMENT_STATUSES)[number];

const VALID_ASSIGNMENT_TRANSITIONS: Record<AssignmentStatus, AssignmentStatus[]> = {
  ASSIGNED: ['IN_PROGRESS', 'DONE', 'SKIPPED', 'BLOCKED'],
  IN_PROGRESS: ['DONE', 'SKIPPED', 'BLOCKED'],
  DONE: [],
  SKIPPED: [],
  BLOCKED: ['IN_PROGRESS'], // Unblock back to in-progress allowed
};

sireRouter.patch(
  '/action-assignments/:id',
  auditLog('SIRE_ACTION_STATUS_CHANGE'),
  async (req: Request, res: Response): Promise<void> => {
    const assignmentId = req.params['id']!;
    const venueId = req.auth.venue_id;
    const staffId = req.auth.staff_id;

    const { status, blocked_reason, evidence } = (req.body ?? {}) as {
      status?: string;
      blocked_reason?: string;
      evidence?: {
        evidence_url?: string;
        evidence_note?: string;
        signature_data?: string;
        gps_latitude?: number;
        gps_longitude?: number;
      };
    };

    if (!status || !(VALID_ASSIGNMENT_STATUSES as readonly string[]).includes(status)) {
      res.status(400).json({
        error: { code: 'INVALID_STATUS', message: 'status must be one of: ' + VALID_ASSIGNMENT_STATUSES.join(', ') },
      });
      return;
    }
    const targetStatus = status as AssignmentStatus;

    // Read current assignment + check ownership
    const { data: row, error: readErr } = await getServiceClient()
      .from('incident_action_assignments')
      .select('*')
      .eq('id', assignmentId)
      .eq('venue_id', venueId)
      .single();

    if (readErr || !row) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Assignment not found' } });
      return;
    }

    if (row.staff_id !== staffId) {
      res.status(403).json({
        error: { code: 'NOT_OWNER', message: 'Only the assigned staff can update this action' },
      });
      return;
    }

    const fromStatus = row.status as AssignmentStatus;

    // Same-status no-op
    if (fromStatus === targetStatus) {
      res.json({ status: 'NO_OP', assignment: row });
      return;
    }

    // Validate transition
    const allowed = VALID_ASSIGNMENT_TRANSITIONS[fromStatus] ?? [];
    if (!allowed.includes(targetStatus)) {
      res.status(422).json({
        error: {
          code: 'INVALID_STATUS_TRANSITION',
          message: `Cannot transition assignment from ${fromStatus} to ${targetStatus}`,
          valid_transitions: allowed,
        },
      });
      return;
    }

    if (targetStatus === 'BLOCKED' && (!blocked_reason || blocked_reason.trim().length === 0)) {
      res.status(400).json({
        error: { code: 'BLOCKED_REASON_REQUIRED', message: 'BLOCKED status requires blocked_reason' },
      });
      return;
    }

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { status: targetStatus };
    if (targetStatus === 'IN_PROGRESS' && !row.started_at) {
      updates['started_at'] = now;
    }
    if (targetStatus === 'DONE' || targetStatus === 'SKIPPED' || targetStatus === 'BLOCKED') {
      updates['completed_at'] = now;
    }
    if (targetStatus === 'BLOCKED') {
      updates['blocked_reason'] = blocked_reason;
    }

    const { data: updated, error: upErr } = await getServiceClient()
      .from('incident_action_assignments')
      .update(updates)
      .eq('id', assignmentId)
      .eq('venue_id', venueId)
      .select()
      .single();

    if (upErr || !updated) {
      res.status(500).json({
        error: { code: 'UPDATE_FAILED', message: 'Could not update assignment status' },
      });
      return;
    }

    // On DONE: write evidence record (incident_response_actions)
    if (targetStatus === 'DONE') {
      const { error: evErr } = await getServiceClient()
        .from('incident_response_actions')
        .insert({
          venue_id: venueId,
          incident_id: row.incident_id,
          assignment_id: assignmentId,
          staff_id: staffId,
          role: row.role,
          action_order: row.action_order,
          evidence_type: row.evidence_type,
          evidence_url: evidence?.evidence_url ?? null,
          evidence_note: evidence?.evidence_note ?? null,
          signature_data: evidence?.signature_data ?? null,
          gps_latitude: evidence?.gps_latitude ?? null,
          gps_longitude: evidence?.gps_longitude ?? null,
          photo_upload_pending: false,
          completed_at: now,
        });
      if (evErr) {
        logger.error(
          { evErr, assignmentId },
          'Failed to write incident_response_actions evidence row',
        );
        // Non-fatal: assignment is DONE; evidence row missing is logged for ops.
      }
    }

    res.json(updated);
  },
);

// ──────────────────────────────────────────────────────────────────────────
// POST /v1/sire/incidents/:incidentId/evacuation-triggers
//
// Selective + full venue evacuation. Mandatory reason_note (BR-J/BR-K).
// Inserts an immutable incident_evacuation_triggers row (Hard Rule 4 +
// BR-P). For ZONE_SELECTIVE / FLOOR_SELECTIVE / FULL_VENUE, also UPSERTs
// the affected zones to EVACUATION_TRIGGERED state (caller-bypass since
// command roles override the matrix here — they're the ones who'd be
// declaring the evacuation).
//
// Authorisation: SH / DSH / SHIFT_COMMANDER only.
//
// Body: {
//   trigger_type: 'ZONE_SELECTIVE' | 'FLOOR_SELECTIVE' | 'FULL_VENUE' | 'STAFF_TRIGGERED',
//   zones_affected: UUID[]  // non-empty for SELECTIVE; can be empty for FULL_VENUE
//   building_id?: string,   // optional for FLOOR_SELECTIVE / FULL_VENUE
//   reason_note: string,    // MANDATORY
//   pa_text_broadcast?: string,  // SH may pre-write the PA text
//   pa_language?: string    // ISO locale; defaults to 'en-IN'
// }

const VALID_TRIGGER_TYPES = ['ZONE_SELECTIVE', 'FLOOR_SELECTIVE', 'FULL_VENUE', 'STAFF_TRIGGERED'];

sireRouter.post(
  '/incidents/:incidentId/evacuation-triggers',
  requireRole('SH', 'DSH', 'SHIFT_COMMANDER'),
  auditLog('SIRE_EVACUATION_TRIGGER'),
  async (req: Request, res: Response): Promise<void> => {
    const incidentId = req.params['incidentId']!;
    const venueId = req.auth.venue_id;
    const staffId = req.auth.staff_id;
    const role = req.auth.role;

    const {
      trigger_type,
      zones_affected,
      building_id,
      reason_note,
      pa_text_broadcast,
      pa_language,
    } = (req.body ?? {}) as {
      trigger_type?: string;
      zones_affected?: string[];
      building_id?: string;
      reason_note?: string;
      pa_text_broadcast?: string;
      pa_language?: string;
    };

    if (!trigger_type || !VALID_TRIGGER_TYPES.includes(trigger_type)) {
      res.status(400).json({
        error: { code: 'INVALID_TRIGGER_TYPE', message: 'trigger_type must be one of: ' + VALID_TRIGGER_TYPES.join(', ') },
      });
      return;
    }
    if (!reason_note || reason_note.trim().length === 0) {
      res.status(400).json({
        error: { code: 'REASON_NOTE_REQUIRED', message: 'Evacuation triggers require reason_note' },
      });
      return;
    }
    if (
      (trigger_type === 'ZONE_SELECTIVE' || trigger_type === 'FLOOR_SELECTIVE') &&
      (!zones_affected || zones_affected.length === 0)
    ) {
      res.status(400).json({
        error: {
          code: 'ZONES_REQUIRED',
          message: `${trigger_type} requires non-empty zones_affected array`,
        },
      });
      return;
    }

    // Confirm incident exists in caller's venue
    const { data: incident, error: iErr } = await getServiceClient()
      .from('incidents')
      .select('id, venue_id, has_sire_data')
      .eq('id', incidentId)
      .eq('venue_id', venueId)
      .single();
    if (iErr || !incident) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Incident not found' } });
      return;
    }
    if (!incident.has_sire_data) {
      res.status(422).json({
        error: {
          code: 'NOT_SIRE_INCIDENT',
          message: 'Evacuation triggers can only be raised on SIRE-enabled incidents (has_sire_data=true)',
        },
      });
      return;
    }

    // BR-N: auto-draft the PA announcement (immutable audit baseline). Resolve
    // human zone names for the affected zones so the text is meaningful. The
    // operational reason_note is deliberately NOT injected into the public PA
    // (panic hazard) — it stays in the audit row only.
    let paZoneNames: string[] = [];
    if ((zones_affected ?? []).length > 0) {
      const { data: zoneRows } = await getServiceClient()
        .from('zones')
        .select('name')
        .eq('venue_id', venueId)
        .in('id', zones_affected ?? []);
      paZoneNames = (zoneRows ?? []).map((z) => z.name).filter(Boolean);
    }
    const paDraft = draftPaAnnouncement({
      triggerType: trigger_type as
        | 'ZONE_SELECTIVE'
        | 'FLOOR_SELECTIVE'
        | 'FULL_VENUE'
        | 'STAFF_TRIGGERED',
      zoneNames: paZoneNames,
    }).en;

    // Insert the immutable trigger row (Hard Rule 4 / BR-P)
    const triggeredAt = new Date().toISOString();
    const { data: trigger, error: tErr } = await getServiceClient()
      .from('incident_evacuation_triggers')
      .insert({
        venue_id: venueId,
        incident_id: incidentId,
        trigger_type,
        triggered_by: staffId,
        triggered_by_role: role,
        zones_affected: zones_affected ?? [],
        building_id: building_id ?? null,
        reason_note,
        pa_text_generated: paDraft,
        pa_text_broadcast: pa_text_broadcast ?? null,
        pa_language: pa_language ?? 'en-IN',
        triggered_at: triggeredAt,
      })
      .select()
      .single();

    if (tErr || !trigger) {
      logger.error({ tErr, incidentId }, 'Failed to insert incident_evacuation_triggers row');
      res.status(500).json({
        error: { code: 'TRIGGER_FAILED', message: 'Could not record evacuation trigger' },
      });
      return;
    }

    // For SELECTIVE / FULL_VENUE: UPSERT affected zone states to EVACUATION_TRIGGERED.
    // (For STAFF_TRIGGERED, the GS already updated their own zone via PATCH; no fan-out here.)
    if (
      trigger_type === 'ZONE_SELECTIVE' ||
      trigger_type === 'FLOOR_SELECTIVE' ||
      trigger_type === 'FULL_VENUE'
    ) {
      const zonesToUpdate = zones_affected ?? [];
      if (zonesToUpdate.length > 0) {
        // Bulk update — flip to EVACUATION_TRIGGERED for all listed zones.
        // Optimistic lock not used here: command-role evacuation overrides
        // any concurrent state changes by design.
        const { error: zsErr } = await getServiceClient()
          .from('incident_zone_states')
          .update({
            state: 'EVACUATION_TRIGGERED',
            last_updated_by: staffId,
            last_updated_by_role: role,
            state_changed_at: triggeredAt,
          })
          .eq('venue_id', venueId)
          .eq('incident_id', incidentId)
          .in('zone_id', zonesToUpdate);
        if (zsErr) {
          logger.error({ zsErr, incidentId, zonesToUpdate }, 'Failed to flip zone states to EVACUATION_TRIGGERED');
        }

        // Append zone_state_log rows for each zone that was flipped
        const logRows = zonesToUpdate.map((zid) => ({
          venue_id: venueId,
          incident_id: incidentId,
          zone_id: zid,
          previous_state: null, // We don't read prior; selective override is intentional
          new_state: 'EVACUATION_TRIGGERED',
          changed_by: staffId,
          changed_by_role: role,
          reason_note: `Evacuation: ${reason_note}`,
          changed_at: triggeredAt,
        }));
        await getServiceClient().from('incident_zone_state_log').insert(logRows);
      }
    }

    res.status(201).json(trigger);
  },
);

// ──────────────────────────────────────────────────────────────────────────
// POST /v1/sire/incidents/:incidentId/evidence
//
// Shared incident photo wall (mig 018, Rec 2b). ANY authenticated venue
// staff may post a photo against an incident; it is visible to every venue
// user on that incident via GET /sire/state (evidence_wall[]).
//
// Append-only (Hard Rule 4) — INSERT only, never UPDATE/DELETE. The photo
// itself is uploaded directly to S3 by the client via /v1/upload/presign
// (purpose=incident_evidence); this endpoint records the resulting file
// key + optional caption / GPS.
//
// No requireRole — deliberately open to all venue staff (GS included), the
// same trust posture as the v1 "I AM SAFE" report. Venue isolation is
// enforced by venue_id scoping on insert + read.
//
// Body: { evidence_url: string (required), content_type?, caption?,
//         gps_latitude?, gps_longitude? }

sireRouter.post(
  '/incidents/:incidentId/evidence',
  auditLog('SIRE_INCIDENT_EVIDENCE_POST'),
  async (req: Request, res: Response): Promise<void> => {
    const incidentId = req.params['incidentId']!;
    const venueId = req.auth.venue_id;
    const staffId = req.auth.staff_id;
    const role = req.auth.role;

    const { evidence_url, content_type, caption, gps_latitude, gps_longitude } =
      (req.body ?? {}) as {
        evidence_url?: string;
        content_type?: string;
        caption?: string;
        gps_latitude?: number;
        gps_longitude?: number;
      };

    if (!evidence_url || evidence_url.trim().length === 0) {
      res.status(400).json({
        error: { code: 'EVIDENCE_URL_REQUIRED', message: 'evidence_url is required' },
      });
      return;
    }

    // Confirm incident exists in caller's venue (tenant isolation)
    const { data: incident, error: iErr } = await getServiceClient()
      .from('incidents')
      .select('id, venue_id')
      .eq('id', incidentId)
      .eq('venue_id', venueId)
      .single();
    if (iErr || !incident) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Incident not found' } });
      return;
    }

    const { data: row, error: insErr } = await getServiceClient()
      .from('incident_evidence')
      .insert({
        venue_id: venueId,
        incident_id: incidentId,
        posted_by: staffId,
        posted_by_role: role,
        evidence_url: evidence_url.trim(),
        content_type: content_type ?? null,
        caption: caption?.trim() || null,
        gps_latitude: gps_latitude ?? null,
        gps_longitude: gps_longitude ?? null,
      })
      .select()
      .single();

    if (insErr || !row) {
      logger.error({ insErr, incidentId }, 'Failed to insert incident_evidence row');
      res.status(500).json({
        error: { code: 'EVIDENCE_INSERT_FAILED', message: 'Could not record incident photo' },
      });
      return;
    }

    res.status(201).json(row);
  },
);

// ──────────────────────────────────────────────────────────────────────────
// POST /v1/sire/prompts/:promptId/dismiss
//
// SH/DSH/SHIFT_COMMANDER dismisses a BR-L soft suggestion (e.g. after
// reviewing it and deciding evacuation is NOT warranted, or after acting
// on it). Sets dismissed_at + dismissed_by. The row is immutable otherwise
// (no other mutation path). This does NOT trigger or cancel anything
// operationally — it only clears the prompt from the SH surface.
//
// Body: {} (no body required)

sireRouter.post(
  '/prompts/:promptId/dismiss',
  requireRole('SH', 'DSH', 'SHIFT_COMMANDER'),
  auditLog('SIRE_PROMPT_DISMISS'),
  async (req: Request, res: Response): Promise<void> => {
    const promptId = req.params['promptId']!;
    const venueId = req.auth.venue_id;
    const staffId = req.auth.staff_id;

    const { data: prompt, error: readErr } = await getServiceClient()
      .from('incident_dashboard_prompts')
      .select('id, dismissed_at')
      .eq('id', promptId)
      .eq('venue_id', venueId)
      .single();

    if (readErr || !prompt) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Prompt not found' } });
      return;
    }
    if (prompt.dismissed_at) {
      res.json({ status: 'NO_OP', prompt });
      return;
    }

    const { data: updated, error: upErr } = await getServiceClient()
      .from('incident_dashboard_prompts')
      .update({ dismissed_at: new Date().toISOString(), dismissed_by: staffId })
      .eq('id', promptId)
      .eq('venue_id', venueId)
      .select()
      .single();

    if (upErr || !updated) {
      res.status(500).json({
        error: { code: 'DISMISS_FAILED', message: 'Could not dismiss prompt' },
      });
      return;
    }

    res.json(updated);
  },
);

