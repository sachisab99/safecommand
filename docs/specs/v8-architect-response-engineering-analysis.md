# Engineering analysis of architect Phase 5.21 pre-flight response

> **Status:** Analysis-only deliverable
> **Authored:** 2026-05-08, in response to architect document `SafeCommand_Phase521_Preflight_Analysis.md`
> **Companion docs:**
> - Architect response: `docs/specs/SafeCommand_Phase521_Preflight_Analysis.md`
> - Engineering pre-flight: `docs/specs/phase-5-21-preflight.md`
> - Activity-templates spec: `docs/specs/incident-response-activity-templates.md`
> - v8 alignment analysis: `docs/specs/v8-alignment-analysis.md`

---

## 1. TL;DR — confidence and posture

**Confidence: HIGH.** The architect response is comprehensive, technically sound, and resolves every blocker raised in the engineering pre-flight. Specifically:

- **All 10 open questions resolved** with concrete implementation specifications (SQL DDL, TypeScript interfaces, code patterns). Engineering knows exactly what to build.
- **Migration number 014 confirmed correct** by repo verification (`ls supabase/migrations/` shows 001–013; 014 is next).
- **The state transition matrix** (10 states × 5 roles) is now a defined shared constant — eliminates ambiguity.
- **The transaction model for zone state PATCH** (UPSERT live row + APPEND-only audit log in one transaction) is the right pattern.
- **The CORP-* `corp_incident_aggregates` view** is well-specified and improves on my original RLS-scattered approach.
- **Several issues I missed are now caught:** Realtime subscription scope filter, action-time-target SLA implementation detail, mobile local SQLite for offline photo upload, environment verification at migration top, S3 severity tagging at upload time.

**Net posture:** Ready to begin Phase 5.21 build *after* the small set of clarifications in §4 are resolved + the documented pre-conditions are met. No code changes needed yet.

**Time to build kickoff:** 1–2 days of clarification + spec hygiene; then build is unblocked. Schema design has zero divergence from the architect spec — this is unusual and indicates the design is mature.

---

## 2. What's clearly aligned (no further action)

### 2.1 Question resolutions — all 10 accepted

| # | Question | Resolution | Engineering position |
|---|---|---|---|
| Q1 | Auto-evac suggestion + drill incidents | Skip for `FIRE_DRILL` + `EVACUATION_DRILL` + `is_drill=TRUE`. Log internally for analytics. | ✅ Clear; will implement in Day 5 escalation worker |
| Q2 | Realtime mechanism | Supabase Realtime + `incident_id=eq.X` filter through Phase 2 | ✅ Clear; subscription filter is non-negotiable correctness issue |
| Q3 | Action template version snapshot | Snapshot at incident declaration → `incidents.resolved_templates JSONB` stores all roles' templates | ✅ Clear; cleaner than my LRU cache approach |
| Q4 | Drill-incident hybrid | `POST /v1/drill-sessions/:id/escalate-to-incident` with full transaction spec; zone states do NOT carry over | ✅ Clear; the carry-over rule is critical and architect caught it |
| Q5 | Evidence URL retention | Forever Phase 5.21; tag at upload (`severity=`); lifecycle rules Phase B; hospital = 3 yrs (NABH) | ✅ Clear |
| Q6 | Action time-target SLA | Soft warn 50% Phase 5.21 → hard escalate 100% Phase 5.22 → full chain Phase B | ✅ Clear with one ambiguity (see §4.4) |
| Q7 | Photo on 2G | Non-blocking upload; mobile SQLite `pending_action_completions`; UI state for upload | ✅ Clear; full implementation spec provided |
| Q8 | IncidentDetailScreen v1 vs v2 | Same component, gated by `has_sire_data` flag | ✅ Clear |
| Q9 | Workers-paused fallback | Banner on incident dashboard; `/v1/health` returns `workers_status` field | ✅ Clear; `/v1/health` change is a small Day 1 add |
| Q10 | Drill mode SIRE applicability | Confirmed separate primitives | ✅ Clear (matches Q5 of v8-alignment-analysis) |

### 2.2 Risk mitigations — all 15 accepted with enhancements

The architect accepts every R1–R15 mitigation in my pre-flight and adds **6 important enhancements**:

