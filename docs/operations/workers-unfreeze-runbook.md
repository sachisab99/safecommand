# Workers unfreeze runbook — June 2026 transition

> **Purpose:** step-by-step playbook for transitioning all four Railway worker services from `WORKERS_PAUSED=true` (May freeze posture) to always-on operation per ADR 0005. Designed to be executed in a single 45-minute window with rollback capability at every step.
>
> **Scheduled execution:** 2026-06-01 (or first weekday after AWS Activate credit approval).
>
> **Owner:** Founder. Engineering supports.
>
> **Companion docs:**
> - `docs/adr/0005-workers-always-on-from-june.md` — decision rationale
> - `JUNE-2026-REVIEW-REQUIRED.md` — overall June unfreeze gate
> - Memory `reference_workers_paused_kill_switch.md` — historical context

---

## 0. Architecture context (45-second read)

Four Railway services, all currently paused via `WORKERS_PAUSED=true` env var:

| Service | Purpose | Production behaviour expected post-unfreeze |
|---|---|---|
| `api` | Express REST API; serves mobile + dashboards | Already running for read traffic; behaviour unchanged at unfreeze |
| `scheduler` | BullMQ consumer of `schedule-generation` queue | Generates `task_instances` from active schedule_templates every 60s |
| `escalation` | BullMQ consumer of `escalations` queue (priority 0) | Processes 3-level escalation chains (FS → SC → SH at 0/30/60 min) |
| `notifier` | BullMQ consumer of `notifications` queue | Parallel FCM + WhatsApp dispatch; 90s SMS fallback |

`api` is unaffected by the unfreeze (it always responded; Phase 1 read traffic continues). The other three services activate from queue-consumer state to production-tick state.

---

## 1. Pre-flight checklist (T-7 days)

Owner: founder. **Must be complete by 2026-05-25.**

### 1.1 AWS Activate credits applied

- [ ] AWS Activate startup credits application submitted via AWS Console → Activate Founders Pack ($1,000 tier)
- [ ] Approval email received
- [ ] Credits visible in AWS Console → Billing → Credits with balance ≥ $750
- [ ] **If approval delayed >2 weeks:** delay unfreeze to mid-June; do NOT proceed without credits

### 1.2 Cost alert configuration

Set up alerts so cost runaway is detected within 1 hour, not 1 day:

- [ ] AWS Budget at $100 / $250 / $500 thresholds (monthly) → email + Slack DM to founder
- [ ] Upstash Redis dashboard alert at 80% quota usage
- [ ] Railway billing dashboard checked; current spend baseline noted (typically ~$5/day with workers paused)
- [ ] Sentry alerting active for all 4 services (errors per minute > 10 = alert)
- [ ] UptimeRobot configured for `api.safecommand.in/health` (or current Railway domain) at 5-minute interval

### 1.3 End-to-end test in pre-prod context

Without enabling production, verify the cold-start path works:

- [ ] Local scheduler tick: `cd apps/scheduler && npm run dev` → observe one tick cycle locally → confirm task_instances generated for `Hyderabad Demo Supermall` venue
- [ ] Local escalation: emit a synthetic `escalations` job → confirm consumer picks up → confirm comm_deliveries row written
- [ ] Local notifier: send synthetic FCM + WA + SMS request → confirm test phone receives all three (Firebase test phone OTP for FCM; Meta WA test recipient; Airtel test sender)
- [ ] If any synthetic test fails: triage NOW; do NOT proceed to T-0 with unknown-broken paths

### 1.4 Backup + rollback plan ready

- [ ] Supabase Dashboard → Project Settings → Database → confirm Point-in-Time Recovery active (Pro plan, 7-day window)
- [ ] Note current Railway service revision IDs (in case need to roll back to a specific deployment)
- [ ] `WORKERS_PAUSED` revert command rehearsed: Railway Dashboard → service → Variables → set `WORKERS_PAUSED=true` (single click; 30s effect)

---

## 2. T-0: 45-minute transition window

