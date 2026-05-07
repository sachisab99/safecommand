# SafeCommand v8 alignment analysis — Engineering response to spec evolution

> **Status:** Analysis-only deliverable; no code or doc changes made until founder direction
> **Authored:** 2026-05-08, post-v8 spec receipt (Business Plan v8.0 + Architecture v8 dated 2026-05-10)
> **Spec authority sources:**
> - `nexus/specs/2026-05-10_prime_business-plan-report-gen_v8.md` (1378 lines, 101 BRs, 6 ADRs)
> - `nexus/specs/2026-05-10_SafeCommand_Architecture_v8_Complete.md` (7221 lines, 23 ECs, 24 Hard Rules)
>
> **Purpose:** Honest understanding + alignment + confidence statement on the v8 spec evolution. Identify what existing work is preserved, what needs alignment, what's open. Recommendations follow at the end.

---

## 1. TL;DR — confidence and posture

**Confidence: HIGH.** The v8 evolution is well-grounded, additive (not breaking), and codifies the right architectural decisions. Specifically:

- **All Phase 5.13–5.18 work is preserved** — drill management, two-tier admin parity, reason taxonomy (ADR 0004), and Phase 5.18 detail surfaces are not affected.
- **The "Structured Incident Response Engine" (SIRE) is the right next move** — and v8 explicitly defers it to Phase 2 (Phase 5.21–5.22), keeping Phase 1 stable for pilot validation. This is the conservative call.
- **Industry alignment is strong** — v8 cites the same standards I researched independently for `docs/specs/incident-response-activity-templates.md` (HICS, NABH §EM, NFPA, NDMA, ISO 22320). The convergence validates both documents.
- **Two new ADRs (0005 + 0006) need codification** in our repo — not implementation, just documentation.

**One concern (medium):** My recently-shipped `docs/specs/incident-response-activity-templates.md` has architectural divergence from v8 — different table shapes, different entity centring (staff-centric vs zone-centric). It's not wrong, but v8 supersedes it. Need a decision: archive my doc, or align it.

**Net posture:** No urgent code changes. Two ADRs to write. CLAUDE.md needs a substantial rewrite to v8 baseline. Phase 5.21 implementation begins June (post-validation gate, post-AWS-Activate-credits).

---

## 2. Understanding of v8 — what's new

### 2.1 The headline change: SIRE (Structured Incident Response Engine)

v8 evolves SafeCommand from a binary "I Am Safe" model into a structured incident command system. The change is in §7 of the Business Plan and runs through Architecture §SIRE.

**Five capabilities introduced together:**

1. **31 (or 32) incident sub-types** across the 6 parent types (FIRE / MEDICAL / SECURITY / EVACUATION / STRUCTURAL / OTHER). Each sub-type routes to a different action template.
2. **3-button staff action model** for FIRE + EVACUATION events — replaces "I Am Safe" with **✅ Safe + Zone Clear · ⚠ Zone Needs Attention · 🚨 Trigger Evacuation**.
3. **10-state zone state machine** tracking each zone through the incident lifecycle (UNVALIDATED → SWEEP_IN_PROGRESS → ZONE_CLEAR / NEEDS_ATTENTION / EVACUATION_TRIGGERED → EVACUATING → EVACUATION_COMPLETE / SH_CONFIRMED_CLEAR + LOCKED_DOWN / INACCESSIBLE).
4. **Selective evacuation** — SH multi-selects zones from a live grid; partial or full evacuation with one-zone granularity. Auto-drafted PA text (English + regional language).
5. **Per-role action templates** — every incident type × sub-type × role has a defined ordered checklist with evidence requirements (PHOTO / VERBAL / GPS / SIGNATURE / NOTE).

### 2.2 The 10 new BRs (BR-G through BR-P)

All 10 are **Phase 2 (Phase 5.21–5.22)** — explicitly not Phase 1.

