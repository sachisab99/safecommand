-- ═══════════════════════════════════════════════════════════════════════════
-- seed-hyderabad-demo.sql — populate Hyderabad Demo Supermall with realistic
-- running state for sales validation demos.
--
-- Wraps writes in a transaction. Marks every seed row so reset-hyderabad-
-- demo.sql can find and remove them cleanly. Re-running this script when
-- markers exist is BLOCKED — run reset first.
--
-- What this seeds (on top of existing TEST_DEMO_* staff which we leave alone):
--   - 6 realistic staff (Indian names) with phone-pattern +919999XXXX
--   - 2 shift templates: Day 09:00–18:00, Night 18:00–06:00
--   - 1 ACTIVE shift_instance for today's Day Shift, commander = senior SH
--   - 9 of 12 zones assigned (75% coverage — leaves 3 uncovered for the
--     coverage-gap callout to render meaningfully on /accountability)
--   - 1 zone in ATTENTION state (T1-Reception)
--   - 2 historical incidents (1 RESOLVED 2hr ago, 1 CONTAINED 30min ago)
--     for incident timeline flavor
--
-- Convention: every seed-created row has a recognisable marker:
--   - shifts.name starts with '[DEMO] '
--   - staff.phone starts with '+919999'
--   - incidents.description starts with '[DEMO] '
-- The reset script uses these markers for clean removal.
--
-- Idempotency: first guard checks for any existing '[DEMO] ' shift.
-- If found, this script aborts with a clear message.
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

BEGIN;

-- ─── Constants ──────────────────────────────────────────────────────────────
\set venue_id '''096a3701-beb0-4ffe-9e74-43af3c26e09f'''

-- ─── Guard: refuse to double-seed ───────────────────────────────────────────
DO $$
DECLARE
  existing_count INT;
BEGIN
  SELECT COUNT(*) INTO existing_count
  FROM shifts
  WHERE venue_id = '096a3701-beb0-4ffe-9e74-43af3c26e09f'
    AND name LIKE '[DEMO] %';
  IF existing_count > 0 THEN
    RAISE EXCEPTION 'Seed already present (% [DEMO] shifts found). Run reset-hyderabad-demo.sh first.', existing_count;
  END IF;
END $$;

-- ─── 1. Realistic staff (6 new — leaves existing TEST_DEMO_* untouched) ────
-- NOTE: post-mig 011, `is_active` is a GENERATED column (lifecycle_status='ACTIVE').
-- Direct insert into is_active is REJECTED. We only set lifecycle_status; the
-- is_active column auto-computes.
INSERT INTO staff (venue_id, name, role, phone, lifecycle_status)
VALUES
  (:venue_id, 'Rajesh Kumar',   'SHIFT_COMMANDER', '+919999000001', 'ACTIVE'),
  (:venue_id, 'Priya Sharma',   'FLOOR_SUPERVISOR','+919999000002', 'ACTIVE'),
  (:venue_id, 'Anil Reddy',     'GROUND_STAFF',    '+919999000003', 'ACTIVE'),
  (:venue_id, 'Lakshmi Iyer',   'GROUND_STAFF',    '+919999000004', 'ACTIVE'),
  (:venue_id, 'Vikram Singh',   'GROUND_STAFF',    '+919999000005', 'ACTIVE'),
  (:venue_id, 'Nisha Patel',    'GROUND_STAFF',    '+919999000006', 'ACTIVE');

-- ─── 2. Two shift templates (Day + Night) ──────────────────────────────────
INSERT INTO shifts (venue_id, name, start_time, end_time, is_active)
VALUES
  (:venue_id, '[DEMO] Day Shift',   '09:00:00', '18:00:00', TRUE),
  (:venue_id, '[DEMO] Night Shift', '18:00:00', '06:00:00', TRUE);

