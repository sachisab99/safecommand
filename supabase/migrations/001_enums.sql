-- Migration 001: All enums for SafeCommand
-- Run: supabase db push

CREATE TYPE staff_role_enum AS ENUM (
  'SH',
  'DSH',
  'SHIFT_COMMANDER',
  'GM',
  'AUDITOR',
  'FM',
  'FLOOR_SUPERVISOR',
  'GROUND_STAFF'
);

CREATE TYPE subscription_tier_enum AS ENUM (
  'ESSENTIAL',
  'PROFESSIONAL',
  'ENTERPRISE',
  'CHAIN'
);

CREATE TYPE task_status_enum AS ENUM (
  'PENDING',
  'IN_PROGRESS',
  'COMPLETE',
  'MISSED',
  'ESCALATED',
  'LATE_COMPLETE'
);

CREATE TYPE evidence_type_enum AS ENUM (
  'NONE',
  'PHOTO',
  'TEXT',
  'NUMERIC',
  'CHECKLIST'
);

CREATE TYPE incident_type_enum AS ENUM (
  'FIRE',
  'MEDICAL',
  'SECURITY',
  'EVACUATION',
  'STRUCTURAL',
  'OTHER'
);

CREATE TYPE incident_severity_enum AS ENUM (
  'SEV1',
  'SEV2',
  'SEV3'
);

CREATE TYPE incident_status_enum AS ENUM (
  'ACTIVE',
  'CONTAINED',
  'RESOLVED',
  'CLOSED'
);

CREATE TYPE delivery_channel_enum AS ENUM (
  'APP_PUSH',
  'WHATSAPP',
  'SMS'
);

CREATE TYPE delivery_status_enum AS ENUM (
  'PENDING',
  'SENT',
  'DELIVERED',
  'FAILED',
  'ACKNOWLEDGED'
);

CREATE TYPE frequency_type_enum AS ENUM (
  'HOURLY',
  'EVERY_2H',
  'EVERY_4H',
  'EVERY_6H',
  'EVERY_8H',
  'DAILY',
  'WEEKLY',
  'MONTHLY',
  'QUARTERLY',
  'ANNUAL',
  'CUSTOM'
);

CREATE TYPE zone_status_enum AS ENUM (
  'ALL_CLEAR',
  'ATTENTION',
  'INCIDENT_ACTIVE'
);

CREATE TYPE venue_type_enum AS ENUM (
  'HOSPITAL',
  'MALL',
  'HOTEL',
  'CORPORATE'
);

CREATE TYPE vms_checkin_mode_enum AS ENUM (
  'MANUAL',
  'ID_PHOTO',
  'AADHAAR_QR',
  'PRE_REGISTERED',
  'SELF_SERVICE_QR'
);

CREATE TYPE vms_visitor_status_enum AS ENUM (
  'CHECKED_IN',
  'CHECKED_OUT',
  'OVERSTAY',
  'DENIED',
  'BLACKLISTED_ATTEMPT'
);

CREATE TYPE comm_scope_type_enum AS ENUM (
  'VENUE_WIDE',
  'FLOOR',
  'ZONE',
  'ROLE',
  'INDIVIDUAL',
  'SHIFT',
  'COMMAND_CHAIN'
);

CREATE TYPE comm_purpose_enum AS ENUM (
  'BROADCAST',
  'BRIEFING',
  'ALERT',
  'CUSTOM_TASK'
);

CREATE TYPE shift_assignment_type_enum AS ENUM (
  'PRIMARY',
  'SECONDARY',
  'BACKUP'
);