Schedule for a quiet operational window (e.g. 14:00 IST on a Tuesday — middle of business day, low pilot traffic, founder + engineering both at desk).

### 2.1 (T+0 to T+5) Confirm dashboards green

```
Window 0–5:00:
  Open in browser tabs:
    - Sentry — Issues view, last 1 hour, filter: production
    - UptimeRobot — All Monitors view
    - Railway — Billing dashboard
    - AWS Console — Billing → Cost Explorer (last 7 days)
    - Upstash Redis — Console + Dashboard
    - Supabase — Project status
```

Expected state: all dashboards green; baseline cost ~$5/day (workers paused).

If any dashboard shows red / yellow → triage before proceeding. Cost-related alerts paused-state should NOT be firing; if they are, something else is wrong.

### 2.2 (T+5 to T+10) Unfreeze scheduler

```
Window 5:00–10:00:
  Railway Dashboard → service "scheduler" → Variables tab:
    1. Locate WORKERS_PAUSED variable
    2. Click → set value to `false` (or remove the variable entirely)
    3. Click Save → service auto-restarts within 30 seconds
    4. Switch to Logs tab; watch for boot sequence:
       [boot] scheduler starting...
       [boot] BullMQ connected to redis
       [boot] WORKERS_PAUSED=false; entering active loop
       [tick] Generated 0 task_instances at 2026-06-01T08:30:00Z
       [tick] Generated 0 task_instances at 2026-06-01T08:31:00Z
    5. Locate MASTER_TICK_INTERVAL variable (or add it if missing)
    6. Set value to 60000 (60 seconds — production target)
    7. Save → service restarts again
    8. Logs: confirm tick interval is now 60s not 4hr (240000)
```

If logs show errors at boot: revert immediately by setting `WORKERS_PAUSED=true`. Triage offline.

### 2.3 (T+10 to T+15) Unfreeze escalation worker

```
Window 10:00–15:00:
  Railway Dashboard → service "escalation":
    1. Same pattern: WORKERS_PAUSED=false (or remove)
    2. Watch logs:
       [boot] escalation worker starting...
       [boot] Subscribed to BullMQ queue: escalations
       [boot] Active loop entered
       [poll] No jobs in queue at 2026-06-01T08:35:00Z
    3. No tick interval to set; consumer-only
```

### 2.4 (T+15 to T+20) Unfreeze notifier worker

```
Window 15:00–20:00:
  Railway Dashboard → service "notifier":
    1. WORKERS_PAUSED=false
    2. Watch logs:
       [boot] notifier worker starting...
       [boot] Firebase Admin SDK initialised (project: safecommand-51499)
       [boot] Meta WhatsApp Business API client ready
       [boot] Airtel SMS client ready
       [poll] No jobs in queue at 2026-06-01T08:40:00Z
    3. Confirm Firebase init success — if PEM key error, triage
       (this is a known pitfall from earlier deploys; PEM key
       formatting must use literal \n)
```

### 2.5 (T+20 to T+30) End-to-end smoke test

This is the critical validation. Run a synthetic incident:

```bash
# From a terminal (with .env loaded):
cd "/Volumes/Crucial X9/claude_code/NEXUS_system/products/Safecommand"

# Step 1: Confirm an active shift instance exists for Hyderabad Demo
# Supermall (so escalation has staff to escalate to)
psql "$POOLER_URL" -c "
  SELECT si.id, si.status, s.name AS shift_name, st.name AS commander_name
  FROM shift_instances si
  JOIN shifts s ON s.id = si.shift_id
  JOIN staff st ON st.id = si.commander_staff_id
  WHERE si.venue_id = '096a3701-beb0-4ffe-9e74-43af3c26e09f'
    AND si.shift_date = CURRENT_DATE
    AND si.status = 'ACTIVE'
  LIMIT 1;
"
# Expected: 1 row showing today's active shift with commander assigned
# If no rows: re-run ./scripts/seed-hyderabad-demo.sh first

# Step 2: Declare a synthetic incident on the demo venue
# (use the api directly, or the dashboard, or mobile)
curl -X POST "https://api-production-9f9dd.up.railway.app/v1/incidents" \
  -H "Authorization: Bearer $DEMO_SH_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "FIRE",
    "severity": "SEV2",
    "zone_id": "ZONE_UUID_HERE",
    "description": "Synthetic test — workers unfreeze validation"
  }'

# Step 3: Watch escalation worker logs
# Expected within 5 seconds: escalation enqueued, level-1 notification sent
# Expected within 90 seconds (if WA fails): SMS fallback fires

# Step 4: Confirm comm_deliveries rows written
psql "$POOLER_URL" -c "
  SELECT id, channel, status, sent_at, delivered_at
  FROM comm_deliveries
  WHERE created_at > NOW() - INTERVAL '2 minutes'
  ORDER BY created_at DESC
  LIMIT 10;
"
# Expected: rows for FCM and (if approved) WhatsApp; SMS only if WA fails
```

