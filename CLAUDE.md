# SafeCommand — Claude Code Context

## 🔴 Critical operational controls — read before any infra/cost work

| Control | Where | What it does |
|---------|-------|--------------|
| **`WORKERS_PAUSED` env var** | Railway Console → service → Variables tab (per worker) | When `=true`, scheduler/escalation/notifier idle without crash. **First thing to check if "system seems broken"** — pushed/scheduled/escalated jobs all stop until resumed. See `reference_workers_paused_kill_switch.md` memory file or `AWS-process-doc-IMP.md` §11.4.0. |
| **Scheduler master-tick interval** | `apps/scheduler/src/index.ts` `TICK_MS` constant | Currently 4 hours (hibernation, May 2026 budget freeze). Production target = 60_000 ms. Change before any pilot/demo. |
| **JUNE-2026 review required** | `JUNE-2026-REVIEW-REQUIRED.md` at product root | Mandatory checklist on first June 2026 work session. Verifies May spend, decides whether to keep workers paused/hibernated. |
| **Deferred work in May 2026** | `UX-DESIGN-DECISIONS.md` Phases 1-5 | Mobile responsive dashboard redesign — fully analyzed, awaiting June 2026 budget unfreeze. |

**Companion docs at this folder root:**
- `AWS-process-doc-IMP.md` — full infra reference + decision log
- `UX-DESIGN-DECISIONS.md` — UX architecture + 5-phase responsive plan
- `DAILY-OPS.md` — daily start/end-of-day routine
- `upstash_redis.md` — Redis cost analysis + tick-rate tiers
- `JUNE-2026-REVIEW-REQUIRED.md` — time-sensitive review marker (delete after 2026-06-02 review)

---

## What this is

SafeCommand is a managed venue safety infrastructure platform that replaces paper checklists, WhatsApp groups, verbal procedures, and paper visitor registers at Indian hospitals, malls, and hotels with a configured, audited, and compliant system — operated daily so that when an emergency occurs, the team responds in seconds.

---

## Business requirements

### Functional Requirements (BR-01 to BR-55 — Phase 1 scope)

| ID | Requirement | Priority |
|----|-------------|----------|
| BR-01 | Multi-tenant — zero cross-venue data leakage at every layer | Critical |
| BR-02 | Venue Identity — SC-[TYPE]-[CITY]-[SEQ] auto-generated on onboarding | High |
| BR-03 | Operations Console — internal SC team tool, never accessible to venues | High |
| BR-04 | 8-Role permission model: SH, DSH, SC, GM, AUD, FM, FS, GS | Critical |
| BR-05 | Three-tier permission model: SC Platform / Venue Infrastructure / Venue Ops / Task Execution | Critical |
| BR-06 | Scheduled Activity Engine — time-triggered tasks (hourly to annual) per venue | Critical |
| BR-07 | Task completion tracking with evidence: photo, text, numeric, checklist | Critical |
| BR-08 | Escalation engine — auto-escalate missed tasks up command chain with timestamps | Critical |
| BR-09 | Dual-channel delivery — FCM push (primary) + WhatsApp Business API (parallel primary) | Critical |
| BR-10 | SMS fallback — auto-trigger if WhatsApp undelivered within 90 seconds | Critical |
| BR-11 | One-tap Incident Declaration — type, zone, confirm → escalation fires ≤5 seconds | Critical |
| BR-12 | Shift Handover protocol — outgoing logs, incoming confirms, authority transfers | High |
| BR-13 | Deputy SH Activation — manual, auto-emergency (5 min SH unresponsive), pre-scheduled | High |
| BR-14 | GM Dashboard — real-time health score, BI analytics, incident intelligence, benchmarks | High |
| BR-15 | GM Broadcast — venue-wide, floor, zone, role, individual, shift, command chain scopes | High |
| BR-16 | GM Custom Task — assignee, deadline, evidence type, escalation chain | High |
| BR-17 | Auditor role — full read, compliance report generation, audit flagging, zero writes | High |
| BR-18 | Zone Status Board — real-time colour-coded: All Clear / Attention / Incident Active | Critical |
| BR-19 | Zone Accountability Map — live map: named owner per zone per shift | High |
| BR-20 | Compliance exports — PDF/Excel: Fire NOC packages, NABH documentation, drill reports | High |
| BR-21 | Equipment & Maintenance Tracker — expiry alerts at 90/30/7 days | High |
| BR-22 | Staff Certification Tracker — role restriction alert on expiry | High |
| BR-23 | Special Events / Festival Mode — one-tap elevated safety posture | Medium |
| BR-24 | Visitor Safety Alert — QR opt-in, emergency push, all-clear. No app required | Medium |
| BR-25 | Venue-type activity templates — Hospital, Mall, Hotel, Corporate | High |
| BR-26 | Change Request workflow — CR inbox, SLA tracking, approval, audit log | Medium |
| BR-27 | Shift Briefing System — time-scheduled, role-scoped, acknowledgement tracked | High |
| BR-28 | Communication audit trail — sender, recipient, delivery, ack, escalation per message | Critical |
| BR-29 | Post-incident report auto-generation — timeline, responders, resolution, PDF export | High |
| BR-30 | Governing Body Integration — venue pre-registration, one-tap alert with floor plan | Medium — Phase 3 only |
| BR-31 | Analytics pipeline — safety health score, incident trends, response time, benchmarks | High |
| BR-32 | Cross-venue analytics — cohort benchmarking, India Safety Index (SC Ops Console only) | Medium — Phase 2 |
| BR-33 | Staff gamification — streak records, performance scorecards, Monthly Safety Star | Medium |
| BR-34 | Controlled Area logging — two-person confirmation for restricted zones | Medium |
| BR-35 | Offline mode — last 4 hours cached; completions queue locally, sync on reconnect | Critical |
| BR-36 | Multi-language UI — English (Phase 1), Hindi/Telugu/Kannada (Phase 2) | High |
| BR-37 | Subscription tier enforcement — Essential / Professional / Enterprise / Chain gating | High |
| BR-38 | Change Request fee management — count per tier, fee calculation, billing | Medium |

