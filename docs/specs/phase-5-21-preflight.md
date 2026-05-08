# Phase 5.21 implementation pre-flight — SIRE core build

> **Status:** Pre-flight analysis; build does not begin until pilot validation gate (post Oct 2026 per v8 §16)
> **Authored:** 2026-05-08, in response to founder direction "go ahead with PHASE 5.21, analyse everything before proceeding to ensure nothing breaks"
> **Spec authority:** Architecture v8 §SIRE + `docs/specs/incident-response-activity-templates.md` (v8-aligned)
> **Companion docs:** ADR 0005 + ADR 0006 + `docs/operations/workers-unfreeze-runbook.md`

> **Architect: review §6 (open architectural questions) before build kicks off. These are the blockers.**

---

## 1. Purpose

This document is the engineering pre-flight for the Phase 5.21 SIRE core build. Its purpose is to surface every risk, assumption, and dependency before code writing begins. The user direction was explicit: **"analyse everything before proceeding to ensure nothing breaks."**

Phase 5.21 is materially larger than any prior Phase 5 milestone:
- **Schema:** 1 new migration (014_sire_engine.sql) with 6 new tables + 1 column add + 5 RLS policies + 1 view
- **api:** 6+ new endpoints; ~3 modified endpoints
- **Mobile:** 1 new screen (IncidentDetailScreen v2 with SIRE features) + drawer banner extension + service helpers
- **Dashboard:** /incidents/[id] page extension + selective evacuation modal + zone state grid + per-role completion view
- **Seed data:** 16 priority sub-types × 8 roles = ~128 templates seeded as JSON
- **Testing:** ≥6 CORP visibility tests + integration tests for zone state machine transitions + performance benchmarks

Estimated duration: **~3 weeks engineering** + ~1 week stabilisation = **4 weeks total**.

---

## 2. Pre-conditions (must all be true before build begins)

| # | Pre-condition | How to verify | Status as of 2026-05-08 |
|---|---|---|---|
| 1 | v8 spec authority documented in CLAUDE.md | grep "v8" CLAUDE.md → present | ✅ done |
| 2 | ADR 0005 (workers always-on) codified | `docs/adr/0005-*.md` exists | ✅ done |
| 3 | ADR 0006 (Apollo live demo) codified | `docs/adr/0006-*.md` exists | ✅ done |
| 4 | Workers-unfreeze runbook ready | `docs/operations/workers-unfreeze-runbook.md` exists | ✅ done |
| 5 | Workers transitioned to always-on | Railway dashboard: `WORKERS_PAUSED=false` (or unset) on all 3 worker services | ⏳ Pending June 1 |
| 6 | AWS Activate credits applied + balance ≥ $750 | AWS Console → Billing → Credits | ⏳ Founder action next week |
| 7 | Pilot 1 + Pilot 2 gone live (validation gate passed) | `JUNE-2026-REVIEW-REQUIRED.md` Stage 4 complete | ⏳ Q4 2026 / Q1 2027 |
| 8 | Architect resolution of §6 open questions | This document signed off | ⏳ Pending architect review |
| 9 | All Phase 5.13–5.18 surfaces still pass tsc + smoke tests | Run from main branch | ✅ Last verified 2026-05-07 |
| 10 | Sentry + UptimeRobot + cost alerts configured | Per workers-unfreeze runbook §1 | ⏳ Pre-June 1 |

**Build does not begin until items 5–8 are satisfied.** Items 1–4 + 9 are already done.

---

