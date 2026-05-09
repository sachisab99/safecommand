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
import { requireAuth } from '../middleware/auth.js';
import { setTenantContext } from '../middleware/tenant.js';
import { getServiceClient } from '@safecommand/db';
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

  // Non-SIRE incidents return 200 + empty SIRE payload (caller falls back)
  if (!incident.has_sire_data) {
    res.json({
      incident_id: incident.id,
      has_sire_data: false,
      zone_states: [],
      assignments: [],
      evacuation_triggers: [],
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
  });
});