#### Visitor Management System (VMS — BR-39 to BR-55, Phase 1)

| ID | Requirement | Priority |
|----|-------------|----------|
| BR-39 | VMS Entry Points — configurable check-in points per floor per venue (name, location, operating hours, assigned guard) | High |
| BR-40 | VMS Check-In Mode 1: Manual Entry — guard types visitor name, phone, purpose, host name; photo capture optional | Critical |
| BR-41 | VMS Check-In Mode 2: ID Card Photo Capture — camera captures ID card image (Aadhaar/PAN/DL/Passport); stored as evidence; name auto-extracted via OCR | High |
| BR-42 | VMS Check-In Mode 3: Aadhaar QR Scan — guard scans Aadhaar QR code using device camera; UIDAI offline XML parsed locally; name/DOB/gender auto-populated; no Aadhaar number stored (masked) | High |
| BR-43 | VMS Check-In Mode 4: Pre-Registration — host staff pre-registers visitor via app/dashboard; visitor receives QR code; guard scans QR for instant check-in (no typing) | High |
| BR-44 | VMS Check-In Mode 5: Self-Service QR Kiosk — visitor scans venue QR, fills form on own phone browser (no app), guard approves on mobile — zero hardware required | Medium |
| BR-45 | VMS Visitor Photo — optional camera capture of visitor face at check-in for gate pass / record | High |
| BR-46 | VMS Check-Out Tracking — guard records check-out time; system tracks time-on-premises; overstay alerts if visitor exceeds expected duration | High |
| BR-47 | VMS Host Notification — on visitor check-in: host staff member notified via push + WhatsApp ("Your visitor [Name] has arrived at [Entry Point]") | High |
| BR-48 | VMS Entry Point Customisation — per entry point: custom fields (vehicle number, laptop serial, visitor company, badge number), required vs optional fields, photo mandatory toggle, ID required toggle | High |
| BR-49 | VMS Visitor Blacklist — Security Head can flag visitor as blacklisted; alert fires if blacklisted visitor attempts check-in at any entry point in venue | High |
| BR-50 | VMS Digital Gate Pass — generated on check-in (QR code); shown on visitor phone; guard scans at exit for check-out confirmation | Medium |
| BR-51 | VMS Emergency Integration — during active incident, visitor log is accessible from incident evacuation board; visitor QR opt-in safety alerts extend to VMS visitors | Critical |
| BR-52 | VMS Reporting — daily visitor log (per entry point, per floor, per venue), peak hour analytics, average dwell time, repeat visitor tracking, compliance export | High |
| BR-53 | VMS Overstay Alerts — configurable per entry point; alert fires to guard + SH when visitor exceeds expected_duration; escalates if no action in 15 minutes | High |
| BR-54 | VMS Repeat Visitor Recognition — mobile number-based recognition; returning visitors shown previous visit history; pre-fills name/company on re-entry | Medium |
| BR-55 | VMS Data Retention — visitor records retained for minimum 90 days (configurable per tier up to 3 years); auto-purge with audit log per DPDP Act | High |
| BR-56 | VMS Contractor / Vendor Mode — special visitor type for contractors with permit number, work zone, expected duration, material carried — tracked separately from regular visitors | Medium — Phase 2 only |

---

### Non-Functional Requirements (NFR-01 to NFR-24)

