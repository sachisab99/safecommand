-- Migration 017 (this repo) | Phase 5.21 Day 2 — priority template fan-out
-- ───────────────────────────────────────────────────────────────────────────
-- Seeds 5 additional global+parent SIRE action templates beyond the FIRE+SH
-- floor that mig 015 established. Each is the EC-23 tier-6 fallback for
-- its (incident_type, staff_role) tuple — meaning a venue declaring FIRE
-- now sees role-appropriate action lists for SH / DSH / SC / FS / GS, plus
-- a full-venue-evacuation template specific to SH.
--
-- This unlocks the multi-role Day 2 demo flow where:
--   - SH declares FIRE_CONTAINED at a zone
--   - The api fans assignments out to declaring SH + 1 GS per zone + 1 FS
--   - GS opens mobile, sees their 5-action checklist
--   - FS sees their 6-action floor-coordination checklist
--   - SH dashboard shows the per-staff completion grid
--
-- All 5 templates are tier-6 (venue_id NULL, venue_type NULL, sub-type
-- NULL) — they're the universal floor that every venue inherits unless
-- they override via SC Ops Console (Phase 5.22).
--
-- Each action's content is grounded in the same standards mig 015's
-- FIRE+SH template was: NFPA 1561 (incident command), NFPA 101 §A.7.6.2
-- (90s sweep target), NFPA 1620, NABH §EM (clinical role assignments),
-- NDMA Fire Safety Guidelines (per-floor warden roles), HICS 5 Job
-- Action Sheets (commander structure).
--
-- Refs:
--   - mig 015 (FIRE+SH floor; same pattern)
--   - docs/specs/incident-response-activity-templates.md (SIRE design)
--   - Architecture v8 §SIRE BR-G to BR-P
-- ───────────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════
-- 0. PRECONDITION — mig 014 + 015 applied
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'incident_action_templates'
  ) THEN
    RAISE EXCEPTION 'mig 017 precondition failed: mig 014 must be applied first';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM incident_action_templates
    WHERE venue_id IS NULL AND venue_type IS NULL
      AND incident_type = 'FIRE' AND incident_subtype IS NULL
      AND staff_role = 'SH'
  ) THEN
    RAISE EXCEPTION 'mig 017 precondition failed: mig 015 (FIRE+SH global floor) must be applied first';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. SEED — 5 additional global+parent templates
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Template 1: FIRE + Ground Staff ───
-- The frontline role — physical sweep + door closure + occupant evacuation.
INSERT INTO incident_action_templates (
  venue_id, venue_type, incident_type, incident_subtype, staff_role,
  template_version, is_active, actions
) VALUES (
  NULL, NULL, 'FIRE', NULL, 'GROUND_STAFF',
  1, TRUE,
  jsonb_build_array(
    jsonb_build_object(
      'order', 1,
      'instruction', 'Acknowledge the incident on your device and proceed immediately to your assigned zone. Confirm receipt to your Floor Supervisor on the command channel.',
      'instruction_i18n_key', 'sire.fire.gs.action.acknowledge_and_proceed',
      'time_target_seconds', 30,
      'evidence_type', 'VERBAL',
      'is_mandatory', TRUE,
      'is_life_critical', TRUE,
      'location_scope', 'ASSIGNED_ZONE'
    ),
    jsonb_build_object(
      'order', 2,
      'instruction', 'Sweep your assigned zone systematically. Move all occupants toward the nearest evacuation route. Check restrooms, storerooms, and any private spaces.',
      'instruction_i18n_key', 'sire.fire.gs.action.life_safety_sweep',
      'time_target_seconds', 90,
      'evidence_type', 'VERBAL',
      'is_mandatory', TRUE,
      'is_life_critical', TRUE,
      'location_scope', 'ASSIGNED_ZONE'
    ),
    jsonb_build_object(
      'order', 3,
      'instruction', 'Close all fire doors as you exit the zone. Confirm doors are latched, not just pulled to. Do NOT lock — emergency responders need access.',
      'instruction_i18n_key', 'sire.fire.gs.action.close_fire_doors',
      'time_target_seconds', 60,
      'evidence_type', 'VERBAL',
      'is_mandatory', TRUE,
      'is_life_critical', TRUE,
      'location_scope', 'ASSIGNED_ZONE'
    ),
    jsonb_build_object(
      'order', 4,
      'instruction', 'Tap the appropriate zone state on your device: Zone Clear (sweep complete + empty + doors closed), Needs Attention (occupant or hazard found), or Inaccessible (cannot enter).',
      'instruction_i18n_key', 'sire.fire.gs.action.report_zone_state',
      'time_target_seconds', 60,
      'evidence_type', 'NOTE',
      'is_mandatory', TRUE,
      'is_life_critical', TRUE,
      'location_scope', 'ASSIGNED_ZONE'
    ),
    jsonb_build_object(
      'order', 5,
      'instruction', 'Proceed to the designated muster point and stand by for further instructions from your Floor Supervisor or Security Head. Do NOT re-enter the building until all-clear is announced.',
      'instruction_i18n_key', 'sire.fire.gs.action.muster_and_stand_by',
      'time_target_seconds', NULL,
      'evidence_type', 'VERBAL',
      'is_mandatory', TRUE,
      'is_life_critical', TRUE,
      'location_scope', 'FLOOR'
    )
  )
);

