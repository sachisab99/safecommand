# Phase 5.21 Day 7 — End-to-End SIRE Walkthrough Checklist

> **Purpose:** audit-grade acceptance gate for the Structured Incident Response Engine (SIRE)
> running end-to-end on real devices against production, plus the Loom recording that becomes
> the sales asset. Day 7 closes Phase 5.21.
>
> **Status precondition:** Days 1–5 merged to `main` (HEAD `481367a`). Day 6 = Railway api LIVE
> (verified) + Amplify dashboard deploy + mobile EAS binary. This checklist runs once **both**
> the Amplify dashboard serves the Days 1-5 build **and** the fresh EAS APK is installed.
>
> **Refs:** `docs/specs/phase-5-21-preflight.md` · `docs/specs/incident-response-activity-templates.md`
> · `docs/sales/demo-runbook.md` · CLAUDE.md Hard Rules 23/24, EC-23 · `docs/STATE_OF_WORK.md` §14.4

---

## 0. Constants — single source of truth for this walkthrough

| Thing | Value |
|---|---|
| Demo venue | Hyderabad Demo Supermall — `096a3701-beb0-4ffe-9e74-43af3c26e09f` |
| Live SIRE incident | `a4c716c6-e5e4-4fc3-8739-fff704c04e0a` (FIRE / SEV2 / FIRE_CONTAINED) |
| Demo zone | T2-Parking-Entrance — `0ba4d669-0746-4f64-999d-56ed11385578` |
| SH login | TEST_DEMO_Security_Head · `8782b217-e023-4b37-8d63-3593069fa33f` · **+919000012300** |
| GS login | TEST_DEMO_Security_S01 · `7bc9c06d-2e74-4f25-a749-399e71366bd5` · **+919000012301** |
| DSH login | TEST_DEMO_Deputy_Security_Head · `538d36ad-2837-4049-85bc-c952d08c4bec` · **+919000012302** |
| Dashboard URL | `https://main.d3t439ur25l1xc.amplifyapp.com/incidents/a4c716c6-e5e4-4fc3-8739-fff704c04e0a` |
| API base | `https://api-production-9f9dd.up.railway.app/v1` |
| Poll cadence | dashboard 3s · mobile 3s |