| ID | Requirement | Target | How Enforced |
|----|-------------|--------|-------------|
| NFR-01 | Multi-tenancy isolation | Zero cross-venue data access | PostgreSQL RLS + API middleware + storage path scoping |
| NFR-02 | Incident escalation latency | ≤5 seconds: declaration → first notification | High-priority async queue; API returns immediately |
| NFR-03 | WhatsApp delivery SLA | SMS fallback if WA undelivered in 90 seconds | Notification worker delayed job pattern |
| NFR-04 | Task completion UX | Max 3 taps: notification → submitted | Design review gate per screen |
| NFR-05 | Reading load — critical flows | Max 20 words before any action | Copy review gate for all safety-critical screens |
| NFR-06 | Device coverage | Android INR 5,000–8,000; iOS iPhone 8+ | Physical device test matrix — gate before pilot |
| NFR-07 | Connectivity | 2G/3G compatible for all critical flows | Payload <10KB for critical paths; offline cache |
| NFR-08 | Touch targets | Minimum 48×48dp all interactive elements | StyleSheet enforcement + lint rule |
| NFR-09 | Offline cache | Last 4 hours of tasks; completions queue locally | Expo SQLite + pending completions table |
| NFR-10 | Zone board refresh | ≤30s for GM dashboard; instant for command roles | Supabase Realtime (Phase 1) / Pub/Sub WS (Phase 2) |
| NFR-11 | Data sovereignty | Files in India from Day 1 (AWS S3 ap-south-1); all data in India by Phase 2 | Enforced in migration gate — no hospital sales before Phase 2 |
| NFR-12 | DPDP Act compliance | Full compliance before first hospital contract | Legal review + Data Processing Agreements with all vendors |
| NFR-13 | Availability | 99.5%+ uptime (safety infrastructure) | Multi-replica compute + managed DB + health checks |
| NFR-14 | Scheduling scale | 100,000+ daily task triggers | Queue-based scheduling — never in-process timers |
| NFR-15 | Concurrent WebSocket | 500+ concurrent (Phase 1 Supabase); unlimited (Phase 2 GCP) | Supabase Pro limit; upgrade trigger at 15 venues |
| NFR-16 | Authentication security | JWT + RLS + HTTPS everywhere | Three-layer defence model |
| NFR-17 | Audit immutability | Append-only, no modification possible | PostgreSQL INSERT-only policy; no UPDATE/DELETE policy exists |
| NFR-18 | Low operational overhead | Managed services only — no self-hosted infrastructure | Architecture review gate — self-hosted = rejected |
| NFR-19 | Solo buildable (Phase 1) | 16-week sprint with Claude Code | Railway + Supabase developer experience |
| NFR-20 | Gross margin | 70%+ cash gross margin at 20 venues | Cost model tracked monthly; Phase 1: ~94% infra margin |
| NFR-21 | VMS check-in speed | Guard completes full visitor check-in in ≤60 seconds (manual mode) | UX design review + physical device timing test |
| NFR-22 | VMS offline operation | Guard can check in visitors and view current visitor log with no internet; sync on reconnect | Expo SQLite VMS cache; same offline-first pattern as task system |
| NFR-23 | ID card photo storage | ID card images encrypted at rest; access-controlled to SH/DSH/AUD only; never in mobile gallery | S3/GCS server-side encryption; presigned URL with role check |
| NFR-24 | Aadhaar compliance | No Aadhaar number stored in DB; masked version only (last 4 digits); QR parsing is offline (no UIDAI API call for visitor check-in) | Code review gate; DB schema enforces masked_aadhaar only |

---

### Absolute Engineering Constraints (non-negotiable — violating in code review is a blocker)

| ID | Constraint |
|----|-----------|
| EC-01 | PostgreSQL as the database engine — RLS multi-tenancy is PostgreSQL-specific |
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

---

## Architecture — Data model

### Users, Roles, and Interfaces

```
ROLE                  CODE    INTERFACE
────────────────────  ──────  ──────────────────────────────────────────
Ground Staff          GS      Mobile App (primary) + WhatsApp (parallel)
Floor Supervisor      FS      Mobile App + WhatsApp
Shift Commander       SC      Mobile App + Web Dashboard
Security Head         SH      Mobile App + Web Dashboard
Deputy Security Head  DSH     Mobile App + Web Dashboard
Facility Manager      FM      Mobile App + Web Dashboard
General Manager       GM      Web Dashboard (primary) + Mobile App
Auditor               AUD     Web Dashboard (read-only)
────────────────────  ──────  ──────────────────────────────────────────
SC Ops Team           —       Operations Console (internal, never public)
```

## Architecture — Components

### System Components

```
COMPUTE LAYER  (Railway — GCP us-central1)
  Service: api          Node.js 20 + Express + TypeScript, 2 replicas
                        → api.safecommand.in
                        Handles: auth, REST API, presigned URLs, webhooks

  Service: scheduler    Bull queue consumer: 'schedule-generation', 1 replica
                        → Generates task_instances from schedule_templates
                        → Schedules escalation delayed jobs

  Service: escalation   Bull queue consumer: 'escalations' (priority queue), 1 replica
                        → Detects missed windows, fires escalation chain
                        → Handles incident-level escalations at highest priority

  Service: notifier     Bull queue consumer: 'notifications', 1 replica
                        → FCM push (iOS + Android) — parallel with WhatsApp
                        → Meta WhatsApp Cloud API — interactive messages
                        → Airtel SMS — delayed 90s fallback with circuit breaker

WEB LAYER  (Vercel)
  apps/dashboard        Next.js — Venue Dashboard (SH/GM/AUD/FM/SC)
                        → app.safecommand.in

  apps/ops-console      Next.js — Operations Console (SC Ops Team ONLY)
                        → ops.safecommand.in (separate auth domain — EC-14)

MOBILE LAYER
  apps/mobile           Expo React Native SDK 51+ — iOS + Android
                        Firebase Auth (Phone OTP) + FCM push

DATA LAYER
  Supabase PostgreSQL   AWS us-east-1, Pro plan, PITR 7-day, RLS enforced
  Upstash Redis         Serverless, Bull queue backend, AOF persistence
  AWS S3 ap-south-1     India file storage from Day 1, SSE-S3 encryption

EXTERNAL CHANNELS  (3 independent failure modes)
  Meta WhatsApp Business API   Interactive messages, 2-way button reply
  Airtel Business SMS          DLT-registered TRAI, ~90s SMS fallback
  Firebase FCM                 iOS (APNs) + Android push, always active
```

