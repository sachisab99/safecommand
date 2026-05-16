# SIRE — Complete Delivery Validation

> **As of 2026-05-16.** Authoritative status of every SIRE feature against
> the v8 spec (BR-G…BR-P, EC-23, Hard Rules 23/24/25) and the Day 7 bundle,
> grounded in the actual code + production deploy state. Honest about gaps.
>
> **Deploy state:** prod api `main @ c1ddd0c` (PR #1 + #2 merged) · migs
> 014/015/016/017/**018/019** applied & verified in prod · AWS Amplify
> dashboard live (confirmed) · mobile via Metro dev-client (standalone EAS
> build optional/pending) · workers `WORKERS_PAUSED=true` (notification
> dispatch → June 1, ADR 0005; SIRE itself fully live via API/UI/3s-poll).

## 1. Functional BRs (v8 §7 — Structured Incident Response Engine)

| BR | Title | Status | Where / evidence | Notes |
|---|---|---|---|---|
| **BR-G** | 32 sub-type taxonomy | ✅ Delivered | mig 014 CHECK; `sire.ts` validates; resolver matches | All 32 enumerated |
| **BR-H** | 10-state zone machine, real-time grid (SH/SC) | ✅ Delivered | mig 014 `incident_zone_states`; `incident-zone-states.ts` matrix; SireSection grid mobile+dashboard; 3 s poll | Realtime-push is Phase 5.22+ (poll meets NFR-10 for now) |
| **BR-I** | 3-button evolved staff action | ✅ Delivered | `getValidTransitions` → ZoneState action sheet (SAFE+CLEAR / NEEDS_ATTENTION / TRIGGER_EVAC); legacy "I AM SAFE" replaced contextually (Rec 1) | False-green block (GS can't exit EVAC_TRIGGERED) encoded |
| **BR-J** | Selective zone evacuation + fan-out + auto PA | ✅ Delivered | Evac sheet/modal multi-select; `POST /sire/.../evacuation-triggers`; zones flip EVAC_TRIGGERED; BR-N PA draft | Targeted notify *dispatch* → June (workers) |
| **BR-K** | Full-venue evac, single-tap + mandatory reason | ✅ Delivered | FULL_VENUE in evac UI; server requires `reason_note` | |
| **BR-L** | Auto-evac **suggestion only** (Hard Rule 23) | ✅ Delivered (pulled fwd) | Detector in PATCH zone-state → `incident_dashboard_prompts`; banner + dismiss; **3-layer** no-auto-trigger | DB `CHECK(is_auto_trigger=FALSE)` + insert-only + swallowed |
| **BR-M** | Sub-type template resolution (EC-23 5-step) | ✅ Delivered | `templateResolver.ts` 6-tier; migs 015/017/**019** | mig 019 prod-verified **0 EC-23 gaps** |
| **BR-N** | PA auto-draft, SH edits before broadcast | 🟡 Partial (by design) | `draftPaAnnouncement()` shared; api stores `pa_text_generated`; mobile+dashboard prefill+edit | **English delivered; regional-language = Phase B** per mig 014 schema (i18n key emitted now) |
| **BR-O** | GS zone assignment at shift start → grid | ✅ Delivered | `bootstrapSireIncident` assigns GS per zone → `incident_zone_states.assigned_gs_id`; roster from Phase 5.16 | Confirm roster-driven path in Day 7 W-walk |
| **BR-P** | Immutable evacuation-trigger log | ✅ Delivered | `incident_evacuation_triggers` append-only RLS (mig 014, Hard Rule 4); UI audit list | UPDATE/DELETE RESTRICTIVE-denied |

## 2. Engineering constraints / hard rules

| Item | Status | Evidence |
|---|---|---|
| **EC-23** — every (type×role) resolves | ✅ Delivered | mig 019 verification in prod: 30 global+parent, **0 gaps**, 6 Tier-B divergence sub-types |
| **Hard Rule 23** — never auto-trigger evac | ✅ Enforced ×3 | DB `CHECK(is_auto_trigger=FALSE)` · detector only INSERTs a prompt · detector errors swallowed (never affects zone result) |
| **Hard Rule 24** — schema before code | ✅ Satisfied | migs 018/019 psql-applied & verified, *then* PR #1/#2 merged |
| **Hard Rule 25** — views REVOKE anon/auth | ✅ N/A here | No new views in 018/019; mig 014 view + mig 016 revoke pre-existing |
| **Rule 4 / append-only** | ✅ | `incident_zone_state_log`, `incident_evacuation_triggers`, `incident_evidence` all RESTRICTIVE no-UPDATE/DELETE |
| **Rule 2 / venue_id** | ✅ | every SIRE table venue-scoped; RLS + API venue checks |

## 3. Day 7 enhancement bundle + hardening (2026-05-16)

| Item | Status | Evidence |
|---|---|---|
| Rec 1 — context-aware incident buttons | ✅ | Take Action (SIRE) / I AM SAFE (legacy) / Resolved; v1 path byte-identical (confirmed on device) |
| Rec 2b — shared incident photo wall | ✅ | mig 018 append-only `incident_evidence`; mobile capture **working in prod** (verified); dashboard wall + **zone-evidence file upload (parity, this PR)** |
| Rec 3a — one-tap Initiate | ✅ | ASSIGNED→IN_PROGRESS direct on assignment cards |
| Crash hardening | ✅ | `normalizeSireState()` trust-boundary coercion (mobile+dashboard) + `ErrorBoundary` wrap; version-skew crash fixed & verified on device |
| Structured error catalog | ✅ | `@safecommand/types/error-codes` (`describeError`/`classifyTransport`); applied at SIRE surface + upload diagnostics; incremental adoption elsewhere |
| S3 presign SSE bug | ✅ Fixed | PR #2 — dropped signed SSE header; **mobile upload confirmed working in prod**; encryption-at-rest via S3 bucket default |

## 4. Honest deferred / out-of-scope (documented decisions, not gaps)

- **BR-N regional language** → Phase B (English live; i18n keys emitted; mig 014 schema notes regional is Phase B).
- **Notification dispatch** (push/WA/SMS escalation, NFR-02 ≤5 s / NFR-32 ≤30 s) → June 1 unfreeze (ADR 0005; workers paused; zero cost). SIRE state/UI/audit are fully live now.
- **Hospital-specific sub-types** (`MEDICAL_OBSTETRIC`, `MEDICAL_MASS_CASUALTY`, `STRUCTURAL_HAZMAT`) → hospital pilot under Rule 12; they degrade safely to parent via EC-23 meanwhile.
- **Non-divergent sub-type specifics** (CARDIAC, GAS_LEAK, …) → intentionally use parent template (consistent guidance); only the 3 *dangerous-divergence* sub-types got specifics.
- **Realtime push** for zone grid → Phase 5.22+ (3 s poll meets NFR-10 today).
- **Sentry wiring** for ErrorBoundary / structured logs → go-live checklist item (hook point marked in `ErrorBoundary.tsx`).
- **EAS standalone build** → optional; dev-client + Metro validated. Needed only for a distributable APK / final Loom.
- **S3 bucket default-encryption confirmation** → recommend verifying/IaC-codifying `sc-evidence-prod` default SSE (AWS default since 2023; relied upon by the PR #2 fix).

## 5. What remains to call SIRE "complete & validated"

| # | Action | Owner | Blocking? |
|---|---|---|---|
| 1 | Merge PR #3 (dashboard zone-evidence parity + this doc) | founder | deploy of the parity fix |
| 2 | Run `phase-5-21-day7-walkthrough.md` end-to-end (P1–P10, W1–W21, R1–R6, D1–D9) — most testable now (api+dashboard live, mobile via Metro) | founder | acceptance sign-off |
| 3 | EAS standalone build + Loom (optional, for distributable + sales asset) | founder | not blocking core delivery |
| 4 | June 1: workers always-on → notification dispatch live (per `JUNE-2026-REVIEW-REQUIRED.md`) | founder | NFR-02/32 latency gates only |

**Verdict:** SIRE engineering is **complete and live in production** for non-hospital scope — every BR-G…BR-P delivered (BR-N English; regional Phase B), EC-23 proven gap-free in prod, Hard Rule 23/24 enforced, photo/upload path fixed and verified on device. Remaining work is **validation execution (Day 7 walkthrough)** and the **documented June notification-dispatch unfreeze** — not missing engineering.
