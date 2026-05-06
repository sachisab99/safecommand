# SafeCommand — Claude Code Context (v7)

> **Spec authority (2026-05-10):** `nexus/specs/2026-05-10_prime_business-plan-report-gen.md` (Business Plan v2 — 91 BRs, 37 NFRs, 22 sections) and `nexus/specs/2026-05-10_SafeCommand_Architecture_v7_Complete.md` (Architecture v7 — 22 ECs, 22 Hard Rules, 6089 lines). These supersede all prior versions. When this file diverges from the spec, the spec wins.
>
> **Working branch:** `safecommand_v7` (Phase A scaffold work). `main` is paused-pilot-ready. ADR 0002 captures branching rationale. Merge-back target: before June 2 unfreeze.
>
> **Build state:** Architecture v7 §16 explicitly preserves Sprint 1 work (BR-01 → BR-09). Workers paused (`WORKERS_PAUSED=true`); master-tick = 4 hr (hibernation). Resume from BR-10 in June after migrations 009 + 010 land.

---

## 🔴 Critical operational controls — read before any infra/cost work

| Control | Where | What it does |
|---------|-------|--------------|
| **`WORKERS_PAUSED` env var** | Railway Console → service → Variables tab (per worker) | When `=true`, scheduler/escalation/notifier idle without crash. **First thing to check if "system seems broken"** — pushed/scheduled/escalated jobs all stop until resumed. **June 2026 onward: repurposed as emergency kill switch only** (per Q5 decision); always-on workers are the default. See `reference_workers_paused_kill_switch.md` memory or `AWS-process-doc-IMP.md` §11.4.0. |
| **Scheduler master-tick interval** | `apps/scheduler/src/index.ts` `TICK_MS` constant | Currently 4 hours (hibernation, May 2026 budget freeze). **Production target = 60_000 ms.** Change to 60s before any pilot/demo/June unfreeze. |
| **JUNE-2026 review required** | `JUNE-2026-REVIEW-REQUIRED.md` at product root | Mandatory checklist on first June 2026 work session. Verifies May spend, decides workers always-on, applies AWS Activate credits, fixes Railway worker Start Commands (per `2026-04-30-19:30_fix.md` G11). |
| **Migration numbering offset** | ADR 0001 (`docs/adr/0001-migration-renumbering.md`) | Repo migrations 007/008 already deployed (schedule_time + comm_deliveries_nullable). Spec migration 007 (MBV) → repo `009_mbv.sql`. Spec migration 008 (brand+roaming+drill) → repo `010_brand_roaming_drill.sql`. **Hard Rule 3 forbids modifying deployed migrations.** Citations going forward: "Spec Migration N (repo: `0NN_*.sql`)". |
| **Supabase opaque-token keys** | ADR 0003 (`docs/adr/0003-supabase-publishable-secret-keys.md`) | 2026-05-05 migrated from legacy `anon`/`service_role` JWTs to `sb_publishable_*`/`sb_secret_*` opaque tokens. Env var names unchanged (`SUPABASE_SERVICE_ROLE_KEY` holds `sb_secret_*`; `SUPABASE_ANON_KEY` holds `sb_publishable_*`). **Do NOT click "Reset JWT secret"** (would mass-logout all users). Phase B June: shard to per-service keys. |
| **GitHub history rewrite (2026-05-05)** | Backup tag `backup/pre-history-rewrite-2026-05-04` on origin | Pre-rewrite SHA `772fd85` preserved for ≥30-day recovery window (suggested deletion 2026-06-04). Post-rewrite `main` HEAD = `96594ad`. 4 secrets scrubbed: Firebase RSA key, Supabase service_role/anon JWTs, Upstash TLS password. |
| **Deferred work in May 2026** | `UX-DESIGN-DECISIONS.md` Phases 1-5 | Mobile responsive dashboard redesign — fully analyzed. Phase 1 of responsive redesign **bundled with ThemeProvider scaffold** as Phase A work on `safecommand_v7` (per Q3 decision). |

**Companion docs at this folder root:**
- `AWS-process-doc-IMP.md` — full infra reference + decision log
- `UX-DESIGN-DECISIONS.md` — UX architecture + 5-phase responsive plan
- `DAILY-OPS.md` — daily start/end-of-day routine
- `upstash_redis.md` — Redis cost analysis + tick-rate tiers
- `JUNE-2026-REVIEW-REQUIRED.md` — time-sensitive review marker (delete after 2026-06-02 review)
- `docs/adr/` — Architecture Decision Records (0001 migrations, 0002 branch, 0003 Supabase keys)

---

## What this is

SafeCommand is **declared safety infrastructure** for Indian venues — hospitals, malls, hotels, corporate campuses. It replaces paper checklists, WhatsApp groups, verbal procedures, and paper visitor registers with a configured, audited, and DPDP-compliant system, operated daily so that when an emergency occurs, the team responds in seconds. Three commercial layers:

- **Venue Subscriptions** — Essential / Professional / Enterprise / Chain tiers (₹10K–90K/venue/month)
- **Corporate Governance Licences** — Corp Starter / Professional / Enterprise / Global (₹50K–15L+/month)
- **Enterprise Brand Enablement** — "Apollo SafeCommand" white-label add-on (₹15K–5L/month + one-time config fee)

Apollo India example: 65 venues × Professional + Corp Enterprise + Brand Layer = ₹3.34 Cr ARR. Month-12 ARR target: ₹1.08 Cr. Month-48 target: ₹51 Cr.

**Hero demo (always lead with this):** Zone Accountability Map — *"Who owns Zone B right now?"* answered in under one second. For multi-building campuses: building-scoped incident demo (Apollo MAIN/EMRG/DIAG). For corporate prospects: governance drill-down (Global → Country → State → City → Venue → Building → Zone in 3 clicks). For brand prospects: live "Apollo SafeCommand" mockup via Path C `apollo-demo` brand config.

---

## v7 architectural layers introduced (vs v5/v6)

1. **Multi-Building Venue (MBV)** — `building_id` nullable on every relevant table; `building_visible()` RLS function; SEV1 always venue-wide (Rule 17); single-building venues unaffected (NFR-25). New BRs 57–64 in Phase 1. ★ Phase 1 schema in repo migration `009_mbv.sql`.
2. **Roaming Authority Model** — JWT carries `venue_roles` array + `is_roaming` flag + `active_venue_id` (RLS session var); max 10 venues per roaming role; SC/FS/GS NEVER roaming. ★ Phase 2 UI; schema in repo migration `010_brand_roaming_drill.sql` Phase 1.
3. **Enterprise Brand Enablement** — `corporate_brand_configs` table; ThemeProvider mandatory from first commit (EC-17 / Rule 19); 'Powered by SafeCommand' is hard-coded non-removable credit (EC-18 / Rule 20); WCAG 2.1 AA contrast guard on safety-critical screens (NFR-35). ★ Schema Phase 1; UI Phase 2.
4. **Corporate Governance Platform** — 7-level hierarchy (Global → Country → State → City → Venue → Building → Zone); CORP-CXO/DIR/MGR/COO roles; SEV1 → CXO in ≤30s; CORP roles never access PII (EC-20); raw PII never crosses country boundaries (EC-21). ★ Phase 3.

---

## Migration mapping (per ADR 0001)

| Spec migration (Architecture v7) | Repo filename | State | Content |
|---|---|---|---|
| 001 | `001_enums.sql` | Deployed | Enums: staff_role, subscription_tier, task_status, incident_severity (SEV1/SEV2/SEV3), evidence_type, frequency_type, etc. |
| 002 | `002_tables.sql` | Deployed | All Phase 1 tables; venue/floor/zone/staff/shifts/templates/instances/incidents/comms/audit |
| 003 | `003_rls.sql` | Deployed | RLS policies + `set_tenant_context(venue, staff, role)` (3-param) |
| 004 | `004_indexes.sql` | Deployed | Performance indexes |
| 005 | `005_seed_templates.sql` | Deployed | Hospital/Mall/Hotel/Corporate venue-type schedule template seeds |
| 006 | `006_realtime.sql` | Deployed | Realtime publication on zones / incidents / zone_status_log / incident_timeline |
| **— (repo only)** | `007_schedule_time.sql` | Deployed 2026-04-30 | `schedule_templates`: `start_time`, `timezone`, `secondary_escalation_chain` |
| **— (repo only)** | `008_comm_deliveries_nullable.sql` | Deployed 2026-04-30 | `comm_deliveries` nullable relaxation |
| **Spec 007 (MBV)** | `009_mbv.sql` | **Pending Phase B (June 2026)** | `buildings` table, `building_visible()`, 4-param `set_tenant_context(venue, staff, role, building)`, `ADD COLUMN building_id` everywhere, `zones_building_sync` + `visit_inherit_building` triggers |
| **Spec 008 (Brand+Roaming+Drill)** | `010_brand_roaming_drill.sql` | **Pending Phase B (June 2026)** | `corporate_brand_configs` (with CHECK `powered_by_text = 'Platform by SafeCommand'`), `roaming_staff_assignments`, `drill_sessions`, `drill_session_participants` |