> **Login trap:** Firebase test number `+917032701272` belongs to a **different venue** — RLS
> correctly hides Hyderabad's incident from it. Always log in as **+919000012300** (SH) /
> **+919000012301** (GS) for this walkthrough. On the fresh binary, confirm the
> `TEST_PHONE_PAIRS` bypass still resolves these non-Firebase numbers (first thing to check
> at step P4 — if login fails, the bypass list didn't ship in this build).

---

## 1. Pre-flight gates — ALL must be green before the walkthrough

| # | Gate | How to verify | Pass |
|---|---|---|:---:|
| P1 | Railway api healthy | `curl -s $API/health` → `{"status":"ok","checks":{"database":"ok","firebase":"ok"}}` | ☐ |
| P2 | SIRE routes mounted | `curl -s -o /dev/null -w "%{http_code}" $API/sire/state/$INCIDENT` → **401** (auth gate, route exists) | ☐ |
| P3 | Amplify serving Days 1-5 | Open dashboard URL → page renders **a SIRE zone-state section**, not just the legacy timeline | ☐ |
| P4 | Fresh APK installed | App opens; **login as +919000012300 succeeds**; build date ≥ Day 7 EAS build | ☐ |
| P5 | Live incident still SIRE | Dashboard incident page shows `has_sire_data` section populated (29 assignments / zone grid visible) | ☐ |
| P6 | Hard Rule 24 satisfied | mig 014/015/017 in prod (already verified — schema before code; no action, just confirm no 500 on incident load) | ☐ |
| P7 | **mig 018 applied** (incident_evidence) | Run mig 018 via psql `--single-transaction` (see §7); verification DO block RAISE NOTICEs `All checks PASSED`. **Hard Rule 24: apply BEFORE the 2026-05-16 enhancement code deploys.** | ☐ |
| P8 | BR-L substrate present | `incident_dashboard_prompts` exists from mig 014 (no new migration); `is_auto_trigger` column is `CHECK (= FALSE)` | ☐ |
| P9 | **mig 019 applied** (Phase 5.22 completeness) | Apply mig 019 via psql `--single-transaction` after 018; verification RAISE NOTICEs `All checks PASSED` (30 global+parent, 0 EC-23 gaps, 6 Tier-B). | ☐ |
| P10 | BR-N active | After any evacuation trigger, `incident_evacuation_triggers.pa_text_generated` is non-NULL (auto-drafted) and the UI evac modal pre-fills the PA field | ☐ |

> If **P3** fails → Amplify still stalled; run dashboard locally as fallback
> (`npm run dev --workspace=apps/dashboard` → `http://localhost:3000/incidents/a4c716c6-…`)
> and annotate the Loom that production parity is pending the Amplify Console redeploy.

---

## 2. The walkthrough — SH dashboard ⇄ GS mobile, live

Two devices side by side: **laptop** on the dashboard incident URL (SH view), **Android phone**
with fresh APK (GS view). Screen-record both for the Loom.

| Step | Actor | Action | Expected result | Pass |
|---|---|---|---|:---:|
| W1 | SH (dashboard) | Open incident `a4c716c6-…` | SIRE section renders: zone-state grid + per-staff completion table + evacuation-trigger log (empty) | ☐ |
| W2 | GS (mobile) | Login +919000012301 → open active incident → IncidentDetailScreen | SireSection visible: assigned zone **T2-Parking-Entrance** + per-role action list resolved (EC-23 — list is non-empty) | ☐ |
| W3 | GS (mobile) | Tap assigned zone → 3-button action sheet | Three options: **SAFE + CLEAR** / **NEEDS ATTENTION** / **TRIGGER EVACUATION** (BR-I) | ☐ |
| W4 | GS (mobile) | Tap **SAFE + CLEAR** | Zone state → `ZONE_CLEAR`; optimistic UI flips green; action assignment row → `DONE` | ☐ |
| W5 | SH (dashboard) | Wait ≤3s (poll) | Same zone flips to CLEAR in the dashboard grid **within ~3s**; completion table shows GS row `DONE` | ☐ |
| W6 | GS (mobile) | Re-open zone → tap **NEEDS ATTENTION** → enter reason note | Zone → `NEEDS_ATTENTION`; reason note required & captured (state matrix `requiresReasonNote`) | ☐ |
| W7 | SH (dashboard) | Observe | Zone flips amber `NEEDS_ATTENTION` ≤3s; reason note visible to SH | ☐ |
| W8 | SH (dashboard) | Open **Selective Evacuation** modal → multi-select T2-Parking-Entrance → confirm with mandatory reason | Targeted fan-out; zone → `EVACUATION_TRIGGERED`; **one immutable row** appended to evacuation-trigger log (who/when/zones/why) | ☐ |
| W9 | GS (mobile) | Wait ≤3s | Zone shows `EVACUATION_TRIGGERED`; GS sees evacuation directive | ☐ |
| W10 | GS (mobile) | Attempt to set the EVAC'd zone back to `ZONE_CLEAR` | **Blocked** — GS cannot transition `EVACUATION_TRIGGERED → ZONE_CLEAR` (false-green prevention, encoded in `incident-zone-states.ts`) | ☐ |
| W11 | SH (dashboard) | Open evacuation-trigger log | Append-only audit row present with SH actor, timestamp, zone list, reason (Hard Rule 4 / BR-P) | ☐ |

### 2b. 2026-05-16 enhancement bundle (Rec 1 / 2b / 3a)

| Step | Actor | Action | Expected result | Pass |
|---|---|---|---|:---:|
| W12 | GS (mobile) | Open the home (My Tasks) incident banner for the SIRE incident | Banner shows **"▶ Take Action"** (NOT raw "I AM SAFE"); tapping opens the detail/SireSection (Rec 1 context-aware) | ☐ |
| W13 | GS (mobile) | Open a **legacy** (non-SIRE) incident | Still shows **"I AM SAFE"** — v1 path preserved verbatim (Rec 1) | ☐ |
| W14 | GS (mobile) | In SireSection → an assignment with status ASSIGNED → tap **⏵ Initiate** | One tap → status `IN_PROGRESS` (no sheet); dashboard completion table reflects ≤3s (Rec 3a) | ☐ |
| W15 | GS (mobile) | SireSection → "Incident photos" → **📷 Add a photo** → camera/library | Photo uploads to S3 (purpose=incident_evidence); appears in the wall | ☐ |
| W16 | SH (dashboard) | Refresh incident page | Same photo visible on the dashboard wall (any-staff-posts, all-see — Rec 2b); SH can also "📷 Add a photo" via file picker | ☐ |
| W17 | GS (mobile) | Zone state sheet requiring evidence (EVACUATION_COMPLETE) | Evidence field is now **camera capture** (not URL paste); "✓ Photo attached" after upload | ☐ |

### 2c. Phase 5.22 completeness (mig 019 + BR-N)

| Step | Actor | Action | Expected result | Pass |
|---|---|---|---|:---:|
| W18 | SH | Declare a **MEDICAL** (or SECURITY/STRUCTURAL/OTHER) SIRE incident | Per-role action lists resolve for every role — EC-23 holds for *all* types now, not just FIRE (mig 019 Tier A) | ☐ |
| W19 | GS (mobile) | Declare/open **SECURITY_BOMB_THREAT** | GS sees the divergence template: "do NOT touch", "no radio/phone within 15 m", routed-evac — **NOT** the generic SECURITY parent (mig 019 Tier B) | ☐ |
| W20 | SH | Open the evacuation modal (mobile or dashboard) | PA field is **pre-filled with the auto-drafted announcement** (BR-N); editing it sets a "Reset to suggested" affordance | ☐ |
| W21 | SH | Trigger evacuation, then open the trigger audit row | `pa_text_generated` = the system draft (immutable baseline); `pa_text_broadcast` = what SH actually sent (may differ) | ☐ |

> **Documented scope (not a gap):** other sub-types (CARDIAC, GAS_LEAK, FLOOD, etc.) intentionally
> degrade to their **parent** template via EC-23 — that guidance is *consistent*, just less specific.
> Only the three life-safety **divergent** sub-types (bomb threat, active aggressor, shelter-in-place)
> get specifics, because their parent fallback would be actively wrong. Hospital-specific sub-types
> (OBSTETRIC / MASS_CASUALTY / HAZMAT) deferred to the hospital pilot under Rule 12.

---

## 3. Hard Rule 23 safety gate — NO auto-evacuation (CRITICAL, do not skip)

**BR-L was pulled forward into the 2026-05-16 bundle** (founder decision) — the soft-prompt
detector is now implemented. This is the non-negotiable gate. A code path that auto-triggers
evacuation is a **release blocker**.

Defence-in-depth already in place: (1) DB `incident_dashboard_prompts.is_auto_trigger`
is `CHECK (= FALSE)` — the schema itself forbids an auto-trigger row; (2) the detector lives
in `PATCH .../zones/:id/state` and **only INSERTs a suggestion row** — there is deliberately
no call to the evacuation path from it; (3) the detector is wrapped so any failure is
swallowed and never affects the zone-state result.

| Step | Actor | Action | Expected result | Pass |
|---|---|---|---|:---:|
| R1 | GS (mobile) | On the FIRE incident, set **zone A → NEEDS_ATTENTION** | Zone A amber | ☐ |
| R2 | GS/2nd device | Within 3 min, set **zone B → NEEDS_ATTENTION** (≥2 zones NEEDS_ATTENTION in 3 min) | Zone B amber | ☐ |
| R3 | SH (dashboard/mobile) | Observe | **Amber "⚠ Suggestion — not automatic" banner appears** with the zone count + Dismiss + "Review evacuation →" | ☐ |
| R3b | GS (mobile/dashboard) | Observe as a **non-command** role | Banner is **NOT shown** (server gates `active_prompts` to SH/DSH/SC; mirrors `command_only_read` RLS) | ☐ |
| R4 | — | Wait 60s+ without SH action | **NO fan-out. NO zone auto-transitions to EVACUATION_TRIGGERED. No evacuation-trigger row.** Suggestion stays a suggestion. | ☐ |
| R5 | SH | Tap **Dismiss** | Banner clears (`dismissed_at` set); still no evacuation. Re-trip needs a fresh ≥2 condition (one active prompt per incident — no spam) | ☐ |
| R6 | SH | Tap **Review evacuation →** then explicitly confirm in the modal | Only **now** does evacuation fan-out fire + immutable audit row append | ☐ |

> **R4 is the gate.** If anything evacuates without the explicit SH tap in R5, **STOP** —
> file as Hard Rule 23 violation, do not record the Loom, do not proceed to sign-off.

---

## 4. Defence-in-depth verification

| # | Check | Expected | Pass |
|---|---|---|:---:|
| D1 | Login as GS (+919000012301), inspect dashboard/mobile | No selective-evacuation control; no full-venue-evac trigger (command-role only) | ☐ |
| D2 | Direct API call as GS JWT → `POST /v1/sire/incidents/:id/evacuation-triggers` | **403** from `requireRole` | ☐ |
| D3 | Login as the +917032701272 (other-venue) number | Hyderabad incident **not visible** (RLS tenant isolation holds) | ☐ |
| D4 | Legacy non-SIRE incident still works | Declare a normal incident **without** the SIRE toggle → classic timeline path unchanged (Phase 1 v1 preserved) | ☐ |
| D5 | EC-23 fallback | Declare FIRE for an unseeded sub-type → action list still resolves (lands on global+parent tier-6 row) | ☐ |
| D6 | BR-L command-only | As GS: `GET /v1/sire/state/:id` response `active_prompts` is `[]` even when a suggestion exists (server gates to SH/DSH/SC) | ☐ |
| D7 | Photo wall venue isolation | Photo posted at Hyderabad is NOT visible from the other-venue (+917032701272) login (mig 018 `venue_isolation` RLS + venue-scoped API) | ☐ |
| D8 | incident_evidence immutable | Direct UPDATE/DELETE on `incident_evidence` denied (RESTRICTIVE append-only policy — Hard Rule 4) | ☐ |
| D9 | Photo wall on legacy incident | Open a non-SIRE incident → photo wall still present (it ships in the SIRE-state payload for every incident, SIRE or not) | ☐ |

---

## 5. Loom recording beats (≤120s — maps to `docs/sales/demo-runbook.md`)

Record only **after** §2–§4 all pass. Beats:

1. **(0–15s)** Hook — "Who owns Zone B right now, and what do they do when there's a fire?"
2. **(15–40s)** SH dashboard: live incident, zone-state grid, per-role action list (EC-23 — every role has actions)
3. **(40–70s)** GS phone: receives FIRE, taps zone → 3-button action → **SAFE + CLEAR**; cut to dashboard updating in ~3s
4. **(70–95s)** GS sets **NEEDS ATTENTION**; SH sees it; SH runs **selective evacuation** on that one zone
5. **(95–115s)** Evacuation-trigger audit log — immutable who/when/why row
6. **(115–120s)** Close — "Declared safety infrastructure: configured daily, decisive in seconds."

Save Loom URL into `docs/sales/demo-runbook.md` §11 and the validation tracker.

---

## 6. Sign-off

| Gate block | Result | Notes |
|---|:---:|---|
| §1 Pre-flight (P1–P10) | ☐ PASS / ☐ FAIL | mig 018=P7, mig 019=P9, BR-N=P10 |
| §2 Walkthrough (W1–W11) + 2b (W12–W17) + 2c (W18–W21) | ☐ PASS / ☐ FAIL | 2c = Phase 5.22 completeness + BR-N |
| §3 Hard Rule 23 (R1–R6) | ☐ PASS / ☐ FAIL | **Blocker if fail** — BR-L pulled forward |
| §4 Defence-in-depth (D1–D9) | ☐ PASS / ☐ FAIL | D6–D9 cover the 2026-05-16 bundle |
| §5 Loom recorded | ☐ DONE | URL: |

**Phase 5.21 COMPLETE when all blocks PASS + Loom recorded.** Then: commit this checklist
with results filled in, update `docs/STATE_OF_WORK.md` §14, and Phase 5.21 closes.

---

## 7. Migration 018 — gated apply (founder runs; P7)

Same pattern as mig 014/015/017 — psql against the Supavisor session pooler,
single-transaction so the verification DO block rolls back on any miss.
**Hard Rule 24: apply BEFORE the 2026-05-16 enhancement code deploys to Railway.**

```bash
cd "/Volumes/Crucial X9/claude_code/NEXUS_system/products/Safecommand"
# 018 first (incident_evidence), then 019 (Phase 5.22 templates). Same conn.
psql "<SUPABASE_POOLER_CONN>" --single-transaction -v ON_ERROR_STOP=1 \
  -f supabase/migrations/018_incident_evidence.sql
# Expect: "mig 018 incident_evidence verification: ... All checks PASSED."
psql "<SUPABASE_POOLER_CONN>" --single-transaction -v ON_ERROR_STOP=1 \
  -f supabase/migrations/019_sire_seed_phase522_completeness.sql
# Expect: "mig 019 ... All checks PASSED. Every incident_type x SIRE role resolves..."
```
BR-L and BR-N need **no migration** — BR-L reuses `incident_dashboard_prompts`
(mig 014, `is_auto_trigger CHECK (= FALSE)`); BR-N reuses
`incident_evacuation_triggers.pa_text_generated` (mig 014).

Deploy order: **mig 018 → mig 019 → verify both → merge `feat/sire-day7-enhancements`
→ main → Railway/Amplify auto-deploy → fresh EAS build**. Never code-before-schema (Hard Rule 24).

## 8. Known issues / rollback

- **Amplify not serving Days 1-5** → local-dev fallback (P3 note). Not a code blocker — build verified
  green locally on `481367a`; it is an AWS webhook/IAM issue (founder: Console → app `d3t439ur25l1xc`
  → main → Redeploy this version).
- **mig 018 not applied but code deployed** → `POST /sire/incidents/:id/evidence` and the
  evidence wall 500. **Mitigation:** P7 gates this; apply mig 018 first. The photo wall
  query failure is non-fatal to the rest of `/sire/state` (evidence_wall just returns empty).
- **APK login fails** → `TEST_PHONE_PAIRS` bypass list didn't ship; verify `apps/mobile` env / config
  in the EAS build profile, rebuild.
- **Rollback:** SIRE is purely additive and gated on `enable_sire` / `has_sire_data`. Disabling the
  toggle reverts every actor to the verbatim Phase 1 v1 incident path; no migration rollback needed
  (schema is dormant-safe when unused).
