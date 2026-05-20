-- =================================================================
-- MIGRATION 024 — rotation_cycle_library auth-read RLS policy
--
-- Context: mig 022 (applied 2026-05-21) created `rotation_cycle_library`
-- as a global, anon-REVOKE'd lookup table — intentionally WITHOUT RLS.
-- Defence-in-depth was via `REVOKE ALL FROM anon` + `GRANT SELECT TO
-- authenticated`. That works under psql apply.
--
-- The Supabase Dashboard SQL Editor, however, prompts to enable RLS on
-- every new public.* table when applied via the web UI (a sensible
-- security default — Supabase doesn't want any public-schema table
-- exposed via PostgREST without explicit RLS gating). The founder
-- accepted the prompt during the 2026-05-21 apply, leaving the table
-- in an RLS-on, NO-POLICY state. With RLS enabled and no permissive
-- policy, the GRANT is shadowed and authenticated reads return 0 rows
-- — pattern-engine UIs would see an empty rotation library.
--
-- THIS MIGRATION adopts the RLS-on posture (better defence-in-depth than
-- the original design — even if anon ever gained accidental access at a
-- future grant level, the policy still gates by role) and adds the
-- missing explicit read-all policy for authenticated users.
--
-- File number = 024 (next free integer per ADR 0001).
-- Purely additive: 1 CREATE POLICY + verification. No table changes, no
-- data changes. Behaviour-correcting: enables authenticated reads of
-- the 7 built-in rotations seeded in mig 022.
--
-- HARD RULE 24: this MUST be applied before any pattern-engine code that
-- reads rotation_cycle_library deploys (otherwise the UI dropdown / API
-- listing endpoint would silently return []). Apply method (founder,
-- same SIRE-Day-1 pattern):
--   psql "<supabase session-pooler url>" --single-transaction \
--        -v ON_ERROR_STOP=1 \
--        -f supabase/migrations/024_rotation_cycle_library_read_policy.sql
-- Or paste into the same SQL Editor session.
-- Expected: NOTICE 'Migration 024 PASSED: rotation_cycle_library auth_read_all policy created'
--
-- Engineering learning captured: when an architecture spec defines a
-- "global, no-RLS" table, prefer ENABLE ROW LEVEL SECURITY + an
-- explicit USING(true) policy from the start — it matches Supabase's
-- default expectation and is bit-equivalent to a grant-only design when
-- the policy is USING(true). The pre-deploy adaptation discipline added
-- a checklist item for this for the migs 022 + 023 spec author cycle.
-- =================================================================

BEGIN;

-- The library is intentionally global — every authenticated user (any
-- role, any venue) reads all 7 built-in rotations to populate UI
-- dropdowns and the pattern-engine resolver. anon remains REVOKE'd
-- (defence-in-depth: anon-key clients embedded in mobile/dashboard
-- builds cannot enumerate the library).
CREATE POLICY "auth_read_all" ON rotation_cycle_library
  FOR SELECT
  TO authenticated
  USING (TRUE);

-- Verification (Hard Rule 24 satisfaction)
DO $$
DECLARE
  v_policy_count INT;
  v_rls_enabled BOOLEAN;
  v_seed_count INT;
BEGIN
  -- Policy now exists
  SELECT COUNT(*) INTO v_policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'rotation_cycle_library'
    AND policyname = 'auth_read_all';
  IF v_policy_count < 1 THEN
    RAISE EXCEPTION 'Migration 024 FAILED: auth_read_all policy not created';
  END IF;

  -- Confirm RLS is enabled (the precondition the SQL Editor introduced)
  SELECT rowsecurity INTO v_rls_enabled
  FROM pg_tables WHERE schemaname = 'public' AND tablename = 'rotation_cycle_library';
  IF NOT v_rls_enabled THEN
    RAISE EXCEPTION 'Migration 024 FAILED: RLS not enabled on rotation_cycle_library — policy without RLS is a no-op';
  END IF;

  -- Confirm the 7 built-in rotations seeded by mig 022 are still present
  SELECT COUNT(*) INTO v_seed_count
  FROM rotation_cycle_library WHERE is_built_in = TRUE;
  IF v_seed_count < 7 THEN
    RAISE EXCEPTION 'Migration 024 FAILED: Expected 7 seeded rotations, found %', v_seed_count;
  END IF;

  RAISE NOTICE 'Migration 024 PASSED: rotation_cycle_library auth_read_all policy created (RLS on, 7 built-in rotations readable)';
END $$;

COMMIT;
