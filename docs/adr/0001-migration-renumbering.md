# ADR 0001 — Migration Renumbering: Spec ↔ Repo Divergence

**Status:** Accepted
**Date:** 2026-05-04
**Deciders:** Sachin Sablok (Founder), Nexus Prime (claude-opus-4-7)
**Spec authority:** Architecture v7 (`nexus/specs/2026-05-10_SafeCommand_Architecture_v7_Complete.md`) §3.4, §16.3
**Repo authority:** `supabase/migrations/` directory

---

## Context

Architecture v7 §3.4 + §16.3 prescribes two new database migrations to unblock the v7 scope (MBV + Brand Layer + Roaming + Drill Management):

- **Spec Migration 007** — Multi-Building Venue (MBV): `buildings` table, `building_visible()` RLS function, 4-parameter `set_tenant_context()`, `ADD COLUMN building_id` on floors / zones / staff / shifts / incidents / schedule_templates / task_instances / communications / equipment / vms_*. Includes `zones_building_sync` and `visit_inherit_building` triggers.
- **Spec Migration 008** — Brand + Roaming + Drill: `corporate_brand_configs` (with `CHECK powered_by_text = 'Platform by SafeCommand'` per EC-18 / Rule 20), `roaming_staff_assignments`, `drill_sessions`, `drill_session_participants`.

However, the SafeCommand repository **already has migrations 007 and 008 deployed to production Supabase** with different content:

| Repo file (deployed) | Content | Deployed |
|---|---|---|
| `supabase/migrations/007_schedule_time.sql` | `ALTER TABLE schedule_templates ADD COLUMN start_time TEXT, ADD COLUMN timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata', ADD COLUMN secondary_escalation_chain staff_role_enum[] NOT NULL DEFAULT '{}'` | 2026-04-30 (via psql to Supabase pooler) |
| `supabase/migrations/008_comm_deliveries_nullable.sql` | Relaxed NOT NULL on a `comm_deliveries` field | 2026-04-30 |

Hard Rule 3 (Architecture v7 §13): *"Never modify a committed database migration. Always add a new migration file. Never edit 001_*.sql, 002_*.sql, etc. after they've been applied to any environment."*

The two numbering schemes therefore collide. A decision is required to reconcile spec authority with deployed schema integrity.

---

## Decision

**Renumber the spec-canonical migrations going forward in this repo:**

| Spec name (Architecture v7) | Repo filename (this codebase) | Content scope |
|---|---|---|
| Migration 007 (MBV) | `009_mbv.sql` | `buildings` table, `building_visible()`, 4-param `set_tenant_context()`, building_id column additions across schema, denormalisation triggers |
| Migration 008 (Brand + Roaming + Drill) | `010_brand_roaming_drill.sql` | `corporate_brand_configs`, `roaming_staff_assignments`, `drill_sessions`, `drill_session_participants` |

The repo migration sequence after this ADR will read:

```
001_enums.sql
002_tables.sql
003_rls.sql
004_indexes.sql
005_seed_templates.sql
006_realtime.sql
007_schedule_time.sql                  ← deployed 2026-04-30
008_comm_deliveries_nullable.sql       ← deployed 2026-04-30
009_mbv.sql                            ← spec migration 007 (new)
010_brand_roaming_drill.sql            ← spec migration 008 (new)
```

All future migrations in this codebase will be numbered linearly from 011 onwards, regardless of their identity in the spec.

---

## Considered Alternatives

### Option B — Inline MBV into existing 007 (rejected)

Edit the deployed `007_schedule_time.sql` to also include MBV content.

- **Why rejected:** Direct violation of Hard Rule 3. Modifying a deployed migration desynchronises the dev environment from production, breaks idempotent re-application of the migration history, and destroys the audit trail for what was deployed when.

### Option C — Squash and reset (rejected)

Drop Supabase, replay migrations from scratch with renumbered files.

- **Why rejected:** Loses RLS Gate 1 proof (passed 2026-04-29), Gate 2 proof (passed 2026-04-30), every test record, and seeded template data. Unacceptable cost for a numbering preference.

### Option D — Branch numbering (suffixes) (rejected)

Use `007a_schedule_time.sql` (already deployed) and `007b_mbv.sql` (new) to preserve the spec's "007" identity for MBV.

- **Why rejected:** Supabase CLI orders migrations by full filename — the alphabetical sort works mechanically, but tooling assumes integer prefix. Adds parser fragility and conflicts with the linear-numbering convention used by every other Supabase project. Non-standard numbering creates onboarding friction for any future engineer.

---

## Consequences

### Positive

- **Hard Rule 3 honoured** — no deployed migration is touched
- **Linear, predictable numbering** — every migration has a unique integer prefix; standard Supabase tooling works without modification
- **Audit trail preserved** — what was deployed on 2026-04-30 stays exactly as-deployed
- **ADR captures the divergence permanently** — future engineers (or future-self in 18 months) have a single artefact explaining the spec ↔ repo mapping

### Negative

- **Spec ↔ repo numbering drift** — Architecture v7 references "Migration 007" and "Migration 008" for content that lives in repo files `009_mbv.sql` and `010_brand_roaming_drill.sql`. Engineers reading the spec must mentally translate.
- **Drift compounds over time** — every future v8/v9/v10 spec migration carries the +2 offset
- **Documentation surface to maintain** — CLAUDE.md, AWS-process-doc-IMP.md, and any product doc that names a migration must list both numbers

### Mitigations