---

## Business requirements

### Functional Requirements — 91 BRs total

Phase tagging: **P1** = Phase 1 (Weeks 1–16, May→Oct 2026); **P2** = Phase 2 (Month 5–10, Roaming + Brand UI + GCP); **P3** = Phase 3 (Month 11–18, Corporate Governance).

#### Foundation + Core (BR-01 to BR-12) — all P1

| ID | Requirement | Priority | State |
|----|-------------|----------|-------|
| BR-01 | Multi-tenant — zero cross-venue data leakage at every layer | Critical | ✅ Sprint 1 |
| BR-02 | Venue Identity — SC-[TYPE]-[CITY]-[SEQ] auto-generated on onboarding | High | ✅ Sprint 1 |
| BR-03 | Operations Console — internal SC team tool, never accessible to venues (EC-14) | High | ✅ Sprint 1 |
| BR-04 | 8-Role permission model: SH, DSH, SC, GM, AUD, FM, FS, GS | Critical | ✅ Sprint 1 |
| BR-05 | Three-tier permission model: SC Platform / Venue Infrastructure / Venue Ops / Task Execution | Critical | ✅ Sprint 1 |
| BR-06 | Scheduled Activity Engine — time-triggered tasks (hourly to annual) per venue | Critical | ✅ Sprint 2 (partial — master-tick + computeCurrentSlot live) |
| BR-07 | Task completion tracking with evidence: photo, text, numeric, checklist | Critical | ✅ Sprint 2 (partial — TEXT verified end-to-end; photo→S3 pending) |
| BR-08 | Escalation engine — auto-escalate missed tasks up command chain with timestamps | Critical | ⏳ Phase B |
| BR-09 | Dual-channel delivery — FCM push (primary) + WhatsApp Business API (parallel primary) | Critical | ✅ Sprint 2 (FCM live; WA pending Meta WABA approval) |
| BR-10 | SMS fallback — auto-trigger if WhatsApp undelivered within 90 seconds | Critical | ⏳ Phase B (blocked on Airtel DLT) |
| BR-11 | One-tap Incident Declaration — type, zone, confirm → escalation fires ≤5s | Critical | ✅ Mobile UI live (commit `8bc2c02`); ≤5s gate pending Phase B |
| BR-12 | Shift Handover protocol — outgoing logs, incoming confirms, authority transfers | High | ⏳ Phase B |

#### Command + Compliance (BR-13 to BR-29) — all P1

| ID | Requirement | Priority | Phase |
|----|-------------|----------|-------|
| BR-13 | Deputy SH Activation — manual / auto-emergency (5 min SH unresponsive) / pre-scheduled | High | P1 |
| BR-14 | GM Dashboard — real-time health score, BI analytics, incident intelligence, benchmarks (per-building cards) | High | P1 |
| BR-15 | GM Broadcast — venue-wide / floor / zone / role / individual / shift / command chain scopes | High | P1 |
| BR-16 | GM Custom Task — assignee, deadline, evidence type, escalation chain (one-off only, no recurrence) | High | P1 |
| BR-17 | Auditor role — full read, compliance report generation, audit flagging, zero writes | High | P1 |
| BR-18 | Zone Status Board — real-time colour-coded: All Clear / Attention / Incident Active | Critical | P1 |
| BR-19 | **Zone Accountability Map — live map, named owner per zone per shift (THE hero demo)** | High | P1 |
| BR-20 | Compliance exports — PDF/Excel: Fire NOC / NABH / Insurance | High | P1 |
| BR-21 | Equipment & Maintenance Tracker — expiry alerts at 90/30/7 days | High | P1 |
| BR-22 | Staff Certification Tracker — role restriction alert on expiry | High | P1 |
| BR-23 | Special Events / Festival Mode — one-tap elevated safety posture | Medium | P1 |
| BR-24 | Visitor Safety Alert — QR opt-in, emergency push, all-clear (no app required) | Medium | P1 |
| BR-25 | Venue-type activity templates — Hospital / Mall / Hotel / Corporate | High | ✅ P1 (seeded migration 005) |
| BR-26 | Change Request workflow — CR inbox, SLA tracking, approval, audit log | Medium | P1 |
| BR-27 | Shift Briefing System — time-scheduled, role-scoped, acknowledgement tracked | High | P1 |
| BR-28 | Communication audit trail — sender, recipient, delivery, ack, escalation per message | Critical | ✅ Sprint 1 (audit middleware live) |
| BR-29 | Post-incident report auto-generation — timeline, responders, resolution, PDF export | High | P1 |

#### Extended + Workflow (BR-30 to BR-38)

| ID | Requirement | Priority | Phase |
|----|-------------|----------|-------|
| BR-30 | Governing Body Integration — venue pre-registration, one-tap alert with floor plan | Medium | **P3** |
| BR-31 | Analytics pipeline — safety health score, incident trends, response time, benchmarks | High | P1 |
| BR-32 | Cross-venue analytics — cohort benchmarking, India Safety Index (SC Ops Console only) | Medium | P2 |
| BR-33 | Staff gamification — streak records, performance scorecards, Monthly Safety Star | Medium | P1 |
| BR-34 | Controlled Area logging — two-person confirmation for restricted zones | Medium | P1 |
| BR-35 | Offline mode — last 4 hours cached; completions queue locally, sync on reconnect | Critical | P1 |
| BR-36 | Multi-language UI — English (P1); Hindi/Telugu/Kannada (P2) | High | P1/P2 |
| BR-37 | Subscription tier enforcement — Essential / Professional / Enterprise / Chain gating | High | P1 |
| BR-38 | Change Request fee management — count per tier, fee calculation, billing | Medium | P1 |

#### Visitor Management System (BR-39 to BR-56)

| ID | Requirement | Priority | Phase |
|----|-------------|----------|-------|
| BR-39 | VMS Entry Points — configurable check-in points per floor (name, location, hours, guard) | High | P1 |
| BR-40 | VMS Mode 1 — Manual Entry: name, phone, purpose, host (optional photo) — ≤30s | Critical | P1 |
| BR-41 | VMS Mode 2 — ID Card Photo with on-device OCR (Google ML Kit); store last 4 digits only | High | P1 |
| BR-42 | VMS Mode 3 — Aadhaar QR offline (UIDAI XML parsed on-device; **never store full Aadhaar — Rule 13**) | High | P1 |
| BR-43 | VMS Mode 4 — Pre-Registration QR (host pre-registers, visitor receives QR, single-use token) | High | P1 |
| BR-44 | VMS Mode 5 — Self-Service Kiosk (visitor scans venue QR, fills form on own phone, guard approves) | Medium | P1 |
| BR-45 | VMS Visitor Photo (optional) — encrypted at rest, role-gated access | High | P1 |
| BR-46 | VMS Check-Out Tracking — time-on-premises, overstay alerts | High | P1 |
| BR-47 | VMS Host Notification — push + WhatsApp on visitor arrival | High | P1 |
| BR-48 | VMS Entry Point Customisation — custom fields, photo/ID toggles | High | P1 |
| BR-49 | VMS Visitor Blacklist — venue-level + corporate-scope opt-in | High | P1 |
| BR-50 | VMS Digital Gate Pass — QR generated on check-in, scanned at exit | Medium | P1 |
| BR-51 | VMS Emergency Integration — visitors on evacuation board, opt-in safety alerts | Critical | P1 |
| BR-52 | VMS Reporting — daily log, peak hour analytics, dwell time, repeat visitors | High | P1 |
| BR-53 | VMS Overstay Alerts — configurable per entry point; 15-min escalation | High | P1 |
| BR-54 | VMS Repeat Visitor Recognition — phone-based; pre-fills name/company | Medium | P1 |
| BR-55 | VMS Data Retention — 90d minimum, configurable per tier (3 yr Enterprise); auto-purge with audit | High | P1 |
| BR-56 | VMS Contractor / Vendor Mode — special visitor type with permit number, work zone, materials | Medium | **P2** |

#### Multi-Building Venue (BR-57 to BR-64) — all P1

| ID | Requirement | Priority |
|----|-------------|----------|
| BR-57 | MBV Structure — 1–N named buildings per venue; single-building unchanged (NFR-25) | Critical |
| BR-58 | MBV Building Identity — name, short_code (e.g. "EMRG-BLOCK"), address/GPS, optional floor plan | High |
| BR-59 | MBV Staff Assignment — primary building per staff; SH/DSH span all buildings | High |
| BR-60 | MBV Incident Scope — building-scoped or venue-wide; SEV1 always all buildings (Rule 17) | Critical |
| BR-61 | MBV Shift Structure — building-scoped or venue-wide shifts | High |
| BR-62 | MBV Zone Status Board — grouped by building → floor → zone; guard sees only assigned building | High |
| BR-63 | MBV Analytics — health score per building + venue aggregate; per-building compliance reports | High |
| BR-64 | MBV VMS Entry Points — assigned to a building; visitor log filterable by building | High |