### Monorepo Structure

```
platform/                          ← GitHub monorepo root
├── apps/
│   ├── api/                       ← Railway: REST API service
│   │   └── src/
│   │       ├── middleware/
│   │       │   ├── auth.ts        ← JWT verify + req.auth population
│   │       │   ├── tenant.ts      ← SET LOCAL session variables for RLS
│   │       │   ├── validate.ts    ← Zod schema validation factory
│   │       │   ├── rateLimit.ts   ← Rate limiters (Upstash Redis store)
│   │       │   └── audit.ts       ← Auto-writes to audit_logs on mutations
│   │       ├── routes/
│   │       │   ├── auth.ts, venues.ts, staff.ts, zones.ts
│   │       │   ├── tasks.ts, incidents.ts, shifts.ts, handovers.ts
│   │       │   ├── communications.ts, analytics.ts, compliance.ts
│   │       │   ├── equipment.ts, certifications.ts, changeRequests.ts
│   │       │   ├── visitors.ts
│   │       │   └── webhooks/meta.ts, webhooks/airtel.ts
│   │       └── services/
│   │           ├── db.ts          ← Supabase client (service role key)
│   │           ├── storage.ts     ← S3 presigned URL generation
│   │           └── pdf.ts         ← PDFKit report generation
│   ├── scheduler/                 ← Railway: Scheduling worker
│   ├── escalation/                ← Railway: Escalation worker
│   ├── notifier/                  ← Railway: Notification worker
│   ├── mobile/                    ← Expo React Native (iOS + Android)
│   ├── dashboard/                 ← Next.js Venue Dashboard (Vercel)
│   └── ops-console/               ← Next.js Operations Console (Vercel)
├── packages/
│   ├── db/                        ← Supabase client + type-safe helpers
│   ├── types/                     ← Shared TypeScript types (all apps)
│   ├── schemas/                   ← Shared Zod validation schemas
│   └── queue/                     ← Bull queue definitions (shared)
├── supabase/
│   ├── migrations/                ← 001_enums.sql, 002_tables.sql, etc.
│   └── functions/                 ← Edge Functions (JWT hook)
└── .github/workflows/             ← CI/CD pipelines
```

### Data Model — Core Entity Relationships

```
VENUE  ──── root of every RLS policy
  ├── FLOORS (1:N)
  │     └── ZONES (1:N)
  │           └── ZONE_STATUS_LOG (1:N, append-only)
  ├── STAFF (1:N)
  │     ├── STAFF_ZONE_ASSIGNMENTS (junction: staff × zone × shift_date)
  │     └── STAFF_CERTIFICATIONS (1:N)
  ├── SHIFTS (1:N) → SHIFT_INSTANCES (1:N) → SHIFT_HANDOVERS (1:1)
  ├── SCHEDULE_TEMPLATES (1:N)
  │     └── TASK_INSTANCES (1:N)
  │           ├── TASK_COMPLETIONS (1:1 when done)
  │           └── ESCALATION_EVENTS (1:N per missed window)
  ├── CUSTOM_TASKS (1:N) → TASK_COMPLETIONS
  ├── INCIDENTS (1:N)
  │     ├── INCIDENT_TIMELINE (1:N, append-only)
  │     └── INCIDENT_REPORTS (1:1 auto-generated on resolution)
  ├── COMMUNICATIONS (1:N) → COMM_DELIVERIES (1:N per recipient × channel)
  ├── EQUIPMENT_ITEMS (1:N)
  ├── CHANGE_REQUESTS (1:N)
  ├── VENUE_SUBSCRIPTIONS (1:1)
  ├── AUDIT_LOGS (1:N, IMMUTABLE — INSERT-only)
  └── VMS_ENTRY_POINTS (1:N) → VMS_VISIT_RECORDS (1:N)
```

**Tenant isolation rule:** `venue_id` is present on every table. Every RLS policy checks `venue_id`. No table is exempt.

**RLS session context set before every query:**
```sql
SELECT set_tenant_context(p_venue_id, p_staff_id, p_role);
-- sets app.current_venue_id, app.current_staff_id, app.current_role
```

**Append-only tables (no UPDATE/DELETE policy):**
- `audit_logs` — compliance requirement
- `zone_status_log` — status history
- `incident_timeline` — incident chronology

### Key Enums

