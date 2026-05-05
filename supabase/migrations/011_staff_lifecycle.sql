-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 011 — Staff lifecycle (Phase B, June 2026)
--
-- Replaces the binary `staff.is_active` toggle with a 4-state lifecycle
-- enum that captures the WHY behind a staff member's current operational
-- state. Required for safety-infrastructure audit posture (NFR-17 audit
-- immutability, EC-10 append-only) and for Phase B BR-22 (cert tracker
-- pause notifications during ON_LEAVE).
--
-- Industry-standard pattern: 4 lifecycle states with required reason +
-- audit trail per transition. Used by Workday / BambooHR / Personio /
-- Rippling / Sapling.
--
-- States:
--   ACTIVE      — working; receives task notifications; counts on rosters
--   SUSPENDED   — temporary block (investigation, training, no-show)
--                 reversible to ACTIVE
--   ON_LEAVE    — planned absence (vacation, medical, parental)
--                 reversible to ACTIVE; can have planned return date
--   TERMINATED  — permanent exit (resigned, fired)
--                 ⚠ NEVER reversible per audit / compliance — must create
--                 new staff row if person returns. Prevents wrongful-
--                 termination cover-up via silent reactivation.
--
-- Backward compat: `is_active` becomes a generated computed column
-- (TRUE iff lifecycle_status='ACTIVE'). All existing code reading
-- staff.is_active continues to work — including api `requireRole`
-- middleware, mobile staff list, dashboard staff page.
--
-- ⚠ STATUS: Written 2026-05-05 on safecommand_v7. NOT YET DEPLOYED.
--           Applies during Phase B June unfreeze AFTER migration 010.
--           Coupled code change: ops-console + api endpoints split into
--           suspend/markOnLeave/terminate/reactivate per docs/api/
--           conventions.md §19.
--
-- Refs: NFR-17 (audit immutability), EC-10 (audit append-only), Rule 4
-- Refs: Phase B BR-22 (cert expiry warning on shift activation —
--       suppressed for ON_LEAVE staff)
-- Refs: docs/api/conventions.md §19 (staff lifecycle pattern)
-- Refs: ADR 0001 (migration renumbering — repo offset +2 from spec)
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── Step 1: lifecycle status enum ──────────────────────────────────────────

CREATE TYPE staff_lifecycle_status_enum AS ENUM (
  'ACTIVE',
  'SUSPENDED',
  'ON_LEAVE',
  'TERMINATED'
);

-- ─── Step 2: lifecycle columns on staff ────────────────────────────────────
-- All four columns nullable / defaulted for additivity. Existing rows are
-- backfilled in step 4 based on current is_active value.

ALTER TABLE staff
  ADD COLUMN lifecycle_status         staff_lifecycle_status_enum,
  ADD COLUMN status_reason            TEXT,
  ADD COLUMN status_changed_at        TIMESTAMPTZ,
  ADD COLUMN status_changed_by_staff_id UUID REFERENCES staff(id),
  -- Optional planned return date for ON_LEAVE rows (NULL otherwise)
  ADD COLUMN planned_return_date      DATE;

-- ─── Step 3: backfill lifecycle_status from existing is_active ─────────────
-- All currently-active staff become ACTIVE. All currently-inactive staff
-- become SUSPENDED with a note (we don't know the original reason; SUSPENDED
-- is the safer default than TERMINATED — operators can later mark TERMINATED
-- explicitly with a reason if needed).

UPDATE staff
SET
  lifecycle_status = CASE WHEN is_active THEN 'ACTIVE' ELSE 'SUSPENDED' END::staff_lifecycle_status_enum,
  status_reason = CASE
    WHEN is_active THEN 'Migrated from is_active=true on 2026-XX-XX'
    ELSE 'Backfilled SUSPENDED from is_active=false on 2026-XX-XX (original reason not recorded; investigate per case if reactivation requested)'
  END,
  status_changed_at = COALESCE(updated_at, created_at)
WHERE lifecycle_status IS NULL;

