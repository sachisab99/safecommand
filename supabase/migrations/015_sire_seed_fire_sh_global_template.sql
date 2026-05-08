-- Migration 015 (this repo) | Phase 5.21 Day 1 — Architect acceptance gate
-- ───────────────────────────────────────────────────────────────────────────
-- Seeds the EC-23-mandated global+parent template for FIRE incidents at the
-- SH (Security Head) role. Architect Day 1 acceptance criterion:
--
--   "Seed one global template immediately after migration for FIRE + SH role.
--    Verify the 5-step resolution chain returns it before building any other
--    endpoint."
--
-- This template is the FINAL fallback in the EC-23 resolution chain:
--   1. venue+sub-type     ← most specific
--   2. venue+parent
--   3. venue-type+sub-type
--   4. venue-type+parent
--   5. global+sub-type
--   6. global+parent      ← THIS ROW (mandatory; EC-23 fail-state if missing)
--
-- Without this row, an SH declaring an unanticipated FIRE sub-type would
-- have no resolved actions and the api would return an empty response —
-- violating the architect's "always resolve to SOMETHING" guarantee.
--
-- Subsequent days seed additional templates for other roles + sub-types
-- (FIRE_CONTAINED-specific SH variant, FIRE_DRILL-specific, GS / FS / SC
-- per-role baselines, MEDICAL / SECURITY / EVACUATION / STRUCTURAL / OTHER
-- parent fallbacks). Templates may be authored as further migrations OR
-- managed via the SC Ops Console post-Phase-5.21.
--
-- Refs:
--   - docs/specs/SafeCommand_Phase521_Clarifications_Resolved.md (Q5)
--   - docs/specs/SafeCommand_Phase521_Preflight_Analysis.md (Day 1 gate)
--   - Business Plan v8 §7 (BR-G through BR-P)
--   - Architecture v8 §SIRE EC-23
-- ───────────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════
-- 0. PRECONDITION — mig 014 applied
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'incident_action_templates'
  ) THEN
    RAISE EXCEPTION 'mig 015 precondition failed: mig 014 (SIRE schema) must be applied first. incident_action_templates table missing.';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. SEED — global+parent FIRE template for SH role
-- ═══════════════════════════════════════════════════════════════════════════
-- 6 action steps reflecting the canonical SH FIRE response per
-- NFPA 1620, NFPA 101, NABH §EM, and NDMA Fire Safety Guidelines.
-- Time targets are upper bounds — SH may complete faster.
-- All 6 steps are mandatory + life-critical (this is FIRE — no optional
-- actions in the global default; venue overrides may relax for drills).

