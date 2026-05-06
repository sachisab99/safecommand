# Security + Compliance — Posture & Roadmap

> **Last updated:** 2026-05-06
> **Branch:** `safecommand_v7` — 42 commits ahead (HEAD `616b3dd`)
> **Compliance jurisdiction (P1):** India — DPDP Act 2023 (Digital Personal Data Protection)
> **Compliance jurisdiction (P3):** Multi-country (GDPR / equivalents per Plan §16)
>
> This document captures **(a)** every security and compliance action taken to date with dates and commits, **(b)** the current security posture vs target frameworks, and **(c)** a comprehensive 16-category gap analysis with prioritised roadmap.
>
> Companion: `docs/STATE_OF_WORK.md` for general build state.

---

## Table of contents

1. [Audit trail — security/compliance actions taken](#1-audit-trail--securitycompliance-actions-taken)
2. [Current posture by domain](#2-current-posture-by-domain)
3. [Compliance frameworks — applicability + status](#3-compliance-frameworks--applicability--status)
4. [DPDP Act 2023 — gap analysis (highest priority)](#4-dpdp-act-2023--gap-analysis-highest-priority)
5. [16-category roadmap — what's pending](#5-16-category-roadmap--whats-pending)
6. [Prioritised next actions (next 30 / 90 / 180 days)](#6-prioritised-next-actions)

---

## 1. Audit trail — security/compliance actions taken

Chronological. Every entry is verifiable from git history or production schema.

### 2026-04-29 — RLS isolation gate
- **Action:** Cross-venue RLS leak test (`scripts/rls_isolation_verify_v2.sql`)
- **Result:** ✅ PASSED — confirmed 0 cross-venue rows visible under tenant context
- **Spec ref:** Sprint 1 Gate 1, NFR-01, EC-02

### 2026-04-30 → 2026-05-03 — initial production hardening
- **Action:** Helmet middleware on api (`apps/api/src/index.ts`)
- **Action:** CORS configured via `CORS_ORIGIN` env
- **Action:** Express body limit 1mb
- **Action:** Zod `.strict()` validation at every route entry (Rule 10)
- **Action:** Structured error responses `{ error: { code, message } }` — no stack traces leaked
- **Action:** Audit middleware on api writes (BR-28)
- **Action:** Append-only DB policy on `audit_logs`, `zone_status_log`, `incident_timeline` (EC-10, Rule 4)

### 2026-05-04 — security history sweep planning
- **Action:** Discovered 4 secrets present in git history during Phase A audit
- **Captured in:** `report-gen/2026-05-04-22:30_plan.md`

### 2026-05-05 — security history rewrite + key migration
- **Action:** Rotated all 4 leaked secrets:
  - Firebase Admin RSA private key
  - Supabase legacy `service_role` JWT
  - Supabase legacy `anon` JWT
  - Upstash Redis TLS password
- **Action:** Migrated Supabase keys from legacy JWT format to opaque-token model (`sb_secret_*` for server, `sb_publishable_*` for client) per **ADR 0003**
- **Action:** `git filter-repo` rewrote history — 22 REDACTED markers; force-pushed `772fd85` → `96594ad`
- **Action:** Backup tag pushed: `backup/pre-history-rewrite-2026-05-04` (suggested deletion 2026-06-04, ≥30 days post-rewrite)
- **Action:** GitHub email notification acknowledged by founder
- **Captured in:** ADR 0003, `report-gen/2026-05-04-22:30_plan.md` amendment, CLAUDE.md operational controls table
- **Spec ref:** Hard Rule 1

### 2026-05-05 — branch isolation
- **Action:** Created `safecommand_v7` branch from cleaned main; committed via **ADR 0002**
- **Reason:** Phase A scaffold work decoupled from `main` (paused-pilot-ready) until June unfreeze
- **Spec ref:** Hard Rule 3 (no committed-migration modification — branch enables Phase B pre-writes)

### 2026-05-05 — ThemeProvider compliance
- **Action:** Mobile + dashboard + ops-console ThemeProvider scaffolded — every colour/label via tokens
- **Spec ref:** EC-17 / Rule 19; every safety-critical screen passes WCAG 2.1 AA contrast (NFR-35; helpers in `apps/mobile/src/theme/colours.ts` — `passesWcagAA`, `passesWcagAALarge`)

### 2026-05-05 — schema enforcement of brand integrity
- **Action:** DB CHECK constraint on `corporate_brand_configs.powered_by_text = 'Platform by SafeCommand'` (mig 010)
- **Action:** PDF footer + Settings > About hard-coded literal strings
- **Spec ref:** EC-18 / Rule 20 — non-removable platform attribution

### 2026-05-06 — Path B production deploy + post-deploy hotfix
- **Action:** Migrations 009 + 010 + 011 deployed to Supabase production (`9a52a58`)
- **Validation:** Row counts unchanged (venues=2 / floors=8 / zones=28 / staff=6 / incidents=62); CHECK constraints enforce; generated columns reject direct manipulation
- **Hotfix:** Mig 009 4-arg `set_tenant_context` did NOT replace 3-arg version — PostgREST PGRST203 broke production briefly. Fix: `DROP FUNCTION set_tenant_context(uuid, uuid, text)` on live schema; patched mig 009 source (`4fd7964`) so fresh-deploys never reproduce
- **Lesson logged:** any function-arity migration MUST `DROP FUNCTION IF EXISTS` before `CREATE OR REPLACE`
- **Captured in:** `report-gen/2026-05-06-19:13_hotfix.md`

### 2026-05-06 — Staff lifecycle compliance trigger
- **Action:** Mig 011 `enforce_terminated_oneway` trigger blocks transitions out of TERMINATED state (compliance — wrongful-termination cover-up prevention)
- **Action:** CHECK constraint requires `status_reason ≥ 3 chars` for non-ACTIVE rows (forces operator to log a reason)
- **Action:** `is_active` becomes generated column derived from `lifecycle_status` — direct manipulation rejected by Postgres

### 2026-05-06 — Ops Console auth gate
- **Action:** Confirmed `apps/ops-console/proxy.ts` (Next.js 16's renamed middleware) gates every route except `/login` and static assets
- **Validation:** Cookie value MUST match `OPS_SESSION_TOKEN` env var (not just exist) — prevents cookie-injection
- **Action:** Documented inline (`fb5d573`) with header docblock; added login-already-authed redirect for UX polish
- **Spec ref:** EC-14 (Ops Console separate auth domain); Hard Rule 6

### 2026-05-06 — Server-side role allow-list on staff add
- **Action:** `POST /v1/staff` enforces server-side allow-list — DSH/SC/FS/GS/FM only when caller is SH/DSH; **blocks** SH/GM/AUDITOR creation by non-SC-OPS
- **Spec ref:** BR-04 / BR-13 partial — defense in depth (UI + RLS + middleware)

### 2026-05-06 — Bulk-replace + 2-person validation in roster
- **Action:** `apps/ops-console/actions/shifts.ts` — `replaceZoneAssignmentsAction` validates 2-person zones server-side before write (defensive; client also validates for instant feedback)
- **Spec ref:** BR-04 (multi-staff zone coverage), zones.two_person_required flag; principle of double-enforcement

### 2026-05-06 — Mig 012 RLS security patch
- **Action:** Supabase database linter flagged `public.schedule_template_seeds` for `rls_disabled_in_public` (level: ERROR)
- **Investigation:** 32-row reference catalog (no PII), but write exposure was real — attacker could tamper with seed templates → corrupted templates would propagate to every NEW venue created via `provision_venue_templates(...)`
- **Fix:** `ALTER TABLE schedule_template_seeds ENABLE ROW LEVEL SECURITY; ALTER TABLE schedule_template_seeds FORCE ROW LEVEL SECURITY;` (no policies → service-role only)
- **Verification:** Pre-fix anon REST returned all 32 rows; post-fix returns `count: 0`. Comprehensive audit confirmed **32/32 public tables RLS-protected** (was 31, now 32)
- **Migration captured:** `supabase/migrations/012_rls_schedule_template_seeds.sql` (Hard Rule 3 — new file, not modification)
- **Commit:** `616b3dd`

### Cumulative result
- **32/32 public tables RLS-protected**
- **0 known leaked secrets** in current `safecommand_v7` HEAD or production
- **All Hard Rules 1–22 either ✅ adhered or ⏳ scheduled** (none violated)
- **All ECs 1–21 either ✅ adhered or ⏳ scheduled per phase**

---

## 2. Current posture by domain

### 2.1 Authentication

| Concern | Current state | Comment |
|---|---|---|
| Mobile auth | Phone OTP (TEST_PHONE_PAIRS bypass + Firebase project `safecommand-51499`) | Native Firebase Phone Auth Sprint 3 |
| Dashboard auth | Supabase Auth via `apps/dashboard/lib/auth.ts` | OK for Phase 1 |
| Ops Console auth | Single shared password (`OPS_CONSOLE_PASSWORD` env) → cookie-token gate (`proxy.ts`) | **Single-team-tool tradeoff**; SSO recommended Phase 2 |
| MFA | None | **Recommended for SH/DSH/GM** post-pilot |
| Session expiry | 7-day cookie max-age (Ops Console); JWT default (Supabase) | Should refresh policy |
| Rate limiting on OTP | None known | **Add before pilot** |
| Account lockout | None | **Add before pilot** |
| Device binding | None | Recommended for command roles |

### 2.2 Authorization (RLS + RBAC)

| Concern | Current state |
|---|---|
| RLS coverage | ✅ 32/32 tables; verified 2026-05-06 |
| `set_tenant_context` 4-arg | ✅ Live (3-arg dropped in hotfix `4fd7964`) |
| `building_visible()` | ✅ Used in all RLS where building scope applies (Rule 16) |
| Role-based middleware (api) | ✅ `requireRole(...)` |
| Append-only logs | ✅ `audit_logs`, `zone_status_log`, `incident_timeline` |
| 8-role permission model | ✅ BR-04 |
| Roaming validation (active_venue_id ∈ venue_roles) | ⏳ Phase 2 — EC-19 / Rule 21 |
| CORP-* PII protection | ⏳ Phase 3 — EC-20 / Rule 22 |
| Service-role admin client RLS bypass | ✅ Documented; used in Ops Console actions |

### 2.3 Secrets management

| Concern | Current state |
|---|---|
| Source of truth | `.env` files at project + per-app levels (gitignored) |
| Format | Opaque tokens for Supabase (post 2026-05-05); JWT elsewhere |
| Rotation cadence | Ad-hoc (last rotation: 2026-05-05) — **need 90-day cadence** |
| Vault / SecretsManager | None — env files only — **target Phase 2** |
| Pre-commit secret scan | gitleaks configured in CLAUDE.md as Rule 1 default — **verify it's installed locally** |
| CI secret scan | None known — **add to GitHub Actions** |
| Sentry secret redaction | Sentry not yet wired (go-live gate) |

### 2.4 Data isolation + tenant boundaries

| Concern | Current state |
|---|---|
| `venue_id` on every tenant table | ✅ Schema + middleware enforced (Rule 2) |
| RLS policy on every public table | ✅ 100% post mig 012 |
| Cross-venue isolation tested | ✅ Sprint 1 Gate 1 — 2026-04-29 |
| Building isolation tested | ⏳ Phase B Gate 2 of 25 |
| Roaming isolation tested | ⏳ Phase 2 |
| Corporate account isolation tested | ⏳ Phase 3 (NFR-30) |

### 2.5 PII handling

| PII type | Current state | Compliance ref |
|---|---|---|
| Staff phone | Stored plaintext (DB) — used for FCM/WA/SMS routing | DPDP — purpose-limited |
| Staff name | Stored plaintext | DPDP |
| Visitor phone | ⏳ VMS Phase B — schema in place |
| Visitor full name | ⏳ VMS Phase B |
| Visitor ID photo | ⏳ VMS Phase B — schema reserves `id_photo_url` (S3 SSE-S3); access role-gated (Rule 14) |
| Visitor face photo | ⏳ VMS Phase B — schema reserves `face_photo_url` |
| Aadhaar number | **NEVER STORED** — schema only has `masked_aadhaar` (last 4 digits) — Rule 13 / NFR-24 |
| FCM token | Stored on `staff` table | Standard practice |
| Firebase auth_id | Stored on `staff` table | Standard |
| Files at rest | S3 ap-south-1 + SSE-S3 | NFR-11 |
| Files in transit | TLS 1.2+ (HTTPS) | EC-04 / EC-08 |
| Database at rest | Supabase managed (AES-256) | Standard |
| **DB column-level encryption** | None — relies on RLS + DB encryption | **Consider for Phase 2 PII columns** |

### 2.6 Auditability

| Concern | Current state |
|---|---|
| Audit middleware on api writes | ✅ `apps/api/src/middleware/audit.ts` |
| Audit log retention | None defined — **set policy: 7 years for regulatory** |
| Audit log integrity (immutable) | ✅ DB policy: no UPDATE/DELETE |
| Audit log integrity (anti-tamper) | None — no hash chain or signature; **consider for compliance audit** |
| Compliance reports (Fire NOC / NABH / Insurance / Full Audit) | ⏳ BR-20 Phase B |
| User activity timeline (Data Principal Right) | ⏳ Phase 2 (DPDP requires) |

### 2.7 Network + infrastructure security

| Concern | Current state |
|---|---|
| HTTPS everywhere | ✅ Railway / Amplify / Supabase enforce |
| WAF / DDoS protection | None on api (Railway provides basic); **add Cloudflare before pilot** |
| Private VPC for DB | Supabase managed — connection via pooler; **consider VPC peering Phase 2** |
| IP allowlist for Ops Console | None — public URL — **add for SC team only** |
| CSP / HSTS / X-Frame-Options | None on Next.js apps — **add via middleware** |
| API CORS | `*` wildcard fallback if `CORS_ORIGIN` unset — **harden** |
| TLS configuration | Managed (Railway / Amplify) | OK |
| Bastion host for admin | Supabase Studio + direct psql via env-stored URL — **review post-pilot** |

### 2.8 Mobile security

| Concern | Current state |
|---|---|
| Certificate pinning | None — **add before hospital pilot** |
| Root/jailbreak detection | None |
| Local data encryption | Default Expo SQLite — sensitive data should use SecureStore |
| Code obfuscation | Default Expo build (R8 for Android Release) — verify |
| App attestation | None — Play Integrity / DeviceCheck Phase 2 |
| Biometric auth | None — recommended for command roles |
| Secure photo capture | EXIF data NOT stripped — **add before VMS launch** |

### 2.9 Web (Dashboard, Ops Console) security

| Concern | Current state |
|---|---|
| Cookie security flags | `httpOnly`, `secure` (in prod), `sameSite=lax` on `ops_auth` | OK |
| CSRF protection | Next.js server actions have built-in token | ✅ |
| XSS protection | React escapes by default; no `dangerouslySetInnerHTML` use | ✅ |
| Subresource Integrity | None | Optional |
| Security headers via middleware | None — **add CSP, HSTS, frame-options** |

### 2.10 Vendor / third-party risk

| Vendor | DPA status | Sub-processor disclosure |
|---|---|---|
| Supabase | Available (vendor offers) — **execute** | Auto via Supabase docs |
| Railway | Available — **execute** | Per Railway docs |
| Upstash | Available — **execute** | Standard |
| AWS | DPA in standard agreements | Pre-existing |
| Meta (WhatsApp Business) | DPA via Meta — **execute as part of WABA approval** | Standard |
| Airtel | DPA — **execute as part of DLT registration** | Standard |
| Firebase (Google) | DPA in standard agreements | Pre-existing |

### 2.11 Compliance documentation

| Document | Status |
|---|---|
| Privacy notice (staff onboarding) | ❌ Not yet written |
| Privacy notice (visitor opt-in) | ❌ Not yet written — **required for VMS BR-24** |
| Terms of service (venue contracts) | ❌ Not yet written — **required for first pilot** |
| DPA template (venue → SafeCommand) | ❌ Not yet written |
| Sub-processor list | ❌ Not yet written |
| Data Retention Schedule | ❌ Not yet written — only Plan §10 high-level mentions |
| Breach Notification SOP | ❌ Not yet written |
| DPIA (Data Protection Impact Assessment) | ❌ Not yet conducted — **required by DPDP Act** |
| DPO designation | ❌ Founder = current de-facto; Significant Data Fiduciary status TBD |

---

## 3. Compliance frameworks — applicability + status

### 3.1 DPDP Act 2023 (India) — **TOP PRIORITY**

| Obligation | Status | Reference |
|---|---|---|
| Notice (right to know what data is processed) | ❌ Privacy notice required | DPDP §5 |
| Consent for non-essential processing | ❌ Required — needs consent ledger | DPDP §6 |
| Children's data (special protections) | ❌ Future consideration (some venues serve youth events) | DPDP §9 |
| Data Principal rights (access, correction, erasure, portability, withdraw consent) | ❌ Self-service interface required | DPDP §11–14 |
| Data Fiduciary obligations (security, breach notification, retention limits) | ⏳ Partial — need formal SOP | DPDP §8 |
| Significant Data Fiduciary additional obligations (DPIA, DPO, audit) | TBD — depends on volume / sensitivity | DPDP §10 |
| Cross-border transfer mechanisms | ⏳ Phase 2 GCP migration plan addresses | DPDP §16 |
| Breach notification within 72 hours to Data Protection Board | ❌ SOP required | DPDP §8(6) |

**Phase 2 GCP migration is the gating event** for hospital pilots (Hard Rule 12). Full DPDP compliance must be achieved before first hospital contract.

### 3.2 NABH — National Accreditation Board for Hospitals

| Obligation | Status |
|---|---|
| Compliance reports for accreditation | ⏳ BR-20 Phase B |
| Audit trail for safety operations | ✅ audit_logs in place |
| Incident timeline + post-incident report | ✅ Schema; ⏳ PDF Phase B |

### 3.3 Fire NOC (National Building Code)

| Obligation | Status |
|---|---|
| Equipment expiry tracking (90/30/7-day alerts) | ⏳ BR-21 Phase B |
| Fire drill records (BR-A) | ⏳ Schema ready (mig 010 drill_sessions); UI Phase B |
| Documented evacuation procedures | Outside scope (venue responsibility) |

### 3.4 TRAI / DLT (SMS regulation)

| Obligation | Status |
|---|---|
| DLT registration | ⏳ Founder action — Airtel registration in flight |
| Sender ID `SFCMND` | ⏳ Pending registration |
| Template approval | ⏳ 5 templates to register |

### 3.5 Insurance compliance

| Obligation | Status |
|---|---|
| Tamper-evident audit trail | ✅ Append-only DB + middleware |
| Compliance export (PDF) | ⏳ BR-20 Phase B |

### 3.6 ISO 27001 / SOC 2 Type II — **Phase 3 (enterprise sales prep)**

Out of P1 scope. Targets for corporate enterprise tier sales (≥₹15L/month). Investment ~6–12 months pre-audit.

### 3.7 GDPR / equivalents — **Phase 3 (international scaling)**

EU venues require GDPR; UAE requires DHA; Singapore requires MOH. Each adds region-specific obligations. Phase 3 per Plan §16.

### 3.8 HIPAA equivalent — **Blocked by Hard Rule 12**

No hospital data before Phase 2 GCP migration completes. India equivalent: NABH (above) + DPDP (above).

---

## 4. DPDP Act 2023 — gap analysis (highest priority)

The DPDP Act came into force in 2023 and is the most consequential compliance regime SafeCommand must address before scaling beyond demo / pilot. The Act applies to any digital personal data processed in India.

### 4.1 Scope analysis

| SafeCommand role | Applicability |
|---|---|
| **Data Fiduciary** for SafeCommand-platform metadata | YES — SafeCommand decides purpose + means of processing |
| **Data Processor** for venue-specific operational data | YES — venue is fiduciary; SafeCommand processes on contract |
| **Significant Data Fiduciary** | TBD — depends on volume of data processed (likely YES once corporate accounts onboard) |

### 4.2 Most-pressing obligations (do these before first paid pilot)

1. **Privacy Notice** — must inform every staff member on first login what data is collected, why, and how long it's kept. Plain language. Available in English + Hindi (Phase 2 multi-language).
2. **Consent management** — operational notifications are essential (no consent needed); marketing/analytics need affirmative consent with consent receipts.
3. **Data Principal Rights interface** — staff must be able to (a) view their data, (b) request correction, (c) request erasure (subject to legal retention), (d) request data portability.
4. **Retention schedule** — currently no formal retention. DPDP requires deletion when purpose is fulfilled. Plan §10 mentions "90 days minimum, 3 years Enterprise" for VMS; need similar for incident logs / audit trail.
5. **Breach notification** — 72-hour notification SOP to Data Protection Board + affected Data Principals.
6. **Sub-processor disclosure** — currently undocumented. Need: list of all sub-processors (Supabase, Railway, Upstash, AWS, Meta, Airtel, Firebase) with purposes and data categories.

### 4.3 Operational hardening tied to DPDP

- **Encryption at rest** — DB does this by default (Supabase). For PII columns (visitor photos), consider column-level encryption with rotated KMS keys.
- **Access logging** — DPDP §8(5) requires "reasonable security safeguards." Logging *who accessed which Data Principal record when* is industry standard. We have `audit_logs` (write events); consider extending to read events for sensitive PII.
- **Data minimization** — review every form for unnecessary fields. Currently we collect `phone, name, role` for staff (essential). VMS will collect more — review against necessity test.
- **Purpose limitation** — staff data used only for safety operations. Add explicit policy.

### 4.4 DPDP-driven schema additions (Phase B / 2)

- `consent_records` table — every consent granted (staff signs privacy notice on first login; visitor opt-in for QR alerts)
- `data_principal_requests` table — track access/correction/erasure requests
- `pii_access_logs` table (or extend audit_logs) — every read of sensitive PII
- `retention_policies` table — per-data-category retention windows
- Function: `purge_expired_data()` cron-trigger (worker — Phase B)

---

## 5. 16-category roadmap — what's pending

This roadmap captures every security/compliance item not yet done, organised by domain. Each item has a **priority tag**:
- **P0** = required before first paid pilot (Q3 2026 target)
- **P1** = required before broad GA / corporate sales
- **P2** = required for ISO/SOC2 / international expansion

### Category 1 — Authentication & Identity

| # | Item | Priority |
|---|---|---|
| 1.1 | Move from TEST_PHONE_PAIRS bypass to native Firebase Phone Auth (mobile) | **P0 (Sprint 3)** |
| 1.2 | Rate limit OTP send (3 per phone per 10 min, 10 per IP per hour) | **P0** |
| 1.3 | Account lockout after 5 failed OTP attempts (15-min cooldown) | **P0** |
| 1.4 | MFA for command roles (TOTP via authenticator app) | **P1** |
| 1.5 | Session expiry policy (refresh JWT every 24h; force re-auth every 30d) | **P1** |
| 1.6 | Device binding (JWT tied to device fingerprint; alert on new device login) | **P1** |
| 1.7 | SSO for corporate accounts (SAML / OIDC) | **P2** |
| 1.8 | Per-user Ops Console auth (replace shared password) — OAuth2 / Workspace SSO | **P1** |

### Category 2 — Authorization & RLS hardening

| # | Item | Priority |
|---|---|---|
| 2.1 | RLS regression test in CI (every PR runs `rls_isolation_verify_v2.sql`) | **P0** |
| 2.2 | Building isolation test automation (NFR-27 — Gate 2 of 25) | **P0** |
| 2.3 | Roaming isolation tests (NFR-33, Rule 21) | **P1** |
| 2.4 | CORP-* PII protection tests (NFR-30, Rule 22) | **P2** |
| 2.5 | RLS bypass alerting (log every admin client write with caller context) | **P1** |
| 2.6 | Audit query: nightly `LENGTH(masked_aadhaar) > 9 = 0` per NFR-24 | **P0** (Phase B; gate 15 of 25) |

### Category 3 — Secret management

| # | Item | Priority |
|---|---|---|
| 3.1 | Vault / AWS Secrets Manager (replace `.env` files) | **P1** |
| 3.2 | 90-day rotation cadence for high-value secrets | **P0** |
| 3.3 | Secret access audit log | **P1** |
| 3.4 | Pre-commit hook: gitleaks (verify installed) + detect-secrets | **P0** |
| 3.5 | CI secret scanning on every PR | **P0** |
| 3.6 | Sentry/error-tracker secret redaction (when wired) | **P0** |
| 3.7 | Log sanitization helper (never log JWT/secret/full PII) | **P0** |

### Category 4 — Data Protection (DPDP-specific)

| # | Item | Priority |
|---|---|---|
| 4.1 | Conduct DPIA before first paid pilot | **P0** |
| 4.2 | Privacy notice (staff onboarding) — English first, Hindi P2 | **P0** |
| 4.3 | Privacy notice (visitor opt-in) for VMS launch | **P0** (gates VMS) |
| 4.4 | Data Principal Rights interface (access/correction/erasure/portability) | **P0** |
| 4.5 | Designate Data Protection Officer (founder for now; formalise) | **P0** |
| 4.6 | Consent management with consent receipts (cryptographic / signed) | **P1** |
| 4.7 | Breach notification SOP (72-hr to Data Protection Board + affected principals) | **P0** |
| 4.8 | Retention policy schema + automated purge worker | **P1** |
| 4.9 | Sub-processor disclosure list (public) | **P0** |
| 4.10 | Cross-border transfer Standard Contractual Clauses (when scaling intl) | **P2** |

### Category 5 — PII handling

| # | Item | Priority |
|---|---|---|
| 5.1 | Aadhaar masking validation — automated nightly query (NFR-24, Rule 13) | **P0** |
| 5.2 | PII discovery scan — find every column containing personal data | **P0** |
| 5.3 | Column-level encryption for visitor photos (S3 SSE-KMS with rotation) | **P1** |
| 5.4 | Photo EXIF stripping at capture (mobile) | **P0** (gates VMS) |
| 5.5 | PII access logging (read events on staff phones, visitor records, photos) | **P1** |
| 5.6 | PII retention enforcement — 90d minimum, 3y Enterprise per BR-55 | **P1** |
| 5.7 | PII export (data subject request fulfillment) | **P0** |
| 5.8 | Pre-signed URL expiry tightening (currently default; reduce to 5min for sensitive) | **P0** |

### Category 6 — Audit & logging

| # | Item | Priority |
|---|---|---|
| 6.1 | Centralized log aggregation (Sentry — go-live gate item) | **P0** |
| 6.2 | Audit log retention policy (7 years for regulatory) | **P1** |
| 6.3 | Audit log integrity (hash chain or external SIEM signing) | **P1** |
| 6.4 | Compliance reports (Fire NOC / NABH / Insurance / Full Audit) — BR-20 | **P0** |
| 6.5 | User activity timeline (DPDP — every staff can see their activity) | **P1** |
| 6.6 | Failed access attempts dashboard | **P1** |

### Category 7 — Incident Response (Security)

Distinct from venue safety incidents (BR-11). This is for security breaches.

| # | Item | Priority |
|---|---|---|
| 7.1 | Security incident response plan + runbooks | **P0** |
| 7.2 | Communication plan (legal counsel + DPO + founder) | **P0** |
| 7.3 | Tabletop exercise (annual) | **P1** |
| 7.4 | Post-incident review process | **P1** |
| 7.5 | Forensic preservation guidance | **P1** |

### Category 8 — Vulnerability management

| # | Item | Priority |
|---|---|---|
| 8.1 | Dependency scanning (npm audit + Dependabot) | **P0** |
| 8.2 | CVE monitoring for runtime stack (Postgres / Express / RN / Expo) | **P0** |
| 8.3 | Security patch SLA (critical: 7d, high: 30d, medium: 90d) | **P0** |
| 8.4 | Quarterly penetration testing (3rd party — pre-pilot, then annually) | **P0** |
| 8.5 | Automated SAST (CodeQL on PR) | **P1** |
| 8.6 | Bug bounty program | **P2** |

### Category 9 — Network & infrastructure

| # | Item | Priority |
|---|---|---|
| 9.1 | Cloudflare WAF + DDoS protection on `api.safecommand.in` | **P0** |
| 9.2 | IP allowlist for Ops Console (SC team only) | **P0** |
| 9.3 | CSP, HSTS, X-Frame-Options on Next.js apps (via middleware) | **P0** |
| 9.4 | CORS hardening (drop `*` fallback) | **P0** |
| 9.5 | HSTS preload submission (`safecommand.in`) | **P1** |
| 9.6 | Private VPC peering for DB (Phase 2 GCP) | **P1** |
| 9.7 | Bastion host for admin DB access | **P1** |

### Category 10 — Mobile security

| # | Item | Priority |
|---|---|---|
| 10.1 | Certificate pinning (TLS) | **P1** (P0 for hospital pilot) |
| 10.2 | Root/jailbreak detection + warning | **P1** |
| 10.3 | Local data encryption (Expo SecureStore for sensitive items) | **P0** (auth tokens, FCM tokens) |
| 10.4 | Android R8 obfuscation verified in release | **P0** |
| 10.5 | App attestation (Play Integrity API + DeviceCheck) | **P1** |
| 10.6 | Biometric auth for command roles (post-OTP) | **P1** |
| 10.7 | Photo capture with EXIF strip + no metadata leak | **P0** (gates VMS) |

### Category 11 — Web security

| # | Item | Priority |
|---|---|---|
| 11.1 | Security headers via Next.js middleware (CSP, HSTS, X-Frame-Options, X-Content-Type-Options) | **P0** |
| 11.2 | Cookie SameSite tightening (Strict for Ops Console) | **P0** |
| 11.3 | Subresource Integrity for any external scripts | **P1** |
| 11.4 | CSRF protection audit (Next.js server actions OK; verify any API form posts) | **P0** |
| 11.5 | XSS audit (no `dangerouslySetInnerHTML`; verify Markdown/rich-text rendering escapes) | **P0** |

### Category 12 — Compliance frameworks (per-framework readiness)

| # | Item | Priority |
|---|---|---|
| 12.1 | DPDP-readiness assessment + remediation (see §4 above) | **P0** |
| 12.2 | NABH alignment (compliance reports per BR-20) | **P0** for hospital pilot |
| 12.3 | Fire NOC — drill records + equipment expiry alerts | **P0** for any pilot |
| 12.4 | TRAI/DLT registration | **P0** (in flight via Airtel) |
| 12.5 | Insurance compliance — tamper-evident audit reports | **P1** |
| 12.6 | ISO 27001 readiness assessment | **P2** |
| 12.7 | SOC 2 Type II readiness | **P2** (corporate enterprise sales) |

### Category 13 — Privacy by Design

| # | Item | Priority |
|---|---|---|
| 13.1 | Data minimization audit (every form vs necessity test) | **P0** |
| 13.2 | Purpose limitation policy (data used only for declared purposes) | **P0** |
| 13.3 | Storage limitation (auto-purge per retention) | **P1** |
| 13.4 | Privacy notice clarity review (plain language) | **P0** |

### Category 14 — Operational security

| # | Item | Priority |
|---|---|---|
| 14.1 | Backup encryption + quarterly test restore | **P0** |
| 14.2 | Disaster recovery plan (RPO 4h, RTO 24h) | **P0** |
| 14.3 | Geographic redundancy (Phase 2 GCP — multi-region) | **P1** |
| 14.4 | Privileged Access Management (PAM) — currently founder has all keys | **P1** |
| 14.5 | Just-in-time admin access (instead of standing access) | **P2** |
| 14.6 | Quarterly review of who has production access | **P0** |

### Category 15 — Vendor / third-party risk

| # | Item | Priority |
|---|---|---|
| 15.1 | DPA with Supabase (execute) | **P0** |
| 15.2 | DPA with Railway (execute) | **P0** |
| 15.3 | DPA with Upstash (execute) | **P0** |
| 15.4 | DPA with Meta WhatsApp Business (as part of WABA approval) | **P0** |
| 15.5 | DPA with Airtel (as part of DLT registration) | **P0** |
| 15.6 | DPA with AWS (already in standard agreement; verify SCCs apply) | **P0** |
| 15.7 | DPA with Firebase / Google (verify standard) | **P0** |
| 15.8 | Vendor security questionnaire on every new sub-processor | **P1** |
| 15.9 | Sub-processor list maintenance (publish updates) | **P0** (DPDP requires) |

### Category 16 — Code quality / dev security

| # | Item | Priority |
|---|---|---|
| 16.1 | ESLint security plugin (`eslint-plugin-security`) | **P0** |
| 16.2 | Pre-commit: gitleaks + detect-secrets + semgrep | **P0** |
| 16.3 | Code review checklist for security (PR template) | **P0** |
| 16.4 | Branch protection on `main` (no direct commits; required reviews) | **P0** |
| 16.5 | Signed commits (GPG / SSH) | **P1** |
| 16.6 | Security training for any future team members | **P2** |

---

## 6. Prioritised next actions

Ordered by deadline / urgency. **Engineering hours estimated assuming founder + Claude Code working in parallel.**

### Next 30 days (May 2026 — pre-31-May validation gate, plus immediate post)

| # | Action | Hours | Category |
|---|---|---|---|
| A1 | Founder action: complete WABA / DLT / OPC / domain — already in flight | — | 12.4, 15.4, 15.5 |
| A2 | Pre-commit hook installation: gitleaks + detect-secrets — verify on dev machine | 0.5 | 3.4, 16.2 |
| A3 | npm audit + Dependabot config in `safecommand_v7` | 1 | 8.1 |
| A4 | Document data retention schedule (for first pilot) | 2 | 4.8 |
| A5 | Draft staff privacy notice (English, plain language) | 3 | 4.2 |
| A6 | Draft visitor privacy notice (gates VMS launch June+) | 3 | 4.3 |
| A7 | Subprocessor disclosure list (publish on safecommand.in/legal/sub-processors) | 1 | 4.9, 15.9 |
| A8 | Branch protection rules on GitHub `main` | 0.5 | 16.4 |
| A9 | Add ESLint security plugin to all 3 apps | 1 | 16.1 |
| **30-day total** | | **~12 hours** | |

### Next 90 days (June 2026 — Phase B unfreeze + pre-pilot prep)

| # | Action | Hours | Category |
|---|---|---|---|
| B1 | Deploy `safecommand_v7` → `main` (June merge per JUNE-2026-REVIEW-REQUIRED.md) | 2 | — |
| B2 | Native Firebase Phone Auth (Sprint 3) | 8 | 1.1 |
| B3 | OTP rate limiting + account lockout | 4 | 1.2, 1.3 |
| B4 | Aadhaar masking nightly audit query (Gate 15 of 25) | 2 | 5.1 |
| B5 | Cloudflare WAF + DDoS on api.safecommand.in | 4 | 9.1 |
| B6 | IP allowlist for Ops Console | 2 | 9.2 |
| B7 | Security headers middleware (Next.js apps) | 3 | 9.3, 11.1 |
| B8 | CORS hardening (drop wildcard) | 1 | 9.4 |
| B9 | RLS regression CI test | 4 | 2.1 |
| B10 | DPIA for SafeCommand Phase 1 | 16 (consultant or self) | 4.1 |
| B11 | Photo EXIF strip + secure capture (mobile, gates VMS) | 4 | 5.4, 10.7 |
| B12 | Sentry wiring + secret redaction | 4 | 6.1, 3.6 |
| B13 | Sub-processor list public page | 2 | 15.9 |
| B14 | Penetration test (3rd-party, pre-pilot) | budget item | 8.4 |
| B15 | DPA execution with all vendors (Supabase, Railway, Upstash, AWS, Meta, Airtel, Google) | 4 | 15.1–15.7 |
| B16 | Designate DPO (formal, in writing) | 1 | 4.5 |
| B17 | Breach notification SOP draft | 4 | 4.7 |
| B18 | Backup test restore | 2 | 14.1 |
| **90-day total** | | **~67 hours engineering + budget for pen test + DPIA** | |

### Next 180 days (Q3/Q4 2026 — first pilot live + scale prep)

| # | Action | Category |
|---|---|---|
| C1 | Data Principal Rights self-service interface (DPDP) | 4.4 |
| C2 | MFA for command roles | 1.4 |
| C3 | Mobile certificate pinning | 10.1 |
| C4 | TLS encryption audit + HSTS preload | 9.5 |
| C5 | Disaster recovery plan + tested | 14.2 |
| C6 | Audit log retention 7y + integrity hashing | 6.2, 6.3 |
| C7 | Compliance report PDFs (BR-20) — Fire NOC / NABH / Full Audit | 6.4 |
| C8 | Quarterly access review + PAM | 14.4, 14.6 |
| C9 | Pre-launch security audit (3rd party) | 8.4 |
| C10 | Per-user Ops Console auth (drop shared password) | 1.8 |

### Next 12+ months (Phase 3 international + enterprise)

- ISO 27001 readiness assessment + remediation
- SOC 2 Type II prep
- GDPR / DHA / MOH compliance for international venues
- Bug bounty program
- Signed commits + advanced supply-chain security
- App attestation (Play Integrity / DeviceCheck)
- SSO for corporate accounts

---

## 7. Risk register (open / managed / closed)

| ID | Risk | Status | Mitigation |
|---|---|---|---|
| R-001 | 4 secrets leaked to git history (pre-2026-05-05) | ✅ CLOSED 2026-05-05 | Rotated all + history rewrite + ADR 0003 |
| R-002 | Mig 009 PostgREST PGRST203 | ✅ CLOSED 2026-05-06 | Hotfix `4fd7964` + lesson logged |
| R-003 | `schedule_template_seeds` missing RLS | ✅ CLOSED 2026-05-06 | Mig 012 |
| R-004 | Test phone auth bypass active in production | ⏳ MANAGED | TEST_PHONE_PAIRS only; replace in Sprint 3 |
| R-005 | No middleware-level rate limit on api | ⏳ OPEN | Add before pilot (B3) |
| R-006 | No DPIA conducted | ⏳ OPEN | Schedule June (B10) |
| R-007 | Privacy notices missing | ⏳ OPEN | Draft May (A5/A6) |
| R-008 | DPAs unsigned with vendors | ⏳ OPEN | Execute as part of WABA/DLT/etc (B15) |
| R-009 | Ops Console shared-password auth | ⏳ MANAGED | Single SC team user; replace P1 |
| R-010 | No automated dependency scanning | ⏳ OPEN | Configure (A3) |
| R-011 | No security headers (CSP/HSTS/X-Frame) | ⏳ OPEN | Configure (B7) |
| R-012 | No backup test restore drill | ⏳ OPEN | Quarterly schedule (B18) |
| R-013 | No DPO formally designated | ⏳ MANAGED | Founder de-facto; formalise (B16) |
| R-014 | Aadhaar audit query not yet automated | ⏳ MANAGED | Schema enforces; add monitor (B4) |
| R-015 | No security incident response plan | ⏳ OPEN | Draft (Cat 7) |

---

## 8. Compliance one-page summary (for prospects / partners)

> SafeCommand operates under DPDP Act 2023 (India) jurisdiction. Phase 1 deployments use AWS S3 ap-south-1 (data residency in India for files); Phase 2 migrates to GCP asia-south1 for full data residency including DB. Hospital deployments are blocked until Phase 2 (Hard Rule 12). All Aadhaar handling complies with NFR-24 / Rule 13 (last-4 only, never full number). All data is RLS-isolated per venue; ID/face photos are role-gated to SH/DSH/AUD only. Audit trails are immutable and append-only. Full DPIA scheduled June 2026 pre-first-pilot.
>
> Sub-processors: Supabase (US-East today, ap-south-1 Phase 2), Railway, Upstash, AWS S3 ap-south-1, Meta WhatsApp Business, Airtel SMS (India domestic), Firebase. DPA execution with all vendors P0 priority before paid pilot.
>
> SafeCommand never accesses individual PII for corporate-governance use cases (CORP-* roles see aggregates only — EC-20 / Rule 22, enforced at code review and Phase 3 schema level). Raw PII never crosses country borders (EC-21 / Phase 3).
