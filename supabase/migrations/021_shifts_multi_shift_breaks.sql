-- =================================================================
-- MIGRATION 021 — Multi-Shift Flexibility (BR-AR pull-forward)
--
-- Spec source: SafeCommand Shift Roster Architecture v1.0 §5.1 (Forge,
--   2026-05-20). BR-AR pull-forward per the Shift Roster Requirements
--   v1.1 §13 + the architecture doc §3 "BR-AR Pull-Forward Specification."
--   Wave 1 of the Phase 5.24 shift-roster wave; the full pattern engine
--   (BR-AK / AL / AM / AN / AO / AP / AQ / AS / AT / AU) ships in
--   migrations 022 + 023 in Phase 5.24 (Q1 2028 per the architecture).
--
-- File number = 021 (next free integer per ADR 0001 invariant). Spec
-- documents originally proposed "Migration 024" — superseded by the
-- repo-authority numbering principle (see ADR 0001 2026-05-20 amendment).
-- Mig 020 was consumed by the §23 standards-closure P1 pull-forward on
-- 2026-05-19 (Safety Committee / AMC / MSDS).
--
-- Covers BR-AR (multi-shift flexibility) — founder-specified:
--   "complete flexibility to create shifts more than 1 with custom fields
--    to define shift start and end times along with breaks (breaks should
--    be optional) also appropriate assignments to facilitate handovers."
--
-- PURELY ADDITIVE: 5 new columns on shifts + 1 CHECK + 1 index +
-- verification block. No new tables, no views (Hard Rule 25 N/A), no FK
-- to undeployed objects (no mig-009 or mig-022 dependency). All existing
-- shift rows auto-receive backwards-compatible defaults:
--   breaks               = '[]'::jsonb   (no breaks defined)
--   min_handover_minutes = 15            (matches current hardcoded value)
--   description          = NULL
--   is_overnight         = (end_time < start_time)  (GENERATED ALWAYS)
--   venue_type_default   = FALSE
-- → bit-identical behaviour to today.
--
-- HARD RULE 24: this migration MUST be applied + verified BEFORE any
-- code reads `shifts.min_handover_minutes` (the BR-12 internal refactor
-- in `services/handover-notification.ts`). Apply method (founder, same
-- SIRE-Day-1 / §23 pattern):
--   psql "<supabase session-pooler url>" --single-transaction \
--        -v ON_ERROR_STOP=1 \
--        -f supabase/migrations/021_shifts_multi_shift_breaks.sql
-- Expected: NOTICE 'Migration 021 PASSED: shifts extended with 5 columns;
-- is_overnight is GENERATED'.
-- =================================================================

BEGIN;

ALTER TABLE shifts
  ADD COLUMN breaks JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN min_handover_minutes INT NOT NULL DEFAULT 15
    CHECK (min_handover_minutes BETWEEN 0 AND 60),
  ADD COLUMN description TEXT,
  ADD COLUMN is_overnight BOOLEAN
    GENERATED ALWAYS AS (end_time < start_time) STORED,
  ADD COLUMN venue_type_default BOOLEAN NOT NULL DEFAULT FALSE;

-- Refinement #7 (Forge): is_overnight is GENERATED ALWAYS AS STORED.
-- Postgres maintains the column from start_time/end_time on every write.
-- No app code or trigger needed; cannot be manually overridden. STORED
-- (vs VIRTUAL) materialises on disk → fast indexed reads.

-- Structural CHECK on breaks — array only. Element-level validation
-- (presence of start_time/end_time/label, HH:MM format, within-window,
-- non-overlap) is deliberately in the app layer (matches the existing
-- pattern used for activity_templates.frequency_config; nested JSONB
-- structural CHECKs are brittle and hard to evolve).
ALTER TABLE shifts ADD CONSTRAINT chk_breaks_valid_json
  CHECK (jsonb_typeof(breaks) = 'array');

-- Hot-path index for the future Phase 5.24 materialisation worker
-- (BR-AO) — overnight shifts need special handover treatment.
CREATE INDEX idx_shifts_overnight
  ON shifts (venue_id, is_overnight) WHERE is_overnight = TRUE;

-- Verification (Hard Rule 24 satisfaction)
DO $$
DECLARE
  v_col_count INT;
BEGIN
  SELECT COUNT(*) INTO v_col_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'shifts'
    AND column_name IN ('breaks','min_handover_minutes','description',
                        'is_overnight','venue_type_default');
  IF v_col_count < 5 THEN
    RAISE EXCEPTION 'Migration 021 FAILED: Expected 5 new columns on shifts, found %', v_col_count;
  END IF;

  -- Verify is_overnight is correctly GENERATED ALWAYS (not just a regular column)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shifts'
      AND column_name = 'is_overnight'
      AND is_generated = 'ALWAYS'
  ) THEN
    RAISE EXCEPTION 'Migration 021 FAILED: is_overnight is not GENERATED ALWAYS';
  END IF;

  RAISE NOTICE 'Migration 021 PASSED: shifts extended with 5 columns; is_overnight is GENERATED';
END $$;

COMMIT;
