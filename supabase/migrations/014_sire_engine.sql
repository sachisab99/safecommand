-- Migration 014 (this repo) | Spec: Architecture v8 §SIRE
-- ───────────────────────────────────────────────────────────────────────────
-- Phase 5.21 — Structured Incident Response Engine (SIRE)
-- ───────────────────────────────────────────────────────────────────────────
-- Adds 8 new tables + 1 view + 5 columns on `incidents` to deliver
-- BR-G through BR-P (10 new business requirements introduced in v8 §7).
--
-- Architect-resolved final ToC per:
--   docs/specs/SafeCommand_Phase521_Clarifications_Resolved.md (commit 0bf1a82)
--
-- Hard Rule 24 (v8): mig 014 MUST be applied before any Phase 5.21 code
-- deploys. The `incident_zone_states`, `incident_evacuation_triggers`, and
-- `incident_subtype` column must exist in DB before API routes using them
-- are deployed. Apply migration → verify → deploy code. Never the reverse.
--
-- Hard Rule 23 (v8): SIRE auto-evacuation suggestion (BR-L) is NEVER an
-- auto-trigger — it is ALWAYS a suggestion. The `incident_dashboard_prompts`
-- table's `is_auto_trigger` column is FALSE by design and CHECK-constrained.
--
-- Backward compatibility:
--   - All operations are ADD COLUMN or CREATE TABLE (additive only)
--   - Zero downtime; safe to apply during live operation
--   - Existing Phase 5.13–5.18 surfaces (drills, equipment, certs,
--     shifts, staff) preserved verbatim
--   - Phase 1 incident declaration flow (binary "I AM SAFE") continues
--     to work; SIRE features activated only when has_sire_data=TRUE
--
-- Refs:
--   - docs/specs/incident-response-activity-templates.md (full spec)
--   - docs/adr/0001-migration-renumbering.md (numbering ADR)
--   - Business Plan v8 §7 (Structured Incident Response Engine)
--   - Architecture v8 §SIRE
-- ───────────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════
-- 0. ENVIRONMENT VERIFICATION (TOP — fail fast on wrong environment)
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_db_name TEXT;
BEGIN
  SELECT current_database() INTO v_db_name;
  RAISE NOTICE 'mig 014 SIRE: applying to database "%"', v_db_name;
  -- Sanity check: latest mig should be 013_drill_participant_reason
  -- If running against a DB without mig 013, the drill reason columns
  -- referenced in cross-table integrity (none here, but principle holds)
  -- would fail. Defensive abort if mig 013 not applied:
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'drill_session_participants'
      AND column_name = 'reason_code'
  ) THEN
    RAISE EXCEPTION 'mig 014 SIRE precondition failed: mig 013 (drill reason) must be applied first. drill_session_participants.reason_code missing.';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. ALTER TABLE incidents — 5 new columns
-- ═══════════════════════════════════════════════════════════════════════════
-- Per architect resolution §1.2C + §4.6:
--   incident_subtype     — 32-value CHECK; NULL allowed (optional at declaration)
--   is_drill             — explicit drill flag; gates auto-evac suppression
--   has_sire_data        — gates IncidentDetailScreen v2 on mobile (Q8 resolution)
--   resolved_templates   — immutable JSONB audit snapshot at declaration (Q3)
--   escalated_from_drill_id — drill-incident hybrid link (Q4)

ALTER TABLE incidents
  ADD COLUMN incident_subtype TEXT NULL CHECK (incident_subtype IN (
    -- FIRE (4)
    'FIRE_CONTAINED', 'FIRE_SPREADING', 'FIRE_SUSPECTED', 'FIRE_DRILL',
    -- MEDICAL (5)
    'MEDICAL_CARDIAC', 'MEDICAL_TRAUMA', 'MEDICAL_MASS_CASUALTY',
    'MEDICAL_MENTAL_HEALTH', 'MEDICAL_OBSTETRIC',
    -- SECURITY (7)
    'SECURITY_ACTIVE_AGGRESSOR', 'SECURITY_BOMB_THREAT', 'SECURITY_SUSPICIOUS_ITEM',
    'SECURITY_ABDUCTION', 'SECURITY_TRESPASS', 'SECURITY_CIVIL_UNREST',
    'SECURITY_CYBER_PHYSICAL',
    -- EVACUATION (5)
    'EVACUATION_FULL', 'EVACUATION_PARTIAL_ZONE', 'EVACUATION_PARTIAL_FLOOR',
    'EVACUATION_SHELTER_IN_PLACE', 'EVACUATION_DRILL',
    -- STRUCTURAL (7)
    'STRUCTURAL_GAS_LEAK', 'STRUCTURAL_FLOOD_WATER', 'STRUCTURAL_BUILDING_DAMAGE',
    'STRUCTURAL_POWER_FAILURE', 'STRUCTURAL_LIFT_ENTRAPMENT',
    'STRUCTURAL_HAZMAT', 'STRUCTURAL_SEVERE_WEATHER',
    -- OTHER (4)
    'OTHER_VIP_EVENT', 'OTHER_MEDIA_INCIDENT',
    'OTHER_UTILITY_SERVICE', 'OTHER_UNKNOWN'
  )),
  ADD COLUMN is_drill BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN has_sire_data BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN resolved_templates JSONB NULL,
  ADD COLUMN escalated_from_drill_id UUID NULL REFERENCES drill_sessions(id);

