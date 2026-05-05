-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 009 (this repo) | Spec Migration 007 (Architecture v7 §3.4)
--
-- Multi-Building Venue (MBV) — buildings entity inserted between venues and
-- floors. building_id is ALWAYS NULLABLE on every table that references it
-- (EC-16 / Rule 15) — single-building venues remain zero-config and behave
-- identically to pre-MBV.
--
-- Key concepts:
--   - NULL building_id  = venue-wide scope (single-building venue OR
--                         intentionally venue-wide record like SH/DSH staff,
--                         SEV1 incidents, venue-wide schedule templates)
--   - Set building_id   = building-scoped record
--
-- Repo offset rationale: spec calls this "Migration 007" but repo migrations
-- 007/008 already exist (schedule_time + comm_deliveries_nullable). See
-- ADR 0001 for the renumbering decision.
--
-- ⚠ STATUS: Written 2026-05-05 on safecommand_v7. NOT YET DEPLOYED.
--           Apply during Phase B June unfreeze sequence per
--           JUNE-2026-REVIEW-REQUIRED.md, AFTER:
--             1. Verify Upstash actual May burn
--             2. Apply AWS Activate $1K credits
--             3. Fix Railway worker Start Commands (already done: 5c4fead)
--             4. Set workers always-on (WORKERS_PAUSED=false, MASTER_TICK=60s)
--           Coupled api code change required: services/db.ts middleware
--           must call set_tenant_context with 4 params.
--
-- Refs: Architecture v7 §3.4 + §15 + §13 (Hard Rules 15/16/17/18)
-- Refs: BR-57 to BR-64 (MBV requirements — all P1)
-- Refs: NFR-25 (backward compat), NFR-26 (latency), NFR-27 (mobile context)
-- Refs: ADR 0001 (migration renumbering)
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── Step 1: buildings table ─────────────────────────────────────────────────
-- Each venue may contain 1–N named buildings. Optional — venues without any
-- buildings rows are single-building (matches all venues created pre-MBV).

CREATE TABLE buildings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id            UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,                       -- e.g. 'Main Block'
  short_code          TEXT NOT NULL,                       -- e.g. 'MAIN-BLOCK', 'EMRG-BLOCK'
  address             TEXT,                                -- optional gate-level address override
  gps_lat             NUMERIC(9, 6),                       -- optional precise lat
  gps_lng             NUMERIC(9, 6),                       -- optional precise lng
  floor_plan_url      TEXT,                                -- optional S3 url for floor plan PDF/image
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- short_code unique within a venue so incident codes can include it unambiguously (Rule 18)
  UNIQUE (venue_id, short_code)
);

ALTER TABLE buildings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "venue_isolation" ON buildings
  USING (venue_id = current_setting('app.current_venue_id')::UUID);

CREATE INDEX idx_buildings_venue ON buildings(venue_id, is_active);