If any step fails at this stage, **rollback immediately** (§3 below).

### 2.6 (T+30 to T+45) Cost dashboard check + sign-off

```
Window 30:00–45:00:
  After 30 minutes of operation:
    - AWS Cost Explorer: confirm uptick is within expected range
      (typically +$1-3/day from baseline)
    - Upstash Redis: confirm queue depth normal (< 10 jobs)
    - Railway billing: confirm no anomalous spike
    - Sentry: confirm no error rate spike

  If all green: 
    - Update JUNE-2026-REVIEW-REQUIRED.md with timestamp + screenshots
    - Close terminal triage / Slack alert posture
    - Mark transition complete
  
  If yellow/red:
    - Pause specific failing service via WORKERS_PAUSED=true
    - Triage; do NOT consider transition complete
    - Resume the failing service only when fixed
```

---

## 3. Rollback procedure (if any step fails)

### Quick rollback (single service)

```
Railway Dashboard → failing service → Variables → set WORKERS_PAUSED=true
Service restarts within 30 seconds; worker re-enters paused state.
Other services may continue operating in mixed state during triage.
```

### Full rollback (all services back to paused)

```
Railway Dashboard → for each of: scheduler, escalation, notifier:
  - Variables → set WORKERS_PAUSED=true
Services restart within 30 seconds.
api stays running (read traffic unaffected).

Then triage offline; identify root cause; re-attempt unfreeze on a
later date with the issue fixed.
```

### Data inconsistency rollback (rare)

If during the unfreeze window data writes occur that need to be undone (e.g. mass synthetic test left orphan rows):

```
Supabase Dashboard → Project Settings → Database → Point-in-Time Recovery
  → Choose timestamp from before unfreeze
  → Restore to new branch (Supabase creates a copy)
  → Compare differences; selectively restore needed rows
```

PITR is a 7-day window on Pro plan; do not delay rollback past that.

---

## 4. Post-transition operational state

After successful T+45 sign-off, ongoing operations:

### 4.1 Routine monitoring cadence

| Task | Cadence | Owner |
|---|---|---|
| Sentry error review | Daily 09:00 IST | Founder |
| UptimeRobot check | Continuous (alerts only) | Founder |
| Cost dashboards (AWS / Upstash / Railway) | Weekly Friday | Founder |
| Queue depth check (BullMQ via Upstash console) | Weekly Friday | Founder |
| AWS Activate credit balance | Weekly Friday | Founder |
| Worker log review (errors, abnormal patterns) | Weekly Friday | Founder |

### 4.2 Emergency kill switch invocation criteria

Per ADR 0005, set `WORKERS_PAUSED=true` ONLY for:

- **Cost runaway:** AWS / Upstash / Railway > 4× expected daily spend in any 4-hour window
- **Data breach:** confirmed compromised credential or data leak in flight
- **Catastrophic queue backlog:** BullMQ depth > 100 with no drainage for 30+ minutes

NOT for:
- Routine maintenance (use Railway blue-green deploy)
- "Off-hours" cost reduction (workers are 24/7; pilot venues are 24/7)
- Code deployment (Railway handles graceful restart)

