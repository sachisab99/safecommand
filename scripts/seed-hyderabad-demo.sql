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

-- ─── 6b. Timeline events for both demo incidents ───────────────────────────
-- BR-29 / EC-10: every incident lifecycle action is timeline-logged
-- (append-only via RLS). For the deep-dive page (/incidents/:id) to show
-- a meaningful narrative arc, we seed realistic events per incident.
--
-- FIRE drill (RESOLVED 2hr ago):
--   DECLARED by SH → BROADCAST_SENT → STAFF_ON_SITE (Rajesh) →
--   STAFF_ACK (Lakshmi) → RESOLVED by SH
--
-- SECURITY check (CONTAINED 30min ago):
--   DECLARED by Anil → STAFF_ON_SITE (Anil) → ESCALATED_LEVEL_1 →
--   STAFF_ON_SITE (Priya) → STAFF_ACK (Lakshmi, Vikram) →
--   CONTAINED by Priya → NOTE by Priya

WITH fire_inc AS (
  SELECT id FROM incidents
  WHERE venue_id = :venue_id AND incident_type='FIRE'
    AND description LIKE '[DEMO] Fire alarm test%' LIMIT 1
),
sec_inc AS (
  SELECT id FROM incidents
  WHERE venue_id = :venue_id AND incident_type='SECURITY'
    AND description LIKE '[DEMO] Suspicious package%' LIMIT 1
),
sh AS (
  SELECT id FROM staff
  WHERE venue_id = :venue_id AND role='SH' AND is_active=TRUE
  ORDER BY created_at ASC LIMIT 1
),
rajesh AS (SELECT id FROM staff WHERE venue_id=:venue_id AND name='Rajesh Kumar'),
priya  AS (SELECT id FROM staff WHERE venue_id=:venue_id AND name='Priya Sharma'),
anil   AS (SELECT id FROM staff WHERE venue_id=:venue_id AND name='Anil Reddy'),
lakshmi AS (SELECT id FROM staff WHERE venue_id=:venue_id AND name='Lakshmi Iyer'),
vikram AS (SELECT id FROM staff WHERE venue_id=:venue_id AND name='Vikram Singh')
INSERT INTO incident_timeline (
  venue_id, incident_id, event_type, actor_staff_id, occurred_at, metadata
)
-- FIRE drill (5 events)
SELECT :venue_id ::uuid, fire_inc.id, 'DECLARED', sh.id,
       NOW() - INTERVAL '2 hours',
       '{"severity":"SEV2","drill":true,"description":"Fire alarm test triggered"}'::jsonb
FROM fire_inc, sh
UNION ALL
SELECT :venue_id ::uuid, fire_inc.id, 'BROADCAST_SENT', NULL,
       NOW() - INTERVAL '1 hour 59 minutes',
       '{"channel":"FCM","scope":"venue-wide","recipients":6,"delivered":6}'::jsonb
FROM fire_inc
UNION ALL
SELECT :venue_id ::uuid, fire_inc.id, 'STAFF_ON_SITE', rajesh.id,
       NOW() - INTERVAL '1 hour 55 minutes',
       '{"location":"T1-Stair","note":"Floor cleared, drill in progress"}'::jsonb
FROM fire_inc, rajesh
UNION ALL
SELECT :venue_id ::uuid, fire_inc.id, 'STAFF_ACK', lakshmi.id,
       NOW() - INTERVAL '1 hour 50 minutes',
       '{"ack_type":"i_am_safe","via":"app"}'::jsonb
FROM fire_inc, lakshmi
UNION ALL
SELECT :venue_id ::uuid, fire_inc.id, 'RESOLVED', sh.id,
       NOW() - INTERVAL '1 hour 45 minutes',
       '{"resolution":"Drill completed successfully. All staff accounted for."}'::jsonb
FROM fire_inc, sh
-- SECURITY check (7 events)
UNION ALL
SELECT :venue_id ::uuid, sec_inc.id, 'DECLARED', anil.id,
       NOW() - INTERVAL '30 minutes',
       '{"severity":"SEV3","description":"Unattended package near T2 parking entrance"}'::jsonb
FROM sec_inc, anil
UNION ALL
SELECT :venue_id ::uuid, sec_inc.id, 'STAFF_ON_SITE', anil.id,
       NOW() - INTERVAL '28 minutes',
       '{"location":"T2-Parking-Entrance","note":"Visual inspection underway"}'::jsonb
FROM sec_inc, anil
UNION ALL
SELECT :venue_id ::uuid, sec_inc.id, 'ESCALATED_LEVEL_1', NULL,
       NOW() - INTERVAL '25 minutes',
       '{"reason":"awaiting senior verification","escalated_to":"FLOOR_SUPERVISOR"}'::jsonb