| BR | Title | Phase |
|---|---|---|
| BR-G | Incident sub-type taxonomy (32 sub-types across 6 parents) | 5.21 |
| BR-H | Zone state machine during incidents (10 states) | 5.21 |
| BR-I | 3-button evolved staff action model | 5.21 |
| BR-J | Selective zone evacuation (multi-select from live grid) | 5.21 |
| BR-K | Full venue evacuation trigger from dashboard | 5.21 |
| BR-L | Auto-evacuation suggestion (soft prompt, never auto-trigger) | 5.22 |
| BR-M | Sub-type template resolution (5-step graceful fallback) | 5.21 |
| BR-N | PA announcement auto-draft (English + regional language) | 5.22 |
| BR-O | Zone assignment to GS at shift start (drives zone-grid) | 5.21 |
| BR-P | Evacuation trigger log (immutable per-decision audit) | 5.21 |

### 2.3 Spec governance additions

| Item | v7 | v8 | Delta |
|---|---|---|---|
| BRs | 91 | 101 | +10 (BR-G–P) |
| NFRs | 37 | 37 | NFR-35 strengthened with Apollo `#C8102E` 8.0:1 validation |
| Engineering Constraints | 22 | 23 | +EC-23 (template fallback always resolves) |
| Hard Rules | 22 | 24 | +Rule 23 (no auto-evacuation) +Rule 24 (mig 011 before Phase 5.21) |
| ADRs | 4 (in repo) | 6 (formalized in spec) | +ADR-0005 (workers always-on) +ADR-0006 (Apollo live demo) |

### 2.4 Schema additions (Architecture v8 → repo migration 011)

v8 introduces **one new migration** (`011_incident_response_engine.sql`) that:

- Adds `incident_subtype` column (TEXT NULL, 32-value CHECK) to existing `incidents` table — **non-breaking**, NULL on existing rows
- Creates **6 new tables**:
  - `incident_zone_states` — live zone state per incident
  - `incident_zone_state_log` — append-only audit trail of every zone transition
  - `incident_evacuation_triggers` — immutable record of every evacuation decision
  - `incident_action_templates` — per-role action checklists (JSONB-shaped)
  - `incident_response_actions` — per-staff action completion + evidence
  - `incident_dashboard_prompts` — auto-evacuation suggestion prompts (BR-L)

**Important:** mig 011 is **additive-only** with zero downtime. No modifications to existing tables beyond the nullable column add. Phase 1 keeps working unchanged.

### 2.5 Two new ADRs (formalized in v8 spec; not in repo)

#### ADR-0005 — Workers/scheduler model

> *"Option C Hybrid — Always-on from June. `WORKERS_PAUSED` = emergency kill switch (not cost discipline). `sleepApplication` in scripts. AWS Activate credits before June."*

**Operational impact:**
- Workers transition from "paused for cost discipline" (May 2026) to "always-on; paused only in emergencies" (June onward)
- AWS Activate credits must be redeemed **before** June 1 (not "in June" as v7 implied)
- This is a posture change captured in our existing memory file `reference_workers_paused_kill_switch.md` but not formalized as ADR yet

#### ADR-0006 — Apollo brand demo strategy

> *"Option C Hybrid — ThemeProvider from Phase A enables live working Apollo-branded demo on real device from June. Loom video produced. `#C8102E` on white = 8.0:1 (confirms NFR-35). Mandatory footer disclaimer."*

**Operational impact:**
- Apollo deliverable shifts from "static mockup" (v7 Phase A) to "live working demo on real device from June 1" (v8)
- ThemeProvider (already shipped Phase A) enables this with no additional engineering investment
- Mandatory fair-use footer disclaimer must accompany every Apollo demo
- Demo is internal sales tool only — never published externally

### 2.6 Phase boundaries clarified

v8 explicitly clarifies what's Phase 1 vs Phase 2:

**Phase 1 (June–Oct 2026 build; pilots Q4 2026 / Q1 2027):**
- Existing 91 BRs (v7 baseline)
- Existing binary "I Am Safe" model
- Workers go always-on (June, ADR-0005)
- ThemeProvider already shipped Phase A
- Hyderabad supermall = Pilot 2 (3-building MBV reference)
- Hospital pilots **explicitly gated to Feb 2027 post-GCP migration** (Hard Rule 12 reinforced)

**Phase 2 (Mar–May 2027):**
- Phase 5.21 — SIRE core (zone state machine + 3-button + selective evacuation + 15 priority sub-type templates)
- Phase 5.22 — SIRE polish (PA auto-draft + remaining role templates + per-zone scoping)
- All 10 new BRs (BR-G–P) land here, not earlier

