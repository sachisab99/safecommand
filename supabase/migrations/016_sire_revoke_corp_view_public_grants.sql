-- Migration 016 (this repo) | Phase 5.21 Day 1 — security hardening
-- ───────────────────────────────────────────────────────────────────────────
-- Revoke Supabase platform-default grants on corp_incident_aggregates view.
--
-- Problem caught during pre-merge validation (2026-05-08 evening):
--   Supabase auto-grants ALL privileges (SELECT/INSERT/UPDATE/DELETE/
--   REFERENCES/TRIGGER/TRUNCATE) to the `anon` AND `authenticated` roles
--   on every object created in the `public` schema. This applies to views
--   as well as tables.
--
--   `corp_incident_aggregates` (created in mig 014) was defined with
--   `WITH (security_invoker = false)` so CORP-* api endpoints can read
--   base tables without venue RLS context. This bypass + the auto-grant
--   means ANY user with the public Supabase anon key (embedded in every
--   mobile and dashboard build) could issue a direct PostgREST request
--   to `GET /rest/v1/corp_incident_aggregates` and receive aggregate
--   incident metadata across every venue and corporate account in the
--   database.
--
--   Severity: MODERATE information disclosure. The view does NOT expose
--   PII (no staff names, no phone numbers, no visitor records — verified
--   in the architect-published gap analysis). It DOES expose:
--     - cross-venue incident counts, dates, severities, durations
--     - evacuation trigger counts per venue
--     - zone-validation rates per incident
--   Violates NFR-01 (zero cross-venue data access), EC-20 (CORP roles
--   never access individual data), EC-21 (raw data never crosses
--   corporate boundaries via unauthenticated path).
--
--   Mitigating factor: no Phase 3 CORP-* api endpoints are deployed yet,
--   so no internal code path was relying on the auto-grant. View has
--   zero application consumers (verified by code-search of
--   apps/api/src/, apps/dashboard/, apps/mobile/, apps/ops-console/,
--   packages/db/, scripts/, supabase/seeds/).
--
-- Architect's §4.1 isolation model (`docs/specs/SafeCommand_Phase521_
-- Clarifications_Resolved.md`) was correct for the Railway api path
-- (service_role + middleware + mandatory corporate_account_id WHERE)
-- but incomplete because the PostgREST direct path bypasses the
-- middleware entirely. The complete isolation model requires that
-- non-api roles have NO grant on the view at all.
--
-- Fix:
--   REVOKE ALL PRIVILEGES on the view from `anon` + `authenticated`.
--   Defensive idempotent GRANT SELECT to `service_role` (preserves the
--   api path; should already be granted).
--   `postgres` role retains its (superuser) access for SC Ops admin
--   paths and Dashboard SQL Editor.
--
-- Refs:
--   - docs/specs/SafeCommand_Phase521_SecurityGap_Analysis.md (full finding)
--   - docs/specs/SafeCommand_Phase521_Clarifications_Resolved.md §4.1
--     (with 2026-05-08 amendment landing in companion docs commit)
--   - Hard Rule 25 (codified in CLAUDE.md as part of the same Step 5
--     bundle as this mig's commit)
--   - mig 014 line 578 (CREATE OR REPLACE VIEW corp_incident_aggregates)
--   - mig 014 commit 75ce685 carries an inline ⚠ HARD RULE 25 warning
--     comment immediately above the CREATE VIEW for future Phase 3
--     template-copy defence-in-depth
--
-- Apply via: psql --single-transaction -v ON_ERROR_STOP=1 -f
--   (matches mig 014 + 015 pattern). Atomicity via psql flag — no
--   explicit BEGIN/COMMIT in this file (would conflict with
--   --single-transaction's outer transaction).
-- ───────────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════
-- 0. PRECONDITION — corp_incident_aggregates view exists (mig 014 applied)
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public'
      AND table_name = 'corp_incident_aggregates'
  ) THEN
    RAISE EXCEPTION 'mig 016 precondition failed: corp_incident_aggregates view missing. mig 014 (SIRE schema) must be applied first.';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. REVOKE Supabase auto-granted privileges from anon + authenticated
-- ═══════════════════════════════════════════════════════════════════════════
-- REVOKE ALL = removes every privilege type (SELECT/INSERT/UPDATE/
-- DELETE/REFERENCES/TRIGGER/TRUNCATE). After this, anon and authenticated
-- have zero rows in information_schema.role_table_grants for this view.

REVOKE ALL PRIVILEGES ON TABLE corp_incident_aggregates FROM anon;
REVOKE ALL PRIVILEGES ON TABLE corp_incident_aggregates FROM authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Defensive: ensure service_role retains SELECT (idempotent)
-- ═══════════════════════════════════════════════════════════════════════════
-- service_role is the role the api uses (via SUPABASE_SERVICE_ROLE_KEY in
-- packages/db/src/index.ts → getServiceClient()). Phase 3 CORP-* endpoints
-- will use this role to read the view via PostgREST. service_role bypasses
-- RLS but uses standard GRANTs, so the SELECT must be present.
-- This GRANT is a no-op if already present (per Section G of the
-- pre-merge probe, service_role had ALL privileges before mig 016).

GRANT SELECT ON TABLE corp_incident_aggregates TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. VERIFICATION — RAISE EXCEPTION (rollback) if grant state is wrong
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_anon_count    INT;
  v_auth_count    INT;
  v_service_count INT;
BEGIN
  -- Check: anon has ZERO privileges on the view
  SELECT COUNT(*) INTO v_anon_count
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name   = 'corp_incident_aggregates'
    AND grantee      = 'anon';

  -- Check: authenticated has ZERO privileges on the view
  SELECT COUNT(*) INTO v_auth_count
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name   = 'corp_incident_aggregates'
    AND grantee      = 'authenticated';

  -- Check: service_role still has SELECT (api path must still work)
  SELECT COUNT(*) INTO v_service_count
  FROM information_schema.role_table_grants
  WHERE table_schema   = 'public'
    AND table_name     = 'corp_incident_aggregates'
    AND grantee        = 'service_role'
    AND privilege_type = 'SELECT';

  RAISE NOTICE 'mig 016 verification:';
  RAISE NOTICE '  anon grants: % (expected 0)', v_anon_count;
  RAISE NOTICE '  authenticated grants: % (expected 0)', v_auth_count;
  RAISE NOTICE '  service_role SELECT: % (expected ≥1)', v_service_count;

  IF v_anon_count > 0 THEN
    RAISE EXCEPTION 'mig 016 FAILED: anon still has % privilege(s) on corp_incident_aggregates. PostgREST anon path remains exploitable.', v_anon_count;
  END IF;

  IF v_auth_count > 0 THEN
    RAISE EXCEPTION 'mig 016 FAILED: authenticated still has % privilege(s) on corp_incident_aggregates. PostgREST authenticated path remains exploitable.', v_auth_count;
  END IF;

  IF v_service_count = 0 THEN
    RAISE EXCEPTION 'mig 016 FAILED: service_role lost SELECT on corp_incident_aggregates. api path broken; rolling back.';
  END IF;

  RAISE NOTICE '  All checks PASSED. corp_incident_aggregates is unreachable via anon/authenticated; api service_role path preserved.';
END $$;
