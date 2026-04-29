-- Migration 003: Row Level Security policies
-- EC-01, EC-02: RLS enforced on every table, venue_id isolation

-- ─── Helper: get current session context ──────────────────────────────────────

CREATE OR REPLACE FUNCTION current_venue_id() RETURNS UUID
LANGUAGE sql STABLE
AS $$ SELECT NULLIF(current_setting('app.current_venue_id', TRUE), '')::UUID $$;

CREATE OR REPLACE FUNCTION current_staff_id() RETURNS UUID
LANGUAGE sql STABLE
AS $$ SELECT NULLIF(current_setting('app.current_staff_id', TRUE), '')::UUID $$;

CREATE OR REPLACE FUNCTION app_current_role() RETURNS TEXT
LANGUAGE sql STABLE
AS $$ SELECT NULLIF(current_setting('app.current_role', TRUE), '') $$;

CREATE OR REPLACE FUNCTION is_sc_ops() RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$ SELECT current_setting('app.is_sc_ops', TRUE) = 'true' $$;

-- ─── Venues ───────────────────────────────────────────────────────────────────
-- Venue data: staff can read their own venue; SC Ops can read all
CREATE POLICY venues_select ON venues
  FOR SELECT USING (id = current_venue_id() OR is_sc_ops());

CREATE POLICY venues_insert ON venues
  FOR INSERT WITH CHECK (is_sc_ops());

CREATE POLICY venues_update ON venues
  FOR UPDATE USING (id = current_venue_id() AND app_current_role() IN ('SH', 'DSH') OR is_sc_ops());

-- ─── Venue Subscriptions ──────────────────────────────────────────────────────
CREATE POLICY venue_subs_select ON venue_subscriptions
  FOR SELECT USING (venue_id = current_venue_id() OR is_sc_ops());

CREATE POLICY venue_subs_insert ON venue_subscriptions
  FOR INSERT WITH CHECK (is_sc_ops());

-- ─── Floors ───────────────────────────────────────────────────────────────────
CREATE POLICY floors_select ON floors
  FOR SELECT USING (venue_id = current_venue_id() OR is_sc_ops());

CREATE POLICY floors_insert ON floors
  FOR INSERT WITH CHECK (venue_id = current_venue_id() AND app_current_role() IN ('SH', 'DSH') OR is_sc_ops());

CREATE POLICY floors_update ON floors
  FOR UPDATE USING (venue_id = current_venue_id() AND app_current_role() IN ('SH', 'DSH') OR is_sc_ops());

-- ─── Zones ────────────────────────────────────────────────────────────────────
CREATE POLICY zones_select ON zones
  FOR SELECT USING (venue_id = current_venue_id() OR is_sc_ops());

CREATE POLICY zones_insert ON zones
  FOR INSERT WITH CHECK (venue_id = current_venue_id() AND app_current_role() IN ('SH', 'DSH') OR is_sc_ops());

CREATE POLICY zones_update ON zones
  FOR UPDATE USING (venue_id = current_venue_id() AND app_current_role() IN ('SH', 'DSH', 'SHIFT_COMMANDER', 'GM') OR is_sc_ops());

-- ─── Zone Status Log (no UPDATE/DELETE — append-only) ────────────────────────
CREATE POLICY zone_log_select ON zone_status_log
  FOR SELECT USING (venue_id = current_venue_id() OR is_sc_ops());

CREATE POLICY zone_log_insert ON zone_status_log
  FOR INSERT WITH CHECK (venue_id = current_venue_id());

-- ─── Staff ────────────────────────────────────────────────────────────────────
CREATE POLICY staff_select ON staff
  FOR SELECT USING (venue_id = current_venue_id() OR is_sc_ops());

CREATE POLICY staff_insert ON staff
  FOR INSERT WITH CHECK (venue_id = current_venue_id() AND app_current_role() = 'SH' OR is_sc_ops());

CREATE POLICY staff_update ON staff
  FOR UPDATE USING (
    (venue_id = current_venue_id() AND (id = current_staff_id() OR app_current_role() = 'SH'))
    OR is_sc_ops()
  );

-- ─── Staff Certifications ─────────────────────────────────────────────────────
CREATE POLICY staff_certs_select ON staff_certifications
  FOR SELECT USING (venue_id = current_venue_id() OR is_sc_ops());

CREATE POLICY staff_certs_insert ON staff_certifications
  FOR INSERT WITH CHECK (venue_id = current_venue_id() AND app_current_role() IN ('SH', 'DSH'));