This deferral is **non-negotiable** per v8 Risk Register. Engineering should NOT start Phase 5.21 work in June.

---

## 3. Alignment with our existing work

### 3.1 What's PRESERVED (✅ — no action needed)

| Existing artefact | v8 status |
|---|---|
| Phase 5.13–5.17 two-tier admin parity (Equipment / Drills / Cert / Shifts / Staff) | ✅ Preserved verbatim — these are Phase 1 BRs (BR-21 / BR-A / BR-22 / BR-04 / BR-13) which v8 leaves unchanged |
| Phase 5.18 drill audit-grade detail + 6-code reason taxonomy | ✅ Preserved — ADR 0004 is unchanged; mig 013 columns unchanged; the drill model continues to use `drill_session_participants` table not the new SIRE tables |
| ADRs 0001 / 0002 / 0003 / 0004 in repo | ✅ Preserved — v8 lists all four as "confirmed" in CONFIRMED DECISIONS table |
| All migrations 001–013 (live in Supabase) | ✅ Preserved — v8 mig 011 (SIRE) is purely additive |
| Existing BR-11 incident declaration flow | ✅ Preserved — Phase 1 keeps the binary model; SIRE replaces it only in Phase 2 |
| docs/research/drill-participant-reason-taxonomy.md | ✅ Preserved — research doc remains the authoritative backing for ADR 0004 |
| docs/sales/drill-demo-narrative.md + demo-runbook.md | ✅ Preserved — these are Phase 1 sales artefacts |
| Two-tier admin parity matrix | ✅ Preserved — v8 makes no role-permission changes |

### 3.2 What needs ALIGNMENT (🟡 — codification work, not implementation)

| Existing artefact | v8 status | Recommended action |
|---|---|---|
| `docs/specs/incident-response-activity-templates.md` (920 lines, my recent design) | 🟡 **Architecturally divergent from v8** — different table shape (5 tables vs 6), different entity centring (staff-centric vs zone-centric), different evidence model | **Mark as superseded.** Add a banner at top: "Superseded by Architecture v8 §SIRE. Retained as historical engineering exploration." Don't delete — it documents the convergent thinking that validated the v8 design. |
| `CLAUDE.md` at product root | 🟡 References v7 spec, 91 BRs, 22 ECs, 22 Hard Rules, 4 ADRs | Substantial rewrite to v8 baseline: 101 BRs, 23 ECs, 24 Hard Rules, 6 ADRs, mig 011 in pending state, Phase 5.21–5.22 in roadmap |
| `docs/STATE_OF_WORK.md` | 🟡 References v7 spec authority | Update spec authority pointer; add Phase 5.21–5.22 row in phase progression; note SIRE deferred to Phase 2 |
| ADR 0005 file | 🟡 **Missing** — workers-always-on decision is in memory but not codified | Create `docs/adr/0005-workers-always-on-from-june.md` |
| ADR 0006 file | 🟡 **Missing** — Apollo live-demo decision is in memory but not codified | Create `docs/adr/0006-apollo-brand-live-demo.md` |
| Memory file `project_safecommand.md` | 🟡 References v7 + Phase 5.18 baseline | Update to v8 baseline + post-Phase-5.18 stable |
| Memory `MEMORY.md` index entry | 🟡 References HEAD `96a30dd` (Phase 5.18 commit) | Update to current HEAD |

### 3.3 What's DEFERRED (📅 — June+, not now)

All 10 new BRs (BR-G–P) and all SIRE schema work is deferred per v8 spec. Engineering action: **none until Phase 5.21**. Specifically:

- ❌ Don't write mig 011 yet
- ❌ Don't seed `incident_action_templates` yet
- ❌ Don't add 3-button UI to mobile yet
- ❌ Don't add selective evacuation to dashboard yet

This deferral is right. Phase 1 stability + pilot validation are the priorities for May–October 2026.

### 3.4 Areas of architectural DIVERGENCE (🔴 — design discussion before implementing)

These need clarity before Phase 5.21 implementation begins:

#### 3.4.1 My activity-templates spec vs v8 SIRE — different design paradigms

