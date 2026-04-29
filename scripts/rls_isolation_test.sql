-- Sprint 1 Gate 1: RLS Isolation Proof
-- Runs entirely in a transaction with explicit role switching to 'authenticated'
-- so that RLS policies are fully enforced.
DO $$
DECLARE
  v_venue1_id  UUID;
  v_venue2_id  UUID;
  v_staff1_id  UUID;
  v_staff2_id  UUID;
  v_floor1_id  UUID;
  v_code1      TEXT;
  v_code2      TEXT;
  v_row_count  INTEGER;
BEGIN

  -- ── Create test venues via service-role (bypasses RLS) ──────────────────
  SELECT generate_venue_code('MALL', 'HYD') INTO v_code1;
  SELECT generate_venue_code('HOTEL', 'BLR') INTO v_code2;

  INSERT INTO venues (name, type, city, venue_code)
    VALUES ('RLS Test Venue Alpha', 'MALL', 'HYD', v_code1)
    RETURNING id INTO v_venue1_id;

  INSERT INTO venues (name, type, city, venue_code)
    VALUES ('RLS Test Venue Beta', 'HOTEL', 'BLR', v_code2)
    RETURNING id INTO v_venue2_id;

  RAISE NOTICE 'Venue 1: % (%)', v_code1, v_venue1_id;
  RAISE NOTICE 'Venue 2: % (%)', v_code2, v_venue2_id;

  -- ── Create staff in each venue ───────────────────────────────────────────
  INSERT INTO staff (venue_id, name, phone, role)
    VALUES (v_venue1_id, 'Alpha SH', '+910000000001', 'SH')
    RETURNING id INTO v_staff1_id;

  INSERT INTO staff (venue_id, name, phone, role)
    VALUES (v_venue2_id, 'Beta SH', '+910000000002', 'SH')
    RETURNING id INTO v_staff2_id;

  -- ── Create a floor in Venue 1 ─────────────────────────────────────────────
  INSERT INTO floors (venue_id, name, floor_number)
    VALUES (v_venue1_id, 'Ground Floor', 0)
    RETURNING id INTO v_floor1_id;

  RAISE NOTICE 'Floor created in Venue 1: %', v_floor1_id;

  -- ── SET ROLE to authenticated (RLS now enforced) ─────────────────────────
  SET LOCAL ROLE authenticated;

  -- ── Set tenant context to Venue 2 ────────────────────────────────────────
  PERFORM set_tenant_context(v_venue2_id, v_staff2_id, 'SH');

  -- ── Test 1: Query Venue 1 floors as Venue 2 context ──────────────────────
  SELECT COUNT(*) INTO v_row_count
    FROM floors
    WHERE venue_id = v_venue1_id;

  IF v_row_count = 0 THEN
    RAISE NOTICE '✓ PASS — Floor isolation: cross-venue query returned 0 rows';
  ELSE
    RAISE EXCEPTION '✗ FAIL — Floor isolation: cross-venue query returned % rows! RLS BREACH!', v_row_count;
  END IF;

  -- ── Test 2: Query Venue 1 staff as Venue 2 context ───────────────────────
  SELECT COUNT(*) INTO v_row_count
    FROM staff
    WHERE venue_id = v_venue1_id;

  IF v_row_count = 0 THEN
    RAISE NOTICE '✓ PASS — Staff isolation: cross-venue query returned 0 rows';
  ELSE
    RAISE EXCEPTION '✗ FAIL — Staff isolation: cross-venue query returned % rows! RLS BREACH!', v_row_count;
  END IF;

  -- ── Test 3: Query Venue 1 venue record as Venue 2 context ────────────────
  SELECT COUNT(*) INTO v_row_count
    FROM venues
    WHERE id = v_venue1_id;

  IF v_row_count = 0 THEN
    RAISE NOTICE '✓ PASS — Venue isolation: cross-venue query returned 0 rows';
  ELSE
    RAISE EXCEPTION '✗ FAIL — Venue isolation: cross-venue query returned % rows! RLS BREACH!', v_row_count;
  END IF;

  RAISE NOTICE '=== Gate 1 PASSED: RLS multi-tenant isolation proven ✓ ===';

  -- ── Cleanup (RESET ROLE to clean up via service role) ────────────────────
  RESET ROLE;
  DELETE FROM floors WHERE id = v_floor1_id;
  DELETE FROM staff WHERE id IN (v_staff1_id, v_staff2_id);
  DELETE FROM venues WHERE id IN (v_venue1_id, v_venue2_id);
  RAISE NOTICE '✓ Test data cleaned up';

END $$;