#### Drill + Cert (P1 additions)

| ID | Requirement | Priority |
|----|-------------|----------|
| BR-A | Drill Management Module — schedule/run/time/document; auto-generate timed Fire NOC report; per-building separate records; missed-participant logging | High |
| BR-B | Cert Expiry Warning on Shift Activation — soft warning (NOT hard block); SC + SH notified; logged to audit_logs | High |

#### Corporate Governance (BR-65 to BR-80) — all P3

| ID | Requirement | Priority |
|----|-------------|----------|
| BR-65 | Corporate Account entity — parent above venues; isolated from other corporate accounts | Critical |
| BR-66 | 7-level hierarchy (Global → Country → State → City → Venue → Building → Zone) | Critical |
| BR-67 | CORP-CXO role — Global Safety Head; SEV1 push ≤30s globally | Critical |
| BR-68 | CORP-DIR role — Country Safety Director | High |
| BR-69 | CORP-MGR role — State/Region Safety Manager | High |
| BR-70 | CORP-COO role — City Safety Coordinator | High |
| BR-71 | Corporate Safety Score Chain — building → venue → city → state/country/global; drill-down to zone within 3 clicks | Critical |
| BR-72 | Corporate Incident Feed — real-time across all venues in scope | High |
| BR-73 | SEV1 Global Alert — ANY SEV1 → CXO push in ≤30s (NFR-32) | Critical |
| BR-74 | Corporate Drill Calendar — overdue/upcoming across all venues, per-building | High |
| BR-75 | Corporate Compliance Report — per-country regulatory format (NABH India / DHA UAE / MOH Singapore) | High |
| BR-76 | Regulatory Risk Heatmap — Fire NOC / NABH / insurance gaps 90 days ahead | High |
| BR-77 | Corporate Broadcast — message all GMs in scope via push + WA | High |
| BR-78 | Cross-Venue Blacklist (opt-in) — city/state/country/global scope | Medium |
| BR-79 | International Data Residency — per-country GCP regions; raw PII never crosses borders (EC-21) | Critical |
| BR-80 | Corporate account isolation — Account A never sees Account B (six isolation rules) | Critical |

#### Roaming Authority (BR-R1 to BR-R5) — all P2

| ID | Requirement | Priority |
|----|-------------|----------|
| BR-R1 | Roaming JWT structure — `venue_roles` array, `is_roaming`, `active_venue_id` | Critical |
| BR-R2 | Unified multi-venue dashboard — all assigned venues as tabs (Option B confirmed) | Critical |
| BR-R3 | Roaming notification routing — SEV1 always; routine tasks only for active_venue_id | Critical |
| BR-R4 | Venue isolation per active tab — RLS session var enforced (EC-19, Rule 21) | Critical |
| BR-R5 | Assignment rules — SC-OPS only; max 10 venues; SC/FS/GS never roaming | Critical |

#### Enterprise Brand Enablement (BR-81 to BR-88)

| ID | Requirement | Priority | Phase |
|----|-------------|----------|-------|
| BR-81 | `corporate_brand_configs` table with all fields including hard-coded `powered_by_text` | Critical | P1 (schema) |
| BR-82 | Mobile App ThemeProvider — reads brand_config; default SafeCommand brand; 24-hour AsyncStorage cache | Critical | **P1 (Week 1, EC-17/Rule 19)** |
| BR-83 | Terminology Resolver — every label via `useLabel()`; <5ms render impact (NFR-34) | Medium | P2 |
| BR-84 | Role Override Display — `role_overrides` JSONB; JWT codes unchanged (display only) | Medium | P2 |
| BR-85 | 'Powered by SafeCommand' in Settings > About + all PDF report footers — non-removable (EC-18, Rule 20) | Critical | P1 (About) / P2 (reports) |
| BR-86 | Notification sender customisation — dedicated WABA per corporate account | High | P2 |
| BR-87 | Enterprise subdomain — `app.[enterprise_code].safecommand.in` via Cloudflare CNAME | Medium | P3 |
| BR-88 | Report branding — enterprise logo + header + colours; WCAG 2.1 AA validated by SC Ops | High | P2 |

---

## Non-Functional Requirements — 37 NFRs

| NFR | Requirement | Target |
|-----|-------------|--------|
| NFR-01 | Multi-tenancy isolation | Zero cross-venue data access at any layer |
| NFR-02 | Incident escalation latency | ≤5s declaration → first notification on recipient device |
| NFR-03 | WA → SMS fallback SLA | SMS fires if WA undelivered in 90s |
| NFR-04 | Task completion UX | Max 3 taps from notification to submitted |
| NFR-05 | Reading load — critical flows | Max 20 words before any required action |
| NFR-06 | Device coverage | Android ₹5K–8K (Redmi 9A, Samsung A03); iOS iPhone 8+ |
| NFR-07 | Connectivity | 2G/3G compatible; critical flows <3s |
| NFR-08 | Touch targets | Minimum 48×48dp all interactive elements |
| NFR-09 | Offline cache | Last 4 hr tasks; completions queue locally; sync on reconnect |
| NFR-10 | Zone board refresh | ≤30s GM dashboard; real-time (Supabase Realtime) for command roles |
| NFR-11 | India data residency | Files in India from Day 1 (S3 ap-south-1); all data in India by Phase 2 |
| NFR-12 | DPDP Act compliance | Full compliance before first hospital contract (Rule 12) |
| NFR-13 | Availability | 99.5%+ uptime — lives depend on it |
| NFR-14 | Scheduling scale | 100K+ daily task triggers without queue degradation |
| NFR-15 | Concurrent WebSocket | 500+ (P1 Supabase); unlimited (P2 GCP) |
| NFR-16 | Authentication security | JWT + RLS + HTTPS — three-layer defence |
| NFR-17 | Audit immutability | Append-only, never editable (EC-10, Rule 4) |
| NFR-18 | Operational overhead | Managed services only — no self-hosted infrastructure |
| NFR-19 | Solo buildable — Phase 1 | 16-week sprint with Claude Code |
| NFR-20 | Cash gross margin | 70%+ at 20 venues |
| NFR-21 | VMS check-in speed | ≤60s manual mode (BR-40) on Redmi 9A |
| NFR-22 | VMS offline operation | Guard checks in / views log with no internet |
| NFR-23 | ID photo access control | SH/DSH/AUD only; never in mobile gallery (Rule 14) |
| NFR-24 | Aadhaar compliance | No Aadhaar number stored anywhere; masked (last 4) only — Rule 13 |
| NFR-25 | MBV backward compatibility | Single-building venues = zero behaviour change |
| NFR-26 | MBV incident latency | Building-scoped incident still ≤5s; building filter <100ms |
| NFR-27 | MBV mobile context isolation | Guard A cannot see Building B zones/tasks |
| NFR-28 | Corporate aggregation latency | Safety scores at city/state/country/global within 6 hr |
| NFR-29 | Corporate dashboard load | Full corporate dashboard <3s regardless of scope size |
| NFR-30 | Cross-account isolation | Venue raw data never visible to other corporate account governance users |
| NFR-31 | International data residency | Raw PII never crosses borders; only anonymised scores aggregate globally (EC-21) |
| NFR-32 | Corporate SEV1 notification | SEV1 anywhere → CXO push within 30s (BR-73) |
| NFR-33 | Roaming venue isolation | Roaming SH in active_venue sees only that venue's data; zero contamination |
| NFR-34 | Brand config fetch latency | Fetched + applied within 1s of authentication; 24-hour cache |
| NFR-35 | Safety-critical screen readability | ALL safety-critical screens pass WCAG 2.1 AA (4.5:1 contrast) regardless of brand |
| NFR-36 | Brand config isolation | Account A's brand never served to Account B users |
| NFR-37 | Roaming venue isolation | `active_venue_id` set as RLS session var on every request; validated against `venue_roles` (Rule 21) |

---

## Engineering Constraints — 22 ECs (non-negotiable; violation in code review = blocker)

| ID | Constraint |
|----|-----------|
| EC-01 | PostgreSQL as the database engine (RLS multi-tenancy is PostgreSQL-specific) |
| EC-02 | Row-Level Security on every table |
| EC-03 | `venue_id` present in every table and every query |
| EC-04 | JWT stateless authentication |
| EC-05 | Async queue for all notifications and escalations |
| EC-06 | Three notification channels: Push + WhatsApp + SMS |
| EC-07 | React Native (Expo) — iOS + Android from one codebase |
| EC-08 | India data residency for all PII (Phase 2 pre-condition for hospital sales) |
| EC-09 | Offline-first mobile (4-hour cache minimum) |
| EC-10 | Audit logs are append-only, never editable |
| EC-11 | Meta WhatsApp Business API — no alternative intermediary |
| EC-12 | DLT registration for all SMS (TRAI regulation) |
| EC-13 | All write operations must be idempotent |
| EC-14 | Operations Console never on the same auth domain as venues |
| EC-15 | i18n keys for all user-visible strings from Day 1 |
| **EC-16** | **`building_id` is optional on all tables that reference it — never NOT NULL** (single-building venues unaffected; NULL = entire-venue scope) |
| **EC-17** | **ThemeProvider must exist from the first commit of mobile app and web dashboard** (every colour/label as theme token; retrofit cost is 3–4× the from-scratch cost) |
| **EC-18** | **'Powered by SafeCommand' credit is non-removable for all accounts** (Settings > About + all PDF report footers; hard-coded; cannot be NULL or modified) |
| **EC-19** | **Roaming `active_venue_id` validated against `venue_roles` on EVERY request** (middleware enforces; 403 on mismatch) |
| **EC-20** | **CORP-* roles NEVER access individual PII** (aggregation queries return scores/counts only; code review hard blocker) |
| **EC-21** | **Raw PII never crosses country boundaries** (India venue data stays in GCP asia-south1; only anonymised scores aggregate globally) |

