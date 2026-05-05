# ADR 0003 — Supabase Publishable + Secret Key Migration

**Status:** Accepted (Phase 1 — single shared `sb_secret_*` across services)
**Future revision flagged:** Phase B June 2026 — shard to per-service `sb_secret_*` keys
**Date:** 2026-05-05
**Deciders:** Sachin Sablok (Founder), Nexus Prime (claude-opus-4-7)
**Supersedes:** Implicit prior choice (legacy `anon` + `service_role` JWTs)
**Related:** ADR 0001 (migration renumbering), ADR 0002 (safecommand_v7 branch — pending)

---

## Context

During the security incident response of 2026-05-04 (Firebase Admin SDK private key leak in `.gitignore` content), additional secret leaks were discovered in committed history including the Supabase `service_role` JWT (`exp: 2092876423`, valid through 2036) and the Upstash Redis password. Rotation of all four credentials was required.

While planning the Supabase rotation, the dashboard surfaced Supabase's recommended new key model — opaque tokens (`sb_publishable_*` for client / `sb_secret_*` for server) replacing the legacy signed JWTs (`anon` / `service_role`). The legacy keys are still functional but officially flagged as legacy; new projects default to opaque tokens.

Decision was needed: rotate within the legacy model, or migrate to the new opaque-token model as part of the same rotation pass.

---

## Decision

**Migrate to the new Publishable + Secret opaque-token key model on 2026-05-05, in this rotation pass.**

Two tactical refinements:

1. **Keep environment variable names unchanged.** The Supabase JS client library treats the API key as an opaque header value — neither the format nor a code change is required for the migration. The variable `SUPABASE_SERVICE_ROLE_KEY` now holds the `sb_secret_*` opaque token; `SUPABASE_ANON_KEY` now holds the `sb_publishable_*` opaque token. Zero source code change required across `apps/api`, `apps/scheduler`, `apps/escalation`, `apps/notifier`, `apps/dashboard`, `apps/ops-console`, `apps/mobile`.

2. **Phase 1: single shared `sb_secret_*` key across all 4 Railway services.** Defers per-service key sharding to Phase B (June 2026) when Railway env-var distribution is already being touched for migration 009/010 deployment and ThemeProvider rollout. Sharding is a refinement, not a prerequisite; deferring keeps the rotation pass minimal-risk.

The legacy `anon` and `service_role` JWT keys are **disabled** at the Supabase Dashboard immediately after the new keys are validated working. Disabling closes the live-credential window before the git-history rewrite operation begins.

---

## Considered Alternatives

### Option B — Stay on legacy JWT keys; rotate within that model
- **Why rejected:** Rotating a legacy `service_role` JWT requires resetting the project's JWT signing secret, which simultaneously invalidates every user-session JWT issued via `verify-otp`. Acceptable today (workers paused, no live users), but unacceptable for any future rotation event during pilot or post-pilot operation. Migrating now means the next rotation (which will inevitably happen) is friction-free.
- **Net cost of staying:** every future rotation = mass user logout. NFR-13 (99.5% uptime, "lives depend on it") would be compromised at every rotation event.

### Option C — Migrate now AND shard to per-service keys immediately
- **Why deferred:** Sharding adds 4 separate secret-key generations, 4 separate Railway env-var sets (instead of 1 shared), and a per-service audit-log review surface — all valuable, but compounds the change surface during what is already a complex rotation + history-rewrite operation. June 2026 is a natural inflection: migrations 009/010 land then, ThemeProvider rolls out, Phase B engineering resumes — sharding fits cleanly into that sequence.

### Option D — Migrate publishable only; defer secret migration
- **Why rejected:** The legacy `service_role` JWT is the highest-impact leak. Migrating only the public/client key while leaving the server-bypass-RLS key on legacy form forfeits most of the rotation-without-mass-logout benefit. All-or-nothing migration is structurally cleaner.

---

## Consequences

### Positive

- **Rotation no longer = mass logout.** Future Supabase secret rotations affect only the API key, not user-session JWTs. Live SH on duty during an incident does not get logged out by a rotation event on a different service.
- **Per-service blast radius reduction (Phase B unlock).** When sharded in June, a compromised `notifier` container requires only `sb_secret_notifier_*` rotation; `api`, `scheduler`, `escalation` keep operating.
- **Per-key telemetry (Phase B unlock).** Supabase Dashboard exposes per-key usage, error, and latency stats. When BR-14 GM Dashboard performance issues surface, attribution becomes trivial.
- **Cleaner forensics.** Audit logs at Supabase attribute every query to a specific key, enabling per-service query attribution post-Phase B sharding.
- **GitHub Secret Scanning compatibility.** Opaque-token format (`sb_secret_*`) is a recognised Supabase secret pattern in GitHub's scanner — future accidental commits trigger immediate alerts; legacy JWT format is less reliably detected.
- **Aligns with Engineering Constraint EC-14 spirit** (separate Ops Console auth) by enabling per-service auth at the Supabase layer, layered on top of the existing per-project separation.
- **Future Roaming + Corporate Governance fit.** Phase 2 services (corp aggregation worker, brand-config fetcher) and Phase 3 services (governance score computer) can each receive narrowly-scoped `sb_secret_*` keys from the day they're built, avoiding retrofit debt similar to the EC-17 ThemeProvider lesson.

### Negative

