# ADR 0005 — Workers always-on from June 2026; `WORKERS_PAUSED` becomes emergency kill switch

**Status:** Accepted
**Date:** 2026-05-08 (codifying decision recorded in Business Plan v8.0 / Architecture v8 dated 2026-05-10)
**Deciders:** Sachin Sablok (Founder), Nexus Prime (claude-opus-4-7)
**Supersedes:** Implicit posture from May 2026 budget freeze (`reference_workers_paused_kill_switch.md` memory file documented this as cost-discipline; v8 formally repurposes it as emergency-only)
**Related:** ADR 0004 (Phase 1 pilot selection — supermall Pilot 2 needs always-on workers from October pilot go-live), `reference_aws_activate_safecommand.md` memory (AWS Activate credits required pre-June)

---

## Context

During the May 2026 budget freeze, all four Railway worker services (`scheduler`, `escalation`, `notifier`, plus the api which is not a worker but adheres to the same monitoring posture) were paused via the `WORKERS_PAUSED=true` environment variable. The original posture rationale was cost discipline: avoid Upstash Redis, Railway compute, and Firebase / Meta WhatsApp delivery costs while no production venues were active.

Two operational realities have evolved:

1. **Phase 1 pilots go live from October 2026.** Pilot 2 (Hyderabad supermall, 3-building MBV reference per ADR 0004) requires workers operational. There is no "soft launch" path that keeps workers paused; from the moment the first venue activates, the scheduler must be running, escalation queues must be processing, and the notifier must be delivering FCM/WhatsApp/SMS.
2. **AWS Activate credits are available.** $1,000 startup credits applied via AWS Console → Billing → Credits (founder-action item, memory `reference_aws_activate_safecommand.md`) cover the bulk of compute + S3 + Sentry / UptimeRobot costs through Phase 1. With credits applied, the cost case for permanent worker pausing collapses.

A formal posture change is needed for two reasons:
- Operational clarity: Phase 5.21+ Architecture v8 implicitly assumes always-on workers (the Auto-Evacuation Suggestion engine of BR-L runs on a continuous timer; selective evacuation fan-out enqueues to BullMQ; PA auto-draft generation runs in the notifier worker).
- Risk hygiene: as a CRITICAL CONTROL marker (per memory file) the `WORKERS_PAUSED` env var must NOT be reused for cost-discipline once Phase 1 is live — that would cause silent regression of pilot venue capabilities. Repurposing it as emergency-only is the safer governance posture.

---

## Decision

### Workers transition to always-on from 2026-06-01

Effective date: **2026-06-01** (founder confirms approximately Week 1 June pending AWS Activate credit approval).

All four Railway services (`scheduler`, `escalation`, `notifier`, `api`) operate continuously with their canonical configurations:

- `scheduler`: `MASTER_TICK_INTERVAL=60000` (60 seconds — production target per CLAUDE.md)
- `escalation`: priority-0 BullMQ queue active; 3-level escalation (FS → SC → SH at 0/30/60 min)
- `notifier`: parallel FCM + WhatsApp dispatch; SMS fallback at 90s undelivered
- `api`: 2 replicas; auto-restarts via Railway

`WORKERS_PAUSED` env var **retains its existence on every service** but is repurposed:

| Posture | `WORKERS_PAUSED` value | When to use |
|---|---|---|
| **NORMAL OPERATION (default June onward)** | unset / false | Always-on. Workers process queues, escalations, notifications. |
| **EMERGENCY KILL SWITCH** | `true` | Set ONLY in three scenarios: (a) Sentry alerts spike unexpectedly with cost runaway; (b) Upstash Redis quota breach risk; (c) Catastrophic data loss / breach response while triage in flight. |

### What `WORKERS_PAUSED` is NOT

After 2026-06-01:
- ❌ NOT for cost-discipline (use AWS Activate credits + per-task efficiency instead)
- ❌ NOT for "we're not on shift this weekend" (workers are 24/7; pilot venues operate 24/7)
- ❌ NOT for routine deployments (Railway handles graceful restart automatically)
- ❌ NOT for upgrade-related downtime (use blue-green deploy or feature flags)

### Sleep application pattern in scripts

Local development scripts (`scripts/seed-test-tasks.sh`, demo seeds) use **`sleepApplication`** rather than worker pause when delaying for sequenced operations. This pattern preserves worker availability while still allowing scripted timing.

### AWS Activate credits prerequisite

Before 2026-06-01 the founder must:
1. Apply AWS Activate credits via AWS Console → Billing → Credits (memory file `reference_aws_activate_safecommand.md`)
2. Confirm credit balance ≥ $750 to cover June + July + August projected compute
3. Set up cost alerts (AWS Budget at $100 / $250 / $500 thresholds for early signal)

If AWS Activate credits are not approved by 2026-05-25, the always-on transition slips to mid-June with a 2-week interim where workers remain paused but the api is unfrozen for read traffic only (validation gate continues).

---

## Operational implications

### Pre-June 1 checklist (to be tracked in `JUNE-2026-REVIEW-REQUIRED.md`)

