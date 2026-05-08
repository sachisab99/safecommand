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

## 2026-05-08 Amendment — v8 SIRE Migration 014 (Phase 5.21)

The repo offset documented above continues to compound forward. Architecture v8 (2026-05-10) §SIRE prescribes a single new migration introducing the Structured Incident Response Engine schema. Per architect resolution `docs/specs/SafeCommand_Phase521_Clarifications_Resolved.md` (2026-05-08), the architecture v8 doc references this as "Migration 011" in some sections — but that name is stale. The repo migration sequence has progressed past 011:

| Repo file (deployed) | Content | Deployed |
|---|---|---|
| `011_staff_lifecycle.sql` | 4-state staff lifecycle enum (ACTIVE/SUSPENDED/ON_LEAVE/TERMINATED); `is_active` becomes generated column | 2026-05-06 |
| `012_rls_schedule_template_seeds.sql` | RLS security patch: enable RLS on `schedule_template_seeds` (Supabase linter ERROR fix) | 2026-05-06 |
| `013_drill_participant_reason.sql` | ADR 0004 — drill participant reason taxonomy + audit columns + RLS RESTRICTIVE policy | 2026-05-07 |

**The next available migration number is 014.** Verified against `supabase/migrations/` directory state at HEAD `0bf1a82` (2026-05-08).

| Spec name (Architecture v8 §SIRE) | Repo filename (this codebase) | Content scope |
|---|---|---|
| Migration 011 (SIRE — informal v8 name; stale) | `014_sire_engine.sql` | Phase 5.21 SIRE schema — 5 columns on `incidents`, 8 new tables, 1 view (`corp_incident_aggregates`), RLS policies, indexes, global threshold default seed, environment + verification blocks |

This is the third spec ↔ repo offset documented in this ADR (after spec migrations 007/008 → repo 009/010). Going forward, the offset compounds at +3 — but rather than continue translating in every reference, future ADR amendments simply note "the next available repo migration number" since the spec naming convention has not stayed consistent across versions.

**Migration 014 final ToC** (per architect's `SafeCommand_Phase521_Clarifications_Resolved.md`):

```
014_sire_engine.sql contents — in order:

1.  Environment verification block (top of file)
2.  ALTER TABLE incidents (5 new columns: incident_subtype, is_drill,
    has_sire_data, resolved_templates, escalated_from_drill_id)
3.  CREATE TABLE incident_zone_states (live state, one row per zone × incident)
4.  CREATE TABLE incident_zone_state_log (append-only audit log, EC-22)
5.  CREATE TABLE incident_evacuation_triggers (immutable, Hard Rule 4)
6.  CREATE TABLE incident_action_templates (global + venue-specific)
7.  CREATE TABLE incident_action_assignments (status-aware, what was assigned)
8.  CREATE TABLE incident_response_actions (evidence records — only for DONE)
9.  CREATE TABLE incident_threshold_configs (4-tier inheritance schema)
10. CREATE TABLE incident_dashboard_prompts (auto-evac suggestions — BR-L)
11. CREATE VIEW corp_incident_aggregates (aggregate-only; no PII;
    WITH (security_invoker = false) for CORP-* read access)
12. RLS policies on all new tables
13. Indexes (≥6 specified + idx_iaa_pending partial index for SLA worker)
14. Seed: INSERT INTO incident_threshold_configs (global default — venue_id, venue_type, country all NULL)
15. Verification block (bottom — RAISE EXCEPTION if any of 10 objects missing)
```

Total: 8 new tables + 1 view + 1 ALTER = 10 new objects. Additive-only; safe to apply live.

**Engineering convention forward:** When referring to the SIRE migration in commits / PRs / sessions, use the form *"mig 014 (SIRE)"* — no spec migration number translation needed since v8 references are inconsistent. Cite `docs/specs/SafeCommand_Phase521_Clarifications_Resolved.md` for the authoritative ToC.

---

## 2026-05-08 Deployment update — Phase 5.21 Day 1 SHIPPED

Phase 5.21 Day 1 deployed to Supabase production same day (ahead of the originally-gated post-pilot validation window in v8 §16; founder elected early build). Two migrations went live in a single working session:

| Repo file (deployed) | Content | Apply method | Outcome |
|---|---|---|---|
| `014_sire_engine.sql` (746 lines after pre-deploy fixes) | Full SIRE schema — 8 new tables + 1 view + 5 incidents columns + global threshold seed + RLS policies + indexes (incl. `idx_iaa_pending` partial for SLA worker) | `psql --single-transaction -v ON_ERROR_STOP=1 -f` against the Supavisor session pooler (`aws-1-ap-northeast-1.pooler.supabase.com`) | Verification block printed `Tables: 8/8 · View: 1/1 · incidents columns: 5/5 · Global threshold seeded: 1/1 · idx_iaa_pending: 1/1 · All checks PASSED` |
| `015_sire_seed_fire_sh_global_template.sql` (229 lines) | EC-23 mandatory tier-6 (global+parent) fallback for FIRE/SH — one row in `incident_action_templates` with 6 mandatory + life-critical actions | Same `psql --single-transaction` mechanism | Embedded DO-block verification: synthetic input lands on tier 6 with 6 actions; out-of-band re-verification with venue/role context confirmed RLS permits venue users to read |

**Pre-deploy fixes applied between author and apply (commit `27e44f7`):**

1. **View column refs (3 errors):** `corp_incident_aggregates` referenced `v.venue_type / v.state / v.country` — only the first has a real source (`v.type`, alias-corrected); state/country are Phase 3 BR-79 work, so emitted as `NULL::TEXT` placeholders. Without this, `CREATE OR REPLACE VIEW` would have failed inside the `--single-transaction` wrap and rolled back the entire mig 014.
2. **RLS permissiveness (4 policies):** Architect's literal `USING (TRUE)` on templates + thresholds + append-only-log INSERTs would have allowed any `authenticated` Supabase client to write directly. Tightened to existing project conventions (`is_sc_ops()` for SC-Ops-only writes; `venue_id = current_venue_id()` for append-only INSERTs). The api uses service_role which bypasses RLS, so api operations were unaffected; the fix only closes the direct-supabase-client write path for non-SC-Ops authenticated users.

**Migration log update (per ADR 0001 convention):**

| Repo file | State | Deployed | Notes |
|---|---|---|---|
| `014_sire_engine.sql` | ✅ Live | 2026-05-08 | Hard Rule 24 satisfied. Schema in production but dormant — no Phase 5.21 endpoints deployed yet. |
| `015_sire_seed_fire_sh_global_template.sql` | ✅ Live | 2026-05-08 | EC-23 chain operational. Architect Day 1 acceptance gate satisfied. |

**Day 1 commit chain on `origin/safecommand_v7`:**
- `69adf46` feat(sire): mig 014 schema + state transition matrix (Phase 5.21 Day 1)
- `27e44f7` fix(mig 014): pre-deploy schema validation + RLS tightening
- `ffccdc3` feat(sire): mig 015 — global FIRE+SH default template (Day 1 gate)

The next available migration number is now 016 — for Phase 5.21 Day 5+ template additions or any other schema work.

---

*ADR captured 2026-05-04 · Last amended 2026-05-08 (Phase 5.21 Day 1 deployment) · Status: Accepted*
