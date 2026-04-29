-- Migration 004: Performance indexes
-- All queries are venue-scoped — venue_id is the primary filter on every index

-- Venues
CREATE INDEX idx_venues_type ON venues(type);

-- Floors
CREATE INDEX idx_floors_venue ON floors(venue_id);

-- Zones
CREATE INDEX idx_zones_venue ON zones(venue_id);
CREATE INDEX idx_zones_floor ON zones(floor_id);
CREATE INDEX idx_zones_status ON zones(venue_id, current_status);

-- Zone Status Log
CREATE INDEX idx_zone_log_zone ON zone_status_log(zone_id, changed_at DESC);
CREATE INDEX idx_zone_log_venue ON zone_status_log(venue_id, changed_at DESC);

-- Staff
CREATE INDEX idx_staff_venue ON staff(venue_id);
CREATE INDEX idx_staff_phone ON staff(phone);
CREATE INDEX idx_staff_role ON staff(venue_id, role) WHERE is_active = TRUE;
CREATE INDEX idx_staff_firebase ON staff(firebase_auth_id);

-- Staff Certifications
CREATE INDEX idx_certs_staff ON staff_certifications(staff_id);
CREATE INDEX idx_certs_expiry ON staff_certifications(venue_id, expires_at);

-- Shift Instances
CREATE INDEX idx_shift_instances_venue_date ON shift_instances(venue_id, shift_date);

-- Staff Zone Assignments
CREATE INDEX idx_assignments_shift ON staff_zone_assignments(shift_instance_id);
CREATE INDEX idx_assignments_staff ON staff_zone_assignments(staff_id);
CREATE INDEX idx_assignments_zone ON staff_zone_assignments(zone_id);

-- Schedule Templates
CREATE INDEX idx_templates_venue_active ON schedule_templates(venue_id) WHERE is_active = TRUE;
CREATE INDEX idx_templates_role ON schedule_templates(venue_id, assigned_role);

-- Task Instances — most read-heavy table in the system
CREATE INDEX idx_tasks_venue_staff ON task_instances(venue_id, assigned_staff_id);
CREATE INDEX idx_tasks_venue_status ON task_instances(venue_id, status);
CREATE INDEX idx_tasks_due_at ON task_instances(venue_id, due_at);
CREATE INDEX idx_tasks_expires ON task_instances(venue_id, window_expires_at) WHERE status IN ('PENDING', 'IN_PROGRESS');
CREATE INDEX idx_tasks_idempotency ON task_instances(idempotency_key);

-- Task Completions
CREATE INDEX idx_completions_task ON task_completions(task_instance_id);
CREATE INDEX idx_completions_staff ON task_completions(completed_by_staff_id);

-- Escalation Events
CREATE INDEX idx_escalations_task ON escalation_events(task_instance_id);
CREATE INDEX idx_escalations_venue ON escalation_events(venue_id, escalated_at DESC);

-- Incidents
CREATE INDEX idx_incidents_venue_status ON incidents(venue_id, status);
CREATE INDEX idx_incidents_venue_type ON incidents(venue_id, incident_type);
CREATE INDEX idx_incidents_declared ON incidents(venue_id, declared_at DESC);

-- Incident Timeline
CREATE INDEX idx_timeline_incident ON incident_timeline(incident_id, occurred_at DESC);

-- Communications
CREATE INDEX idx_comms_venue ON communications(venue_id, created_at DESC);

-- Comm Deliveries
CREATE INDEX idx_deliveries_comm ON comm_deliveries(communication_id);
CREATE INDEX idx_deliveries_staff ON comm_deliveries(recipient_staff_id);
CREATE INDEX idx_deliveries_status ON comm_deliveries(venue_id, status);

-- Equipment
CREATE INDEX idx_equipment_venue ON equipment_items(venue_id);
CREATE INDEX idx_equipment_expiry ON equipment_items(venue_id, next_service_due);

-- Audit Logs
CREATE INDEX idx_audit_venue ON audit_logs(venue_id, logged_at DESC);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);

-- VMS
CREATE INDEX idx_vms_ep_venue ON vms_entry_points(venue_id);
CREATE INDEX idx_vms_visits_venue ON vms_visit_records(venue_id, checked_in_at DESC);
CREATE INDEX idx_vms_visits_phone ON vms_visit_records(visitor_phone);
CREATE INDEX idx_vms_visits_active ON vms_visit_records(venue_id, status) WHERE status = 'CHECKED_IN';
