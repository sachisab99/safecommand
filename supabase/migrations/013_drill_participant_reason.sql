-- Migration 013 — Drill participant non-acknowledgement reason codes
--
-- Phase 5.18 schema additions for ADR 0004 + BR-A "missed-participant logging".
-- Adds reason_code (6-value taxonomy) + reason_notes (free-text with ≥10
-- char minimum when reason_code='OTHER') + audit columns reason_set_by /
-- reason_set_at + RESTRICTIVE RLS policy for role-based row visibility.
--
-- Schema context (from mig 010):
--   - drill_session_participants has venue_id implicit via drill_sessions FK
--   - status enum: NOTIFIED / ACKNOWLEDGED / SAFE_CONFIRMED / MISSED
--   - existing venue_isolation policy uses subquery; we add RESTRICTIVE
--     policy combining via AND for role-based read filtering
--
-- Companion: ADR 0004 + docs/research/drill-participant-reason-taxonomy.md
-- Spec authority refinement: BR-A — implementation detail; spec unchanged.

-- ──────────────────────────────────────────────────────────────────────────
-- Add reason columns

ALTER TABLE drill_session_participants
  ADD COLUMN reason_code   TEXT        NULL,
  ADD COLUMN reason_notes  TEXT        NULL,
  ADD COLUMN reason_set_by UUID        NULL REFERENCES staff(id) ON DELETE SET NULL,
  ADD COLUMN reason_set_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN drill_session_participants.reason_code IS
  'Non-acknowledgement reason. Six codes per ADR 0004: OFF_DUTY / ON_LEAVE / '
  'ON_BREAK / ON_DUTY_ELSEWHERE / DEVICE_OR_NETWORK_ISSUE / OTHER. NULL = '
  'no reason set; counts as unexcused for compliance scoring.';

COMMENT ON COLUMN drill_session_participants.reason_notes IS
  'Free-text reason detail. Required (>=10 chars) when reason_code = OTHER. '
  'Optional but recommended for ON_DUTY_ELSEWHERE and DEVICE_OR_NETWORK_ISSUE '
  '(IT triage feedback loop).';

COMMENT ON COLUMN drill_session_participants.reason_set_by IS
  'Staff member who set this reason. Audit trail; immutable in spirit '
  '(api never overwrites — replacement is INSERT-then-UPDATE-only chain).';

COMMENT ON COLUMN drill_session_participants.reason_set_at IS
  'Timestamp when reason was last set/updated. Audit trail.';

-- ──────────────────────────────────────────────────────────────────────────
-- CHECK constraints

ALTER TABLE drill_session_participants
  ADD CONSTRAINT chk_reason_code_value CHECK (
    reason_code IS NULL OR reason_code IN (
      'OFF_DUTY',
      'ON_LEAVE',
      'ON_BREAK',
      'ON_DUTY_ELSEWHERE',
      'DEVICE_OR_NETWORK_ISSUE',
      'OTHER'
    )
  );

-- OTHER demands a substantive note (>=10 chars after btrim)
ALTER TABLE drill_session_participants
  ADD CONSTRAINT chk_other_requires_notes CHECK (
    reason_code IS DISTINCT FROM 'OTHER'
    OR (reason_notes IS NOT NULL AND length(btrim(reason_notes)) >= 10)
  );

-- All-or-nothing on the audit triplet (reason_code + reason_set_by + reason_set_at)
ALTER TABLE drill_session_participants
  ADD CONSTRAINT chk_reason_consistency CHECK (
    (reason_code IS NULL AND reason_set_by IS NULL AND reason_set_at IS NULL)
    OR (reason_code IS NOT NULL AND reason_set_by IS NOT NULL AND reason_set_at IS NOT NULL)
  );

-- ──────────────────────────────────────────────────────────────────────────
-- RLS — RESTRICTIVE policy adds role-based row filter on top of existing
-- venue_isolation permissive policy. Combined effect (PostgreSQL combines
-- restrictive + permissive policies with AND): row is visible iff
--   row passes venue_isolation (drill_sessions venue_id match)
--   AND row passes role gate (command/auditor see all; others see own).

CREATE POLICY "drill_participant_role_read_gate"
ON drill_session_participants
AS RESTRICTIVE
FOR SELECT
USING (
  -- Command roles + Auditor: full venue read
  COALESCE(current_setting('app.current_role', true), '') IN
    ('SH','DSH','FM','SHIFT_COMMANDER','AUDITOR','GM')
  OR
  -- Other roles see only their own participant row
  staff_id = NULLIF(current_setting('app.current_staff_id', true), '')::uuid
);

COMMENT ON POLICY "drill_participant_role_read_gate" ON drill_session_participants IS
  'ADR 0004 — Phase 5.18. Per-staff drill timing data is potentially HR-'
  'sensitive. Command roles (SH/DSH/SHIFT_COMMANDER/FM) + AUDITOR + GM see '
  'all participants in their venue; other roles (FLOOR_SUPERVISOR / '
  'GROUND_STAFF) see only their own participant row. Cross-venue access is '
  'separately blocked by the existing venue_isolation policy.';

-- ──────────────────────────────────────────────────────────────────────────
-- Index for "active drills for me" mobile drawer-banner query
-- (Phase 5.18 GET /v1/drill-sessions/active-for-me hits this hot path)

CREATE INDEX IF NOT EXISTS idx_drill_session_participants_staff_session
  ON drill_session_participants (staff_id, drill_session_id);

-- ──────────────────────────────────────────────────────────────────────────
-- Verification (informational; runs as part of migration; doesn't fail on
-- empty table — drill_session_participants has 0 rows pre-Phase-5.18).

DO $$
DECLARE
  reason_col_count INT;
  policy_count     INT;
BEGIN
  SELECT COUNT(*) INTO reason_col_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'drill_session_participants'
    AND column_name IN ('reason_code', 'reason_notes', 'reason_set_by', 'reason_set_at');

  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename  = 'drill_session_participants'
    AND policyname = 'drill_participant_role_read_gate';

  RAISE NOTICE 'mig 013 verification: % reason columns added (expected 4); % role-gate policy (expected 1)',
    reason_col_count, policy_count;

  IF reason_col_count <> 4 OR policy_count <> 1 THEN
    RAISE EXCEPTION 'mig 013 partial: columns=%, policies=%', reason_col_count, policy_count;
  END IF;
END $$;
