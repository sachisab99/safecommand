-- =================================================================
-- MIGRATION 020 — Standards-Closure P1 (PULLED FORWARD subset)
-- Spec source: Architecture v9.1 §23.1 (logical label "021_standards_
--   closure_p1"). Repo file number = next free integer = 020 per ADR
--   0001's core rule ("the next free integer in supabase/migrations/,
--   never the spec's logical label" — v9.1 §1.3b: NNN file number is
--   authoritative). The §23 pull-forward changes build order, so the
--   deployed number follows ACTUAL order. Map Studio / LMS / drill-
--   tabletop + the 2 deferred standards tables renumber to their own
--   next-free-integers when built. See docs/adr/0001 amendment 2026-05-19.
--
-- Covers BR-AB (Safety Committee log), BR-AF (AMC registry), BR-AG
-- (MSDS repository) — the 3 of v9.1 §23.1's 5 tables that have NO FK
-- dependency on Map-Studio mig (floor_plans / evacuation_annotations).
-- DEFERRED to a future post-Map-Studio migration: annual_plan_reviews
-- (BR-AA — FK floor_plans) + refuge_area_occupancy_snapshots (BR-AD —
-- FK evacuation_annotations). They are NOT in this file and MUST NOT be
-- retro-added here (Hard Rule 3 — never modify a deployed migration).
--
-- PRE-DEPLOY ADAPTATION (parallels the SIRE mig 014 pre-deploy fixes):
-- v9.1 §23.1 writes amc_contracts + msds_documents with
--   `building_id UUID REFERENCES buildings(id)` and an RLS clause
--   `AND building_visible(building_id)`. The `buildings` table and the
--   `building_visible()` function are created by mig 009 (MBV) which is
--   PENDING Phase B (NOT deployed). Referencing them here would fail at
--   apply. Per EC-16 (building_id is always nullable; NULL = venue-wide)
--   and NFR-25 (single-building venues — i.e. every venue pre-MBV — are
--   unaffected), building scoping is a no-op pre-MBV. So building_id +
--   building_visible() are OMITTED here; the MBV-era migration (the same
--   one that ADD COLUMN building_id across the schema) will additively
--   add building_id + refresh these RLS policies — exactly the pattern
--   mig 009 already uses for every other table. safety_committee_meetings
--   has no building_id in the spec — it is reproduced verbatim.
--
-- HARD RULE 24: this migration MUST be applied + verified in production
-- BEFORE any /v1/safety-committee, /v1/amc-contracts, or /v1/msds code
-- deploys. Apply method (founder, SIRE-Day-1 pattern):
--   psql "<session-pooler-url>" --single-transaction -v ON_ERROR_STOP=1 \
--        -f supabase/migrations/020_standards_closure_p1.sql
-- Additive-only (3 CREATE TABLE + RLS + indexes). No views → Hard Rule
-- 25 N/A. Safe to apply live; dormant until the code ships.
-- =================================================================

BEGIN;