- **Phase B work item created.** Sharding to per-service keys must be executed in June 2026, not forgotten. Tracked via the "Future Revision" section below.
- **Mental model shift.** Engineers reading old session logs / docs will see references to `anon` and `service_role` (legacy terminology). Newer docs use `publishable` and `secret`. AWS-process-doc-IMP.md §3.3 was updated 2026-05-05 to reflect this; CLAUDE.md still references the prior terminology and will be updated in Phase A Step 1.
- **Slight Supabase library version requirement.** Supabase JS client `>= v2.40` recommended for full opaque-token compatibility. Project currently meets this — verified via `package-lock.json`. Future upgrades must not regress below v2.40.

### Neutral

- **JWT signing secret untouched during this migration.** The Supabase project's user-session JWT signing secret is independent of the API-key opaque tokens. Migrating API keys does NOT invalidate user sessions. This is the property we wanted preserved.

---

## Implementation Notes

### Migration executed 2026-05-05

Founder actions completed:
1. Supabase Dashboard → Project Settings → API → switched to new key system
2. Generated `sb_secret_*` (server) and `sb_publishable_*` (client)
3. Disabled legacy `anon` and `service_role` JWT keys
4. Updated env vars on all 4 Railway services (`api`, `scheduler`, `escalation`, `notifier`): `SUPABASE_SERVICE_ROLE_KEY=<sb_secret_value>`, `SUPABASE_ANON_KEY=<sb_publishable_value>`
5. Updated local `.env` file
6. JWT signing secret intentionally **NOT** rotated

Validation expected:
- `GET https://api-production-9f9dd.up.railway.app/health` → `{"checks":{"database":"ok",...}}` (api uses new secret key against Supabase REST)
- Local `.env`-driven CLI scripts continue to work (e.g., `scripts/rls_isolation_verify_v2.sql`)
- Workers paused — no live worker test until Phase B June unfreeze

### Phase B — June 2026 sharding plan

When unfreeze begins, before applying migrations 009 and 010:

1. **Generate 4 new `sb_secret_*` keys** at Supabase Dashboard, each named for its consumer:
   - `sb_secret_api_*` — for Railway `api` service
   - `sb_secret_scheduler_*` — for Railway `scheduler` service
   - `sb_secret_escalation_*` — for Railway `escalation` service
   - `sb_secret_notifier_*` — for Railway `notifier` service
2. **Update Railway env vars per service** — each service's `SUPABASE_SERVICE_ROLE_KEY` gets its own value
3. **Disable the shared `sb_secret_*` key** at Supabase Dashboard after all 4 services restart with the new per-service keys
4. **Validate per-key telemetry** in Supabase Dashboard — each service's queries should be attributed to its own key
5. **Update AWS-process-doc-IMP.md** to reflect the per-service model
6. **Update memory files** (`reference_supabase_keys.md` if created) with the new posture
7. **Document in session log** as part of Phase B kickoff

This sharding pass is estimated at ~30 minutes founder action + ~10 minutes Claude validation. To be sequenced during the same June 2026 work session that runs migration 009 + 010 + applies AWS Activate credits + fixes worker Start Commands.

### Future-state architecture (post-sharding)

```
Supabase Project: exrewpsjrtevsicmullp
├── sb_secret_api_*           → Railway api service          (REST + auth callbacks)
├── sb_secret_scheduler_*     → Railway scheduler worker     (task_instances writes, schedule_templates reads)
├── sb_secret_escalation_*    → Railway escalation worker    (escalation_events writes, comm_deliveries reads)
├── sb_secret_notifier_*      → Railway notifier worker      (comm_deliveries writes, FCM/WA/SMS dispatch)
├── sb_publishable_*          → Mobile + Dashboard + Ops Console clients
└── sb_secret_corp_*          → (Phase 3, June+) Corporate governance aggregator
```

Each `sb_secret_*` key bypasses RLS (same Supabase model as legacy `service_role`) — RLS is enforced via `set_tenant_context()` middleware, not via key scoping. Per-service keys are about blast radius, audit attribution, and rotation independence — not per-service RLS scoping.

---

## Validation

This ADR is considered satisfied when:

- [x] Supabase Dashboard shows `sb_publishable_*` and `sb_secret_*` keys generated, legacy keys disabled (founder action 2026-05-05)
- [x] Railway env vars on all 4 services hold the new opaque-token values (founder action 2026-05-05)
- [x] Local `.env` updated with new values (founder action 2026-05-05)
- [x] AWS-process-doc-IMP.md §3.3 updated to reference the new key model (this commit)
- [x] This ADR (`docs/adr/0003-supabase-publishable-secret-keys.md`) committed
- [ ] CLAUDE.md updated (Phase A Step 1 — pending)
- [ ] Memory file `reference_supabase_keys.md` saved (this work item)
- [ ] **Phase B (June 2026):** sharding to per-service keys executed
- [ ] **Phase B (June 2026):** shared `sb_secret_*` key disabled at Supabase Dashboard

---

## References

- Supabase API keys docs: https://supabase.com/docs/guides/getting-started/api-keys
- Architecture v7 §1.3 EC-02 (RLS on every table) — RLS enforcement model unchanged by this migration
- Architecture v7 §6.2 Service inventory — 4 Railway services that consume Supabase service-role key
- ADR 0001 — Migration renumbering precedent
- Plan: `report-gen/2026-05-04-22:30_plan.md` — security incident response section (to be amended)
- Session log: `report-gen/2026-05-05-XX:XX_security.md` (to be written by Claude after history rewrite)

---

*ADR captured 2026-05-05 · Status: Accepted · Phase B revision scheduled June 2026*