-- ─── Template 2: FIRE + Floor Supervisor ───
-- Coordinates 1-N GS across the assigned floor; bridges floor-level ops to SH.
INSERT INTO incident_action_templates (
  venue_id, venue_type, incident_type, incident_subtype, staff_role,
  template_version, is_active, actions
) VALUES (
  NULL, NULL, 'FIRE', NULL, 'FLOOR_SUPERVISOR',
  1, TRUE,
  jsonb_build_array(
    jsonb_build_object(
      'order', 1,
      'instruction', 'Acknowledge the incident and open the floor command channel. Confirm your assigned floor coverage to the Security Head.',
      'instruction_i18n_key', 'sire.fire.fs.action.acknowledge_open_channel',
      'time_target_seconds', 30,
      'evidence_type', 'VERBAL',
      'is_mandatory', TRUE,
      'is_life_critical', TRUE,
      'location_scope', 'FLOOR'
    ),
    jsonb_build_object(
      'order', 2,
      'instruction', 'Coordinate ground staff sweep across all zones on your floor. Confirm every UNVALIDATED zone has an assigned GS; redirect coverage if any zone is unassigned.',
      'instruction_i18n_key', 'sire.fire.fs.action.coordinate_floor_sweep',
      'time_target_seconds', 60,
      'evidence_type', 'VERBAL',
      'is_mandatory', TRUE,
      'is_life_critical', TRUE,
      'location_scope', 'FLOOR'
    ),
    jsonb_build_object(
      'order', 3,
      'instruction', 'Receive zone status reports from GS. Escalate any NEEDS_ATTENTION or INACCESSIBLE zones immediately to SH with location, observed hazard, and assigned GS.',
      'instruction_i18n_key', 'sire.fire.fs.action.escalate_attention_zones',
      'time_target_seconds', 120,
      'evidence_type', 'NOTE',
      'is_mandatory', TRUE,
      'is_life_critical', TRUE,
      'location_scope', 'FLOOR'
    ),
    jsonb_build_object(
      'order', 4,
      'instruction', 'If SH triggers floor evacuation: direct all occupants to the nearest stairwell. Do not use lifts. Lead by example — be visible at the stairwell entrance.',
      'instruction_i18n_key', 'sire.fire.fs.action.direct_floor_evacuation',
      'time_target_seconds', 90,
      'evidence_type', 'VERBAL',
      'is_mandatory', TRUE,
      'is_life_critical', TRUE,
      'location_scope', 'FLOOR'
    ),
    jsonb_build_object(
      'order', 5,
      'instruction', 'Account for all ground staff and visitors on your floor at the muster point. Report headcount + any missing persons to SH within 3 minutes of evacuation completion.',
      'instruction_i18n_key', 'sire.fire.fs.action.account_for_persons',
      'time_target_seconds', 180,
      'evidence_type', 'NOTE',
      'is_mandatory', TRUE,
      'is_life_critical', TRUE,
      'location_scope', 'FLOOR'
    ),
    jsonb_build_object(
      'order', 6,
      'instruction', 'On Fire Service arrival: hand over the floor situation report (zone status grid + accountability data + access route) via SH command channel.',
      'instruction_i18n_key', 'sire.fire.fs.action.hand_over_to_responder',
      'time_target_seconds', NULL,
      'evidence_type', 'SIGNATURE',
      'is_mandatory', TRUE,
      'is_life_critical', TRUE,
      'location_scope', 'FLOOR'
    )
  )
);

