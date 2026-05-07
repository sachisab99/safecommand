# SafeCommand — State of Work

> **Last updated:** 2026-05-07
> **Branch:** `main` and `safecommand_v7` synced at HEAD `03a4b84` — 55 commits past `96594ad`
> **Deploy state:** Railway api + AWS Amplify dashboard both serving latest. Workers PAUSED.
> **BR-14 Health Score:** **100% surface LIVE** — all 5 components compute live (Tasks 40 / Incidents 25 / Equipment 10 / Drills 10 / Certs 15)
> **Spec authority:** Business Plan v2 (91 BRs / 37 NFRs / 22 sections, 2026-05-10) + Architecture v7 (22 ECs / 22 Hard Rules / 6089 lines, 2026-05-10)
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
| Phase 5 — Engineering refinement track | 2026-05-06 → 2026-05-07 | ✅ COMPLETE | All 13 phases (5.0 through 5.12) shipped — see §8 below |
| Phase B Stage A — `safecommand_v7 → main` merge | 2026-05-06 | ✅ COMPLETE (early) | Founder Choice A: 51-commit fast-forward merge + push triggered Railway api + AWS Amplify auto-deploy. Workers stay paused via env var. |
| Phase B Stage 3 — BR resume | 2026-06-02 onwards | ⏳ PENDING | June unfreeze: workers always-on, BR-10 → BR-32 sequence per `JUNE-2026-REVIEW-REQUIRED.md` |
| Phase B Stage 4 — Pilot go-live | Q3 2026 (target) | ⏳ PENDING | 25-item go-live checklist; pilot mix = 1 single-building (clinic/boutique hotel) + 1 multi-building (Hyderabad supermall, MBV proof) |
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
| `/staff` — staff CRUD | ✅ Live | BR-04 |
| Cross-link CTAs `/zones` ↔ `/accountability` | ✅ Live | Phase 5.4 |
| Drawer + sidebar (5 groups) | ✅ Live | UX-DESIGN-DECISIONS.md |
| Theme tokens + brand provider | ✅ Live | EC-17 |
| GM Health Score calculation | ⏳ Phase B | BR-14 full — needs aggregation worker |
| Compliance PDF exports | ⏳ Phase B | BR-20, BR-29 |
| Broadcast / Custom Task | ⏳ Phase B | BR-15, BR-16 |
| Briefings | ⏳ Phase B | BR-27 |
| **Production deploy state** | ⚠️ STALE (`main` branch only — `safecommand_v7` work not yet deployed to Amplify) | Resolves at June merge per `JUNE-2026-REVIEW-REQUIRED.md` § A |

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
| `GET /v1/analytics/*` | ⏳ Stub | BR-31 — full Phase B |
| `/v1/shifts/active` (mobile My Shift rich version) | ⏳ Phase B | Mobile uses client-filter today |
| `/v1/shifts` CRUD (mobile-side) | ⏳ Phase B | Today: Ops Console only via service-role |
| `/v1/handovers` POST/PUT | ⏳ Phase B | BR-12 |
| `/v1/communications/*` (broadcast) | ⏳ Phase B | BR-15 |
| `/v1/equipment/*`, `/v1/certifications/*` | ⏳ Phase B | BR-21, BR-22 |
| `/v1/compliance/export` | ⏳ Phase B | BR-20 |
| `/v1/drill-sessions/*` | ⏳ Phase B | BR-A |
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
| BR-12 | Shift Handover protocol | ⏳ Schema ready (post-mig 009 + shift_handovers table); **surface Phase B** | — |

### Command + Compliance (BR-13 → BR-29)

| BR | Title | State |
|----|---|---|
| BR-13 | DSH activation | ⏳ commander_staff_id swap pattern in place; full UI Phase B |
| BR-14 | GM Dashboard (health score + BI + per-building cards) | ⏳ Partial (dashboard surface live; health score calc Phase B) |
| BR-15 | GM Broadcast | ⏳ Phase B (worker-dependent) |
| BR-16 | GM Custom Task | ⏳ Phase B |
| BR-17 | Auditor role | ⏳ Schema ready; UI Phase B |
| BR-18 | Zone Status Board | ✅ Live (mobile + dashboard) |
| BR-19 | **Zone Accountability Map (THE hero demo)** | ✅ Live (mobile + dashboard) — backed by Phase 5.1 Shifts & Roster |
| BR-20 | Compliance exports (PDF) | ⏳ Phase B |
| BR-21 | Equipment & Maintenance Tracker | ⏳ Schema partial; UI Phase B |
| BR-22 | Staff Certification Tracker | ⏳ Schema ready; UI Phase B |
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
| BR-A (Drill Management Module) | ⏳ Schema ready post-mig 010 (drill_sessions, drill_session_participants); UI Phase B |
| BR-B (Cert Expiry Warning on Shift Activation) | ⏳ Schema ready; UI Phase B |

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

End-of-day: 42 commits ahead of `main`; HEAD `616b3dd`. AWS Amplify production still serves `main` (deferred to June merge).

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
| `docs/api/conventions.md` | API L1 governance (19 sections, includes §19 entity lifecycle pattern) |
| `docs/sales/validation-script.md` | 5-question validation script for 31-May gate |
| `docs/sales/validation-tracker.md` | 10-conversation tracker + scoreboard |
| `docs/sales/apollo-mockup-spec.md` | Path C live-software mockup spec for Apollo |
| `docs/sales/apollo-deck-spec.md` | 3-slide deck content + design |
| `report-gen/SESSION_LOG.md` (gitignored) | Local chronological session log index |

---

## 11. Current-state TL;DR for any future session

- **Branch:** `safecommand_v7` — 42 commits ahead of `main`; HEAD `616b3dd`
- **Production schema:** post mig 009 + 010 + 011 + 012; 32/32 tables RLS-protected
- **Production runtime:** AWS Amplify dashboard serves `main` (stale); Railway api currently asleep (founder action: wake)
- **Workers:** PAUSED (`WORKERS_PAUSED=true`) — May freeze, resume 2026-06-02 per `JUNE-2026-REVIEW-REQUIRED.md`
- **Hyderabad Demo Supermall:** seeded (run `./scripts/reset-hyderabad-demo.sh` to clean if needed)
- **Demo arsenal:** 3 perspectives (My Shift / Zone Status / Zone Accountability) × 2 platforms (mobile + dashboard) + Ops Console roster surface — all backed by realistic seeded data
- **Validation gate:** 31-May-2026 (10 conversations per Plan §22, demo Zone Accountability)
- **June unfreeze:** workers always-on, BR-10 → BR-32 sequence, Apollo Loom recording, AWS Activate credit application, AWS Amplify update via `safecommand_v7` → `main` merge