| Risk | Enhancement | My acceptance |
|---|---|---|
| R1 | State transition matrix as shared TypeScript constant in `packages/types/` (~50 entries) | ✅ Will codify Day 1 |
| R2 | Add operator-configurable silence period (10 min) after evacuation decision suppresses suggestions | ✅ Will add to threshold config table |
| R3 | Verification block must test RLS policies + view existence + columns (not just table count) | ✅ Will codify in mig 014 |
| R10 | 8 specific test paths (T1–T8) with venue-type + sub-type combinations | ✅ Will codify in test plan |
| R13 | CORP-* tests must run against actual production DB (staging clone), not mocked | ✅ Will plan staging access |
| R15 | Environment verification at TOP of mig 014 (not just verbal procedure) | ✅ Will codify |

### 2.3 Critical path acknowledged

Days 1, 3, 5 are the make-or-break 72 hours per architect — **agreed.** Engineering's commitment: do not advance to Day 2 if Day 1 has unresolved schema issues; do not advance to Day 4 if Day 3 concurrent-PATCH test doesn't pass.

### 2.4 Cannot-defer items list

All 6 items the architect designates as "must ship Phase 5.21":

- ✅ `instruction_i18n_key` field on action steps
- ✅ `has_sire_data` column on incidents
- ✅ `escalated_from_drill_id` column on incidents
- ✅ S3 upload severity tagging (`Tagging: severity=...`)
- ✅ Workers-paused banner on incident dashboard
- ✅ Realtime subscription scope filter (incident_id=eq.X)

These will be in mig 014 + Day 11–12 dashboard build + Day 7–8 mobile build.

### 2.5 Acceptance gates G14–G20 added

7 new gates the architect specifies — accepted and will be added to engineering pre-flight `phase-5-21-preflight.md` §5.

---

## 3. What I learned that I had wrong / underspecified

These are areas where the architect's specification is materially better than my pre-flight:

### 3.1 The `corp_incident_aggregates` view design

**My pre-flight had:** scattered RLS aggregate-only policies on raw tables.
**Architect provides:** dedicated SQL view with all columns precisely defined; aggregations in the view layer; `corporate_account_id` filter via JWT-claim middleware.
**Why this is better:** Single audit point. Easier to write CORP-* tests against. PII boundary is one SQL file, not scattered across 6 tables.

### 3.2 The `resolved_templates` JSONB approach

**My pre-flight had:** template version snapshotted via `template_version` column; LRU cache for resolution chain.
**Architect provides:** entire resolved templates for ALL roles stored in `incidents.resolved_templates` JSONB at declaration time. `GET /my-actions` becomes a simple lookup, not a 5-step chain.
**Why this is better:** 
- Zero ambiguity about which template was active for an incident
- Performance: O(1) lookup vs. O(5) chain on every staff-screen open
- LRU cache becomes redundant for hot path (still useful for declaration transaction)
- Storage cost negligible (~14KB per incident JSONB)

### 3.3 Realtime subscription scope filter

**My pre-flight had:** Realtime subscription on `incident_zone_states`.
**Architect catches:** must include `filter: 'incident_id=eq.${incidentId}'`.
**Why this is critical:** without the filter, in a multi-tenant scenario, a GS at venue A could receive Realtime broadcasts from venue B's incident. RLS prevents the *data* from leaking but the *broadcast traffic* still flows. This is a network correctness + UI confusion bug, not just performance.

### 3.4 Mobile photo upload offline pattern

**My pre-flight had:** "Phase 5.18 offline cache pattern" — handwave.
**Architect provides:** explicit local SQLite table `pending_action_completions` + UI states (uploading / failed / retry) + retry-on-reconnect pattern + NABH report note for pending uploads.
**Why this is critical:** The user flow on 2G is the one most likely to fail in real-world pilot. Without explicit spec, mobile would deliver "action complete" with broken evidence pipeline.

### 3.5 Workers-paused banner

**My pre-flight had:** "rare scenario; emergency-only."
**Architect adds:** banner is REQUIRED, not optional. `/v1/health` must surface `workers_status`. SH must know IMMEDIATELY (not after 30s of silence) that fan-out isn't firing. Provides exact code patterns.
**Why this is critical:** Workers paused during incident = silent safety failure. SH needs to fall back to radio immediately, not after diagnosing the silence.

### 3.6 State transition matrix

**My pre-flight had:** "GS only own zone; FS/SC any in building; SH any" — verbal description.
**Architect provides:** 50-entry transition matrix as code constant. GS cannot transition `EVACUATION_TRIGGERED → ZONE_CLEAR` (correctly — once evacuating, only SH can override).
**Why this is critical:** Without explicit matrix, edge cases like "nervous GS taps Zone Clear during ongoing evacuation" cause false-green dashboard state. The matrix is safety-critical.

### 3.7 Founder content review timing