**My doc (`docs/specs/incident-response-activity-templates.md`) used a staff-centric model:**
```
ACTIVITY_TEMPLATE → ACTIVITY_TEMPLATE_ITEM (per role per incident)
INCIDENT_RESPONSE_PLAN → INCIDENT_RESPONSE_ASSIGNMENT (per staff)
                       → INCIDENT_RESPONSE_ITEM_COMPLETION (per item per staff)
```

**v8 uses a zone-centric model:**
```
INCIDENT_ACTION_TEMPLATES (per role per incident_subtype, JSONB-shaped)
INCIDENT_ZONE_STATES (per zone per incident, 10-state machine)
INCIDENT_ZONE_STATE_LOG (immutable audit trail per zone transition)
INCIDENT_EVACUATION_TRIGGERS (immutable per-decision audit)
INCIDENT_RESPONSE_ACTIONS (per staff per action, evidence-keyed)
INCIDENT_DASHBOARD_PROMPTS (auto-evacuation suggestions, never auto-trigger)
```

**The shapes diverge in key ways:**

1. **Zone-centric vs staff-centric:** v8 makes zones first-class entities in the incident state machine. My design made staff-action-completions the unit of accountability. v8 is more aligned with NABH §EM and HICS, where zones (wards, floors) are the operational unit during incidents.
2. **JSONB vs separate items table:** v8 stores action lists in `incident_action_templates.actions` as a JSONB array. My design used a separate `activity_template_items` table. v8 is faster to seed; mine is easier to query individual items.
3. **Evidence model:** v8 separates `incident_response_actions` (evidence) from zone state. Mine bundled evidence into completion records. v8 separation is cleaner for compliance reporting.
4. **No "incident_response_plan" entity in v8:** v8 doesn't snapshot per-staff plans at incident-declare time; it resolves templates dynamically via the 5-step fallback chain. My design snapshotted (template version pinned). Trade-off: v8 is more flexible (template updates apply to in-flight incidents); mine was more audit-stable.

**My recommendation:** v8's design is correct. **Zone-centricity is the right primitive for incident response** because zones map to the physical reality of evacuation (a fire in Zone B-3 evacuates B-3, not "the staff assigned to B-3 wherever they are"). My staff-centric framing was useful as a thought exercise but the v8 architect made the right call.

#### 3.4.2 Workers-always-on timing (ADR-0005)

v8 says workers go always-on **from June 1**. That implies:
- AWS Activate credits redeemed **before** June 1 (not in June)
- `MASTER_TICK_INTERVAL` reverts to 60s (from current 4hr hibernation)
- Scheduler / escalation / notifier services need monitoring (Sentry alerts, UptimeRobot)
- Per-task cost monitoring active (or risk runaway compute spend)

**Current state:** Workers paused (`WORKERS_PAUSED=true` on Railway). AWS Activate credits not yet applied per memory `reference_aws_activate_safecommand.md`.

**Time pressure:** ~3 weeks until June 1. The AWS Activate application typically takes 7-14 days. Founder action needed week of 2026-05-12.

#### 3.4.3 Apollo demo timing (ADR-0006)

v8 says live Apollo demo from June 1. That requires:
- Apollo brand config seeded (we have a stub in `apps/ops-console/seeds/apollo-demo.sql` — need to verify)
- ThemeProvider working with Apollo override (this is shipped Phase A)
- Mandatory fair-use footer disclaimer added (need to write)
- Apollo logo file uploaded to S3 (founder action)
- Loom video recorded (founder action)

**Current state:** Apollo demo seed exists but not applied to production; logo not uploaded; Loom not recorded.

#### 3.4.4 Hospital pilot gate (Hard Rule 12 reinforced)

v8 reinforces: **no hospital pilots until Feb 2027 post-GCP migration**. This is non-negotiable.

**Implication for sales:** Any hospital prospect contact this month should know the timeline. The pitch should focus on supermall pilot (which is Pilot 2, 3-building MBV reference). Hospital interest is captured for Q1 2027 onboarding.

---

## 4. Engineering confidence statement

### 4.1 What I'm CONFIDENT about

