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

## 2026-05-19 Amendment — v9 Evacuation Map Studio Migration (Phase 5.23)

Business Plan v9.0 + Architecture v9 (`nexus/specs/2026-05-18_*`) introduce the Evacuation Map Studio (Phase 5.23, Q4 2027). The **Business Plan v9 §9 refers to this migration as `012_evacuation_map_studio.sql`** — but that is a *logical label only*, authored against the spec's own internal numbering, not the repo's. The repo has long since consumed 012:

| Repo file (deployed) | Content | Deployed |
|---|---|---|
| `012_rls_schedule_template_seeds.sql` | RLS security patch on `schedule_template_seeds` | 2026-05-06 |
| `013_drill_participant_reason.sql` | Drill participant reason taxonomy (ADR 0004) | 2026-05-07 |
| `014_sire_engine.sql` | SIRE schema (8 tables + 1 view + 5 cols) | 2026-05-08 |
| `015` … `019` | SIRE template fallback / corp-view security / template seeds / declarer snapshot / SIRE-default-on | 2026-05-08 → 2026-05-17 |

**The next available migration number is `020`.** (The 2026-05-08 amendment above said "016 next"; that has since advanced — 016/017/018/019 were consumed by SIRE Phase 5.21 work. Verified against `supabase/migrations/` directory state, 2026-05-19.)

| Spec name (Business Plan v9 §9 / Architecture v9 §21) | Repo filename (this codebase) | Content scope |
|---|---|---|
| Migration 012 (Evacuation Map Studio — BP v9 logical label) | `020_evacuation_map_studio.sql` | 5 tables: `floor_plans`, `evacuation_annotations`, `evacuation_posting_locations`, `evacuation_compliance_runs`, `evacuation_map_renders` — all RLS-enabled, all `venue_id`-scoped, IMDF-compatible GeoJSON canonical (EC-24) |

**Architecture v9 §16.2 already self-reconciles to `020`** and explicitly states it "treats `020` as authoritative; the business plan's `012` is a logical label, not a file number." This amendment ratifies that: **the Architecture v9 file number (`020`) is authoritative; the Business Plan's `012` is never to be used as a filename.**

**Not yet written.** Phase 5.23 is Q4 2027, gated behind the June 2026 unfreeze + pilots. Per **Hard Rule 24 (extended in v9)**, `020_evacuation_map_studio.sql` MUST be applied and verified before any Evacuation Map Studio API/editor code deploys — exact parallel to the mig-014-before-SIRE-code discipline. When written, its file header must reference both the spec source (BP v9 §9 / Arch v9 §21) and this ADR, per the existing header convention.

This is the fourth spec ↔ repo offset documented in this ADR (007/008 → 009/010; SIRE "011" → 014; Map Studio "012" → 020). The offset is no longer linear; **the rule going forward is simply: the next free integer in `supabase/migrations/`, never the spec's logical label.**

### Architecture v9.1 (2026-05-19) — this decision is now SPEC-RATIFIED + standards-closure migrations 021/022/023

Architecture **v9.1** (`nexus/specs/SafeCommand_Architecture_v91_Complete.md`, supersedes v9.0) **§1.3b "Confirmed ADRs — Complete Register"** formally adopts the rule above into the spec itself. It declares the authoritative deployed sequence verbatim:

```
009_mbv · 010_brand_roaming_drill · 011_staff_lifecycle ·
012_rls_schedule_template_seeds · 013_drill_detail · 014_sire_engine ·
015_sire_template_fallback · 016_corp_view_security ·
017_sire_template_seeds · 018_incidents_declarer_snapshot ·
019_sire_default_on · 020_evacuation_map_studio (Phase 5.23) ·
021_standards_closure_p1 (Phase 5.23) · 022_lms_integration (Phase 5.23) ·
023_drill_tabletop_nabh_qis (Phase 5.23 + Phase B view)
```

and states: *"Reference labels used in business documents (e.g. BP v9 'Migration 012 evacuation map studio') are logical labels predating the deployed sequence; the architecture document treats the **NNN file number as authoritative**."*

**Consequence — the offset is eliminated for 020+.** Because v9.1 adopted the repo's file-numbering, the architecture and the repo now use the *same* integers (020/021/022/023). There is no longer a translation step for new migrations; the only residual "logical label" is the legacy BP v9 string "Migration 012", which §1.3b explicitly overrides. ADR 0001's mitigation #3 ("Spec Migration N (repo: 0NN)") is no longer needed for v9.x work — cite the file number directly.