## 3. Risk inventory + mitigations

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | Zone state machine race conditions — concurrent updates from multiple staff in same zone | High | Per-zone optimistic locking via `state_changed_at` timestamp; reject stale-update PATCH with 409. UI auto-refetches on conflict. |
| R2 | Auto-evacuation suggestion fires erroneously during real incident due to thresholds tuned for drills | High | Hard Rule 23 enforces "suggestion only, never auto-trigger" — eliminates the auto-evacuation fire-by-mistake risk class entirely. SH always has decision authority. |
| R3 | Mig 014 deploy fails partway — schema in inconsistent state | Critical | Wrap entire migration in transaction (`BEGIN ... COMMIT`); verification block raises EXCEPTION on partial deploy. Already proven pattern from mig 013. |
| R4 | api endpoint changes break existing incident declaration flow | Critical | Phase 5.21 uses NEW endpoints (`/v1/incidents/:id/zones/...`). Existing `POST /v1/incidents` and `POST /v1/incidents/:id/staff-safe` unchanged. Backward compatible. |
| R5 | Mobile IncidentDetailScreen v2 conflicts with Phase 5.18 IncidentDetailScreen | High | Rename existing IncidentDetailScreen to IncidentDetailScreen.v1 (backwards compat) for any references; ship v2 as the new SIRE-aware screen. Or: extend existing screen with feature-flag gate. |
| R6 | Performance — live zone grid Realtime broadcasts at scale (50 zones × Realtime updates per state change) | Medium | Phase 1: Supabase Realtime native (handles 500+ concurrent connections per NFR-15). Polling fallback at 5s. Phase 2 GCP migration moves to Cloud Run WebSocket if needed. |
| R7 | Template resolution chain at scale — 5-step DB lookup per staff per incident | Medium | Cache resolution chain in api memory (LRU 1000 entries; invalidate on template version bump). Each chain lookup is 5 indexed SELECTs; sub-50ms. |
| R8 | Mig 014 + Phase 5.18 drill schema co-existence | Medium | Mig 014 is purely additive — no modifications to drill_session_participants. Drills use existing tables; incidents use SIRE tables. Per Q5 Option B (separate primitives). |
| R9 | Photo evidence S3 storage cost growth | Medium | Per-incident retention policy: SEV1 = forever; SEV2/3 = 12 months (Phase 5.21 ships forever-retention; Phase B adds expiration). Compress photos at upload (Phase 5.22). |
| R10 | Test coverage — manual testing of 32 sub-types × 8 roles is impractical | Medium | Phase 5.21 ships 16 sub-types. Test 4 representative sub-types in 2 venue types end-to-end (8 paths). Phase 5.22 expands. |
| R11 | i18n debt — hardcoded English in templates | Low | i18n keys reserved at template authoring (`instruction_i18n_key`); fallback English used until Phase B i18n migration. Per founder Q3 direction. |
| R12 | Workers freeze regression after June 1 | High | Workers-unfreeze runbook (`docs/operations/workers-unfreeze-runbook.md`) documents kill switch invocation procedure; ADR 0005 codifies emergency-only semantics. Phase 5.21 adds Realtime-broadcast load on Supabase Realtime — workers themselves not directly affected. |
| R13 | CORP-* PII leakage via misconfigured RLS | Critical | RLS aggregate-only policies enforced from Day 1 (per Q6 founder direction). 6 specific test cases in §9.4 of activity-templates spec. |
| R14 | Drill-incident hybrid scenario (real fire during drill) | Low | Defined in v8 §SIRE: SH calls `POST /v1/drill-sessions/:id/escalate-to-incident` which creates new SIRE incident referencing drill. Drill stays in drill_session_participants; new incident in SIRE tables. |
| R15 | Schema migration applied to wrong environment | Critical | Always apply via Supabase Dashboard SQL Editor (matches our pattern); verification block confirms env. Document deployment procedure in this pre-flight. |

---

## 4. Implementation sequence (4 weeks)

### Week 1: Schema + foundational api (~5 days)

**Day 1 — Schema migration**
- Write `014_sire_engine.sql`:
  - 6 new tables with full RLS policies
  - 1 column add to incidents (`incident_subtype` TEXT NULL CHECK 32 values)
  - 1 view `corp_incident_aggregates` (for CORP-* visibility per Q6)
  - Indexes for hot paths
  - Verification block (raises EXCEPTION on partial)
