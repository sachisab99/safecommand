-- ───────────────────────────────────────────────────────────────────────────
-- Migration 018 — incident_evidence (shared incident photo stream)
-- Phase 5.21 Day 7 enhancement (founder-directed 2026-05-16)
--
-- Adds ONE append-only table: any venue staff may post a photo against an
-- incident; every photo is visible to every venue user on that incident
-- (Rec 2b "Full: shared stream"). Distinct from the per-action / per-zone
-- evidence_url already on incident_action_assignments / incident_zone_states
-- (mig 014) — that is action-bound; this is a free-form incident-wide wall.
--
-- Hard Rule 4  : append-only — write-once, no UPDATE / DELETE (RESTRICTIVE).
-- Rule 2 / EC-03: venue_id on the table and every policy.
-- EC-02         : RLS enabled + forced.
-- Rule 25       : N/A — no VIEW created in this migration.
-- Hard Rule 3   : new file (never modifies a committed migration).
-- Hard Rule 24-analog: apply BEFORE the API code that reads/writes this
--                 table deploys. Schema → verify → code. Never the reverse.
--
-- DPDP note: incident scene photos may contain images of staff / public
-- (personal data). Scope is strictly venue-isolated. This is operational
-- scene evidence, deliberately visible to all venue staff per founder
-- decision (Rec 2 "Full" option) — it is NOT the Rule 14 ID-card / visitor
-- face-photo class, which remains SH/DSH/AUD-gated elsewhere. Retention /
-- purge by venue tier is future work (cf. BR-55 VMS retention pattern).
--
-- Backward compatibility:
--   - Pure CREATE TABLE — additive, zero downtime, dormant until code reads it.
--   - No existing object touched. v1 + shipped Day 1-5 SIRE paths unaffected.
--
-- Refs:
--   - supabase/migrations/014_sire_engine.sql (append-only RLS idiom copied)
--   - apps/api/src/services/storage.ts (S3 presign, ap-south-1, NFR-11)
--   - docs/specs/incident-response-activity-templates.md
-- ───────────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════
-- 0. PRE-FLIGHT GUARD — fail fast on wrong environment / double-apply
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema = 'public' AND table_name = 'incidents') THEN
    RAISE EXCEPTION 'mig 018 pre-flight FAILED: base table "incidents" not found (wrong DB?)';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'incident_evidence') THEN
    RAISE EXCEPTION 'mig 018 pre-flight FAILED: incident_evidence already exists (already applied?)';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. CREATE TABLE incident_evidence (append-only)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE incident_evidence (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id         UUID NOT NULL REFERENCES venues(id)   ON DELETE CASCADE,
  incident_id      UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  -- Nullable so staff deletion never breaks the immutable audit chain
  posted_by        UUID NULL REFERENCES staff(id) ON DELETE SET NULL,
  posted_by_role   TEXT NULL,
  -- S3 object key / URL (ap-south-1; produced by /v1/upload/presign).
  -- NOT NULL: a row with no media has no reason to exist.
  evidence_url     TEXT NOT NULL,
  content_type     TEXT NULL,            -- e.g. 'image/jpeg'
  caption          TEXT NULL,            -- optional free-text from the poster
  gps_latitude     DOUBLE PRECISION NULL,
  gps_longitude    DOUBLE PRECISION NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE incident_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_evidence FORCE ROW LEVEL SECURITY;

-- ── SELECT: any user in the venue sees the whole incident wall ──
-- (Rec 2b "Full" — deliberately NOT role-gated; venue isolation only.)
CREATE POLICY "venue_isolation" ON incident_evidence
  FOR SELECT
  USING (venue_id = current_setting('app.current_venue_id', TRUE)::UUID);

-- ── Append-only: UPDATE / DELETE explicitly denied (Hard Rule 4) ──
CREATE POLICY "append_only_no_update" ON incident_evidence
  AS RESTRICTIVE
  FOR UPDATE
  USING (FALSE);
CREATE POLICY "append_only_no_delete" ON incident_evidence
  AS RESTRICTIVE
  FOR DELETE
  USING (FALSE);

-- ── INSERT gated by venue context (mirrors mig 014 append-only tables).
-- The API uses service_role (bypasses RLS); this is defence-in-depth for
-- any direct authenticated supabase-client path. ──
CREATE POLICY "venue_scoped_insert" ON incident_evidence
  FOR INSERT
  WITH CHECK (venue_id = current_venue_id());

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. INDEXES — incident wall is read newest-first, per incident
-- ═══════════════════════════════════════════════════════════════════════════
CREATE INDEX idx_ie_incident ON incident_evidence(incident_id, created_at DESC);
CREATE INDEX idx_ie_venue    ON incident_evidence(venue_id, created_at DESC);

COMMENT ON TABLE incident_evidence IS
  'Append-only shared photo stream per incident (Phase 5.21 Day 7, Rec 2b). '
  'Any venue staff posts; visible to all venue users on the incident. '
  'Hard Rule 4 immutable. DPDP: venue-isolated scene evidence; not Rule 14 ID/face class.';
COMMENT ON COLUMN incident_evidence.evidence_url IS
  'S3 object key/URL (sc-evidence-prod, ap-south-1) from /v1/upload/presign purpose=incident_evidence';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. VERIFICATION (fail-fast inside --single-transaction; rolls back on miss)
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_table   INT;
  v_rls     BOOLEAN;
  v_forced  BOOLEAN;
  v_policy  INT;
  v_index   INT;
BEGIN
  SELECT COUNT(*) INTO v_table
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'incident_evidence';

  SELECT c.relrowsecurity, c.relforcerowsecurity INTO v_rls, v_forced
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'incident_evidence';

  SELECT COUNT(*) INTO v_policy
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'incident_evidence';

  SELECT COUNT(*) INTO v_index
    FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'incident_evidence'
      AND indexname IN ('idx_ie_incident', 'idx_ie_venue');

  RAISE NOTICE 'mig 018 incident_evidence verification:';
  RAISE NOTICE '  Table:    % / 1', v_table;
  RAISE NOTICE '  RLS:      enabled=% forced=%', v_rls, v_forced;
  RAISE NOTICE '  Policies: % / 4 (venue_isolation, no_update, no_delete, venue_scoped_insert)', v_policy;
  RAISE NOTICE '  Indexes:  % / 2', v_index;

  IF v_table <> 1 THEN
    RAISE EXCEPTION 'mig 018 FAILED: incident_evidence table not created';
  END IF;
  IF v_rls IS NOT TRUE OR v_forced IS NOT TRUE THEN
    RAISE EXCEPTION 'mig 018 FAILED: RLS not enabled+forced (enabled=%, forced=%)', v_rls, v_forced;
  END IF;
  IF v_policy <> 4 THEN
    RAISE EXCEPTION 'mig 018 FAILED: expected 4 RLS policies, got %', v_policy;
  END IF;
  IF v_index <> 2 THEN
    RAISE EXCEPTION 'mig 018 FAILED: expected 2 indexes, got %', v_index;
  END IF;

  RAISE NOTICE '  All checks PASSED. incident_evidence ready for Day 7 code deploy.';
END $$;