**My pre-flight had:** founder reviews action language as part of Day 5.
**Architect specifies:** structure JSON (engineering) + content JSON (founder) split; founder review BEFORE Day 5; merge in Week 2 Day 10.
**Why this is better:** Engineering doesn't author the action language; founder doesn't write JSON structure. Clean separation; parallel work; quality gate respected.

### 3.8 8 specific test paths (T1–T8)

**My pre-flight had:** "8 representative paths."
**Architect specifies:** exact (sub-type, venue-type, role) tuples covering FIRE / MEDICAL / SECURITY (Active Aggressor + Bomb Threat — distinct routing) / EVACUATION / FIRE_DRILL / STRUCTURAL / OTHER_UNKNOWN (EC-23 fallback).
**Why this is better:** No ambiguity about coverage. Test plan is now executable.

---

## 4. Clarifications needed before Phase 5.21 build kicks off

These are the small set of questions remaining. **I'm not blocking on these; engineering can begin scaffolding while waiting on resolution. But Day 1 build commits should not happen without these resolved.**

### 4.1 CORP-* RLS structure — view vs. middleware

**Question:** The architect's CORP view spec says *"Note: Views inherit the security context of the calling role via RLS on base tables. Additional middleware enforcement: corporate_account_id JWT claim checked before any CORP-* query."*

**Concern:** RLS on `incidents` currently filters by `venue_id`. CORP-* roles don't have a venue_id (they have a corporate_account_id covering N venues). Either:
- (a) RLS on `incidents` is extended to allow CORP-* roles to see incidents in their corporate_account scope → requires careful policy update; or
- (b) View has its own RLS policy filtering by corporate_account_id (independent of base table RLS) — but views in Postgres run with caller's privileges by default.

**Recommendation:** Architect to clarify which path. My instinct is (b) — the view should be `SECURITY DEFINER` with explicit RLS policy on the view, not relying on base table RLS to handle CORP queries.

**Suggested test:** Set `app.current_role='CORP_CXO'` and `app.current_corporate_account_id='X'`. Run `SELECT * FROM corp_incident_aggregates`. Should return rows for corporate account X only. Validate the mechanism actually works.

### 4.2 Threshold inheritance — 2-tier (Phase 5.21) vs 6-tier (activity-templates spec §6)

**Question:** My activity-templates spec §6 (per founder Q4 direction) proposes 6-tier inheritance: global → country → state → city → venue-type → venue. The architect's `incident_threshold_configs` table has `UNIQUE(venue_id)` — only 2-tier (global default + per-venue override).

**The architect's note:** *"Venue-type inheritance is Phase B. Don't over-engineer this now."*

**Concern:** Founder's Q4 direction was explicit about the 6-tier framework. If we ship 2-tier in Phase 5.21, the standards-comparison reference UI in Phase 5.22 will show standards from country/state/city/venue-type levels but operators can only override at venue level. That's confusing — "here's NDMA's threshold for India" but you can't apply it as a country default.

**Recommendation options:**
1. **Architect's path (2-tier Phase 5.21):** ship 2-tier; standards-comparison reference is read-only educational. Operators copy values manually if they want to align with NDMA. Phase B adds the inheritance levels.
2. **Founder Q4 path (6-tier from Day 1):** add `country/state/city/venue_type` columns to `incident_threshold_configs`; resolution chain checks 6 levels. Adds ~1 day to Day 14 work.
3. **Compromise:** ship 2-tier table but add `country/state/city/venue_type` as nullable columns now (no resolution logic yet); Phase 5.22 wires the resolution chain. Schema is forward-compatible.

**My recommendation: option 3.** Schema cost is trivial (4 nullable columns). Avoids future migration. Resolution logic stays simple (Phase 5.21 only checks venue+global). Phase 5.22 unlocks 6-tier when SC Ops Console UI is ready.

**Need founder + architect resolution.**

### 4.3 New `incident_response_actions` columns

**Question:** Architect's Q6 resolution mentions: *"store `action_started_at` in `incident_response_actions` when a staff member opens the action list (PATCH with `status: 'IN_PROGRESS'`)"*. This implies two new columns I should add to mig 014:
- `status` TEXT (PENDING / IN_PROGRESS / DONE / NOT_APPLICABLE / BLOCKED)
- `action_started_at` TIMESTAMPTZ NULL

**My pre-flight had:** `incident_response_actions` was for completion records only (one row per completed action with evidence).

**Architect's implied design:** `incident_response_actions` becomes the assignment + completion record (one row per (assignment_id, action_order)) with status transitions.