```
staff_role_enum:       SH | DSH | SHIFT_COMMANDER | GM | AUDITOR | FM | FLOOR_SUPERVISOR | GROUND_STAFF
subscription_tier:     ESSENTIAL | PROFESSIONAL | ENTERPRISE | CHAIN
task_status:           PENDING | IN_PROGRESS | COMPLETE | MISSED | ESCALATED | LATE_COMPLETE
evidence_type:         NONE | PHOTO | TEXT | NUMERIC | CHECKLIST
incident_type:         FIRE | MEDICAL | SECURITY | EVACUATION | STRUCTURAL | OTHER
incident_severity:     SEV1 | SEV2 | SEV3
delivery_channel:      APP_PUSH | WHATSAPP | SMS
frequency_type:        HOURLY | EVERY_2H | EVERY_4H | EVERY_6H | EVERY_8H | DAILY | WEEKLY | MONTHLY | QUARTERLY | ANNUAL | CUSTOM
checkin_mode (VMS):    MANUAL | ID_PHOTO | AADHAAR_QR | PRE_REGISTERED | SELF_SERVICE_QR
visitor_status (VMS):  CHECKED_IN | CHECKED_OUT | OVERSTAY | DENIED | BLACKLISTED_ATTEMPT
```

## Architecture — API design

### Endpoints

**Base URL:** `https://api.safecommand.in/v1`
**Auth:** `Authorization: Bearer {jwt}` on all endpoints except `/auth/*`, `/visitor/*`, and webhooks
**Format:** `Content-Type: application/json`

```
AUTHENTICATION
  POST  /auth/send-otp          { phone }        → sends OTP (rate: 5/15min/phone)
  POST  /auth/verify-otp        { phone, otp }   → { access_token, refresh_token }
  POST  /auth/refresh           { refresh_token } → { access_token }
  POST  /auth/logout            → revokes refresh token
  POST  /auth/device-token      { token, platform: ANDROID|IOS } → registers FCM/APNs token

VENUE
  GET   /venue                  → current venue profile + subscription tier
  PATCH /venue                  → update contact info (SH/DSH only)
  GET   /venue/health-score     → health score (0-100) + component breakdown
  GET   /venue/compliance-readiness
  PUT   /venue/festival-mode    { active: true|false }

FLOORS + ZONES
  GET   /floors                 → all floors with zone counts
  GET   /floors/:id/zones       → zones on floor with current status + assigned staff
  PUT   /zones/:id/status       { status: ALL_CLEAR|ATTENTION|INCIDENT_ACTIVE }
  GET   /zones/accountability   → Zone Accountability Map (named owner per zone per shift)

STAFF
  GET   /staff                  → all staff (SH/GM/AUD only)
  POST  /staff                  → create staff (SH only)
  PATCH /staff/:id              → update role/status
  POST  /staff/:id/deputy-activate  → activate DSH manually
  GET   /staff/on-duty          → currently on-duty staff with zone assignments

TASKS
  GET   /tasks                  → my tasks (filtered by role/assignment)
  GET   /tasks?date=YYYY-MM-DD  → tasks for date
  POST  /tasks/:id/complete     { evidence_type, evidence_url|text|numeric|checklist }
  GET   /tasks/pending          → missed + overdue tasks (SH/SC view)

SCHEDULING
  GET   /schedule-templates     → all templates for venue (SC Ops Console)
  POST  /schedule-templates     → create template (SC Ops only)
  PATCH /schedule-templates/:id
  DELETE /schedule-templates/:id

INCIDENTS
  POST  /incidents              { incident_type, severity, zone_id, description }
                                → writes DB → returns 201 IMMEDIATELY
                                → async: enqueues incident escalation (priority 0)
  GET   /incidents              → active + recent incidents
  GET   /incidents/:id          → full incident detail
  PUT   /incidents/:id/status   { status: CONTAINED|RESOLVED|CLOSED }
  POST  /incidents/:id/staff-safe  → evacuation confirmation ("I AM SAFE")
  GET   /incidents/:id/evacuation → live board: safe / unaccounted staff

SHIFTS
  GET   /shifts                 → shift templates
  GET   /shift-instances?date=  → shift instances for date
  POST  /shift-instances/:id/activate
  POST  /shift-instances/:id/zone-assignments  { zone_id, staff_id, assignment_type }
  POST  /handovers              { outgoing_instance_id, incoming_instance_id, notes, snapshots }
  PUT   /handovers/:id/accept

COMMUNICATIONS
  POST  /communications         { scope_type, scope_id, purpose_type, message, scheduled_at }
  GET   /communications         → communications log
  GET   /communications/briefings → pending briefings requiring acknowledgement
  POST  /communications/:id/acknowledge

ANALYTICS
  GET   /analytics/dashboard    → GM dashboard KPIs
  GET   /analytics/incidents    → incident trends
  GET   /analytics/tasks        → task compliance rate
  GET   /analytics/staff        → staff performance + streaks
  GET   /analytics/financial-risk

COMPLIANCE
  GET   /compliance/export      { type: FIRE_NOC|NABH|FULL_AUDIT, from, to }
                                → generates PDF → uploads to S3 → returns presigned URL

EQUIPMENT
  GET   /equipment              → all equipment items with status
  POST  /equipment              → add item
  PATCH /equipment/:id
  GET   /equipment/expiring     → items due for service in next 30 days

CERTIFICATIONS
  GET   /certifications         → all staff certs
  POST  /certifications         → add certification
  GET   /certifications/expiring → certs expiring in next 30 days

CHANGE REQUESTS
  POST  /change-requests        → submit CR
  GET   /change-requests        → venue's CR history + status

VISITOR MANAGEMENT (VMS)
  GET   /vms/entry-points       → configured entry points for venue
  POST  /vms/checkin            { mode, entry_point_id, visitor_data, id_photo_url }
  POST  /vms/checkout           { visit_record_id }
  GET   /vms/visits             { date?, entry_point_id? } → visitor log
  GET   /vms/visits/active      → currently checked-in visitors
  POST  /vms/blacklist          { visitor_id }
  GET   /vms/pre-registrations  → pending pre-registered visitors
  GET   /vms/reports/daily      → daily summary

VISITOR QR (no auth)
  POST  /visitor/opt-in         { venue_id, phone } → { qr_token }
  GET   /visitor/self-checkin/:venue_token → kiosk landing page

WEBHOOKS (HMAC-verified)
  POST  /webhooks/meta          → WhatsApp inbound messages + delivery callbacks
  POST  /webhooks/airtel        → SMS delivery callbacks
```