-- ─── Template 3: FIRE + Shift Commander ───
-- Cross-floor logistics + resource coordination + utility shutdown directives.
INSERT INTO incident_action_templates (
  venue_id, venue_type, incident_type, incident_subtype, staff_role,
  template_version, is_active, actions
) VALUES (
  NULL, NULL, 'FIRE', NULL, 'SHIFT_COMMANDER',
  1, TRUE,
  jsonb_build_array(
    jsonb_build_object(
      'order', 1,
      'instruction', 'Acknowledge the incident. If Security Head is not on-site, contact SH and assume operational command pending arrival.',
      'instruction_i18n_key', 'sire.fire.sc.action.acknowledge_assume_ops',
      'time_target_seconds', 30,
      'evidence_type', 'VERBAL',
      'is_mandatory', TRUE,
      'is_life_critical', TRUE,
      'location_scope', 'VENUE'
    ),
    jsonb_build_object(
      'order', 2,
      'instruction', 'Activate all on-duty floor supervisors. Confirm cross-floor coordination via the command channel — no floor should be running independent ops.',
      'instruction_i18n_key', 'sire.fire.sc.action.activate_floor_commanders',
      'time_target_seconds', 60,
      'evidence_type', 'VERBAL',
      'is_mandatory', TRUE,
      'is_life_critical', TRUE,
      'location_scope', 'VENUE'
    ),
    jsonb_build_object(
      'order', 3,
      'instruction', 'Track resource allocation in real time: GS coverage per floor, equipment status (extinguishers/AEDs deployed), staff certifications relevant to incident.',
      'instruction_i18n_key', 'sire.fire.sc.action.track_resources',
      'time_target_seconds', 120,
      'evidence_type', 'NOTE',
      'is_mandatory', TRUE,
      'is_life_critical', FALSE,
      'location_scope', 'VENUE'
    ),
    jsonb_build_object(
      'order', 4,
      'instruction', 'On SH directive: coordinate utility shutdowns (gas valve, HVAC, non-essential power). Document who, when, what was shut down.',
      'instruction_i18n_key', 'sire.fire.sc.action.utility_shutdown',
      'time_target_seconds', 180,
      'evidence_type', 'VERBAL',
      'is_mandatory', FALSE,
      'is_life_critical', TRUE,
      'location_scope', 'EXTERNAL'
    ),
    jsonb_build_object(
      'order', 5,
      'instruction', 'Manage pre-arrival logistics for Fire Service: open vehicle gates, clear access route, position staff at gates to direct responders.',
      'instruction_i18n_key', 'sire.fire.sc.action.fire_service_logistics',
      'time_target_seconds', 180,
      'evidence_type', 'VERBAL',
      'is_mandatory', TRUE,
      'is_life_critical', TRUE,
      'location_scope', 'EXTERNAL'
    ),
    jsonb_build_object(
      'order', 6,
      'instruction', 'Brief SH every 5 minutes until command transfer to Fire Service. Use structured SitRep format: scope / status / resources / next action.',
      'instruction_i18n_key', 'sire.fire.sc.action.sitrep_every_5min',
      'time_target_seconds', NULL,
      'evidence_type', 'VERBAL',
      'is_mandatory', TRUE,
      'is_life_critical', FALSE,
      'location_scope', 'VENUE'
    )
  )
);