-- ---------- BR-AB: Safety Committee Quarterly Log (v9.1 §23.1 verbatim) ----------
CREATE TABLE safety_committee_meetings (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id             UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  meeting_date         DATE NOT NULL,
  quarter              TEXT NOT NULL CHECK (quarter IN ('Q1','Q2','Q3','Q4')),
  year                 INTEGER NOT NULL,
  chairperson_staff_id UUID NOT NULL REFERENCES staff(id),
  attendees            JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- [{"staff_id":"uuid","role":"FM","present":true},...]
  topics_discussed     JSONB NOT NULL DEFAULT '[]'::jsonb,
  action_items         JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- [{"item":"...","owner_staff_id":"uuid","due_date":"2027-03-15","status":"OPEN"}]
  minutes_s3_key       TEXT,                              -- attached PDF
  minutes_uploaded_at  TIMESTAMPTZ,
  standards_basis      TEXT[] DEFAULT ARRAY['NABH_6_FMS','NDMA_FIRE_GUIDELINES'],
  created_by           UUID NOT NULL REFERENCES staff(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (venue_id, year, quarter)
);
ALTER TABLE safety_committee_meetings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "venue_isolation" ON safety_committee_meetings
  USING (venue_id = current_setting('app.current_venue_id', TRUE)::UUID);
CREATE INDEX idx_scm_date ON safety_committee_meetings(venue_id, meeting_date DESC);

-- ---------- BR-AF: AMC Contract Registry (v9.1 §23.1; building_id omitted pre-MBV) ----------
CREATE TABLE amc_contracts (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id             UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  -- building_id + building_visible() RLS deferred to the MBV-era migration
  -- (mig 009 family) — see PRE-DEPLOY ADAPTATION header. EC-16 / NFR-25.
  contract_number      TEXT NOT NULL,
  vendor_name          TEXT NOT NULL,
  vendor_contact_phone TEXT,
  vendor_contact_email TEXT,
  equipment_category   TEXT NOT NULL CHECK (equipment_category IN (
    'FIRE_EXTINGUISHER','FIRE_HOSE','SPRINKLER','FIRE_ALARM','FIRE_PUMP',
    'AED','EMERGENCY_LIGHTING','EXIT_SIGN','PA_SYSTEM','HVAC','GENERATOR',
    'ELEVATOR','CCTV','ACCESS_CONTROL','PEST_CONTROL','OTHER'
  )),
  equipment_count      INTEGER,
  linked_equipment_ids UUID[],                            -- equipment_items.id list
  start_date           DATE NOT NULL,
  end_date             DATE NOT NULL,
  renewal_value_inr    NUMERIC,
  -- Renewal alerting columns (the 90/30/7 fan-out job is worker-gated,
  -- June — these timestamps are written by that job when it ships).
  alert_90_sent_at     TIMESTAMPTZ,
  alert_30_sent_at     TIMESTAMPTZ,
  alert_7_sent_at      TIMESTAMPTZ,
  status               TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE','EXPIRED','RENEWING','TERMINATED')),
  contract_s3_key      TEXT,                              -- signed PDF
  created_by           UUID NOT NULL REFERENCES staff(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT amc_end_after_start CHECK (end_date > start_date)
);
ALTER TABLE amc_contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "venue_isolation" ON amc_contracts
  USING (venue_id = current_setting('app.current_venue_id', TRUE)::UUID);
CREATE INDEX idx_amc_expiry ON amc_contracts(venue_id, end_date) WHERE status = 'ACTIVE';
CREATE INDEX idx_amc_category ON amc_contracts(venue_id, equipment_category);

-- ---------- BR-AG: MSDS Document Repository (v9.1 §23.1; building_id omitted pre-MBV) ----------
CREATE TABLE msds_documents (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id             UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  -- building_id + building_visible() RLS deferred to the MBV-era migration.
  chemical_name        TEXT NOT NULL,
  cas_number           TEXT,                              -- Chemical Abstracts Service number
  hazard_class         TEXT[],
  -- e.g. ARRAY['flammable','oxidiser','toxic']
  msds_s3_key          TEXT NOT NULL,                     -- PDF in venue-scoped S3
  msds_version         TEXT,
  issuing_vendor       TEXT,
  issue_date           DATE,
  expiry_date          DATE,                              -- typical: 3-year MSDS refresh
  linked_incident_subtypes TEXT[],
  -- e.g. ARRAY['STRUCTURAL_HAZMAT','MEDICAL_TRAUMA']
  storage_zone_ids     UUID[],                            -- zones where this chemical is stored
  storage_quantity     TEXT,                              -- e.g. "5L drum × 6"
  standards_basis      TEXT[] DEFAULT ARRAY['OSHA_1910_1200','NDMA_HAZMAT'],
  created_by           UUID NOT NULL REFERENCES staff(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT msds_chemical_name_required CHECK (length(chemical_name) > 0)
);
ALTER TABLE msds_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "venue_isolation" ON msds_documents
  USING (venue_id = current_setting('app.current_venue_id', TRUE)::UUID);
CREATE INDEX idx_msds_cas ON msds_documents(venue_id, cas_number) WHERE cas_number IS NOT NULL;
CREATE INDEX idx_msds_chemical ON msds_documents(venue_id, chemical_name);
CREATE INDEX idx_msds_incident_link ON msds_documents USING GIN (linked_incident_subtypes);

-- Verification block — 3 tables (subset), all RLS-enabled
DO $$
DECLARE
  v_table_count INT;
  v_rls_count INT;
BEGIN
  SELECT COUNT(*) INTO v_table_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name IN ('safety_committee_meetings','amc_contracts','msds_documents');
  IF v_table_count < 3 THEN
    RAISE EXCEPTION 'Migration 020 FAILED: Expected 3 tables, found %', v_table_count;
  END IF;

  SELECT COUNT(*) INTO v_rls_count
  FROM pg_tables
  WHERE schemaname = 'public'
  AND tablename IN ('safety_committee_meetings','amc_contracts','msds_documents')
  AND rowsecurity = TRUE;
  IF v_rls_count < 3 THEN
    RAISE EXCEPTION 'Migration 020 FAILED: RLS not enabled on all 3 tables (found %)', v_rls_count;
  END IF;

  RAISE NOTICE 'Migration 020 PASSED: 3 standards-closure tables, all RLS enabled';
END $$;

COMMIT;