-- ─── 3. Today's Day Shift instance — ACTIVE with senior SH commander ──────
WITH day_shift AS (
  SELECT id FROM shifts
  WHERE venue_id = :venue_id AND name = '[DEMO] Day Shift'
  LIMIT 1
),
commander AS (
  SELECT id FROM staff
  WHERE venue_id = :venue_id
    AND role = 'SH'
    AND is_active = TRUE
  ORDER BY created_at ASC
  LIMIT 1
)
INSERT INTO shift_instances (
  venue_id, shift_id, shift_date, status, commander_staff_id, activated_at
)
SELECT :venue_id, day_shift.id, CURRENT_DATE, 'ACTIVE', commander.id, NOW() - INTERVAL '4 hours'
FROM day_shift, commander;

-- ─── 4. Zone assignments (9 of 12 zones — 75% coverage) ────────────────────
-- Realistic operational distribution:
--   Rajesh Kumar (SC) — covers high-traffic ground floor: T1-Lift, T1-Reception, T2-Lift
--   Priya Sharma (FS) — covers stairs as floor supervisor: T1-Stair, T2-Stair
--   Anil Reddy (GS)   — covers T1 basement: T1-Parking, T1-Parking-Entrance
--   Lakshmi Iyer (GS) — covers T2 basement parking: T2-Parking
--   Vikram Singh (GS) — covers T2 reception: T2-Reception
--   Nisha Patel (GS)  — currently uncovered (on break — realistic gap)
--
-- Uncovered zones (the gap):
--   T1-Restroom-Basement, T2-Parking-Entrance, T2-Restroom-Basement
-- These render the dashboard /accountability coverage-gap callout.

-- Note on TEST_DEMO_Security_S01:
-- We also assign one of the existing TEST_DEMO_* staff to a zone so the
-- founder can demo Mobile MyShift in a Loom recording without needing to
-- update Railway's TEST_PHONE_PAIRS env (TEST_DEMO_Security_S01's phone
-- +919000012301 is already in the bypass; the new +919999XXX phones are
-- not). This drops uncovered from 3 → 2 — coverage-gap callout still
-- renders meaningfully on /accountability.

WITH inst AS (
  SELECT shift_instances.id FROM shift_instances
  JOIN shifts ON shifts.id = shift_instances.shift_id
  WHERE shift_instances.venue_id = :venue_id
    AND shifts.name = '[DEMO] Day Shift'
    AND shift_instances.shift_date = CURRENT_DATE
),
staff_lookup AS (
  -- Include both seeded staff (+919999*) AND the existing test staff
  -- TEST_DEMO_Security_S01 so the Loom mobile demo works out-of-the-box
  SELECT id, name FROM staff
  WHERE venue_id = :venue_id
    AND (phone LIKE '+919999%' OR name = 'TEST_DEMO_Security_S01')
),
zone_lookup AS (
  SELECT id, name FROM zones WHERE venue_id = :venue_id
)
INSERT INTO staff_zone_assignments (
  venue_id, shift_instance_id, staff_id, zone_id, assignment_type
)
SELECT :venue_id, inst.id, s.id, z.id, 'PRIMARY'::shift_assignment_type_enum
FROM inst, (
  VALUES
    ('Rajesh Kumar',           'T1-Lift'),
    ('Rajesh Kumar',           'T1-Reception'),
    ('Rajesh Kumar',           'T2-Lift'),
    ('Priya Sharma',           'T1-Stair'),
    ('Priya Sharma',           'T2-Stair'),
    ('Anil Reddy',             'T1-Parking'),
    ('Anil Reddy',             'T1-Parking-Entrance'),
    ('Lakshmi Iyer',           'T2-Parking'),
    ('Vikram Singh',           'T2-Reception'),
    ('TEST_DEMO_Security_S01', 'T2-Parking-Entrance')
) AS pairs(staff_name, zone_name)
JOIN staff_lookup s ON s.name = pairs.staff_name
JOIN zone_lookup z  ON z.name = pairs.zone_name;

