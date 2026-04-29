-- Sprint 1 Gate 1: RLS Isolation Proof v2
-- Captures IDs before role switch so WHERE clauses have concrete UUIDs
DO $$
DECLARE
  v1_id UUID; v2_id UUID;
  s1_id UUID; s2_id UUID;
  fl1_id UUID;
  floor_count INT; staff_count INT; venue_count INT;
BEGIN
  -- Create test data as postgres (bypasses RLS)
  INSERT INTO venues (name, type, city, venue_code)
    VALUES ('RLS Gate V1', 'MALL', 'HYD', generate_venue_code('MALL','HYD'))
    RETURNING id INTO v1_id;
  INSERT INTO venues (name, type, city, venue_code)
    VALUES ('RLS Gate V2', 'HOTEL','BLR', generate_venue_code('HOTEL','BLR'))
    RETURNING id INTO v2_id;

  INSERT INTO staff (venue_id, name, phone, role) VALUES (v1_id,'SH One','+910000000011','SH') RETURNING id INTO s1_id;
  INSERT INTO staff (venue_id, name, phone, role) VALUES (v2_id,'SH Two','+910000000022','SH') RETURNING id INTO s2_id;
  INSERT INTO floors (venue_id, name, floor_number) VALUES (v1_id,'G',0) RETURNING id INTO fl1_id;

  -- Switch to authenticated role (enforces RLS)
  SET LOCAL ROLE authenticated;
  PERFORM set_tenant_context(v2_id, s2_id, 'SH');

  -- Use captured IDs (concrete UUIDs, no sub-selects that RLS can block)
  SELECT COUNT(*) INTO floor_count FROM floors WHERE venue_id = v1_id;
  SELECT COUNT(*) INTO staff_count FROM staff  WHERE venue_id = v1_id;
  SELECT COUNT(*) INTO venue_count FROM venues WHERE id       = v1_id;

  RESET ROLE; -- back to superuser for cleanup

  RAISE NOTICE 'floors cross-venue rows: % → %', floor_count, CASE WHEN floor_count=0 THEN 'PASS' ELSE 'FAIL-BREACH' END;
  RAISE NOTICE 'staff  cross-venue rows: % → %', staff_count, CASE WHEN staff_count=0 THEN 'PASS' ELSE 'FAIL-BREACH' END;
  RAISE NOTICE 'venues cross-venue rows: % → %', venue_count, CASE WHEN venue_count=0 THEN 'PASS' ELSE 'FAIL-BREACH' END;

  IF floor_count > 0 OR staff_count > 0 OR venue_count > 0 THEN
    RAISE EXCEPTION 'RLS BREACH DETECTED';
  END IF;

  DELETE FROM floors WHERE id = fl1_id;
  DELETE FROM staff  WHERE id IN (s1_id, s2_id);
  DELETE FROM venues WHERE id IN (v1_id, v2_id);
END $$;

SELECT 'Gate 1: RLS isolation PROVEN' AS result;
