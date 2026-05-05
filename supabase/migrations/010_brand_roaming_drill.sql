-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 010 (this repo) | Spec Migration 008 (Architecture v7 §3.5)
--
-- Three new schemas, one migration:
--   1. Corporate Accounts + Brand Configs  (BR-65, BR-81 — Phase 1 schema)
--   2. Roaming Staff Assignments           (BR-R1–R5 — Phase 2 UI; schema P1)
--   3. Drill Sessions                      (BR-A drill management — P1)
--
-- ⚠ STATUS: Written 2026-05-05 on safecommand_v7. NOT YET DEPLOYED.
--           Apply during Phase B June unfreeze AFTER migration 009.
--
-- ⚠ DEPENDENCY: This migration references buildings(id) — must run AFTER
--               migration 009_mbv.sql. The Supabase CLI applies migrations
--               in alphabetical order so the 009/010 ordering is preserved.
--
-- Repo offset rationale: spec calls this "Migration 008" but repo migrations
-- 007/008 already exist. See ADR 0001.
--
-- Refs: Architecture v7 §3.5 + §17 (Roaming) + §18 (Brand) + §19 (Corp Gov)
-- Refs: BR-65 (corporate accounts), BR-81 to BR-88 (Brand Layer)
-- Refs: BR-R1 to BR-R5 (Roaming)
-- Refs: BR-A (Drill Management)
-- Refs: EC-18 / Rule 20 (Powered-by hard-coded)
-- Refs: ADR 0001, ADR 0003
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── Section 1: Corporate Accounts (parent of brand_configs + venues) ──────
-- A corporate account groups multiple venues for governance + brand purposes.
-- Phase 1 stores schema only; Phase 3 activates governance UI per BR-65–80.
-- One corporate_account → many venues (via venues.corporate_account_id FK
-- added below) → one optional brand_config.

CREATE TABLE corporate_accounts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- e.g. 'apollo-hospitals-india', 'infosys', 'marriott-india'
  account_code          TEXT NOT NULL UNIQUE,
  -- Display name for SC Ops + Apollo demo materials
  display_name          TEXT NOT NULL,
  -- Country of incorporation (ISO 3166-1 alpha-2; NULL for multinational
  -- corporate accounts spanning countries — see Phase 3 corporate_countries
  -- table for per-country breakdown)
  country_iso           CHAR(2),
  -- Subscription tier at corporate level (Plan §13.2)
  tier                  TEXT NOT NULL CHECK (tier IN (
                          'CORP_STARTER',
                          'CORP_PROFESSIONAL',
                          'CORP_ENTERPRISE',
                          'CORP_GLOBAL'
                        )),
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  -- For audit; SC Ops staff who created the account record
  created_by_sc_ops_id  UUID,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_corporate_accounts_active ON corporate_accounts(is_active, account_code);

-- venues.corporate_account_id — links a venue to its corporate parent.
-- NULL = standalone venue (no corporate governance overlay).
ALTER TABLE venues
  ADD COLUMN corporate_account_id UUID REFERENCES corporate_accounts(id);
CREATE INDEX idx_venues_corporate ON venues(corporate_account_id, is_active);

-- RLS: corporate_accounts is a platform-level table — only SC Ops sees the
-- raw rows (configured via service-role key). Tenant venue users access
-- corporate brand info via brand_config join, not by selecting from this
-- table directly. Therefore RLS enabled but with no policy = locked down.
ALTER TABLE corporate_accounts ENABLE ROW LEVEL SECURITY;
-- (No CREATE POLICY here — service role bypasses RLS; ops console uses
-- service role; venue users never query this table directly.)

-- ─── Section 2: corporate_brand_configs (BR-81) ────────────────────────────
-- The Enterprise Brand Enablement schema. One row per corporate_account.
-- Sparse-by-design: any nullable field falls through to SafeCommand defaults
-- at the ThemeProvider layer (per Q2 decision 2026-05-04).
--
-- ⚠ powered_by_text is NON-NULLABLE and CHECK-constrained to the literal
--   string per EC-18 / Rule 20. Cannot be NULL, cannot be modified to any
--   other value. Even Apollo at INR crore-level contract scale cannot
--   override this — it's the legal protection for both parties.

