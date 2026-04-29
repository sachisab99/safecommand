-- Migration 002: All tables (venue_id on every table — EC-03)
-- RLS is ENABLED on every table — policies are in 003_rls.sql

-- ─── Tenant context function ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_tenant_context(
  p_venue_id UUID,
  p_staff_id UUID,
  p_role TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM set_config('app.current_venue_id', p_venue_id::TEXT, TRUE);
  PERFORM set_config('app.current_staff_id', p_staff_id::TEXT, TRUE);
  PERFORM set_config('app.current_role', p_role, TRUE);
END;
$$;

-- ─── Venues ───────────────────────────────────────────────────────────────────

CREATE TABLE venues (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_code          TEXT NOT NULL UNIQUE,
  name                TEXT NOT NULL,
  type                venue_type_enum NOT NULL,
  city                TEXT NOT NULL,
  address             TEXT,
  subscription_tier   subscription_tier_enum NOT NULL DEFAULT 'ESSENTIAL',
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  festival_mode       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE venues ENABLE ROW LEVEL SECURITY;

-- Venue code auto-generator: SC-[TYPE]-[CITY]-[SEQ] (BR-02)
CREATE SEQUENCE venue_seq START 1;
CREATE OR REPLACE FUNCTION generate_venue_code(
  p_type venue_type_enum,
  p_city TEXT
) RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_type_code TEXT;
  v_city_code TEXT;
  v_seq       TEXT;
BEGIN
  v_type_code := CASE p_type
    WHEN 'HOSPITAL'  THEN 'HOS'
    WHEN 'MALL'      THEN 'MAL'
    WHEN 'HOTEL'     THEN 'HOT'
    WHEN 'CORPORATE' THEN 'COR'
  END;
  v_city_code := UPPER(LEFT(REGEXP_REPLACE(p_city, '[^A-Za-z]', '', 'g'), 3));
  v_seq := LPAD(nextval('venue_seq')::TEXT, 5, '0');
  RETURN 'SC-' || v_type_code || '-' || v_city_code || '-' || v_seq;
END;
$$;

-- ─── Venue Subscriptions ──────────────────────────────────────────────────────

CREATE TABLE venue_subscriptions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id          UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  tier              subscription_tier_enum NOT NULL,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at        TIMESTAMPTZ,
  monthly_amount    NUMERIC(10, 2),
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE venue_subscriptions ENABLE ROW LEVEL SECURITY;

-- ─── Floors ───────────────────────────────────────────────────────────────────

CREATE TABLE floors (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id      UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  floor_number  INTEGER NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (venue_id, floor_number)
);
ALTER TABLE floors ENABLE ROW LEVEL SECURITY;

-- ─── Zones ────────────────────────────────────────────────────────────────────

CREATE TABLE zones (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id              UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  floor_id              UUID NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  zone_type             TEXT NOT NULL,
  two_person_required   BOOLEAN NOT NULL DEFAULT FALSE,
  current_status        zone_status_enum NOT NULL DEFAULT 'ALL_CLEAR',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE zones ENABLE ROW LEVEL SECURITY;

-- ─── Zone Status Log (append-only — EC-10) ────────────────────────────────────

CREATE TABLE zone_status_log (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id              UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  zone_id               UUID NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  status                zone_status_enum NOT NULL,
  changed_by_staff_id   UUID,
  changed_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE zone_status_log ENABLE ROW LEVEL SECURITY;

-- ─── Staff ────────────────────────────────────────────────────────────────────

CREATE TABLE staff (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id          UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  firebase_auth_id  TEXT UNIQUE,
  phone             TEXT NOT NULL,
  name              TEXT NOT NULL,
  role              staff_role_enum NOT NULL,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  fcm_token         TEXT,
  whatsapp_number   TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (venue_id, phone)
);
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;

-- ─── Staff Certifications ─────────────────────────────────────────────────────

CREATE TABLE staff_certifications (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id          UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  staff_id          UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  certification_name TEXT NOT NULL,
  issued_at         DATE NOT NULL,
  expires_at        DATE NOT NULL,
  document_url      TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE staff_certifications ENABLE ROW LEVEL SECURITY;

-- ─── Shifts ───────────────────────────────────────────────────────────────────

CREATE TABLE shifts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id      UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  start_time    TIME NOT NULL,
  end_time      TIME NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;

CREATE TABLE shift_instances (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id              UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  shift_id              UUID NOT NULL REFERENCES shifts(id),
  shift_date            DATE NOT NULL,
  commander_staff_id    UUID REFERENCES staff(id),
  status                TEXT NOT NULL DEFAULT 'PENDING',
  activated_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (venue_id, shift_id, shift_date)
);
ALTER TABLE shift_instances ENABLE ROW LEVEL SECURITY;

CREATE TABLE shift_handovers (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id                  UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  outgoing_instance_id      UUID NOT NULL REFERENCES shift_instances(id),
  incoming_instance_id      UUID NOT NULL REFERENCES shift_instances(id),
  notes                     TEXT,
  snapshots                 JSONB,
  outgoing_submitted_at     TIMESTAMPTZ,
  incoming_accepted_at      TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE shift_handovers ENABLE ROW LEVEL SECURITY;

-- ─── Staff Zone Assignments ───────────────────────────────────────────────────

CREATE TABLE staff_zone_assignments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id              UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  shift_instance_id     UUID NOT NULL REFERENCES shift_instances(id) ON DELETE CASCADE,
  staff_id              UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  zone_id               UUID NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  assignment_type       shift_assignment_type_enum NOT NULL DEFAULT 'PRIMARY',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shift_instance_id, staff_id, zone_id)
);
ALTER TABLE staff_zone_assignments ENABLE ROW LEVEL SECURITY;

-- ─── Schedule Templates ───────────────────────────────────────────────────────

CREATE TABLE schedule_templates (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id                      UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  title                         TEXT NOT NULL,
  description                   TEXT,
  frequency                     frequency_type_enum NOT NULL,
  assigned_role                 staff_role_enum NOT NULL,
  evidence_type                 evidence_type_enum NOT NULL DEFAULT 'NONE',
  escalation_chain              staff_role_enum[] NOT NULL DEFAULT '{}',
  escalation_interval_minutes   INTEGER NOT NULL DEFAULT 30,
  is_active                     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE schedule_templates ENABLE ROW LEVEL SECURITY;

-- ─── Task Instances ───────────────────────────────────────────────────────────

CREATE TABLE task_instances (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id            UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  template_id         UUID NOT NULL REFERENCES schedule_templates(id),
  assigned_staff_id   UUID REFERENCES staff(id),
  status              task_status_enum NOT NULL DEFAULT 'PENDING',
  due_at              TIMESTAMPTZ NOT NULL,
  window_expires_at   TIMESTAMPTZ NOT NULL,
  idempotency_key     TEXT NOT NULL UNIQUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE task_instances ENABLE ROW LEVEL SECURITY;

-- ─── Task Completions ─────────────────────────────────────────────────────────

CREATE TABLE task_completions (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id                  UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  task_instance_id          UUID NOT NULL REFERENCES task_instances(id) UNIQUE,
  completed_by_staff_id     UUID NOT NULL REFERENCES staff(id),
  evidence_type             evidence_type_enum NOT NULL,
  evidence_url              TEXT,
  evidence_text             TEXT,
  evidence_numeric          NUMERIC,
  evidence_checklist        JSONB,
  completed_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE task_completions ENABLE ROW LEVEL SECURITY;

-- ─── Escalation Events ────────────────────────────────────────────────────────

CREATE TABLE escalation_events (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id              UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  task_instance_id      UUID NOT NULL REFERENCES task_instances(id),
  level                 INTEGER NOT NULL,
  escalated_to_role     staff_role_enum NOT NULL,
  escalated_to_staff_id UUID REFERENCES staff(id),
  escalated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE escalation_events ENABLE ROW LEVEL SECURITY;

-- ─── Incidents ────────────────────────────────────────────────────────────────

CREATE TABLE incidents (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id                UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  incident_type           incident_type_enum NOT NULL,
  severity                incident_severity_enum NOT NULL,
  zone_id                 UUID REFERENCES zones(id),
  description             TEXT,
  status                  incident_status_enum NOT NULL DEFAULT 'ACTIVE',
  declared_by_staff_id    UUID NOT NULL REFERENCES staff(id),
  declared_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at             TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;

-- ─── Incident Timeline (append-only — EC-10) ──────────────────────────────────

CREATE TABLE incident_timeline (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id          UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  incident_id       UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  event_type        TEXT NOT NULL,
  actor_staff_id    UUID REFERENCES staff(id),
  metadata          JSONB,
  occurred_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE incident_timeline ENABLE ROW LEVEL SECURITY;

-- ─── Incident Reports ─────────────────────────────────────────────────────────

CREATE TABLE incident_reports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id          UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  incident_id       UUID NOT NULL REFERENCES incidents(id) UNIQUE,
  report_url        TEXT,
  generated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE incident_reports ENABLE ROW LEVEL SECURITY;

-- ─── Communications ───────────────────────────────────────────────────────────

CREATE TABLE communications (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id              UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  sender_staff_id       UUID NOT NULL REFERENCES staff(id),
  scope_type            comm_scope_type_enum NOT NULL,
  scope_id              UUID,
  purpose_type          comm_purpose_enum NOT NULL,
  message               TEXT NOT NULL,
  scheduled_at          TIMESTAMPTZ,
  sent_at               TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE communications ENABLE ROW LEVEL SECURITY;

-- ─── Communication Deliveries (audit trail — BR-28) ──────────────────────────

CREATE TABLE comm_deliveries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id          UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  communication_id  UUID NOT NULL REFERENCES communications(id) ON DELETE CASCADE,
  recipient_staff_id UUID NOT NULL REFERENCES staff(id),
  channel           delivery_channel_enum NOT NULL,
  status            delivery_status_enum NOT NULL DEFAULT 'PENDING',
  sent_at           TIMESTAMPTZ,
  delivered_at      TIMESTAMPTZ,
  acked_at          TIMESTAMPTZ,
  error_message     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE comm_deliveries ENABLE ROW LEVEL SECURITY;

-- ─── Equipment Items ──────────────────────────────────────────────────────────

CREATE TABLE equipment_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id              UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  category              TEXT NOT NULL,
  location_description  TEXT,
  last_serviced_at      DATE,
  next_service_due      DATE NOT NULL,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE equipment_items ENABLE ROW LEVEL SECURITY;

-- ─── Change Requests ──────────────────────────────────────────────────────────

CREATE TABLE change_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id          UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  requested_by_id   UUID NOT NULL REFERENCES staff(id),
  subject           TEXT NOT NULL,
  description       TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'PENDING',
  sla_due_at        TIMESTAMPTZ,
  resolved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE change_requests ENABLE ROW LEVEL SECURITY;

-- ─── Audit Logs (INSERT-only, IMMUTABLE — EC-10, NFR-17) ─────────────────────

CREATE TABLE audit_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id          UUID NOT NULL REFERENCES venues(id),
  actor_staff_id    UUID REFERENCES staff(id),
  actor_role        staff_role_enum,
  action            TEXT NOT NULL,
  entity_type       TEXT NOT NULL,
  entity_id         UUID,
  metadata          JSONB,
  ip_address        TEXT,
  logged_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- ─── VMS Entry Points ─────────────────────────────────────────────────────────

CREATE TABLE vms_entry_points (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id                  UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name                      TEXT NOT NULL,
  floor_id                  UUID REFERENCES floors(id),
  location_description      TEXT,
  operating_hours_start     TIME,
  operating_hours_end       TIME,
  assigned_guard_staff_id   UUID REFERENCES staff(id),
  photo_mandatory           BOOLEAN NOT NULL DEFAULT FALSE,
  id_required               BOOLEAN NOT NULL DEFAULT FALSE,
  custom_fields             JSONB,
  is_active                 BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE vms_entry_points ENABLE ROW LEVEL SECURITY;

-- ─── VMS Visit Records ────────────────────────────────────────────────────────

CREATE TABLE vms_visit_records (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id                  UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  entry_point_id            UUID NOT NULL REFERENCES vms_entry_points(id),
  checkin_mode              vms_checkin_mode_enum NOT NULL,
  visitor_name              TEXT NOT NULL,
  visitor_phone             TEXT NOT NULL,
  visitor_photo_url         TEXT,
  id_photo_url              TEXT,
  masked_aadhaar            TEXT,
  purpose                   TEXT,
  host_staff_id             UUID REFERENCES staff(id),
  host_name                 TEXT,
  expected_duration_minutes INTEGER,
  status                    vms_visitor_status_enum NOT NULL DEFAULT 'CHECKED_IN',
  checked_in_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  checked_out_at            TIMESTAMPTZ,
  is_blacklisted            BOOLEAN NOT NULL DEFAULT FALSE,
  custom_field_values       JSONB,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE vms_visit_records ENABLE ROW LEVEL SECURITY;