**Three new Phase 5.23 / Phase B migrations (Architecture v9.1 §23 — "Standards-Closure BRs Architecture", ~890 lines), all NOT YET WRITTEN:**

| Repo filename | Scope | BRs | Phase |
|---|---|---|---|
| `021_standards_closure_p1.sql` | 5 tables: `annual_plan_reviews`, `safety_committee_meetings`, `refuge_area_occupancy_snapshots`, `amc_contracts`, `msds_documents` (all RLS + venue_id) | BR-AA, BR-AB, BR-AD, BR-AF, BR-AG (BR-AC reuses mig 020 `evacuation_annotations` ROUTE_HORIZONTAL — no new table) | 5.23 |
| `022_lms_integration.sql` | 3 tables: `lms_courses`, `lms_enrolments`, `lms_completions` + cert-linkage trigger updating `staff_certifications` on completion | BR-AH | 5.23 |
| `023_drill_tabletop_nabh_qis.sql` | `drill_sessions.drill_type` enum extension (`+TABLETOP`) + `nabh_quality_indicators_view` (includes mandatory **Hard Rule 25** anon/authenticated REVOKE + verification DO block) | BR-AI (5.23), BR-AJ (Phase B view) | 5.23 / B |

Same discipline as mig 020: **Hard Rule 24 (schema-before-code) applies to 021/022/023 individually.** All gated behind the June 2026 unfreeze + pilots; earliest Q4 2027. When written, each file header references its spec source (Arch v9.1 §23.x) + this ADR.

---

## 2026-05-19 Amendment — §23 Standards-Closure pull-forward (founder-authorised)

The founder authorised pulling forward the **3 independent** standards-closure registers — **BR-AB Safety Committee · BR-AF AMC registry · BR-AG MSDS repository** — ahead of their v9.1 Phase-5.23 timing (the SIRE-Day-1 early-build pattern). This amendment records the resulting numbering + adaptation decisions; the prior amendment's "021/022/023 spec-ratified sequence" was the *intended* order assuming Phase-5.23 build order — pulling a subset forward changes the build order, so the deployed numbers follow ACTUAL order per this ADR's core rule.

**Decision 1 — file number = `020` (next free integer).** Highest deployed/written migration = `019`. Per this ADR's invariant ("the next free integer in `supabase/migrations/`, never the spec's logical label" — and v9.1 §1.3b: "the NNN file number is authoritative; reference labels … are logical labels"), the pulled-forward subset is **`020_standards_closure_p1.sql`**. v9.1 §1.3b's "020 = evacuation_map_studio / 021 = standards_closure_p1 / 022 = lms / 023 = drill_tabletop" is now a **logical label set, not file numbers**. Updated authoritative mapping:

| Logical (v9.1 §1.3b) | Repo file | State |
|---|---|---|
| standards_closure_p1 (3 of 5 tables) | **`020_standards_closure_p1.sql`** | written 2026-05-19; ⏳ founder psql-apply |
| evacuation_map_studio | next free integer when Phase 5.23 builds (≥021) | unwritten |
| lms_integration | next free integer when built | unwritten |
| drill_tabletop_nabh_qis | next free integer when built | unwritten |
| standards_closure remainder (`annual_plan_reviews` BR-AA + `refuge_area_occupancy_snapshots` BR-AD) | next free integer **after** Map-Studio mig (hard FK dep on `floor_plans`/`evacuation_annotations`) | unwritten |

No numeric gap (009 → 020 contiguous). The "next free integer, never the spec label" rule is reaffirmed as the single invariant; spec/BP migration numbers are always logical.

**Decision 2 — subset, not the full 5-table v9.1 `021`.** Only the 3 tables with **no FK to the Map-Studio migration** are pulled forward. `annual_plan_reviews` (FK `floor_plans`) and `refuge_area_occupancy_snapshots` (FK `evacuation_annotations`) are **deferred** to a future migration created *after* the Map-Studio migration exists. They MUST NOT be retro-added into `020` (Hard Rule 3).

**Decision 3 — pre-deploy adaptation (parallels the SIRE mig 014 fixes).** v9.1 §23.1 writes `amc_contracts` + `msds_documents` with `building_id UUID REFERENCES buildings(id)` and RLS `… AND building_visible(building_id)`. `buildings` + `building_visible()` are created by mig `009` (MBV), **PENDING Phase B (not deployed)** — referencing them would fail at apply. Per EC-16 (building_id always nullable; NULL = venue-wide) + NFR-25 (pre-MBV = single-building = building scoping is a no-op), `building_id` + `building_visible()` are **omitted** from `020`. The MBV-era migration (the `009` family that `ADD COLUMN building_id` across the schema) will additively add them + refresh these RLS policies — the established MBV pattern. `safety_committee_meetings` has no `building_id` in the spec → reproduced verbatim.

