# API Conventions — SafeCommand REST surface

**Status:** L1 governance baseline (per Phase A handoff plan)
**Scope:** All endpoints under `apps/api/src/routes/`
**Audience:** Founder + future engineering hires + Claude Code agents
**Companion:** Architecture v7 §6.4 (full API reference)

---

## Why this exists

Without a single source of governance, every new endpoint reinvents wheels — error shape, rate-limits, audit hooks, role gating. As we grow from ~30 to ~150+ endpoints over Phase 1–3, that drift compounds. This doc is the **L1** of a three-tier API governance roadmap:

| Tier | What | When |
|---|---|---|
| **L1 — Conventions doc** (this file) | Naming, errors, versioning, security patterns | Today |
| **L2 — Internal gateway pattern** | Declarative route registry; middleware-as-data | Phase B June 2026 (when many new endpoints land) |
| **L3 — API gateway product** | Kong / AWS API Gateway / similar; per-consumer keys + quotas | Phase 2 (10–25 venues, when external integrations + corp governance arrive) |

L3 is premature today; this doc plus `apps/api/src/middleware/` covers L1 fully.

---

## 1. Versioning

- Base URL: `https://api.safecommand.in/v1`
- Version is in the URL path. **Never** in headers or query string.
- A v2 ships only when a breaking change can't be avoided. Changes that are additive (new endpoints, new optional fields) stay in v1.
- v1 deprecation policy: minimum 6-month overlap with v2 once v2 ships. v1 stays read-supported (GET endpoints only) for an additional 12 months.

## 2. Endpoint naming

- **Plural nouns**: `/staff`, `/incidents`, `/zones` — never `/staffMember`, `/incident`
- **Resource-then-action** for non-CRUD: `/incidents/:id/staff-safe`, `/shift-instances/:id/activate`
- **Hyphenated multi-word paths**: `/change-requests`, `/pre-registrations`, `/schedule-templates`
- **Idempotent verbs**:
  - `GET` — read; cacheable; no side effects
  - `POST` — create OR non-idempotent action
  - `PUT` — replace entire resource (rare in this codebase)
  - `PATCH` — partial update
  - `DELETE` — soft delete preferred (`is_active = false`); hard delete only for genuinely transient resources

## 3. Error envelope

**All non-2xx responses MUST return:**

```json
{
  "error": {
    "code": "MACHINE_READABLE_CODE",
    "message": "Human-readable explanation"
  }
}
```

- `code` is `SCREAMING_SNAKE_CASE` and stable across releases (clients may switch on it).
- `message` is for humans; can be improved across releases without breaking clients.
- **Never** leak stack traces, raw SQL errors, or PostgreSQL error text to clients (Rule 7 / Rule 14).
- HTTP status codes:

| Status | Meaning | Example |
|---|---|---|
| 400 | Validation failure (Zod or business-rule) | `INVALID_PHONE`, `EVIDENCE_REQUIRED` |
| 401 | Missing or expired auth | `UNAUTHENTICATED` |
| 403 | Authenticated but not allowed | `ROLE_NOT_ALLOWED`, `CROSS_VENUE_DENIED` |
| 404 | Resource not found in caller's scope | `NOT_FOUND` |
| 409 | Conflict (uniqueness, state) | `DUPLICATE_PHONE`, `INCIDENT_ALREADY_RESOLVED` |
| 410 | Gone (deprecated endpoint or deleted resource) | `ENDPOINT_DEPRECATED` |
| 422 | Semantic body issue (e.g., role allow-list violation post-Zod) | `ROLE_NOT_ALLOWED` |
| 429 | Rate-limited | `RATE_LIMITED` |
| 500 | Server fault — never leak details | `INTERNAL_ERROR`, `QUERY_FAILED` |
| 503 | Dependency down (Supabase, Upstash, FCM) | `SERVICE_UNAVAILABLE` |

## 4. Authentication

- **All `/v1/**` endpoints require `Authorization: Bearer <jwt>`** EXCEPT:
  - `/v1/auth/send-otp`, `/v1/auth/verify-otp`, `/v1/auth/refresh` — login flow
  - `/v1/visitor/*` — public visitor-facing
  - `/v1/webhooks/*` — HMAC-verified by sender (Meta, Airtel)
- JWT format (Phase 1, 8-role): `{ sub, venue_id, staff_id, role, exp }`
- Phase 2 Roaming JWT adds `is_roaming`, `venue_roles[]`, `active_venue_id` (BR-R1; per ADR 0002 + Architecture v7 §17)
- Phase 3 Corporate JWT adds `corporate_account_id`, `scope_level`, `scope_id` (BR-65–80; Architecture v7 §19)
- **Roaming users**: every request must include `x-active-venue-id` header; middleware validates ∈ JWT `venue_roles` (Rule 21 / EC-19)

