// ─── Enums ────────────────────────────────────────────────────────────────────

export type StaffRole =
  | 'SH'
  | 'DSH'
  | 'SHIFT_COMMANDER'
  | 'GM'
  | 'AUDITOR'
  | 'FM'
  | 'FLOOR_SUPERVISOR'
  | 'GROUND_STAFF';

export type SubscriptionTier = 'ESSENTIAL' | 'PROFESSIONAL' | 'ENTERPRISE' | 'CHAIN';

export type TaskStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'COMPLETE'
  | 'MISSED'
  | 'ESCALATED'
  | 'LATE_COMPLETE';

export type EvidenceType = 'NONE' | 'PHOTO' | 'TEXT' | 'NUMERIC' | 'CHECKLIST';

export type IncidentType = 'FIRE' | 'MEDICAL' | 'SECURITY' | 'EVACUATION' | 'STRUCTURAL' | 'OTHER';

export type IncidentSeverity = 'SEV1' | 'SEV2' | 'SEV3';

export type DeliveryChannel = 'APP_PUSH' | 'WHATSAPP' | 'SMS';

export type FrequencyType =
  | 'HOURLY'
  | 'EVERY_2H'
  | 'EVERY_4H'
  | 'EVERY_6H'
  | 'EVERY_8H'
  | 'DAILY'
  | 'WEEKLY'
  | 'MONTHLY'
  | 'QUARTERLY'
  | 'ANNUAL'
  | 'CUSTOM';

export type VmsCheckinMode =
  | 'MANUAL'
  | 'ID_PHOTO'
  | 'AADHAAR_QR'
  | 'PRE_REGISTERED'
  | 'SELF_SERVICE_QR';

export type VmsVisitorStatus =
  | 'CHECKED_IN'
  | 'CHECKED_OUT'
  | 'OVERSTAY'
  | 'DENIED'
  | 'BLACKLISTED_ATTEMPT';

export type ZoneStatus = 'ALL_CLEAR' | 'ATTENTION' | 'INCIDENT_ACTIVE';

export type VenueType = 'HOSPITAL' | 'MALL' | 'HOTEL' | 'CORPORATE';

export type IncidentStatus = 'ACTIVE' | 'CONTAINED' | 'RESOLVED' | 'CLOSED';

export type DeliveryStatus = 'PENDING' | 'SENT' | 'DELIVERED' | 'FAILED' | 'ACKNOWLEDGED';

// ─── Core Domain Types ─────────────────────────────────────────────────────────

export interface Venue {
  id: string;
  venue_code: string;
  name: string;
  type: VenueType;
  city: string;
  address: string | null;
  subscription_tier: SubscriptionTier;
  is_active: boolean;
  festival_mode: boolean;
  created_at: string;
  updated_at: string;
}

export interface Floor {
  id: string;
  venue_id: string;
  name: string;
  floor_number: number;
  created_at: string;
}

export interface Zone {
  id: string;
  venue_id: string;
  floor_id: string;
  name: string;
  zone_type: string;
  two_person_required: boolean;
  current_status: ZoneStatus;
  created_at: string;
  updated_at: string;
}