INSERT INTO incident_action_templates (
  venue_id, venue_type,
  incident_type, incident_subtype,
  staff_role,
  template_version, is_active,
  actions
) VALUES (
  NULL, NULL,                  -- global+parent scope (EC-23 step 6)
  'FIRE', NULL,                -- FIRE parent (any sub-type cascades to here)
  'SH',                        -- Security Head role
  1, TRUE,
  jsonb_build_array(
    jsonb_build_object(
      'order', 1,
      'instruction', 'Acknowledge the incident declaration and open the command channel. Announce yourself on the command frequency and confirm the affected zone(s).',
      'instruction_i18n_key', 'sire.fire.sh.action.acknowledge_declaration',
      'time_target_seconds', 30,
      'evidence_type', 'VERBAL',
      'is_mandatory', TRUE,
      'is_life_critical', TRUE,
      'location_scope', 'VENUE'
    ),
    jsonb_build_object(
      'order', 2,
      'instruction', 'Direct ground staff to begin life-safety sweep of all affected zones. Confirm GS coverage of every zone marked UNVALIDATED and dispatch backup if any zone has no assigned GS.',
      'instruction_i18n_key', 'sire.fire.sh.action.dispatch_zone_sweep',
      'time_target_seconds', 60,
      'evidence_type', 'VERBAL',
      'is_mandatory', TRUE,
      'is_life_critical', TRUE,
      'location_scope', 'VENUE'
    ),
    jsonb_build_object(
      'order', 3,
      'instruction', 'Notify the external Fire Service (101 / venue primary EMS contact). Provide venue address, building / floor / zone, fire status, and your callback number.',
      'instruction_i18n_key', 'sire.fire.sh.action.notify_fire_service',
      'time_target_seconds', 120,
      'evidence_type', 'NOTE',
      'is_mandatory', TRUE,
      'is_life_critical', TRUE,
      'location_scope', 'EXTERNAL'
    ),
    jsonb_build_object(
      'order', 4,
      'instruction', 'Assess severity from incoming zone reports. Decide evacuation scope: selective zones (BR-J), full venue (BR-K), or shelter-in-place. Document decision rationale.',
      'instruction_i18n_key', 'sire.fire.sh.action.assess_evacuation_scope',
      'time_target_seconds', 180,
      'evidence_type', 'NOTE',
      'is_mandatory', TRUE,
      'is_life_critical', TRUE,
      'location_scope', 'VENUE'
    ),
    jsonb_build_object(
      'order', 5,
      'instruction', 'Coordinate the PA evacuation broadcast and parallel multi-channel fan-out. Review the auto-drafted PA text (BR-N), edit if needed, then broadcast in English and the venue regional language.',
      'instruction_i18n_key', 'sire.fire.sh.action.coordinate_pa_broadcast',
      'time_target_seconds', 240,
      'evidence_type', 'NOTE',
      'is_mandatory', TRUE,
      'is_life_critical', TRUE,
      'location_scope', 'VENUE'
    ),
    jsonb_build_object(
      'order', 6,
      'instruction', 'Brief the responding Fire Service on arrival. Hand over the live zone status grid, identify the seat of fire, list known trapped occupants, and formally transfer command authority via signed log.',
      'instruction_i18n_key', 'sire.fire.sh.action.brief_external_responder',
      'time_target_seconds', NULL,
      'evidence_type', 'SIGNATURE',
      'is_mandatory', TRUE,
      'is_life_critical', TRUE,
      'location_scope', 'EXTERNAL'
    )
  )
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. VERIFICATION — EC-23 5-step resolution chain returns this row
-- ═══════════════════════════════════════════════════════════════════════════
-- Simulates the api template-resolver query for an incident at an arbitrary
-- venue (HOSPITAL type) declaring incident_type=FIRE / incident_subtype=
-- FIRE_CONTAINED for an SH role. With no venue / venue-type override seeded,
-- the chain MUST land on global+parent (this row).

DO $$
DECLARE
  v_resolved_actions JSONB;
  v_action_count     INTEGER;
  v_template_id      UUID;
  v_specificity_tier INTEGER;
BEGIN
  -- EC-23 chain query (mirrors api/src/services/sire/templateResolver.ts
  -- spec). Specificity tiers (1 = most specific, 6 = global+parent):
  --
  --   Tier 1: venue+sub-type
  --   Tier 2: venue+parent
  --   Tier 3: venue-type+sub-type
  --   Tier 4: venue-type+parent
  --   Tier 5: global+sub-type
  --   Tier 6: global+parent
  --
  -- For verification, we use synthetic inputs since no FIRE incident has
  -- been declared yet. We expect tier 6 to win.
  WITH inputs AS (
    SELECT
      gen_random_uuid()::UUID AS sim_venue_id,    -- non-existent venue
      'HOSPITAL'::TEXT        AS sim_venue_type,
      'FIRE'::TEXT            AS sim_incident_type,
      'FIRE_CONTAINED'::TEXT  AS sim_incident_subtype,
      'SH'::TEXT              AS sim_staff_role
  )
  SELECT
    iat.id,
    iat.actions,
    jsonb_array_length(iat.actions),
    CASE
      WHEN iat.venue_id      IS NOT NULL AND iat.incident_subtype IS NOT NULL THEN 1
      WHEN iat.venue_id      IS NOT NULL AND iat.incident_subtype IS NULL     THEN 2
      WHEN iat.venue_type    IS NOT NULL AND iat.incident_subtype IS NOT NULL THEN 3
      WHEN iat.venue_type    IS NOT NULL AND iat.incident_subtype IS NULL     THEN 4
      WHEN iat.venue_id IS NULL AND iat.venue_type IS NULL
                                  AND iat.incident_subtype IS NOT NULL        THEN 5
      ELSE                                                                          6
    END AS tier
    INTO v_template_id, v_resolved_actions, v_action_count, v_specificity_tier
  FROM incident_action_templates iat, inputs
  WHERE iat.is_active = TRUE
    AND iat.staff_role     = inputs.sim_staff_role
    AND iat.incident_type  = inputs.sim_incident_type
    AND (
      (iat.venue_id = inputs.sim_venue_id AND iat.incident_subtype = inputs.sim_incident_subtype) OR
      (iat.venue_id = inputs.sim_venue_id AND iat.incident_subtype IS NULL)                       OR
      (iat.venue_id IS NULL AND iat.venue_type = inputs.sim_venue_type
                            AND iat.incident_subtype = inputs.sim_incident_subtype)               OR
      (iat.venue_id IS NULL AND iat.venue_type = inputs.sim_venue_type
                            AND iat.incident_subtype IS NULL)                                     OR
      (iat.venue_id IS NULL AND iat.venue_type IS NULL
                            AND iat.incident_subtype = inputs.sim_incident_subtype)               OR
      (iat.venue_id IS NULL AND iat.venue_type IS NULL
                            AND iat.incident_subtype IS NULL)
    )
  ORDER BY
    CASE
      WHEN iat.venue_id      IS NOT NULL AND iat.incident_subtype IS NOT NULL THEN 1
      WHEN iat.venue_id      IS NOT NULL AND iat.incident_subtype IS NULL     THEN 2
      WHEN iat.venue_type    IS NOT NULL AND iat.incident_subtype IS NOT NULL THEN 3
      WHEN iat.venue_type    IS NOT NULL AND iat.incident_subtype IS NULL     THEN 4
      WHEN iat.venue_id IS NULL AND iat.venue_type IS NULL
                                  AND iat.incident_subtype IS NOT NULL        THEN 5
      ELSE                                                                          6
    END,
    iat.template_version DESC
  LIMIT 1;

  RAISE NOTICE 'mig 015 EC-23 resolution chain verification:';
  RAISE NOTICE '  Resolved template id: %', v_template_id;
  RAISE NOTICE '  Specificity tier hit: % (expected: 6 = global+parent)', v_specificity_tier;
  RAISE NOTICE '  Resolved action count: % (expected: 6)', v_action_count;

  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'mig 015 EC-23 verification FAILED: chain returned NO row. EC-23 violation — global+parent seed missing.';
  END IF;
  IF v_specificity_tier <> 6 THEN
    RAISE EXCEPTION 'mig 015 EC-23 verification FAILED: chain landed on tier % (expected 6). Unexpected venue/venue-type override exists.', v_specificity_tier;
  END IF;
  IF v_action_count <> 6 THEN
    RAISE EXCEPTION 'mig 015 EC-23 verification FAILED: resolved % actions (expected 6).', v_action_count;
  END IF;

  RAISE NOTICE '  All checks PASSED. EC-23 chain operational; FIRE+SH global default ready.';
  RAISE NOTICE '  Day 1 acceptance gate satisfied. Phase 5.21 endpoint authoring may proceed.';
END $$;