## 5. Tenant isolation — non-negotiable

Per **EC-03 / Rule 2** — every database query must include `venue_id`.

- Read `venue_id` from `req.auth.venue_id` (set by JWT middleware in `apps/api/src/middleware/auth.ts`).
- **NEVER** read `venue_id` from request body, query string, or path params.
- Even when route has `:id`, the underlying query MUST also filter by `venue_id`:

  ```typescript
  // ✅ CORRECT
  .from('staff').update({...}).eq('id', id).eq('venue_id', req.auth.venue_id)

  // ❌ WRONG — allows cross-venue write if id is leaked
  .from('staff').update({...}).eq('id', id)
  ```

- RLS policies provide a second layer of defence (NFR-01) but the application code should be explicit.

## 6. Building isolation (post-migration 009 — Phase B)

When migration 009 deploys (Spec Migration 007 — repo `009_mbv.sql`):

- `set_tenant_context` upgrades to 4-param: `(venue_id, staff_id, role, building_id)`
- Building-scoped roles (FS, SC, GS, building-bound FM) MUST pass their `building_id`
- Venue-wide roles (SH, DSH, GM, AUD) pass `building_id = NULL`
- All RLS policies on building-aware tables call `building_visible(building_id)` (Rule 16)

Until 009 deploys, leave the 3-param `set_tenant_context` as-is. The 4-param signature is backward-compatible (`p_building_id DEFAULT NULL`).

## 7. Role gating — `requireRole()` middleware

Use `requireRole('SH', 'DSH', 'GM', ...)` to gate endpoints. Comma-separated list of allowed roles. Examples:

| Endpoint | Roles allowed | Rationale |
|---|---|---|
| `GET /staff` | SH, DSH, GM, AUDITOR | Per Plan §11 — read access for command + governance roles |
| `POST /staff` | SH, DSH | Add staff (per Plan §11 + this doc); DSH per BR-13 |
| `POST /incidents` | SH, DSH, SC, FM (LTD) | Per Plan §11 — declare incident |
| `POST /incidents/:id/staff-safe` | (any authed) | Every staff member can confirm safety |
| `GET /analytics/financial-risk` | GM, AUD | Per Plan §11 — financial info gated |

**For sub-allowlists (e.g., "SH can create these roles, but not these")**, validate at the route handler **after** Zod and **before** DB write. Never trust the client. Example: `apps/api/src/routes/staff.ts` `SH_DSH_CREATABLE_ROLES`.

## 8. Validation — Zod first

- **Every endpoint with a body must `validate(SomeSchema)` middleware first.**
- Schema lives in `packages/schemas/src/index.ts` so mobile + dashboard share types.
- Use `.strict()` to reject unknown fields (Rule 10).
- Zod errors return 400 with the error message rolled up.

## 9. Idempotency (Rule 5)

- Write operations should be re-runnable without side effects.
- Mechanism varies by domain:
  - **Task generation**: `idempotency_key` UNIQUE column + `ON CONFLICT DO NOTHING`
  - **Notification dispatch**: dedupe in BullMQ via `jobId` (BullMQ deduplicates on identical jobId)
  - **External API calls**: client-side `Idempotency-Key` header (when integrating with payment / SMS / FCM)
- Test: calling the same POST twice with identical body must NOT create duplicate rows.

## 10. Audit trail — `auditLog()` middleware (Rule 4 / NFR-17)

- Every state-changing endpoint must call `auditLog('ACTION_NAME')` after `requireRole`.
- Action names are SCREAMING_SNAKE: `STAFF_CREATE`, `INCIDENT_DECLARE`, `ZONE_STATUS_UPDATE`, etc.
- Middleware writes to `audit_logs` automatically on 2xx responses.
- `audit_logs` is INSERT-only (no UPDATE/DELETE policy). Don't write code that tries to mutate.

## 11. Rate limits

- Auth endpoints: 5 OTP sends per 15 min per phone (anti-abuse)
- Incident declarations: no per-staff limit (lives depend on it — NFR-13); global API rate limit covers DoS protection
- Heavy reads (`/analytics/*`): 60 / minute per JWT
- Defaults for new endpoints: 100 / minute per JWT
- Implementation: `apps/api/src/middleware/rateLimit.ts` (Upstash Redis store)

## 12. Notification fan-out (Rule 7)

