# Engineering acceptance — architect Phase 5.21 clarifications resolved

> **Status:** Engineering acceptance of architect clarifications. Phase 5.21 build path is unblocked.
> **Authored:** 2026-05-08, in response to architect document `SafeCommand_Phase521_Clarifications_Resolved.md`
> **Companion docs:**
> - Architect resolutions: `docs/specs/SafeCommand_Phase521_Clarifications_Resolved.md`
> - Engineering questions: `docs/specs/v8-architect-response-engineering-analysis.md`
> - Architect's first response: `docs/specs/SafeCommand_Phase521_Preflight_Analysis.md`
> - Engineering pre-flight: `docs/specs/phase-5-21-preflight.md`
> - SIRE spec: `docs/specs/incident-response-activity-templates.md`

---

## 1. TL;DR — confidence and posture

**Confidence: VERY HIGH.** The architect resolved every one of my 7 clarifications with concrete, implementable specifications. Combined with the earlier comprehensive response (commit 3a64a43), the design is fully nailed down. Engineering can write Day 1 code from these specs without further architect interaction.

**Build path: UNBLOCKED.** All decisions are FINAL per architect direction. Days 1–5 in May; Days 6–20 in June post-workers-unfreeze. The May/June split is genuinely smart — eliminates the timing coupling without violating ADR 0005.

**Branch baseline verified:** `tsc --noEmit` PASSES on all 4 apps (api, dashboard, ops-console, mobile) at HEAD `0bf1a824`. The May start can proceed against current main without prior cleanup work.

**Migration 014 contents are final:** 10 new objects (8 tables + 1 view + 1 ALTER) per architect's table of contents. No ambiguity remaining.

---

## 2. Architect's resolutions accepted (all 7)

### 2.1 — CORP-* RLS structure (§4.1) ✅ Accepted with one note

**Decision accepted:** Service role client + mandatory `corporate_account_id` WHERE clause + `enforceCorporateScope` middleware. View uses `WITH (security_invoker = false)` to bypass base-table RLS so CORP-* users (no `app.current_venue_id`) can actually read aggregate data. Three-layer defence (view ownership + service role + middleware-enforced WHERE).

**One note for engineering:** The architect's text says *"the view is not SECURITY DEFINER at the PostgreSQL level"* but the `WITH (security_invoker = false)` syntax IS PostgreSQL's view-level SECURITY DEFINER equivalent. This is internally consistent — what the architect means is that the view's *isolation logic* is in the application layer (middleware + WHERE clause), not in PG-level RLS policies on the view. The `security_invoker = false` is just a technical mechanism to allow the view to read base tables without venue RLS blocking. Reading the section twice resolves the apparent contradiction.

**Postgres version requirement:** `WITH (security_invoker)` syntax is Postgres 15+. Supabase production runs Postgres 15+ (confirmed by Supabase release notes for Pro plan). Safe.

**Implementation note:** Engineering creates `apps/api/src/middleware/corporate-scope.ts` per architect's spec. New file. Goes in mig 014 plus middleware on Day 2.

### 2.2 — Threshold inheritance (§4.2) ✅ Accepted

**Decision accepted:** 4-column forward-compatible schema (`venue_id / venue_type / country / NULL=global`) with `CONSTRAINT exactly_one_scope`. 2-tier resolution Phase 5.21; 3-tier 5.22; 4-tier Phase B. Standards-comparison reference is display-only via `standards_reference JSONB`.

**This is the compromise I recommended (option 3 in my analysis).** Schema cost is trivial; no future migration to add tiers; resolution logic stays simple. Founder Q4 direction respected via display-only standards reference panel.

### 2.3 — Two-table action model (§4.3) ✅ Accepted

**Decision accepted:** `incident_action_assignments` (status-aware; one row per staff × action) + `incident_response_actions` (evidence-only; only for DONE actions). Status enum `ASSIGNED / IN_PROGRESS / DONE / SKIPPED / BLOCKED`. Four new endpoints (`/start`, `/complete`, `/skip`, `/block`). `resolved_templates` JSONB stays as immutable audit snapshot.

**Why this is materially better than my single-table proposal:**
- Mobile checklist can render all assigned actions with status (vs needing to cross-reference `resolved_templates` JSONB)
- SLA worker can query partial index `idx_iaa_pending` for ASSIGNED/IN_PROGRESS rows efficiently
- Per-role completion query is a clean GROUP BY (no JSONB unpacking)
- Audit trail clear: assignments = who was responsible; response_actions = evidence delivered

**Endpoints update:** my pre-flight had `POST /actions/:order/complete`; architect adds `/start`, `/skip`, `/block`. Phase 5.21 needs all 4.

