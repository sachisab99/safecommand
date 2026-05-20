# SafeCommand — State of Work

> **Last updated:** 2026-05-10 (Phase 5.21 Days 1-5 SHIPPED + MERGED; Day 6 partial; Day 7 pending)
> **Branch:** `main` HEAD `652bc0b` — Days 1-5 merged via fast-forward 2026-05-09. `feat/sire-day2-day7` branch is in sync with `main` and can be deleted. Total Phase 5.21 contribution: **+4,373 lines / 21 files / 5 commits** on top of the Day 1 schema work.
> **Deploy state:** **Railway api LIVE with all SIRE endpoints** (`/v1/sire/templates/resolve`, `/v1/sire/state/:id`, `PATCH /zones/:id/state`, `PATCH /action-assignments/:id`, `POST /evacuation-triggers` — all returning 401 to unauthenticated curl = routes mounted with auth gate active). **Amplify dashboard deploy NOT yet visible** post-merge — bundle URL hashes unchanged after 17+ min polling; AWS user lacks Amplify IAM perms to investigate; founder action required via Amplify Console. Workers stay PAUSED (`WORKERS_PAUSED=true`). **Production schema:** post mig 009 + 010 + 011 + 012 + 013 + 014 + 015 + 016 + 017. All deploy via `psql --single-transaction -v ON_ERROR_STOP=1` against Supavisor session pooler (`aws-1-ap-northeast-1.pooler.supabase.com`); verification blocks all RAISE NOTICE'd "All checks PASSED".
> **Live SIRE demo incident** in production: `a4c716c6-e5e4-4fc3-8739-fff704c04e0a` (FIRE / SEV2 / FIRE_CONTAINED at T2-Parking-Entrance, Hyderabad Demo Supermall). Multi-role bootstrap fanned out 29 assignments across SH+DSH+SC+FS+GS roles + 1 zone state with assigned GS. Visible via dashboard once Amplify redeploys; via mobile once EAS Build completes.
> **BR-14 Health Score:** **100% surface LIVE** — all 5 components compute live (Tasks 40 / Incidents 25 / Equipment 10 / Drills 10 / Certs 15)
> **Two-tier admin parity:** **COMPLETE** — SH-tier write surfaces live for Equipment / Drills / Certifications / Shifts & Roster / Staff across mobile + dashboard, parallel to SC Ops Console.
> **BR-A drill management:** **COMPLETE** — Schedule / Run / Time / Document / Per-staff acknowledgement / Reason taxonomy. Audit-grade per-drill detail (timeline + participation + reasons) on mobile + dashboard. PDF rendering = Phase B (data substrate ready).
> **Spec authority (BP since 2026-05-18; Arch v9.1 since 2026-05-19):** Business Plan v9.0 (`nexus/specs/2026-05-18_prime_business-plan-v9.md` — 116 BRs / 38 NFRs / 6 ADRs / 28 sections / 1770 lines) + Architecture **v9.1** (`nexus/specs/SafeCommand_Architecture_v91_Complete.md` — 25 ECs / 26 Hard Rules / 10372 lines; **supersedes Arch v9.0**). **Supersedes v8.** See **§v9-delta** at the foot of this doc for the scope delta + the three reconciliation decisions (v9.1 spec-ratifies #1 + #2). v8 + Arch v9.0 retained for archaeology only.
> **v8 additions vs v7 (retained, unchanged by v9):** SIRE (Structured Incident Response Engine) — 10 BRs (BR-G…BR-P) Phase 5.21–5.22; EC-23 + Hard Rules 23–24; ADR 0005 + 0006. All Phase 5.13–5.18 work preserved verbatim. `docs/specs/v8-alignment-analysis.md`.
> **v9/v9.1 additions vs v8:** Evacuation Map Studio (BR-Q…BR-Z) + standards-closure BRs (BR-AA…BR-AJ) — **all Phase 5.23 (Q4 2027) / Phase B, NOT immediate-build**; NFR-38, EC-24, EC-25, Hard Rule 26; Rule 24 extended (migs 020/021/022/023 before their code; v9.1 §23). **⚠ Architecture §16 is a stale 2026-05-17 snapshot (v9.1 did NOT refresh it) — THIS doc is the live build-state authority, we are AHEAD of §16.**
>
> This document is a comprehensive snapshot of what's built, what's deployed, what's deferred, and where things sit operationally. Companion: `docs/security/POSTURE_AND_ROADMAP.md` for security/compliance posture.

---

## 1. Phase progression — at a glance

| Phase | Window | Status | Outcome |
|---|---|---|---|
| Sprint 1 — Foundation | 2026-04-27 → 2026-04-30 | ✅ COMPLETE | Multi-tenant DB + RLS isolation gate passed; Ops Console MVP; Railway api LIVE; Firebase FCM wired |
| Sprint 2 — Scheduling + Notification | 2026-04-30 → 2026-05-03 | ⏳ PARTIAL | Master-tick + scheduler logic live; FCM push wired; mobile end-to-end task complete with TEXT evidence; **paused for May freeze** |
| Phase A — v7 Reconciliation | 2026-05-04 → 2026-05-05 | ✅ COMPLETE | All 12 steps + polish; ThemeProvider mobile + dashboard + ops-console; ADR 0001/0002/0003; security history rewrite (4 secrets scrubbed); Phase B pre-writes (mig 009/010/011 source) |
| Phase B Stage 2 — Schema deploy (Path B) | 2026-05-06 | ✅ COMPLETE (early) | Mig 009/010/011 deployed to Supabase production; mig 012 RLS security fix; founder elected to deploy in May vs wait for June |
| Phase 5 — Engineering refinement track (5.0 → 5.12) | 2026-05-06 → 2026-05-07 | ✅ COMPLETE | All 13 base phases shipped — see §8 below |
| Phase 5.13 → 5.17 — Two-tier admin parity wave | 2026-05-07 | ✅ COMPLETE | SH-tier write surfaces for Equipment / Drills / Cert / Shifts / Staff across mobile + dashboard; new api routes `/v1/shifts` + `/v1/shift-instances` (7 endpoints, bulk-replace assignments, 2-person validation) — see §11 |
| Phase 5.18 — Drill audit-grade detail + per-staff acknowledgement | 2026-05-07 | ✅ COMPLETE | BR-A "missed-participant logging" delivered. Mig 013 + ADR 0004 + research doc. New api endpoints (active-for-me / acknowledge / staff-safe / set-reason). Mobile DrillDetailScreen + dashboard `/drills/[id]` + drawer banner. 6-code reason taxonomy (`OFF_DUTY` / `ON_LEAVE` / `ON_BREAK` / `ON_DUTY_ELSEWHERE` / `DEVICE_OR_NETWORK_ISSUE` / `OTHER` + NULL) — see §12 |
| Phase B Stage A — `safecommand_v7 → main` merge | 2026-05-06 | ✅ COMPLETE (early) | Founder Choice A: continuous fast-forward merges keep main current; Railway api + AWS Amplify dashboard auto-deploy from `main` on push. Workers stay paused via env var. |
| Phase B Stage 3 — BR resume | 2026-06-02 onwards | ⏳ PENDING | June unfreeze: workers always-on, BR-10 → BR-32 sequence per `JUNE-2026-REVIEW-REQUIRED.md` |
| Phase B Stage 4 — Pilot go-live | Q3 2026 (target) | ⏳ PENDING | 25-item go-live checklist; pilot mix = 1 single-building (clinic/boutique hotel) + 1 multi-building (Hyderabad supermall, MBV proof) |
| **Phase 5.21 Day 1 — SIRE schema + state machine + EC-23 fallback** | **2026-05-08** | **✅ SHIPPED (ahead of post-pilot gate)** | Founder elected early build. Mig 014 (8 SIRE tables + 1 view + 5 incidents columns + global threshold seed) + mig 015 (EC-23 tier-6 fallback for FIRE/SH; 6 mandatory + life-critical actions) deployed to Supabase production. `packages/types/src/incident-zone-states.ts` (10-state × 5-role transition matrix; 5 helper functions; ROLE_TO_ZONE_TRANSITION_KEY) exported from `@safecommand/types`. Schema dormant in production — no Phase 5.21 endpoints / mobile UI / dashboard UI deployed yet. Hard Rule 24 satisfied for any subsequent code deploys. Pre-deploy fixes caught: 3 broken view column refs + 4 over-permissive RLS policies (commit `27e44f7`). EC-23 chain verified end-to-end (in-mig DO block + out-of-band re-verification with venue/role context). See §13 for full reference. |
| **Phase 5.21 Days 2-5 — api mutations + mobile UI + dashboard UI + multi-role fan-out** | **2026-05-09** | **✅ SHIPPED + MERGED to main** | Day 2 (`d95f792`) 3 mutation endpoints + mig 017 (5 templates: FIRE+GS/FS/SC/DSH + EVACUATION+SH) + `bootstrapSireIncident.ts` multi-role fan-out service. Day 3 (`a924161`) mobile `services/sire.ts` + 840-line `SireSection` component (zone grid + 3 modal sheets + 3s polling). Day 4 (`151bbee`) dashboard `lib/sire.ts` + 480-line `SireSection` (zone grid + per-staff completion table + selective-evac modal). Day 5 (`652bc0b`) mobile `IncidentScreen` SIRE toggle + DSH demo seed. Total +4,373 lines / 21 files / 5 commits. Phase 1 v1 path preserved verbatim (`enable_sire` defaults false). All 4 apps tsc clean throughout; 45 vitest tests pass. **Live SIRE demo incident `a4c716c6-…` declared in production** with 29 multi-role assignments. See §14 for full Days 2-5 reference. |
| **Phase 5.21 Day 6 — production deploy** | **2026-05-09** | **🟡 PARTIAL** | ✅ Railway api auto-redeployed (verified: all 5 `/v1/sire/*` routes return 401 = mounted with auth gate; legacy routes still 401; `/health` 200 OK with database+firebase healthy). 🟡 **Amplify dashboard NOT yet redeployed** — bundle URL hashes unchanged after 17+ min polling post-merge; local `npm run build` succeeds cleanly so code is correct; AWS user `safecommand-api` lacks Amplify IAM perms (S3-only) — cannot read deploy status from CLI. **Founder action:** open AWS Amplify Console → app `d3t439ur25l1xc` → main branch → check job status. See `reference_amplify_dashboard_deploy_issue.md` memory for IAM policy snippet to grant + investigation playbook. |
| Phase 5.21 Day 7 — end-to-end device test | TBD post Amplify fix + EAS Build | ⏳ PENDING | EAS Build mobile binary (`cd apps/mobile && eas build --profile development --platform android` ~15-20 min) → install APK → walk through demo flow on Android (SH declares SIRE FIRE → GS taps Zone Clear → SH dashboard polls + sees update → SH triggers selective evac → audit trail rolls forward). Recorded Loom. Final demo runbook commit. |
| Phase 5.22 — SIRE polish (v8) | Post Phase 5.21 | ⏳ PENDING | PA auto-draft (English first, regional Phase B) + remaining 16 sub-type templates + SC Ops Console template editor + threshold configuration UI with standards comparison. ~2 weeks engineering. |
| Phase C — GCP migration + Roaming + Brand UI + Corporate Governance | Month 5–18 (post-pilot) | ⏳ FUTURE | Phase 2/3 work; international data residency; SOC 2 / ISO readiness |

---

## 2. Build state by surface

### Mobile (Expo React Native SDK 51+)

`apps/mobile/`

| Surface | Status | Refs |
|---|---|---|
| Phone OTP login (TEST_PHONE_PAIRS bypass) | ✅ Live | Sprint 3 native Firebase Phone Auth pending |
| Tasks list + completion (TEXT evidence) | ✅ Live | BR-06 / BR-07 partial (photo→S3 pending) |
| Incident declaration (3-tap) | ✅ Live | BR-11 mobile UI; ≤5s gate (NFR-02) Phase B |
| Manage Staff (SH/DSH only — adds DSH/SC/FS/GS/FM) | ✅ Live | BR-04 / BR-13 partial — server allow-list enforced |
| 🪪 My Shift (focused "my zones") | ✅ Live | BR-04 / BR-19 staff slice — Phase 5.2 |
| 🚦 Zone Status Board (severity-coded) | ✅ Live | BR-18 — 30s refresh per NFR-10 |
| 🗺️ Zone Accountability (THE hero demo) | ✅ Live | BR-19 — Plan §22 Rec #1 |
| 🛠 Equipment (read + Add/Edit/Deactivate via FAB+modal) | ✅ Live | BR-21 — Phase 5.10 read + Phase 5.13 writes (SH/DSH/FM) |
| 🔥 Drills (read + Schedule/Start/End/Cancel via FAB+modal) | ✅ Live | BR-A — Phase 5.11 read + Phase 5.14 writes (SH/DSH/FM/SHIFT_COMMANDER) |
| Drill detail screen — timeline + participation + reason editor + my-row Acknowledge/Mark Safe CTAs + drawer banner when active drill targets staff | ✅ Live | BR-A — Phase 5.18 (mig 013 + ADR 0004) |
| 🎓 My Certifications (read-only by design — self-attestation) | ✅ Live | BR-22 — Phase 5.12 |
| 🛡 Shifts & Roster (Create / Activate / Manage assignments / Close — command roles only, drawer hidden otherwise) | ✅ Live | BR-04 / BR-12 / BR-13 / BR-19 / BR-61 — Phase 5.16b |
| Drawer navigation (5 groups) | ✅ Live | UX-DESIGN-DECISIONS.md §4 |
| Theme tokens + brand provider | ✅ Live | EC-17 / Rule 19 |
| Offline 4hr cache | ⏳ Sprint 1 partial | BR-35, NFR-09 |
| Native push (FCM) | ✅ Wired | EC-06 |
| WhatsApp delivery | ⏳ Phase B | EC-11, blocked on Meta WABA approval |
| SMS fallback | ⏳ Phase B | EC-12, blocked on Airtel DLT |

### Dashboard (Next.js 14 + AWS Amplify ap-south-1)

`apps/dashboard/`

| Surface | Status | Refs |
|---|---|---|
| Login (Supabase Auth) | ✅ Live | EC-04 |
| `/dashboard` — venue overview | ✅ Partial | BR-14 partial; full health score Phase B |
| `/zones` — Zone Status Board (severity grid; list/building views) | ✅ Live | BR-18 — 5s refresh |
| `/accountability` — Zone Accountability (person-first roster) | ✅ Live | BR-19 — Phase 5.2 |
| `/incidents` — incidents feed | ✅ Live | BR-11 partial |
| `/staff` — staff list + Add/Edit/Deactivate (SH/DSH add; SH edit+lifecycle) | ✅ Live | BR-04 / BR-13 — Phase 5.17 (mirrors mobile StaffScreen) |
| `/equipment` — list + Add/Edit/Deactivate | ✅ Live | BR-21 — Phase 5.10 read + Phase 5.13 writes |
| `/drills` — list + Schedule/Start/End/Cancel | ✅ Live | BR-A — Phase 5.11 read + Phase 5.14 writes |
| `/drills/[id]` — audit-grade detail (timeline + participation matrix + filterable + reason editor) | ✅ Live | BR-A — Phase 5.18 (mig 013 + ADR 0004); precursor for Phase B PDF report |
| `/certifications` — list + Add/Edit/Delete with staff selector + cert-name datalist | ✅ Live | BR-22 / BR-B — Phase 5.12 read + Phase 5.15 writes (SH/DSH/FM add+edit; SH/DSH delete) |
| `/shifts` — Shifts & Roster (per-template state machine + inline floor-grouped ZoneAssignmentEditor with 2-person validation) | ✅ Live | BR-04 / BR-12 / BR-13 / BR-19 / BR-61 — Phase 5.16a |
| Cross-link CTAs `/zones` ↔ `/accountability` | ✅ Live | Phase 5.4 |
| Drawer + sidebar (5 groups) | ✅ Live | UX-DESIGN-DECISIONS.md |
| Theme tokens + brand provider | ✅ Live | EC-17 |
| GM Health Score calculation | ✅ Live | BR-14 5/5 components live (Tasks/Incidents/Equipment/Drills/Certs) |
| Compliance PDF exports | ✅ LIVE on main `a6b71e4` | BR-29 incident · BR-20 venue-wide · BR-A drill Fire-NOC · SIRE FF-3 + NABH §EM (Arch v9.1 §20.13) — all on-demand, no worker |
| Broadcast / Custom Task | ⏳ Phase B | BR-15, BR-16 |
| Briefings | ⏳ Phase B | BR-27 |
| **Production deploy state** | ✅ Auto-deploy from `main` on push (Amplify CI pipeline) | Each Phase 5 commit triggers redeploy |

### Ops Console (Next.js 14 + local dev / Vercel pending)

`apps/ops-console/` — internal SC team tool, separate auth domain (EC-14)

| Surface | Status | Refs |
|---|---|---|
| Auth gate (`proxy.ts` cookie value match) | ✅ Live | Next 16 proxy = renamed middleware |
| `/` — Operations Overview dashboard | ✅ Live | Phase 5.2 — platform-wide stats + recent venues + quick actions |
| `/venues` — venue list | ✅ Live | BR-03 / BR-26 |
| `/venues/[id]` — Floors + Zones tab | ✅ Live | BR-02, BR-18 |
| `/venues/[id]` — Schedule Templates tab | ✅ Live | BR-06 / BR-25 |
| `/venues/[id]` — Staff tab (with lifecycle deactivate/enable) | ✅ Live | BR-04, mig 011 lifecycle |
| `/venues/[id]` — **Shifts & Roster tab** (new Phase 5.1) | ✅ Live | BR-04, BR-12 schema, BR-13 schema, BR-19, BR-61 |
| Persistent TopNav (logo→home, sections, sign-out) | ✅ Live | Phase 5.2 |
| Breadcrumbs (Home → Venues → [name]) | ✅ Live | Phase 5.2 |

### API (Node.js 20 + Express + TypeScript on Railway)

`apps/api/`

| Endpoint | Status | Refs |
|---|---|---|
| `GET /health` | ✅ Live | — |
| `POST /v1/auth/{send-otp,verify-otp,refresh,logout,device-token}` | ✅ Live | EC-04 |
| `GET/PATCH /v1/venue` | ✅ Live | BR-03 |
| `GET/POST /v1/staff`, role allow-list on POST | ✅ Live | BR-04 / BR-13 partial |
| `GET /v1/zones` (list) | ✅ Live | BR-18 partial |
| `GET /v1/zones/accountability` (with floors + assignments) | ✅ Live | BR-19 backbone |
| `PUT /v1/zones/:id/status` | ✅ Live | BR-18 |
| `GET /v1/tasks` (?date=) | ✅ Live | BR-06 / BR-07 |
| `POST /v1/tasks/:id/complete` (TEXT evidence) | ✅ Live | BR-07 partial |
| `POST /v1/incidents` | ✅ Live | BR-11 partial — full ≤5s gate Phase B |
| `GET /v1/incidents`, `GET /v1/incidents/:id` | ✅ Live | BR-11 |
| `POST /v1/incidents/:id/staff-safe` | ✅ Live | BR-11 |
| `GET/POST /v1/upload/*` | ✅ Live | BR-07 (S3 presigned URL) |
| `GET /v1/analytics/dashboard` (Tasks + Incidents + Equipment + Drills + Cert rollups) | ✅ Live | BR-31 partial; BR-14 100% surface |
| `GET/POST/PATCH /v1/equipment`, `PUT /v1/equipment/:id/status` | ✅ Live | BR-21 — Phase 5.10 read; SH/DSH/FM gated |
| `GET /v1/drill-sessions`, `POST /v1/drill-sessions`, `PUT /:id/{start,end,cancel}` | ✅ Live | BR-A — Phase 5.11; SH/DSH/FM/SHIFT_COMMANDER gated |
| `GET /v1/drill-sessions/:id` (extended payload: timeline + participants + aggregates + role-filtered view), `GET /v1/drill-sessions/active-for-me`, `POST /:id/acknowledge`, `POST /:id/staff-safe`, `PATCH /:id/participants/:staffId` | ✅ Live | BR-A — Phase 5.18; PATCH gated SH/DSH/FM/SHIFT_COMMANDER; ack/safe gated to participant; active-for-me + GET /:id any auth role |
| `GET /v1/certifications`, `GET /v1/certifications/me`, `POST/PATCH/DELETE /v1/certifications/:id` | ✅ Live | BR-22 — Phase 5.12; SH/DSH/FM add+edit; SH/DSH delete |
| `GET /v1/shifts`, `GET/POST /v1/shift-instances`, `PUT /:id/{activate,close}`, `GET/PUT /:id/zone-assignments` | ✅ Live | BR-04/12/13/19/61 — Phase 5.16a; SH/DSH/SHIFT_COMMANDER gated; bulk-replace assignments with 2-person validation + venue scope check |
| `/v1/handovers` POST/PUT | ⏳ Phase B | BR-12 |
| `/v1/communications/*` (broadcast) | ⏳ Phase B | BR-15 |
| `/v1/compliance/export` · `/v1/incidents/:id/compliance-export` · `/v1/drill-sessions/:id/report` | ✅ LIVE on main `a6b71e4` | BR-20 / SIRE §20.13 / BR-A |
| `/v1/vms/*` (visitor management) | ⏳ Phase B | BR-39–56 |
| `/v1/buildings/*` (MBV) | ⏳ Phase B | BR-57–64 |

### Workers (Railway services, currently PAUSED)

| Service | Purpose | State |
|---|---|---|
| `scheduler` | BullMQ consumer `schedule-generation` — generates `task_instances` from active templates | ⏸️ Paused (`WORKERS_PAUSED=true`); master-tick at 4hr hibernation |
| `escalation` | BullMQ consumer `escalations` — escalation chain (3-level) per missed task / incident | ⏸️ Paused |
| `notifier` | BullMQ consumer `notifications` — FCM push + WhatsApp + SMS fallback | ⏸️ Paused |

**Resume target:** 2026-06-02 per `JUNE-2026-REVIEW-REQUIRED.md`. Production target master-tick = 60s (currently 4hr hibernation for cost discipline).

---

## 3. Database — schema state

### Migration history

| Spec migration | Repo file | State | Content |
|---|---|---|---|
| 001 | `001_enums.sql` | ✅ Deployed | Enums |
| 002 | `002_tables.sql` | ✅ Deployed | All Phase 1 tables |
| 003 | `003_rls.sql` | ✅ Deployed | RLS policies + 3-arg `set_tenant_context` (replaced by 4-arg in mig 009) |
| 004 | `004_indexes.sql` | ✅ Deployed | Performance indexes |
| 005 | `005_seed_templates.sql` | ✅ Deployed | Hospital/Mall/Hotel/Corporate template seeds — **mig 012 retroactively enables RLS** |
| 006 | `006_realtime.sql` | ✅ Deployed | Realtime publication |
| — | `007_schedule_time.sql` | ✅ Deployed 2026-04-30 | `start_time`, `timezone`, `secondary_escalation_chain` |
| — | `008_comm_deliveries_nullable.sql` | ✅ Deployed 2026-04-30 | comm_deliveries nullable |
| Spec 007 | `009_mbv.sql` | ✅ Deployed 2026-05-06 (Path B) + hotfix | Buildings + `building_visible()` + 4-arg `set_tenant_context` + 12 building_id columns + 5 triggers + 11 RLS refresh. **Hotfix `4fd7964`:** drop 3-arg overload to fix PostgREST PGRST203 |
| Spec 008 | `010_brand_roaming_drill.sql` | ✅ Deployed 2026-05-06 | corporate_accounts + corporate_brand_configs (powered_by CHECK) + roaming_staff_assignments (10-venue trigger) + drill_sessions/participants |
| — | `011_staff_lifecycle.sql` | ✅ Deployed 2026-05-06 | 4-state lifecycle enum + status_reason + `is_active` becomes generated column + enforce_terminated_oneway trigger |
| — | `012_rls_schedule_template_seeds.sql` | ✅ Deployed 2026-05-06 | Security patch: enable RLS on reference table flagged by Supabase linter |

### Tenant isolation summary

- **32 public tables, 32 RLS-protected** (100% coverage as of 2026-05-06)
- Tenant context: `set_tenant_context(p_venue_id, p_staff_id, p_role, p_building_id DEFAULT NULL)` — sets `app.current_venue_id`, `app.current_staff_id`, `app.current_role`, `app.current_building_id`
- MBV-aware: `building_visible(record_building_id)` function used in RLS where building scope applies (Rule 16)
- Append-only tables (no UPDATE/DELETE policy): `audit_logs`, `zone_status_log`, `incident_timeline`
- DB CHECK constraints: `corporate_brand_configs.powered_by_text = 'Platform by SafeCommand'` (EC-18 / Rule 20); `staff.status_reason` ≥3 chars for non-ACTIVE rows
- Triggers: `enforce_terminated_oneway` (compliance), `enforce_roaming_max_venues` (10-venue cap)

### Test venue inventory (local-dev convenience)

| Venue | Code | Floors / Zones / Staff | Notes |
|---|---|---|---|
| Hyderabad Demo Supermall | `SC-MAL-HYD-00012` | 4 / 12 / 3 + (6 demo seed) | Tower-prefixed naming (T1/T2/B1/G1) ready for MBV retrofit June. **Seed scripts:** `./scripts/seed-hyderabad-demo.sh` populates realistic mid-shift state for sales calls |
| CA Firm TEST-CA | (test) | — | Mobile staff-add E2E validation |

---

## 4. BR coverage matrix — Plan v2 (91 BRs)

Tagging: P1 = Phase 1 (built or scheduled May/June); P2 = Phase 2 (Roaming + Brand UI + GCP); P3 = Phase 3 (Corporate Governance).

### Foundation + Core (BR-01 → BR-12) — all P1

| BR | Title | State | Delta vs previous |
|----|---|---|---|
| BR-01 | Multi-tenant — zero cross-venue leakage | ✅ Sprint 1 + RLS gate passed | Mig 012 closes only RLS gap (reference table) |
| BR-02 | Venue identity SC-[TYPE]-[CITY]-[SEQ] | ✅ Sprint 1 | — |
| BR-03 | Operations Console (separate auth domain — EC-14) | ✅ Sprint 1 + Phase 5.2 home/nav | — |
| BR-04 | 8-role permission model (SH/DSH/SC/GM/AUD/FM/FS/GS) | ✅ Sprint 1 + role allow-list on staff add | — |
| BR-05 | Three-tier permission model | ✅ Sprint 1 | Mirrors BR-04 |
| BR-06 | Scheduled Activity Engine | ⏳ Sprint 2 partial (master-tick + computeCurrentSlot) | Workers paused; resume June |
| BR-07 | Task completion w/ evidence | ⏳ Sprint 2 partial (TEXT only) | photo→S3 pending |
| BR-08 | Escalation engine | ⏳ Phase B | Worker-dependent |
| BR-09 | FCM + WhatsApp parallel | ⏳ FCM live, WA pending Meta WABA | EC-11 |
| BR-10 | SMS fallback (90s undelivered) | ⏳ Phase B | EC-12, blocked on Airtel DLT |
| BR-11 | One-tap incident declaration | ✅ Mobile UI live; ≤5s gate Phase B | NFR-02 |
| BR-12 | Shift Handover protocol | ⏳ Schema ready; **handover surface Phase B** (shift activation + close fully shipped, see BR-13) | — |

### Command + Compliance (BR-13 → BR-29)

| BR | Title | State |
|----|---|---|
| BR-13 | DSH activation + shift commander assignment | ✅ Activate-with-commander UI live (mobile RosterScreen + dashboard /shifts, Phase 5.16a/b); auto-emergency 5-min SH-unresponsive timer Phase B (worker-dependent) |
| BR-14 | GM Dashboard (health score + BI + per-building cards) | ✅ All 5 components live (Tasks 40 / Incidents 25 / Equipment 10 / Drills 10 / Cert 15 = 100%); per-building cards Phase B post mig 009 retrofit |
| BR-15 | GM Broadcast | ⏳ Phase B (worker-dependent) |
| BR-16 | GM Custom Task | ⏳ Phase B |
| BR-17 | Auditor role | ⏳ Schema ready; UI Phase B |
| BR-18 | Zone Status Board | ✅ Live (mobile + dashboard) |
| BR-19 | **Zone Accountability Map (THE hero demo)** | ✅ Live (mobile + dashboard) — Roster loop closes end-to-end via Phase 5.16a/b: SH activates instance → assigns staff → accountability map auto-populates |
| BR-20 | Compliance exports (PDF) | ✅ LIVE (Fire NOC / NABH / Full-Audit, venue-wide, date-ranged) |
| BR-21 | Equipment & Maintenance Tracker | ✅ Live read+write (Phase 5.10 + 5.13) — mobile FAB + dashboard buttons + Add/Edit/Deactivate; SH/DSH/FM gated |
| BR-22 | Staff Certification Tracker | ✅ Live read+write (Phase 5.12 + 5.15) — dashboard /certifications full CRUD with staff selector + cert-name datalist; mobile MyCertificationsScreen kept read-only by design (self-attestation semantics); team-cert mobile surface optional follow-up |
| BR-23 | Special Events / Festival Mode | ⏳ Phase B |
| BR-24 | Visitor Safety Alert (QR opt-in) | ⏳ Phase B |
| BR-25 | Venue-type activity templates | ✅ Sprint 1 (mig 005 seed data) |
| BR-26 | Change Request workflow | ⏳ Phase B |
| BR-27 | Shift Briefing System | ⏳ Phase B |
| BR-28 | Communication audit trail | ✅ Sprint 1 (audit middleware live) |
| BR-29 | Post-incident report auto-generation (PDF) | ⏳ Phase B |

### Extended + Workflow (BR-30 → BR-38)

| BR | State |
|----|---|
| BR-30 (Governing Body) — P3 | ⏳ Phase 3 |
| BR-31 (Analytics pipeline) — P1 | ⏳ Stub; Phase B |
| BR-32 (Cross-venue analytics) — P2 | ⏳ Phase 2 |
| BR-33 (Staff gamification) — P1 | ⏳ Phase B |
| BR-34 (Controlled Area logging) — P1 | ⏳ Phase B (two-person flag exists on zones) |
| BR-35 (Offline mode 4hr cache) — P1 | ⏳ Sprint 1 partial |
| BR-36 (Multi-language English P1; HI/TE/KN P2) | ⏳ i18n keys in place; HI/TE/KN P2 |
| BR-37 (Subscription tier enforcement) — P1 | ⏳ Schema ready; gate-checks Phase B |
| BR-38 (CR fee management) — P1 | ⏳ Phase B |

### VMS (BR-39 → BR-56)

⏳ **All Phase B (June)**. Schema partial; full implementation requires worker engine + DLT/WABA.

### Multi-Building Venue (BR-57 → BR-64)

| BR | State |
|----|---|
| BR-57 to BR-64 | ⏳ Schema fully ready post-mig 009 (`building_id` nullable on every relevant table; `building_visible()`; `zones_building_sync` + `visit_inherit_building` triggers). UI surfaces Phase B. |

### Drill + Cert additions

| BR | State |
|----|---|
| BR-A (Drill Management Module) | ✅ Live (Phase 5.11 + 5.14 + 5.18) — Schedule/Run/Time/Document/Per-staff acknowledgement complete. Audit-grade `/drills/[id]` detail with timeline + participation matrix + 6-code reason taxonomy (ADR 0004) on mobile + dashboard. PDF report = Phase B (data substrate ready). drill_score in BR-14 reflects live participant data. |
| BR-B (Cert Expiry Warning on Shift Activation) | ⏳ Schema ready; cert read+write live (BR-22); the *soft warning on shift activation* hook itself remains Phase B (worker-dependent — fires when shift_instance moves to ACTIVE and pulls expiring certs for that shift's assigned staff) |

### Corporate Governance (BR-65 → BR-80) — all P3

⏳ **All Phase 3.** Schema partial post-mig 010 (`corporate_accounts`, `corporate_brand_configs`); 7-level hierarchy (Global → Country → State → City → Venue → Building → Zone) Phase 3 implementation.

### Roaming Authority (BR-R1 → BR-R5) — all P2

⏳ **All Phase 2.** Schema ready post-mig 010 (`roaming_staff_assignments` with 10-venue trigger). JWT structure + UI Phase 2.

### Enterprise Brand Enablement (BR-81 → BR-88)

| BR | State |
|----|---|
| BR-81 (corporate_brand_configs schema) | ✅ Live post-mig 010 (with CHECK on powered_by_text per EC-18 / Rule 20) |
| BR-82 (Mobile ThemeProvider) | ✅ Phase A (1574 lines theme/) — EC-17 / Rule 19 satisfied |
| BR-83 (Terminology Resolver) | ⏳ Phase 2 (useLabel hook stub; full registry Phase 2) |
| BR-84 (Role Override Display) | ⏳ Phase 2 |
| BR-85 ('Powered by SafeCommand' footer) | ✅ Phase A (DB CHECK + theme baked in) |
| BR-86 (Notification sender customisation) | ⏳ Phase 2 |
| BR-87 (Enterprise subdomain) | ⏳ Phase 3 |
| BR-88 (Report branding) | ⏳ Phase 2 |

---

## 5. NFR coverage — Plan v2 (37 NFRs)

| NFR | Title | Verified? |
|---|---|---|
| NFR-01 | Multi-tenancy isolation | ✅ RLS gate + mig 012 — 32/32 tables protected |
| NFR-02 | Incident escalation latency ≤5s | ⏳ Phase B (workers paused) |
| NFR-03 | WA → SMS fallback 90s | ⏳ Phase B |
| NFR-04 | Task completion ≤3 taps | ✅ Mobile flow validated |
| NFR-05 | Reading load critical flows max 20 words | ✅ Theme + UX-DESIGN-DECISIONS.md applied |
| NFR-06 | Device coverage (Redmi 9A / iPhone 8+) | ⏳ Pre-pilot test |
| NFR-07 | 2G/3G compatibility | ⏳ Phase B (gate 21 of 25) |
| NFR-08 | Touch targets ≥48dp | ✅ Theme `touch.minTarget` enforced |
| NFR-09 | Offline cache 4hr | ⏳ Sprint 1 partial |
| NFR-10 | Zone board refresh ≤30s | ✅ Mobile 30s polling; dashboard 5s |
| NFR-11 | India data residency | ✅ S3 ap-south-1; ⏳ Phase 2 GCP for full |
| NFR-12 | DPDP Act compliance | ⏳ Phase 2 pre-condition; Rule 12 blocks hospitals until then |
| NFR-13 | 99.5% availability | ⏳ Production gate |
| NFR-14 | 100K+ daily task triggers | ⏳ Phase B load test |
| NFR-15 | 500+ concurrent WebSocket | ⏳ Phase B |
| NFR-16 | JWT + RLS + HTTPS three-layer defence | ✅ |
| NFR-17 | Audit immutability | ✅ append-only policy on logs |
| NFR-18 | Managed services only | ✅ Railway / Supabase / Upstash / Amplify |
| NFR-19 | 16-week solo Phase 1 buildable | ✅ On track |
| NFR-20 | 70%+ cash gross margin at 20 venues | ⏳ Pricing gate |
| NFR-21 | VMS check-in ≤60s on Redmi 9A | ⏳ Phase B |
| NFR-22 | VMS offline operation | ⏳ Phase B |
| NFR-23 | ID photo SH/DSH/AUD only | ⏳ Phase B (presigned URL role-gated) |
| NFR-24 | Aadhaar masking enforced | ⏳ Phase B (gate 15 — automated nightly query) |
| NFR-25 | MBV backward compat (single-building unaffected) | ✅ Verified post-mig 009 |
| NFR-26 | MBV incident latency ≤5s | ⏳ Phase B |
| NFR-27 | MBV mobile context isolation | ⏳ Phase B (Gate 2 of 25) |
| NFR-28 | Corporate aggregation latency ≤6h | ⏳ Phase 3 |
| NFR-29 | Corporate dashboard load <3s | ⏳ Phase 3 |
| NFR-30 | Cross-account isolation | ⏳ Phase 3 |
| NFR-31 | International data residency | ⏳ Phase 3 |
| NFR-32 | Corporate SEV1 → CXO ≤30s | ⏳ Phase 3 |
| NFR-33 | Roaming venue isolation | ⏳ Phase 2 |
| NFR-34 | Brand config fetch ≤1s + 24h cache | ⏳ Phase 2 (cache stub in ThemeProvider) |
| NFR-35 | Safety-critical screens WCAG 2.1 AA | ✅ Phase A WCAG helpers in colours.ts |
| NFR-36 | Brand config isolation | ⏳ Phase 2 |
| NFR-37 | Roaming `active_venue_id` validated every request | ⏳ Phase 2 |

---

## 6. Engineering Constraints (22 ECs) — adherence summary

| EC | Title | Adherence |
|---|---|---|
| EC-01 | PostgreSQL | ✅ Supabase |
| EC-02 | RLS on every table | ✅ 32/32 |
| EC-03 | venue_id in every table + query | ✅ Schema + middleware enforced |
| EC-04 | JWT stateless auth | ✅ |
| EC-05 | Async queue for notifications | ✅ BullMQ + Upstash (paused) |
| EC-06 | Three notification channels (Push + WA + SMS) | ⏳ FCM live; WA + SMS Phase B |
| EC-07 | React Native one codebase | ✅ Expo SDK 51+ |
| EC-08 | India data residency | ⏳ Phase 2 (S3 today; GCP June) |
| EC-09 | Offline-first 4hr | ⏳ Partial |
| EC-10 | Audit logs append-only | ✅ |
| EC-11 | Meta WhatsApp Business API direct | ⏳ Pending WABA approval |
| EC-12 | Airtel DLT for SMS | ⏳ Pending registration |
| EC-13 | Idempotent writes | ✅ idempotency_key + ON CONFLICT |
| EC-14 | Ops Console separate auth domain | ✅ Different deployment + cookie |
| EC-15 | i18n keys Day 1 | ✅ Theme has useLabel; full registry Phase 2 |
| **EC-16** | building_id nullable on all MBV tables | ✅ Mig 009 enforces |
| **EC-17** | ThemeProvider in first commit | ✅ Phase A |
| **EC-18** | 'Powered by SafeCommand' non-removable | ✅ DB CHECK + footer literals |
| **EC-19** | Roaming active_venue_id validated every request | ⏳ Phase 2 |
| **EC-20** | CORP-* roles never access PII | ⏳ Phase 3 |
| **EC-21** | Raw PII never crosses borders | ⏳ Phase 3 |
| (No EC-22 in current spec) | — | — |

---

## 7. Hard Rules (22 Rules) — adherence summary

| Rule | Title | Adherence |
|---|---|---|
| 1 | No secrets in code/VC; rotate on leak | ✅ 2026-05-05 history rewrite + key migration ADR 0003 |
| 2 | venue_id in every query | ✅ enforced |
| 3 | Never modify committed migration | ✅ ADR 0001; mig 009 hotfix `4fd7964` was patching mig source pre-deploy-and-verify |
| 4 | Audit logs write-once | ✅ |
| 5 | Idempotent writes | ✅ |
| 6 | Ops Console separate auth domain | ✅ |
| 7 | Notify failures never block primary op | ✅ |
| 8 | Three notification channels before pilot | ⏳ Phase B |
| 9 | Offline 4hr tested before pilot | ⏳ Phase B |
| 10 | Zod .strict() validation | ✅ schemas package |
| 11 | i18n keys Day 1 | ⏳ Partial |
| 12 | No hospital data before Phase 2 GCP | ✅ Pilot mix per Q4 decision |
| 13 | Aadhaar number NEVER stored | ✅ Schema enforced (only `masked_aadhaar`) |
| 14 | ID photos / face photos GS/FS-blocked | ⏳ Phase B (role-gated presigned URL) |
| 15 | building_id always nullable | ✅ Mig 009 enforces |
| 16 | building_visible() in all RLS | ✅ Mig 009 RLS refresh |
| 17 | SEV1 always notifies all buildings | ⏳ Phase B (escalation worker) |
| 18 | Building-scoped incident codes include short_code | ⏳ Phase B |
| 19 | ThemeProvider first commit | ✅ Phase A |
| 20 | Powered-by hard-coded | ✅ DB CHECK + literal |
| 21 | Roaming validation double-enforced | ⏳ Phase 2 |
| 22 | CORP-* never returns PII | ⏳ Phase 3 |

---

## 8. Recent session log (2026-05-06)

| Time | Event | Commit |
|---|---|---|
| Earlier (00:30) | **Path B deploy** — migrations 009 + 010 + 011 to Supabase production | `9a52a58` |
| 19:13 | **Mig 009 hotfix** — drop 3-arg `set_tenant_context` overload to fix PostgREST PGRST203 | `4fd7964` |
| Evening | **Phase 5.0 / 5.1 work** — Zone-symmetry surfaces (mobile Zone Status + dashboard /accountability) | `7511561` |
| Evening | **Phase 5.1 — Ops Console Shifts & Roster module** | `807a255` |
| Evening | **Ops Console home + persistent TopNav + breadcrumbs** | `a77fb9d` |
| Evening | **proxy.ts auth gate documentation** + login redirect polish | `fb5d573` |
| Evening | **Phase 5.2 — Mobile MyShiftScreen** | `5b53b0a` |
| Evening | CLAUDE.md sync | `88b56c6` |
| Evening | **Phase 5.3 — Demo seed scripts** (`seed-hyderabad-demo.sh` + reset) | `eab7a8e` |
| Evening | **Phase 5.4 — Cross-link CTAs** between Zone Status + Zone Accountability | `413874a` |
| Evening | **Mig 012 — RLS security fix** on `schedule_template_seeds` (Supabase linter ERROR) | `616b3dd` |

End-of-day 2026-05-06: 42 commits ahead of `main`; HEAD `616b3dd`. AWS Amplify production still serves `main` (deferred to June merge).

### 2026-05-07 — Phase 5.13 → 5.17 two-tier admin parity wave

| Time | Activity | Commit |
|---|---|---|
| AM | **Phase 5.13 — Equipment write surfaces** (mobile EquipmentScreen FAB+modal + dashboard /equipment Add/Edit/Deactivate) | `e840ed2` |
| AM | **Phase 5.14 — Drill write surfaces** (mobile DrillsScreen FAB+ScheduleDrillModal + per-row state-driven actions; dashboard /drills + Schedule/Start/End/Cancel) | `80c6e94` |
| AM | **Phase 5.15 — Cert write surfaces** (dashboard /certifications Add/Edit/Delete with COMMON_CERT_NAMES Indian-context datalist; mobile cert service write helpers shipped for future team-cert surface) | `3a68a46` |
| Midday | **Phase 5.16a — Shift activation + zone assignments (api + dashboard)** — new `apps/api/src/routes/shifts.ts` (445 lines, 7 endpoints, requireRole SH/DSH/SHIFT_COMMANDER, bulk-replace assignments with 2-person validation) + dashboard `/shifts` route (775 lines, state-driven ShiftCards, ActivateModal, inline floor-grouped ZoneAssignmentEditor with live violation preview) + sidebar entry | `3a34ccd` |
| Afternoon | **Phase 5.16b — Mobile Roster** — `services/shifts.ts` (169 lines) + `RosterScreen.tsx` (1118 lines) with date input, state-driven ShiftCard, ActivateModal bottom-sheet, AssignmentsModal full-height sheet (floor-grouped zone cards with 2-PERSON badge, per-staff toggle pills, sticky save footer); drawer entry hidden from non-command roles | `4acc521` |
| Afternoon | **Phase 5.17 — Staff dashboard write surfaces** — closes parity. Add staff (SH/DSH; +91-enforced phone normalisation; role allow-list excluding SH), Edit (SH only; phone read-only as login identity; SH role locked), Deactivate/Reactivate (SH only) | `52ef193` |

End-of-day 2026-05-07: 61 commits ahead of `96594ad` (original); `main` and `safecommand_v7` synced at HEAD `52ef193`. AWS Amplify auto-deploys each push from `main`. tsc passing on all 4 apps after every commit.

**Two-tier admin parity matrix — COMPLETE:**

| Feature | Mobile | Dashboard | api Endpoints | BR refs |
|---|---|---|---|---|
| Equipment | ✅ 5.13 | ✅ 5.13 | Phase 5.10 | BR-21 |
| Drills | ✅ 5.14 | ✅ 5.14 | Phase 5.11 | BR-A |
| Certifications | (read-only by design — self-attestation) | ✅ 5.15 | Phase 5.12 | BR-22 / BR-B |
| Shifts & Roster | ✅ 5.16b | ✅ 5.16a | ✅ Phase 5.16a (new shifts router) | BR-04 / BR-12 / BR-13 / BR-19 / BR-61 |
| Staff | ✅ (Phase A pre-5.13) | ✅ 5.17 | (pre-existing) | BR-04 / BR-13 |

**Defence-in-depth chain confirmed across all 5 features:** UI hides write controls (or whole drawer entry, in RosterScreen's case) when role doesn't qualify → api `requireRole` returns 403 for ineligible JWT → Postgres RLS row-level enforcement → server-side Zod / allow-list validation. Every commit pure additive — read surfaces preserved for FS / GS / GM / AUDITOR.

### 2026-05-07 (later) — Phase 5.18 drill audit-grade detail + per-staff acknowledgement

| Time | Activity | Commit |
|---|---|---|
| Evening | **Industry research** — `docs/research/drill-participant-reason-taxonomy.md` (346 lines, 18 sources: ISO/NFPA/FEMA/OSHA + NABH/Telangana Fire Service Form FF-3/NDMA/BIS + DPDP Act/Industrial Disputes Act/Factories Act + 6 industry SaaS comparisons). Sales/audit/demo asset with field-tested narrative beats. Sets pattern: `docs/research/` for industry-research-backed product decisions. | `2f48a75` |
| Evening | **ADR 0004** — `docs/adr/0004-drill-participant-reason-codes.md` (205 lines): 6-code taxonomy (`OFF_DUTY` / `ON_LEAVE` / `ON_BREAK` / `ON_DUTY_ELSEWHERE` / `DEVICE_OR_NETWORK_ISSUE` / `OTHER`) + NULL = unexcused. Refines BR-A; spec unchanged. TEXT + CHECK over PostgreSQL ENUM (transactional safety). Soft-label "Did not acknowledge" decoupled from data-layer "MISSED" (DPDP/HR-safe UI; auditor-defensible data). | `85b2dd4` |
| Evening | **Mig 013** — `supabase/migrations/013_drill_participant_reason.sql` (133 lines): 4 columns + 3 CHECK constraints + RESTRICTIVE RLS policy `drill_participant_role_read_gate` + index. Deployed live to Supabase via Dashboard SQL Editor; verification block confirmed all checks. | `091aea2` |
| Night | **Phase 5.18 implementation** — 3,101 lines across 10 files. api new endpoints (active-for-me / acknowledge / staff-safe / set-reason); existing /start enhanced with hybrid on-duty determination + bulk participant enqueue (idempotent); existing /end transitions NOTIFIED→MISSED + recomputes aggregates. New mobile DrillDetailScreen + dashboard `/drills/[id]` route with timeline + participation matrix + filterable + bottom-sheet ReasonEditorModal. New `Drawer.banner` prop (generic slot reusable for future active-incident/handover/broadcast banners). TasksScreen polls /active-for-me every 30s + on every drawer open. Live-poll every 10s while IN_PROGRESS. | `96a30dd` |

End-of-day 2026-05-07: 65 commits ahead of `96594ad` (original); `main` and `safecommand_v7` synced at HEAD `96a30dd`. tsc passing on all 4 apps. AWS Amplify + Railway api auto-deployed on push.

**BR-A delivery matrix — COMPLETE:**

| BR-A facet | State | Phase / commit |
|---|---|---|
| Schedule | ✅ Live | 5.11 + 5.14 (mobile + dashboard write) |
| Run (start/end/cancel state machine) | ✅ Live | 5.11 + 5.14 |
| Time (started_at / ended_at / duration_seconds) | ✅ Live | 5.11 |
| Document (notes + audit_logs timeline) | ✅ Live | 5.11 + 5.18 (timeline surfaced on detail page) |
| Per-building separate records | ✅ Live | building_id nullable; UI scopes correctly |
| Missed-participant logging (per-staff acknowledgement + reason classification) | ✅ Live | 5.18 (mig 013 + ADR 0004) |
| Timed Fire NOC report (PDF) — on-demand | ✅ LIVE (BR-A `POST /drill-sessions/:id/report`) | Auto-generate-on-completion trigger remains Phase B (worker/June) — on-demand artifact shipped |

**Phase 5.18 specific E2E flow tested-ready:**
1. SH starts SCHEDULED drill → participants enqueued via hybrid (shift-roster first, all-staff fallback per ADR 0004) → audit_logs entry STARTED_FROM_SHIFT_ROSTER or STARTED_FROM_VENUE_ALL
2. Mobile staff sees drawer banner ("🔥 Drill in progress · Tap to acknowledge")
3. Tap banner → DrillDetailScreen → tap [✓ Acknowledge] → status=ACKNOWLEDGED
4. CTA changes to [🛡 I AM SAFE] → tap → status=SAFE_CONFIRMED → banner disappears
5. SH ends drill → unattested staff flip to MISSED → aggregate counts recompute
6. SH on dashboard `/drills/[id]` → filter "Needs reason" → tap [Set reason] → 6-chip taxonomy → "On duty elsewhere" + notes "ICU3 — patient on vent" → Save
7. Detail page reflects: EXCUSED chip + reason + setter attribution + audit_logs entry
8. Auditor opens `/drills/[id]` URL → sees full timeline + per-staff classification + compliance metrics → printable

---

## 9. Operational tooling inventory

`scripts/`

| Script | Purpose |
|---|---|
| `seed-hyderabad-demo.sh` / `.sql` | Populate Hyderabad Demo Supermall with realistic mid-shift state for sales calls |
| `reset-hyderabad-demo.sh` / `.sql` | Undo seed — marker-filtered DELETE only |
| `seed-test-tasks.sh` | Generate task_instances on demand (May testing bridge while workers paused) |
| `pause-workers.sh` / `resume-workers.sh` / `worker-status.sh` | Worker lifecycle (Railway) |
| `rls_isolation_verify_v2.sql` / `rls_isolation_test.sql` / `rls-isolation-proof.mjs` | Cross-venue RLS leak detection (Sprint 1 Gate 1) |

---

## 10. Documentation inventory

| Doc | Purpose |
|---|---|
| `CLAUDE.md` (Safecommand root) | Product context for Claude Code — branch state, BRs, ECs, Hard Rules, current focus |
| `JUNE-2026-REVIEW-REQUIRED.md` (Safecommand root) | Phase B unfreeze action sequence — single source of truth |
| `AWS-process-doc-IMP.md` (Safecommand root) | Infra reference + decision log |
| `UX-DESIGN-DECISIONS.md` (Safecommand root) | UX architecture + 5-phase responsive plan |
| `DAILY-OPS.md` (Safecommand root) | Daily start/end-of-day routine |
| `upstash_redis.md` (Safecommand root) | Redis cost analysis + tick-rate tiers |
| `docs/STATE_OF_WORK.md` (this file) | Comprehensive snapshot |
| `docs/security/POSTURE_AND_ROADMAP.md` | Security + compliance posture + roadmap |
| `docs/adr/0001-migration-renumbering.md` | ADR — repo migrations 009/010 vs spec 007/008 offset |
| `docs/adr/0002-safecommand-v7-branch.md` | ADR — branch isolation rationale |
| `docs/adr/0003-supabase-publishable-secret-keys.md` | ADR — opaque-token migration 2026-05-05 |
| `docs/adr/0004-drill-participant-reason-codes.md` | ADR — Phase 5.18 drill reason taxonomy |
| `docs/api/conventions.md` | API L1 governance (19 sections, includes §19 entity lifecycle pattern) |
| `docs/research/drill-participant-reason-taxonomy.md` | Industry research backing ADR 0004 — sales/audit/demo asset (18 sources, 6 SaaS comparisons, demo talking points) |
| `docs/sales/validation-script.md` | 5-question validation script for 31-May gate |
| `docs/sales/validation-tracker.md` | 10-conversation tracker + scoreboard |
| `docs/sales/apollo-mockup-spec.md` | Path C live-software mockup spec for Apollo |
| `docs/sales/apollo-deck-spec.md` | 3-slide deck content + design |
| `report-gen/SESSION_LOG.md` (gitignored) | Local chronological session log index |

---

## 11. Current-state TL;DR for any future session

- **Branch:** `main` and `safecommand_v7` synced at HEAD `96a30dd` — 65 commits past `96594ad` (original Phase A handoff point)
- **Production schema:** post mig 009 + 010 + 011 + 012 + 013; 32/32 tables RLS-protected; mig 013 deployed via Supabase Dashboard SQL Editor 2026-05-07 (verification block confirmed 4 columns + 3 CHECK constraints + 1 RESTRICTIVE policy + 1 index)
- **Production runtime:** Railway api + AWS Amplify dashboard auto-deploy from `main` on push (via Amplify CI pipeline). Workers paused.
- **Workers:** PAUSED (`WORKERS_PAUSED=true`) — May freeze, resume 2026-06-02 per `JUNE-2026-REVIEW-REQUIRED.md`. Posture changes June 2026 from cost-discipline → emergency-only kill switch (per Q5 decision).
- **Hyderabad Demo Supermall:** seeded (run `./scripts/reset-hyderabad-demo.sh` to clean if needed). Use this venue to test Phase 5.13–5.18 surfaces end-to-end.
- **Two-tier admin parity:** COMPLETE for the 5-feature scope (Equipment / Drills / Cert / Shifts / Staff). Mobile RosterScreen drawer entry hidden for non-command roles; dashboard /shifts shows read-only banner.
- **BR-A drill management:** COMPLETE — schedule / run / time / document / per-staff acknowledgement. Audit-grade detail on mobile + dashboard. PDF rendering = Phase B (data substrate ready).
- **Demo arsenal:** 3 perspectives (My Shift / Zone Status / Zone Accountability) × 2 platforms (mobile + dashboard) + Ops Console roster surface + venue-dashboard-side write surfaces for SH/DSH operating in the field + audit-grade `/drills/[id]` deep-dive — all backed by realistic seeded data
- **Validation gate:** 31-May-2026 (10 conversations per Plan §22, demo Zone Accountability + drill audit-grade detail)
- **June unfreeze:** workers always-on (`WORKERS_PAUSED=false`, `MASTER_TICK_INTERVAL=60000`), BR-10 → BR-32 sequence, Apollo Loom recording, AWS Activate credit application. Branches already synced — June merge step is a no-op confirmation.

**Active testing checklist (2026-05-07 → 2026-05-08, while sales prep is happening):**
1. Dashboard `/shifts` — Create instance → Activate (commander selector) → Manage assignments (toggle pills, 2-PERSON validation) → Save → Close. Verify Zone Accountability map populates from saved assignments.
2. Dashboard `/staff` — Add staff (validate +91 phone enforcement, role allow-list excludes SH), Edit name+role (phone disabled), Deactivate → Reactivate.
3. Dashboard `/equipment`, `/drills`, `/certifications` — Add/Edit/Delete flows. Confirm Health Score Breakdown reflects changes.
4. **Phase 5.18 drill detail E2E (highest priority — sales-critical for NABH/Fire NOC pitch):**
   a. SH starts a SCHEDULED drill from `/drills` → click row → land on `/drills/[id]` → confirm participants enqueued (timeline shows STARTED_FROM_SHIFT_ROSTER or STARTED_FROM_VENUE_ALL)
   b. As staff on mobile (different phone/account) → open Drawer → see "🔥 Drill in progress" banner → tap → DrillDetailScreen → tap [✓ Acknowledge] → tap [🛡 I AM SAFE]
   c. As SH back on `/drills/[id]` → see live timeline + status flips (10s poll) → end drill → unattested staff flip to MISSED
   d. Filter "Needs reason" → tap [Set reason] on a missed staff → 6-chip modal → select "On duty elsewhere" + notes "ICU patient on vent" → Save
   e. Confirm EXCUSED chip + reason + setter attribution appears
   f. Print page → confirm PDF-ready layout
5. Mobile `RosterScreen` — same flow as dashboard /shifts but on phone form-factor (drawer → OPERATIONS → Shifts & Roster). Hidden for non-command roles.
6. Mobile `EquipmentScreen`, `DrillsScreen` write modals — bottom-sheet UX validation on physical device.
7. **Defence-in-depth (Phase 5.13–5.18 chain):** log in as GROUND_STAFF → confirm: drawer "Shifts & Roster" hidden; "Set reason" buttons hidden on `/drills/[id]`; participation matrix shows "your row only"; direct API call to `PATCH /drill-sessions/:id/participants/:staffId` returns 403 from `requireRole`.

**Operational notes:**
- **Next 16 Turbopack cache reset** if dev-server errors with "Failed to open database" / "invalid digit found in string": `rm -rf apps/dashboard/.next && npm run dev`. Common after large code changes (Phase 5.18 = 3,101 lines / 10 files).

---

## 12. Phase 5.18 — Drill audit-grade detail (full reference)

> Fold-out section. Authoritative implementation reference — companion to ADR 0004 + research doc.

### Schema additions (mig 013, deployed 2026-05-07)

`drill_session_participants` gains 4 nullable columns:

| Column | Type | Purpose |
|---|---|---|
| `reason_code` | TEXT (CHECK 6 values) | Non-acknowledgement reason — taxonomy from ADR 0004 |
| `reason_notes` | TEXT NULL | Free-text detail; ≥10 chars REQUIRED when `reason_code='OTHER'` (CHECK enforces) |
| `reason_set_by` | UUID NULL → staff(id) | Audit trail — who classified |
| `reason_set_at` | TIMESTAMPTZ NULL | Audit trail — when classified |

Plus 3 CHECK constraints (taxonomy values; OTHER ≥10 chars; audit-triplet consistency) + 1 RESTRICTIVE RLS policy `drill_participant_role_read_gate` (command roles + AUDITOR + GM see all; others see only own row) + 1 index on (staff_id, drill_session_id) for `/active-for-me` hot path.

### api endpoints (Phase 5.18)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/v1/drill-sessions/:id` | any auth | Extended payload — drill + participants (with staff + reason setter joined) + audit_logs timeline + live aggregates + role-filtered view |
| GET | `/v1/drill-sessions/active-for-me` | any auth | Drawer-banner data — IN_PROGRESS drills where requester is participant in NOTIFIED/ACKNOWLEDGED state |
| PUT | `/v1/drill-sessions/:id/start` | SH/DSH/FM/SHIFT_COMMANDER | Hybrid on-duty enqueue — shift-roster first, all-staff fallback (per ADR 0004); audit_logs STARTED_FROM_* entry |
| PUT | `/v1/drill-sessions/:id/end` | SH/DSH/FM/SHIFT_COMMANDER | NOTIFIED→MISSED transition + recompute aggregates from live participant rows |
| POST | `/v1/drill-sessions/:id/acknowledge` | any auth (must be participant) | NOTIFIED→ACKNOWLEDGED, idempotent; computes ack_latency_seconds |
| POST | `/v1/drill-sessions/:id/staff-safe` | any auth (must be participant) | ACKNOWLEDGED→SAFE_CONFIRMED (or NOTIFIED with auto-ack), idempotent |
| PATCH | `/v1/drill-sessions/:id/participants/:staffId` | SH/DSH/FM/SHIFT_COMMANDER | Set/clear reason — validates OTHER ≥10 chars; sets audit triplet |

### `is_excused` derivation (single source of truth)

```typescript
function isExcused(p: DrillSessionParticipant): boolean {
  if (p.status === 'SAFE_CONFIRMED' || p.status === 'ACKNOWLEDGED') return true;
  if (p.reason_code === null) return false;
  if (p.reason_code === 'OTHER') {
    return (p.reason_notes ?? '').trim().length >= 10;
  }
  return true; // OFF_DUTY / ON_LEAVE / ON_BREAK / ON_DUTY_ELSEWHERE / DEVICE_OR_NETWORK_ISSUE
}
```

Used by `GET /:id` aggregate counts (`excused_count` / `unexcused_count`). Phase B BR-A PDF report reads same function.

### UI surfaces

**Mobile `DrillDetailScreen.tsx`** (1,133 lines):
- Header card: drill type / status / scheduled / duration / safe%
- Notes card (when `drill.notes` set)
- "My row" callout when requester is participant + drill IN_PROGRESS — inline [✓ Acknowledge] + [🛡 I AM SAFE] CTAs
- Compliance metrics tiles
- audit_logs timeline (vertical with iconography)
- Participation matrix (filterable: All / Needs reason / per-status), per-staff status pill, ack/safe times, reason chip + notes + setter attribution, [Set reason] button (SH/DSH/FM/SHIFT_COMMANDER)
- ReasonEditorModal — bottom-sheet 6-chip selector with hint text per code, conditional notes textarea, Save/Clear/Cancel
- Live-poll every 10s while IN_PROGRESS

**Mobile drawer banner** (`Drawer.banner` prop on theme/Drawer.tsx — generic slot reusable for future active-incident/handover/broadcast banners):
- TasksScreen polls `/active-for-me` every 30s + on every drawer open
- Banner shows when active drill targets staff: title + subtitle + CTA label adapts to participant_status (NOTIFIED → "Acknowledge", ACKNOWLEDGED → "Mark me safe")
- Tap banner → navigates to DrillDetailScreen for that drill
- Per founder direction: banner only for now; multi-channel (FCM + WhatsApp + SMS) lands when BR-09/BR-10 unblock

**Dashboard `/drills/[id]/page.tsx`** (818 lines):
- Same content shape as mobile, two-column desktop layout (timeline left / participation right)
- Filter chips above table
- Inline ReasonEditorModal mirroring mobile UX
- Print affordance (Phase B BR-A delivers proper PDFKit-rendered report from same data)

**Dashboard `/drills` list:**
- Each row now wraps a `<Link href="/drills/[id]">` for client-side navigation
- Action buttons (Start/End/Cancel) get `e.preventDefault()` + `e.stopPropagation()` to keep them functional inside Link wrapper

### Defence-in-depth chain (Phase 5.18 specific)

```
UI hides write controls (canSetParticipantReason gate)
  ↓
api requireRole 403 (PATCH endpoint requires SH/DSH/FM/SHIFT_COMMANDER)
  ↓
Postgres RLS RESTRICTIVE policy from mig 013
  (SELECT visibility — command roles + AUDITOR + GM see all; others see own row)
  ↓
DB CHECK constraints (chk_reason_code_value, chk_other_requires_notes,
                      chk_reason_consistency)
  ↓
Hand-validation in api PATCH handler (mirrors DB CHECK for clearer error)
```

### Known gaps + Phase B candidates

- **Historical drills have no participant rows.** Pre-Phase-5.18 drills (3 demo drills + any real ones from Phase 5.11) show "Per-staff acknowledgement tracking begins…" message in detail view. Aggregate counts from `drill_sessions.total_*` columns still display via `legacy_*` aggregate fields.
- **Timed Fire NOC report (PDF)** — ✅ on-demand LIVE (BR-A); auto-generate-on-completion trigger still Phase B (worker/June).
- **Multi-channel drill ack delivery** — drawer-banner-only today; FCM + WhatsApp + SMS land when BR-09/BR-10 unblock.
- **Cross-drill analytics view** ("comparison vs last 4 drills") — Phase 5.19 candidate post-validation; reason-code aggregation reveals systemic gaps (e.g. `DEVICE_OR_NETWORK_ISSUE` rate per zone → signal-survey action item).
- **`staff.drill_exempt_until DATE`** — for permanent exemptions (wheelchair / late-pregnancy mobility); Phase B at staff-record level, not per-drill reason.

---

## 13. Phase 5.21 Day 1 — SIRE schema + state machine + EC-23 fallback (full reference)

**Status:** ✅ SHIPPED 2026-05-08, ahead of the originally-gated "post-pilot validation" window in v8 §16. Founder explicitly elected early build. Schema is in production but dormant: no Phase 5.21 endpoints / mobile UI / dashboard UI deployed yet, so existing operations are unaffected (additive-only DDL). Hard Rule 24 satisfied for all subsequent code deploys.

**Day 1 commit chain on `origin/safecommand_v7`:**
- `69adf46` feat(sire): mig 014 schema + state transition matrix (Phase 5.21 Day 1)
- `27e44f7` fix(mig 014): pre-deploy schema validation + RLS tightening
- `ffccdc3` feat(sire): mig 015 — global FIRE+SH default template (Day 1 gate)

### 13.1 Files shipped

**`supabase/migrations/014_sire_engine.sql`** (746 lines after pre-deploy fixes):
- Architect's 10-object SIRE schema per `docs/specs/SafeCommand_Phase521_Clarifications_Resolved.md`.
- ALTER TABLE `incidents` — 5 new columns: `incident_subtype` (32-value CHECK; nullable), `is_drill` (NOT NULL DEFAULT FALSE), `has_sire_data` (NOT NULL DEFAULT FALSE; gates IDS v2), `resolved_templates` (JSONB; immutable audit snapshot), `escalated_from_drill_id` (FK to `drill_sessions`).
- 8 new tables: `incident_zone_states` (live state, UPSERT with optimistic lock), `incident_zone_state_log` (append-only Hard Rule 4), `incident_evacuation_triggers` (immutable per-decision audit), `incident_action_templates` (per-role per-tuple), `incident_action_assignments` (status-aware ASSIGNED→IN_PROGRESS→DONE/SKIPPED/BLOCKED), `incident_response_actions` (evidence records for DONE only), `incident_threshold_configs` (4-column forward-compat scope; 1 global default seeded), `incident_dashboard_prompts` (BR-L; `is_auto_trigger=FALSE` CHECK-enforced per Hard Rule 23).
- 1 view: `corp_incident_aggregates` (`WITH security_invoker = false`; aggregate-only NO PII; isolation enforced at api middleware).
- RLS policies, indexes (incl. `idx_iaa_pending` partial index for SLA worker), environment + verification blocks at top + bottom.

**`supabase/migrations/015_sire_seed_fire_sh_global_template.sql`** (229 lines):
- EC-23 mandatory tier-6 (global+parent) fallback for FIRE/SH.
- One row in `incident_action_templates` (NULL venue, NULL venue_type, FIRE, NULL sub-type, SH, version 1, is_active TRUE) with 6 mandatory + life-critical actions.
- Action content: (1) Acknowledge declaration + open command channel — 30s VERBAL VENUE; (2) Dispatch GS to life-safety sweep — 60s VERBAL VENUE; (3) Notify external Fire Service — 120s NOTE EXTERNAL; (4) Assess severity + decide evacuation scope — 180s NOTE VENUE; (5) Coordinate PA broadcast + multi-channel fan-out — 240s NOTE VENUE; (6) Brief responder on arrival; transfer command — null SIGNATURE EXTERNAL.
- Aligned with NFPA 1620 + NFPA 101 + NABH §EM + NDMA Fire Safety Guidelines.
- Embedded DO-block verification simulates the api template-resolver query (synthetic venue + HOSPITAL + FIRE + FIRE_CONTAINED + SH → must land on tier 6 with 6 actions; RAISE EXCEPTION rolls back the seed if not).

**`packages/types/src/incident-zone-states.ts`** (289 lines):
- `IncidentZoneState` — 10-state union type (UNVALIDATED / SWEEP_IN_PROGRESS / ZONE_CLEAR / NEEDS_ATTENTION / EVACUATION_TRIGGERED / EVACUATING / EVACUATION_COMPLETE / SH_CONFIRMED_CLEAR / LOCKED_DOWN / INACCESSIBLE).
- `ZoneTransitionRole` — 5-role subset (GS / FS / SC / SH / DSH) actually authorised to drive zone transitions.
- `ROLE_TO_ZONE_TRANSITION_KEY` — maps full StaffRole names to short matrix keys.
- `VALID_TRANSITIONS` — 10 states × 5 roles = 50-entry matrix encoding each role's permitted next-state set per current state.
- 5 helper functions: `isValidZoneTransition()` (server + client guard), `getValidTransitions()` (UI button rendering), `requiresReasonNote()` (NEEDS_ATTENTION / INACCESSIBLE / LOCKED_DOWN), `requiresEvidence()` (EVACUATION_COMPLETE photo), `isTerminalState()` (SH_CONFIRMED_CLEAR).
- 2 display maps: `ZONE_STATE_LABEL` (English fallback strings; i18n keys handled at component layer), `ZONE_STATE_COLOUR` (theme-token-mapped severity colours).
- Critical rule encoded: GS cannot transition `EVACUATION_TRIGGERED → ZONE_CLEAR` (false-green prevention; architect §3 R1). SH/DSH only can release LOCKED_DOWN.
- Re-exported from `@safecommand/types/src/index.ts`. tsc clean on all 4 apps post-export.

### 13.2 Pre-deploy gates caught (and fixed before applying to production)

**Gate 1 — view column refs (3 errors):**
- `corp_incident_aggregates` originally referenced `v.venue_type`, `v.state`, `v.country` which don't exist on `venues` (actual column is `v.type`, enum `venue_type_enum`; state/country are Phase 3 BR-79 work).
- Replaced with `v.type::TEXT AS venue_type` + `NULL::TEXT AS state` + `NULL::TEXT AS country` (placeholders for forward-compat). Updated GROUP BY to drop `v.state`, `v.country` and use `v.type`.
- Without this fix, `CREATE OR REPLACE VIEW` would have failed inside the migration's `--single-transaction` wrap, rolling back all 8 table creations + 5 column additions + seed.

**Gate 2 — RLS permissiveness (4 policies):**
- Architect's literal `service_role_write USING (TRUE) WITH CHECK (TRUE)` on `incident_action_templates` + `incident_threshold_configs`, and `service_role_insert WITH CHECK (TRUE)` on `incident_zone_state_log` + `incident_evacuation_triggers`, would have allowed any `authenticated` Supabase client to write directly. (Supabase grants the `authenticated` role default INSERT/UPDATE/DELETE on the public schema; RLS is the gate.)
- Tightened to existing project conventions (mig 003 patterns):
  - Templates + thresholds: split into `sc_ops_insert` / `sc_ops_update` / `sc_ops_delete` policies, each gated by `is_sc_ops()` (mirrors `templates_insert` on `schedule_templates`).
  - Append-only logs: `venue_scoped_insert WITH CHECK (venue_id = current_venue_id())` (mirrors `audit_logs` / `incident_timeline` / `zone_status_log`).
- The api uses service_role which bypasses RLS, so api operations are unaffected. The fix only closes the direct-supabase-client write path for non-SC-Ops authenticated users.

### 13.3 Architect Day 1 acceptance gate — SATISFIED

> "Seed one global template immediately after migration for FIRE + SH role. Verify the 5-step resolution chain returns it before building any other endpoint."

EC-23 6-tier specificity (most → least specific):
1. venue+sub-type
2. venue+parent
3. venue-type+sub-type
4. venue-type+parent
5. global+sub-type
6. **global+parent** ← Day 1 row

Without the tier-6 row, an SH declaring an unanticipated FIRE sub-type would have an empty resolved-actions response — violating EC-23's "always resolve to SOMETHING" guarantee.

**In-mig verification (DO block at bottom of mig 015):** synthetic input → tier 6 hit, 6 actions resolved, template id `4d74b72d-b896-4b3d-b66c-c28e41985ba6`. RAISE EXCEPTION on any deviation rolls back the seed.

**Out-of-band verification (post-apply):** set `app.current_venue_id` to a real venue UUID + `app.current_role = 'SH'` + `app.is_sc_ops = 'false'`; same chain query returns the same template id. Confirms RLS `template_read_all` policy permits venue users to read NULL-venue rows (which is required for the EC-23 fallback to work for any venue).

### 13.4 Days 2-N — pending founder direction

- **Day 2** — api endpoint scaffolding: PATCH `/v1/incidents/:id/zones/:zoneId/state` (zone state machine driver; uses `VALID_TRANSITIONS` from `@safecommand/types`); GET `/v1/incidents/:id/sire-state` (live grid for SH dashboard); POST `/v1/incidents/:id/evacuation-triggers` (selective + full evacuation; writes immutable `incident_evacuation_triggers` row + fans out notifications); PATCH `/v1/incident-action-assignments/:id` (status driver: ASSIGNED → IN_PROGRESS → DONE/SKIPPED/BLOCKED); GET `/v1/sire/templates/resolve` (5-step EC-23 chain endpoint for snapshot at incident declaration).
- **Day 3** — mobile IncidentDetailScreen v2: 10-state zone grid (live Realtime); 3-button staff action (SAFE+CLEAR / NEEDS_ATTENTION / TRIGGER_EVACUATION); drawer banner extension when staff has assigned actions; per-role action checklist screen.
- **Day 4** — dashboard `/incidents/[id]` SIRE extension: selective evacuation modal (multi-select zones from grid → reason note → submit); zone state grid (mirrors mobile; SH command surface); per-role completion view (who's done what); CORP aggregate panel (Phase 3 hook, off by default).
- **Day 5+** — remaining 15 priority sub-type templates per founder's Phase 5.21 list (FIRE: 4 / MEDICAL: 2 / SECURITY: 2 / EVACUATION: 5 / STRUCTURAL: 2 / OTHER: 1). Seeded per-role per-sub-type via additional migrations OR via SC Ops Console template editor (Phase 5.22 builds the editor; Day 5+ may use migrations until then).

### 13.5 Operational notes

- **Schema dormant in production:** until Day 2+ endpoints land, the SIRE tables are not read or written by any deployed binary. Existing incident declarations continue using the Phase 1 binary "I AM SAFE" model (`has_sire_data=FALSE` is the default for any new row). This means the Day 1 schema change is zero-risk to live operations.
- **Hard Rule 24 inversion-proofed:** because the schema deployed first, any subsequent Phase 5.21 endpoint deploy can land on `main` without "tables don't exist" 500s. The Hard Rule 24 enforcement is honoured at the operational level.
- **Merge-back from `safecommand_v7` to `main`:** Day 1 commits don't change runtime behaviour, so the merge can happen at any convenient point — there's no rush. Recommended: merge before Day 2 work begins so the api endpoints can be authored on a clean main with the types package + schema visible.

---

## 14. Phase 5.21 Days 2-7 build state (full reference)

**Status:** Days 1-5 SHIPPED + MERGED to main 2026-05-09. Day 6 partial. Day 7 pending.

### 14.1 Commit chain on main

| Commit | Day | Description | Lines |
|---|---|---|---|
| `251f4ab` | 1 | api foundation: vitest + 31 transition matrix tests + 14 templateResolver tests + GET endpoints + POST /incidents extension | +750 |
| `d95f792` | 2 | 3 mutation endpoints + mig 017 (5 templates: FIRE+GS/FS/SC/DSH + EVACUATION+SH) + bootstrapSireIncident multi-role fan-out | +1,371 |
| `a924161` | 3 | mobile services/sire.ts + 840-line SireSection (zone grid + 3 modal sheets + 3s polling) | +1,081 |
| `151bbee` | 4 | dashboard lib/sire.ts + 480-line SireSection (zone grid + per-staff completion table + selective-evac modal) | +688 |
| `652bc0b` | 5 | mobile IncidentScreen SIRE toggle + DSH staff seed (out-of-repo) | +146 |

**Total: +4,373 lines / 21 files / 5 commits.** Phase 1 v1 path preserved verbatim throughout.

### 14.2 Production state post-deploy

**Schema (mig 014/015/016/017 all deployed):**
- 8 SIRE tables · 1 view · 5 incidents columns · 6 global+parent action templates seeded
- Hyderabad Demo Supermall: 20 active staff (SH=2, DSH=1, SC=1, FS=3, GS=13)

**Live SIRE demo incident:**
- ID: `a4c716c6-e5e4-4fc3-8739-fff704c04e0a`
- FIRE / SEV2 / FIRE_CONTAINED at T2-Parking-Entrance
- 1 zone state (UNVALIDATED, GS = TEST_DEMO_Security_S01)
- 29 assignments: SH/DSH/SC/FS each 6 actions · GS 5 actions · all status=ASSIGNED
- 0 evacuation triggers (none yet)

**Railway api LIVE (verified):**
```
GET  /health                                       → 200 OK · database+firebase healthy
GET  /v1/sire/templates/resolve                    → 401 (route mounted with requireAuth)
GET  /v1/sire/state/:id                            → 401 (route mounted)
PATCH /v1/sire/incidents/:id/zones/:zoneId/state   → route mounted
PATCH /v1/sire/action-assignments/:id              → route mounted
POST /v1/sire/incidents/:id/evacuation-triggers    → route mounted
GET  /v1/incidents (legacy)                        → 401 (no regression)
GET  /v1/zones, drill-sessions, equipment, etc     → 401 (no regression)
```

### 14.3 Day 6 follow-up needed (Amplify deploy stalled)

- Bundle URL hashes on `https://main.d3t439ur25l1xc.amplifyapp.com` unchanged after 17+ min polling
- Local `npm run build --workspace=apps/dashboard` succeeds cleanly (all 14 routes generated)
- AWS user `safecommand-api` is S3-only (no `amplify:GetApp` / `amplify:ListJobs` / `amplify:StartJob`)
- **Founder action:** open AWS Amplify Console → app `d3t439ur25l1xc` → main branch → latest job
  - If "Failed": paste build logs to me; I fix from here
  - If "In Progress": wait
  - If no job triggered: click "Redeploy this version"
  - Or: grant Amplify IAM perms to `safecommand-api` user (policy in `reference_amplify_dashboard_deploy_issue.md`)
- **Workaround until Amplify is fixed:** run dashboard locally
  ```bash
  cd "/Volumes/Crucial X9/claude_code/NEXUS_system/products/Safecommand"
  npm run dev --workspace=apps/dashboard
  # then open http://localhost:3000/incidents/a4c716c6-...
  ```

### 14.4 Day 7 — end-to-end device test (founder action)

Pending: EAS Build mobile binary
```bash
cd "/Volumes/Crucial X9/claude_code/NEXUS_system/products/Safecommand/apps/mobile"
eas build --profile development --platform android
# ~15-20 min cloud build; install fresh APK on Android device
```

After EAS APK installed + Amplify dashboard fixed, demo flow:
1. SH on dashboard `https://main.d3t439ur25l1xc.amplifyapp.com/incidents/a4c716c6-…` → see live zone grid + completion table
2. GS on Android phone (Firebase test number `+917032701272` is at a different venue; use mobile login as +919999000003 (Anil Reddy, GS at Hyderabad) once mobile binary is fresh — note: TEST_PHONE_PAIRS bypass for non-Firebase test numbers needs verification on the new mobile binary)
3. GS taps assigned zone in mobile → state action sheet → ZONE_CLEAR / NEEDS_ATTENTION / EVACUATION_TRIGGERED
4. SH dashboard polls every 3s → state update visible within ~3s
5. SH triggers selective evacuation → zone flips to EVACUATION_TRIGGERED · row added to evacuation_triggers audit list
6. Recorded Loom

### 14.5 Operational notes for next session

- **JWT for service-side curl tests:** local `.env` JWT_SECRET is dev placeholder; use Railway env JWT_SECRET. Pull via `railway variables --service api --kv | grep JWT_SECRET`.
- **Test JWT generation pattern (working):**
  ```js
  // node -e with @safecommand workspace's jsonwebtoken module
  const jwt = require('jsonwebtoken');
  jwt.sign({sub, venue_id, staff_id, role}, prodSecret, {expiresIn: '1h'});
  ```
- **Hyderabad demo venue UUID:** `096a3701-beb0-4ffe-9e74-43af3c26e09f`
- **TEST_DEMO_Security_Head staff_id:** `8782b217-e023-4b37-8d63-3593069fa33f` (phone +919000012300)
- **TEST_DEMO_Security_S01 staff_id:** `7bc9c06d-2e74-4f25-a749-399e71366bd5` (GS, phone +919000012301)
- **TEST_DEMO_Deputy_Security_Head staff_id:** `538d36ad-2837-4049-85bc-c952d08c4bec` (DSH, phone +919000012302; seeded Day 5)
- **T2-Parking-Entrance zone_id:** `0ba4d669-0746-4f64-999d-56ed11385578` (the demo zone for the active incident)

---

## 15. Session checkpoint — 2026-05-17 · SIRE COMPLETE & LIVE (5 PRs merged)

**Headline:** Phase 5.21 + 5.22 SIRE is engineering-complete, deployed to production, validated end-to-end (non-hospital scope). `main @ 29daba9` — local == origin, tree clean. No engineering blockers.

### 15.1 What shipped this session — 5 PRs (all merged, linear history)

| PR | Title | Core content |
|---|---|---|
| #1 | complete SIRE for go-live — Phase 5.22 + Day 7 bundle | migs **018** (incident_evidence, append-only) + **019** (EC-23 completeness: 30 global+parent, 0 gaps, 6 Tier-B divergence sub-types) applied to prod; BR-L (Hard Rule 23, 3-layer); BR-N PA auto-draft; Rec 1 context-aware buttons; Rec 2b photo wall; Rec 3a one-tap Initiate; **crash hardening** (`normalizeSireState` + `ErrorBoundary`); structured **error-codes catalog** (`@safecommand/types`) |
| #2 | S3 presigned PUT 403 fix | dropped signed `ServerSideEncryption` header from presign (was making `x-amz-sse` a required signed header → every upload 403'd; latent since storage.ts written — BR-07 never verified). Encryption-at-rest via S3 bucket default. + upload diagnostics |
| #3 | dashboard zone-evidence parity | desktop zone-state evidence: paste-URL → real file upload; `uploadPhotoToS3Web` split; + `sire-delivery-validation.md` |
| #4 | dashboard command-desk declaration | `DeclareIncidentButton` on /incidents + /dashboard, role-gated (SH/DSH/SC/GM/FM = api requireRole), full mobile parity; reuses `POST /v1/incidents`. Dashboard never had declare — mobile-by-design per BR-11; this is deliberate additive |
| #5 | SIRE default-on + non-SIRE declarer hardening | `enable_sire` default **ON** all types (mobile+dashboard), opt-OUT toggle (was opt-in/default-off — Phase 5.21 transitional, obsolete post-EC-23). **api landmine fixed:** GM/FM/AUDITOR declarers snapshot against SH global floor instead of 500-ing |

### 15.2 Build / deploy state

| Surface | State |
|---|---|
| Railway **api** | LIVE `main @ 29daba9` · `/health` 200 (db+firebase ok) · POST /incidents 401 (gated, no 500) · legacy routes 401 (no regression) |
| AWS Amplify **dashboard** | LIVE (auto-deploy from main; confirmed working by founder) |
| **mobile** | dev-client via Metro (current code); standalone EAS build still optional/pending |
| Supabase **schema** | migs 014–019 applied & verified in prod (`All checks PASSED`) |
| **workers** | `WORKERS_PAUSED=true` — SIRE live via API/UI/3s-poll; notification *dispatch* → June 1 (ADR 0005, zero cost) |
| tsc / build | api+mobile+dashboard+types all clean; dashboard prod build ✓ 14 routes |

### 15.3 Engineering decisions / landmines defused

- **Version-skew crash** (new client JS vs old api → `state.active_prompts.map` of undefined): fixed structurally via service-boundary `normalizeSireState()` (coerce all arrays []) + `ErrorBoundary` + error-code catalog. Not a one-off patch.
- **S3 SSE signed-header**: presign must NOT bake `ServerSideEncryption`; rely on bucket default encryption. (Confirm/IaC `sc-evidence-prod` default SSE — open recommendation.)
- **GM/FM declarer 500**: declarer-role template snapshot was over-strict; SIRE roles get templates (mig 019), non-SIRE declarers now snapshot vs SH floor. Prevented SIRE-default-on from breaking GM/FM declaration.
- **SIRE opt-in was obsolete**: Phase 5.21 default-off was a templates-incomplete safety; mig 019 closed EC-23 → SIRE is now the default, opt-OUT.

### 15.4 E2E verification (2026-05-17)

- **My side:** git integrity (5 PRs merged, `29daba9`, clean) · prod liveness (health 200, routes 401 no-500/no-regression, dashboard up) · code-health (tsc×4 + dashboard prod build clean) · static path audit (declare→bootstrap→banner→grid→3-button→evac→audit→photo coherent).
- **Operator side:** Day 7 Blocks A–E "all worked fine" (3-button ⇄ ≤3s sync, selective evac+audit, photo wall both ways, Hard Rule 23 gate held, defence-in-depth). Fresh declare `7F77B1C6` (SH +919000012300) → **SIRE active by default** confirmed.

### 15.5 Test incident IDs

- `a4c716c6-…` — original demo SIRE incident (early api bootstrap)
- `423093EB…` — legacy (declared pre-#5, SIRE toggle off → `has_sire_data=false`; immutable, correct history)
- `7F77B1C6…` — first SIRE-default-on incident (post-#5; confirms default)

### 15.6 Open / deferred — NOT engineering

- **June 1**: worker unfreeze → notification dispatch live (ADR 0005, `JUNE-2026-REVIEW-REQUIRED.md`); NFR-02/32 latency gates only.
- Optional: EAS standalone build + Loom (distributable + sales asset).
- BR-N regional language → Phase B (English live; i18n keys emitted).
- Hospital-specific sub-types (OBSTETRIC/MASS_CASUALTY/HAZMAT) → hospital pilot under Rule 12 (degrade safely to parent meanwhile).
- Confirm/IaC `sc-evidence-prod` S3 default encryption (defence-in-depth for the PR #2 approach).

### 15.7 Authoritative references

- **`docs/specs/sire-delivery-validation.md`** — per-BR/EC/Rule delivery matrix (reflects all 6 PRs incl. BR-29). Single source of truth for "what's done".
- **`docs/specs/phase-5-21-day7-walkthrough.md`** — acceptance checklist (P1–P10 / W1–W21 / R1–R6 / D1–D9).

### 15.8 Post-SIRE next feature — BR-29 Post-Incident Report PDF (2026-05-17, PR #7)

Founder-elected next build after SIRE close-out. Server-rendered PDFKit
report (`apps/api/src/services/incidentReport.ts` + `POST /v1/incidents/:id/report`,
role-gated SH/DSH/SC/GM/AUDITOR): summary + timeline + (SIRE) zone-state
history + per-role action completion + evacuation-trigger audit + photo
ledger; 'Powered by SafeCommand' footer (EC-18/Rule 20); S3 + presigned
GET; upserts `incident_reports` (no migration — table existed since mig
002). Dashboard `IncidentReportCard` replaces the Phase-B placeholder.
pdfkit added to apps/api. No worker dependency. The SIRE capstone /
audit artifact for the 31-May validation conversations + pilots.
**Build state:** ✅ PR #7 MERGED 2026-05-17 (batch with #8–#10).

### 15.9 BR-31 Incident & Drill Analytics — Phase 5.19 (PR #8, merged 2026-05-17)

`GET /v1/analytics/safety` (analytics.ts, role-gated, venue-scoped):
incident mix + avg resolution, SIRE action-completion %, evacuation
counts, zone hotspots, drill ack-rate + recency, reason-code
systemic-gap breakdown (DEVICE_OR_NETWORK_ISSUE = dead-zone signal),
8-week trend. Dashboard `/analytics` (Tailwind bars, no chart lib) +
`lib/analytics.ts` + nav entry. Single-venue only (BR-32 cross-venue =
SC-Ops/P2, out). No worker/migration; additive.

### 15.10 BR-12 Shift Handover — dashboard + mobile (PR #9 + #10, merged 2026-05-17)

`/v1/handovers` (handovers.ts, mounted index.ts): POST server-assembles
an **immutable** snapshot (zones `current_status` + open incidents) so
it can't be client-forged; PUT `/:id/accept` records the authority
transfer; GET incl GM/AUDITOR. Dashboard `/handovers` (PR #9) + mobile
`HandoverScreen` + command-gated drawer (PR #10). Reuses `shift_handovers`
(mig 002) — no migration; no worker; **shift_instances lifecycle left to
the existing /v1/shift-instances endpoints (non-breaking)**.
Briefing/notification fan-out on handover = June (worker-dependent).

### 15.11 Post-SIRE feature batch — merged & verified (2026-05-17)

PRs **#7 BR-29 · #8 BR-31 · #9 BR-12(dash) · #10 BR-12(mobile)** merged
to `main` in dependency order (#10 after #9). `main @ 9378c8b`.
**Integrated-tree verification (the never-built-together check):**
@safecommand/types build clean · api + mobile + dashboard tsc all clean
*on the combined main* · dashboard prod build clean (**16 routes** incl
`/analytics`, `/handovers`, `/incidents/[id]`). No cross-feature
regression — the independence analysis held (only nav-config touched by
2 PRs, non-overlapping hunks, git auto-merged). Railway api + Amplify
redeploy in flight at reconciliation time (handovers route 404→401 once
live). All four are additive, no migration, no worker; runtime gaps
(notification dispatch / handover fan-out) remain June-gated (ADR 0005).

---

## §v9-delta — Business Plan v9 + Architecture v9 adoption (2026-05-18; aligned 2026-05-19)

> **Why this section exists:** v9 is the new spec authority. This section is the durable, in-repo record of *what v9 changed*, *what it did NOT change*, and *the three reconciliation decisions* — so a future session never has to re-derive them or get misled by the v9 Architecture's stale §16 snapshot.

### What v9 added (vs v8)

| Area | Delta | Phase | Build-now? |
|---|---|---|---|
| **Evacuation Map Studio** (BP §9 / Arch §21) | 10 BRs **BR-Q…BR-Z** — Konva.js canvas authoring (ISO 23601), ISO 7010+NFPA 170 symbol library, 7-jurisdiction validation engine, IMDF-compatible GeoJSON canonical, per-posting personalised PDFs (Puppeteer), **Live Mode** rendering `incident_zone_states` | **5.23 (Q4 2027)** + Phase B | **NO** |
| **Standards-Closure** (BP §3/§22 / Arch §22) | 10 BRs **BR-AA…BR-AJ** — annual EAP, safety-committee log, hospital horizontal evac, refuge accountability, PA hardware bridge, AMC registry, MSDS repo, **LMS (BR-AH)**, tabletop (BR-AI), NABH 15 QIs | 5.23 / B / P4 | **NO** |
| Constraints | **NFR-38** (map render perf), **EC-24** (IMDF canonical, never proprietary), **EC-25** (floor-plan currency 9mo/12mo), **Hard Rule 26** (IMDF never proprietary), **Hard Rule 24 extended** (mig 020 before Map Studio code) | 5.23 | n/a (recorded now) |
| Counts | 101→**116 BR**, 37→**38 NFR**, 23→**25 EC**, 24+R25→**26 Rules**, 20→**28 BP sections** | — | — |
| Commercial | Map Studio tier-gated + Premium Map Pack ₹5K/mo; competitive moat 11→12 layers; new **Phase 5.23** (8-week block) | — | — |

### What v9 did NOT change (continuity)

- **Phase 1 + SIRE (BR-G…BR-P) are unchanged.** Every LIVE feature (SIRE, BR-29 report, BR-31 analytics, BR-12 handover, BR-23 festival, unified Incidents) remains valid and correctly aligned.
- **Nothing in v9 is pull-forward-eligible like SIRE was.** Earliest Map Studio work = Phase 5.23 / Q4 2027, gated behind the June 2026 unfreeze + pilots. The June-unfreeze / Phase B sequence is unchanged.
- **No migration to apply now. No code to write now.** mig `020` is Phase 5.23.
- **SIRE is the dependency root for BR-W** (Live Mode renders `incident_zone_states` on the map) — the completed SIRE work is what makes the v9 moat feature buildable later.

### The three reconciliation decisions (validated 2026-05-19)

1. **Hard Rule 25 — NOT a collision.** v9 Architecture §13 Rule 25 ("every `CREATE VIEW` REVOKEs anon/authenticated") is *semantically identical* to our codebase Rule 25 (mig 016, 2026-05-08). **v9 formally codifies what was our codebase amendment** — spec & codebase now agree; Rule 25 is unchanged and now spec-backed. Hard Rule 24 is *extended* (mig 014 *and* mig 020 before respective code). v9's only genuinely-new rule is **Rule 26 = IMDF canonical, never proprietary** (mirrors EC-24).
2. **Migration numbering.** BP v9's "Migration 012_evacuation_map_studio.sql" is a *logical label only*. Real file = **`020_evacuation_map_studio.sql`** (012–019 consumed). Arch v9 §16.2 self-reconciles to 020 and is authoritative; BP is not. ADR 0001 holds the forward entry (amended 2026-05-19).
3. **Build-state authority.** v9 Architecture §16 is a point-in-time snapshot (`main @ 9378c8b`, 2026-05-17, "PR #7–10"). **Deployed reality is AHEAD of it.** THIS doc + `docs/specs/sire-delivery-validation.md` are the live build-state authority; never treat v9 §16 as current HEAD. Per Hard Rule 3 + ADR 0001, deployed migrations are immutable & authoritative — the spec reconciles to the codebase, never the reverse.

### Documents aligned in the safe-subset (2026-05-19)

- ✅ `products/Safecommand/CLAUDE.md` — title v9; spec-authority block (incl. 3 reconciliation decisions); controls table (Map Studio row); 116 BR header + BR-Q…Z + BR-AA…AJ tables; NFR-38; EC-24/EC-25; Hard Rule 24 extended + Rule 26; reference files; sprint-focus v9 callout
- ✅ `docs/adr/0001-migration-renumbering.md` — 2026-05-19 amendment (mig 012-logical → 020-file; next-free-integer rule)
- ✅ `docs/STATE_OF_WORK.md` — header authority lines + this §v9-delta
- ✅ `docs/specs/sire-delivery-validation.md` — v9 supersession note + BR-W dependency cross-ref
- ✅ `docs/specs/navigation-ia-review.md` — parked nav review (Map Studio future nav surfaces noted)
- ✅ memory `v9-supersedes-v8-reconciliation-flags.md`

### Deferred (the post-requirements increment — NOT in safe-subset)

- ADR 0007 ("Adopt v9 — Evacuation Map Studio + Global Standards") — full adoption ADR; layers on when founder's updated technical requirements land.
- `docs/specs/evacuation-map-studio-spec.md` — internal Phase 5.23 engineering spec; authored when Phase 5.23 nears / reqs land.
- Full rewrite of CLAUDE.md "Current sprint focus" stale 2026-05-10 snapshot — folds into the same increment.

### v9.1 update (2026-05-19) — architecture point-release

Founder supplied **Architecture v9.1** (`SafeCommand_Architecture_v91_Complete.md`, supersedes Arch v9.0; BP stays v9.0 — it is the procurement-facing doc the architecture was aligned *to*). Incorporates the Nexus Prime Architecture Validation Report (8.5/10, approve-with-corrections); all P0+P1 fixes applied.

- **No count change** — 116 BR / 38 NFR / 25 EC / 26 Rule / 6 ADR (+4 ADR placeholders). CLAUDE.md counts unchanged.
- **Reconciliation #2 now SPEC-RATIFIED.** v9.1 §1.3b adopts the repo file-number as authoritative and declares the `009`…`019` → `020`/`021`/`022`/`023` sequence. The spec↔repo offset is **eliminated for 020+** (architecture & repo numbering coincide; only legacy BP "012" is a logical label). Parallels how #1/Rule 25 became spec-codified. ADR 0001 amended 2026-05-19 (2nd amendment).
- **New: migs 021/022/023** (Arch v9.1 §23, ~890 lines) for standards-closure BRs — `021_standards_closure_p1` (BR-AA/AB/AD/AF/AG), `022_lms_integration` (BR-AH), `023_drill_tabletop_nabh_qis` (BR-AI / BR-AJ-view). All Phase 5.23 / Phase B; Hard Rule 24 (schema-before-code) applies to each. **Still NOT immediate-build.**
- **Reconciliation #1 (Rule 25) + #3 (build-state §16 stale) unchanged.** v9.1 did *not* refresh §16 — it remains the 2026-05-17 snapshot; THIS doc + sire-delivery-validation remain the live authority (we are ahead).
- Other v9.1 fixes (informational, no repo-doc impact): Section 12 BR/NFR map completed to 116/NFR-38; BR-Y export templates (5 formats); Premium Map Pack flag enforcement; Live-Mode 3-building/360-zone SEV1 budget; §1.3b ADR detail.
- **Docs re-aligned 2026-05-19 (v9.1):** CLAUDE.md (authority block → Arch v9.1; reconciliation #1/#2 → spec-codified; Standards-Closure table → mig 021/022/023 column; Rule 24 extended to 020-023; controls row; reference files), ADR 0001 (2nd amendment), this §v9.1 note, sire-delivery-validation (Arch v9.1), memory.

**Bottom line:** v9 / v9.1 is a forward-looking superset. The safe-subset alignment is complete and v9.1-current; **no code, no migration, no Phase 5.23 work** is due now. Await founder's updated technical requirements for the ADR-0007 / spec-doc increment.

---

## §compliance-export-family — BR-20 + BR-A + SIRE FF-3/NABH-§EM (LIVE, 2026-05-19)

> **Authoritative record of the compliance-export build wave + its validation.**
> `main @ a6b71e4` (pushed). Three additive features merged; integrated-verified.

### What shipped (all additive — zero migration, zero worker, on-demand)

| Feature | Endpoint | Commit |
|---|---|---|
| **BR-20** venue-wide compliance export — Fire NOC / NABH / Full-Audit, date-ranged | `GET /v1/compliance/export?type=&from=&to=` | `f397f0a` |
| **BR-A** per-drill Fire NOC report | `POST /v1/drill-sessions/:id/report` | `772020f` |
| **SIRE FF-3 + NABH §EM** (Arch v9.1 §20.13) — from live SIRE schema | `POST /v1/incidents/:id/compliance-export?format=TELANGANA_FF3\|NABH_EM` | `35f0cc1` |

Report family is now complete: BR-29 (one incident) · BR-20 (venue-wide) · BR-A (per-drill) · SIRE §20.13 (FF-3 / NABH §EM authority forms). All reuse the proven PDFKit → S3 → presigned-GET pattern; `storage.ts` carries `putReportObject` / `putComplianceReportObject` / `putDrillReportObject` + shared `presignGetUrl`.

### Validation results (2026-05-19) — PASS

- **No hardcoding** — evidence-based scan across all changed app files: zero UUIDs / venue codes / phone numbers / non-AWS URLs / localhost / test-venue IDs in feature code. (Only pre-existing env-driven `storage.ts:getPublicUrl` `?? 'ap-south-1'` default — not a defect.)
- **Tenant-correct (Rule 2 / EC-03 / NFR-01)** — every `db.from(...)` venue-derived from `req.auth.venue_id` (JWT): venue via `.eq('id', venueId)`, data via `.eq('venue_id', venueId)`, SIRE tables double-scoped `.eq('incident_id', …).eq('venue_id', …)`. Participants transitively scoped via venue-checked drill id (matches existing `drills.ts`/`analytics.ts`). **A newly-onboarded venue → its own `venue_id` → fully isolated reports.**
- **MBV-safe (NFR-25 / EC-16)** — zero `building_id`/`building_visible` refs → no pre-mig-009 breakage, single-building unaffected, additively extensible when buildings land (Phase B). Reports aggregate live by `venue_id`, so **expanding a venue with new buildings / zones / equipment / drills / staff / incidents flows in automatically** — no hardcoded counts or lists.
- **Spec-faithful note** — FF-3's "Telangana Fire Service" label is the Arch v9.1 §20.13 jurisdiction format (user-selected), not a tenant hardcode.
- **Integrated "never-built-together" check** — on consolidated `main @ a6b71e4`: `apps/api` + `apps/dashboard` + `apps/mobile` `tsc --noEmit` **all clean**; all endpoints present + mounted; no cross-feature regression; 3-way `storage.ts` merge resolved as engineered (non-overlapping hunks).

### Branch hygiene note (resolved)

A mid-session branch-switch had left BR-A + SIRE comingled uncommitted in one working tree (only BR-20 was committed). Reconstructed into three clean single-commit branches off `main` by disjoint file sets, merged in dependency order (BR-20 ff → BR-A → SIRE), zero conflicts. Feature branches fully merged (deletable). Stale `feat/sire-day2-day7` from an earlier session also shows merged — left untouched pending cleanup decision.

### Flagged, NOT taken (Prime decision pending)

~~Pulling forward Architecture v9.1 §23 standards-closure registers (Safety Committee / AMC / MSDS) is feasible but requires a deliberate **spec-migration split** (v9.1 `021` bundles 5 tables, 2 of which FK into the unbuilt Map-Studio mig-020), a **founder-applied psql migration** (Hard Rule 24), and committing **Q4-2027-phased schema early**. Not taken unilaterally — awaits explicit go-ahead.~~

**RESOLVED 2026-05-19:** §23 pull-forward authorised. Mig `020_standards_closure_p1.sql` written, applied by founder via Supabase SQL Editor (3 tables, RLS true), API layer (`/v1/safety-committee` / `/v1/amc-contracts` / `/v1/msds`) shipped + merged + pushed to `main`. Dashboard/mobile passes pending. Full record: §compliance-export-family above.

---

## §shift-roster-architecture — Phase 5.24 wave (BR-AK…BR-AU + ADR-0007), 2026-05-20

> Authoritative record of the shift-roster requirements + architecture intake + BR-AR pull-forward.

### Inputs received
- **Shift Roster Requirements v1.1** (Nexus Prime, 2026-05-20) — `nexus/specs/2026-05-20_shift-roster-requirements.md` (891 lines). 11 BRs (BR-AK…BR-AU), Factories-Act/PSARA/NABH-§HRM regulatory frame, 7-pattern rotation library, swap/leave workflows, multi-shift flexibility (BR-AR), MBV-aware scoping, compliance-export PDF, ADR-0011 proposed.
- **Shift Roster Architecture v1.0** (Nexus Forge, 2026-05-20) — `nexus/specs/SafeCommand_ShiftRoster_Architecture_v1.md` (2674 lines). All 8 engineering refinements from the v1.1 review applied; all 3 reconciliation flags resolved correctly (ADR-0011→0007, mig 024+→021/022/023, ADR-0004 repo-authoritative). Mig 021 BR-AR DDL production-ready.

### Decisions captured 2026-05-20

| Item | Decision | Artefact |
|---|---|---|
| **ADR numbering** for handover-decoupling | Spec said "0011"; repo next-free = **0007** per ADR 0001 invariant | `docs/adr/0007-decouple-handover-from-daily-assignment.md` |
| **Migration numbering** for shift-roster wave | Spec said "024+"; repo next-free post-§23 = **021 / 022 / 023** | ADR 0001 amendment 2026-05-20 |
| **Spec ↔ Repo authority principle** elevated to durable rule | Reservation tables are documentation hints, not bindings; repo wins on conflict | ADR 0001 amendment 2026-05-20 |
| **BR-AR pull-forward** — multi-shift flexibility (founder-specified) | Wave 1 of Phase 5.24 — ALTER `shifts` only, additive, ~30 SQL lines | `supabase/migrations/021_shifts_multi_shift_breaks.sql` (written 2026-05-20; ⏳ founder psql-apply) |
| **BR-AK / AL / AM / AN / AO / AP / AQ / AS / AT / AU** | Phase 5.24 wave 2 — Q1 2028 per arch timing (migs 022 + 023) | Spec'd; not yet written |
| **ADR-0007: BR-12 contract preserved verbatim** | Pattern engine is a new *producer* of `shift_instances` / `shift_assignments`; handover code path unchanged at API level; one internal refactor (read `shifts.min_handover_minutes` post mig 021) | ADR-0007 |

### Build state (2026-05-20)

| Component | State |
|---|---|
| **Migration 021** (`shifts_multi_shift_breaks.sql`) | ✅ Written. ⏳ Awaiting founder psql-apply (Hard Rule 24 gate). Additive ALTER shifts: `breaks JSONB`, `min_handover_minutes INT`, `description TEXT`, `is_overnight BOOLEAN GENERATED`, `venue_type_default BOOLEAN`. Verification block embedded. |
| **ADR-0007** (`docs/adr/0007-...`) | ✅ Written. Accepted (implementation gated by mig 021). |
| **ADR 0001 amendment 2026-05-20** | ✅ Written. Spec↔repo authority principle + shift-roster wave numbering + ADR-0011→0007 reconciliation + §23 mig 020 deploy confirmation. |
| **CLAUDE.md** | ✅ BR-AK…BR-AU registered + Phase 5.24 controls row + reference entries for ADR-0007 / Shift Roster Architecture v1 / Shift Roster Requirements v1.1. |
| **BR-AR API extension** (`/v1/shifts` accept new fields) | ⏳ Hard Rule 24 — code waits for mig 021 apply confirmation. |
| **BR-12 handover-service internal refactor** (`services/handover-notification.ts` reads `shifts.min_handover_minutes`) | ⏳ Same Hard Rule 24 gate. |
| **Ops Console / dashboard editor** for breaks + handover window + description | ⏳ Same gate. |
| **BR-AK…BR-AU pattern engine** (migs 022 + 023 + worker + UI) | ⏳ Phase 5.24 Q1 2028 per arch doc; not written. |

### Doc-hygiene follow-up (low priority)

The BR-AA…BR-AJ table (CLAUDE.md ~line 286) still lists Mig as "021"/"022"/"023" per v9.1 §1.3b. Post-§23 pull-forward + the shift-roster wave's claim on 021–023, those Mig refs need updating to reflect: **BR-AB/AF/AG → mig 020 (DEPLOYED)**; **BR-AA/AD remain in a future deferred migration (post Map Studio mig — they FK floor_plans/evacuation_annotations)**; **BR-AH (LMS) / BR-AI (drill TABLETOP) / BR-AJ (NABH QIs view) renumber to 024+ per ADR 0001 next-free-integer**. Captured here as the canonical follow-up; not blocking.

### Founder action when ready (Hard Rule 24 hand-off)

Same mechanism as mig 020 (yesterday) — Supabase SQL Editor or psql session pooler:

```
psql "<supabase session-pooler url>" --single-transaction -v ON_ERROR_STOP=1 \
     -f supabase/migrations/021_shifts_multi_shift_breaks.sql
```

Expected: `NOTICE: Migration 021 PASSED: shifts extended with 5 columns; is_overnight is GENERATED`. Additive-only; existing rows auto-receive backwards-compatible defaults (`breaks = []`, `min_handover_minutes = 15`, `is_overnight` auto-computed); bit-identical behaviour to today until BR-AR code deploys. Aug-2026 per the architecture's bandwidth plan; can be earlier per founder preference.

**Once applied, paste the NOTICE (or say "applied")** → I build the BR-AR code wave: BR-12 internal refactor + `/v1/shifts` field surface + Ops Console editor + dashboard editor + tests. Same cadence as the §23 standards-closure API pass.

### Wave 1 update (2026-05-20) — BR-AR LIVE end-to-end

Mig 021 applied 2026-05-20 (5 cols on `shifts`, `is_overnight` GENERATED ALWAYS, RLS intact). Code waves shipped same day + 2026-05-21:
- `4f93e87` API field surface + Ops Console server-action validation (parseBreaksJson + overnight-aware validateBreaks).
- `2239306` Ops Console UI: BreaksEditor client component + edit-form extension + table-row badges.
- `2c76224` Dashboard `/shifts` ShiftCard badges + description subtitle (read-only cosmetic).
- `6ef5797` Fix regression: `parseBreaksJson` + `validateBreaks` made module-private (Next.js `'use server'` rule — every export must be async). `next build` verification gate added to my discipline post this learning.

End-to-end BR-AR validated: DB CHECK → server-action validation → UI editor → dashboard display. Backward-compat by construction (all 5 fields optional; venues that never touch a shift see no change).

### Wave 2 update (2026-05-21) — Pattern-engine pull-forward AUTHORISED

Founder authorised the full Phase 5.24 wave 2 (pattern engine) on 2026-05-21 after validating BR-AR + observing the live dashboard's "Today's Roster" is still the legacy per-day bulk-assign workflow (which is what the pattern engine replaces).

| Item | State |
|---|---|
| **Migration `022_roster_engine.sql`** | ✅ WRITTEN. 6 tables (rotation_cycle_library + 7 seeded rotations · roster_patterns · roster_cycle_positions · staff_roster_assignments · staff_unavailability with gist EXCLUDE · shift_swap_requests with partial UNIQUE + in-row state + audit_logs precedent) + `btree_gist` extension + verification. ⏳ Founder psql-apply. |
| **Migration `023_coverage_rules.sql`** | ✅ WRITTEN. 1 table (`coverage_rules`) using `staff_role_enum` from mig 001 + UNIQUE NULLS NOT DISTINCT scope key + RLS + 2 indexes + verification. ⏳ Founder psql-apply. |
| **Pre-deploy adaptations** | building_id/building_visible omitted pre-MBV (3 tables affected); swap-request FK → `staff_zone_assignments` (Reconciliation Flag #4); `btree_gist` extension auto-created. All documented in mig file headers + ADR 0001 amendment 2026-05-21. |
| **ADR 0001 amended 2026-05-21** | ✅ mig 021 deploy confirmation + wave-2 migs 022/023 record + pre-deploy adaptations + Reconciliation Flag #4 |
| **API + worker + UI for BR-AK/AL/AM/AN/AO/AP/AQ/AS/AT/AU** | ⏳ Hard Rule 24 — gated on migs 022 + 023 apply. Next pass after founder confirms applied: pattern CRUD api routes + materialisation worker (BR-AO; uses BullMQ + Upstash Redis; worker-paused until June 1 per ADR 0005 — can write the worker now, activation gates on the June unfreeze) + Ops Console pattern editor + dashboard pattern surface + mobile staff self-service (request swap/leave). Per arch §11 build sequence. |

**Founder action — apply migs 022 + 023 (order matters: 022 first, then 023):**

```
psql "<supabase session-pooler url>" --single-transaction -v ON_ERROR_STOP=1 \
     -f supabase/migrations/022_roster_engine.sql
# Expected: NOTICE 'Migration 022 PASSED: 6 tables (5 tenant-RLS + 1 global), 7 seeded rotations, btree_gist ready'

psql "<supabase session-pooler url>" --single-transaction -v ON_ERROR_STOP=1 \
     -f supabase/migrations/023_coverage_rules.sql
# Expected: NOTICE 'Migration 023 PASSED: coverage_rules table with RLS + staff_role_enum + UNIQUE scope'
```

Or paste each file sequentially into the Supabase Dashboard SQL Editor (same flow as migs 020 + 021). Both additive; existing operations unaffected; both dormant until pattern-engine code ships.