FROM sec_inc
UNION ALL
SELECT :venue_id ::uuid, sec_inc.id, 'STAFF_ON_SITE', priya.id,
       NOW() - INTERVAL '22 minutes',
       '{"location":"T2-Parking-Entrance","note":"Cross-checked with CCTV; identified owner"}'::jsonb
FROM sec_inc, priya
UNION ALL
SELECT :venue_id ::uuid, sec_inc.id, 'STAFF_ACK', vikram.id,
       NOW() - INTERVAL '20 minutes',
       '{"ack_type":"i_am_safe","via":"app"}'::jsonb
FROM sec_inc, vikram
UNION ALL
SELECT :venue_id ::uuid, sec_inc.id, 'CONTAINED', priya.id,
       NOW() - INTERVAL '18 minutes',
       '{"resolution":"False alarm. Package belongs to T2 retail tenant employee."}'::jsonb
FROM sec_inc, priya
UNION ALL
SELECT :venue_id ::uuid, sec_inc.id, 'NOTE', priya.id,
       NOW() - INTERVAL '10 minutes',
       '{"text":"Continuing to monitor T2 parking area for next 4 hrs as precaution."}'::jsonb
FROM sec_inc, priya;

-- ─── 7. Equipment items (BR-21 demo data) ─────────────────────────────────
-- Realistic compliance state: most green (>90d to next service), one each
-- expiring at the 90/30/7-day thresholds, plus one OVERDUE — exercises the
-- full expiry-status colour ramp on the Equipment tab. Idempotent guard:
-- name LIKE '[DEMO]%' marker (matches reset-script delete filter).

INSERT INTO equipment_items (
  venue_id, name, category, location_description, last_serviced_at, next_service_due, is_active
)
VALUES
  (:venue_id, '[DEMO] FE-T1-001', 'FIRE_EXTINGUISHER', 'T1 Reception, beside lift', CURRENT_DATE - INTERVAL '60 days', CURRENT_DATE + INTERVAL '305 days', TRUE),
  (:venue_id, '[DEMO] FE-T1-002', 'FIRE_EXTINGUISHER', 'T1 Stair, ground level', CURRENT_DATE - INTERVAL '90 days', CURRENT_DATE + INTERVAL '275 days', TRUE),
  (:venue_id, '[DEMO] FE-T2-001', 'FIRE_EXTINGUISHER', 'T2 Reception', CURRENT_DATE - INTERVAL '300 days', CURRENT_DATE + INTERVAL '65 days', TRUE),
  (:venue_id, '[DEMO] FE-T2-PARK-01', 'FIRE_EXTINGUISHER', 'T2 Parking, level B1', CURRENT_DATE - INTERVAL '335 days', CURRENT_DATE + INTERVAL '20 days', TRUE),
  (:venue_id, '[DEMO] AED-T1-MAIN', 'AED', 'T1 Reception desk', CURRENT_DATE - INTERVAL '150 days', CURRENT_DATE + INTERVAL '215 days', TRUE),
  (:venue_id, '[DEMO] SD-T1-G1-A', 'SMOKE_DETECTOR', 'T1 Ground Floor — corridor west', CURRENT_DATE - INTERVAL '358 days', CURRENT_DATE + INTERVAL '6 days', TRUE),
  (:venue_id, '[DEMO] EL-T2-STAIR-1', 'EMERGENCY_LIGHT', 'T2 Stair, exit door', CURRENT_DATE - INTERVAL '730 days', CURRENT_DATE - INTERVAL '12 days', TRUE),
  (:venue_id, '[DEMO] FAK-T1-RECEP', 'FIRST_AID_KIT', 'T1 Reception under desk', CURRENT_DATE - INTERVAL '40 days', CURRENT_DATE + INTERVAL '325 days', TRUE),
  (:venue_id, '[DEMO] FAK-T2-RECEP', 'FIRST_AID_KIT', 'T2 Reception under desk', CURRENT_DATE - INTERVAL '40 days', CURRENT_DATE + INTERVAL '325 days', TRUE);

-- ─── 8. Summary ─────────────────────────────────────────────────────────────
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
  WHERE venue_id = :venue_id AND description LIKE '[DEMO] %'
UNION ALL
SELECT 'incident_timeline events', COUNT(*) FROM incident_timeline
  WHERE venue_id = :venue_id
UNION ALL
SELECT 'equipment items ([DEMO])', COUNT(*) FROM equipment_items
  WHERE venue_id = :venue_id AND name LIKE '[DEMO]%';

COMMIT;
