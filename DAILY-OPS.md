# Daily Ops Checklist — SafeCommand

**Purpose:** Step-by-step routine for starting and ending each work session. Optimised for cost discipline (Upstash Redis burn) and zero risk to live infra.
**Audience:** Solo founder daily use.
**Time required:** ~2 min morning, ~30 sec evening.
**Companion docs:** [`AWS-process-doc-IMP.md`](./AWS-process-doc-IMP.md) (deep reference) · [`upstash_redis.md`](./upstash_redis.md) (Redis cost analysis)

---

## At a glance — copy these three commands

```bash
# Morning — wake up workers
cd "/Volumes/Crucial X9/claude_code/NEXUS_system/products/Safecommand"
./scripts/resume-workers.sh

# Evening — pause workers
cd "/Volumes/Crucial X9/claude_code/NEXUS_system/products/Safecommand"
./scripts/pause-workers.sh

# Anytime — check current state
./scripts/worker-status.sh
```

---

## 🌅 Start of day routine

### Step 1 — Resume workers (~90 sec)

```bash
cd "/Volumes/Crucial X9/claude_code/NEXUS_system/products/Safecommand"
./scripts/resume-workers.sh
```

**Expected output:**
```
===================================================
  RESUMING WORKERS — SafeCommand Railway
  YYYY-MM-DD HH:MM:SS IST
===================================================
  ✓ scheduler    scaled to 1 replica
  ✓ escalation   scaled to 1 replica
  ✓ notifier     scaled to 1 replica

Workers scaling up. Verifying API health (may take 60-90 sec)...
  attempt 1/10 — waiting 15s...
  attempt 2/10 — waiting 15s...
  ...
✓ API healthy: {"status":"ok","service":"safecommand-api","checks":{"database":"ok","firebase":"ok"}}

  Workers fully online in ~30-60 more seconds.
```

When you see `✓ API healthy`, the system is ready.

### Step 2 — Sanity check (optional, ~10 sec)

```bash
./scripts/worker-status.sh
```

You should see all 4 services as `✓ RUNNING`.

### Step 3 — Start Metro for mobile dev (if needed)

```bash
cd apps/mobile
npx expo start --dev-client
```