**Decision 4 — Hard Rule 24 hand-off.** `020_standards_closure_p1.sql` is additive-only (3 `CREATE TABLE` + RLS + indexes; no views → Hard Rule 25 N/A). It MUST be applied + verified in production **before** any `/v1/safety-committee`, `/v1/amc-contracts`, or `/v1/msds` code deploys. Founder applies (same mechanism as SIRE Day-1):

```
psql "<supabase session-pooler url>" --single-transaction -v ON_ERROR_STOP=1 \
     -f supabase/migrations/020_standards_closure_p1.sql
```

Expected: `NOTICE: Migration 020 PASSED: 3 standards-closure tables, all RLS enabled`. Schema is dormant until the API/UI code ships (next pass) — existing operations unaffected (Hard Rule 24 satisfied for the current deploy).

---

## 2026-05-20 Amendment — Spec ↔ Repo authority principle (durable rule) + Shift-Roster wave numbering + §23 mig 020 deploy confirmation

### §23 mig 020 — deploy confirmed

`020_standards_closure_p1.sql` (Safety Committee + AMC + MSDS, 3 tables) was applied by the founder via Supabase SQL Editor on **2026-05-19** (verified: 3 rows, `rowsecurity=true`). The 2026-05-19 hand-off is now closed. **Migration 020 is LIVE in production.**

### Spec ↔ Repo authority principle (promoted to durable rule)

Architecture documents and business plans frequently include forward-looking *reservation tables* — e.g., Arch v9.1 §1.3b reserved ADR-0007 through ADR-0010 (IMDF / Konva / jurisdiction-profiles / AI-parsing) and named "021_standards_closure_p1" as the standards-closure migration; the Shift Roster Requirements v1.0 referenced "ADR-0011" and "Migration 024+". **Reservation tables are documentation hints, not bindings.** When in conflict with deployed reality:

| Question | Authoritative source |
|---|---|
| What is the next-free migration number? | **Repo** (`supabase/migrations/` directory at write time) |
| What is the next-free ADR number? | **Repo** (`docs/adr/` directory at write time) |
| What does ADR-NNNN say? | **Repo** (`docs/adr/NNNN-slug.md`) |
| What are the deployed migrations? | **Repo** (CI deployment log + Supabase tracker) |
| Reserved / placeholder ADRs in spec §1.3b | **Spec — forward-looking only, no binding force** |
| Reserved migration numbers in spec | **Spec — forward-looking only, no binding force** |
| Active BRs | **Spec** (Arch v9.x §2.1) — verified against repo build state in §16 |
| Active EC/NFR/Hard-Rule counts | **Spec** (Arch v9.x §1.3) |

**Rule:** Spec documents propose; repo invariants dispose. When in conflict, write a reconciliation note in the next architecture revision; do not modify the repo to fit the spec. (This principle was implicit in the v9.1 amendment's mig-012→020 reconciliation and the §23 pull-forward's number choice; it is now an explicit, durable invariant.)

### Shift-Roster wave migration numbering (Phase 5.24, planned)

| Logical (Shift Roster spec) | Repo file | Wave / Phase | State (2026-05-20) |
|---|---|---|---|
| Migration 024 — BR-AR multi-shift breaks | **`021_shifts_multi_shift_breaks.sql`** | Wave 1 — pull-forward | **Written 2026-05-20**; ⏳ founder psql-apply (Aug 2026 per arch doc bandwidth plan; can be earlier) |
| Migration 025 — BR-AK/AL/AM/AN/AO/AP/AS/AT (roster engine) | **`022_roster_engine.sql`** | Wave 2 — Phase 5.24 | unwritten — Q1 2028 |
| Migration 026 — BR-AQ coverage rules | **`023_coverage_rules.sql`** | Wave 2 — Phase 5.24 | unwritten — Q1 2028 |

### Authoritative deployed-migration map (post-shift-roster wave)