1. **The Phase 1 codebase (Phase 5.13–5.18) is solid and aligned with v8.** No retrofit work needed. All BRs delivered remain in v8's BR catalogue with same numbers.
2. **The architectural shape of SIRE is correct.** Zone state machine + per-role templates + immutable audit is the right pattern. v8 spec matches what HICS / NABH / NFPA / NDMA require.
3. **The phase deferral to Phase 5.21 is correct.** Phase 1 needs to stabilize and validate via pilots before adding SIRE complexity.
4. **The two new ADRs (0005, 0006) are honest reflections of decisions already made.** Both have field-tested rationale; codifying them is a paperwork exercise.
5. **Mig 011 is safe to apply when Phase 5.21 begins.** Additive-only schema; no modifications to existing tables; zero downtime.
6. **The migration governance (Hard Rule 24)** — apply mig 011 before deploying Phase 5.21 code — is the right safety gate. Matches our pattern of mig-then-code from the Phase 5 series.

### 4.2 Where I want CLARIFICATION

1. **My activity-templates spec disposition.** Three options for `docs/specs/incident-response-activity-templates.md`:
   - (a) Add a "SUPERSEDED BY v8" banner at top, retain as historical exploration
   - (b) Refactor to align with v8 schema (rewrite to use zone-centric entities)
   - (c) Delete
   - **My preference: (a).** It documents convergent thinking that validates v8. Doesn't pretend to be authoritative; references v8 as the source of truth.

2. **Phase 5.21 scope precision.** v8 says "15 priority sub-type templates" in Phase 5.21, "remaining 17" in Phase 5.22. Which 15? Recommendation: pick the most-common-in-Indian-venue ones first:
   - FIRE: FIRE_CONTAINED, FIRE_SPREADING, FIRE_SUSPECTED, FIRE_DRILL (all 4)
   - MEDICAL: MEDICAL_CARDIAC, MEDICAL_TRAUMA (2 of 5)
   - SECURITY: SECURITY_BOMB_THREAT, SECURITY_ACTIVE_AGGRESSOR (2 of 7)
   - EVACUATION: all 5
   - STRUCTURAL: STRUCTURAL_GAS_LEAK, STRUCTURAL_POWER_FAILURE (2 of 7) — leave hospital-specific (HAZMAT, MASS_CASUALTY) for Phase 5.22
   - OTHER: OTHER_VIP_EVENT (1 of 4)
   - Total: 16 — close enough to v8's "15"
   Need architect signoff on this priority list.

3. **i18n scoping for SIRE templates.** v8 says action templates are in 32 sub-types × 8 roles × multiple venue-types = ~300+ templates. Each action item has English text + i18n key. Multi-language activation is Phase C per v7. For Phase 5.21, we ship hardcoded English + i18n keys (matches existing pattern). OK?

4. **Auto-evacuation suggestion threshold tunability.** BR-L says "≥2 zones (configurable) report NEEDS_ATTENTION within 3 minutes (configurable) during FIRE." Where does the configuration live? Per-venue setting? Global default? Need to confirm in Architecture v8 §SIRE before implementing.

5. **Drill mode SIRE applicability.** v8 says BR-G–P apply to "FIRE and EVACUATION incident types" — what about drills? A FIRE drill should run through the same SIRE flow but with "this is a drill" indicator visible to staff. v8 doesn't explicitly say. Recommendation: drills inherit the SIRE flow with a `is_drill: true` flag on `incidents.is_drill` (already exists I believe). All evidence requirements relax in drill mode (verbal-only acceptable). Need confirmation.

### 4.3 Where I have MEDIUM CONFIDENCE (would benefit from architect input)

1. **Performance targets for SIRE.** Architecture v8 carries forward NFR-02 (≤5s incident escalation) and NFR-10 (≤30s zone board refresh). For SIRE specifically:
   - Zone state grid live updates: needs Supabase Realtime (Phase 1 native) or polling fallback. Volume: at peak, 50 zones × 1 incident × every state change = ~100 broadcasts/incident. Manageable.
   - Selective evacuation fan-out: ≤5s from SH tap to first push notification delivered. Achievable with priority-0 BullMQ queue (already wired).
   - PA text auto-draft: ≤500ms client-side. Achievable with template substitution; no LLM needed for v1.
   I'm confident on volume + latency. Concern: if 30 simultaneous incidents across 30 venues happen during a multi-venue corporate event, we may need to scale Railway notifier replicas. Architecture v8 may or may not address.

