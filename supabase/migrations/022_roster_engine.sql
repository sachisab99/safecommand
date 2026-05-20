-- =================================================================
-- MIGRATION 022 — Roster Engine (Phase 5.24 wave 2)
--
-- Spec source: SafeCommand Shift Roster Architecture v1.0 §5.2–§5.7
--   (Forge, 2026-05-20). Covers BR-AK (roster_patterns) + BR-AL
--   (per-staff working/weekly-off cfg on staff_roster_assignments) +
--   BR-AM (rotation_cycle_library + 7 seeded rotations) + BR-AN
--   (staff_unavailability with btree_gist EXCLUDE) + BR-AP
--   (shift_swap_requests with in-row state + audit_logs precedent) +
--   the queryable roster_cycle_positions child (★ Refinement #1).
--
-- File number = 022 (next free integer per ADR 0001 invariant).
-- Companion migration 023 follows with coverage_rules (BR-AQ).
--
-- HARD RULE 24: this migration MUST be applied + verified BEFORE any
-- code that reads/writes the new tables deploys. Apply method (founder,
-- same SIRE-Day-1 / §23 / mig 021 pattern):
--   psql "<supabase session-pooler url>" --single-transaction \
--        -v ON_ERROR_STOP=1 \
--        -f supabase/migrations/022_roster_engine.sql
-- Expected: NOTICE 'Migration 022 PASSED'.
--
-- PRE-DEPLOY ADAPTATIONS (parallels §23 mig 020 + BR-AR mig 021 fixes):
--
-- 1. building_id + building_visible() OMITTED from roster_patterns,
--    staff_roster_assignments. v9.1 §5.2/§5.4 reference `buildings(id)`
--    and `building_visible()` (mig 009 — PENDING Phase B, NOT deployed).
--    Referencing them would fail at apply. Per EC-16 (building_id always
--    nullable; NULL = venue-wide) + NFR-25 (pre-MBV = single-building =
--    building scoping is a no-op), they are deferred to the MBV-era
--    migration (009 family) which additively ADD COLUMNs + refreshes
--    RLS — the established pattern.
--
-- 2. shift_swap_requests.original_assignment_id +
--    counterpart_assignment_id reference `staff_zone_assignments(id)`
--    (our actual deployed table — mig 002) NOT the spec's
--    `shift_assignments(id)`. This is Reconciliation Flag #4: the spec
--    used a logical name; the deployed table is staff_zone_assignments.
--    The semantic intent (the swap operates on a staff-shift assignment
--    row) is preserved. If a separate `shift_assignments` abstraction
--    is later introduced by the pattern engine code passes, a future
--    additive migration can extend the swap-request FK accordingly.
--
-- 3. btree_gist extension is CREATE-IF-NOT-EXISTS at the top — required
--    for the staff_unavailability EXCLUDE constraint that prevents
--    overlapping APPROVED unavailability rows for the same staff at the
--    database layer (★ Refinement #6).
--
-- PURELY ADDITIVE: 6 new tables + 1 extension + RLS + indexes +
-- 7-row seed of rotation_cycle_library + verification. No views (Rule
-- 25 N/A; the global rotation_cycle_library is a TABLE with anon
-- REVOKE for the same defence-in-depth intent). No existing tables
-- modified.
-- =================================================================

BEGIN;

-- Required for staff_unavailability's EXCLUDE constraint (gist over UUID + daterange)
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- =================================================================
-- 5.5 rotation_cycle_library — global, read-only library of rotation patterns (BR-AM)
-- Created FIRST so roster_patterns.rotation_pattern_code FK resolves.
-- =================================================================
CREATE TABLE rotation_cycle_library (
  code              TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  description       TEXT,
  cycle_length_days INT NOT NULL CHECK (cycle_length_days BETWEEN 1 AND 60),
  -- Ordered array of {position, shift_slot} where shift_slot is
  -- 'AM' | 'PM' | 'NIGHT' | 'OFF'.
  day_pattern       JSONB NOT NULL,
  is_built_in       BOOLEAN NOT NULL DEFAULT FALSE,
  factories_act_compliant BOOLEAN,
  standards_basis   TEXT[] DEFAULT ARRAY[]::TEXT[],
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Library is global (no RLS); defence-in-depth: anon CANNOT read direct,
-- authenticated reads only (the same Rule-25 / mig-016 spirit applied
-- to a global TABLE — the rotation library carries no tenant data but
-- shouldn't leak to anon).
REVOKE ALL PRIVILEGES ON TABLE rotation_cycle_library FROM anon;
GRANT SELECT ON TABLE rotation_cycle_library TO authenticated;
GRANT ALL ON TABLE rotation_cycle_library TO service_role;

-- Seed 7 built-in rotations (BR-AM spec §4 + Architecture v1 §5.5)
INSERT INTO rotation_cycle_library (code, name, description, cycle_length_days,
                                    day_pattern, is_built_in,
                                    factories_act_compliant, standards_basis) VALUES
  ('4_ON_2_OFF', '4-on-2-off',
   'Four working days followed by two off-days. Common in manufacturing and healthcare general operations.',
   6,
   '[{"position":0,"shift_slot":"AM"},{"position":1,"shift_slot":"AM"},
     {"position":2,"shift_slot":"AM"},{"position":3,"shift_slot":"AM"},
     {"position":4,"shift_slot":"OFF"},{"position":5,"shift_slot":"OFF"}]'::jsonb,
   TRUE, TRUE,
   ARRAY['Factories Act §52', 'NABH HRM.4.a']),

  ('2_2_3', 'Pitman (2-2-3)',
   'Pitman schedule: 2-on-2-off-3-on, then 3-on-2-off-2-on, 14-day cycle. Common for 12-hour shifts.',
   14,
   '[{"position":0,"shift_slot":"AM"},{"position":1,"shift_slot":"AM"},
     {"position":2,"shift_slot":"OFF"},{"position":3,"shift_slot":"OFF"},
     {"position":4,"shift_slot":"AM"},{"position":5,"shift_slot":"AM"},
     {"position":6,"shift_slot":"AM"},{"position":7,"shift_slot":"OFF"},
     {"position":8,"shift_slot":"OFF"},{"position":9,"shift_slot":"AM"},
     {"position":10,"shift_slot":"AM"},{"position":11,"shift_slot":"OFF"},
     {"position":12,"shift_slot":"OFF"},{"position":13,"shift_slot":"OFF"}]'::jsonb,
   TRUE, TRUE,
   ARRAY['PSARA 2005', 'NABH HRM.4.a']),

  ('WEEKLY_DAY_NIGHT', 'Weekly day↔night swap',
   'Weekly rotation between day and night shifts. Continental shift workers.',
   7,
   '[{"position":0,"shift_slot":"AM"},{"position":1,"shift_slot":"AM"},
     {"position":2,"shift_slot":"AM"},{"position":3,"shift_slot":"AM"},
     {"position":4,"shift_slot":"AM"},{"position":5,"shift_slot":"AM"},
     {"position":6,"shift_slot":"OFF"}]'::jsonb,
   TRUE, TRUE,
   ARRAY['Factories Act §52']),

  ('CONTINENTAL', 'Continental 5-2 / 5-3',
   'Five working days with two-then-three off; industrial 24×7 baseline.',
   7,
   '[{"position":0,"shift_slot":"AM"},{"position":1,"shift_slot":"AM"},
     {"position":2,"shift_slot":"AM"},{"position":3,"shift_slot":"AM"},
     {"position":4,"shift_slot":"AM"},{"position":5,"shift_slot":"OFF"},
     {"position":6,"shift_slot":"OFF"}]'::jsonb,
   TRUE, TRUE,
   ARRAY['Factories Act §52']),

  ('4_DAY_NIGHT_4_OFF', '4 day · 4 night · 4 off',
   'Common Indian private-security 12-day rotation: 4 days, 4 nights, 4 off.',
   12,
   '[{"position":0,"shift_slot":"AM"},{"position":1,"shift_slot":"AM"},
     {"position":2,"shift_slot":"AM"},{"position":3,"shift_slot":"AM"},
     {"position":4,"shift_slot":"NIGHT"},{"position":5,"shift_slot":"NIGHT"},
     {"position":6,"shift_slot":"NIGHT"},{"position":7,"shift_slot":"NIGHT"},
     {"position":8,"shift_slot":"OFF"},{"position":9,"shift_slot":"OFF"},
     {"position":10,"shift_slot":"OFF"},{"position":11,"shift_slot":"OFF"}]'::jsonb,
   TRUE, TRUE,
   ARRAY['PSARA 2005']),

  ('STANDARD_OFFICE', 'Mon-Fri office (5-day)',
   'Standard corporate office: Monday–Friday day shift, Saturday + Sunday off.',
   7,
   '[{"position":0,"shift_slot":"OFF"},{"position":1,"shift_slot":"AM"},
     {"position":2,"shift_slot":"AM"},{"position":3,"shift_slot":"AM"},
     {"position":4,"shift_slot":"AM"},{"position":5,"shift_slot":"AM"},
     {"position":6,"shift_slot":"OFF"}]'::jsonb,
   TRUE, TRUE,
   ARRAY['State Shops & Establishments Acts']),

  ('STANDARD_6_DAY', 'Mon-Sat 6-day',
   'Indian commercial baseline: 6-day working week, Sunday off.',
   7,
   '[{"position":0,"shift_slot":"OFF"},{"position":1,"shift_slot":"AM"},
     {"position":2,"shift_slot":"AM"},{"position":3,"shift_slot":"AM"},
     {"position":4,"shift_slot":"AM"},{"position":5,"shift_slot":"AM"},
     {"position":6,"shift_slot":"AM"}]'::jsonb,
   TRUE, TRUE,
   ARRAY['Factories Act §52', 'State Shops & Establishments Acts']);