```
009  MBV                                  [DEPLOYED 2026-05-06]
010  brand/roaming/drill                  [DEPLOYED 2026-05-06]
011  staff lifecycle                      [DEPLOYED 2026-05-06]
012  RLS reference                        [DEPLOYED 2026-05-06]
013  drill detail                         [DEPLOYED 2026-05-07]
014  SIRE                                 [DEPLOYED 2026-05-08]
015  SIRE fallback                        [DEPLOYED 2026-05-08]
016  corp view security                   [DEPLOYED 2026-05-08]
017  SIRE seeds                           [DEPLOYED 2026-05-09]
018  declarer snapshot / incident_evidence[DEPLOYED 2026-05-09 / -17]
019  SIRE default-on / Phase 5.22         [DEPLOYED 2026-05-17]
020  standards-closure P1 subset          [DEPLOYED 2026-05-19 — §23 pull-forward]
021  shifts multi-shift breaks (BR-AR)    [WRITTEN 2026-05-20; ⏳ founder apply]
022  roster engine                        [unwritten — Q1 2028 Phase 5.24]
023  coverage rules                       [unwritten — Q1 2028 Phase 5.24]
024+ Map Studio + LMS + drill-tabletop +
     NABH-QIs + deferred std-closure 2    [unwritten — Phase 5.23 + Phase B]
```

### ADR numbering — handover-decoupling correction

The Shift Roster spec referenced **"ADR-0011 — Decouple handover from daily assignment"** per the Arch v9.1 §1.3b reservation table. Per the spec↔repo authority principle above, the **next-free integer at write time** is 0007 (deployed: 0001–0006). Therefore:

| Spec (Shift Roster v1.0/v1.1 + Arch Roster v1 §9) | Repo |
|---|---|
| "ADR-0011 — Decouple handover from daily assignment" | **`docs/adr/0007-decouple-handover-from-daily-assignment.md`** (written 2026-05-20) |

The four v9.1 placeholders (0007/0008/0009/0010 for IMDF/Konva/jurisdiction-profiles/AI-parsing), if/when formalised, take slots 0008 through 0011 in order of formalisation. **Reservation tables do not pre-claim slots.**

### Founder psql hand-off for mig 021 (when ready)

Same mechanism as mig 020 (which the founder applied via the Supabase SQL Editor on 2026-05-19):

```
psql "<supabase session-pooler url>" --single-transaction -v ON_ERROR_STOP=1 \
     -f supabase/migrations/021_shifts_multi_shift_breaks.sql
```

Or paste the file contents into the Supabase Dashboard SQL Editor (same project as mig 020). Expected: `NOTICE: Migration 021 PASSED: shifts extended with 5 columns; is_overnight is GENERATED`. Additive-only (5 new columns on `shifts`); existing rows auto-receive backwards-compatible defaults; bit-identical behaviour to today until BR-AR code deploys. Hard Rule 24 gates the code (handover-service refactor + `/v1/shifts` field surface + Ops Console editor) on this apply.

---

## 2026-05-21 Amendment — Mig 021 deploy confirmation + Shift-roster pattern-engine wave 2 (migs 022 + 023)

### Mig 021 — deploy confirmed

`021_shifts_multi_shift_breaks.sql` (BR-AR multi-shift flexibility: 5 ALTER columns + GENERATED `is_overnight` + JSONB `breaks` + `min_handover_minutes` + index + verification) was applied by the founder via Supabase SQL Editor on **2026-05-20** (verified: 5 cols on `shifts`, `is_overnight` has `is_generated = ALWAYS`, defaults all correct). The 2026-05-20 hand-off is now closed. **Migration 021 is LIVE in production.**

### Shift-roster pattern-engine pull-forward authorised — migs 022 + 023 written

The founder authorised the pattern-engine pull-forward on 2026-05-21 (the full Phase 5.24 wave 2 — BR-AK / AL / AM / AN / AO / AP / AQ / AS / AT / AU). Two migrations written, awaiting psql apply (same SIRE-Day-1 / §23 / mig 021 pattern).