2. **CORP-* role visibility into SIRE.** EC-20 says CORP roles never see individual PII. Aggregate compliance scores OK. But should CORP-CXO see "Venue X had a fire incident — 8 zones evacuated, 2 needs-attention, 1 inaccessible"? That's aggregate but also operationally sensitive (insider trading, etc.). Phase 3 concern; architect should confirm.

3. **Mobile data model overlap.** Existing mobile DrillsScreen uses `drill_session_participants` for the drill participation matrix. New mobile incident screens (Phase 5.21) will use `incident_zone_states` for the zone grid. Should we converge these two surfaces? Or keep them as parallel data models (drills vs incidents)? My instinct: keep parallel — they're distinct primitives. Drill = exercise; incident = real-world event with zone-state semantics.

---

## 5. Recommendations — proposed actions in priority order

### 5.1 IMMEDIATE (this week — no implementation work, just spec hygiene)

1. **Mark my activity-templates spec as superseded.** Add banner to `docs/specs/incident-response-activity-templates.md`. Reference v8 SIRE as the authoritative spec. Retain doc as historical exploration. **Effort: 5 min.**
2. **Write ADR 0005** (`docs/adr/0005-workers-always-on-from-june.md`) — formalizes the workers-always-on decision per v8 spec. **Effort: 30 min.**
3. **Write ADR 0006** (`docs/adr/0006-apollo-brand-live-demo.md`) — formalizes the live-demo decision. **Effort: 30 min.**
4. **Update CLAUDE.md** to v8 baseline:
   - Spec authority pointers → v8 dated 2026-05-10
   - BR count: 91 → 101
   - EC count: 22 → 23
   - Hard Rules count: 22 → 24
   - ADR list: 4 → 6
   - Phase progression: add Phase 5.21 + 5.22 row
   - SIRE deferred to Phase 2 (Phase 5.21–5.22)
   - **Effort: ~1 hr.**
5. **Update STATE_OF_WORK.md** similarly. **Effort: 30 min.**
6. **Update memory file `project_safecommand.md`** with v8 baseline + new ADRs + SIRE deferral. **Effort: 15 min.**

**Total this week: ~3 hr documentation work.**

### 5.2 NEAR-TERM (next 3 weeks — pre-June 1)

1. **AWS Activate credit application** — founder action this week (memory says ~7–14 day approval window). Required for ADR-0005 workers-always-on.
2. **Prepare workers-unfreeze runbook** — pre-June operational checklist. Verify scheduler tick reverts to 60s, escalation queue depth monitoring, notifier replica count, Sentry alerts active.
3. **Apollo live-demo prerequisites** — founder uploads logo to S3, applies apollo-demo seed to production, records 90s Loom of branded app. Need engineering support for any UI bugs surfaced.
4. **Continue Phase 1 pilot validation per existing demo runbook** — `docs/sales/demo-runbook.md` is unchanged.

**Engineering effort minimal. Founder-action heavy.**

### 5.3 PHASE 5.21 BEGIN (June 1 onward, post-validation gate)

This is the bulk of work. **Scope discussion before commit:**

1. **Mig 011 design + deploy** — write `011_incident_response_engine.sql` based on Architecture v8 §SIRE. Apply to production via Supabase Dashboard SQL Editor (matches our pattern). Verify with sanity-check queries. **Effort: ~1 day.**
2. **api routes** — 6 new endpoints per Architecture v8 §SIRE. **Effort: ~3 days.**
3. **Mobile** — new IncidentDetailScreen + 3-button zone action UI + zone state grid + assigned-zone awareness. **Effort: ~5 days.**
4. **Dashboard** — extend `/incidents/[id]` with zone state grid + selective evacuation modal + PA text drafter. **Effort: ~5 days.**
5. **Seed templates** — 15 priority sub-type × 8 roles = ~120 templates. JSON file in repo + import script. **Effort: ~2 days.**
6. **Testing + alignment** — end-to-end validation against v8 spec, drill-mode toggle, performance benchmarking. **Effort: ~3 days.**