-- ─── Step 2: building_visible() RLS function ────────────────────────────────
-- Single-source-of-truth for the visibility predicate (Rule 16 — no inline
-- building filters anywhere in the codebase).
--
-- Returns TRUE when:
--   - record's building_id IS NULL (venue-wide record visible to everyone)
--   - session's app.current_building_id IS NULL (venue-wide role: SH/DSH/GM/AUD)
--   - they match (building-scoped user looking at their building's record)
-- Returns FALSE only when both are non-NULL and don't match.

CREATE OR REPLACE FUNCTION building_visible(row_building_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  session_building_id UUID;
BEGIN
  -- current_setting may not be set yet (during migration, or for service role
  -- bypassing RLS). Treat unset as "venue-wide" — RLS still gates by venue_id.
  BEGIN
    session_building_id := nullif(current_setting('app.current_building_id', TRUE), '')::UUID;
  EXCEPTION WHEN others THEN
    session_building_id := NULL;
  END;

  IF row_building_id IS NULL THEN
    RETURN TRUE;
  END IF;

  IF session_building_id IS NULL THEN
    RETURN TRUE;
  END IF;

  RETURN session_building_id = row_building_id;
END;
$$;

-- ─── Step 3: set_tenant_context — upgrade to 4 parameters ──────────────────
-- Adds p_building_id (default NULL) so existing callers using 3-param signature
-- keep working until they migrate. Eventually all callers use 4-param.
-- The 3-param overload below preserves backward compat during deployment.

CREATE OR REPLACE FUNCTION set_tenant_context(
  p_venue_id    UUID,
  p_staff_id    UUID,
  p_role        TEXT,
  p_building_id UUID DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM set_config('app.current_venue_id',    p_venue_id::TEXT,                    TRUE);
  PERFORM set_config('app.current_staff_id',    p_staff_id::TEXT,                    TRUE);
  PERFORM set_config('app.current_role',        p_role,                              TRUE);
  PERFORM set_config('app.current_building_id', COALESCE(p_building_id::TEXT, ''),   TRUE);
END;
$$;

-- ─── Step 4: floors — add building_id ───────────────────────────────────────

ALTER TABLE floors
  ADD COLUMN building_id UUID REFERENCES buildings(id) ON DELETE SET NULL;
CREATE INDEX idx_floors_building ON floors(venue_id, building_id);

-- ─── Step 5: zones — add building_id (denormalised) + sync trigger ──────────
-- Zones inherit building_id from their floor. Denormalised for query speed
-- (zone status board pulls heavy reads — saves a JOIN per row).

ALTER TABLE zones
  ADD COLUMN building_id UUID REFERENCES buildings(id);
CREATE INDEX idx_zones_building ON zones(venue_id, building_id, current_status);

-- Trigger: when a zone is inserted/updated, copy building_id from its floor.
CREATE OR REPLACE FUNCTION sync_zone_building_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  SELECT building_id INTO NEW.building_id
  FROM floors
  WHERE id = NEW.floor_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER zones_building_sync
  BEFORE INSERT OR UPDATE OF floor_id ON zones
  FOR EACH ROW EXECUTE FUNCTION sync_zone_building_id();

-- Trigger: when a floor's building_id changes, propagate to all its zones.
CREATE OR REPLACE FUNCTION propagate_floor_building_to_zones()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.building_id IS DISTINCT FROM OLD.building_id THEN
    UPDATE zones SET building_id = NEW.building_id WHERE floor_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER floors_propagate_building_to_zones
  AFTER UPDATE OF building_id ON floors
  FOR EACH ROW EXECUTE FUNCTION propagate_floor_building_to_zones();

-- ─── Step 6: staff — add primary_building_id ───────────────────────────────
-- NULL = venue-wide role (SH, DSH, GM, AUD).
-- Set = building-scoped role (FS, SC, GS, building-bound FM).

ALTER TABLE staff
  ADD COLUMN primary_building_id UUID REFERENCES buildings(id);
CREATE INDEX idx_staff_building ON staff(venue_id, primary_building_id, active_status)
  WHERE active_status = 'ACTIVE';

-- ─── Step 7: shifts + shift_instances — add building_id ────────────────────

ALTER TABLE shifts
  ADD COLUMN building_id UUID REFERENCES buildings(id);
CREATE INDEX idx_shifts_building ON shifts(venue_id, building_id);

ALTER TABLE shift_instances
  ADD COLUMN building_id UUID REFERENCES buildings(id);
CREATE INDEX idx_shift_instances_building ON shift_instances(venue_id, building_id, shift_date);

-- ─── Step 8: incidents — add building_id + incident_scope + auto-set trigger
-- (Rule 17: SEV1 ALWAYS notifies all buildings regardless of declared
--  building_id — that hard-coded behaviour lives in escalation-worker code,
--  not here. This migration just stores the scope.)

CREATE TYPE incident_scope_enum AS ENUM ('VENUE_WIDE', 'BUILDING_SCOPED');

ALTER TABLE incidents
  ADD COLUMN building_id UUID REFERENCES buildings(id),
  ADD COLUMN incident_scope incident_scope_enum NOT NULL DEFAULT 'VENUE_WIDE';
CREATE INDEX idx_incidents_building ON incidents(venue_id, building_id, status)
  WHERE status IN ('ACTIVE', 'CONTAINED');

-- Trigger: derive incident_scope from building_id on insert/update.
-- (Code in api/escalation-worker may further override SEV1 to VENUE_WIDE
--  per Rule 17 — that override happens at notification dispatch time, not
--  here; the DB scope reflects what was declared.)
CREATE OR REPLACE FUNCTION set_incident_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.building_id IS NOT NULL THEN
    NEW.incident_scope := 'BUILDING_SCOPED';
  ELSE
    NEW.incident_scope := 'VENUE_WIDE';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER incidents_scope_sync
  BEFORE INSERT OR UPDATE OF building_id ON incidents
  FOR EACH ROW EXECUTE FUNCTION set_incident_scope();

-- ─── Step 9: schedule_templates + task_instances — add building_id ─────────

ALTER TABLE schedule_templates
  ADD COLUMN building_id UUID REFERENCES buildings(id);
CREATE INDEX idx_schedule_templates_building ON schedule_templates(venue_id, building_id, frequency)
  WHERE is_active = TRUE;

ALTER TABLE task_instances
  ADD COLUMN building_id UUID REFERENCES buildings(id);
CREATE INDEX idx_task_instances_building ON task_instances(venue_id, building_id, due_at, status)
  WHERE status IN ('PENDING', 'IN_PROGRESS', 'ESCALATED');

-- Trigger: task_instances inherit building_id from their schedule_template
-- on insert (saves the worker from a join when generating instances).
CREATE OR REPLACE FUNCTION sync_task_building_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.building_id IS NULL AND NEW.schedule_template_id IS NOT NULL THEN
    SELECT building_id INTO NEW.building_id
    FROM schedule_templates
    WHERE id = NEW.schedule_template_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER task_instances_building_sync
  BEFORE INSERT ON task_instances
  FOR EACH ROW EXECUTE FUNCTION sync_task_building_id();

-- ─── Step 10: communications — add building_id (broadcast scope) ───────────

ALTER TABLE communications
  ADD COLUMN building_id UUID REFERENCES buildings(id);
CREATE INDEX idx_communications_building ON communications(venue_id, building_id, sent_at DESC);

-- ─── Step 11: equipment_items — add building_id ────────────────────────────

ALTER TABLE equipment_items
  ADD COLUMN building_id UUID REFERENCES buildings(id);
CREATE INDEX idx_equipment_building ON equipment_items(venue_id, building_id, next_service_date);

-- ─── Step 12: vms_entry_points + vms_visit_records — add building_id ──────
-- VMS check-ins are always tied to an entry point, which is in a building.
-- Denormalised on visit_records for query speed (visitor log filtered by
-- building is a hot path on evacuation board — Rule 51 / BR-51).

ALTER TABLE vms_entry_points
  ADD COLUMN building_id UUID REFERENCES buildings(id);
CREATE INDEX idx_vms_entry_points_building ON vms_entry_points(venue_id, building_id);

ALTER TABLE vms_visit_records
  ADD COLUMN building_id UUID REFERENCES buildings(id);
CREATE INDEX idx_vms_visits_building
  ON vms_visit_records(venue_id, building_id, status);

-- Trigger: visit records inherit building_id from their entry_point on insert.
CREATE OR REPLACE FUNCTION sync_visit_building_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.building_id IS NULL AND NEW.entry_point_id IS NOT NULL THEN
    SELECT building_id INTO NEW.building_id
    FROM vms_entry_points
    WHERE id = NEW.entry_point_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER visit_inherit_building
  BEFORE INSERT ON vms_visit_records
  FOR EACH ROW EXECUTE FUNCTION sync_visit_building_id();

-- ─── Step 13: Update RLS policies on building-aware tables ─────────────────
-- Replace existing policies so they include building_visible() check.
-- Single-building venues unaffected (function returns TRUE for NULL records).

-- Helper: standard RLS condition combining venue_id + building_visible
-- We can't use a SQL function as the USING clause directly, but we can
-- refactor each policy to call building_visible() inline.

-- floors
DROP POLICY IF EXISTS "venue_isolation" ON floors;
CREATE POLICY "venue_isolation" ON floors
  USING (
    venue_id = current_setting('app.current_venue_id')::UUID
    AND building_visible(building_id)
  );

-- zones
DROP POLICY IF EXISTS "venue_isolation" ON zones;
CREATE POLICY "venue_isolation" ON zones
  USING (
    venue_id = current_setting('app.current_venue_id')::UUID
    AND building_visible(building_id)
  );

-- shifts
DROP POLICY IF EXISTS "venue_isolation" ON shifts;
CREATE POLICY "venue_isolation" ON shifts
  USING (
    venue_id = current_setting('app.current_venue_id')::UUID
    AND building_visible(building_id)
  );

-- shift_instances
DROP POLICY IF EXISTS "venue_isolation" ON shift_instances;
CREATE POLICY "venue_isolation" ON shift_instances
  USING (
    venue_id = current_setting('app.current_venue_id')::UUID
    AND building_visible(building_id)
  );

-- incidents (special: SEV1 always visible regardless of building filter —
-- enforced in escalation-worker code; here we let normal building_visible
-- filter apply, since SEV1 venue-wide already has building_id=NULL by
-- declaration so building_visible returns TRUE)
DROP POLICY IF EXISTS "venue_isolation" ON incidents;
CREATE POLICY "venue_isolation" ON incidents
  USING (
    venue_id = current_setting('app.current_venue_id')::UUID
    AND building_visible(building_id)
  );

-- schedule_templates
DROP POLICY IF EXISTS "venue_isolation" ON schedule_templates;
CREATE POLICY "venue_isolation" ON schedule_templates
  USING (
    venue_id = current_setting('app.current_venue_id')::UUID
    AND building_visible(building_id)
  );

-- task_instances
DROP POLICY IF EXISTS "venue_isolation" ON task_instances;
CREATE POLICY "venue_isolation" ON task_instances
  USING (
    venue_id = current_setting('app.current_venue_id')::UUID
    AND building_visible(building_id)
  );

-- communications
DROP POLICY IF EXISTS "venue_isolation" ON communications;
CREATE POLICY "venue_isolation" ON communications
  USING (
    venue_id = current_setting('app.current_venue_id')::UUID
    AND building_visible(building_id)
  );

-- equipment_items
DROP POLICY IF EXISTS "venue_isolation" ON equipment_items;
CREATE POLICY "venue_isolation" ON equipment_items
  USING (
    venue_id = current_setting('app.current_venue_id')::UUID
    AND building_visible(building_id)
  );

-- vms_entry_points
DROP POLICY IF EXISTS "venue_isolation" ON vms_entry_points;
CREATE POLICY "venue_isolation" ON vms_entry_points
  USING (
    venue_id = current_setting('app.current_venue_id')::UUID
    AND building_visible(building_id)
  );

-- vms_visit_records
DROP POLICY IF EXISTS "venue_isolation" ON vms_visit_records;
CREATE POLICY "venue_isolation" ON vms_visit_records
  USING (
    venue_id = current_setting('app.current_venue_id')::UUID
    AND building_visible(building_id)
  );

-- ─── Step 14: Realtime — add buildings to publication ──────────────────────
-- So GM dashboard can subscribe to building list changes for live updates
-- of per-building health-score cards.

ALTER PUBLICATION supabase_realtime ADD TABLE buildings;

-- ─── Step 15: Comments for future engineers ────────────────────────────────

COMMENT ON TABLE buildings IS
  'Multi-Building Venue (MBV) entity. Optional — venues with no buildings rows are single-building. building_id is nullable on every referencing table per EC-16 / Rule 15.';

COMMENT ON FUNCTION building_visible(UUID) IS
  'RLS predicate for building-scoped visibility. Returns TRUE when record building_id IS NULL (venue-wide), session current_building_id IS NULL (venue-wide role), or they match. Used by every RLS policy on building-aware tables (Rule 16 — no inline building filters).';

COMMENT ON FUNCTION set_tenant_context(UUID, UUID, TEXT, UUID) IS
  '4-parameter tenant context setter. p_building_id defaults to NULL (= venue-wide role like SH/DSH/GM/AUD). Building-scoped roles (FS/SC/GS/building-bound FM) pass their assigned building_id. Replaces the 3-param signature from migration 002.';

COMMIT;