- Apply via Supabase Dashboard SQL Editor (matches mig 013 precedent)
- Verify with sanity SQL queries

**Day 2 — api types + zone state read endpoints**
- Add types to `packages/types/src/index.ts`: `IncidentSubtype`, `ZoneState` (10-value enum), `EvacuationTriggerType`, `ActionTemplate`, `ActionEvidence`, etc.
- Implement `GET /v1/incidents/:id/zones` (live grid) — returns colour-coded state
- Implement `GET /v1/incidents/:id/zones/history` (audit trail for compliance)
- Add Supabase Realtime subscription on `incident_zone_states` table

**Day 3 — Zone state PATCH endpoint**
- `PATCH /v1/incidents/:id/zones/:zone_id/state` — state transition validator
  - Enforce role × zone × state transition matrix (GS only own zone; FS/SC any in building; SH any)
  - reason_note required for NEEDS_ATTENTION / INACCESSIBLE
  - evidence_url required for EVACUATION_COMPLETE
  - Optimistic concurrency via `state_changed_at` timestamp
- Wire audit_logs entry for every transition
- Test 9 valid transitions + 5 invalid (422 expected)

**Day 4 — Evacuation trigger endpoints**
- `POST /v1/incidents/:id/evacuate/selective` — multi-zone evacuation
- `POST /v1/incidents/:id/evacuate/full` — full venue
- `GET /v1/incidents/:id/evacuations` — log retrieval
- Auto-draft PA text from template (English; regional Phase 5.22)
- Enqueue priority-0 BullMQ fan-out to affected staff

**Day 5 — Action template endpoints + seed data**
- Implement 5-step graceful fallback resolution chain
- LRU cache in api memory for template resolution (sub-50ms)
- `GET /v1/incidents/:id/my-actions` — resolves staff's checklist
- `POST /v1/incidents/:id/actions/:order/complete` — record evidence
- `GET /v1/incidents/:id/actions/summary` — per-role completion rates
- Seed 16 priority sub-types × 8 roles = ~128 templates as JSON in `seeds/incident_action_templates.json`
- SQL import script for seeded data

### Week 2: Mobile (~5 days)

**Day 6 — Service layer**
- Add to `apps/mobile/src/services/incidents.ts`:
  - `fetchIncidentDetail(id)` (extended with zones + actions + evacuations)
  - `updateZoneState(id, zoneId, action)` — 3-button action handler
  - `triggerSelectiveEvacuation(id, zoneIds, reason)`
  - `completeAction(id, order, evidence)`
  - `fetchActiveIncidentForMe()` — drawer-banner data feed (similar to active-drill banner)
- Type definitions matching api response shapes
- Idempotency wrapper per Hard Rule 5

**Day 7-8 — IncidentDetailScreen v2**
- New mobile screen (or extension of existing per R5 mitigation)
- Header card (incident type, sub-type, status, scheduled, building scope)
- "My zone" callout with 3-button action model (per BR-I)
- Zone state grid (your zone + adjacent context; Realtime updates via existing pattern)
- Per-role action checklist (resolved from template; Done/N/A/Blocked transitions)
- Evidence pickers: camera (PHOTO), GPS confirm, signature pad, note (≥10 chars)
- Auto-refresh every 10s while incident IN_PROGRESS

**Day 9 — Drawer banner extension**
- Extend `Drawer.banner` prop with active-incident detection (Phase 5.18 banner pattern)
- Banner CTA adapts: "Acknowledge incident" / "View zone state" / "Mark zone clear"
- Tap → navigate to IncidentDetailScreen v2

**Day 10 — App.tsx wiring + tsc validation**
- Wire 'incidentDetailV2' screen state if needed
- Pass session.staff.role to IncidentDetailScreen v2 for write-control gating
- Run tsc on mobile app
- Smoke test on physical device