---

## Engineering Hard Rules — 22 Rules (violation in PR = blocker)

| Rule | Statement |
|------|-----------|
| 1 | Never store secrets in code or version control (gitleaks pre-commit; rotate immediately if leaked) |
| 2 | Every database query must include `venue_id` (no exceptions; code review blocker) |
| 3 | Never modify a committed database migration (always add a new file; ADR 0001 references) |
| 4 | Audit logs are write-once — never update or delete (DB policy enforces; never write code that tries) |
| 5 | All write operations must be idempotent (`idempotency_key` or `ON CONFLICT DO NOTHING`) |
| 6 | Operations Console never on the same auth domain as venues (separate Supabase project) |
| 7 | Notification failures must never fail the primary operation (POST /incidents returns 201 before notify) |
| 8 | Three notification channels must all be configured before pilot go-live |
| 9 | Mobile app must function offline for 4 hours — tested before go-live (5-task airplane test) |
| 10 | All API inputs validated with Zod before any business logic (.strict() schemas) |
| 11 | All user-visible strings use i18n keys from Day 1 (no hardcoded strings even in P1 English-only) |
| 12 | **No hospital data before Phase 2 GCP migration completes** (DPDP Act legal requirement) |
| 13 | **Aadhaar numbers NEVER stored** — only `masked_aadhaar` (last 4) — VMS-specific |
| 14 | ID card photos and visitor face photos never accessible to GS/FS roles (presigned URL role-gated) |
| 15 | `building_id` always nullable — never enforce NOT NULL (EC-16; PR adding NOT NULL = blocker) |
| 16 | `building_visible()` must be used in all RLS policies where building scope applies (no inline filters) |
| 17 | **SEV1 incidents always notify all buildings regardless of declared `building_id`** (hard-coded in escalation worker; no config override) |
| 18 | Incident codes for building-scoped incidents include the building `short_code` (immutable once declared) |
| 19 | **ThemeProvider must be in the first commit of mobile app and web dashboard** (EC-17; default SafeCommand brand from Day 1) |
| 20 | **'Powered by SafeCommand' is hard-coded** — DB CHECK constraint enforces `powered_by_text = 'Platform by SafeCommand'`; Settings > About + PDF footers literal strings in code (EC-18) |
| 21 | **Roaming validation is double-enforced** — JWT `venue_roles` + middleware validates `active_venue_id ∈ venue_roles` on EVERY request (EC-19) |
| 22 | **CORP-* roles never return individual PII** — aggregation only; code review hard blocker (EC-20) |

---

## Roles — 16 total, 3 authority models

### Model A — Local Authority (single venue, majority of users)

| # | Code | Title | Building scope | Interface |
|---|------|-------|----------------|-----------|
| 1 | GS | Ground Staff | Building-bound | Mobile App (primary) + WhatsApp |
| 2 | FS | Floor Supervisor | Building-bound (assigned floors) | Mobile + WhatsApp |
| 3 | SC | Shift Commander | Building-bound (shift-bound) | Mobile + Web Dashboard |
| 4 | FM | Facility Manager | Assigned building(s) | Mobile + Web Dashboard |
| 5 | SH | Security Head | Venue-wide (all buildings tabbed) | Mobile + Web Dashboard |
| 6 | DSH | Deputy Security Head | Venue-wide when activated | Mobile + Web Dashboard |
| 7 | GM | General Manager | Venue-wide BI + broadcast + custom tasks | Web Dashboard (primary) + Mobile |
| 8 | AUD | Auditor | Venue-wide read; zero writes | Web Dashboard (read-only) |

### Model B — Roaming Authority (Phase 2; max 10 venues; SC-OPS-assigned only)

| # | Code | Title | Notes |
|---|------|-------|-------|
| 9 | ROAMING-SH | Roaming Security Head | Full SH at each venue; venue tabs |
| 10 | ROAMING-GM | Roaming General Manager | Unified BI |
| 11 | ROAMING-AUD | Roaming Auditor | Cross-venue compliance comparison |
| 12 | ROAMING-FM | Roaming Facility Manager | Building-scoped per venue |

> **Hard rule:** SC, FS, GS NEVER roaming — always single-venue, building-scoped.

### Model C — Corporate Governance (Phase 3; read + aggregation only; no PII; no operations)

| # | Code | Title | Scope |
|---|------|-------|-------|
| 13 | CORP-CXO | Global Safety Head | All venues globally in corporate account |
| 14 | CORP-DIR | Country Safety Director | All venues in assigned country |
| 15 | CORP-MGR | State/Region Safety Manager | All venues in assigned state/region |
| 16 | CORP-COO | City Safety Coordinator | All venues in assigned city |

### Platform

| Code | Title | Scope |
|------|-------|-------|
| SC-OPS | SafeCommand Ops Team | Operations Console (internal, never public; EC-14) |

### 9-Level Hierarchy (Architecture v7 §3 + Business Plan §3)

```
L0 GLOBAL    → CORP-CXO   (corporate account scope)
L1 COUNTRY   → CORP-DIR
L2 STATE     → CORP-MGR
L3 CITY      → CORP-COO
L4 VENUE     → GM         ← THE RLS TENANT BOUNDARY
L5 BUILDING  → SH/SC      (nullable; NULL = single-building venue)
L6 FLOOR     → FS
L7 ZONE      → GS
CROSS        → ROAMING ROLE (operational role spanning 2–10 L4 boundaries)
```

---

## Architecture — components

```
COMPUTE LAYER  (Railway)
  Service: api          Node.js 20 + Express + TypeScript, 2 replicas → api.safecommand.in
  Service: scheduler    BullMQ consumer 'schedule-generation' (1 replica) — generates task_instances
  Service: escalation   BullMQ consumer 'escalations' (priority queue, 1 replica) — escalation chains
  Service: notifier     BullMQ consumer 'notifications' (1 replica) — FCM push + WA + SMS

WEB LAYER  (AWS Amplify ap-south-1; will move to Vercel for ops-console)
  apps/dashboard        Next.js — Venue Dashboard (SH/GM/AUD/FM/SC) → app.safecommand.in (pending domain)
  apps/ops-console      Next.js — Operations Console (SC Ops Team ONLY) → ops.safecommand.in (separate auth — EC-14)

MOBILE LAYER
  apps/mobile           Expo React Native SDK 51+ — iOS + Android. Currently using TEST_PHONE_PAIRS bypass; native Firebase Auth migration deferred to Sprint 3.

DATA LAYER
  Supabase PostgreSQL   AWS us-east-1 (Pro plan, PITR 7-day, RLS enforced) — migrating to ap-south-1 in Phase 2
  Upstash Redis         Serverless — BullMQ backend, AOF persistence (lucky-giraffe-107825)
  AWS S3 ap-south-1     India file storage from Day 1, SSE-S3 (sc-evidence-prod)

EXTERNAL CHANNELS  (3 independent failure modes)
  Meta WhatsApp Business API   Direct (not Twilio); 12 templates submit Week 1
  Airtel Business SMS          DLT-registered (sender ID: SFCMND); 90s WA→SMS fallback
  Firebase FCM                 iOS (APNs) + Android push; safecommand-51499 project

TESTING / OPERATIONS
  Sentry (errors), UptimeRobot (uptime) — gated as go-live items
```

### Monorepo structure

```
products/Safecommand/                           ← repo root
├── apps/
│   ├── api/                       ← Railway: REST API service
│   ├── scheduler/                 ← Railway: scheduling worker
│   ├── escalation/                ← Railway: escalation worker
│   ├── notifier/                  ← Railway: notification worker
│   ├── mobile/                    ← Expo React Native (iOS + Android)
│   ├── dashboard/                 ← Next.js Venue Dashboard
│   └── ops-console/               ← Next.js Operations Console
├── packages/
│   ├── db/                        ← Supabase client + type-safe helpers
│   ├── types/                     ← Shared TypeScript types
│   ├── schemas/                   ← Shared Zod validation schemas
│   └── queue/                     ← BullMQ definitions (reads SC_REDIS_URL ?? REDIS_URL)
├── supabase/
│   ├── migrations/                ← 001 → 008 deployed; 009/010 pending Phase B
│   └── functions/                 ← Edge Functions (JWT hook)
├── docs/
│   └── adr/                       ← 0001 migrations | 0002 branch | 0003 supabase keys
├── scripts/                       ← rls_isolation_verify_v2.sql + ops scripts
└── .github/workflows/             ← CI/CD pipelines
```