**`022_roster_engine.sql` — 6 tables + 7 seeded rotations** (BR-AK / AL / AM / AN / AP + Refinement #1 child table):
- `rotation_cycle_library` — global, anon-REVOKE'd, seeded with 7 built-ins (`4_ON_2_OFF`, `2_2_3` Pitman, `WEEKLY_DAY_NIGHT`, `CONTINENTAL`, `4_DAY_NIGHT_4_OFF`, `STANDARD_OFFICE`, `STANDARD_6_DAY`)
- `roster_patterns` — recurring publishable templates (DRAFT → PUBLISHED → SUSPENDED → ARCHIVED)
- `roster_cycle_positions` — queryable child of roster_patterns (★ Refinement #1: replaces the original `shift_id_per_position` JSONB on the pattern row)
- `staff_roster_assignments` — per-staff working-day + weekly-off + hour-limits config
- `staff_unavailability` — leave/unavailability calendar with **`gist EXCLUDE`** preventing overlapping APPROVED rows for same staff (★ Refinement #6; requires `btree_gist` extension — created at top of mig)
- `shift_swap_requests` — staff-initiated swap workflow with **in-row state + audit_logs precedent** (★ Refinement #4) + **partial UNIQUE** preventing concurrent swap races (★ Refinement #5)

**`023_coverage_rules.sql` — 1 table** (BR-AQ):
- `coverage_rules` — per-(venue / zone / role / shift) minimum-staffing rules with priority MANDATORY/WARNING + standards-basis array. `role_code` uses `staff_role_enum` from mig 001 (★ Refinement #3). UNIQUE NULLS NOT DISTINCT scope key (PG15+).

### Pre-deploy adaptations (3 — same family as §23 mig 020 + BR-AR mig 021)

| # | Adaptation | Rationale |
|---|---|---|
| 1 | `building_id` + `AND building_visible(building_id)` OMITTED from `roster_patterns`, `staff_roster_assignments`, `coverage_rules` | v9.1 §5 references `buildings(id)` / `building_visible()` which live in mig 009 (PENDING Phase B). Per EC-16 + NFR-25, deferred to the MBV-era migration; pre-MBV every venue is single-building → building scoping is a no-op. The MBV-era migration additively `ADD COLUMN building_id` + refreshes RLS — established pattern. |
| 2 | `shift_swap_requests.original_assignment_id` + `counterpart_assignment_id` reference **`staff_zone_assignments(id)`** (the actual deployed table from mig 002) NOT the spec's logical `shift_assignments(id)` | Reconciliation Flag #4 (spec↔repo naming divergence). Semantic intent preserved: the swap operates on a staff-shift assignment row. If the pattern engine's code passes later introduce a separate `shift_assignments` abstraction, an additive migration can extend the swap-request FK then. |
| 3 | `btree_gist` extension created at top of mig 022 | Required for the `staff_unavailability` `EXCLUDE USING gist (staff_id WITH =, daterange(...) WITH &&) WHERE status='APPROVED'` constraint. |

### Updated authoritative deployed-migration map

```
009  MBV                                  [DEPLOYED 2026-05-06]
010  brand/roaming/drill                  [DEPLOYED 2026-05-06]
011  staff lifecycle                      [DEPLOYED 2026-05-06]
012  RLS reference                        [DEPLOYED 2026-05-06]
013  drill detail                         [DEPLOYED 2026-05-07]
014  SIRE                                 [DEPLOYED 2026-05-08]
015  SIRE fallback                        [DEPLOYED 2026-05-08]
016  corp view security                   [DEPLOYED 2026-05-08]
017  SIRE seeds                           [DEPLOYED 2026-05-09]
018  declarer snapshot / incident_evidence[DEPLOYED 2026-05-09 / -17]
019  SIRE default-on / Phase 5.22         [DEPLOYED 2026-05-17]
020  standards-closure P1 subset          [DEPLOYED 2026-05-19 — §23 pull-forward]
021  shifts multi-shift breaks (BR-AR)    [DEPLOYED 2026-05-20]
022  roster engine (BR-AK/AL/AM/AN/AP)    [WRITTEN 2026-05-21; ⏳ founder apply]
023  coverage rules (BR-AQ)               [WRITTEN 2026-05-21; ⏳ founder apply]
024+ Map Studio + LMS + drill-tabletop +
     NABH-QIs + deferred std-closure 2    [unwritten — Phase 5.23 + Phase B]
```

### Founder psql hand-off for migs 022 + 023 (when ready)

Same mechanism as mig 020 + mig 021. **Apply 022 FIRST, then 023** (023 depends on `staff_role_enum` + `roster_patterns` semantic context):

```
psql "<supabase session-pooler url>" --single-transaction -v ON_ERROR_STOP=1 \
     -f supabase/migrations/022_roster_engine.sql
# Expected: NOTICE 'Migration 022 PASSED: 6 tables (5 tenant-RLS + 1 global),
#                                          7 seeded rotations, btree_gist ready'

psql "<supabase session-pooler url>" --single-transaction -v ON_ERROR_STOP=1 \
     -f supabase/migrations/023_coverage_rules.sql
# Expected: NOTICE 'Migration 023 PASSED: coverage_rules table with RLS +
#                                          staff_role_enum + UNIQUE scope'
```

Or paste each file into the Supabase Dashboard SQL Editor sequentially (same flow you used for migs 020 + 021). Both are additive; existing operations unaffected; both dormant until pattern-engine code ships (Hard Rule 24).

---

## 2026-05-21 Amendment (later same day) — Migs 022 + 023 deploy confirmation + mig 024 SQL-Editor-RLS fix

### Migs 022 + 023 — deploy confirmed

The founder applied both migrations via the Supabase Dashboard SQL Editor on 2026-05-21:
- `022_roster_engine.sql` — 6 tables + 7 seeded rotations + `btree_gist` extension. Verified: 7 tables on public, all `rowsecurity=true`.
- `023_coverage_rules.sql` — 1 table (`coverage_rules`). Verified: present, `rowsecurity=true`, `role_code` = `staff_role_enum`.

### Behaviour-correcting follow-up: mig 024 — rotation_cycle_library auth-read policy

The Supabase Dashboard SQL Editor prompts to enable RLS on every new `public.*` table when applied via the web UI (a security default). The founder accepted the prompt during mig 022 apply, which left `rotation_cycle_library` in an **RLS-on, no-policy** state. With RLS enabled and no permissive policy, the existing `GRANT SELECT TO authenticated` is shadowed — authenticated reads would return 0 rows, and the pattern-engine UI's rotation dropdown would silently render empty.

**`024_rotation_cycle_library_read_policy.sql`** (written 2026-05-21; awaiting founder psql-apply) — purely additive: 1 `CREATE POLICY "auth_read_all" ON rotation_cycle_library FOR SELECT TO authenticated USING (true)` + verification block. **Adopts** the SQL-Editor's RLS-on posture (strictly better defence-in-depth than the original anon-REVOKE-only design — even if a future grant accidentally restored anon access at the privilege level, the policy still gates by role).

Apply method:
```
psql "<supabase session-pooler url>" --single-transaction -v ON_ERROR_STOP=1 \
     -f supabase/migrations/024_rotation_cycle_library_read_policy.sql
```
Expected: `NOTICE 'Migration 024 PASSED: rotation_cycle_library auth_read_all policy created (RLS on, 7 built-in rotations readable)'`. Or run the inline `CREATE POLICY` statement in the same SQL Editor session.

### Engineering learning captured (for future architecture-spec migrations)

When an architecture spec defines a "global, no-RLS" lookup table, **prefer ENABLE ROW LEVEL SECURITY + an explicit `USING(TRUE)` policy from the start**. It matches Supabase's default expectation (the SQL Editor prompt), is bit-equivalent to a grant-only design when the policy is `USING(TRUE)`, and prevents the prompt-accept-without-policy ergonomic gap. Added to the pre-deploy adaptation checklist for future spec author handoffs.

### Updated authoritative deployed-migration map

```
009  MBV                                  [DEPLOYED 2026-05-06]
010  brand/roaming/drill                  [DEPLOYED 2026-05-06]
011  staff lifecycle                      [DEPLOYED 2026-05-06]
012  RLS reference                        [DEPLOYED 2026-05-06]
013  drill detail                         [DEPLOYED 2026-05-07]
014  SIRE                                 [DEPLOYED 2026-05-08]
015  SIRE fallback                        [DEPLOYED 2026-05-08]
016  corp view security                   [DEPLOYED 2026-05-08]
017  SIRE seeds                           [DEPLOYED 2026-05-09]
018  declarer snapshot / incident_evidence[DEPLOYED 2026-05-09 / -17]
019  SIRE default-on / Phase 5.22         [DEPLOYED 2026-05-17]
020  standards-closure P1 subset          [DEPLOYED 2026-05-19]
021  shifts multi-shift breaks (BR-AR)    [DEPLOYED 2026-05-20]
022  roster engine                        [DEPLOYED 2026-05-21]
023  coverage rules (BR-AQ)               [DEPLOYED 2026-05-21]
024  rotation_cycle_library auth_read     [WRITTEN 2026-05-21; ⏳ founder apply]
025+ Map Studio + LMS + drill-tabletop +
     NABH-QIs + deferred std-closure 2    [unwritten — Phase 5.23 + Phase B]
```

---

*ADR captured 2026-05-04 · Last amended 2026-05-21 (migs 022/023 deploy confirmation + mig 024 SQL-Editor-RLS fix + engineering learning captured) · Status: Accepted*