### 2.4 — SLA worker scope (§4.4) ✅ Accepted with respect for safety priority

**Decision accepted:** Full soft-warn worker ships Phase 5.21 (~50 lines in existing escalation worker). Phase 5.22 adds hard escalation.

**Engineering acceptance:** I had recommended deferring the worker to Phase 5.22 (option c in my analysis) on grounds of effort. The architect's counter-argument is compelling: *"during the first real incident on a live pilot venue, a guard who misses a life-critical action with `time_target_seconds = 60` (Fire Service 101 call) should receive the soft warning. If the worker isn't running, there is no reminder."* For a safety infrastructure product, that's the right call.

**Effort revised:** ~50 lines in existing worker = 3-4 hours on Day 5 (not the ~1 day I estimated). The Redis dedup key (`sla_warn:${assignment.id}`) is a nice touch.

### 2.5 — Mobile SQLite (§4.5) ✅ Accepted

**Decision accepted:** Dedicated `pending_action_completions` table + `cached_incident_zones` + `cached_action_assignments`. Three new SQLite tables in mobile.

**Two-step sync pattern is right:** action text completes immediately; photos upload separately and asynchronously. Action is never held hostage to photo upload — critical for 2G reliability.

### 2.6 — `is_drill` + sub-type both kept (§4.6) ✅ Accepted

**Decision accepted:** Both fields, intentional redundancy. `is_drill` is the explicit gate; sub-type is the routing key. NABH §EM report uses `is_drill`.

**The auto-correction logic at API layer** (set `is_drill = TRUE` when sub-type contains `_DRILL`) is the right defensive pattern.

**Final column count on `incidents`: 5 new columns** (incident_subtype, is_drill, has_sire_data, resolved_templates, escalated_from_drill_id).

### 2.7 — Build timing (§4.7) ✅ Accepted

**Decision accepted:** May Days 1–5 (schema + API, no workers); June Days 6–20 (mobile + testing, workers running).

**This is the elegant solution.** The decoupling is real:
- Schema migration → Supabase (no Railway worker dependency)
- API endpoint deploys → Railway api service (unrelated to worker services)
- Workers required only for: end-to-end push notification tests, BullMQ fan-out processing, SLA worker

5 days of productive May work; remaining 15 days cleanly in June post-unfreeze.

---

## 3. What the architect added that I had missed

These are improvements over my engineering pre-flight that I'd missed or underspecified:

| Item | What architect added |
|---|---|
| `enforceCorporateScope` middleware | Explicit middleware file; pattern for CORP scope enforcement; not just "RLS handles it" hand-wave |
| `WITH (security_invoker = false)` view syntax | Postgres-15-specific syntax; technical mechanism to bypass base-table RLS for CORP queries |
| `CONSTRAINT exactly_one_scope` on threshold table | Single constraint enforces "one row = one tier" without need for runtime checking |
| `standards_reference` JSONB on threshold table | Solves the founder Q4 standards-comparison-reference need without coupling to runtime resolution |
| `incident_action_assignments` with `status` enum | The canonical way to model "assigned but not yet done" — solves the gap I had |
| `idx_iaa_pending` partial index | SLA worker query optimisation: only ASSIGNED/IN_PROGRESS rows indexed |
| Redis dedup key for SLA warnings | `sla_warn:${assignment_id}` with TTL = `time_target_seconds` |
| Two-step mobile sync (text → photo) | Explicit decoupling so action never blocks on photo |
| `cached_incident_zones` + `cached_action_assignments` mobile tables | Offline operation requires zone state cache + action checklist cache, not just completion queue |
| Auto-correction `is_drill` from `incident_subtype` | API-layer business rule; engineering pattern documented |
| 8 specific test paths (T1–T8) | Already in earlier response but reaffirmed |
| May/June split timing | Enables productive May progress without violating ADR 0005 |

---

## 4. Concerns / clarity needs

These are residual concerns. **None block Day 1 build** — they're refinements that can be resolved during implementation or via the final pre-Day-1 checklist.

### 4.1 — `corp_incident_aggregates` view naming

**Concern:** The view's GROUP BY includes `i.id` (incident ID), so each row is per-incident, not aggregated across incidents. The name "aggregates" is technically correct (each incident's aggregates) but slightly misleading — a CORP-* user querying without WHERE clause would see N rows for N incidents, not one summarised row.

**Impact:** Cosmetic only. The view is correct; just the name suggests something different.