### Data model — core entity relationships (post-migration 009)

```
VENUE  ──── root of every RLS policy (the L4 tenant boundary)
  ├── BUILDINGS (1:N) [building_id nullable everywhere — EC-16]
  │     └── FLOORS (1:N, building_id propagates via trigger)
  │           └── ZONES (1:N, denormalised building_id for query speed)
  │                 └── ZONE_STATUS_LOG (1:N, append-only)
  ├── STAFF (1:N, primary_building_id nullable)
  │     ├── STAFF_ZONE_ASSIGNMENTS (junction)
  │     ├── STAFF_CERTIFICATIONS (1:N)
  │     └── ROAMING_STAFF_ASSIGNMENTS (1:N, Phase 2 schema in mig 010)
  ├── SHIFTS (1:N, building_id nullable) → SHIFT_INSTANCES → SHIFT_HANDOVERS
  ├── SCHEDULE_TEMPLATES (1:N, building_id nullable) → TASK_INSTANCES (1:N) → TASK_COMPLETIONS / ESCALATION_EVENTS
  ├── CUSTOM_TASKS (1:N) → TASK_COMPLETIONS
  ├── INCIDENTS (1:N, building_id nullable + incident_scope) → INCIDENT_TIMELINE / INCIDENT_REPORTS
  ├── COMMUNICATIONS (1:N, building_id nullable) → COMM_DELIVERIES (1:N per recipient × channel)
  ├── EQUIPMENT_ITEMS (1:N, building_id nullable)
  ├── DRILL_SESSIONS (1:N, building_id nullable; mig 010) → DRILL_SESSION_PARTICIPANTS
  ├── CHANGE_REQUESTS (1:N)
  ├── VENUE_SUBSCRIPTIONS (1:1)
  ├── AUDIT_LOGS (1:N, IMMUTABLE — INSERT-only)
  └── VMS_ENTRY_POINTS (1:N, building_id nullable) → VMS_VISITS (denormalised building_id)

CORPORATE_ACCOUNTS (Phase 3)
  ├── CORPORATE_BRAND_CONFIGS (1:1; mig 010 — Phase 1 schema)
  ├── CORPORATE_VENUE_ASSIGNMENTS (junction to venues)
  ├── CORPORATE_COUNTRIES / STATES / CITIES (governance hierarchy)
  └── CORPORATE_STAFF (CORP-CXO/DIR/MGR/COO)
```

**Tenant isolation rule (enforced at RLS):**
```sql
SELECT set_tenant_context(p_venue_id, p_staff_id, p_role, p_building_id DEFAULT NULL);
-- sets app.current_venue_id, app.current_staff_id, app.current_role, app.current_building_id
-- Used with building_visible(record_building_id) RLS function (Rule 16; no inline filters)
```

**Append-only tables (no UPDATE/DELETE policy):**
- `audit_logs`, `zone_status_log`, `incident_timeline`

**Key enums (current state — `incident_severity` already SEV1/SEV2/SEV3):**
```
staff_role_enum:    SH | DSH | SHIFT_COMMANDER | GM | AUDITOR | FM | FLOOR_SUPERVISOR | GROUND_STAFF
                    (Phase 2/3 add ROAMING-* + CORP-* via JWT claims, NOT enum extension)
subscription_tier:  ESSENTIAL | PROFESSIONAL | ENTERPRISE | CHAIN
task_status:        PENDING | IN_PROGRESS | COMPLETE | MISSED | ESCALATED | LATE_COMPLETE
evidence_type:      NONE | PHOTO | TEXT | NUMERIC | CHECKLIST
incident_type:      FIRE | MEDICAL | SECURITY | EVACUATION | STRUCTURAL | OTHER
incident_severity:  SEV1 | SEV2 | SEV3
delivery_channel:   APP_PUSH | WHATSAPP | SMS
frequency_type:     HOURLY | EVERY_2H | EVERY_4H | EVERY_6H | EVERY_8H | DAILY | WEEKLY | MONTHLY | QUARTERLY | ANNUAL | CUSTOM
checkin_mode (VMS): MANUAL | ID_PHOTO | AADHAAR_QR | PRE_REGISTERED | SELF_SERVICE_QR
visitor_status:     CHECKED_IN | CHECKED_OUT | OVERSTAY | DENIED | BLACKLISTED_ATTEMPT
```

---

## Architecture — API design

**Base URL:** `https://api.safecommand.in/v1` (currently `https://api-production-9f9dd.up.railway.app/v1` pending domain purchase)
**Auth:** `Authorization: Bearer {jwt}` on all endpoints except `/auth/*`, `/visitor/*`, and webhooks.
**Roaming users:** additionally send `x-active-venue-id: <uuid>` header on every request (middleware validates ∈ JWT `venue_roles`; 403 on mismatch — Rule 21).

```
AUTH:        POST /auth/{send-otp,verify-otp,refresh,logout,device-token}
VENUE:       GET/PATCH /venue; GET /venue/{health-score,compliance-readiness}; PUT /venue/festival-mode
BUILDINGS:   GET /buildings; GET /buildings/:id; GET /buildings/:id/{zones,health-score} (Phase B)
FLOORS+ZONES:GET /floors; GET /floors/:id/zones; PUT /zones/:id/status; GET /zones/accountability
STAFF:       GET/POST /staff; PATCH /staff/:id; POST /staff/:id/deputy-activate; GET /staff/on-duty
TASKS:       GET /tasks (?date=); POST /tasks/:id/complete; GET /tasks/pending
SCHEDULING:  GET/POST/PATCH/DELETE /schedule-templates
INCIDENTS:   POST /incidents (returns 201 <200ms; async escalation queue priority 0)
             GET /incidents (?active=); GET /incidents/:id; PUT /incidents/:id/status
             POST /incidents/:id/staff-safe; GET /incidents/:id/evacuation
SHIFTS:      GET /shifts; GET /shift-instances; POST /shift-instances/:id/{activate,zone-assignments}
HANDOVERS:   POST /handovers; PUT /handovers/:id/accept
COMMS:       POST /communications; GET /communications; GET /communications/briefings
             POST /communications/:id/acknowledge
ANALYTICS:   GET /analytics/{dashboard,incidents,tasks,staff,financial-risk}
COMPLIANCE:  GET /compliance/export ({type, from, to}) → S3 presigned URL
EQUIPMENT:   GET/POST/PATCH /equipment; GET /equipment/expiring
CERTS:       GET/POST /certifications; GET /certifications/expiring
CR:          POST /change-requests; GET /change-requests
DRILLS:      POST /drill-sessions/{start,end}; GET /drill-sessions/:id (Phase B per BR-A)
VMS:         GET /vms/entry-points; POST /vms/{checkin,checkout,blacklist}
             GET /vms/visits (?date,?entry_point_id,?building_id); GET /vms/visits/active
             GET /vms/pre-registrations; GET /vms/reports/daily
VISITOR (no auth): POST /visitor/opt-in; GET /visitor/self-checkin/:venue_token
WEBHOOKS (HMAC): POST /webhooks/{meta,airtel}
```

### Notification architecture (NFR-02 — ≤5s incident; Rule 7 primary-op never blocked)

```
Incident declared → POST /incidents → DB write → return 201 <200ms
  → async: enqueue 'escalations' priority 0
  → escalation-worker: resolve targets per scope (SEV1=all-bldg always per Rule 17; SEV2=building+SH/DSH)
  → enqueue FCM + WA simultaneously to 'notifications'
  → notifier-worker: parallel push + WA; on WA-undelivered@90s enqueue SMS
  → comm_deliveries records each step
  → P3 Corporate: if venue.corporate_account_id && SEV1 → notifyCorporateCXO ≤30s (NFR-32, BR-73)
```

---

## Architecture — User flow (MBV-aware)

**1. Venue onboarding (SC Ops Console — ops.safecommand.in)**
- SC Ops creates venue → `generate_venue_code(p_type, p_city)` → `SC-MAL-HYD-00042`
- (MBV) SC Ops creates buildings: name, short_code (e.g. EMRG-BLOCK), address/GPS — or skips for single-building venue (NFR-25)
- SC Ops creates floors (assigned to building if MBV), zones (zone_type, two-person-required toggles)
- SC Ops creates schedule templates (frequency, role, evidence, escalation chain — building-scoped or venue-wide)
- SC Ops creates initial SH (phone → Firebase auth_id → staff record)

**2. Security Head first login (Mobile + Web Dashboard)**
- WhatsApp welcome with app download link
- Phone OTP → JWT issued (today: TEST_PHONE_PAIRS bypass; native Firebase Auth = Sprint 3)
- SH adds staff (GS, FS, SC); each gets WA welcome