export interface Staff {
  id: string;
  venue_id: string;
  firebase_auth_id: string | null;
  phone: string;
  name: string;
  role: StaffRole;
  is_active: boolean;
  fcm_token: string | null;
  whatsapp_number: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScheduleTemplate {
  id: string;
  venue_id: string;
  title: string;
  description: string | null;
  frequency: FrequencyType;
  assigned_role: StaffRole;
  evidence_type: EvidenceType;
  escalation_chain: StaffRole[];
  escalation_interval_minutes: number;
  start_time: string | null;
  timezone: string;
  secondary_escalation_chain: StaffRole[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TaskInstance {
  id: string;
  venue_id: string;
  template_id: string;
  assigned_staff_id: string | null;
  status: TaskStatus;
  due_at: string;
  window_expires_at: string;
  idempotency_key: string;
  created_at: string;
  updated_at: string;
}

// ─── Shift / roster types ────────────────────────────────────────────────────
// Backed by `shifts`, `shift_instances`, `staff_zone_assignments` tables.
// MBV-aware via `building_id` (post-mig 009 — Rule 15 nullable; NULL = venue-wide).

export type ShiftInstanceStatus = 'PENDING' | 'ACTIVE' | 'CLOSED';

export type ShiftAssignmentType = 'PRIMARY' | 'SECONDARY' | 'BACKUP';

/** Recurring shift definition (the template — e.g. "Day Shift 09:00–18:00") */
export interface Shift {
  id: string;
  venue_id: string;
  building_id: string | null;
  name: string;
  start_time: string; // HH:MM:SS
  end_time: string;   // HH:MM:SS — wraps midnight if end_time < start_time
  is_active: boolean;
  created_at: string;
}

/** A single day's instance of a shift template */
export interface ShiftInstance {
  id: string;
  venue_id: string;
  building_id: string | null;
  shift_id: string;
  shift_date: string; // YYYY-MM-DD
  commander_staff_id: string | null;
  status: ShiftInstanceStatus;
  activated_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Equipment compliance types (BR-21) ─────────────────────────────────────
// Tracks safety equipment with expiry / next-service-due dates. Drives the
// Equipment component (10% weight) of the BR-14 health score.

/** Open category — extensible without enum migration */
export type EquipmentCategory =
  | 'FIRE_EXTINGUISHER'
  | 'AED'
  | 'SMOKE_DETECTOR'
  | 'EMERGENCY_LIGHT'
  | 'FIRST_AID_KIT'
  | 'ALARM_PANEL'
  | 'EVACUATION_SIGN'
  | 'OTHER';

/** Derived from next_service_due — not stored, computed at read time */
export type EquipmentStatus =
  | 'OK'         // ≥90 days until next service
  | 'DUE_90'     // 30-90 days
  | 'DUE_30'     // 7-30 days
  | 'DUE_7'      // ≤7 days
  | 'OVERDUE';   // past due

export interface EquipmentItem {
  id: string;
  venue_id: string;
  building_id: string | null;
  name: string;
  category: string; // text in DB; EquipmentCategory enum at app layer
  location_description: string | null;
  last_serviced_at: string | null; // YYYY-MM-DD
  next_service_due: string;        // YYYY-MM-DD
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Drill compliance types (BR-A) ──────────────────────────────────────────
// Drill Management Module — schedule/run/time/document. Auto-generates
// timed Fire NOC compliance reports. Per-building separate records (MBV).

export type DrillType =
  | 'FIRE_EVACUATION'
  | 'EARTHQUAKE'
  | 'BOMB_THREAT'
  | 'MEDICAL_EMERGENCY'
  | 'PARTIAL_EVACUATION'
  | 'FULL_EVACUATION'
  | 'OTHER';

export type DrillStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export type DrillParticipantStatus =
  | 'NOTIFIED'
  | 'ACKNOWLEDGED'
  | 'SAFE_CONFIRMED'
  | 'MISSED';

export interface DrillSession {
  id: string;
  venue_id: string;
  building_id: string | null;
  drill_type: DrillType;
  status: DrillStatus;
  scheduled_for: string;
  started_at: string | null;
  ended_at: string | null;
  started_by_staff_id: string | null;
  total_staff_expected: number;
  total_staff_acknowledged: number;
  total_staff_safe: number;
  total_staff_missed: number;
  duration_seconds: number | null;
  notes: string | null;
  report_pdf_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface DrillSessionParticipant {
  id: string;
  drill_session_id: string;
  staff_id: string;
  status: DrillParticipantStatus;
  notified_at: string;
  acknowledged_at: string | null;
  safe_confirmed_at: string | null;
  ack_latency_seconds: number | null;
}

// ─── Staff certification types (BR-22 + BR-B) ───────────────────────────────
// Per-staff professional credentials with expiry tracking. Drives the
// Certifications component (15% weight) of the BR-14 health score, plus
// the BR-B soft warning on shift activation when an SC has an expiring cert.

export interface StaffCertification {
  id: string;
  venue_id: string;
  staff_id: string;
  certification_name: string;
  issued_at: string;     // YYYY-MM-DD
  expires_at: string;    // YYYY-MM-DD
  document_url: string | null;
  created_at: string;
}

/** Same expiry buckets as equipment — reuse the visual ramp */
export type CertExpiryBucket = 'OK' | 'DUE_90' | 'DUE_30' | 'DUE_7' | 'EXPIRED';

/** Staff member's zone coverage for a specific shift_instance */
export interface StaffZoneAssignment {
  id: string;
  venue_id: string;
  shift_instance_id: string;
  staff_id: string;
  zone_id: string;
  assignment_type: ShiftAssignmentType;
  created_at: string;
}

export interface Incident {
  id: string;
  venue_id: string;
  incident_type: IncidentType;
  severity: IncidentSeverity;
  zone_id: string | null;
  description: string | null;
  status: IncidentStatus;
  declared_by_staff_id: string;
  declared_at: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─── API Request/Response Types ────────────────────────────────────────────────

export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  count: number;
  page: number;
  per_page: number;
}

// ─── Auth Types ───────────────────────────────────────────────────────────────

export interface AuthTokenPayload {
  sub: string;
  venue_id: string;
  staff_id: string;
  role: StaffRole;
  iat: number;
  exp: number;
}

export interface AuthContext {
  firebase_uid: string;
  venue_id: string;
  staff_id: string;
  role: StaffRole;
}

// ─── Queue Job Types ──────────────────────────────────────────────────────────

export interface ScheduleGenerationJob {
  venue_id: string;
  template_id: string;
  tick_at: string;
}

export interface EscalationJob {
  task_instance_id: string;
  venue_id: string;
  level: number;
  escalation_chain: StaffRole[];
}

export interface NotificationJob {
  venue_id: string;
  staff_id: string;
  channel: DeliveryChannel;
  template_key: string;
  variables: Record<string, string>;
  comm_delivery_id?: string;
  fallback_after_ms?: number;
}

export interface IncidentEscalationJob {
  incident_id: string;
  venue_id: string;
  priority: 0;
}