-- ─── Template 4: FIRE + Deputy Security Head ───
-- DSH stands by ready to assume SH role per BR-13. Mirrors SH command surface.
INSERT INTO incident_action_templates (
  venue_id, venue_type, incident_type, incident_subtype, staff_role,
  template_version, is_active, actions
) VALUES (
  NULL, NULL, 'FIRE', NULL, 'DSH',
  1, TRUE,
  jsonb_build_array(
    jsonb_build_object(
      'order', 1,
      'instruction', 'Acknowledge the incident and join the venue command channel as DSH. Identify yourself to the Security Head + Shift Commander.',
      'instruction_i18n_key', 'sire.fire.dsh.action.acknowledge_join_command',
      'time_target_seconds', 30,
      'evidence_type', 'VERBAL',
      'is_mandatory', TRUE,
      'is_life_critical', TRUE,
      'location_scope', 'VENUE'
    ),
    jsonb_build_object(
      'order', 2,
      'instruction', 'Stand-by ready to assume Security Head role if SH becomes unresponsive for more than 5 minutes (BR-13 auto-activation threshold).',
      'instruction_i18n_key', 'sire.fire.dsh.action.standby_for_takeover',
      'time_target_seconds', NULL,
      'evidence_type', 'VERBAL',
      'is_mandatory', TRUE,
      'is_life_critical', TRUE,
      'location_scope', 'VENUE'
    ),
    jsonb_build_object(
      'order', 3,
      'instruction', 'While SH directs floor operations, manage external command-chain communications: keep ownership/management informed; field calls from off-site staff.',
      'instruction_i18n_key', 'sire.fire.dsh.action.external_comms',
      'time_target_seconds', 60,
      'evidence_type', 'VERBAL',
      'is_mandatory', TRUE,
      'is_life_critical', FALSE,
      'location_scope', 'VENUE'
    ),
    jsonb_build_object(
      'order', 4,
      'instruction', 'Document command decisions for post-incident audit: every evacuation trigger, every NEEDS_ATTENTION escalation, every utility-shutdown directive — timestamped with who, what, why.',
      'instruction_i18n_key', 'sire.fire.dsh.action.audit_decisions',
      'time_target_seconds', 180,
      'evidence_type', 'NOTE',
      'is_mandatory', TRUE,
      'is_life_critical', FALSE,
      'location_scope', 'VENUE'
    ),
    jsonb_build_object(
      'order', 5,
      'instruction', 'If SH unavailable on responder arrival: brief incoming Fire Service. Hand over zone status grid + occupant accountability + signed transfer-of-command.',
      'instruction_i18n_key', 'sire.fire.dsh.action.brief_responder_if_sh_absent',
      'time_target_seconds', NULL,
      'evidence_type', 'SIGNATURE',
      'is_mandatory', TRUE,
      'is_life_critical', TRUE,
      'location_scope', 'EXTERNAL'
    ),
    jsonb_build_object(
      'order', 6,
      'instruction', 'After incident closure: lead the post-incident audit reconstruction. Compile timeline + per-staff action completion + reason codes for any missed actions.',
      'instruction_i18n_key', 'sire.fire.dsh.action.post_incident_audit',
      'time_target_seconds', NULL,
      'evidence_type', 'NOTE',
      'is_mandatory', TRUE,
      'is_life_critical', FALSE,
      'location_scope', 'VENUE'
    )
  )
);