-- =================================================================
-- 5.2 roster_patterns (BR-AK)
-- (★ building_id + building_visible() OMITTED pre-MBV — adaptation #1)
-- =================================================================
CREATE TABLE roster_patterns (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id              UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  cycle_type            TEXT NOT NULL CHECK (cycle_type IN
                          ('WEEKLY','BIWEEKLY','N_WEEK_ROTATION','CUSTOM_DAYS')),
  cycle_length_days     INT NOT NULL CHECK (cycle_length_days BETWEEN 1 AND 60),
  -- ★ Refinement #2: FK to rotation_cycle_library
  rotation_pattern_code TEXT REFERENCES rotation_cycle_library(code),
  effective_from        DATE NOT NULL,
  effective_to          DATE,
  status                TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN
                          ('DRAFT','PUBLISHED','SUSPENDED','ARCHIVED')),
  published_at          TIMESTAMPTZ,
  published_by_staff_id UUID REFERENCES staff(id),
  signed_off_at         TIMESTAMPTZ,
  signed_off_by_staff_id UUID REFERENCES staff(id),
  created_by            UUID REFERENCES staff(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_effective_dates
    CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CONSTRAINT chk_publish_state
    CHECK (status != 'PUBLISHED' OR
           (published_at IS NOT NULL AND published_by_staff_id IS NOT NULL))
);
ALTER TABLE roster_patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "venue_isolation" ON roster_patterns
  USING (venue_id = current_setting('app.current_venue_id', TRUE)::UUID);

CREATE INDEX idx_roster_patterns_active
  ON roster_patterns(venue_id, status, effective_from, effective_to)
  WHERE status = 'PUBLISHED';

-- =================================================================
-- 5.3 roster_cycle_positions — queryable child of roster_patterns (★ Refinement #1)
-- =================================================================
CREATE TABLE roster_cycle_positions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id        UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  pattern_id      UUID NOT NULL REFERENCES roster_patterns(id) ON DELETE CASCADE,
  staff_id        UUID NOT NULL REFERENCES staff(id),
  cycle_position  INT NOT NULL CHECK (cycle_position >= 0),
  shift_id        UUID REFERENCES shifts(id),  -- NULL = staff is off on this position
  UNIQUE(pattern_id, staff_id, cycle_position)
);
ALTER TABLE roster_cycle_positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "venue_isolation" ON roster_cycle_positions
  USING (venue_id = current_setting('app.current_venue_id', TRUE)::UUID);

-- Hot path index: materialisation worker queries
CREATE INDEX idx_cycle_positions_lookup
  ON roster_cycle_positions(pattern_id, cycle_position, staff_id);
CREATE INDEX idx_cycle_positions_staff
  ON roster_cycle_positions(pattern_id, staff_id, cycle_position);

-- =================================================================
-- 5.4 staff_roster_assignments — per-staff working cfg (BR-AK + BR-AL)
-- (★ building_id + building_visible() OMITTED pre-MBV — adaptation #1)
-- =================================================================
CREATE TABLE staff_roster_assignments (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id                 UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  pattern_id               UUID NOT NULL REFERENCES roster_patterns(id) ON DELETE CASCADE,
  staff_id                 UUID NOT NULL REFERENCES staff(id),
  default_zone_assignments JSONB,
  weekly_off_pattern       TEXT NOT NULL DEFAULT 'FIXED' CHECK (weekly_off_pattern IN
                             ('FIXED','ROTATING_WEEKLY','ROTATING_WITH_CYCLE')),
  weekly_off_day           INT CHECK (weekly_off_day BETWEEN 0 AND 6),
  weekly_max_hours         INT NOT NULL DEFAULT 48
    CHECK (weekly_max_hours BETWEEN 1 AND 84),
  daily_max_hours          INT NOT NULL DEFAULT 9
    CHECK (daily_max_hours BETWEEN 1 AND 16),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(pattern_id, staff_id)
);
ALTER TABLE staff_roster_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "venue_isolation" ON staff_roster_assignments
  USING (venue_id = current_setting('app.current_venue_id', TRUE)::UUID);

CREATE INDEX idx_sra_staff ON staff_roster_assignments(staff_id, pattern_id);

-- =================================================================
-- 5.6 staff_unavailability — leave / unavailability calendar (BR-AN)
-- (★ Refinement #6: gist EXCLUDE prevents overlapping APPROVED rows)
-- =================================================================
CREATE TABLE staff_unavailability (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id              UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  staff_id              UUID NOT NULL REFERENCES staff(id),
  unavailable_from      DATE NOT NULL,
  unavailable_to        DATE NOT NULL CHECK (unavailable_to >= unavailable_from),
  -- Aligned with docs/adr/0004 drill-reason-codes (★ Reconciliation Flag #1 fix)
  unavailability_type   TEXT NOT NULL CHECK (unavailability_type IN
                          ('LEAVE_ANNUAL','LEAVE_SICK','LEAVE_TRAINING',
                           'LEAVE_PERSONAL','OFF_DUTY','SUSPENDED')),
  reason_text           TEXT,
  requested_by_staff_id UUID REFERENCES staff(id),
  approved_by_staff_id  UUID REFERENCES staff(id),
  approved_at           TIMESTAMPTZ,
  status                TEXT NOT NULL DEFAULT 'REQUESTED' CHECK (status IN
                          ('REQUESTED','APPROVED','REJECTED','WITHDRAWN')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- ★ Refinement #6: predicated EXCLUDE — two APPROVED rows for the same
  -- staff with overlapping date ranges fail at write. REQUESTED/REJECTED/
  -- WITHDRAWN rows can freely coexist.
  EXCLUDE USING gist (
    staff_id WITH =,
    daterange(unavailable_from, unavailable_to, '[]') WITH &&
  ) WHERE (status = 'APPROVED')
);
ALTER TABLE staff_unavailability ENABLE ROW LEVEL SECURITY;
CREATE POLICY "venue_isolation" ON staff_unavailability
  USING (venue_id = current_setting('app.current_venue_id', TRUE)::UUID);

-- Materialisation worker hot path: "is this staff unavailable on this date?"
CREATE INDEX idx_unavail_lookup ON staff_unavailability
  (venue_id, staff_id, unavailable_from, unavailable_to)
  WHERE status = 'APPROVED';
-- SH approve queue
CREATE INDEX idx_unavail_queue ON staff_unavailability
  (venue_id, status, created_at DESC)
  WHERE status = 'REQUESTED';

-- =================================================================
-- 5.7 shift_swap_requests — staff-initiated swap workflow (BR-AP)
-- (★ Adaptation #2: original/counterpart_assignment_id reference
--  staff_zone_assignments(id) — our actual deployed table, NOT the
--  spec's logical "shift_assignments". Semantic intent preserved.)
-- =================================================================
CREATE TABLE shift_swap_requests (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id                  UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  requester_staff_id        UUID NOT NULL REFERENCES staff(id),
  counterpart_staff_id      UUID REFERENCES staff(id),  -- NULL for DROP
  original_assignment_id    UUID NOT NULL REFERENCES staff_zone_assignments(id),
  counterpart_assignment_id UUID REFERENCES staff_zone_assignments(id),  -- NULL except SWAP
  swap_type                 TEXT NOT NULL CHECK (swap_type IN ('SWAP','COVER','DROP')),
  reason_text               TEXT,
  -- In-row state machine (★ Refinement #4: drill_session_participants
  -- precedent — state transitions are in-row UPDATEs; every transition
  -- writes an audit_logs row keyed on resource_type='shift_swap_request'
  -- + resource_id. Provides full audit without exploding row count.)
  state                     TEXT NOT NULL DEFAULT 'REQUESTED' CHECK (state IN
                              ('REQUESTED','COUNTERPART_ACCEPTED','APPROVED',
                               'REJECTED','DECLINED','WITHDRAWN')),
  requested_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  counterpart_responded_at  TIMESTAMPTZ,
  supervisor_decided_at     TIMESTAMPTZ,
  supervisor_staff_id       UUID REFERENCES staff(id),
  -- Swap type integrity (SWAP needs counterpart+counterpart_assignment;
  -- COVER needs counterpart only; DROP needs neither)
  CONSTRAINT chk_swap_counterpart
    CHECK (
      (swap_type = 'DROP'  AND counterpart_staff_id IS NULL AND counterpart_assignment_id IS NULL)
      OR (swap_type = 'COVER' AND counterpart_staff_id IS NOT NULL AND counterpart_assignment_id IS NULL)
      OR (swap_type = 'SWAP'  AND counterpart_staff_id IS NOT NULL AND counterpart_assignment_id IS NOT NULL)
    )
);
ALTER TABLE shift_swap_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "venue_isolation" ON shift_swap_requests
  USING (venue_id = current_setting('app.current_venue_id', TRUE)::UUID);

-- ★ Refinement #5: only one active swap per assignment (race prevention)
CREATE UNIQUE INDEX idx_swap_active_per_assignment
  ON shift_swap_requests(original_assignment_id)
  WHERE state IN ('REQUESTED','COUNTERPART_ACCEPTED','APPROVED');

-- SH approve queue + staff "my swaps" views
CREATE INDEX idx_swap_queue ON shift_swap_requests
  (venue_id, state, requested_at DESC)
  WHERE state IN ('REQUESTED','COUNTERPART_ACCEPTED');
CREATE INDEX idx_swap_by_requester ON shift_swap_requests
  (requester_staff_id, requested_at DESC);
CREATE INDEX idx_swap_by_counterpart ON shift_swap_requests
  (counterpart_staff_id, requested_at DESC)
  WHERE counterpart_staff_id IS NOT NULL;

-- =================================================================
-- Verification (Hard Rule 24 satisfaction)
-- =================================================================
DO $$
DECLARE
  v_table_count INT;
  v_rls_count INT;
  v_rotation_seed_count INT;
  v_btree_gist_present INT;
BEGIN
  SELECT COUNT(*) INTO v_table_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('rotation_cycle_library','roster_patterns',
                       'roster_cycle_positions','staff_roster_assignments',
                       'staff_unavailability','shift_swap_requests');
  IF v_table_count < 6 THEN
    RAISE EXCEPTION 'Migration 022 FAILED: Expected 6 tables, found %', v_table_count;
  END IF;

  -- 5 tables RLS-enabled (rotation_cycle_library is intentionally global, no RLS)
  SELECT COUNT(*) INTO v_rls_count
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename IN ('roster_patterns','roster_cycle_positions',
                      'staff_roster_assignments','staff_unavailability',
                      'shift_swap_requests')
    AND rowsecurity = TRUE;
  IF v_rls_count < 5 THEN
    RAISE EXCEPTION 'Migration 022 FAILED: RLS not enabled on all 5 tenant tables (found %)', v_rls_count;
  END IF;

  -- rotation_cycle_library seed
  SELECT COUNT(*) INTO v_rotation_seed_count
  FROM rotation_cycle_library WHERE is_built_in = TRUE;
  IF v_rotation_seed_count < 7 THEN
    RAISE EXCEPTION 'Migration 022 FAILED: Expected 7 seeded rotations, found %', v_rotation_seed_count;
  END IF;

  -- btree_gist extension (needed for staff_unavailability EXCLUDE)
  SELECT COUNT(*) INTO v_btree_gist_present
  FROM pg_extension WHERE extname = 'btree_gist';
  IF v_btree_gist_present < 1 THEN
    RAISE EXCEPTION 'Migration 022 FAILED: btree_gist extension missing';
  END IF;

  RAISE NOTICE 'Migration 022 PASSED: 6 tables (5 tenant-RLS + 1 global), 7 seeded rotations, btree_gist ready';
END $$;

COMMIT;
