## 13. Scheduler master-tick frequency analysis

### 13.1 What the master-tick controls (and what it does NOT)

The **master-tick** is a BullMQ repeatable job in the `scheduler` service that fires at a fixed interval. On each fire, the scheduler queries the database for `schedule_templates` whose next computed slot has passed, then creates `task_instances` and enqueues notifications.

**What the tick rate DOES affect:**
- **Lag between "task scheduled time" and "task instance created in DB"**
- **Lag between "new schedule template added" and "first task instance generated"**
- **Burn rate of Redis commands proportionally**

**What the tick rate does NOT affect:**
- ❌ **Incident notification latency** (incident POST → enqueue → push fires instantly, ≤5s per NFR-02 — this is event-driven, not tick-driven)
- ❌ **Escalation timing accuracy** (BullMQ schedules delayed jobs at exact `window_expires_at` time at task creation; the escalation worker fires those at the correct moment regardless of master-tick rate)
- ❌ **Mobile app responsiveness** (mobile pulls its own data on demand)
- ❌ **Dashboard refresh** (independent 5s polling)
- ❌ **Push notification delivery** (FCM is asynchronous and event-driven)
- ❌ **Task completion sync** (mobile uploads to API directly)
- ❌ **Real-time zone status updates** (driven by incident POST, not by tick)

**The tick rate is ONLY the upper bound on how stale "newly due task instances" can be before reaching the worker queue.** Everything else is event-driven and unaffected.

### 13.2 Impact analysis at each rate
---
The rates below represent different tick intervals. Note that "cmd/min" includes the master-tick + its associated heartbeat/lock-renewal Redis commands (typically ~6 commands per tick lifecycle).

| Rate | Tick interval | Max scheduled-task lag | Redis burn from tick (per month) | User-perceptible impact |
|------|---------------|------------------------|----------------------------------|-------------------------|
| **60 cmd/min** | ~1 second | <1 second | ~2.6M | None for humans — overkill |
| **40 cmd/min** | ~1.5 seconds | <1.5 seconds | ~1.7M | None — same as 60 cmd/min in practice |
| **6 cmd/min** | ~60 seconds | <60 seconds | ~260K | None — adequate for all venue safety NFRs (production target) |
| **3 cmd/min** | ~2 minutes | <2 minutes | ~130K | Build-phase moderate; tested 2026-05-02 |
| **1 cmd/min** | ~5–6 minutes | <6 minutes | ~43K | Noticeable for hourly tasks + demo loops |
| **0.5 cmd/min** | ~12 minutes | <12 minutes | ~22K | Set 2026-05-02 — minimum master-tick burn while keeping scheduler alive |
| **0.025 cmd/min (current — hibernation)** | **~4 hours** | **<4 hours** | **~1K** | Set 2026-05-03 — May budget freeze; scheduler effectively inert. Bump to 60s before ANY testing session |

### 13.3 Detailed scenario impact

**Scenario A: Hourly fire alarm test (BR-06, HOURLY frequency)**
A task is scheduled for 10:00:00 sharp.

| Rate | When task appears in mobile app | Notification arrives | Acceptable? |
|------|--------------------------------|---------------------|-------------|
| 60 cmd/min | 10:00:00–10:00:01 | within 5s of appearance | ✅ Yes — overkill |
| 40 cmd/min | 10:00:00–10:00:02 | within 5s of appearance | ✅ Yes |
| 6 cmd/min | 10:00:00–10:01:00 | within 5s of appearance | ✅ Yes — fine for ground staff |
| 1 cmd/min | 10:00:00–10:06:00 | within 5s of appearance | ⚠️ Marginal — staff might wonder why "10 AM check" arrived at 10:05 |

**Scenario B: Daily checklist task at 09:00 AM**
A task scheduled for the start of shift.

| Rate | Worst-case lag | Acceptable? |
|------|---------------|-------------|
| 60 cmd/min | 1s | ✅ Yes |
| 6 cmd/min | 60s | ✅ Yes |
| 1 cmd/min | 6 min | ✅ Yes — daily granularity tolerates several min of lag |

**Scenario C: Live demo / template testing**
You create a new schedule template in the Ops Console and want to see the task appear quickly.

| Rate | Time until first task appears | Demo experience |
|------|-------------------------------|-----------------|
| 60 cmd/min | <1s | Instant — best for live demos |
| 6 cmd/min | up to 60s | Acceptable — minor lag |
| 1 cmd/min | up to 6 min | ❌ Unusable for live demos — feels broken |