CREATE TABLE corporate_brand_configs (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  corporate_account_id        UUID NOT NULL UNIQUE REFERENCES corporate_accounts(id) ON DELETE CASCADE,
  -- Logo URL — S3 presigned for enterprise; NULL = use SafeCommand default
  logo_url                    TEXT,
  -- Brand colour hex strings (#RRGGBB) — NULL = use SafeCommand default
  primary_colour              VARCHAR(7),
  secondary_colour            VARCHAR(7),
  -- Display strings
  brand_name                  TEXT,                        -- 'Apollo SafeCommand'
  app_display_name            TEXT,                        -- iOS/Android home-screen label
  notification_sender_name    TEXT,                        -- WA + push sender display
  -- Per-role display name overrides (BR-84). JWT role codes never change.
  -- Example: {"SH":"Apollo Safety Head","SC":"Apollo Safety Officer"}
  role_overrides              JSONB,
  -- Up to 50 term substitutions (BR-83). Example: {"Incident":"Safety Event","Zone":"Area"}
  terminology_dictionary      JSONB,
  -- Compliance/drill/incident report letterhead text
  report_header_text          TEXT,
  -- ⚠ NON-REMOVABLE CREDIT — EC-18 / Rule 20 ⚠
  powered_by_text             TEXT NOT NULL DEFAULT 'Platform by SafeCommand'
                              CHECK (powered_by_text = 'Platform by SafeCommand'),
  -- WCAG 2.1 AA contrast validation gate (NFR-35) — must be TRUE before
  -- is_active can be set TRUE. Set by SC Ops after running the contrast
  -- checker against the provided primary_colour and secondary_colour.
  wcag_validated              BOOLEAN NOT NULL DEFAULT FALSE,
  -- SC Ops gate — only TRUE configs are served to users (NFR-36)
  is_active                   BOOLEAN NOT NULL DEFAULT FALSE,
  -- Audit trail — which SC Ops staff configured this row
  configured_by_sc_ops_id     UUID,
  configured_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Hard rule: cannot activate a brand without WCAG validation
  CHECK (NOT is_active OR wcag_validated = TRUE),
  -- terminology_dictionary must be a JSON object (not array/scalar)
  CHECK (terminology_dictionary IS NULL OR jsonb_typeof(terminology_dictionary) = 'object')
  -- Note: BR-83 50-entry cap enforced at API layer via Zod validation,
  -- not at schema level (Postgres CHECK constraints cannot contain subqueries
  -- and a function-based check would require IMMUTABLE jsonb_object_keys
  -- which isn't strictly IMMUTABLE per the Postgres planner). Documented in
  -- docs/api/conventions.md §8 (Validation — Zod first).
);

CREATE INDEX idx_brand_configs_active ON corporate_brand_configs(corporate_account_id, is_active);

-- RLS: SC Ops only — same logic as corporate_accounts. Venue users access
-- brand config indirectly via API (api fetches it server-side using service
-- role and embeds it in the auth response per NFR-34 brand-fetch latency).
ALTER TABLE corporate_brand_configs ENABLE ROW LEVEL SECURITY;
-- (No CREATE POLICY — service role only.)

-- ─── Section 3: roaming_staff_assignments (BR-R1 to BR-R5) ─────────────────
-- A roaming staff member is assigned to 2–10 venues with full role authority
-- at each. SC-OPS-only assignment (Rule R5). SH/DSH/GM/AUD/FM eligible;
-- SC/FS/GS NEVER roaming.
--
-- ⚠ Schema lands in Phase 1 (this migration) so the api code can query it
--   when issuing JWTs. UI lands in Phase 2 (multi-venue tab dashboard).

CREATE TABLE roaming_staff_assignments (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id               UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  venue_id               UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  role                   staff_role_enum NOT NULL,
  -- For roaming FM: must specify which building at this venue.
  -- For SH/DSH/GM/AUD: NULL (venue-wide).
  building_id            UUID REFERENCES buildings(id),
  is_active              BOOLEAN NOT NULL DEFAULT TRUE,
  granted_by_sc_ops_id   UUID,
  granted_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at             TIMESTAMPTZ,
  revoke_reason          TEXT,
  -- Hard rule per BR-R5: SC, FS, GS NEVER roaming
  CHECK (role NOT IN ('SHIFT_COMMANDER', 'FLOOR_SUPERVISOR', 'GROUND_STAFF')),
  -- Each (staff, venue) assignment unique while active
  -- Partial unique index: only one active assignment per (staff, venue)
  UNIQUE (staff_id, venue_id, is_active)
);

CREATE INDEX idx_roaming_active ON roaming_staff_assignments(staff_id, is_active)
  WHERE is_active = TRUE;
CREATE INDEX idx_roaming_venue ON roaming_staff_assignments(venue_id, is_active)
  WHERE is_active = TRUE;

-- Constraint: max 10 active venues per staff (Plan §4.2.1 hard limit).
-- Enforced via trigger because PostgreSQL doesn't natively support per-row
-- aggregate-bound CHECK constraints. The trigger raises an exception at
-- insert/update time if the staff would exceed 10 active assignments.
CREATE OR REPLACE FUNCTION enforce_roaming_max_venues()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  active_count INTEGER;
BEGIN
  IF NEW.is_active = TRUE THEN
    SELECT COUNT(*) INTO active_count
    FROM roaming_staff_assignments
    WHERE staff_id = NEW.staff_id
      AND is_active = TRUE
      AND id != NEW.id;
    IF active_count >= 10 THEN
      RAISE EXCEPTION 'Roaming staff % already has 10 active venue assignments — platform hard limit (BR-R5)',
        NEW.staff_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER roaming_max_venues_check
  BEFORE INSERT OR UPDATE ON roaming_staff_assignments
  FOR EACH ROW EXECUTE FUNCTION enforce_roaming_max_venues();

-- RLS: SC Ops only (assigns); api uses service role to read for JWT issuance.
ALTER TABLE roaming_staff_assignments ENABLE ROW LEVEL SECURITY;
-- (No CREATE POLICY — service role only.)

-- ─── Section 4: drill_sessions (BR-A — Drill Management Module) ────────────
-- Tracks scheduled and ad-hoc evacuation drills. Auto-generates timed report
-- for Fire NOC submission. Per-building separate records (each building may
-- have independent NOC certification).

CREATE TYPE drill_type_enum AS ENUM (
  'FIRE_EVACUATION',
  'EARTHQUAKE',
  'BOMB_THREAT',
  'MEDICAL_EMERGENCY',
  'PARTIAL_EVACUATION',
  'FULL_EVACUATION',
  'OTHER'
);

CREATE TYPE drill_status_enum AS ENUM (
  'SCHEDULED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED'
);

CREATE TABLE drill_sessions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id                UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  -- NULL = venue-wide drill; set = building-scoped drill
  building_id             UUID REFERENCES buildings(id),
  drill_type              drill_type_enum NOT NULL,
  status                  drill_status_enum NOT NULL DEFAULT 'SCHEDULED',
  scheduled_for           TIMESTAMPTZ NOT NULL,
  started_at              TIMESTAMPTZ,
  ended_at                TIMESTAMPTZ,
  started_by_staff_id     UUID REFERENCES staff(id),
  total_staff_expected    INTEGER NOT NULL DEFAULT 0,
  total_staff_acknowledged INTEGER NOT NULL DEFAULT 0,
  total_staff_safe        INTEGER NOT NULL DEFAULT 0,
  total_staff_missed      INTEGER NOT NULL DEFAULT 0,
  duration_seconds        INTEGER,                         -- computed at completion
  notes                   TEXT,
  -- S3 URL of generated Fire NOC compliance PDF (auto-generated on completion)
  report_pdf_url          TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (status = 'SCHEDULED' AND started_at IS NULL AND ended_at IS NULL) OR
    (status = 'IN_PROGRESS' AND started_at IS NOT NULL AND ended_at IS NULL) OR
    (status = 'COMPLETED' AND started_at IS NOT NULL AND ended_at IS NOT NULL) OR
    (status = 'CANCELLED')
  )
);