**Recommendation:** Rename to `corp_incident_rollup` or `corp_incident_per_incident_summary`? Or accept the existing name as a naming convention. Engineering can ship as-named; rename Phase B if it bothers anyone.

**No action required pre-Day-1.**

### 4.2 — Service role usage for CORP-* queries

**Concern:** The architect specifies using `supabaseAdmin` (service role) for CORP queries. Service role bypasses ALL RLS, not just on the new SIRE tables. This means the middleware + mandatory WHERE clause are the ONLY isolation mechanism for CORP queries. If middleware is bypassed (e.g. dev / debug code calls supabaseAdmin directly), data isolation is broken.

**Mitigation already in place:** Architect calls out same pattern as Ops Console (EC-14). That pattern has been operating safely in production. The risk is real but managed.

**Engineering action:** Add lint rule or code review checklist item: "Never use `supabaseAdmin` outside CORP-scoped routes without explicit corporate_account_id filter." Document in `docs/api/conventions.md`.

**No action required pre-Day-1; document during Day 2.**

### 4.3 — Stale branch reference in architect doc (`03a4b84`)

**Note:** The architect document references `safecommand_v7` branch HEAD `03a4b84` for baseline verification. Our actual current HEAD is `0bf1a82` (post-v8 spec hygiene + this clarification commit). The `03a4b84` is from before the Phase 5.13–5.18 work.

**Engineering note:** Branch baseline verification done at `0bf1a82` (current HEAD). All 4 apps pass `tsc --noEmit`. This is the correct baseline — Phase 5.13–5.18 work is preserved per v8 spec.

**No action required.**

### 4.4 — Action templates content review workflow

**Note:** Architect document confirms my §4 concern: *"Founder + architect content review of action templates scheduled (can run in parallel)."* But doesn't fully specify the workflow:

- Engineering drafts JSON structure (`seeds/incident_action_templates.schema.json`)?
- Founder drafts content (action language) in a separate doc, then engineering merges into JSON?
- SH consultant or NABH compliance officer review?

**Recommendation:** I'll draft the JSON structure (15-30 minutes) once Day 1 schema is confirmed deployed. Founder reviews structure for appropriateness, then provides the action content for 16 priority sub-types × 8 roles = 128 actions. Engineering writes content into JSON. NABH compliance review can happen in parallel.

**Action required:** Founder confirmation of who reviews content. **Suggested resolution: founder + you (Sachin) write Indian-context-appropriate content; if hospital pilot is on the horizon, NABH compliance review post-Phase 5.21 is sufficient.** Can run during the May Days 1–5 build window.

### 4.5 — CORP-* test environment

**Note:** Architect document (and my own analysis §4.4 in commit e2e9e52) notes that CORP-* tests should run against actual production DB (staging clone). This needs:
- Staging clone of production Supabase project (separate project)
- Mock corporate accounts seeded in staging
- Test runner script

**Recommendation:** Day 17 (Week 4) is when CORP tests run. Setting up staging clone is ~30 min of Supabase Dashboard work. Plan to schedule pre-Day 17, around Week 3.

**No action required pre-Day-1; schedule during Week 3.**

### 4.6 — Action template seed data content quality gate

**Note:** Architect document §4.4 notes the soft-warn worker depends on `time_target_seconds` being set on assignments. The default action templates need realistic time targets:
- Fire alarm activation: 30s
- Ground staff zone sweep: 180-300s (depending on zone size)
- Floor supervisor evacuation lead: 300-600s
- SH command post establishment: 60s

**Recommendation:** When founder reviews template content (§4.4 above), ensure `time_target_seconds` on each action is realistic for Indian venue context. Architect's R10 test paths (T1-T8) should validate these times.

**No action required pre-Day-1; embed in template content review.**

### 4.7 — Photo storage volume on June pilots

**Note:** Phase 5.21 retains photos forever (architect §4.5). At pilot scale (2 venues × ~10 incidents/quarter × ~50 photos per incident × ~500KB each) = ~250MB/quarter total. AWS S3 cost: trivial (~$0.006/month). At 65 venues post-pilot = ~8GB/quarter = ~$0.20/month. Still trivial.

**No concern.** Phase B lifecycle rules will handle scale economics later.

---

## 5. Pre-Day-1 sign-off checklist (per architect §Agreed Build Start)

The architect's checklist:

- [x] **Migration number confirmed against Supabase Dashboard (expected: 014)** — Verified: existing migrations 001-013 in `supabase/migrations/`; next is 014. ✅
- [ ] **`docs/adr/0001` updated with 014 entry** — Pending; small paperwork addition (~5 min).
- [ ] **`seeds/incident_action_templates.json` structure drafted (content to follow)** — Pending; engineering can draft this Day 1 morning.
- [x] **Branch baseline verified (`tsc --noEmit` passes on all 4 apps)** — Verified at HEAD `0bf1a82`. All 4 apps clean. ✅
- [ ] **Founder + architect content review of action templates scheduled** — Pending; recommend founder commits to ~5 hours review work spread across Week 1-2.

**Status: 2 of 5 done; 3 outstanding (all small paperwork).** Founder/engineering can clear remaining items in a single hour.

---

## 6. What I propose to do next

In priority order:

### Immediate (this session)

1. ✅ **Done:** Architect clarifications doc committed (commit `0bf1a82`)
2. ✅ **Done:** Branch baseline verification (4 apps pass `tsc`)
3. **Suggested:** Update `docs/adr/0001-migration-renumbering.md` with mig 014 entry — single-paragraph addition documenting that mig 014 introduces the SIRE schema. ~5 min.
4. **Suggested:** Update `docs/specs/phase-5-21-preflight.md` to mark all 7 questions RESOLVED with reference to the clarifications doc. ~10 min.
5. **Suggested:** Update `docs/specs/incident-response-activity-templates.md` §6 (threshold inheritance) and §3.1 (entity diagram) to match architect's two-table action model + 4-tier threshold schema. ~15 min.
6. **Suggested:** Update `CLAUDE.md` to reference the new clarifications doc + my acceptance doc. ~5 min.

Total this session: ~35-40 min of paperwork. **No code changes.** Brings all docs into v8 + architect-resolved alignment.

### Pre-Day-1 (this week)

7. **Founder action:** Action template content review schedule decided. Engineering can draft the structure JSON and proposed action language; founder reviews + revises.
8. **Founder action:** Confirmation that May Days 1–5 build can begin (after spec hygiene from §6 above is done).

### Day 1 (May, post-greenlight)

9. **Engineering:** Author `supabase/migrations/014_sire_engine.sql` per architect's exact 10-object specification.
10. **Engineering:** Author state-transition matrix as TypeScript constant in `packages/types/src/incident-zone-states.ts`.
11. **Engineering:** Apply mig 014 to staging clone (Supabase Dashboard SQL Editor).
12. **Engineering:** Run G3 verification block; confirm all 10 objects created.

---

## 7. Confidence summary

| Dimension | Confidence | Notes |
|---|---|---|
| **All 7 clarifications resolved** | HIGH | Each has concrete spec; no ambiguity remaining |
| **Migration 014 final ToC** | HIGH | 10 objects listed; safely additive |
| **Two-table action model** | HIGH | Cleaner than single-table; better SLA support |
| **CORP-* isolation pattern** | HIGH | Three-layer defence; same as Ops Console pattern (proven) |
| **Threshold 4-tier forward-compat** | HIGH | Schema cost trivial; no future migration |
| **Mobile two-step sync** | HIGH | Decouples action completion from photo upload |
| **May/June build timing** | HIGH | Eliminates worker-coupling without compromising either constraint |
| **SLA worker shipping Phase 5.21** | HIGH | Architect's safety argument is right; effort confirmed feasible |
| **Branch baseline** | HIGH | tsc clean at current HEAD; pre-Day-1 verified |
| **Content review workflow** | MEDIUM | Founder ownership clear but workflow needs explicit scheduling |
| **CORP test environment setup** | MEDIUM | Staging clone needed by Week 4; ~30 min setup |
| **Naming concern (`corp_incident_aggregates`)** | LOW | Cosmetic; can rename Phase B if needed |

---

## 8. Engineering posture

> *"The architect has provided a complete, internally consistent set of resolutions. All 7 of my clarifications are answered with implementation-grade specifications. Migration 014's final ToC is locked. Two-table action model + 4-tier threshold schema + service-role-with-mandatory-where CORP isolation are the right patterns. The May/June build timing split is the elegant solution to the worker-coupling. Branch baseline verified. I have everything I need to write Day 1 code. Awaiting founder green-light on the small spec hygiene updates in §6, then build can proceed in May Days 1–5 (schema + API) followed by June Days 6–20 (mobile + testing). No further architect interaction required for Phase 5.21 unless implementation surfaces a genuinely new question (in which case formal Change Request applies)."*

---

## 9. Awaiting founder direction

- Approve §6 spec hygiene actions (~35 min, paperwork only)?
- Confirm action template content review workflow (founder-driven; can run in parallel during Days 1-5)?
- Confirm May start for Days 1-5 build (assuming spec hygiene done first)?

Once these three confirmations are in, Phase 5.21 is in active build.