**Scenario D: Critical safety drill (BR-23 Festival Mode, time-bound)**
A drill scheduled to start at 14:00:00 must be visible to all staff immediately.

| Rate | Lag | Acceptable? |
|------|-----|-------------|
| 60 cmd/min | <1s | ✅ Yes |
| 6 cmd/min | <60s | ✅ Yes — drill cadence is minutes, not seconds |
| 1 cmd/min | <6 min | ⚠️ Borderline — depends on drill type |

**Scenario E: Escalation chain firing (BR-08)**
A task missed its window at 10:00; escalation should fire 15 min later (10:15).

| Rate | Escalation fire time | Acceptable? |
|------|---------------------|-------------|
| Any rate | 10:15:00 ± 1s | ✅ Yes — **escalation is delayed-job based, NOT tick-based** |

This is the most important point: **escalation timing is unaffected by master-tick rate**. BR-08 is safe at any rate.

**Scenario F: Real-time incident declaration (BR-11)**
SH declares a fire incident at 14:33:12.

| Rate | Push notification arrives | Acceptable? |
|------|--------------------------|-------------|
| Any rate | 14:33:12 + 5s (NFR-02) | ✅ Yes — **incidents are event-driven, NOT tick-based** |

### 13.4 Decision matrix — when to use each rate

| Rate | Recommended for | Reason |
|------|----------------|--------|
| **60 cmd/min** | Live customer demos, investor pitches | Immediate visual feedback impresses; cost is negligible during demo windows |
| **6 cmd/min** | Production at any scale | Meets all venue safety NFRs; baseline burn |
| **3 cmd/min (2-min tick)** | Active dev/test cycles | 50% Redis burn reduction vs production; 2-min lag tolerable |
| **1 cmd/min** | Off-hours dev / aggressive cost mode | Minimum tick that still keeps service "alive" with reasonable lag |
| **0.5 cmd/min (12-min tick)** | Build phase minimum-burn / awaiting pilot | Scheduler stays alive but barely; tasks lag up to 12 min — unsuitable for any live testing |
| **0.025 cmd/min (current — 4-hour tick — hibernation)** | May 2026 budget freeze | Scheduler effectively dormant; tasks lag up to 4 hours; equivalent to "paused without auth-token hassle" |
| **0 (paused)** | Truly idle (no testing, no traffic) | Use the pause-workers runbook in section 11.4 |

### 13.5 Cost impact at venue scale

Incremental Redis burn per scheduler tick rate change, beyond the always-on worker heartbeat baseline:

| Rate | Tick burn/month | Burn at PAYG ($0.20/100K) | At 10 venues (extrapolated) |
|------|----------------|---------------------------|------------------------------|
| 60 cmd/min | ~2.6M | ~$5/mo | ~$50/mo |
| 6 cmd/min | ~260K | <$1/mo | ~$5/mo |
| 1 cmd/min | ~43K | $0 (within free) | <$1/mo |

The tick alone is not the dominant cost. Worker idle heartbeats (always-on, ~1.7M/mo across 3 workers) outweigh the master-tick by ~6× at the default 6 cmd/min rate. **Reducing tick rate alone has limited cost impact** — pausing workers during off-hours (section 11.4) is the higher-leverage cost lever.

### 13.6 Recommendation

**Production:** keep at **6 cmd/min (60s tick)** — current default. Meets every NFR with margin. Don't bump up unless a specific customer requirement demands sub-second task latency (none currently exists).

**Build phase / development:** consider dropping to **2–3 cmd/min (every 20–30 seconds)** during heavy build phases when no live testing is happening. Saves ~50% of tick burn. Easy to revert to 60s before any demo.

**Demo windows:** temporarily bump to **20–60 cmd/min** for the duration of investor or customer demos. Re-set to default after.

**Never go below 1 cmd/min** unless workers are also paused. Below this, scheduler effectively becomes broken — tasks aren't generated, escalation chains can have stale state, user trust erodes.

### 13.7 How to change the tick rate (mechanical)

Edit `apps/scheduler/src/index.ts`:

```typescript
// Line ~217 currently:
{
  repeat: { every: 60_000 }, // 60s — current default = 6 cmd/min
  jobId: 'master-tick-singleton',
}

// Examples:
//   every: 1_000      → ~60 cmd/min (1s tick)
//   every: 30_000     → ~2 cmd/min (30s tick — recommended dev mode)
//   every: 300_000    → ~1 cmd/min (5min tick — minimum acceptable)
```