ALTER TABLE drill_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "venue_isolation" ON drill_sessions
  USING (
    venue_id = current_setting('app.current_venue_id')::UUID
    AND building_visible(building_id)
  );

CREATE INDEX idx_drill_sessions_venue
  ON drill_sessions(venue_id, scheduled_for DESC);
CREATE INDEX idx_drill_sessions_building
  ON drill_sessions(venue_id, building_id, drill_type, scheduled_for DESC);
CREATE INDEX idx_drill_sessions_active
  ON drill_sessions(venue_id, status, scheduled_for)
  WHERE status IN ('SCHEDULED', 'IN_PROGRESS');

-- ─── Section 5: drill_session_participants (junction) ──────────────────────
-- Tracks which staff acknowledged the drill and when. Missed-participant
-- rows surface for NOC reporting (BR-A).

CREATE TYPE drill_participant_status_enum AS ENUM (
  'NOTIFIED',          -- alert sent
  'ACKNOWLEDGED',      -- staff tapped the drill notification
  'SAFE_CONFIRMED',    -- staff tapped 'I AM SAFE' on evacuation board
  'MISSED'             -- staff did not respond within drill window
);

CREATE TABLE drill_session_participants (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drill_session_id    UUID NOT NULL REFERENCES drill_sessions(id) ON DELETE CASCADE,
  staff_id            UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  status              drill_participant_status_enum NOT NULL DEFAULT 'NOTIFIED',
  notified_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_at     TIMESTAMPTZ,
  safe_confirmed_at   TIMESTAMPTZ,
  -- Time from drill start to acknowledgement (for NOC report stats)
  ack_latency_seconds INTEGER,
  UNIQUE (drill_session_id, staff_id)
);