-- ─── Shifts ───────────────────────────────────────────────────────────────────
CREATE POLICY shifts_select ON shifts
  FOR SELECT USING (venue_id = current_venue_id() OR is_sc_ops());

CREATE POLICY shifts_insert ON shifts
  FOR INSERT WITH CHECK (venue_id = current_venue_id() AND app_current_role() IN ('SH', 'DSH') OR is_sc_ops());

-- ─── Shift Instances ──────────────────────────────────────────────────────────
CREATE POLICY shift_instances_select ON shift_instances
  FOR SELECT USING (venue_id = current_venue_id() OR is_sc_ops());

CREATE POLICY shift_instances_insert ON shift_instances
  FOR INSERT WITH CHECK (venue_id = current_venue_id() AND app_current_role() IN ('SH', 'DSH', 'SHIFT_COMMANDER'));

CREATE POLICY shift_instances_update ON shift_instances
  FOR UPDATE USING (venue_id = current_venue_id() AND app_current_role() IN ('SH', 'DSH', 'SHIFT_COMMANDER'));

-- ─── Shift Handovers ──────────────────────────────────────────────────────────
CREATE POLICY handovers_select ON shift_handovers
  FOR SELECT USING (venue_id = current_venue_id() OR is_sc_ops());

CREATE POLICY handovers_insert ON shift_handovers
  FOR INSERT WITH CHECK (venue_id = current_venue_id() AND app_current_role() IN ('SH', 'DSH', 'SHIFT_COMMANDER'));

CREATE POLICY handovers_update ON shift_handovers
  FOR UPDATE USING (venue_id = current_venue_id() AND app_current_role() IN ('SH', 'DSH', 'SHIFT_COMMANDER'));

-- ─── Staff Zone Assignments ───────────────────────────────────────────────────
CREATE POLICY zone_assignments_select ON staff_zone_assignments
  FOR SELECT USING (venue_id = current_venue_id() OR is_sc_ops());

CREATE POLICY zone_assignments_insert ON staff_zone_assignments
  FOR INSERT WITH CHECK (venue_id = current_venue_id() AND app_current_role() IN ('SH', 'DSH', 'SHIFT_COMMANDER'));

CREATE POLICY zone_assignments_delete ON staff_zone_assignments
  FOR DELETE USING (venue_id = current_venue_id() AND app_current_role() IN ('SH', 'DSH', 'SHIFT_COMMANDER'));

-- ─── Schedule Templates ───────────────────────────────────────────────────────
CREATE POLICY templates_select ON schedule_templates
  FOR SELECT USING (venue_id = current_venue_id() OR is_sc_ops());

CREATE POLICY templates_insert ON schedule_templates
  FOR INSERT WITH CHECK (is_sc_ops());

CREATE POLICY templates_update ON schedule_templates
  FOR UPDATE USING (is_sc_ops());

CREATE POLICY templates_delete ON schedule_templates
  FOR DELETE USING (is_sc_ops());

-- ─── Task Instances ───────────────────────────────────────────────────────────
-- Staff can only see their own tasks; SH/DSH/SC/GM see all venue tasks
CREATE POLICY tasks_select ON task_instances
  FOR SELECT USING (
    venue_id = current_venue_id()
    AND (
      assigned_staff_id = current_staff_id()
      OR app_current_role() IN ('SH', 'DSH', 'SHIFT_COMMANDER', 'GM', 'AUDITOR')
    )
  );

CREATE POLICY tasks_insert ON task_instances
  FOR INSERT WITH CHECK (venue_id = current_venue_id());

CREATE POLICY tasks_update ON task_instances
  FOR UPDATE USING (venue_id = current_venue_id());

-- ─── Task Completions ─────────────────────────────────────────────────────────
CREATE POLICY completions_select ON task_completions
  FOR SELECT USING (venue_id = current_venue_id() OR is_sc_ops());

CREATE POLICY completions_insert ON task_completions
  FOR INSERT WITH CHECK (venue_id = current_venue_id());

-- ─── Escalation Events ────────────────────────────────────────────────────────
CREATE POLICY escalations_select ON escalation_events
  FOR SELECT USING (venue_id = current_venue_id() OR is_sc_ops());

CREATE POLICY escalations_insert ON escalation_events
  FOR INSERT WITH CHECK (venue_id = current_venue_id());

-- ─── Incidents ────────────────────────────────────────────────────────────────
CREATE POLICY incidents_select ON incidents
  FOR SELECT USING (venue_id = current_venue_id() OR is_sc_ops());