Then push, redeploy scheduler service. The repeatable job key is singleton, so changes propagate cleanly.

---

## 14. Upstash command limit — reset behavior

### 14.1 Free tier (Free DB plan)

| Property | Value |
|----------|-------|
| Command quota | **500,000 commands per calendar month** |
| Reset cycle | **00:00 UTC on the 1st of each calendar month** |
| Storage cap | 256 MB |
| Rate limit | 1,000 commands/sec sustained |
| Idle eviction | 14 days of no commands → DB suspended |
| Behavior at quota | All commands rejected with `ERR max requests limit exceeded. Limit: 500000, Usage: <N>` |
| Recovery from quota hit | Either upgrade plan immediately OR wait until 1st of next month |

**Reset is automatic and unconditional.** Whether you finish 100K or 500K, the counter starts at 0 again at 00:00 UTC on the 1st.

**Real example from this project:** Hit limit on 2026-05-02. Without upgrade, would have stayed broken until 2026-06-01 00:00 UTC. With upgrade → recovered in <5 minutes.

### 14.2 Pay-As-You-Go (PAYG)

| Property | Value |
|----------|-------|
| First 500K commands | Free each month (inherited from Free tier) |
| Cost beyond 500K | **$0.20 per 100,000 commands** |
| Storage | 1 GB included; $0.25/GB beyond |
| Rate limit | 10,000 commands/sec |
| Hard cap | None — pay for what you use |
| Reset cycle | Same — 1st of each month UTC |
| Behavior at any usage | Service never stops |

**No hard cap means no production outage from quota exhaustion.** This is the entire reason to upgrade for production-class workloads.

### 14.3 Cost calculator at SafeCommand burn

Given Pay-As-You-Go pricing, here's the monthly bill at projected burn rates:

| Monthly burn | Cost (PAYG) | Notes |
|-------------|-------------|-------|
| 500K (within free) | $0 | only achievable with workers paused most of the time |
| 1M | ~$1 | disciplined dev with 30s tick + paused workers off-hours |
| 3M (current dev burn) | ~$5 | active dev with always-on workers |
| 10M | ~$19 | 10 venues active production |
| 50M | ~$99 | 50 venues |
| 100M | ~$199 | trigger ElastiCache migration evaluation |

### 14.4 Practical implications

1. **Reset is calendar-based, not rolling 30 days.** If you hit limit on the 28th, you only wait 3-4 days to month-end — much shorter than waiting 30 days from the limit hit. Plan testing intensity around month boundaries.

2. **PAYG bill is end-of-month.** You pay on the 1st of next month based on prior month's overage. No surprises mid-month.

3. **Storage is rarely the bottleneck.** SafeCommand BullMQ usage stays well under 100 MB; storage tier upgrades aren't needed until Phase 3.

4. **Free tier is a useful "anomaly detector".** If we suddenly hit 500K mid-month after the upgrade, we know something is wrong (a runaway loop, leaked subscription, etc.) — even though PAYG won't break, the spike tells us something needs investigation. Configure the 80% usage alert (free, in console) to act as this canary.

5. **Plan changes propagate within seconds.** Upgrading from Free → PAYG is non-disruptive: existing connections continue working, no DNS change, no config update needed.

### 14.5 Operational rule

**During build phase:** Pay-As-You-Go is mandatory. The 500K free quota is too thin for daily Railway redeploys + worker heartbeats + iterative testing. Cost is $5–15/mo; engineering hours saved if avoiding another outage = far more.

**At Phase 2 production (10 venues):** PAYG continues. Estimated $20–40/mo. Still cheaper than ElastiCache.

**At Phase 3 (~100M+ commands/month):** evaluate AWS ElastiCache Serverless. Crossover point is roughly 100M cmd/month, where ElastiCache flat-rate beats PAYG variable-rate.

### 14.6 Monitoring quota — single command

```bash
# Get current month-to-date usage from Upstash REST API
curl -s "https://api.upstash.com/v2/redis/stats/lucky-giraffe-107825" \
  -H "Authorization: Bearer <UPSTASH_API_TOKEN>" | python3 -m json.tool
```

Set the API token from https://console.upstash.com/account/api → store in 1Password / encrypted local store.

For passive monitoring: configure usage alerts in Upstash Console → DB → Settings → Usage Alerts at 50% / 80% / 95% of budget threshold.

---

**End of document. Last review: 2026-05-02. Next scheduled review: 2026-06-01.**
