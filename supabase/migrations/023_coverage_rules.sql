-- =================================================================
-- MIGRATION 023 — Coverage Rules (BR-AQ, Phase 5.24 wave 2)
--
-- Spec source: SafeCommand Shift Roster Architecture v1.0 §5.8
--   (Forge, 2026-05-20). Covers BR-AQ: per-(building, zone, role, shift)
--   minimum-staffing rules with pre-publish gap validation + post-
--   publish gap alerts. Companion migration to 022 (roster engine).
--
-- File number = 023 (next free integer per ADR 0001 invariant).
-- Depends on mig 001 (staff_role_enum) + mig 002 (zones, shifts) +
-- mig 022 (roster engine — the coverage engine validates published
-- patterns from there).
--
-- HARD RULE 24: this migration MUST be applied + verified BEFORE any
-- coverage-rule API/engine code deploys. Apply method (founder, same
-- SIRE-Day-1 / §23 / mig 021 / mig 022 pattern):
--   psql "<supabase session-pooler url>" --single-transaction \
--        -v ON_ERROR_STOP=1 \
--        -f supabase/migrations/023_coverage_rules.sql
--
-- PRE-DEPLOY ADAPTATIONS (same as mig 020 / 021 / 022):
--
-- 1. building_id + building_visible() OMITTED — v9.1 §5.8 references
--    buildings(id) (mig 009 — PENDING Phase B, NOT deployed). Per
--    EC-16 + NFR-25, deferred to the MBV-era migration. The unique
--    constraint also drops building_id; expanded additively post-MBV.
--
-- 2. UNIQUE NULLS NOT DISTINCT (Postgres 15+) — Supabase prod runs
--    PG15+; if applied to an older Postgres, this syntax would error
--    at parse. Safe for current deploy.
--
-- PURELY ADDITIVE: 1 new table + RLS + 2 indexes + verification.
-- No views (Rule 25 N/A). No existing tables modified.
-- =================================================================

BEGIN;

CREATE TABLE coverage_rules (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id     UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  zone_id      UUID REFERENCES zones(id),       -- nullable; null = building-wide
  -- ★ Refinement #3: ENUM reference from mig 001 (replaces free TEXT)
  role_code    staff_role_enum,                  -- nullable = any role
  shift_id     UUID REFERENCES shifts(id),       -- nullable = any shift

  min_staff    INT NOT NULL CHECK (min_staff >= 1),

  priority     TEXT NOT NULL DEFAULT 'MANDATORY' CHECK (priority IN
                 ('MANDATORY','WARNING')),

  -- Standards basis (documentation; not query-critical)
  standards_basis TEXT[],

  created_by   UUID REFERENCES staff(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Prevent duplicate rules for the same scope (PG15+ syntax).
  -- (building_id omitted pre-MBV — restored when mig-009-family
  -- additively adds the column; the unique key expands accordingly.)
  UNIQUE NULLS NOT DISTINCT (venue_id, zone_id, role_code, shift_id)
);

ALTER TABLE coverage_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "venue_isolation" ON coverage_rules
  USING (venue_id = current_setting('app.current_venue_id', TRUE)::UUID);

-- Coverage validation engine hot path (resolve rules for a specific scope)
CREATE INDEX idx_coverage_rules_lookup ON coverage_rules
  (venue_id, zone_id, shift_id);

-- Pre-publish "all mandatory rules" scan
CREATE INDEX idx_coverage_rules_mandatory ON coverage_rules
  (venue_id, priority) WHERE priority = 'MANDATORY';

-- Verification (Hard Rule 24 satisfaction)
DO $$
DECLARE
  v_table_exists BOOLEAN;
  v_rls_enabled BOOLEAN;
  v_unique_exists INT;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'coverage_rules'
  ) INTO v_table_exists;
  IF NOT v_table_exists THEN
    RAISE EXCEPTION 'Migration 023 FAILED: coverage_rules table missing';
  END IF;

  SELECT rowsecurity INTO v_rls_enabled
  FROM pg_tables WHERE schemaname = 'public' AND tablename = 'coverage_rules';
  IF NOT v_rls_enabled THEN
    RAISE EXCEPTION 'Migration 023 FAILED: RLS not enabled on coverage_rules';
  END IF;

  -- Confirm the role_code column uses staff_role_enum (Refinement #3)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'coverage_rules' AND column_name = 'role_code'
      AND udt_name = 'staff_role_enum'
  ) THEN
    RAISE EXCEPTION 'Migration 023 FAILED: role_code is not staff_role_enum';
  END IF;

  -- Confirm the UNIQUE constraint is present
  SELECT COUNT(*) INTO v_unique_exists
  FROM pg_constraint
  WHERE conrelid = 'public.coverage_rules'::regclass
    AND contype = 'u';
  IF v_unique_exists < 1 THEN
    RAISE EXCEPTION 'Migration 023 FAILED: UNIQUE constraint missing on coverage_rules';
  END IF;

  RAISE NOTICE 'Migration 023 PASSED: coverage_rules table with RLS + staff_role_enum + UNIQUE scope';
END $$;

COMMIT;