-- ─── 5. Set 1 zone to ATTENTION (T1-Reception — realistic crowd buildup) ──
UPDATE zones
SET current_status = 'ATTENTION', updated_at = NOW()
WHERE venue_id = :venue_id AND name = 'T1-Reception';

-- Log the status change so audit trail is consistent (BR-18 / EC-10)
INSERT INTO zone_status_log (venue_id, zone_id, status, changed_by_staff_id)
SELECT :venue_id, z.id, 'ATTENTION'::zone_status_enum, s.id
FROM zones z, staff s
WHERE z.venue_id = :venue_id AND z.name = 'T1-Reception'
  AND s.venue_id = :venue_id AND s.name = 'Rajesh Kumar';

-- ─── 6. Two historical incidents for timeline flavor ───────────────────────
-- Incident 1: RESOLVED 2 hours ago — fire alarm test on T1-Stair (drill)
-- Incident 2: CONTAINED 30 min ago — security check on T2-Parking-Entrance

WITH t1_stair AS (
  SELECT id FROM zones WHERE venue_id = :venue_id AND name = 'T1-Stair' LIMIT 1
),
t2_park_ent AS (
  SELECT id FROM zones WHERE venue_id = :venue_id AND name = 'T2-Parking-Entrance' LIMIT 1
),
sh_staff AS (
  SELECT id FROM staff
  WHERE venue_id = :venue_id AND role = 'SH' AND is_active = TRUE
  ORDER BY created_at ASC LIMIT 1
),
gs_staff AS (
  SELECT id FROM staff
  WHERE venue_id = :venue_id AND name = 'Anil Reddy' LIMIT 1
)
INSERT INTO incidents (
  venue_id, zone_id, incident_type, severity, status, declared_at,
  declared_by_staff_id, description, resolved_at
)
SELECT :venue_id ::uuid, t1_stair.id, 'FIRE'::incident_type_enum, 'SEV2'::incident_severity_enum,
       'RESOLVED'::incident_status_enum,
       NOW() - INTERVAL '2 hours', sh_staff.id,
       '[DEMO] Fire alarm test — drill exercise per quarterly schedule',
       NOW() - INTERVAL '1 hour 45 minutes'
FROM t1_stair, sh_staff
UNION ALL
SELECT :venue_id ::uuid, t2_park_ent.id, 'SECURITY'::incident_type_enum, 'SEV3'::incident_severity_enum,
       'CONTAINED'::incident_status_enum,
       NOW() - INTERVAL '30 minutes', gs_staff.id,
       '[DEMO] Suspicious package — investigated, false alarm, monitoring',
       NULL
FROM t2_park_ent, gs_staff;

-- ─── 7. Summary ─────────────────────────────────────────────────────────────
\echo ''
\echo '═══════════════════════════════════════════════════════════════'
\echo '  Seed complete'
\echo '═══════════════════════════════════════════════════════════════'

SELECT 'staff (new)' AS item, COUNT(*) AS count FROM staff
  WHERE venue_id = :venue_id AND phone LIKE '+919999%'
UNION ALL
SELECT 'shifts ([DEMO])', COUNT(*) FROM shifts
  WHERE venue_id = :venue_id AND name LIKE '[DEMO] %'
UNION ALL
SELECT 'shift_instances (active)', COUNT(*) FROM shift_instances
  WHERE venue_id = :venue_id AND status = 'ACTIVE'
UNION ALL
SELECT 'staff_zone_assignments', COUNT(*) FROM staff_zone_assignments
  WHERE venue_id = :venue_id
UNION ALL
SELECT 'zones in ATTENTION', COUNT(*) FROM zones
  WHERE venue_id = :venue_id AND current_status = 'ATTENTION'
UNION ALL
SELECT 'incidents ([DEMO])', COUNT(*) FROM incidents
  WHERE venue_id = :venue_id AND description LIKE '[DEMO] %';

COMMIT;