(Skip this if you're only working on dashboard or API today.)

### Step 4 — Begin work

You're cleared to:
- Test mobile features (notifications, tasks, incidents)
- Push API/dashboard changes — they auto-deploy on git push
- Run end-to-end scenarios

**Do not skip resume.** Without workers running:
- Scheduled tasks won't generate
- Push notifications won't fire
- Escalations won't trigger
- You'll waste time debugging "why doesn't this work?"

---

## 🌙 End of day routine

### Step 1 — Stop Metro (if running)

In the terminal running `npx expo start`, press **Ctrl+C**. Metro stops; phone dev app will lose connection (expected).

### Step 2 — Pause workers (~30 sec)

```bash
cd "/Volumes/Crucial X9/claude_code/NEXUS_system/products/Safecommand"
./scripts/pause-workers.sh
```

**Expected output:**
```
===================================================
  PAUSING WORKERS — SafeCommand Railway
  YYYY-MM-DD HH:MM:SS IST
===================================================
  ✓ scheduler    scaled to 0 replicas
  ✓ escalation   scaled to 0 replicas
  ✓ notifier     scaled to 0 replicas

✓ All 3 workers paused. They will stop within ~30 sec.
  API remains running — dashboard and mobile auth still work.
```

### Step 3 — Verify (optional, ~10 sec)

```bash
./scripts/worker-status.sh
```

All 3 worker services should show `🛑 PAUSED   replicas=0`.
The `api` service should still show `✓ RUNNING`.

### Step 4 — Done

Close laptop. Workers consume zero Redis commands until you resume.

---

## What's running vs paused

| Service | When paused | When running |
|---------|-------------|--------------|
| **api** (Express, Railway) | Always running — never paused | Always running |
| **scheduler** (BullMQ master tick) | 🛑 No new tasks generated | ✓ Generates task instances every 2 min |
| **escalation** (BullMQ delayed jobs) | 🛑 Escalations queued but don't fire | ✓ Fires escalations on missed task windows |
| **notifier** (FCM/WhatsApp/SMS sender) | 🛑 No notifications sent | ✓ Sends notifications |
| **AWS Amplify Dashboard** | Always running — never paused | Always running |
| **Supabase Postgres** | Always running — never paused | Always running |
| **Upstash Redis** | Always running but ~0 burn | Burns ~40 cmd/min idle |

---

## Quick verification commands

| Goal | Command | Expected |
|------|---------|----------|
| API health | `curl -s https://api-production-9f9dd.up.railway.app/health` | `{"status":"ok",...}` |
| Worker state | `./scripts/worker-status.sh` | 4 services listed |
| Latest deploy | `railway service api && railway logs --deployment \| tail -5` | Recent log lines |
| Dashboard live | open https://main.d3t439ur25l1xc.amplifyapp.com | Login screen renders |

---

## When to NOT pause

Skip the end-of-day pause if any of these apply:

| Scenario | Why |
|----------|-----|
| Active demo to investor / customer | Notifications must fire on demand |
| Live pilot with real venue staff | Production traffic — never pause |
| Multi-day soak / load test running overnight | Need workers to process queue continuously |
| Testing escalation timing | Delayed jobs must fire at scheduled times |
| Awaiting a scheduled task you set for off-hours | Need scheduler to generate it |
| Team member in different timezone might test | Coordinate before pausing |

If unsure, run `./scripts/worker-status.sh` and leave them running. Cost of overnight burn = ~$0.10. Cost of broken demo = embarrassment.

---

## Common scenarios & quick fixes

### "I forgot to resume — mobile shows no tasks"

```bash
./scripts/resume-workers.sh
# wait for ✓ API healthy
# pull-to-refresh on mobile — tasks appear within 2 min
```

### "Pause script said `Railway CLI not authenticated`"

```bash
railway login
# follow browser auth flow
./scripts/pause-workers.sh   # retry
```

### "Resume script timed out waiting for API health"

The API takes longer than usual to come up. Check manually:
```bash
curl -s https://api-production-9f9dd.up.railway.app/health
# If still 502 after 3 min:
railway service api && railway logs --deployment | tail -30
# Look for crash error, then redeploy:
railway up --detach
```

### "Status script shows ⚠ FAILED"

Check the build logs for that specific service:
```bash
railway service <name>
railway logs --build | tail -40
```
Common causes: out-of-sync lockfile, env var missing, Redis disconnect.

### "I want to test escalation but workers are paused"

Just resume — you can pause again right after the test:
```bash
./scripts/resume-workers.sh
# ... do your test ...
./scripts/pause-workers.sh
```

### "Pause / resume failed for one service but not others"

Idempotent — re-run the same script. It only re-applies the change to services that need it. Or fall back to Railway dashboard manual scale.

### "I'll be on vacation for a week"

Run pause as normal. Workers stay at 0 until you resume — no burn the entire week. Resume when you're back.

---

## Cost expectation

| Pattern | Weekly Redis cmd | Monthly | Cost on PAYG |
|---------|------------------|---------|--------------|
| 24/7 always-on (no pause) | ~400K | ~1.7M | ~$3 |
| 12h-on / 12h-off | ~200K | ~860K | ~$1 |
| 8h-on weekdays + weekends paused | ~95K | ~410K | **$0 — within free tier** |

The pause discipline is more about **predictable cost** than dramatic savings. With weekday-only operation you stay under the free 500K/month cap entirely → only your overage from the May 2 incident is billed.

---

## What to do when this routine itself breaks

If both pause and resume scripts fail repeatedly:

1. Run `./scripts/worker-status.sh` to confirm current state
2. Open Railway dashboard manually at https://railway.app/project/3e27e7ad-f120-4958-b8f6-c1be42032914
3. Click each worker service → Settings → Replicas → set to 0 (pause) or 1 (resume) manually
4. Check `~/.railway/config.json` exists — if not, run `railway login`
5. If Railway itself is down (https://status.railway.com), workers can't be controlled anyway — wait it out

---

## Habit-building tips

- **Start every morning with `resume`.** Make it the first command after `cd Safecommand`. Build muscle memory.
- **Treat pause like locking the door.** Last thing before laptop closes.
- **Status check is cheap.** Run `./scripts/worker-status.sh` whenever you're unsure — takes 2 sec.
- **If you skip pause one night, no big deal.** Cost is cents. Don't let perfect be the enemy of good.
- **Weekends:** pause Friday evening, resume Monday morning. Saves the most burn.

---

**End of checklist. Update this doc whenever the routine changes.**