### 4.3 Escalation if kill switch invoked

If `WORKERS_PAUSED=true` is set after the unfreeze, founder triages within 4 hours and:

1. Decides whether the issue warrants extended pause or immediate resume
2. If pause continues > 4 hours: notify any active pilot SH via Slack / WhatsApp that incident processing is in degraded state
3. Document the incident in `JUNE-2026-REVIEW-REQUIRED.md` post-incident review section
4. Resume by removing `WORKERS_PAUSED` (or setting `false`) once cause resolved

---

## 5. Reference quick-look

### Key URLs

| Resource | URL |
|---|---|
| Railway dashboard | `https://railway.app/dashboard` |
| Supabase dashboard | `https://supabase.com/dashboard/project/exrewpsjrtevsicmullp` |
| AWS Console | `https://console.aws.amazon.com` |
| Upstash console | `https://console.upstash.com/redis/lucky-giraffe-107825` |
| Firebase Console | `https://console.firebase.google.com/project/safecommand-51499` |
| Sentry | (configure during pre-flight) |
| UptimeRobot | (configure during pre-flight) |

### Key env variables

| Variable | Service | Production value |
|---|---|---|
| `WORKERS_PAUSED` | scheduler, escalation, notifier | `false` (or unset) post-unfreeze |
| `MASTER_TICK_INTERVAL` | scheduler | `60000` (60s) |
| `SC_REDIS_URL` | all workers | Upstash URL |
| `FIREBASE_PROJECT_ID` | notifier, api | `safecommand-51499` |
| `FIREBASE_PRIVATE_KEY` | notifier, api | PEM key with literal `\n` |
| `META_WHATSAPP_*` | notifier | Meta WABA credentials (post-approval) |
| `AIRTEL_*` | notifier | Airtel DLT credentials (post-approval) |
| `SUPABASE_SERVICE_ROLE_KEY` | api, workers | `sb_secret_*` opaque token |

### Key SQL queries (for debugging)

```sql
-- Queue depth (run in Upstash CLI; not psql)
LLEN bull:schedule-generation:wait
LLEN bull:escalations:wait
LLEN bull:notifications:wait

-- Recent task_instances generation rate
SELECT date_trunc('minute', created_at), COUNT(*)
FROM task_instances
WHERE created_at > NOW() - INTERVAL '15 minutes'
GROUP BY 1 ORDER BY 1 DESC;
-- Expected: ~1 batch every 60s (matches scheduler tick)

-- Recent comm_deliveries
SELECT channel, status, COUNT(*)
FROM comm_deliveries
WHERE created_at > NOW() - INTERVAL '15 minutes'
GROUP BY 1, 2;
-- Expected: APP_PUSH success rate > 95%; WHATSAPP if approved

-- Audit log activity
SELECT action, actor_role, COUNT(*)
FROM audit_logs
WHERE created_at > NOW() - INTERVAL '15 minutes'
GROUP BY 1, 2 ORDER BY 3 DESC;
```

---

## 6. Sign-off

This runbook is satisfied when:

- [ ] All pre-flight checklist items in §1 are checked
- [ ] T+0 to T+45 transition steps in §2 executed cleanly
- [ ] Cost dashboards confirm no anomalous spike
- [ ] One synthetic incident processed end-to-end (declare → escalate → notify)
- [ ] `JUNE-2026-REVIEW-REQUIRED.md` updated with timestamp + screenshots

After sign-off, the unfreeze is "done" and ongoing monitoring per §4 takes over.

---

## 7. Maintenance

- **Owner:** SafeCommand Engineering (active until 2026-12-01); Founder thereafter
- **Review cadence:** Update this runbook after each kill switch invocation; quarterly review for staleness
- **Companion docs:**
  - ADR 0005 — decision rationale
  - JUNE-2026-REVIEW-REQUIRED.md — June unfreeze checklist (this runbook is one item)
  - Memory `reference_workers_paused_kill_switch.md` — kept for historical context