### Notification Architecture

```
Incident declared → POST /incidents → DB write → return 201
  → async: enqueue to 'escalations' queue (priority 0)
  → escalation-worker: resolve all on-duty staff
  → enqueue FCM jobs + WA jobs simultaneously to 'notifications' queue
  → notifier-worker: send FCM push AND WhatsApp in parallel
  → if WA undelivered in 90s: enqueue SMS fallback job
  → comm_deliveries: record status at each step
  → total time: declaration → first push ≤5 seconds (NFR-02)

Task missed → escalation-worker detects at window_expires_at
  → resolve next role from escalation_chain[level]
  → find on-duty staff with that role
  → insert escalation_events row
  → enqueue priority-1 notification job
  → schedule next escalation level delayed job
```

---

## Architecture — User flow

Step-by-step new user journey (from SC Ops onboarding through daily operations):

**1. Venue onboarding (SC Ops Console — ops.safecommand.in)**
- SC Ops creates venue record → auto-generates `venue_code` (e.g. SC-MAL-HYD-00042)
- SC Ops creates floors, zones, zone types, two-person-required toggles
- SC Ops creates schedule templates (frequency, assigned role, evidence type, escalation chain)
- SC Ops creates initial SH account (phone number → Firebase auth_id → staff record)

**2. Security Head first login (Mobile App + Web Dashboard)**
- SH receives WhatsApp welcome message with app download link
- SH opens app → Phone OTP login → FCM device token registered
- SH adds staff: Ground Staff, Floor Supervisors, Shift Commanders
- New staff receive WhatsApp welcome + app download link automatically

**3. Staff daily workflow (Mobile App + WhatsApp)**
- Scheduling engine ticks every 60 seconds — generates `task_instances` from active templates
- Each staff member receives FCM push + WhatsApp notification for their assigned tasks
- Ground staff: tap notification → open task → complete with evidence (photo/text/checklist) → 3 taps max
- Task completion syncs instantly; if on airplane mode, queues locally and syncs on reconnect

**4. Escalation chain (automatic)**
- Task missed at window_expires_at → escalation-worker fires
- Level 1: Floor Supervisor notified (via push + WhatsApp)
- Level 2: Shift Commander notified (+30 min default)
- Level 3: Security Head notified (+60 min default)
- Each level logged in `escalation_events` with timestamp

**5. Shift management (Shift Commander — Mobile App + Dashboard)**
- Shift Commander activates shift → assigns staff to zones for the shift period
- Coverage gap alert fires if any zone has no PRIMARY assignment
- End of shift: outgoing commander submits handover (with open incidents + zone snapshots)
- Incoming commander accepts handover → authority transfers, audit logged

**6. Incident declaration (any command role — Mobile App)**
- 3-tap flow: type → zone → confirm
- API returns 201 in <200ms; notification to all on-duty staff fires within ≤5 seconds
- All zones update to INCIDENT_ACTIVE on Supabase Realtime → dashboards reflect instantly
- Staff tap [I AM SAFE] button → evacuation board updates in real-time
- GM / SH sees live evacuation board: safe / unaccounted staff count per zone

**7. GM situational awareness (Web Dashboard — app.safecommand.in)**
- Health score (0–100) auto-computed nightly: task compliance 40%, incident response 25%, cert coverage 15%, equipment status 10%, drill completion 10%
- Zone Accountability Map: every zone shows named owner, last check-in time, current status — answered in 1 second
- GM Broadcast: send message to any scope (venue-wide, floor, zone, role, individual)
- GM Custom Task: assign one-off task with deadline, evidence requirement, escalation chain

**8. Auditor / compliance export (Web Dashboard — read-only)**
- Auditor opens dashboard → browses audit trail, incident log, task history
- Compliance export: select type (Fire NOC / NABH / Full Audit) → PDF generated via PDFKit → S3 presigned URL returned → download
- PDF includes zone list, equipment status, cert status, drill history, incident log for period