COMMENT ON COLUMN incidents.incident_subtype IS
  '32-value sub-type CHECK; nullable. Per BR-G; routes to template resolution via 5-step graceful fallback (EC-23).';
COMMENT ON COLUMN incidents.is_drill IS
  'Explicit drill flag. Never null. Used by Q1 auto-evac-suppression logic; gates NABH §EM compliance section heading.';
COMMENT ON COLUMN incidents.has_sire_data IS
  'Gates IncidentDetailScreen v2 (Q8 resolution). TRUE for new incidents post-Phase-5.21; FALSE for legacy Phase 5.18 incidents.';
COMMENT ON COLUMN incidents.resolved_templates IS
  'Immutable JSONB snapshot of resolved action templates at declaration time. {role: [{action_step}, ...]}. Per Q3 — declaration-time snapshot for audit defensibility.';
COMMENT ON COLUMN incidents.escalated_from_drill_id IS
  'Drill-to-incident hybrid link (Q4). When real incident happens during a drill, drill stays in drill_sessions; new incident here. Audit trail preserved.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. CREATE TABLE incident_zone_states
-- ═══════════════════════════════════════════════════════════════════════════
-- Live state per zone × incident; one row per (incident, zone) pair.
-- Updated via UPSERT with optimistic lock on state_changed_at (R1 + EC-22).
-- Triggers Realtime broadcast (subscribed by SH dashboard + mobile).
--
-- 10-state machine per BR-H:
--   UNVALIDATED → SWEEP_IN_PROGRESS → ZONE_CLEAR / NEEDS_ATTENTION
--   → EVACUATION_TRIGGERED → EVACUATING → EVACUATION_COMPLETE / SH_CONFIRMED_CLEAR
--   + LOCKED_DOWN (security) / INACCESSIBLE (zone blocked)

CREATE TABLE incident_zone_states (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id              UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  incident_id           UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  zone_id               UUID NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  state                 TEXT NOT NULL DEFAULT 'UNVALIDATED' CHECK (state IN (
    'UNVALIDATED', 'SWEEP_IN_PROGRESS', 'ZONE_CLEAR', 'NEEDS_ATTENTION',
    'EVACUATION_TRIGGERED', 'EVACUATING', 'EVACUATION_COMPLETE',
    'SH_CONFIRMED_CLEAR', 'LOCKED_DOWN', 'INACCESSIBLE'
  )),
  -- Assigned ground staff (from shift roster at incident declaration; BR-O)
  assigned_gs_id        UUID NULL REFERENCES staff(id) ON DELETE SET NULL,
  -- Reason for NEEDS_ATTENTION / INACCESSIBLE / LOCKED_DOWN (mandatory in api)
  reason_note           TEXT NULL,
  -- Photo evidence URL for EVACUATION_COMPLETE (mandatory in api)
  evidence_url          TEXT NULL,
  -- Last update metadata
  last_updated_by       UUID NULL REFERENCES staff(id) ON DELETE SET NULL,
  last_updated_by_role  TEXT NULL,
  state_changed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (incident_id, zone_id)
);
ALTER TABLE incident_zone_states ENABLE ROW LEVEL SECURITY;

-- Permissive venue isolation
CREATE POLICY "venue_isolation" ON incident_zone_states
  FOR ALL
  USING (venue_id = current_setting('app.current_venue_id', TRUE)::UUID);

-- Restrictive role-based read filter (mirrors mig 013 pattern):
-- Command roles + AUDITOR + GM see all zones; other roles see only their own assigned zone
CREATE POLICY "incident_zone_states_role_read_gate" ON incident_zone_states
  AS RESTRICTIVE
  FOR SELECT
  USING (
    COALESCE(current_setting('app.current_role', TRUE), '') IN
      ('SH', 'DSH', 'FM', 'SHIFT_COMMANDER', 'AUDITOR', 'GM')
    OR assigned_gs_id = NULLIF(current_setting('app.current_staff_id', TRUE), '')::UUID
  );

CREATE INDEX idx_izs_incident ON incident_zone_states(incident_id);
CREATE INDEX idx_izs_zone ON incident_zone_states(zone_id);
CREATE INDEX idx_izs_state ON incident_zone_states(incident_id, state);

