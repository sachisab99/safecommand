-- =================================================================
-- MIGRATION 025 — approve_shift_swap() Postgres RPC
--   (Pattern Engine Pass 3c-iii — Phase 5.24 wave 2 polish)
--
-- Spec source: SafeCommand Shift Roster Architecture v1.0 §6.7
--   refinement closure. Promotes the two-step shift-swap approve
--   pattern (Pass 2) to a single Postgres function with implicit
--   transaction semantics. Closes the partial-failure window where
--   the swap row could end up APPROVED but the underlying
--   staff_zone_assignments mutation could fail.
--
-- File number = 025 (next free integer per ADR 0001 invariant).
--
-- HARD RULE 24: this migration MUST be applied + verified BEFORE the
-- API route is switched over to call the RPC. Apply method (same as
-- §23 + 022 + 023 + 024 family — paste into Supabase SQL Editor):
--   1. Paste this file → Run
--   2. Expect: NOTICE 'Migration 025 PASSED'
--   3. Confirm to assistant; API switch ships in the same commit
--      after function existence is verified.
--
-- TRANSACTION SEMANTICS
--   Postgres function bodies execute inside the caller's transaction
--   (LANGUAGE plpgsql STABLE/VOLATILE alike). The PostgREST RPC path
--   wraps the call in its own transaction, so the function gives us
--   a single atomic unit covering:
--     1. Load swap row (FOR UPDATE — row lock)
--     2. Validate state + swap_type + supervisor scope
--     3. Mutate staff_zone_assignments per swap_type
--     4. Update swap row → APPROVED
--   Any error inside aborts the whole transaction — the caller sees
--   the swap UNCHANGED and the assignment UNCHANGED.
--
-- PURELY ADDITIVE: 1 new function. No tables touched. No RLS changes.
-- =================================================================

BEGIN;

CREATE OR REPLACE FUNCTION approve_shift_swap(
  p_swap_id          UUID,
  p_supervisor_id    UUID
) RETURNS shift_swap_requests
LANGUAGE plpgsql
SECURITY INVOKER  -- runs with caller's privileges; RLS applies
AS $$
DECLARE
  v_swap         shift_swap_requests%ROWTYPE;
  v_valid_from   TEXT;
  v_orig_owner   UUID;
BEGIN
  -- ── 1) Load + lock the swap row
  SELECT * INTO v_swap
  FROM shift_swap_requests
  WHERE id = p_swap_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SWAP_NOT_FOUND: %', p_swap_id
      USING ERRCODE = 'P0002';  -- no_data_found
  END IF;

  -- ── 2) Validate from-state per swap_type
  v_valid_from := CASE WHEN v_swap.swap_type = 'DROP'
                       THEN 'REQUESTED'
                       ELSE 'COUNTERPART_ACCEPTED'
                  END;
  IF v_swap.state <> v_valid_from THEN
    RAISE EXCEPTION 'BAD_STATE: % requires state=%, found %',
                    v_swap.swap_type, v_valid_from, v_swap.state
      USING ERRCODE = 'P0001';  -- raise_exception (generic)
  END IF;

  -- ── 3) Mutate underlying staff_zone_assignments atomically.
  -- Within this function body, all UPDATE/DELETE share the caller's tx;
  -- any RAISE aborts everything together.

  IF v_swap.swap_type = 'SWAP' THEN
    -- SWAP: requester ↔ counterpart on two assignments.
    -- Use optimistic check on current owner to defend against concurrent
    -- mutations between Pass 2's separate writes (which this RPC replaces).
    UPDATE staff_zone_assignments
       SET staff_id = v_swap.counterpart_staff_id
     WHERE id = v_swap.original_assignment_id
       AND staff_id = v_swap.requester_staff_id
    RETURNING staff_id INTO v_orig_owner;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ASSIGNMENT_OWNER_MISMATCH: original assignment % is not owned by requester %',
                      v_swap.original_assignment_id, v_swap.requester_staff_id
        USING ERRCODE = 'P0001';
    END IF;

    UPDATE staff_zone_assignments
       SET staff_id = v_swap.requester_staff_id
     WHERE id = v_swap.counterpart_assignment_id
       AND staff_id = v_swap.counterpart_staff_id
    RETURNING staff_id INTO v_orig_owner;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ASSIGNMENT_OWNER_MISMATCH: counterpart assignment % is not owned by counterpart %',
                      v_swap.counterpart_assignment_id, v_swap.counterpart_staff_id
        USING ERRCODE = 'P0001';
    END IF;

  ELSIF v_swap.swap_type = 'COVER' THEN
    -- COVER: counterpart takes over the original assignment.
    UPDATE staff_zone_assignments
       SET staff_id = v_swap.counterpart_staff_id
     WHERE id = v_swap.original_assignment_id
       AND staff_id = v_swap.requester_staff_id
    RETURNING staff_id INTO v_orig_owner;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ASSIGNMENT_OWNER_MISMATCH: original assignment % is not owned by requester %',
                      v_swap.original_assignment_id, v_swap.requester_staff_id
        USING ERRCODE = 'P0001';
    END IF;

  ELSE  -- DROP
    DELETE FROM staff_zone_assignments
     WHERE id = v_swap.original_assignment_id
       AND staff_id = v_swap.requester_staff_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ASSIGNMENT_OWNER_MISMATCH: original assignment % is not owned by requester %',
                      v_swap.original_assignment_id, v_swap.requester_staff_id
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- ── 4) Mark swap APPROVED (atomic with the assignment mutation above)
  UPDATE shift_swap_requests
     SET state                 = 'APPROVED',
         supervisor_decided_at = now(),
         supervisor_staff_id   = p_supervisor_id
   WHERE id = p_swap_id
     AND state = v_valid_from
  RETURNING * INTO v_swap;

  IF NOT FOUND THEN
    -- The FOR UPDATE lock prevents this in practice; defensive RAISE.
    RAISE EXCEPTION 'BAD_STATE: race detected updating swap %', p_swap_id
      USING ERRCODE = 'P0001';
  END IF;

  RETURN v_swap;
END;
$$;

-- Grant execute to authenticated (RLS still applies on shift_swap_requests
-- + staff_zone_assignments; SECURITY INVOKER means the policies gate the
-- function's reads/writes the same as direct table access).
REVOKE ALL ON FUNCTION approve_shift_swap(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION approve_shift_swap(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION approve_shift_swap(UUID, UUID) TO service_role;

-- =================================================================
-- Verification (Hard Rule 24 satisfaction)
-- =================================================================
DO $$
DECLARE
  v_fn_count INT;
  v_grants_anon INT;
BEGIN
  SELECT COUNT(*) INTO v_fn_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'approve_shift_swap';
  IF v_fn_count < 1 THEN
    RAISE EXCEPTION 'Migration 025 FAILED: approve_shift_swap function not created';
  END IF;

  -- anon should NOT have execute privilege
  SELECT COUNT(*) INTO v_grants_anon
  FROM information_schema.routine_privileges
  WHERE routine_schema = 'public'
    AND routine_name = 'approve_shift_swap'
    AND grantee = 'anon';
  IF v_grants_anon > 0 THEN
    RAISE EXCEPTION 'Migration 025 FAILED: anon has execute on approve_shift_swap (should be authenticated/service_role only)';
  END IF;

  RAISE NOTICE 'Migration 025 PASSED: approve_shift_swap() function created, granted to authenticated + service_role, anon revoked';
END $$;

COMMIT;