1. **Migration mapping table in `products/Safecommand/CLAUDE.md`** — every spec migration ID listed alongside its repo filename. Single source of truth in the codebase entry point.
2. **Migration file headers** — each renumbered migration's first comment block names the originating spec migration:
   ```sql
   -- Migration 009 (this repo) | Spec Migration 007 (Architecture v7 §3.4)
   -- Multi-Building Venue (MBV) — buildings table, building_visible(), 4-param set_tenant_context
   ```
3. **Future spec citations** — when referencing the spec in commits, PRs, or session logs, use the form *"Spec Migration 007 (repo: `009_mbv.sql`)"* until everyone internalises the offset.

---

## Implementation Notes

### When the renumbered migrations are written (Phase B — June 2026)

**`009_mbv.sql`** must implement, in order:

1. `CREATE TABLE buildings` with `venue_id` FK, `name`, `short_code`, optional address/GPS/floor_plan_url
2. `ALTER TABLE floors ADD COLUMN building_id UUID REFERENCES buildings(id) ON DELETE CASCADE`
3. `ALTER TABLE zones ADD COLUMN building_id UUID REFERENCES buildings(id)` + `sync_zone_building_id()` trigger (denormalised for query speed)
4. `ALTER TABLE staff ADD COLUMN primary_building_id UUID REFERENCES buildings(id)`
5. `ALTER TABLE shifts ADD COLUMN building_id UUID REFERENCES buildings(id)`
6. `ALTER TABLE shift_instances ADD COLUMN building_id UUID REFERENCES buildings(id)`
7. `ALTER TABLE incidents ADD COLUMN building_id, ADD COLUMN incident_scope` + `set_incident_scope()` trigger
8. `ALTER TABLE schedule_templates ADD COLUMN building_id`
9. `ALTER TABLE task_instances ADD COLUMN building_id`
10. `ALTER TABLE communications ADD COLUMN building_id`
11. `ALTER TABLE vms_entry_points ADD COLUMN building_id`
12. `ALTER TABLE vms_visits ADD COLUMN building_id` + `visit_inherit_building` trigger
13. Equipment items + drill records: `ADD COLUMN building_id` (forward-compatible, even if drill_sessions table created in 010)
14. `CREATE OR REPLACE FUNCTION building_visible(row_building_id UUID) RETURNS BOOLEAN` — returns TRUE when row.building_id IS NULL OR session.current_building_id IS NULL OR they match
15. `CREATE OR REPLACE FUNCTION set_tenant_context(p_venue_id UUID, p_staff_id UUID, p_role TEXT, p_building_id UUID DEFAULT NULL)` — replaces existing 3-param function
16. Update all RLS policies on building-aware tables to include `building_visible(building_id)`

**Constraint per EC-16:** Every `building_id` column **must be nullable** — no `NOT NULL` constraints. NULL = venue-wide. Single-building venues are unaffected.

**`010_brand_roaming_drill.sql`** must implement:

1. `CREATE TABLE corporate_brand_configs` with all brand fields (logo_url, primary_colour, secondary_colour, brand_name, app_display_name, notification_sender_name, role_overrides JSONB, terminology_dictionary JSONB, report_header_text) — and a `CHECK (powered_by_text = 'Platform by SafeCommand')` constraint per EC-18 / Rule 20
2. `CREATE TABLE roaming_staff_assignments` (staff_id, venue_id, role, building_id, granted_by_sc_ops_id, is_active, granted_at) — with a partial index on `(staff_id) WHERE is_active = true` and a check that staff has ≤10 active rows
3. `CREATE TABLE drill_sessions` (venue_id, building_id nullable, drill_type, started_at, ended_at, started_by_sh_id, status, notes) + RLS `venue_isolation` + `building_visible()` policy
4. `CREATE TABLE drill_session_participants` (drill_session_id FK, staff_id, acknowledged_at, status)

### Sparse-by-design brand configs (Q2 decision corollary)

`corporate_brand_configs` rows are intentionally sparse — every nullable field that is NULL falls through to SafeCommand defaults. The application layer (`useBrand()`, `useLabel()`) is responsible for the fallthrough. SC Ops is not required to populate every field for every account; only the contractually agreed overrides are recorded.

This preserves the principle: **opt-in customisation, opinionated defaults.**

---

## Validation

This ADR is considered satisfied when:

- [ ] `docs/adr/0001-migration-renumbering.md` exists in the repo (this file)
- [ ] `products/Safecommand/CLAUDE.md` contains a migration mapping table listing both spec and repo numbers
- [ ] Future commits referencing spec migrations 007 / 008 use the form "Spec Migration 007 (repo: `009_mbv.sql`)"
- [ ] When `009_mbv.sql` is written, its file header references both spec source and this ADR
- [ ] When `010_brand_roaming_drill.sql` is written, same header convention

---

## References

- Architecture v7 §3.4 — Migration 007 schema
- Architecture v7 §3.5 — Migration 008 schema
- Architecture v7 §13 — Hard Rule 3
- Architecture v7 §16.3 — Resume Checklist (spec citation source)
- Repo: `supabase/migrations/007_schedule_time.sql` (deployed 2026-04-30)
- Repo: `supabase/migrations/008_comm_deliveries_nullable.sql` (deployed 2026-04-30)
- Plan: `report-gen/2026-05-04-22:30_plan.md` (decision Q1)

---

*ADR captured 2026-05-04 · Status: Accepted · Next ADR: 0002 — TBD*