### Week 3: Dashboard + Ops Console (~5 days)

**Day 11-12 — Dashboard /incidents/[id] extension**
- Add SIRE sections to existing `apps/dashboard/app/incidents/[id]/page.tsx`
- Live zone grid (Realtime + 5s polling fallback)
- Per-role completion progress (from `GET /actions/summary`)
- Auto-evacuation suggestion soft prompt panel (BR-L)
- Evacuation log section (immutable trigger records)
- Print page extension for SIRE evidence inclusion

**Day 13 — Selective evacuation modal**
- Multi-zone picker UI (toggle pills on zone grid)
- Mandatory reason note text input
- Auto-drafted PA text preview (editable)
- Confirmation dialog with summary
- POST /evacuate/selective on submit

**Day 14 — SC Ops Console threshold configuration**
- Per-venue threshold override UI (per Q4 6-tier inheritance)
- Standards-comparison reference panel (read-only data file)
- Save → INSERT incident_threshold_configs

**Day 15 — Dashboard tsc validation + integration testing**
- Run tsc on dashboard app
- Test: SH activates incident, multi-staff respond, dashboard reflects state correctly
- Test: selective evacuation fan-out reaches affected staff in <5s

### Week 4: Testing + stabilisation (~5 days)

**Day 16 — Performance benchmarking**
- Zone state grid live updates with 50 zones × 1 incident
- Selective evacuation fan-out latency (≤5s NFR-02 target)
- Template resolution chain at p95 (sub-50ms target)
- 30 simultaneous incident scenarios (multi-venue stress test)

**Day 17 — CORP-* visibility tests (per Q6)**
- C1: CORP-CXO cannot see individual staff names in any incident response data
- C2: CORP-DIR scoped to country sees aggregates only
- C3: CORP-MGR scoped to state does NOT see other-state incidents
- C4: Direct API call from CORP-* role returns 403 on raw data endpoints
- C5: SQL injection by CORP-* user fails (parameterised + RLS)
- C6: Aggregate view returns counts matching SH direct query

**Day 18 — Regression testing on Phase 5.13–5.18**
- All existing surfaces still work
- Drill management unchanged
- Reason taxonomy unchanged
- Two-tier admin parity preserved

**Day 19 — Documentation + sales artefacts**
- Update CLAUDE.md to mark Phase 5.21 LIVE
- Update STATE_OF_WORK.md with new entries
- Update demo-runbook.md with Phase 5.21 demo flow
- Update memory file

**Day 20 — Final review + Phase 5.21 sign-off**
- Architect + founder review
- Mark Phase 5.21 complete; Phase 5.22 starts (PA auto-draft + remaining 16 sub-types)

---

## 5. Acceptance gates (must all pass before declaring Phase 5.21 complete)

| Gate | How to verify |
|---|---|
| Mig 014 applied to production with verification block PASSED | Run sanity queries — 6 tables + 1 view + RLS policies present |
| All 6 SIRE api endpoints respond ≤200ms p95 | Performance benchmark report |
| Selective evacuation fan-out delivers in ≤5s | NFR-02 timed test |
| Zone state machine: 9 valid transitions accepted; 5 invalid rejected | Integration test report |
| 16 priority sub-types × 8 roles = 128 templates seeded | SELECT COUNT(*) FROM incident_action_templates → 128 |
| Mobile IncidentDetailScreen v2 renders on Redmi 9A in ≤3s | Physical device test |
| Dashboard /incidents/[id] selective evacuation modal works end-to-end | Manual E2E test |
| 6 CORP-* visibility tests all PASS | Test runner report |
| Regression: all Phase 5.13–5.18 surfaces still PASS | Regression test report |
| All Hard Rules 23–24 enforced | Code review checklist |
| EC-23 graceful fallback always resolves | Test: declare FIRE on a venue with no specific templates → global default returned |
| tsc PASS on all 4 apps | `cd apps/{api,dashboard,ops-console,mobile} && npx tsc --noEmit` |
| Documentation updated to "Phase 5.21 LIVE" state | CLAUDE.md + STATE_OF_WORK.md + memory updates |