- [ ] AWS Activate credits applied + balance confirmed
- [ ] Sentry error tracking active for all 4 services (configured but verify alerting)
- [ ] UptimeRobot monitors active for `api.safecommand.in/health` (or current Railway URL)
- [ ] Cost alerts configured at AWS / Upstash / Railway dashboards
- [ ] Workers-unfreeze runbook reviewed (`docs/operations/workers-unfreeze-runbook.md` — to be created)
- [ ] One-time scheduler test: set `MASTER_TICK_INTERVAL=60000`, observe one full tick cycle, verify task_instances generation rate matches expectation
- [ ] Notifier test: send one FCM push to test phone, one WhatsApp template message, one SMS via Airtel — confirm all 3 channels deliver

### June 1 transition steps (45-minute window)

1. (T-15) Confirm Sentry + UptimeRobot dashboards green; cost alerts armed
2. (T-0) Railway Dashboard → service `scheduler` → Variables → set `WORKERS_PAUSED=false` (or remove); set `MASTER_TICK_INTERVAL=60000`; service auto-restarts
3. (T+5) Same for `escalation` and `notifier` services
4. (T+10) Watch logs: confirm scheduler tick logs every 60s; confirm notifier picks up any backlogged jobs
5. (T+20) Run a synthetic incident in `Hyderabad Demo Supermall` — declare → escalation queue → notification → confirm end-to-end ≤5s NFR-02
6. (T+30) Confirm cost dashboards: AWS / Upstash / Railway showing expected uptick within tolerance
7. (T+45) Mark transition complete in `JUNE-2026-REVIEW-REQUIRED.md` with timestamp + screenshot of dashboards

### Emergency kill switch invocation procedure

When to invoke:
- **Cost runaway:** AWS / Upstash / Railway > 4× expected daily spend in any 4-hour window
- **Data loss / breach:** confirmed compromised credential or data leak in flight
- **Catastrophic queue backlog:** BullMQ depth > 100 with no drainage for 30+ minutes (indicates downstream failure)

How to invoke:
1. Railway Dashboard → affected service → Variables → set `WORKERS_PAUSED=true`
2. Service restarts within 30s; worker enters "pause loop" (acknowledges WORKERS_PAUSED, sleeps without processing)
3. Slack / WhatsApp founder notification (manual)
4. Triage in `JUNE-2026-REVIEW-REQUIRED.md` post-incident review section
5. Resume by setting `WORKERS_PAUSED=false` (or remove) once triage complete

---

## Alternatives considered

### A. Keep `WORKERS_PAUSED` as cost-discipline lever

Rejected because:
- Phase 1 pilots from October require always-on workers; the role of cost-discipline disappears
- Confusing dual-purpose env var (cost vs emergency) leads to inconsistent application
- AWS Activate credits + cost alerts deliver the same risk control without operational overhead

### B. Separate cost-discipline env var from emergency kill switch

Considered (e.g. `COST_FREEZE=true` separate from `EMERGENCY_PAUSE=true`). Rejected because:
- Two env vars with overlapping behaviour is more error-prone than one
- The set of conditions warranting cost-freeze is empty post-credit-approval; no need for the separate lever
- Single `WORKERS_PAUSED=true` with documented "emergency only" semantics is simpler

### C. Auto-pause based on cost thresholds

Considered (cron job or AWS Lambda monitors cost; auto-pauses workers if breach). Rejected because:
- Adds one more thing that can fail (auto-pause logic itself)
- Latency: by the time cost breach detected, harm is already done; the budget control is the prevention (cost alerts + credit balance), not the response
- Simpler manual kill switch with founder-pager-style alerts is cleaner

---

## Consequences

### Positive

- **Phase 1 pilots can launch in October** without operational ambiguity about worker state
- **AWS Activate credits utilised** before they expire (12-month window from approval)
- **`WORKERS_PAUSED` retains its purpose** as a documented critical control — just narrower scope
- **Architecture v8 SIRE features** (Auto-Evacuation Suggestion BR-L, PA auto-draft BR-N) can rely on continuous worker presence
- **Operational governance posture aligns** with industry-standard 24/7 emergency systems (NFPA, NABH expect always-on)

### Negative

- **Higher running cost** in operational steady state (~$20-40/month per worker after credit exhaustion). Mitigated by AWS Activate credits + ARR ramp during pilot phase.
- **More monitoring overhead** — Sentry + UptimeRobot alerts must be maintained; cost dashboards reviewed weekly
- **Loss of "soft maintenance" window** — can't pause workers during deploys; must use Railway's blue-green or feature flags

### Neutral

- **No code changes required** — `WORKERS_PAUSED` env var already implemented; transition is operational only
- **Memory file `reference_workers_paused_kill_switch.md` retained** but updated with pointer to this ADR for the new posture interpretation

---

## Future revision triggers

- AWS Activate credit exhaustion (typically 12 months from approval) → re-evaluate cost posture; may need pricing decision (paid Sentry plan, Upstash autoscale config, etc.)
- Phase 2 GCP migration (Feb 2027) → workers may move to Cloud Run; this ADR's `WORKERS_PAUSED` semantics translate to Cloud Run service-paused state
- Multi-region deployment (post-pilot) → kill switch may become per-region rather than global

---

## References

- Business Plan v8.0 (2026-05-10) §16 Build Plan — June 2026 transition window
- Architecture v8 — SIRE features assume always-on workers
- `JUNE-2026-REVIEW-REQUIRED.md` — operational gate for the transition
- `docs/operations/workers-unfreeze-runbook.md` (to be created) — step-by-step playbook
- Memory `reference_workers_paused_kill_switch.md` — original cost-discipline rationale (now historical)
- Memory `reference_aws_activate_safecommand.md` — credit application tracking
