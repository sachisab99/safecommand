-- Migration 005: Seed schedule templates per venue type (BR-25)
-- These are template definitions for the Ops Console to clone when onboarding a new venue.
-- Stored in a separate seed table, not directly in schedule_templates (which are venue-scoped).

CREATE TABLE schedule_template_seeds (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_type      venue_type_enum NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  frequency       frequency_type_enum NOT NULL,
  assigned_role   staff_role_enum NOT NULL,
  evidence_type   evidence_type_enum NOT NULL DEFAULT 'NONE',
  escalation_chain staff_role_enum[] NOT NULL DEFAULT '{}',
  escalation_interval_minutes INTEGER NOT NULL DEFAULT 30,
  sort_order      INTEGER NOT NULL DEFAULT 0
);

-- ─── HOSPITAL Templates ───────────────────────────────────────────────────────

INSERT INTO schedule_template_seeds (venue_type, title, description, frequency, assigned_role, evidence_type, escalation_chain, escalation_interval_minutes, sort_order) VALUES
('HOSPITAL', 'Emergency Exit Inspection', 'Verify all emergency exits are unobstructed and illuminated', 'EVERY_2H', 'FLOOR_SUPERVISOR', 'PHOTO', ARRAY['SHIFT_COMMANDER', 'SH']::staff_role_enum[], 30, 10),
('HOSPITAL', 'Fire Extinguisher Check', 'Inspect pressure gauge and pin seal on all extinguishers on floor', 'DAILY', 'FLOOR_SUPERVISOR', 'CHECKLIST', ARRAY['SHIFT_COMMANDER', 'SH']::staff_role_enum[], 60, 20),
('HOSPITAL', 'ICU Zone Security Patrol', 'Complete perimeter patrol of ICU zone — two-person required', 'EVERY_4H', 'GROUND_STAFF', 'TEXT', ARRAY['FLOOR_SUPERVISOR', 'SHIFT_COMMANDER', 'SH']::staff_role_enum[], 20, 30),
('HOSPITAL', 'Main Entrance CCTV Status', 'Verify all CCTV feeds are active and recording', 'EVERY_4H', 'GROUND_STAFF', 'PHOTO', ARRAY['FLOOR_SUPERVISOR', 'SHIFT_COMMANDER']::staff_role_enum[], 30, 40),
('HOSPITAL', 'Fire Alarm Panel Check', 'Inspect fire alarm panel — no fault indicators', 'DAILY', 'SHIFT_COMMANDER', 'PHOTO', ARRAY['SH']::staff_role_enum[], 60, 50),
('HOSPITAL', 'Evacuation Route Walkthrough', 'Walk full evacuation route and confirm signage visible', 'WEEKLY', 'SHIFT_COMMANDER', 'CHECKLIST', ARRAY['SH']::staff_role_enum[], 120, 60),
('HOSPITAL', 'Oxygen Store Room Security', 'Verify oxygen store room is locked and ventilation active', 'EVERY_6H', 'GROUND_STAFF', 'PHOTO', ARRAY['FLOOR_SUPERVISOR', 'SHIFT_COMMANDER', 'SH']::staff_role_enum[], 20, 70),
('HOSPITAL', 'Shift Briefing Acknowledgement', 'Shift commander confirms all staff have acknowledged shift briefing', 'DAILY', 'SHIFT_COMMANDER', 'CHECKLIST', ARRAY['SH']::staff_role_enum[], 30, 80);

-- ─── MALL Templates ───────────────────────────────────────────────────────────

INSERT INTO schedule_template_seeds (venue_type, title, description, frequency, assigned_role, evidence_type, escalation_chain, escalation_interval_minutes, sort_order) VALUES
('MALL', 'Parking Level Security Patrol', 'Complete patrol of parking level — note any suspicious activity', 'EVERY_2H', 'GROUND_STAFF', 'TEXT', ARRAY['FLOOR_SUPERVISOR', 'SHIFT_COMMANDER', 'SH']::staff_role_enum[], 20, 10),
('MALL', 'Food Court Emergency Exit Check', 'All emergency exits in food court unobstructed and lit', 'EVERY_4H', 'FLOOR_SUPERVISOR', 'PHOTO', ARRAY['SHIFT_COMMANDER', 'SH']::staff_role_enum[], 30, 20),
('MALL', 'Control Room CCTV Audit', 'Verify all CCTV cameras functional — log non-operational units', 'EVERY_6H', 'SHIFT_COMMANDER', 'CHECKLIST', ARRAY['SH']::staff_role_enum[], 60, 30),
('MALL', 'Retailer Emergency Drill Readiness', 'Confirm anchor tenant security staff have emergency contacts', 'WEEKLY', 'SHIFT_COMMANDER', 'CHECKLIST', ARRAY['SH']::staff_role_enum[], 120, 40),
('MALL', 'Basement Fire Suppression Check', 'Check basement sprinkler shutoff valves are in open position', 'DAILY', 'SHIFT_COMMANDER', 'PHOTO', ARRAY['SH']::staff_role_enum[], 60, 50),
('MALL', 'Public Area Hazard Walk', 'Walk all public areas — wet floors, loose tiles, broken fixtures', 'EVERY_4H', 'FLOOR_SUPERVISOR', 'TEXT', ARRAY['FM', 'SHIFT_COMMANDER']::staff_role_enum[], 30, 60),
('MALL', 'Main Entry Visitor Count', 'Record current visitor count at main entry point', 'HOURLY', 'GROUND_STAFF', 'NUMERIC', ARRAY['FLOOR_SUPERVISOR']::staff_role_enum[], 15, 70),
('MALL', 'Shift Handover Zone Snapshot', 'Take photo evidence of all zone boards before handover', 'DAILY', 'SHIFT_COMMANDER', 'PHOTO', ARRAY['SH']::staff_role_enum[], 30, 80);