**3. Staff daily workflow (Mobile + WhatsApp)**
- scheduler-worker tick (60s production target; 4hr hibernation today) generates `task_instances` from active templates
- Each staff: FCM push + WA; tap → complete with evidence (3 taps max — NFR-04)
- Offline: completion queued in Expo SQLite; syncs on reconnect (NFR-09)

**4. Escalation chain (automatic, escalation-worker)**
- Task missed @ `window_expires_at` → resolve next role from `escalation_chain[level]`
- Level 1 → FS, Level 2 (+30 min) → SC, Level 3 (+60 min) → SH; each logged in `escalation_events`

**5. Shift management (SC — Mobile + Dashboard)**
- Shift activation → zone assignments → coverage gap alerts on PRIMARY-less zones
- End of shift: outgoing submits handover (zone snapshots + open incidents); incoming SC accepts; authority transfers, audit logged

**6. Incident declaration (any command role — Mobile)**
- 3-tap: type → zone → confirm; API 201 <200ms; notification ≤5s
- (MBV) Building-scoped SEV2/SEV3; SEV1 always all-buildings (Rule 17)
- All zones → INCIDENT_ACTIVE via Supabase Realtime; staff [I AM SAFE] updates evacuation board

**7. GM situational awareness (Web Dashboard — app.safecommand.in)**
- Health score 0–100 nightly: tasks 40% / incidents 25% / certs 15% / equipment 10% / drills 10%
- (MBV) Per-building health score cards (e.g. `[MAIN: 94] [EMRG: 84⚠] [DIAG: 96]`)
- Zone Accountability Map (THE hero demo)
- GM Broadcast / Custom Task

**8. Auditor / compliance export (Web Dashboard, read-only)**
- Compliance export (Fire NOC / NABH / Full Audit) → PDF via PDFKit → S3 presigned URL → download
- All PDFs include 'Powered by SafeCommand' footer (Rule 20, EC-18)

