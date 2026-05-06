-- ═══════════════════════════════════════════════════════════════════════════
-- reset-hyderabad-demo.sql — undo what seed-hyderabad-demo.sql created.
--
-- Removes seed-marked rows ONLY:
--   - staff with phone like '+919999%'
--   - shifts with name like '[DEMO] %'
--   - shift_instances and staff_zone_assignments cascade-delete from above
--   - incidents with description like '[DEMO] %'
--   - zone_status_log entries from seed staff (cascade via staff delete)
--   - resets T1-Reception zone status back to ALL_CLEAR
--
-- Existing TEST_DEMO_* staff and any non-seed data are NOT touched.
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

BEGIN;

\set venue_id '''096a3701-beb0-4ffe-9e74-43af3c26e09f'''

-- 1. Remove seed-marked incidents (no FK to staff/zones; safe direct delete)
DELETE FROM incidents
WHERE venue_id = :venue_id AND description LIKE '[DEMO] %';

-- 2. Reset T1-Reception zone status (was set to ATTENTION by seed)
UPDATE zones
SET current_status = 'ALL_CLEAR', updated_at = NOW()
WHERE venue_id = :venue_id AND name = 'T1-Reception';

-- 3. Remove zone_status_log entries from seed staff (we'll cascade via staff
--    delete below; explicit here for clarity)
DELETE FROM zone_status_log
WHERE venue_id = :venue_id
  AND changed_by_staff_id IN (
    SELECT id FROM staff WHERE venue_id = :venue_id AND phone LIKE '+919999%'
  );

-- 4. Remove staff_zone_assignments tied to seed staff or seed shift instances
--    (FKs cascade from shift_instances and staff)
DELETE FROM staff_zone_assignments
WHERE venue_id = :venue_id
  AND (
    staff_id IN (SELECT id FROM staff WHERE venue_id = :venue_id AND phone LIKE '+919999%')
    OR shift_instance_id IN (
      SELECT shift_instances.id FROM shift_instances
      JOIN shifts ON shifts.id = shift_instances.shift_id
      WHERE shifts.venue_id = :venue_id AND shifts.name LIKE '[DEMO] %'
    )
  );

-- 5. Remove seed shift_instances (FK to seed shifts)
DELETE FROM shift_instances
WHERE venue_id = :venue_id
  AND shift_id IN (
    SELECT id FROM shifts WHERE venue_id = :venue_id AND name LIKE '[DEMO] %'
  );

-- 6. Remove seed shifts
DELETE FROM shifts
WHERE venue_id = :venue_id AND name LIKE '[DEMO] %';

-- 7. Remove seed staff
DELETE FROM staff
WHERE venue_id = :venue_id AND phone LIKE '+919999%';

-- 8. Remove seed equipment items
DELETE FROM equipment_items
WHERE venue_id = :venue_id AND name LIKE '[DEMO]%';

-- ─── Summary ────────────────────────────────────────────────────────────────
\echo ''
\echo '═══════════════════════════════════════════════════════════════'
\echo '  Reset complete'
\echo '═══════════════════════════════════════════════════════════════'

SELECT 'staff (seed remaining)' AS item, COUNT(*) AS count FROM staff
  WHERE venue_id = :venue_id AND phone LIKE '+919999%'
UNION ALL
SELECT 'shifts (seed remaining)', COUNT(*) FROM shifts
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
SELECT 'incidents (seed remaining)', COUNT(*) FROM incidents
  WHERE venue_id = :venue_id AND description LIKE '[DEMO] %'
UNION ALL
SELECT 'incident_timeline events', COUNT(*) FROM incident_timeline
  WHERE venue_id = :venue_id
UNION ALL
SELECT 'equipment items (seed remaining)', COUNT(*) FROM equipment_items
  WHERE venue_id = :venue_id AND name LIKE '[DEMO]%';

COMMIT;