-- After backfill, lifecycle_status becomes NOT NULL.
ALTER TABLE staff
  ALTER COLUMN lifecycle_status SET NOT NULL,
  ALTER COLUMN lifecycle_status SET DEFAULT 'ACTIVE';

-- ─── Step 4: replace is_active with a generated column ─────────────────────
-- Backward compat — existing code reading `staff.is_active` continues to
-- work. Any code attempting to UPDATE is_active directly will fail (cannot
-- update generated columns); must update lifecycle_status instead.
--
-- This is a two-step ritual because PostgreSQL doesn't support converting
-- a regular column to a generated column directly:
--   1. Drop the existing is_active column
--   2. Recreate it as STORED GENERATED from lifecycle_status

ALTER TABLE staff
  DROP COLUMN is_active;

ALTER TABLE staff
  ADD COLUMN is_active BOOLEAN GENERATED ALWAYS AS (
    lifecycle_status = 'ACTIVE'
  ) STORED;

-- ─── Step 5: enforce TERMINATED is one-way (compliance critical) ───────────
-- Prevents accidentally re-enabling a TERMINATED staff member, which would
-- break audit (looks like the termination didn't happen) and could mask
-- wrongful-termination scenarios.

CREATE OR REPLACE FUNCTION enforce_terminated_oneway()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.lifecycle_status = 'TERMINATED' AND NEW.lifecycle_status != 'TERMINATED' THEN
    RAISE EXCEPTION 'Cannot transition TERMINATED staff to %. TERMINATED is one-way. Create a new staff row if this person returns to the venue.',
      NEW.lifecycle_status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER staff_terminated_oneway
  BEFORE UPDATE OF lifecycle_status ON staff
  FOR EACH ROW EXECUTE FUNCTION enforce_terminated_oneway();

-- ─── Step 6: status_reason required on non-ACTIVE transitions ──────────────
-- ACTIVE rows can have NULL reason (no special context needed). SUSPENDED /
-- ON_LEAVE / TERMINATED rows must always have a reason for audit trail.

ALTER TABLE staff
  ADD CONSTRAINT staff_non_active_requires_reason
  CHECK (
    lifecycle_status = 'ACTIVE'
    OR (status_reason IS NOT NULL AND length(trim(status_reason)) >= 3)
  );

-- ─── Step 7: indexes for common queries ────────────────────────────────────
-- "All on-duty staff" reads lifecycle_status='ACTIVE'; partial index for speed.

CREATE INDEX idx_staff_lifecycle_active
  ON staff(venue_id, role)
  WHERE lifecycle_status = 'ACTIVE';

-- "Show me ON_LEAVE staff with planned return today/this-week"
CREATE INDEX idx_staff_planned_return
  ON staff(venue_id, planned_return_date)
  WHERE lifecycle_status = 'ON_LEAVE' AND planned_return_date IS NOT NULL;

-- ─── Step 8: comments for future engineers ─────────────────────────────────

COMMENT ON COLUMN staff.lifecycle_status IS
  'Operational state: ACTIVE / SUSPENDED / ON_LEAVE / TERMINATED. TERMINATED is one-way (enforced by staff_terminated_oneway trigger). ON_LEAVE may have planned_return_date. Replaces the binary is_active toggle from Sprint 1; is_active is now a generated column for backward compat.';

COMMENT ON COLUMN staff.is_active IS
  'GENERATED column (TRUE iff lifecycle_status=ACTIVE). Cannot be updated directly. Update lifecycle_status instead. Kept for backward compatibility with code reading the simple boolean (api requireRole middleware, mobile/dashboard staff lists).';

COMMENT ON COLUMN staff.status_reason IS
  'Required for SUSPENDED / ON_LEAVE / TERMINATED rows; min 3 chars. Audit trail context. Not required for ACTIVE rows.';

COMMENT ON COLUMN staff.planned_return_date IS
  'Optional — only meaningful for ON_LEAVE rows. UI shows "expected back YYYY-MM-DD"; cron can auto-transition to ACTIVE on this date (Phase 3 leave-management feature).';

COMMIT;