-- ─── Template 5: EVACUATION_FULL + Security Head ───
-- Specialised for full venue evacuation events — distinct from general FIRE+SH.
INSERT INTO incident_action_templates (
  venue_id, venue_type, incident_type, incident_subtype, staff_role,
  template_version, is_active, actions
) VALUES (
  NULL, NULL, 'EVACUATION', NULL, 'SH',
  1, TRUE,
  jsonb_build_array(
    jsonb_build_object(
      'order', 1,
      'instruction', 'Acknowledge the full evacuation order. Open the venue command channel. Confirm with DSH + SC that command structure is active.',
      'instruction_i18n_key', 'sire.evac.sh.action.acknowledge_open_channel',
      'time_target_seconds', 30,
      'evidence_type', 'VERBAL',
      'is_mandatory', TRUE,
      'is_life_critical', TRUE,
      'location_scope', 'VENUE'
    ),
    jsonb_build_object(
      'order', 2,
      'instruction', 'Trigger venue-wide PA broadcast in English and the venue regional language. Standard message: clear and calm directive — this is not a drill, proceed to nearest evacuation point, do not use lifts.',
      'instruction_i18n_key', 'sire.evac.sh.action.pa_broadcast',
      'time_target_seconds', 60,
      'evidence_type', 'NOTE',
      'is_mandatory', TRUE,
      'is_life_critical', TRUE,
      'location_scope', 'VENUE'
    ),
    jsonb_build_object(
      'order', 3,
      'instruction', 'Direct all GS to evacuation muster points. Verify visitor accountability via VMS log — no visitor unaccounted for at the muster.',
      'instruction_i18n_key', 'sire.evac.sh.action.direct_muster_visitor_account',
      'time_target_seconds', 120,
      'evidence_type', 'VERBAL',
      'is_mandatory', TRUE,
      'is_life_critical', TRUE,
      'location_scope', 'VENUE'
    ),
    jsonb_build_object(
      'order', 4,
      'instruction', 'Notify external Fire Service and Emergency Medical Services that a full venue evacuation is in progress. Provide venue address + access route + estimated evacuation completion time.',
      'instruction_i18n_key', 'sire.evac.sh.action.notify_external',
      'time_target_seconds', 120,
      'evidence_type', 'NOTE',
      'is_mandatory', TRUE,
      'is_life_critical', TRUE,
      'location_scope', 'EXTERNAL'
    ),
    jsonb_build_object(
      'order', 5,
      'instruction', 'Coordinate gate-open and traffic management for emergency vehicle access. Position staff to direct responders on arrival.',
      'instruction_i18n_key', 'sire.evac.sh.action.gate_traffic_management',
      'time_target_seconds', 180,
      'evidence_type', 'VERBAL',
      'is_mandatory', TRUE,
      'is_life_critical', TRUE,
      'location_scope', 'EXTERNAL'
    ),
    jsonb_build_object(
      'order', 6,
      'instruction', 'Confirm all-zones-evacuated via floor commander reports. Sign the all-clear transfer-of-command to Fire Service. Do NOT permit re-entry until external authority clears the venue.',
      'instruction_i18n_key', 'sire.evac.sh.action.all_clear_handover',
      'time_target_seconds', NULL,
      'evidence_type', 'SIGNATURE',
      'is_mandatory', TRUE,
      'is_life_critical', TRUE,
      'location_scope', 'VENUE'
    )
  )
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. VERIFICATION — confirm 6 templates total (1 from mig 015 + 5 from this)
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_total_count        INT;
  v_fire_role_count    INT;
  v_evac_sh_count      INT;
BEGIN
  -- Total active global+parent templates
  SELECT COUNT(*) INTO v_total_count
  FROM incident_action_templates
  WHERE venue_id IS NULL AND venue_type IS NULL
    AND incident_subtype IS NULL AND is_active = TRUE;

  -- FIRE role coverage (should be 5: SH/DSH/SC/FS/GS)
  SELECT COUNT(*) INTO v_fire_role_count
  FROM incident_action_templates
  WHERE venue_id IS NULL AND venue_type IS NULL
    AND incident_type = 'FIRE' AND incident_subtype IS NULL
    AND staff_role IN ('SH', 'DSH', 'SHIFT_COMMANDER', 'FLOOR_SUPERVISOR', 'GROUND_STAFF')
    AND is_active = TRUE;

  -- EVACUATION+SH count (should be 1)
  SELECT COUNT(*) INTO v_evac_sh_count
  FROM incident_action_templates
  WHERE venue_id IS NULL AND venue_type IS NULL
    AND incident_type = 'EVACUATION' AND incident_subtype IS NULL
    AND staff_role = 'SH' AND is_active = TRUE;

  RAISE NOTICE 'mig 017 verification:';
  RAISE NOTICE '  Total active global+parent templates: % (expected: 6)', v_total_count;
  RAISE NOTICE '  FIRE role coverage (SH/DSH/SC/FS/GS): % (expected: 5)', v_fire_role_count;
  RAISE NOTICE '  EVACUATION+SH templates: % (expected: 1)', v_evac_sh_count;

  IF v_total_count <> 6 THEN
    RAISE EXCEPTION 'mig 017 FAILED: expected 6 global+parent templates total, got %', v_total_count;
  END IF;
  IF v_fire_role_count <> 5 THEN
    RAISE EXCEPTION 'mig 017 FAILED: expected 5 FIRE+role templates, got %', v_fire_role_count;
  END IF;
  IF v_evac_sh_count <> 1 THEN
    RAISE EXCEPTION 'mig 017 FAILED: expected 1 EVACUATION+SH template, got %', v_evac_sh_count;
  END IF;

  RAISE NOTICE '  All checks PASSED. SIRE template library has Day 2 demo coverage.';
END $$;