-- ─── HOTEL Templates ──────────────────────────────────────────────────────────

INSERT INTO schedule_template_seeds (venue_type, title, description, frequency, assigned_role, evidence_type, escalation_chain, escalation_interval_minutes, sort_order) VALUES
('HOTEL', 'Hotel Perimeter Patrol', 'Complete external perimeter patrol — note access points', 'EVERY_4H', 'GROUND_STAFF', 'TEXT', ARRAY['FLOOR_SUPERVISOR', 'SHIFT_COMMANDER', 'SH']::staff_role_enum[], 20, 10),
('HOTEL', 'Emergency Assembly Point Check', 'Confirm emergency assembly point is clear and accessible', 'DAILY', 'SHIFT_COMMANDER', 'PHOTO', ARRAY['SH']::staff_role_enum[], 60, 20),
('HOTEL', 'Guest Floor Smoke Detector Audit', 'Test smoke detector function on assigned guest floors', 'WEEKLY', 'FLOOR_SUPERVISOR', 'CHECKLIST', ARRAY['SHIFT_COMMANDER', 'SH']::staff_role_enum[], 60, 30),
('HOTEL', 'Vehicle Parking Security', 'Patrol valet and guest parking — suspicious vehicle check', 'EVERY_4H', 'GROUND_STAFF', 'TEXT', ARRAY['FLOOR_SUPERVISOR', 'SHIFT_COMMANDER']::staff_role_enum[], 30, 40),
('HOTEL', 'Main Kitchen Fire Suppression', 'Confirm kitchen hood suppression system armed and accessible', 'DAILY', 'FM', 'PHOTO', ARRAY['SH']::staff_role_enum[], 60, 50),
('HOTEL', 'Pool & Spa Area Safety Check', 'Verify lifeguard post staffed, first aid kit present, CCTV active', 'EVERY_6H', 'FLOOR_SUPERVISOR', 'CHECKLIST', ARRAY['SHIFT_COMMANDER', 'SH']::staff_role_enum[], 30, 60),
('HOTEL', 'Night Audit Safety Walk', 'Complete building safety walk — all exits, lobby, parking', 'DAILY', 'SHIFT_COMMANDER', 'CHECKLIST', ARRAY['SH']::staff_role_enum[], 30, 70),
('HOTEL', 'Delivery Bay Access Log', 'Record all vendor delivery bay access — name, time, goods', 'EVERY_4H', 'GROUND_STAFF', 'TEXT', ARRAY['FLOOR_SUPERVISOR', 'SHIFT_COMMANDER']::staff_role_enum[], 20, 80);

-- ─── CORPORATE Templates ──────────────────────────────────────────────────────

INSERT INTO schedule_template_seeds (venue_type, title, description, frequency, assigned_role, evidence_type, escalation_chain, escalation_interval_minutes, sort_order) VALUES
('CORPORATE', 'Server Room Access Log', 'Record all server room entries — badge scan + visitor log', 'EVERY_4H', 'GROUND_STAFF', 'TEXT', ARRAY['FLOOR_SUPERVISOR', 'SHIFT_COMMANDER', 'SH']::staff_role_enum[], 20, 10),
('CORPORATE', 'Reception Emergency Procedure Check', 'Verify reception team has emergency contacts and evacuation map', 'WEEKLY', 'SHIFT_COMMANDER', 'CHECKLIST', ARRAY['SH']::staff_role_enum[], 60, 20),
('CORPORATE', 'Access Control Panel Audit', 'Check all biometric and card access panels — no faults', 'DAILY', 'SHIFT_COMMANDER', 'PHOTO', ARRAY['SH']::staff_role_enum[], 60, 30),
('CORPORATE', 'Visitor Badge Reconciliation', 'Confirm all visitor badges issued today have been returned', 'DAILY', 'GROUND_STAFF', 'NUMERIC', ARRAY['FLOOR_SUPERVISOR', 'SHIFT_COMMANDER']::staff_role_enum[], 30, 40),
('CORPORATE', 'Basement / Garage Patrol', 'Complete patrol of basement parking — tail-gating risk check', 'EVERY_4H', 'GROUND_STAFF', 'TEXT', ARRAY['FLOOR_SUPERVISOR', 'SHIFT_COMMANDER']::staff_role_enum[], 20, 50),
('CORPORATE', 'Fire Warden Floor Check', 'Floor warden confirms emergency exits and warden kit present', 'WEEKLY', 'FLOOR_SUPERVISOR', 'CHECKLIST', ARRAY['SHIFT_COMMANDER', 'SH']::staff_role_enum[], 60, 60),
('CORPORATE', 'After-Hours Zone Lockdown', 'Confirm all secure zones are locked after business hours', 'DAILY', 'SHIFT_COMMANDER', 'CHECKLIST', ARRAY['SH']::staff_role_enum[], 30, 70),
('CORPORATE', 'Contractor Work Permit Verification', 'Verify all active contractors have valid work permits on file', 'DAILY', 'FLOOR_SUPERVISOR', 'TEXT', ARRAY['SHIFT_COMMANDER', 'SH']::staff_role_enum[], 30, 80);

-- Function to provision templates for a new venue from seeds
CREATE OR REPLACE FUNCTION provision_venue_templates(p_venue_id UUID, p_venue_type venue_type_enum)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  INSERT INTO schedule_templates (
    venue_id, title, description, frequency, assigned_role,
    evidence_type, escalation_chain, escalation_interval_minutes
  )
  SELECT
    p_venue_id, title, description, frequency, assigned_role,
    evidence_type, escalation_chain, escalation_interval_minutes
  FROM schedule_template_seeds
  WHERE venue_type = p_venue_type
  ORDER BY sort_order;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