ALTER TABLE drill_session_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "venue_isolation" ON drill_session_participants
  USING (
    drill_session_id IN (
      SELECT id FROM drill_sessions
      WHERE venue_id = current_setting('app.current_venue_id')::UUID
    )
  );

CREATE INDEX idx_drill_participants_session
  ON drill_session_participants(drill_session_id, status);
CREATE INDEX idx_drill_participants_staff
  ON drill_session_participants(staff_id, notified_at DESC);

-- ─── Section 6: Realtime — add drill_sessions for live drill board ─────────

ALTER PUBLICATION supabase_realtime ADD TABLE drill_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE drill_session_participants;

-- ─── Section 7: Comments for future engineers ──────────────────────────────

COMMENT ON TABLE corporate_accounts IS
  'Parent entity for venues that share a corporate governance overlay. NULL corporate_account_id on venues = standalone venue. Phase 3 activates governance UI per BR-65–80.';

COMMENT ON TABLE corporate_brand_configs IS
  'Enterprise Brand Enablement (BR-81). One row per corporate_account. Sparse-by-design — null fields fall through to SafeCommand defaults at ThemeProvider. powered_by_text is hard-coded literal per EC-18 / Rule 20 (DB CHECK constraint enforces).';

COMMENT ON COLUMN corporate_brand_configs.powered_by_text IS
  'NON-REMOVABLE — EC-18 / Rule 20. CHECK constraint locks to literal "Platform by SafeCommand". Even Apollo cannot remove. Settings > About + every PDF report footer uses this. Liability and brand protection for both vendor and customer.';

COMMENT ON COLUMN corporate_brand_configs.wcag_validated IS
  'NFR-35 gate. Must be TRUE before is_active can flip TRUE. SC Ops runs WCAG 2.1 AA contrast checker (4.5:1) against primary_colour + secondary_colour and sets this flag.';

COMMENT ON TABLE roaming_staff_assignments IS
  'BR-R1 to BR-R5. Schema lands Phase 1 (api needs to query for JWT issuance); UI lands Phase 2 (multi-venue tab dashboard). Hard limit 10 venues per staff (enforced by enforce_roaming_max_venues trigger). SC/FS/GS NEVER roaming (CHECK constraint).';

COMMENT ON TABLE drill_sessions IS
  'BR-A drill management module. Per-building separate records — each building may have independent Fire NOC. Auto-generates timed report PDF on completion. Tracked via drill_session_participants junction.';

COMMIT;