- Endpoints that trigger notifications must **return 2xx BEFORE the notification is sent.**
- Pattern:
  1. Validate + write to DB
  2. Return `201` / `200` to client
  3. Async-enqueue notification job (don't `await`)
- A failed enqueue logs an error and triggers an SC alert. It does NOT return 500 to the caller.
- Reasoning: incident declaration ≤5s NFR-02 — the API must not block on Meta WA latency.

## 13. Logging (12-factor, structured JSON)

- `pinoHttp` is wired in `apps/api/src/index.ts` — every request gets a structured log line.
- **NEVER log PII** — no full phone numbers, no Aadhaar (Rule 13), no full IDs/photos.
- Use `logger.info({ phone_masked: phone.slice(-4), staff_id: id }, 'Login attempt')`.
- For investigation: include `trace_id` (auto-generated) so logs across api ↔ scheduler ↔ notifier link.

## 14. Adding a new endpoint — checklist

For every new route, before merging:

- [ ] Path follows naming convention (§2)
- [ ] Method is appropriate (§2)
- [ ] Zod schema in `packages/schemas/src/index.ts` (§8)
- [ ] `validate(Schema)` middleware applied
- [ ] `requireAuth` + `setTenantContext` applied (§4, §5)
- [ ] `requireRole(...)` applied with explicit role list (§7)
- [ ] `venue_id` sourced from `req.auth.venue_id` only (§5)
- [ ] If state-changing: `auditLog('ACTION_NAME')` middleware applied (§10)
- [ ] If idempotent target: idempotency_key or equivalent in place (§9)
- [ ] Error responses use the standard envelope (§3)
- [ ] No PII in logs (§13)
- [ ] Documented in Architecture v7 §6.4 (`nexus/specs/2026-05-10_SafeCommand_Architecture_v7_Complete.md`)
- [ ] At least one integration test (Quality requirements)
- [ ] tsc --noEmit clean
- [ ] Mobile / Dashboard service-layer wrapper updated if a client uses it

## 15. Deprecation

To deprecate an endpoint:
1. Add `Deprecation: <date>` and `Sunset: <date>` response headers per RFC 8594
2. Log a `WARN` line on every call: `Deprecated endpoint /v1/old-thing — migrate to /v1/new-thing by 2027-01-01`
3. Add to a `DEPRECATED.md` table in this folder
4. Notify any known integrators (in Phase 2+ when external integrations exist)
5. After sunset date, return `410 Gone` with `ENDPOINT_DEPRECATED` code

## 16. Webhooks (inbound)

- Path: `/v1/webhooks/<vendor>` (e.g., `/v1/webhooks/meta`, `/v1/webhooks/airtel`)
- **HMAC signature verification is mandatory**, before any business logic
- Return `200` even on noop/duplicate (idempotency); never 500 for an event we choose to ignore
- Vendor errors logged to `comm_deliveries` for traceability (BR-28)

## 17. Future surfaces (Phase 2 / Phase 3 — for awareness)

When these come online, this doc will be revised:

| Endpoint family | Phase | Notes |
|---|---|---|
| `/v1/buildings` | B (June) | MBV CRUD via Ops Console; per-venue building management |
| `/v1/drill-sessions` | B | Per BR-A — drill scheduling, start/end, participant tracking |
| `/v1/brand-config` | 2 | Per BR-82 — fetch active brand config for the authenticated user's corporate_account_id |
| `/v1/governance/*` | 3 | Per BR-65–80 — corporate governance aggregation; CORP-* role gated; never returns PII (EC-20) |
| `/v1/external/<integration>` | 2+ | External API integrations (Fire Brigade, hospital PMS) — separate auth (per-consumer key + IP allow-list) |

## 18. Open questions deferred to L2 governance work (Phase B)

- **Per-tenant API quotas** — once corporate accounts can have their own quota tier, where does enforcement live? (L3 likely)
- **Schema versioning** — when migration 009 lands, do we version `set_tenant_context` calls per-request? (Spec says no — backward-compat default)
- **Apollo / corporate brand layer fetch caching** — 24h AsyncStorage on mobile (NFR-34); server-side caching strategy TBD

---

## References

- Architecture v7 §6.4 — full API reference (`nexus/specs/2026-05-10_SafeCommand_Architecture_v7_Complete.md`)
- Engineering Hard Rules (Architecture v7 §13) — Rules 1, 2, 5, 7, 10, 13, 14 most relevant to API
- Engineering Constraints (Architecture v7 §1.3) — EC-03, EC-04, EC-19
- Plan §11 — Role × Permission Matrix
- ADR 0001 (migration renumbering) — schema-level coupling rules
- ADR 0003 (Supabase opaque-token keys) — auth header format

---

*L1 governance baseline captured 2026-05-05. L2 work scheduled for Phase B June 2026.*