**Concern:** This is a different shape than my activity-templates spec §3.1 implied. Need to clarify the schema:
- (a) `incident_response_actions` holds both assignments and completions (one row per (incident_id, staff_id, action_order)) → status field tracks progress
- (b) Separate `incident_response_assignments` table holds assignments; `incident_response_actions` holds only completions → status transitions move the row from assignment to action

**Recommendation:** option (a) — single table, status field — is simpler. Aligns with architect's Q6 reference.

### 4.4 Action SLA implementation depth — Phase 5.21 vs 5.22

**Question:** Architect's Q6 says *"Phase 5.21 — Soft warning at 50% elapsed"* and provides skeleton worker code. But the worker logic is non-trivial: it must scan all active incidents, all assigned actions per staff, compute deadlines from `action_started_at + (time_target × softWarnPct)`, dedup warnings via Redis key, send push notifications.

**Concern:** The implementation effort for SLA worker is ~1 day on its own. Pre-flight doesn't allocate explicit time for it in the 4-week sequence.

**Recommendation:** Either:
- (a) Add Day 6 specifically for SLA soft-warn worker
- (b) Defer SLA soft-warn entirely to Phase 5.22 (architect says "Phase 5.21" but perhaps it's optional)
- (c) Mark Phase 5.21 ships SLA infrastructure (`status` + `action_started_at` columns + worker scaffold) but actual warn logic is Phase 5.22

**My recommendation: (c).** Schema ships Phase 5.21 (forward-compatible); worker logic Phase 5.22. The `incident_response_actions.status` and `action_started_at` columns enable Phase 5.21 UX (action checklist progress shown), and Phase 5.22 adds the worker that warns/escalates on overdue.

**Need founder + architect resolution.**

### 4.5 Mobile SQLite schema additions (`pending_action_completions`)

**Question:** Architect's Q7 specifies a new mobile-only table `pending_action_completions` for offline photo upload tracking. Phase 5.18 already has SQLite tables for offline task completions — does this new table integrate with the existing pattern?

**Concern:** Adding a parallel offline queue per feature (tasks, drill acks, incident actions, ...) creates fragmentation. The Phase 5.18 pattern is "one offline queue, many event types."

**Recommendation:** Use the existing offline-queue pattern (extend the existing SQLite table with `event_type` column; one queue) rather than create a new table per feature. Architect to confirm.

### 4.6 `incidents` table column count clarification

**Counting from architect spec:** mig 014 adds **5 new columns** to `incidents`:
1. `incident_subtype` TEXT NULL CHECK 32 values
2. `escalated_from_drill_id` UUID NULL → drill_sessions(id)
3. `has_sire_data` BOOLEAN NOT NULL DEFAULT FALSE
4. `resolved_templates` JSONB NULL
5. `is_drill` BOOLEAN NOT NULL DEFAULT FALSE

**Concern:** `is_drill` and `incident_subtype IN ('FIRE_DRILL', 'EVACUATION_DRILL')` are two ways of expressing the same fact. Are both needed, or is one redundant?

**Architect's design** appears to use both:
- `is_drill = TRUE` for any drill (covers other future drill types)
- `incident_subtype IN ('FIRE_DRILL', 'EVACUATION_DRILL')` for specific drill sub-types

**Recommendation:** Keep both — `is_drill` is the explicit boolean (operationally clear); `incident_subtype` is the routing key. Minor redundancy but each serves a distinct purpose.

### 4.7 Worker availability for Day 15 integration tests

**Question:** Architect notes: *"Ensure workers are actually running during Day 15 tests. If workers aren't unfrozen yet (item 5 in pre-conditions), create a local worker instance for testing only."*

**Concern:** Phase 5.21 build timing depends on worker availability. The current state:
- Workers paused (`WORKERS_PAUSED=true`)
- Workers unfreeze June 1 per ADR 0005
- Phase 5.21 timing per v8 §16 is Q1 2027 (post-pilot validation)

If Phase 5.21 begins June 2026 (founder's earlier direction in Q2 of v8-alignment-analysis), the workers will be unfrozen by then. So this is internally consistent. BUT — if Phase 5.21 begins earlier (engineering kickoff in May for Day 1–5 schema work pre-validation-gate), workers may still be paused.

**Recommendation:** Confirm Phase 5.21 build timing — June 2026 (post-workers-unfreeze) seems aligned with all gating. If earlier, document the workaround.

---

## 5. Updates I should make to existing docs (paperwork)

To reflect the architect resolutions, the following docs need light updates. **I will not make these changes until founder green-lights** — they are paperwork-only but I want to confirm the path before touching anything.

### 5.1 `docs/specs/phase-5-21-preflight.md`

Update §6 (open questions) → mark each as RESOLVED with reference to architect doc. Add §7 (sign-off checklist) additions per architect §7. Add G14–G20 to §5 acceptance gates.

### 5.2 `docs/specs/incident-response-activity-templates.md`

- Update §6 (auto-evacuation threshold framework) — clarify Phase 5.21 ships 2-tier (global + venue) with forward-compat schema for future levels; Phase B activates 6-tier.
- Update §3.1 (SIRE entity diagram) — add `incident_response_actions.status` and `action_started_at`.
- Update §13 (open questions) — mark all as resolved with architect references.

### 5.3 `CLAUDE.md`

Light update — add reference to architect response document in §"Reference files":
- `docs/specs/SafeCommand_Phase521_Preflight_Analysis.md` — architect Phase 5.21 resolution
- `docs/specs/v8-architect-response-engineering-analysis.md` — this engineering analysis

### 5.4 Migration draft (NOT to be executed yet)

Draft `supabase/migrations/014_sire_engine.sql` per architect spec — for review only, not deployment. Includes:
- 6 new tables + verification block
- 5 new columns on `incidents` + CHECK constraints
- `corp_incident_aggregates` view
- `incident_threshold_configs` table
- `incident_response_actions` with `status` + `action_started_at` (per §4.3)
- RLS policies + role-based read filters
- Environment verification at top
- State transition matrix codified as PostgreSQL custom check function (or just rely on api-layer enforcement; needs decision)

---

## 6. What I'm NOT doing yet (and why)

Per architect direction "this document was produced... All decisions herein are final unless a formal Change Request is raised":

- ❌ **Will not begin Day 1 schema implementation** until §4 clarifications resolved (especially 4.1 CORP RLS, 4.2 threshold tier strategy, 4.4 SLA worker scope)
- ❌ **Will not draft migration 014 SQL** until §4.3 (incident_response_actions shape) and §4.6 (column count) confirmed
- ❌ **Will not modify `phase-5-21-preflight.md`** until founder + architect green-light §5 paperwork updates
- ❌ **Will not start mobile or dashboard scaffolding** — these depend on schema decisions
- ❌ **Will not pre-seed action templates** — founder content review must precede engineering implementation per architect §Day 5

---

## 7. Recommended next actions

In priority order:

### Immediate (this week — paperwork only)

1. **Architect resolution of §4 clarifications** (5–6 questions). Recommended: founder reviews this engineering analysis, forwards §4 to architect, returns with decisions.
2. **Founder confirms Phase 5.21 build timing** — June 2026 (post-workers-unfreeze) vs Q1 2027 (post-pilot-validation). The architect's response is timing-agnostic but the workers unfreeze + AWS Activate credit deadlines couple the choice.
3. **Founder + architect content review of action templates** — per architect §Day 5 enhancement, action language review must precede engineering Day 5. Engineering provides JSON structure now; founder reviews 16 priority sub-types × 8 roles = 128 action specs.

### Near-term (next 1–2 weeks)

4. **Update phase-5-21-preflight.md** with architect resolutions (after §4 cleared)
5. **Update activity-templates.md** §6 + §3.1 + §13 (after §4 cleared)
6. **Draft mig 014 SQL** for architect review (NOT for production deploy)
7. **Draft TypeScript transition matrix constant** in `packages/types/` (small package update; non-deploying)

### Pre-Day 1 build (when timing arrives)

8. **Apply mig 014 to staging clone** for testing (not production)
9. **Run G3 verification block** on staging — confirms migration works
10. **Architect signs off on Day 1 readiness** → build begins Day 1 (Phase 5.21 Week 1)

---

## 8. Summary statement

The architect response is the kind of artefact I'd hope for at this gate: it resolves every open question with concrete specifications, identifies issues I'd missed, and provides a clean path to Day 1 build. **My confidence in the Phase 5.21 design is now HIGH.**

The 7 clarifications in §4 are minor scope/sequencing questions, not architectural ones. None of them block the overall design; all are answerable in 1–2 architect interactions.

**My recommendation:** Founder reviews this analysis → forwards §4 to architect → architect responds → I update paperwork (§5) → engineering kicks off Day 1 when timing permits (post-workers-unfreeze).

This is a model architecture review-and-response cycle. Worth memorialising as a pattern for future major feature builds (Phase 5.22, Phase B Roaming UI, etc.).
