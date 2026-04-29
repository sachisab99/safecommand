-- Sprint 1 Gate 1: RLS Isolation Proof (SELECT-based, returns result rows)
BEGIN;

-- Create test data as superuser (bypasses RLS)
INSERT INTO venues (name, type, city, venue_code)
  VALUES ('RLS Gate Venue 1', 'MALL', 'HYD', generate_venue_code('MALL', 'HYD'));
INSERT INTO venues (name, type, city, venue_code)
  VALUES ('RLS Gate Venue 2', 'HOTEL', 'BLR', generate_venue_code('HOTEL', 'BLR'));

INSERT INTO staff (venue_id, name, phone, role)
  SELECT id, 'Gate SH 1', '+910000000011', 'SH'
  FROM venues WHERE name = 'RLS Gate Venue 1';

INSERT INTO staff (venue_id, name, phone, role)
  SELECT id, 'Gate SH 2', '+910000000022', 'SH'
  FROM venues WHERE name = 'RLS Gate Venue 2';

INSERT INTO floors (venue_id, name, floor_number)
  SELECT id, 'Ground Floor', 0
  FROM venues WHERE name = 'RLS Gate Venue 1';

-- Switch to authenticated role (RLS now applies)
SET LOCAL ROLE authenticated;

-- Set context to Venue 2
SELECT set_tenant_context(
  (SELECT id FROM venues WHERE name = 'RLS Gate Venue 2'),
  (SELECT id FROM staff WHERE name = 'Gate SH 2'),
  'SH'
);

-- PROOF: Try to read Venue 1 floors as Venue 2 user
-- Expected: 0 rows (RLS blocks cross-venue access)
SELECT
  'floors' AS table_name,
  COUNT(*) AS rows_visible_cross_venue,
  CASE WHEN COUNT(*) = 0 THEN 'PASS - RLS WORKING' ELSE 'FAIL - RLS BREACH' END AS result
FROM floors
WHERE venue_id = (SELECT id FROM venues WHERE name = 'RLS Gate Venue 1');

-- PROOF: Try to read Venue 1 staff as Venue 2 user
SELECT
  'staff' AS table_name,
  COUNT(*) AS rows_visible_cross_venue,
  CASE WHEN COUNT(*) = 0 THEN 'PASS - RLS WORKING' ELSE 'FAIL - RLS BREACH' END AS result
FROM staff
WHERE venue_id = (SELECT id FROM venues WHERE name = 'RLS Gate Venue 1');

-- Cleanup (rollback so no data persists)
ROLLBACK;