COMMENT ON TABLE incident_zone_states IS
  'Live zone state per incident; one row per (incident, zone). UPSERTed with optimistic lock on state_changed_at. Triggers Realtime broadcast. BR-H 10-state machine.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. CREATE TABLE incident_zone_state_log
-- ═══════════════════════════════════════════════════════════════════════════
-- Append-only audit trail of every zone state transition.
-- Hard Rule 4: write-once, never UPDATE / DELETE.
-- EC-22 (v8): zone state changes are NEW ROWS in this table, never UPDATE.

CREATE TABLE incident_zone_state_log (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id              UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  incident_id           UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  zone_id               UUID NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  previous_state        TEXT NULL,           -- NULL on first state set
  new_state             TEXT NOT NULL,
  changed_by            UUID NULL REFERENCES staff(id) ON DELETE SET NULL,
  changed_by_role       TEXT NULL,
  reason_note           TEXT NULL,
  evidence_url          TEXT NULL,
  changed_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE incident_zone_state_log ENABLE ROW LEVEL SECURITY;

-- Permissive venue isolation (SELECT)
CREATE POLICY "venue_isolation" ON incident_zone_state_log
  FOR SELECT
  USING (venue_id = current_setting('app.current_venue_id', TRUE)::UUID);

-- Append-only: INSERT allowed; UPDATE / DELETE explicitly denied via RESTRICTIVE policy
CREATE POLICY "append_only_no_update" ON incident_zone_state_log
  AS RESTRICTIVE
  FOR UPDATE
  USING (FALSE);
CREATE POLICY "append_only_no_delete" ON incident_zone_state_log
  AS RESTRICTIVE
  FOR DELETE
  USING (FALSE);

-- INSERT gated by venue context (mirrors existing append-only patterns
-- on audit_logs / incident_timeline / zone_status_log in mig 003).
-- Mobile/dashboard direct-supabase-client cannot set app.current_venue_id
-- session var, so this effectively restricts INSERTs to the API
-- (service_role bypasses RLS but explicitly sets venue context).
CREATE POLICY "venue_scoped_insert" ON incident_zone_state_log
  FOR INSERT
  WITH CHECK (venue_id = current_venue_id());

CREATE INDEX idx_izsl_incident ON incident_zone_state_log(incident_id, changed_at);
CREATE INDEX idx_izsl_zone ON incident_zone_state_log(zone_id, changed_at);

COMMENT ON TABLE incident_zone_state_log IS
  'Append-only audit log of zone state transitions. Hard Rule 4 + EC-22. Immutable; UPDATE / DELETE denied at RLS layer.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. CREATE TABLE incident_evacuation_triggers
-- ═══════════════════════════════════════════════════════════════════════════
-- Immutable per-decision audit. Every selective / full / staff-triggered
-- evacuation creates a row. Hard Rule 4 append-only. BR-J + BR-K + BR-P.

CREATE TABLE incident_evacuation_triggers (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id              UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  incident_id           UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  trigger_type          TEXT NOT NULL CHECK (trigger_type IN (
    'ZONE_SELECTIVE', 'FLOOR_SELECTIVE', 'FULL_VENUE', 'STAFF_TRIGGERED'
  )),
  triggered_by          UUID NULL REFERENCES staff(id) ON DELETE SET NULL,
  triggered_by_role     TEXT NULL,
  -- Affected zones (UUID array; non-empty for SELECTIVE; FULL_VENUE may leave empty)
  zones_affected        UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  building_id           UUID NULL,        -- For FLOOR_SELECTIVE / FULL_VENUE building scope
  reason_note           TEXT NOT NULL,    -- Mandatory per BR-J / BR-K
  pa_text_generated     TEXT NULL,        -- Auto-drafted PA text per BR-N
  pa_text_broadcast     TEXT NULL,        -- Edited+broadcast text (may differ from generated)
  pa_language           TEXT NULL DEFAULT 'en-IN',  -- ISO locale; Phase B for regional
  notification_count    INTEGER NULL,     -- Set asynchronously by notifier worker
  triggered_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE incident_evacuation_triggers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "venue_isolation" ON incident_evacuation_triggers
  FOR SELECT
  USING (venue_id = current_setting('app.current_venue_id', TRUE)::UUID);

CREATE POLICY "append_only_no_update" ON incident_evacuation_triggers
  AS RESTRICTIVE
  FOR UPDATE
  USING (FALSE);
CREATE POLICY "append_only_no_delete" ON incident_evacuation_triggers
  AS RESTRICTIVE
  FOR DELETE
  USING (FALSE);

CREATE POLICY "venue_scoped_insert" ON incident_evacuation_triggers
  FOR INSERT
  WITH CHECK (venue_id = current_venue_id());

CREATE INDEX idx_iet_incident ON incident_evacuation_triggers(incident_id, triggered_at);

COMMENT ON TABLE incident_evacuation_triggers IS
  'Immutable per-evacuation-decision audit (Hard Rule 4). BR-J selective, BR-K full venue, BR-P log. PA text generation + edit history captured.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. CREATE TABLE incident_action_templates
-- ═══════════════════════════════════════════════════════════════════════════
-- Per (incident_type, sub-type, role, venue/venue-type) tuple. Resolved
-- via 5-step graceful fallback chain (EC-23). One row per template version.
-- Actions stored as JSONB array; each step has instruction_i18n_key.

CREATE TABLE incident_action_templates (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Scope (more specific wins resolution chain):
  --   venue_id NOT NULL → venue-specific override
  --   venue_type NOT NULL → venue-type default
  --   both NULL → global default (mandatory per EC-23)
  venue_id             UUID NULL REFERENCES venues(id) ON DELETE CASCADE,
  venue_type           TEXT NULL,              -- HOSPITAL / MALL / HOTEL / CORPORATE
  -- Match keys
  incident_type        TEXT NOT NULL,          -- FIRE / MEDICAL / SECURITY / EVACUATION / STRUCTURAL / OTHER
  incident_subtype     TEXT NULL,              -- 32-value CHECK; NULL = parent-type fallback
  staff_role           TEXT NOT NULL,          -- SH / DSH / SC / FM / FS / GS / GM / AUDITOR
  -- Versioning
  template_version     INTEGER NOT NULL DEFAULT 1,
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  -- Content (architect §4.3 schema)
  -- actions: [{
  --   order: number,
  --   instruction: string (English fallback),
  --   instruction_i18n_key: string (e.g. "sire.fire.gs.action.close_fire_doors"),
  --   time_target_seconds: number | null,
  --   evidence_type: 'PHOTO' | 'GPS' | 'NOTE' | 'SIGNATURE' | 'VERBAL' | null,
  --   is_mandatory: boolean,
  --   is_life_critical: boolean,
  --   location_scope: 'ASSIGNED_ZONE' | 'FLOOR' | 'BUILDING' | 'VENUE' | 'EXTERNAL'
  -- }]
  actions              JSONB NOT NULL,
  -- Audit
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (venue_id, venue_type, incident_type, incident_subtype, staff_role, template_version)
);
ALTER TABLE incident_action_templates ENABLE ROW LEVEL SECURITY;

-- Read by all venue staff (templates are not venue-PII; resolution chain
-- spans global + venue-type so RLS must permit reads of NULL-venue rows)
CREATE POLICY "template_read_all" ON incident_action_templates
  FOR SELECT
  USING (
    venue_id IS NULL
    OR venue_id = current_setting('app.current_venue_id', TRUE)::UUID
  );

-- Write only by SC Ops (mirrors mig 003 templates_insert pattern on
-- schedule_templates). is_sc_ops() reads app.is_sc_ops session var,
-- which only the SC Ops Console / api admin paths set.
CREATE POLICY "sc_ops_insert" ON incident_action_templates
  FOR INSERT
  WITH CHECK (is_sc_ops());
CREATE POLICY "sc_ops_update" ON incident_action_templates
  FOR UPDATE
  USING (is_sc_ops())
  WITH CHECK (is_sc_ops());
CREATE POLICY "sc_ops_delete" ON incident_action_templates
  FOR DELETE
  USING (is_sc_ops());

CREATE INDEX idx_iat_resolution ON incident_action_templates
  (incident_type, incident_subtype, staff_role, venue_id, venue_type)
  WHERE is_active = TRUE;

COMMENT ON TABLE incident_action_templates IS
  'Per-role action templates per (incident_type, sub-type, scope) tuple. EC-23: 5-step graceful fallback chain. Snapshotted to incidents.resolved_templates at declaration time.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. CREATE TABLE incident_action_assignments
-- ═══════════════════════════════════════════════════════════════════════════
-- Status-aware per-staff action records. One row per (incident, staff, action_order).
-- Created at incident declaration from resolved_templates snapshot.
-- Status enum: ASSIGNED → IN_PROGRESS → DONE / SKIPPED / BLOCKED.
-- Architect §4.3 — replaces single-table model with this two-table approach.

CREATE TABLE incident_action_assignments (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id             UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  incident_id          UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  staff_id             UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  role                 TEXT NOT NULL,
  action_order         INTEGER NOT NULL,
  -- Snapshot from resolved_templates at declaration time (immutable)
  instruction          TEXT NOT NULL,
  instruction_i18n_key TEXT NOT NULL,
  evidence_type        TEXT NULL,           -- PHOTO / GPS / NOTE / SIGNATURE / VERBAL / null
  time_target_seconds  INTEGER NULL,
  is_mandatory         BOOLEAN NOT NULL DEFAULT TRUE,
  is_life_critical     BOOLEAN NOT NULL DEFAULT FALSE,
  -- Status machine
  status               TEXT NOT NULL DEFAULT 'ASSIGNED' CHECK (status IN (
    'ASSIGNED', 'IN_PROGRESS', 'DONE', 'SKIPPED', 'BLOCKED'
  )),
  started_at           TIMESTAMPTZ NULL,    -- Set when status moves to IN_PROGRESS (used by SLA worker)
  completed_at         TIMESTAMPTZ NULL,    -- Set when status moves to DONE/SKIPPED/BLOCKED
  blocked_reason       TEXT NULL,           -- Mandatory when status = BLOCKED
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (incident_id, staff_id, action_order)
);
ALTER TABLE incident_action_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "venue_isolation" ON incident_action_assignments
  FOR ALL
  USING (venue_id = current_setting('app.current_venue_id', TRUE)::UUID);

-- Restrictive: command roles + AUDITOR + GM see all; staff see only own assignments
CREATE POLICY "assignments_role_read_gate" ON incident_action_assignments
  AS RESTRICTIVE
  FOR SELECT
  USING (
    COALESCE(current_setting('app.current_role', TRUE), '') IN
      ('SH', 'DSH', 'FM', 'SHIFT_COMMANDER', 'AUDITOR', 'GM')
    OR staff_id = NULLIF(current_setting('app.current_staff_id', TRUE), '')::UUID
  );

CREATE INDEX idx_iaa_incident ON incident_action_assignments(incident_id, staff_id, status);

-- Partial index for SLA worker query (architect §4.4 + Q6)
CREATE INDEX idx_iaa_pending ON incident_action_assignments(incident_id, status)
  WHERE status IN ('ASSIGNED', 'IN_PROGRESS');

COMMENT ON TABLE incident_action_assignments IS
  'Status-aware action assignments. Created at incident declaration from resolved_templates. Source of truth for "what was assigned + status". Phase 5.21 SLA worker queries idx_iaa_pending partial index.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. CREATE TABLE incident_response_actions
-- ═══════════════════════════════════════════════════════════════════════════
-- Evidence records. One row per DONE action only (not SKIPPED / BLOCKED).
-- Architect §4.3 — separate from assignments table for clean compliance trail.

CREATE TABLE incident_response_actions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id             UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  incident_id          UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  assignment_id        UUID NOT NULL REFERENCES incident_action_assignments(id) ON DELETE CASCADE,
  staff_id             UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  role                 TEXT NOT NULL,
  action_order         INTEGER NOT NULL,
  evidence_type        TEXT NULL,           -- mirror from assignment
  evidence_url         TEXT NULL,           -- S3/GCS path (NULL if photo still uploading)
  evidence_note        TEXT NULL,           -- text note (mandatory if evidence_type = NOTE)
  signature_data       TEXT NULL,           -- base64 for signatures
  gps_latitude         NUMERIC(9,6) NULL,
  gps_longitude        NUMERIC(9,6) NULL,
  photo_upload_pending BOOLEAN NOT NULL DEFAULT FALSE,  -- True while S3 upload in progress
  completed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (incident_id, staff_id, action_order)
);
ALTER TABLE incident_response_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "venue_isolation" ON incident_response_actions
  FOR ALL
  USING (venue_id = current_setting('app.current_venue_id', TRUE)::UUID);

-- Same role-based read filter as assignments
CREATE POLICY "response_actions_role_read_gate" ON incident_response_actions
  AS RESTRICTIVE
  FOR SELECT
  USING (
    COALESCE(current_setting('app.current_role', TRUE), '') IN
      ('SH', 'DSH', 'FM', 'SHIFT_COMMANDER', 'AUDITOR', 'GM')
    OR staff_id = NULLIF(current_setting('app.current_staff_id', TRUE), '')::UUID
  );

CREATE INDEX idx_ira_incident ON incident_response_actions(incident_id, staff_id);

COMMENT ON TABLE incident_response_actions IS
  'Evidence records for completed actions only. Photo URLs may be NULL while background upload is in progress (photo_upload_pending=TRUE).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. CREATE TABLE incident_threshold_configs
-- ═══════════════════════════════════════════════════════════════════════════
-- Forward-compatible 4-column scope schema per architect §4.2:
--   venue_id NOT NULL  → venue-specific (Phase 5.21 active)
--   venue_type NOT NULL → venue-type default (Phase 5.22 active)
--   country NOT NULL    → country default (Phase B active)
--   all NULL            → global default (always active)
-- CONSTRAINT exactly_one_scope: each row defines exactly one tier.

CREATE TABLE incident_threshold_configs (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Scope (exactly ONE of these is non-null per row, OR all NULL = global)
  venue_id                      UUID NULL UNIQUE REFERENCES venues(id) ON DELETE CASCADE,
  venue_type                    TEXT NULL,
  country                       TEXT NULL,
  -- Auto-evacuation suggestion thresholds (BR-L)
  auto_evac_zones_threshold     INTEGER NOT NULL DEFAULT 2,
  auto_evac_window_minutes      INTEGER NOT NULL DEFAULT 3,
  -- Action SLA thresholds (Q6 resolution)
  action_sla_soft_warn_pct      INTEGER NOT NULL DEFAULT 50,
  action_sla_hard_escalate_pct  INTEGER NOT NULL DEFAULT 100,
  -- Evidence retention (architect §4.5; NABH = 3 years)
  evidence_retention_years      INTEGER NOT NULL DEFAULT 3,
  -- Standards reference (display-only; SC Ops reads for reference panel; no runtime effect)
  standards_reference           JSONB NULL,
  -- Audit
  configured_by                 UUID NULL REFERENCES staff(id) ON DELETE SET NULL,
  reason_note                   TEXT NULL,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- CONSTRAINT exactly_one_scope: at most one of venue_id / venue_type / country
  -- (zero non-null = global default; one non-null = scoped override)
  CONSTRAINT exactly_one_scope CHECK (
    (CASE WHEN venue_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN venue_type IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN country IS NOT NULL THEN 1 ELSE 0 END) <= 1
  ),
  CONSTRAINT chk_threshold_min CHECK (
    auto_evac_zones_threshold >= 1
    AND auto_evac_window_minutes >= 1
    AND action_sla_soft_warn_pct BETWEEN 1 AND 200
    AND action_sla_hard_escalate_pct BETWEEN 1 AND 500
    AND evidence_retention_years BETWEEN 1 AND 50
  )
);
ALTER TABLE incident_threshold_configs ENABLE ROW LEVEL SECURITY;

-- Venue staff can read their venue config + global default
CREATE POLICY "venue_or_global_read" ON incident_threshold_configs
  FOR SELECT
  USING (
    venue_id IS NULL  -- global / venue-type / country defaults visible to all
    OR venue_id = current_setting('app.current_venue_id', TRUE)::UUID
  );

-- Write only by SC Ops. Same rationale as incident_action_templates.
CREATE POLICY "sc_ops_insert" ON incident_threshold_configs
  FOR INSERT
  WITH CHECK (is_sc_ops());
CREATE POLICY "sc_ops_update" ON incident_threshold_configs
  FOR UPDATE
  USING (is_sc_ops())
  WITH CHECK (is_sc_ops());
CREATE POLICY "sc_ops_delete" ON incident_threshold_configs
  FOR DELETE
  USING (is_sc_ops());

CREATE INDEX idx_itc_scope ON incident_threshold_configs(venue_id, venue_type, country);

COMMENT ON TABLE incident_threshold_configs IS
  '4-column forward-compatible scope schema: venue_id / venue_type / country / NULL=global. Phase 5.21 resolves 2-tier; Phase 5.22 adds venue_type; Phase B adds country. standards_reference JSONB is display-only.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. CREATE TABLE incident_dashboard_prompts
-- ═══════════════════════════════════════════════════════════════════════════
-- Auto-evacuation suggestion prompts (BR-L). Hard Rule 23: NEVER auto-trigger.
-- is_auto_trigger column is FALSE by design and CHECK-constrained.

CREATE TABLE incident_dashboard_prompts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id          UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  incident_id       UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  prompt_type       TEXT NOT NULL CHECK (prompt_type IN (
    'AUTO_EVAC_SUGGESTION'
    -- Future: 'STRUCTURAL_DEGRADATION', 'COMMS_FAILURE_DETECTED' etc.
  )),
  message           TEXT NOT NULL,
  -- Hard Rule 23: this column is ALWAYS FALSE; CHECK enforces it
  is_auto_trigger   BOOLEAN NOT NULL DEFAULT FALSE CHECK (is_auto_trigger = FALSE),
  -- Trigger metadata (for AUTO_EVAC_SUGGESTION):
  --   {"zones_in_attention": ["uuid1", "uuid2"], "window_minutes": 3, "threshold_zones": 2}
  trigger_metadata  JSONB NULL,
  -- Lifecycle
  dismissed_at      TIMESTAMPTZ NULL,
  dismissed_by      UUID NULL REFERENCES staff(id) ON DELETE SET NULL,
  acted_upon_at     TIMESTAMPTZ NULL,                                  -- SH triggered evac after seeing prompt
  acted_upon_by     UUID NULL REFERENCES staff(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE incident_dashboard_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "venue_isolation" ON incident_dashboard_prompts
  FOR ALL
  USING (venue_id = current_setting('app.current_venue_id', TRUE)::UUID);

-- SH/DSH only — these are command decisions
CREATE POLICY "command_only_read" ON incident_dashboard_prompts
  AS RESTRICTIVE
  FOR SELECT
  USING (
    COALESCE(current_setting('app.current_role', TRUE), '') IN ('SH', 'DSH')
  );

CREATE INDEX idx_idp_incident ON incident_dashboard_prompts(incident_id);

COMMENT ON TABLE incident_dashboard_prompts IS
  'Auto-evacuation suggestion prompts (BR-L). Hard Rule 23: is_auto_trigger=FALSE always (CHECK-constrained). SH must explicitly act; the system never triggers evacuation autonomously.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. CREATE VIEW corp_incident_aggregates
-- ═══════════════════════════════════════════════════════════════════════════
-- Aggregate-only view for CORP-* governance. NO PII (no staff names, no
-- staff_ids, no phone numbers, no visitor records).
--
-- Architect §4.1: WITH (security_invoker = false) so CORP-* users (no
-- app.current_venue_id session) can read base tables. Isolation enforced
-- at the API middleware layer (enforceCorporateScope) + mandatory
-- `corporate_account_id = $1` WHERE clause in every CORP query.
--
-- NOTE on column placeholders:
--   - venues.type is the actual column name; aliased here as `venue_type`
--   - venues.state and venues.country DO NOT EXIST yet (Phase 3 / BR-79
--     international data residency adds them in a future migration). They
--     are emitted as NULL::TEXT placeholders so consuming CORP queries can
--     SELECT them without schema breakage when those columns ship.

CREATE OR REPLACE VIEW corp_incident_aggregates
WITH (security_invoker = false)
AS
SELECT
  i.id                         AS incident_id,
  i.venue_id,
  v.corporate_account_id,
  v.city,
  NULL::TEXT                   AS state,
  NULL::TEXT                   AS country,
  v.type::TEXT                 AS venue_type,
  i.incident_type,
  i.incident_subtype,
  i.severity,
  i.status,
  i.is_drill,
  i.has_sire_data,
  i.building_id,
  b.name                       AS building_name,
  DATE_TRUNC('day', i.declared_at)::DATE AS incident_date,
  i.declared_at,
  i.resolved_at,
  ROUND(
    EXTRACT(EPOCH FROM (i.resolved_at - i.declared_at)) / 60.0, 1
  )                            AS resolution_minutes,
  -- Zone validation aggregate (NO PII)
  COUNT(DISTINCT izs.zone_id)  AS total_zones,
  COUNT(DISTINCT izs.zone_id)
    FILTER (WHERE izs.state IN (
      'ZONE_CLEAR', 'EVACUATION_COMPLETE', 'SH_CONFIRMED_CLEAR'
    ))                         AS validated_zones,
  ROUND(
    COUNT(DISTINCT izs.zone_id) FILTER (
      WHERE izs.state IN ('ZONE_CLEAR', 'EVACUATION_COMPLETE', 'SH_CONFIRMED_CLEAR')
    )::NUMERIC
    / NULLIF(COUNT(DISTINCT izs.zone_id), 0) * 100, 1
  )                            AS zone_validation_rate_pct,
  -- Action completion aggregate (NO PII — counts only)
  COUNT(DISTINCT iaa.id)       AS actions_assigned,
  COUNT(DISTINCT ira.id)       AS actions_completed,
  -- Evacuation aggregate (NO PII — counts only)
  COUNT(DISTINCT iet.id)       AS evacuation_trigger_count,
  MAX(iet.triggered_at)        AS last_evacuation_trigger_at
  -- !! NEVER add: staff names, staff_ids, phone numbers, visitor records !!
FROM incidents i
JOIN venues v ON i.venue_id = v.id
LEFT JOIN buildings b ON i.building_id = b.id
LEFT JOIN incident_zone_states izs ON i.id = izs.incident_id
LEFT JOIN incident_action_assignments iaa ON i.id = iaa.incident_id
LEFT JOIN incident_response_actions ira ON i.id = ira.incident_id
LEFT JOIN incident_evacuation_triggers iet ON i.id = iet.incident_id
GROUP BY
  i.id, i.venue_id, v.corporate_account_id, v.city,
  v.type, i.incident_type, i.incident_subtype, i.severity, i.status,
  i.is_drill, i.has_sire_data, i.building_id, b.name,
  i.declared_at, i.resolved_at;

COMMENT ON VIEW corp_incident_aggregates IS
  'Aggregate-only view for CORP-* governance. WITH security_invoker=false to bypass venue RLS. Isolation enforced at API middleware (enforceCorporateScope) + mandatory corporate_account_id WHERE clause. EC-20 compliant — NO PII.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 11. SEED — global default threshold row (mandatory per EC-23 fallback)
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO incident_threshold_configs (
  venue_id, venue_type, country,
  auto_evac_zones_threshold, auto_evac_window_minutes,
  action_sla_soft_warn_pct, action_sla_hard_escalate_pct,
  evidence_retention_years,
  standards_reference,
  reason_note
) VALUES (
  NULL, NULL, NULL,
  2, 3,         -- ≥2 zones in 3 minutes (NFPA 1620 + AppArmor convergent default)
  50, 100,      -- soft warn at 50% target; hard escalate at 100%
  3,            -- 3 years retention (NABH baseline; per-venue override possible)
  jsonb_build_object(
    'NFPA_101_2024', jsonb_build_object('zone_sweep_small_sec', 180),
    'NFPA_1620', jsonb_build_object('compartment_breach_threshold', 2),
    'NABH_EM_2025', jsonb_build_object('code_blue_response_sec', 180, 'icu_immediate_evac', TRUE),
    'NDMA_FIRE_GUIDELINES_IN', jsonb_build_object('floor_threshold', 2, 'occupant_capacity_pct', 50),
    'TELANGANA_FF3', jsonb_build_object('confirmed_fire_plus_smoke_required', TRUE),
    'BIS_15883', jsonb_build_object('escape_compromise_required', TRUE),
    'MARTYNS_LAW_2025', jsonb_build_object('bomb_threat_no_evacuation', TRUE),
    'TJC_EM', jsonb_build_object('critical_unit_threshold', 1),
    'HICS_5', jsonb_build_object('ic_discretion', TRUE)
  ),
  'Global default — applied to all venues that have no specific override. Aligned with NFPA 1620 + NABH §EM + NDMA Fire Safety Guidelines.'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 12. VERIFICATION (BOTTOM — fail loud if anything missing)
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_table_count    INT;
  v_view_count     INT;
  v_column_count   INT;
  v_threshold_seed INT;
  v_index_count    INT;
BEGIN
  -- Check all 8 new tables exist
  SELECT COUNT(*) INTO v_table_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN (
      'incident_zone_states',
      'incident_zone_state_log',
      'incident_evacuation_triggers',
      'incident_action_templates',
      'incident_action_assignments',
      'incident_response_actions',
      'incident_threshold_configs',
      'incident_dashboard_prompts'
    );

  -- Check the view exists
  SELECT COUNT(*) INTO v_view_count
  FROM information_schema.views
  WHERE table_schema = 'public'
    AND table_name = 'corp_incident_aggregates';

  -- Check the 5 new incidents columns exist
  SELECT COUNT(*) INTO v_column_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'incidents'
    AND column_name IN (
      'incident_subtype', 'is_drill', 'has_sire_data',
      'resolved_templates', 'escalated_from_drill_id'
    );

  -- Check the global default threshold row was seeded
  SELECT COUNT(*) INTO v_threshold_seed
  FROM incident_threshold_configs
  WHERE venue_id IS NULL AND venue_type IS NULL AND country IS NULL;

  -- Check the partial index for SLA worker exists
  SELECT COUNT(*) INTO v_index_count
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND indexname = 'idx_iaa_pending';

  RAISE NOTICE 'mig 014 SIRE verification:';
  RAISE NOTICE '  Tables: % / 8', v_table_count;
  RAISE NOTICE '  View: % / 1', v_view_count;
  RAISE NOTICE '  incidents columns: % / 5', v_column_count;
  RAISE NOTICE '  Global threshold seeded: % / 1', v_threshold_seed;
  RAISE NOTICE '  idx_iaa_pending partial index: % / 1', v_index_count;

  IF v_table_count <> 8 THEN
    RAISE EXCEPTION 'mig 014 verification FAILED: Expected 8 tables, got %', v_table_count;
  END IF;
  IF v_view_count <> 1 THEN
    RAISE EXCEPTION 'mig 014 verification FAILED: Expected 1 view, got %', v_view_count;
  END IF;
  IF v_column_count <> 5 THEN
    RAISE EXCEPTION 'mig 014 verification FAILED: Expected 5 incidents columns, got %', v_column_count;
  END IF;
  IF v_threshold_seed <> 1 THEN
    RAISE EXCEPTION 'mig 014 verification FAILED: Expected 1 global threshold default, got %', v_threshold_seed;
  END IF;
  IF v_index_count <> 1 THEN
    RAISE EXCEPTION 'mig 014 verification FAILED: idx_iaa_pending partial index missing';
  END IF;

  RAISE NOTICE '  All checks PASSED. SIRE schema ready for Phase 5.21 code deploy.';
END $$;