**Total Phase 5.21: ~3 weeks engineering.**

Phase 5.22 (PA auto-draft + remaining 17 sub-type templates + per-zone scoping refinements): **~2 weeks** after Phase 5.21 lands.

### 5.4 OPEN QUESTIONS for founder + architect

Before Phase 5.21 begins (so questions resolve in May for clean June start):

1. **Disposition of `docs/specs/incident-response-activity-templates.md`?** (Recommend: superseded banner, retain.)
2. **Phase 5.21 priority sub-type list — 15 of 32?** (My proposed list above, need signoff.)
3. **i18n posture for SIRE templates — Phase 5.21 ships English-only, i18n keys reserved?** (Matches existing pattern.)
4. **Auto-evacuation threshold configurability — per-venue setting or global default?** (Architect input on schema.)
5. **Drill mode SIRE applicability — drills inherit zone state machine or stay on existing drill_session_participants flow?** (My recommendation: separate primitives.)
6. **CORP-* role aggregate visibility into incidents — Phase 3 concern or addressed earlier?** (Architect input.)

---

## 6. What we should NOT do

To prevent scope creep:

- ❌ **Don't start Phase 5.21 work in May.** v8 explicitly defers to Phase 2 post-validation-gate.
- ❌ **Don't write mig 011 yet.** Schema design will benefit from architect review of my open questions first.
- ❌ **Don't redo Phase 5.18 work.** Drill management is preserved in v8; reason taxonomy is unchanged. Two-tier admin parity stands.
- ❌ **Don't onboard hospital pilots before Feb 2027.** Hard Rule 12 reinforced in v8.
- ❌ **Don't deprecate `docs/specs/incident-response-activity-templates.md` without retaining the historical record.** It's a useful reference for the convergence.

---

## 7. Confidence summary

| Dimension | Confidence | Notes |
|---|---|---|
| **v8 architectural soundness** | HIGH | Zone-centric model + immutable audit + role-keyed templates is correct |
| **Phase deferral (SIRE → Phase 5.21–5.22)** | HIGH | Right call; Phase 1 needs stability + pilot validation |
| **Backward compatibility with Phase 5.13–5.18** | HIGH | All preserved; no retrofit needed |
| **My activity-templates spec disposition** | MEDIUM | Recommend supersede-banner; await founder/architect ack |
| **Workers-always-on timing (ADR-0005)** | MEDIUM | Tight 3-week window; depends on AWS Activate approval |
| **Apollo live-demo timing (ADR-0006)** | MEDIUM | Needs founder action chain (logo upload, Loom, seed apply) |
| **Hospital pilot gate** | HIGH | v8 reinforces; no ambiguity |
| **Phase 5.21 implementability** | MEDIUM-HIGH | Open questions resolvable with architect input; schema is well-defined |
| **NFR-35 Apollo validation** | HIGH | 8.0:1 contrast confirmed; no work needed |
| **2 new ADRs codification** | HIGH | Pure paperwork exercise |

---

## 8. Engineering's posture statement

> "v8 is a measured, well-grounded evolution of the SafeCommand platform. The 10 new BRs (BR-G–P) are correctly deferred to Phase 2, allowing Phase 1 to stabilise and validate via pilots. Our existing Phase 5.13–5.18 work is preserved without retrofit. Two new ADRs (0005, 0006) need codification — paperwork only. The activity-templates spec I wrote in Phase 5.18 is architecturally divergent from v8 SIRE in helpful ways: it documents convergent thinking that validates v8's design, and should be retained as a 'superseded' historical reference. Phase 5.21 implementation begins June 1 post-validation-gate, with ~3 weeks engineering effort, after architect resolution of 6 open questions in §5.4."

---

## 9. Next step

**Awaiting founder direction.** Specifically:

- ✅ Approve immediate-week documentation work (5.1)?
- ✅ Confirm AWS Activate credit application this week (5.2)?
- ✅ Confirm 6 open questions for architect (5.4)?
- ✅ Confirm Phase 5.21 begins June 1 (5.3)?

Once these are confirmed, I'll execute 5.1 and we'll have clean v8-aligned documentation by EOD. Phase 5.21 implementation work then proceeds in June after pilot validation gate is passed.