**9. VMS visitor check-in (Guard — Mobile App)**
- Guard at entry point opens VMS screen → selects check-in mode
- Manual: type name, phone, purpose, host → optional photo → check-in recorded
- Aadhaar QR: scan QR with camera → UIDAI XML parsed locally → name/DOB auto-filled → no Aadhaar number stored
- Pre-registered visitor: scan visitor QR code → instant check-in (no typing)
- Host staff notified via push + WhatsApp: "Your visitor [Name] has arrived at [Entry Point]"
- On active incident: VMS visitor log appears on evacuation board automatically (BR-51)

---

## Build phases

### Sprint 1 — Foundation (Weeks 1–2, June 2026)

**Goal:** Database deployed, RLS proven, project skeleton running, Ops Console scaffolded

**BRs in scope:**
- BR-01: Multi-tenant RLS isolation at database and API middleware layers
- BR-02: Venue Identity auto-generation (SC-[TYPE]-[CITY]-[SEQ]) in Ops Console onboarding wizard
- BR-03: Operations Console scaffold (separate Supabase auth project, venue onboarding wizard, floor + zone editor, schedule template CRUD)
- BR-04: 8-Role permission model encoded in JWT middleware matrix
- BR-05: Three-tier permission middleware — SC Platform / Venue Infrastructure / Venue Ops / Task Execution

**Deliverables:**
- Supabase: all migrations deployed (001_enums → 005_seed_templates); Realtime on `zones` + `incidents`
- Railway `api` service: `GET /health` returns 200; auth endpoints live; JWT + tenant middleware
- Expo: project scaffold compiles on physical iOS + Android device; i18next configured
- Upstash Redis: connected; Bull queue definitions registered
- GitHub Actions: test workflow runs on every PR; gitleaks pre-commit hook active
- Ops Console: venue onboarding, floor editor, zone editor, schedule template CRUD, initial SH creation

**Gates before Sprint 2:**
1. RLS Isolation Proof: create 2 venues, query venue_1 tasks as venue_2 staff → 0 rows returned
2. Full Venue Creation: 3 floors, 12 zones, 5 schedule templates, 1 SH account — all via Ops Console; SH can log in to mobile app

**Target dates:** Start June 2026 (after Go/No-Go validation gate passes 31 May 2026)

---

### Sprint 2 — Scheduling Engine + Notification Stack (Weeks 3–4, June 2026)

**Goal:** Tasks generate automatically and are delivered via push + WhatsApp

**BRs in scope:**
- BR-06: Scheduled Activity Engine — scheduler-worker generates task_instances from schedule_templates every 60 seconds
- BR-07: Task completion tracking with evidence (photo, text, numeric, checklist) including S3 presigned URL upload flow
- BR-09: Dual-channel delivery — FCM push (primary) + WhatsApp Business API (parallel primary) for task assignments
- BR-10: SMS fallback — Airtel SMS auto-triggered if WhatsApp undelivered within 90 seconds
- BR-25: Venue-type activity templates — seed templates for Hospital, Mall, Hotel, Corporate venue types
- BR-28: Communication audit trail — `comm_deliveries` records per recipient × channel with delivery status

**Deliverables:**
- `scheduler` service: Bull repeatable tick (every 60s, singleton jobId); `computeNextDue()` for all frequency types; idempotency via `ON CONFLICT idempotency_key DO NOTHING`
- `notifier` service: Firebase Admin SDK FCM push; Meta WhatsApp Cloud API interactive messages; Airtel SMS; parallel push + WA with 90s SMS fallback; circuit breakers (`waCircuit`, `smsCircuit`)
- Meta webhook: HMAC signature verification + button reply parsing
- Mobile: `GET /tasks/my` with Expo SQLite 4-hour offline cache; task completion flow with evidence upload to S3
- All 8 WhatsApp message templates submitted to Meta for approval (task_assigned, escalation_alert, incident_alert, evacuation_confirm, shift_briefing, broadcast, cert_expiry, equipment_alert)

**Gates before Sprint 3:**
1. Scheduling Idempotency: create HOURLY template → wait 60 seconds → verify 1 task_instance created → trigger tick again → verify 0 new rows
2. Full Notification Chain: staff with device_token + whatsapp_number → FCM push within 3 seconds → WhatsApp interactive message within 3 seconds → button reply → `comm_deliveries.status = ACKNOWLEDGED` → wait 90 seconds without reply → SMS arrives on test phone

---

## Stack