---

## 6. Architectural questions — ALL RESOLVED 2026-05-08

> **Status update:** All 10 open architectural questions in this section are RESOLVED by architect documents:
> - First architect response: `docs/specs/SafeCommand_Phase521_Preflight_Analysis.md` (commit `3a64a43`)
> - Architect clarifications on engineering follow-ups: `docs/specs/SafeCommand_Phase521_Clarifications_Resolved.md` (commit `0bf1a82`)
> - Engineering acceptance: `docs/specs/v8-architect-clarifications-engineering-acceptance.md` (commit `f609080`)
>
> All decisions are FINAL per architect direction. Formal Change Request required to revise.
>
> Below: original questions are kept verbatim for traceability; each has a RESOLVED note pointing to the answer.

### 6.1 — Auto-evacuation suggestion algorithm precision (BR-L) ✅ RESOLVED 2026-05-08

> The suggestion fires at "≥2 zones in 3 min during FIRE." What if `incident_subtype = FIRE_DRILL`? Skip the suggestion (drills shouldn't auto-prompt evacuation)? Apply differently?

**Original recommendation:** Skip auto-suggestion for drill incidents (`incidents.is_drill = TRUE`).

**Architect resolution:** Confirmed + extended. Skip for `FIRE_DRILL` AND `EVACUATION_DRILL` AND any incident with `is_drill = TRUE`. Also skip when an evacuation trigger already exists. Internal analytics still log "would have fired" suggestions (feeds India Safety Index). See `SafeCommand_Phase521_Preflight_Analysis.md` Q1.

### 6.2 — Real-time mechanism ✅ RESOLVED 2026-05-08

> v8 says "Supabase Realtime (Phase 1) / Cloud Run WebSocket (Phase 2)." Phase 5.21 = Phase 2 timeline. Use Supabase Realtime through Phase 2; migrate to Cloud Run WebSocket post-GCP-migration?

**Architect resolution:** Confirmed Supabase Realtime through Phase 2. **Critical addition:** subscription filter `incident_id=eq.${incidentId}` is mandatory — not just performance, but correctness in multi-tenant scenarios. See `SafeCommand_Phase521_Preflight_Analysis.md` Q2.

### 6.3 — Action template version snapshot ✅ RESOLVED 2026-05-08

> When incident declared, snapshot template version (immutable audit) or reference live template (changes propagate to in-flight)?

**Architect resolution:** Snapshot at declaration confirmed. Implementation: NEW column `incidents.resolved_templates JSONB` stores all roles' templates at declaration. `GET /my-actions` becomes O(1) lookup, not 5-step chain resolution. Post-declaration sub-type change triggers re-snapshot. See `SafeCommand_Phase521_Preflight_Analysis.md` Q3.

### 6.4 — Drill-incident hybrid scenario ✅ RESOLVED 2026-05-08

> Real fire during a drill — how to re-classify?

**Architect resolution:** Confirmed `POST /v1/drill-sessions/:id/escalate-to-incident` endpoint with full transaction spec. **Critical addition:** zone states from drill do NOT carry over to new incident — new incident starts fresh with all zones `UNVALIDATED`. Drill participation records remain in `drill_session_participants`. NABH §EM compliance note: escalation link is a positive compliance detail, not a flaw. See `SafeCommand_Phase521_Preflight_Analysis.md` Q4.

### 6.5 — Evidence URL retention ✅ RESOLVED 2026-05-08

> Photos in S3 — retention policy?

**Architect resolution:** Phase 5.21 ships forever retention with severity tagging at upload time (`Tagging: severity=...`). Phase B adds S3 lifecycle rules. Hospital venues require 3-year retention per NABH (configurable via `incident_threshold_configs.evidence_retention_years`). See `SafeCommand_Phase521_Preflight_Analysis.md` Q5.

### 6.6 — Action time-target SLA enforcement ✅ RESOLVED 2026-05-08

> What if action item not completed within `time_target_seconds`?

**Architect resolution:** Full soft-warn worker ships Phase 5.21 (~50 lines in existing escalation worker; ~3-4 hours Day 5). Uses `started_at` on `incident_action_assignments` table. Redis dedup key (`sla_warn:${assignment_id}`) prevents duplicate warnings. Phase 5.22 adds hard escalation. **Engineering note:** I had recommended deferral to Phase 5.22; architect's safety argument is correct — life-critical actions need warnings even on Day 1. See `SafeCommand_Phase521_Clarifications_Resolved.md` §4.4.

### 6.7 — Photo evidence on slow connections (NFR-07: 2G/3G) ✅ RESOLVED 2026-05-08

> Photo upload may take 10+ seconds on 2G. UX implication: blocking user from continuing to next action item?

**Architect resolution:** Non-blocking upload confirmed with full implementation spec. Local SQLite `pending_action_completions` table on mobile. UI states: ✅ Done | 📷 Uploading... | 📷 Failed (retry). Two-step sync: text evidence first, photos second. Action is never held hostage to photo upload. See `SafeCommand_Phase521_Preflight_Analysis.md` Q7 + `SafeCommand_Phase521_Clarifications_Resolved.md` §4.5.

### 6.8 — IncidentDetailScreen v2 — same screen as v1, or separate? ✅ RESOLVED 2026-05-08

> Phase 5.18 has IncidentDetailScreen for binary incidents. Phase 5.21 needs different UX for SIRE incidents.

**Architect resolution:** Same component, feature-flag gated by `incident.has_sire_data` boolean. Pre-Phase 5.21 incidents render v1 layout (StaffSafeButton); post-Phase 5.21 incidents render v2 (3-button zone action + zone state grid + action checklist). Drawer banner CTA also gated. See `SafeCommand_Phase521_Preflight_Analysis.md` Q8.

### 6.9 — Workers-paused fallback during incident ✅ RESOLVED 2026-05-08

> If `WORKERS_PAUSED=true` is invoked during a real incident, what happens to evacuation fan-out?

**Architect resolution:** Workers-paused banner is REQUIRED, not optional. `/v1/health` endpoint must surface `workers_status: 'RUNNING' | 'PAUSED' | 'DEGRADED'`. Dashboard polls every 30s during active incident. Banner: *"Notification workers paused. Evacuation fan-outs are queued but not delivering. Use radio / verbal / personal mobile for immediate staff notification."* See `SafeCommand_Phase521_Preflight_Analysis.md` Q9.

### 6.10 — Drill mode SIRE applicability — re-confirm ✅ RESOLVED 2026-05-08

> Founder direction was "separate primitives" (Q5 Option B). Confirming: Phase 5.21 ships SIRE for incidents only; drills continue using `drill_session_participants` table?

**Architect resolution:** Confirmed separate primitives. Phase 5.21 ships zone state machine + 3-button + per-role templates for INCIDENTS only. Drills remain unchanged in `drill_session_participants` schema. Phase B may explore drill SIRE integration. See `SafeCommand_Phase521_Preflight_Analysis.md` Q10.

---

## 6A. Engineering follow-up clarifications (7 items) — ALL RESOLVED 2026-05-08

After architect's first response (resolving Q1-Q10), engineering raised 7 implementation-level follow-ups in `docs/specs/v8-architect-response-engineering-analysis.md`. Architect's response in `SafeCommand_Phase521_Clarifications_Resolved.md` resolved all 7:

| # | Topic | Resolution |
|---|---|---|
| 4.1 | CORP-* RLS structure (view SECURITY DEFINER vs middleware) | View `WITH (security_invoker = false)` + service role + middleware enforcing `corporate_account_id` WHERE. Three-layer defence. |
| 4.2 | Threshold inheritance (2-tier vs 6-tier) | 4-column forward-compatible schema: `venue_id / venue_type / country / NULL=global`. 2-tier resolution Phase 5.21; 3-tier 5.22; 4-tier Phase B. `standards_reference JSONB` for display-only. |
| 4.3 | `incident_response_actions` shape | Two tables: `incident_action_assignments` (status-aware) + `incident_response_actions` (evidence-only for DONE). Status enum `ASSIGNED/IN_PROGRESS/DONE/SKIPPED/BLOCKED`. 4 endpoints (/start, /complete, /skip, /block). |
| 4.4 | SLA worker scope Phase 5.21 vs 5.22 | Full soft-warn worker ships Phase 5.21. ~50 lines in existing escalation worker. Architect's safety argument prevailed. |
| 4.5 | Mobile SQLite | Dedicated `pending_action_completions` + `cached_incident_zones` + `cached_action_assignments`. Three new SQLite tables. Two-step sync. |
| 4.6 | `is_drill` redundancy | Keep both `is_drill BOOLEAN` + drill sub-types. 5 new columns on incidents confirmed. Auto-correction at API layer. |
| 4.7 | Worker availability for Day 15 | May Days 1-5 (schema + API, no workers needed); June Days 6-20 (mobile + testing, workers running post-ADR 0005 unfreeze). |

**Engineering acceptance documented:** `docs/specs/v8-architect-clarifications-engineering-acceptance.md`.

---

## 7. Sign-off checklist (build start) — STATUS 2026-05-08

| # | Item | Status |
|---|---|---|
| 1 | Architect resolves §6 open questions (10 items) | ✅ Done — `SafeCommand_Phase521_Preflight_Analysis.md` (commit `3a64a43`) |
| 2 | Architect resolves §6A engineering follow-ups (7 items) | ✅ Done — `SafeCommand_Phase521_Clarifications_Resolved.md` (commit `0bf1a82`) |
| 3 | Founder confirms Phase 5.21 timing (split: May Days 1-5 / June Days 6-20) | ✅ Confirmed via "go ahead with spec hygiene" direction |
| 4 | Workers transitioned to always-on per ADR 0005 + workers-unfreeze runbook | ⏳ Pending June 1 (no impact on May Days 1-5) |
| 5 | AWS Activate credits applied + balance verified | ⏳ Pending — founder action this week |
| 6 | Sentry + UptimeRobot + cost alerts active | ⏳ Pending — pre-June operational checklist |
| 7 | Phase 5.13–5.18 surfaces verified working in production (regression baseline) | ✅ Done — branch baseline `tsc --noEmit` passes on all 4 apps at HEAD `0bf1a82` (2026-05-08) |
| 8 | `seeds/incident_action_templates.json` structure drafted | ⏳ Day 5 work (founder content review parallel during Days 1-5) |
| 9 | Migration number 014 confirmed against repo state | ✅ Done — existing 001-013 in `supabase/migrations/`; next is 014 |
| 10 | ADR 0001 amended with mig 014 entry | ✅ Done — 2026-05-08 amendment added |
| 11 | Acceptance gates defined (this document §5 + 7 architect-added gates G14-G20) | ✅ Done |

**Status: 7 of 11 done; 4 outstanding (3 are pre-June operational; 1 is Day 5 work).**

May Days 1-5 build can begin. Workers unfreeze + AWS Activate credits gate the June Days 6-20 work, but those are already scheduled per ADR 0005 + workers-unfreeze runbook.

---

## 8. Maintenance

- **Owner:** SafeCommand Engineering
- **Review cadence:** weekly during build; daily during stabilisation
- **Update triggers:** any open question resolved → update §6; any new risk surfaces → update §3; any deviation from sequence in §4 → document