CREATE POLICY incidents_insert ON incidents
  FOR INSERT WITH CHECK (
    venue_id = current_venue_id()
    AND app_current_role() IN ('SH', 'DSH', 'SHIFT_COMMANDER', 'GM', 'FM')
  );

CREATE POLICY incidents_update ON incidents
  FOR UPDATE USING (
    venue_id = current_venue_id()
    AND app_current_role() IN ('SH', 'DSH', 'SHIFT_COMMANDER', 'GM')
  );

-- ─── Incident Timeline (no UPDATE/DELETE — append-only) ──────────────────────
CREATE POLICY timeline_select ON incident_timeline
  FOR SELECT USING (venue_id = current_venue_id() OR is_sc_ops());

CREATE POLICY timeline_insert ON incident_timeline
  FOR INSERT WITH CHECK (venue_id = current_venue_id());

-- ─── Incident Reports ─────────────────────────────────────────────────────────
CREATE POLICY reports_select ON incident_reports
  FOR SELECT USING (venue_id = current_venue_id() OR is_sc_ops());

CREATE POLICY reports_insert ON incident_reports
  FOR INSERT WITH CHECK (venue_id = current_venue_id());

-- ─── Communications ───────────────────────────────────────────────────────────
CREATE POLICY comms_select ON communications
  FOR SELECT USING (venue_id = current_venue_id() OR is_sc_ops());

CREATE POLICY comms_insert ON communications
  FOR INSERT WITH CHECK (
    venue_id = current_venue_id()
    AND app_current_role() IN ('SH', 'DSH', 'SHIFT_COMMANDER', 'GM', 'FM')
  );

-- ─── Comm Deliveries ─────────────────────────────────────────────────────────
CREATE POLICY deliveries_select ON comm_deliveries
  FOR SELECT USING (venue_id = current_venue_id() OR is_sc_ops());

CREATE POLICY deliveries_insert ON comm_deliveries
  FOR INSERT WITH CHECK (venue_id = current_venue_id());

CREATE POLICY deliveries_update ON comm_deliveries
  FOR UPDATE USING (venue_id = current_venue_id());

-- ─── Equipment Items ──────────────────────────────────────────────────────────
CREATE POLICY equipment_select ON equipment_items
  FOR SELECT USING (venue_id = current_venue_id() OR is_sc_ops());

CREATE POLICY equipment_insert ON equipment_items
  FOR INSERT WITH CHECK (venue_id = current_venue_id() AND app_current_role() IN ('SH', 'DSH', 'FM'));

CREATE POLICY equipment_update ON equipment_items
  FOR UPDATE USING (venue_id = current_venue_id() AND app_current_role() IN ('SH', 'DSH', 'FM'));

-- ─── Change Requests ─────────────────────────────────────────────────────────
CREATE POLICY cr_select ON change_requests
  FOR SELECT USING (venue_id = current_venue_id() OR is_sc_ops());

CREATE POLICY cr_insert ON change_requests
  FOR INSERT WITH CHECK (venue_id = current_venue_id());

-- ─── Audit Logs (SELECT only — no UPDATE/DELETE ever — NFR-17) ───────────────
CREATE POLICY audit_select ON audit_logs
  FOR SELECT USING (venue_id = current_venue_id() AND app_current_role() IN ('SH', 'AUDITOR') OR is_sc_ops());

CREATE POLICY audit_insert ON audit_logs
  FOR INSERT WITH CHECK (venue_id = current_venue_id());

-- ─── VMS Entry Points ─────────────────────────────────────────────────────────
CREATE POLICY vms_ep_select ON vms_entry_points
  FOR SELECT USING (venue_id = current_venue_id() OR is_sc_ops());

CREATE POLICY vms_ep_insert ON vms_entry_points
  FOR INSERT WITH CHECK (venue_id = current_venue_id() AND app_current_role() IN ('SH', 'DSH') OR is_sc_ops());

CREATE POLICY vms_ep_update ON vms_entry_points
  FOR UPDATE USING (venue_id = current_venue_id() AND app_current_role() IN ('SH', 'DSH'));

-- ─── VMS Visit Records ────────────────────────────────────────────────────────
CREATE POLICY vms_visits_select ON vms_visit_records
  FOR SELECT USING (venue_id = current_venue_id() OR is_sc_ops());

CREATE POLICY vms_visits_insert ON vms_visit_records
  FOR INSERT WITH CHECK (venue_id = current_venue_id());

CREATE POLICY vms_visits_update ON vms_visit_records
  FOR UPDATE USING (venue_id = current_venue_id() AND app_current_role() IN ('SH', 'DSH', 'GROUND_STAFF', 'FLOOR_SUPERVISOR'));