| Layer | Technology | Justification |
|-------|-----------|---------------|
| API runtime | Node.js 20 + TypeScript strict | Single language across monorepo; TypeScript strict enforces correctness |
| API framework | Express + Zod validation | Minimal, proven, easy Railway deployment |
| Database | Supabase PostgreSQL (Pro plan) | PostgreSQL RLS = multi-tenancy at DB layer (EC-01, EC-02) |
| DB client | Supabase JS client (service role) | Type-safe, Realtime subscriptions, Auth integration |
| Queue | BullMQ + Upstash Redis | Serverless Redis backend; jobs survive service restarts (EC-05) |
| Compute | Railway (4 separate services) | Independent crash cycles; independent scaling per service |
| Mobile | Expo React Native SDK 51+ | iOS + Android from one codebase; solo-founder viable (EC-07) |
| Mobile auth | Firebase Auth — Phone OTP | Production OTP at zero marginal cost; FCM same project |
| Push | Firebase Cloud Messaging (FCM) | Covers APNs (iOS) + Android; free, reliable, global |
| Web dashboards | Next.js 14 + Vercel | Server-side rendering for analytics; fast Vercel deploys |
| WhatsApp | Meta WhatsApp Business Cloud API (direct) | Only API delivering 90%+ open rates for India ground staff (EC-11) |
| SMS | Airtel Business SMS (DLT-registered) | TRAI compliance (EC-12); India-native fallback |
| File storage | AWS S3 ap-south-1 | India data residency from Day 1 (NFR-11); SSE-S3 encryption |
| Realtime | Supabase Realtime | Zone board + incident board live updates (NFR-10) |
| PDF generation | PDFKit | Server-side compliance PDF generation (BR-20, BR-29) |
| OCR (VMS) | Google Cloud Vision API (or Tesseract local) | ID card name extraction for BR-41 |
| Monitoring | Sentry (errors) + UptimeRobot (uptime) | Go-live checklist requirement |
| CI/CD | GitHub Actions | Test on every PR; deploy on merge to main |
| Secret scanning | gitleaks pre-commit hook | Security gate from first commit |

---

## Code conventions

- **Language:** TypeScript strict mode everywhere — no `any`, no implicit `any`
- **Validation:** Zod schemas in `packages/schemas/` — shared between API and frontend
- **Naming:** camelCase for variables/functions, PascalCase for types/classes, SCREAMING_SNAKE for enums
- **File naming:** kebab-case for files and directories
- **DB queries:** always set tenant context before query; never bypass RLS
- **Idempotency:** all write operations use `idempotency_key` or `ON CONFLICT DO NOTHING`
- **Error responses:** `{ error: { code: string, message: string } }` — never leak stack traces
- **Env vars:** all secrets in Railway/Vercel env — never hardcode or commit
- **i18n:** all user-visible strings via `i18next` keys from Day 1 (EC-15) — no hardcoded English
- **Logging:** structured JSON to stdout (12-factor); never log PII
- **Tests:** every API route has at least one integration test; RLS tests in `supabase/tests/`
- **Imports:** use path aliases (`@safecommand/types`, `@safecommand/schemas`) — no deep relative imports

---

## Quality requirements

- All API endpoints return structured `{ error: { code, message } }` on failure — never raw exceptions
- All inputs validated via Zod at route entry point before any DB call
- All DB queries use parameterised statements via Supabase client — no raw SQL string concatenation
- All secrets in environment variables — gitleaks blocks commits with secrets
- All critical paths have integration tests (task completion, incident declaration, escalation chain)
- RLS isolation test: cross-venue query must return 0 rows — gate before every deploy
- Idempotency test: duplicate task trigger must produce 0 new rows
- NFR-02 gate: incident declaration → push notification ≤5 seconds — 3 timed runs required
- NFR-24 gate: Aadhaar number must never appear in DB — automated nightly audit query
- Offline test: airplane mode → complete task → reconnect → verify sync

---

## Current sprint

**Building:** Sprint 1 foundation (Weeks 1–2)

**Sprint 1 BRs in scope:**
- BR-01: Multi-tenant RLS isolation (database + API middleware)
- BR-02: Venue Identity auto-generation (SC-[TYPE]-[CITY]-[SEQ])
- BR-03: Operations Console scaffold (separate auth domain, venue onboarding wizard)
- BR-04: 8-Role permission model (SH, DSH, SHIFT_COMMANDER, GM, AUDITOR, FM, FLOOR_SUPERVISOR, GROUND_STAFF)
- BR-05: Three-tier permission middleware matrix

**Sprint 1 deliverables (from Weeks 1–2 architecture plan):**
- All Supabase migrations deployed (001_enums → 005_seed_templates)
- Supabase Realtime enabled on `zones` + `incidents` tables
- Railway: api service deployed — `GET /health` returns 200
- Expo: project scaffold compiles and runs on physical iOS + Android device
- i18next configured — all user-visible strings use translation keys
- Upstash Redis connected — Bull queue definitions registered
- GitHub Actions: test workflow runs on every PR
- Auth endpoints: `send-otp`, `verify-otp`, `refresh`, `logout`
- JWT middleware with tenant context `SET LOCAL`
- Role permission middleware matrix
- Audit middleware (auto-writes to `audit_logs` on mutations)
- Ops Console: floor + zone editor, schedule template CRUD, initial SH account creation

**Sprint 1 gates (must pass before Sprint 2):**
1. RLS Isolation Proof: cross-venue query returns 0 rows, no error
2. Full Venue Creation: 3 floors, 12 zones, 5 schedule templates, 1 SH account — all in Ops Console

**Done:** Nothing yet

**Blocked:** Nothing — Day-1 external actions (Meta WABA, Airtel DLT, Firebase, Supabase Pro, Railway, S3, domain) must be initiated before code work begins

---

## Reference files

- Business proposal: `../../nexus/decisions/2026-05-05_prime_business-proposal-report-gen.md`
- Business plan: `../../nexus/specs/2026-05-07_prime_business-plan-report-gen.md`
- Architecture (single source of truth): `../../nexus/specs/2026-05-10_forge_architecture-report-gen.md`