**9. VMS visitor check-in (Guard — Mobile)**
- Mode 1 manual ≤30s; Mode 2 ID photo + on-device OCR; Mode 3 Aadhaar QR offline (no Aadhaar# stored — Rule 13); Mode 4 pre-reg QR; Mode 5 self-service kiosk
- Host notified via push + WA on arrival
- During incident: VMS visitors auto-appear on evacuation board (BR-51)

---

## Stack

| Layer | Technology | Justification / Constraint |
|-------|-----------|---------------------------|
| API runtime | Node.js 20 LTS + TypeScript strict | Single language; correctness via types |
| API framework | Express + Zod | Minimal; Zod schemas shared via `packages/schemas` |
| Database | Supabase PostgreSQL Pro | RLS multi-tenancy (EC-01, EC-02); Realtime; Pro for PITR |
| **DB API keys** | **`sb_secret_*` (server) + `sb_publishable_*` (client) — opaque tokens, NOT JWTs** | **ADR 0003**; rotation no longer mass-logouts users |
| DB client | Supabase JS client (≥v2.40 for opaque-token compat) | Type-safe; treats key format opaquely |
| Queue | BullMQ + Upstash Redis | Serverless Redis backend (lucky-giraffe-107825); jobs survive restarts (EC-05) |
| Compute | Railway (4 services) | Independent crash cycles; per-service scaling |
| Mobile | Expo React Native SDK 51+ | iOS + Android one codebase (EC-07) |
| Mobile auth | Phone OTP (today: TEST_PHONE_PAIRS bypass; Sprint 3: Firebase Phone Auth) | OTP at zero marginal cost |
| Push | Firebase Cloud Messaging (FCM) | iOS (APNs) + Android; project `safecommand-51499` |
| Web dashboards | Next.js 14 + AWS Amplify ap-south-1 (dashboard); Next.js + Vercel (ops-console — pending) | India residency (NFR-11) on Amplify |
| WhatsApp | Meta WhatsApp Business Cloud API (direct — not Twilio) | EC-11; only API delivering 90%+ open rates for India ground staff |
| SMS | Airtel Business SMS (DLT-registered, sender SFCMND) | EC-12; TRAI compliance; ~90s WA→SMS fallback |
| File storage | AWS S3 ap-south-1 | India residency Day 1 (NFR-11); SSE-S3 |
| Realtime | Supabase Realtime | Zone board + incident board live updates (NFR-10) |
| PDF generation | PDFKit | Server-side compliance + post-incident reports |
| OCR (VMS) | Google ML Kit (on-device) for ID Mode 2 | Offline-capable; no UIDAI API for Aadhaar |
| Theming | Custom ThemeProvider (Phase A scaffold on `safecommand_v7`) | EC-17 / Rule 19; default SafeCommand brand; sparse override per `corporate_brand_configs` |
| Monitoring | Sentry + UptimeRobot | Go-live checklist gate |
| CI/CD | GitHub Actions | Test on every PR; deploy on merge to main |
| Secret scanning | gitleaks pre-commit | Rule 1 |

---

## Build status — current state

### Sprint 1 (Foundation, Weeks 1–2 in v5 plan; complete)
| Gate | Result |
|------|--------|
| Gate 1: RLS Isolation Proof | ✅ PASSED 2026-04-29 (`scripts/rls_isolation_verify_v2.sql`) — still valid under v7 |
| Gate 2: Full Venue Creation via Ops Console | ✅ PASSED 2026-04-30 — venue + 3 floors + 12 zones + 5 templates + 1 SH |

### Sprint 2 (Scheduling + Notification, partial)
- ✅ scheduler-worker: master-tick + computeCurrentSlot live (4hr hibernation today; 60s production target)
- ✅ FCM push wired in api `services/firebase.ts`; `health: firebase=ok`
- ✅ Mobile E2E: phone+OTP → tasks → mark-complete with TEXT evidence (TEST_PHONE_PAIRS bypass)
- ✅ BR-11 incident declaration mobile UI (commit `8bc2c02` on main)
- ⏳ BR-08 escalation chain: code stub; 3-level test pending Phase B
- ⏳ BR-10 SMS fallback: blocked on Airtel DLT
- ⏳ BR-09 WhatsApp: blocked on Meta WABA approval

### v7 Phase A — COMPLETE + ITERATION (on `safecommand_v7` branch — pending merge to `main`)
All 12 Phase A steps + polish + post-handoff iteration + 2026-05-06 deploy + hotfix + zone-symmetry surfaces + Shifts & Roster module + Ops Console nav + MyShiftScreen landed. **38 commits ahead of main on `safecommand_v7`** (HEAD `5b53b0a`). Workers paused.

**Foundational artefacts:**
- ✅ ADR 0001 migration renumbering captured
- ✅ ADR 0002 branching decision captured
- ✅ ADR 0003 Supabase opaque-token migration captured
- ✅ AWS-process-doc-IMP.md §3.3 updated for new key model
- ✅ Security history rewrite complete (`origin/main` HEAD = `96594ad`; backup tag preserved at `772fd85`)
- ✅ This CLAUDE.md rewritten for v7 (91 BRs / 37 NFRs / 22 ECs / 22 Hard Rules)

**Code scaffold (`safecommand_v7`):**
- ✅ Mobile theme: `theme/{tokens,colours,ThemeProvider,layout,Drawer,index}.ts` (~1574 lines) — EC-17/Rule 19 satisfied
- ✅ Dashboard theme: `lib/theme/{types,wcag,ThemeProvider,index}.ts` + Tailwind v4 `@theme` brand-var integration
- ✅ Ops Console theme: always-SafeCommand provider (EC-14)
- ✅ 6 mobile screens retrofit to theme tokens — zero hardcoded `color: '#xxx'`
- ✅ DrawerTrigger + Drawer wired into TasksScreen with 5-group categorisation per UX-DESIGN-DECISIONS.md §4
- ✅ Apollo mockup spec (`docs/sales/apollo-mockup-spec.md`) — Path C live software approach
- ✅ Apollo deck spec (`docs/sales/apollo-deck-spec.md`) — 3-slide content + design

**Phase A polish (Drawer bugfixes from device testing):**
- ✅ Android status-bar overlap fixed (`StatusBar.currentHeight` paddingTop)
- ✅ Drawer animation race fixed (`shouldRender` lag-state, animated unmount)
- ✅ Drawer rows clickable (`Pressable`→`TouchableOpacity` + `setTimeout(..., 0)` consumer onPress defer)
- ✅ Drawer z-index inversion fixed — backdrop `z=drawer(100)`, drawer `z=overlay(200)`

**Phase B pre-writes (NOT yet deployed — June 2026):**
- ✅ `supabase/migrations/009_mbv.sql` (419 lines) — Spec Migration 007: buildings, building_visible(), 4-param set_tenant_context, all ALTER TABLEs, denormalisation triggers, RLS policies refreshed
- ✅ `supabase/migrations/010_brand_roaming_drill.sql` (330 lines) — Spec Migration 008: corporate_accounts, corporate_brand_configs (with CHECK on powered_by_text per EC-18/Rule 20), roaming_staff_assignments (10-venue trigger), drill_sessions + drill_session_participants
- ✅ `supabase/migrations/011_staff_lifecycle.sql` (164 lines) — staff lifecycle 4-state enum (ACTIVE/SUSPENDED/ON_LEAVE/TERMINATED) + status_reason + planned_return_date columns + `is_active` becomes generated column for backward compat + `enforce_terminated_oneway` trigger (compliance — wrongful-termination cover-up prevention) + CHECK constraint requiring reason ≥3 chars for non-ACTIVE rows
- ✅ `supabase/seeds/apollo-demo.sql` (166 lines) — Phase B Path C mockup seed (idempotent; needs founder SC Ops UUID + S3 logo before applying)
- ✅ `scripts/seed-test-tasks.sh` (210 lines, executable) — May testing bridge while workers paused
- ✅ `apps/scheduler/src/index.ts` env-driven `MASTER_TICK_INTERVAL` — runtime tick control without code change

**Capability extensions (post-handoff, 2026-05-05 evening):**
- ✅ **BR-19 Zone Accountability Map** — mobile screen wired into drawer PRIMARY group (THE hero demo per Plan §22 Rec #1). Stats strip + per-floor groups + status pills + assigned-staff names; uses existing `/v1/zones/accountability` endpoint. Visible to all roles.
- ✅ **BR-04/BR-13 Staff add via mobile (SH/DSH)** — full E2E flow: Manage Staff drawer item → list + slide-up Add modal → industry-leading keyboard handling (auto-focus, tab order, real-time validation, drag handle) → server allow-list (DSH/SC/FS/GS/FM only; blocks SH/GM/AUDITOR creation by SH/DSH). Validated end-to-end against CA Firm TEST-CA venue.
- ✅ **Staff lifecycle Phase 1 surface** — Ops Console Enable button (polymorphic action: red Deactivate when active; green Enable when inactive). Phase B replaces this with 4-state lifecycle + 4 endpoints.
- ✅ **API L1 governance** — `docs/api/conventions.md` (18 sections + §19 entity lifecycle pattern) — every Phase B endpoint has a checklist to satisfy.

**Capability extensions (2026-05-06 evening):**
- ✅ **Production schema deploy (Path B)** — migrations 009 + 010 + 011 deployed to Supabase production. Verified via row counts unchanged + CHECK constraint enforcement + generated column rejection tests. (`9a52a58`)
- ✅ **Mig 009 hotfix** — production-broke after deploy: 4-arg `set_tenant_context` did NOT replace 3-arg version; PostgREST RPC failed `PGRST203`. Fix: `DROP FUNCTION set_tenant_context(uuid,uuid,text)` on live schema; patched mig 009 source with explicit `DROP FUNCTION IF EXISTS` before `CREATE OR REPLACE`. (`4fd7964`)
- ✅ **BR-18 Zone Status Board on mobile + BR-19 Zone Accountability on dashboard** — symmetric primary surfaces on both platforms. Mobile drawer PRIMARY: 🚦 Zone Status (NEW) + 🗺️ Zone Accountability (existing). Dashboard sidebar Primary: 🚦 Zone Status (renamed from "Zone Board") + 🗺 Zone Accountability (NEW `/accountability` route, person-first roster grid with coverage-gap callout). Both surfaces consume same `/v1/zones/accountability` + `/incidents` endpoints. Identical DisplayState derivation across mobile + dashboard. (`7511561`)
- ✅ **Phase 5.1 — Ops Console Shifts & Roster module** (`807a255`) — `apps/ops-console/actions/shifts.ts` (340 lines) server actions for shift template CRUD + shift_instance lifecycle (PENDING → ACTIVE → CLOSED) + bulk-replace zone assignment pattern; `apps/ops-console/components/ZoneAssignmentGrid.tsx` (320 lines) client component with real-time 2-person validation and per-staff cards with floor-grouped zone toggles; `apps/ops-console/app/venues/[id]/page.tsx` 4th tab "Shifts & Roster" with Templates section + Today's Roster section (date picker, instance state machine, assignment grid per ACTIVE instance). Pure additive on Ops Console; existing tabs untouched. Industry pattern: Quinyx / Deputy / When I Work bulk-replace.
- ✅ **Ops Console home + global nav** (`a77fb9d` + `fb5d573`) — replaced `app/page.tsx` redirect with real Operations Overview dashboard (platform-wide stats: venues / staff / zones / incidents-today + recent venues + quick actions). New `components/TopNav.tsx` server component reads `ops_auth` cookie and renders persistent nav (logo→home, Home, Venues, Sign out) only when authed. Login page stays chrome-free. Auth gate pre-existed at `proxy.ts` (Next 16 renamed `middleware.ts` → `proxy.ts`); documented inline + added login-already-authed redirect for UX polish.
- ✅ **Phase 5.2 — Mobile MyShiftScreen** (`5b53b0a`) — `apps/mobile/src/screens/MyShiftScreen.tsx` (380 lines) staff-personal "my zones" view with identity header (avatar + role) + stats strip (zones / active / attention / clear / 2-person) + per-floor groups + friendly empty state. New `fetchMyZones(staffId)` service helper filters existing `/v1/zones/accountability` response client-side (NO Railway redeploy). Drawer PRIMARY group order: My Tasks → 🪪 My Shift (NEW) → 🚦 Zone Status → 🗺️ Zone Accountability → Declare Incident. Closes the loop end-to-end: SC Ops creates roster via Ops Console → mobile staff opens My Shift → sees their zones with status. **E2E validated** via DB simulation (assigned GS to 3 zones, SH to 2 different; verified filter returns exactly the matching zones per staff_id).

**Sales artefacts (validation gate readiness):**
- ✅ `docs/sales/validation-script.md` — print-friendly 5-question script + scoring rubrics + GO/NO-GO decision tree per Plan §22
- ✅ `docs/sales/validation-tracker.md` — markdown spreadsheet for 10-conversation capture + aggregate scoreboard + verbatim quote bank
- ✅ `docs/sales/apollo-mockup-spec.md` — Path C live-software mockup spec (Phase B implementation)
- ✅ `docs/sales/apollo-deck-spec.md` — 3-slide deck content + design spec

### Phase B (June 2026 unfreeze — single source of truth: `JUNE-2026-REVIEW-REQUIRED.md`)
**Pre-merge:** merge `safecommand_v7` → `main` before any Phase B operation. See `JUNE-2026-REVIEW-REQUIRED.md` § A.

**Sequence (per `JUNE-2026-REVIEW-REQUIRED.md`):**
1. **Stage 1** — Verify Upstash burn / worker state / apply AWS Activate credits
2. **Stage 2** — Apply migrations 009 + 010 (pre-written; just `supabase db push`); update api 4-param `set_tenant_context` calls; apply apollo-demo seed (after S3 logo upload + UUID replacement); record Apollo Loom; set workers always-on (`WORKERS_PAUSED=false`, `MASTER_TICK_INTERVAL=60000`)
3. **Stage 3** — Resume BR sequence: BR-10 → BR-08 → BR-12 → BR-13 → BR-A → BR-B → BR-14 → BR-15/16/17 → BR-18/19 → BR-39–55 + BR-64 (VMS) → BR-57–63 (MBV) → BR-20/29 (compliance + post-incident PDFs) → BR-32
4. **Stage 4** — 25-item go-live checklist (Business Plan §15.1)

**Pilot strategy (per Q4 decision):** Pilot 1 = single-building (clinic/boutique hotel); Pilot 2 = multi-building Hyderabad supermall. Hospital pilots blocked by Rule 12 / Phase 2 GCP migration.

### Phase C (Phase 2/3 post-pilot — out of scope here)
Roaming UI (BR-R1–R5) → Brand Layer UI (BR-83/84/86/87/88) → GCP asia-south1 migration → Corporate Governance (BR-65–80) → International data residency (BR-79, EC-21).

---

## 25-item Go-Live Checklist (v7 — supersedes 14-item v5 checklist)

Per Business Plan §15.1 — all 25 must pass before first pilot venue live.

| # | Gate | Verified by |
|---|------|-------------|
| 1 | RLS isolation: cross-venue query returns 0 rows | Code + DB test |
| 2 | Building isolation: Model A guard cannot see another building's zones | Integration test |
| 3 | SH venue-wide: sees all buildings simultaneously in tabbed view | Manual test |
| 4 | `building_visible()` function: 3 unit tests pass (NULL record / NULL session / scope match) | Automated unit test |
| 5 | `set_tenant_context()` called with 4 parameters including `p_building_id` | Code review |
| 6 | `zones_building_sync` trigger fires correctly on floor building assignment | DB test |
| 7 | `visit_inherit_building` trigger fires on `vms_visits` insert | DB test |
| 8 | Incident declaration: ≤5 seconds (3 timed runs, all pass) | Timed manual test |
| 9 | SEV2 building-scoped: only target building staff notified; SH/DSH notified | Integration test |
| 10 | SEV1 venue-wide: all buildings notified regardless of declared `building_id` (Rule 17) | Integration test |
| 11 | Offline mode: airplane mode → complete 5 tasks → reconnect → all 5 synced | Manual on physical device |
| 12 | VMS Mode 1: guard completes manual check-in in ≤60s on Redmi 9A | Timed test on physical device |
| 13 | VMS Mode 3: Aadhaar QR scanned and parsed correctly | Test with Aadhaar test card |
| 14 | VMS cross-building gate pass checkout works (admin client; `venue_id` enforced) | Integration test |
| 15 | Aadhaar audit query: `SELECT COUNT(*) FROM vms_visits WHERE LENGTH(masked_aadhaar) > 9` = 0 | DB query |
| 16 | Meta WA: all 12 templates approved and successfully sending on test WABA | Live template test |
| 17 | Airtel DLT: entity registered, SFCMND sender ID active, 5 DLT templates live | Live SMS test |
| 18 | Firebase FCM: rich push delivered on iOS test device (APNs) + Android (Redmi 9A) | Physical device test |
| 19 | Compliance PDF: generated for a single building in <60 seconds | Automated timer test |
| 20 | Multi-building compliance PDF: separate building sections in campus PDF | Manual review |
| 21 | 2G/3G simulation: critical flows (task, incident, evacuation) complete in <3s | Chrome DevTools + 3G SIM |
| 22 | Pilot venue: fully configured in Ops Console — buildings, floors, zones, schedules, staff | Ops Console review |
| 23 | Pilot venue SH: onboarded, app installed, first live task received and completed | SH walkthrough |
| 24 | Sentry: error alerts active and tested (manual error trigger → alert received) | Alert test |
| 25 | UptimeRobot: `api.safecommand.in/health` monitoring active; downtime alert tested | Downtime simulation |

---

## Code conventions (preserved from v6 — still valid)

- **Language:** TypeScript strict mode everywhere — no `any`, no implicit `any`
- **Validation:** Zod schemas in `packages/schemas/` — shared between API and frontend
- **Naming:** camelCase for variables/functions, PascalCase for types/classes, SCREAMING_SNAKE for enums
- **File naming:** kebab-case for files and directories
- **DB queries:** always set tenant context before query; never bypass RLS
- **Idempotency:** all write operations use `idempotency_key` or `ON CONFLICT DO NOTHING` (Rule 5)
- **Error responses:** `{ error: { code: string, message: string } }` — never leak stack traces
- **Env vars:** all secrets in Railway/Vercel/Amplify env — never hardcode or commit (Rule 1)
- **i18n:** all user-visible strings via `i18next` keys from Day 1 (EC-15 / Rule 11)
- **Theme tokens (NEW v7):** all colours via `useBrand()`; all labels via `useLabel()` — no hardcoded `#xxx` or hardcoded English (EC-17 / Rule 19)
- **Logging:** structured JSON to stdout (12-factor); never log PII
- **Tests:** every API route has at least one integration test; RLS tests in `supabase/tests/`
- **Imports:** use path aliases (`@safecommand/types`, `@safecommand/schemas`) — no deep relative imports
- **Branch posture:** v7 transition work on `safecommand_v7`; merge to `main` before June unfreeze (ADR 0002)
- **Migration citations:** "Spec Migration N (repo: `0NN_*.sql`)" — repo offset +2 from spec (ADR 0001)

---

## Quality requirements

- All API endpoints return structured `{ error: { code, message } }` on failure — never raw exceptions
- All inputs validated via Zod (.strict()) at route entry before any DB call (Rule 10)
- All DB queries use parameterised statements via Supabase client — no raw SQL string concatenation
- All secrets in environment variables — gitleaks blocks commits with secrets (Rule 1)
- All critical paths have integration tests (task completion, incident declaration, escalation chain)
- RLS isolation test: cross-venue query must return 0 rows — gate before every deploy
- Building isolation test (Phase B): Model A guard cannot see another building's zones — gate 2 of 25
- Idempotency test: duplicate task trigger must produce 0 new rows
- NFR-02 gate: incident declaration → push notification ≤5s — 3 timed runs required
- NFR-24 gate: Aadhaar number must never appear in DB — automated nightly audit query (Rule 13; gate 15 of 25)
- NFR-32 gate: SEV1 → CXO notification ≤30s (Phase 3)
- NFR-35 gate: WCAG 2.1 AA contrast (4.5:1) on safety-critical screens regardless of brand override (Phase A enforcement)
- Offline test: airplane mode → complete task → reconnect → verify sync (Rule 9)
- Brand layer test (Phase B): apollo-demo config applied → mockup screens render with Apollo logo + colours; 'Powered by SafeCommand' visible in Settings > About (Rule 20)
- ThemeProvider test (Phase A): all colours/labels in mobile + dashboard pass through `useBrand()` / `useLabel()`; default SafeCommand brand renders correctly with no `corporate_account_id` set

---

## Reference files (v7 — supersedes prior)

- **Business Plan v2:** `../../nexus/specs/2026-05-10_prime_business-plan-report-gen.md` (1127 lines, 91 BRs, 22 sections)
- **Architecture v7:** `../../nexus/specs/2026-05-10_SafeCommand_Architecture_v7_Complete.md` (6089 lines, 22 ECs, 22 Hard Rules)
- **Build state log:** `report-gen/SESSION_LOG.md` (gitignored — local only)
- **Phase A plan + security triage:** `report-gen/2026-05-04-22:30_plan.md`
- **ADR 0001 — Migration renumbering:** `docs/adr/0001-migration-renumbering.md`
- **ADR 0002 — `safecommand_v7` branch:** `docs/adr/0002-safecommand-v7-branch.md`
- **ADR 0003 — Supabase opaque-token keys:** `docs/adr/0003-supabase-publishable-secret-keys.md`

### Prior versions (kept for archaeology only — DO NOT cite for new work)
- `../../nexus/specs/2026-05-07_prime_business-plan-report-gen.md` (superseded by v2)
- `../../nexus/specs/2026-05-07_forge_architecture-report-gen.md` (v5/v6, superseded by v7)
- `../../nexus/decisions/2026-05-05_prime_business-proposal-report-gen.md` (initial proposal)

---

## Current sprint focus (as of 2026-05-05 evening)

**Branch:** `safecommand_v7` — **38 commits ahead of main**; HEAD `5b53b0a`; pending merge to main at June unfreeze
**Production schema:** post mig 009 + 010 + 011 deployed 2026-05-06; hotfix `4fd7964` (drop 3-arg `set_tenant_context` overload to fix PostgREST PGRST203) applied to live schema and patched into mig 009 source
**Roster/accountability loop:** end-to-end live (local) — Ops Console Shifts tab creates rosters → mobile MyShift + venue-wide Zone Status / Accountability surfaces auto-populate via existing `/v1/zones/accountability`
**Workers:** PAUSED (`WORKERS_PAUSED=true` on all 4 services — May freeze)
**Phase A:** ✅ Complete (12 steps + polish + iteration + Phase B pre-writes)
**Phase B:** ⏳ Pending June 2 unfreeze — see `JUNE-2026-REVIEW-REQUIRED.md` for the canonical action sequence

**Test venues created during May:**
- `Hyderabad Demo Supermall` (`SC-MAL-HYD-…` / `096a3701-beb0-4ffe-9e74-43af3c26e09f`) — 4 floors, 12 zones, 1 schedule template, 3 staff (1 SH active + 1 SH inactive + 1 GS active). Tower-prefixed naming convention (T1/T2/RB/PK/SV) ready for migration 009 retrofit to real MBV in June.
- `CA Firm TEST-CA` — used to validate mobile staff add E2E.

**Next sessions:**
1. **(May, ongoing)** Founder actions in flight — Meta WABA / Airtel DLT / OPC / trademark / Apple Dev Account / Google Play / domain `safecommand.in` / AWS Activate / Apollo logo upload / Apollo deck composition. Status tracked in `JUNE-2026-REVIEW-REQUIRED.md` § "Founder action checklist".
2. **(May, by 31 May)** Validation conversations gate — 10 conversations using `docs/sales/validation-script.md`; capture in `docs/sales/validation-tracker.md`; demo Zone Accountability Map (drawer → "Zone Accountability") on physical device; 7+ pain confirmed → GO; 2 pilots committed (1 single-building + 1 multi-building Hyderabad supermall per Q4 decision).
3. **(May testing, optional)** `./scripts/seed-test-tasks.sh --venue-code SC-MAL-HYD-… --hours N` to generate task_instances on demand without unpausing workers.
4. **(2 June 2026)** Execute `JUNE-2026-REVIEW-REQUIRED.md` end-to-end. First step: merge `safecommand_v7` → `main`. Then deploy migrations 009 + 010 + 011 + apollo-demo seed; build live Apollo Loom; resume BR sequence.

**Blocked on:** nothing engineering-side. All May 2026 engineering work is complete; remaining is founder-action and validation-gated.
