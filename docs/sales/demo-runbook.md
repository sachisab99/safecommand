# SafeCommand demo runbook — standard execution protocol

> **Purpose:** the canonical step-by-step procedure for running any SafeCommand demo. Designed to deliver a live, functional environment in under 5 minutes from a cold start. Use for every client / investor / board demo.
>
> **Demo venue:** Hyderabad Demo Supermall (`SC-MAL-HYD-00012`, venue UUID `096a3701-beb0-4ffe-9e74-43af3c26e09f`)
>
> **Companion docs:**
> - `docs/sales/drill-demo-narrative.md` — audience-keyed talking points for the drill audit-grade detail walkthrough
> - `docs/research/drill-participant-reason-taxonomy.md` — backing industry research for compliance positioning
> - `docs/adr/0004-drill-participant-reason-codes.md` — architectural decision record

---

## 0. Demo architecture (what's where)

| Surface | URL / location | Role | What you'll show |
|---|---|---|---|
| **Venue Dashboard** | `http://localhost:3000` (local) or `https://main.d3t439ur25l1xc.amplifyapp.com` (production) | SH / DSH / GM / AUDITOR / FM / SHIFT_COMMANDER | Zone Status / Zone Accountability / Drills / Equipment / Certs / Shifts / Staff — the SH operational console |
| **Operations Console** | `http://localhost:3001` (local) | SC Ops (internal) | Cross-venue platform admin view — venue creation, multi-venue overview |
| **Mobile App** | Physical phone (Expo dev client) or simulator | Any role | Field-staff view — drawer banner, drill detail, mark-safe flow |
| **Backend api** | `https://api-production-9f9dd.up.railway.app/v1` | — | Always live (Railway auto-deploys); no local action needed |
| **Database** | Supabase production | — | Always live; demo data persists across sessions |

**Network topology:** the local dashboard / ops-console / mobile all talk to the **production** Railway api + Supabase. There is no local backend. This is by design — a single source of truth.

---

## 1. One-time setup (do once per machine)

These steps are required on first machine setup. After this, the demo data persists in Supabase indefinitely.

### 1.1 Verify production schema is current

Open Supabase Dashboard SQL Editor and run:

```sql
SELECT
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema='public' AND table_name='drill_session_participants'
     AND column_name IN ('reason_code','reason_notes','reason_set_by','reason_set_at')) AS new_columns,
  (SELECT COUNT(*) FROM pg_policies
   WHERE schemaname='public' AND tablename='drill_session_participants'
     AND policyname='drill_participant_role_read_gate') AS phase_5_18_policy;
```

**Expected:** `new_columns=4`, `phase_5_18_policy=1`. If not, mig 013 hasn't been deployed — apply `supabase/migrations/013_drill_participant_reason.sql` via Dashboard SQL Editor.

### 1.2 Seed the demo venue (idempotent)

```bash
cd "/Volumes/Crucial X9/claude_code/NEXUS_system/products/Safecommand"
./scripts/seed-hyderabad-demo.sh
```

Adds: 6 staff, 2 shifts, 1 active shift instance, 9 zone assignments, 1 ATTENTION zone, 2 historical incidents, 3 drills (2 completed + 1 scheduled), 10 staff certifications.

If this script aborts with "marker collision" — the venue is already seeded; skip to 1.3.

### 1.3 Seed the rich drill participant demo data (idempotent)

```bash
./scripts/seed-drill-participants-demo.sh
```

Adds: 10 additional demo staff (bringing venue to ~17 active), 24 drill participant rows across the 2 completed drills, with all 6 reason codes from ADR 0004 demonstrated.

**Verify the verification block prints:** *"Reason codes used across both drills: 6 / 6"* and *"All sanity checks PASSED. Demo data ready."*

### 1.4 Confirm via Supabase or via dashboard

Quick sanity check — open Supabase SQL Editor and run:

```sql
SELECT
  ds.drill_type,
  ds.status,
  COUNT(p.id) AS participants,
  COUNT(*) FILTER (WHERE p.status = 'SAFE_CONFIRMED') AS safe,
  COUNT(*) FILTER (WHERE p.reason_code IS NOT NULL) AS with_reason
FROM drill_sessions ds
LEFT JOIN drill_session_participants p ON p.drill_session_id = ds.id
WHERE ds.venue_id = '096a3701-beb0-4ffe-9e74-43af3c26e09f'
  AND ds.notes LIKE '[DEMO]%'
GROUP BY ds.drill_type, ds.status, ds.scheduled_for
ORDER BY ds.scheduled_for DESC;
```

**Expected output:**
```
 drill_type      | status    | participants | safe | with_reason
-----------------+-----------+--------------+------+-------------
 EARTHQUAKE      | SCHEDULED |            0 |    0 |           0
 FIRE_EVACUATION | COMPLETED |           14 |   11 |           3
 FULL_EVACUATION | COMPLETED |           10 |    7 |           3
```

If the participants column shows 0 for the 2 completed drills, repeat step 1.3.

---

## 2. Pre-demo checklist (10 minutes before demo)

### 2.1 Confirm services healthy

| Check | How | Pass criteria |
|---|---|---|
| Railway api alive | `curl -s https://api-production-9f9dd.up.railway.app/health` | Returns `{"status":"ok",...}` within 2s |
| Supabase reachable | Open Supabase Dashboard → Project Status | "Healthy" green dot |
| AWS Amplify deploy current | `git rev-parse origin/main` matches Amplify "Last deploy" SHA | Match |
| Demo data intact | Run §1.4 query | 14 + 10 participants on the 2 drills |

### 2.2 Pre-open browser tabs

Open these in separate tabs *before* the demo starts:

1. `http://localhost:3000/dashboard` — health-score landing
2. `http://localhost:3000/zones` — Zone Status board
3. `http://localhost:3000/accountability` — Zone Accountability hero demo
4. `http://localhost:3000/drills` — drill list
5. `http://localhost:3000/drills/[FIRE_EVAC_DRILL_ID]` — drill detail (Phase 5.18 hero)
6. (Optional) `http://localhost:3000/staff` — staff directory

> **Tip:** browser bookmark folder "SafeCommand Demo" with these 6 tabs in order. Open the folder → "Open all in new window" gives you the demo browser instantly.

### 2.3 Mobile device prep

- Charge phone to ≥80%
- Ensure phone is on same Wi-Fi as your laptop (for Expo Metro bundler)
- Open SafeCommand Expo dev client app
- Already-logged-in to test SH account (if not, login flow = bonus credibility — show it)

### 2.4 Reset prior-demo state if needed

If a previous demo left the venue in odd state (e.g. a drill mid-flight from earlier walkthrough), reset:

```bash
./scripts/reset-hyderabad-demo.sh
./scripts/seed-hyderabad-demo.sh
./scripts/seed-drill-participants-demo.sh
```

Total time ~30 seconds. Returns the venue to canonical demo state.

---

## 3. Daily startup procedure (every demo session)

### 3.1 Start the local frontends

Open three terminals at the project root:

**Terminal 1 — Dashboard (port 3000):**
```bash
cd apps/dashboard
npm run dev:fresh
```

**Terminal 2 — Ops Console (port 3001):**
```bash
cd apps/ops-console
npm run dev:fresh -- --port 3001
```

**Terminal 3 — Mobile (Expo):**
```bash
cd apps/mobile
npx expo start --clear
```

> **Why `dev:fresh`?** Next 16 Turbopack persistent cache occasionally corrupts on this volume; `dev:fresh` clears `.next/` first to guarantee a clean start. Adds ~5s to first compile in exchange for reliability.
>
> **Mobile note:** scan the Expo QR code with your phone's Expo dev client to load the latest bundle. Or open the simulator if doing simulator demo.

### 3.2 Login on dashboard

Navigate to `http://localhost:3000/login`:

| Audience | Login as | Why |
|---|---|---|
| Default demo | Pradeep Kumar (SH) | Sees full venue + all write controls |
| "Show me read-only view" | An AUDITOR account if seeded, otherwise GM | Demonstrates RBAC |
| "What does a guard see?" | Any GROUND_STAFF | Shows participation matrix "your row only" filter |

> **Login mechanism:** Phone OTP. Use the test phone configured in Firebase Console (your environment-specific test number). The OTP for test numbers is whatever's set in Firebase test phone numbers — typically `123456`.

### 3.3 Login on mobile

On the Expo dev client phone:
1. Phone screen → enter test phone (Indian +91 format)
2. OTP screen → enter test OTP
3. Lands on My Tasks
4. Tap drawer (☰ icon top-left) → see categorised navigation

If a Phase 5.18 active drill is in progress for this staff, the **drawer banner** appears at the top of the drawer.

---

## 4. Demo flow script (the actual presentation arc)

### 4.1 60-second flow — investor / board / time-boxed

| Time | Action | Talking point |
|---|---|---|
| 00:00 | Open `localhost:3000/dashboard` | "This is the SH's daily landing — health score, recent incidents, compliance status" |
| 00:05 | Click "Zone Accountability" sidebar | "THE hero demo — who owns Zone B right now? Answered in under 1 second." |
| 00:15 | Click "Drills" sidebar → see 3-drill list | "Quarterly drill program in motion — 1 upcoming, 2 completed" |
| 00:25 | Click recent **Fire Evacuation** drill → audit-grade detail | "13:22 evac time, 100% audit-classified, zero unexcused" |
| 00:35 | Walk to Kavita Nair row → ON_DUTY_ELSEWHERE cash vault | "Without this taxonomy: HR conversation. With it: NABH-defensible record." |
| 00:50 | Faisal Ahmed → DEVICE_OR_NETWORK_ISSUE → IT action raised | "Discipline conversation becomes Wi-Fi survey" |
| 00:60 | Close: "100% audit-defensible. NABH-ready. Fire NOC-ready. DPDP-conservative." | — |

### 4.2 5-minute flow — buyer demo

Extends 60-second flow with:
- Mobile drawer banner showcase (have a SCHEDULED drill ready to start mid-demo)
- Cross-link CTAs from Zone Status ↔ Zone Accountability
- Live activation of a shift instance from `/shifts` → real-time accountability map population
- Print preview of drill detail page

### 4.3 15-minute flow — multi-stakeholder buyer + auditor

Extends 5-minute flow with:
- Equipment compliance walkthrough (`/equipment` — 9 items with mixed expiry buckets)
- Certifications walkthrough (`/certifications` — 10 certs, 1 EXPIRED for actionable demo number)
- Drill B (Full Evacuation 240d ago) walkthrough — completes the 6-code taxonomy demo
- Audience-keyed close (per `docs/sales/drill-demo-narrative.md` §5)

### 4.4 Live-demo wow moments (mid-demo participation)

These elevate the demo from "tour" to "live operating venue":

**A. Start a drill in real-time:**
- From `/drills` → click "Schedule drill" → save as date today
- Click "▶ Start" → participant rows enqueued live
- Mobile staff (you on the phone) sees drawer banner appear within 30s polling tick
- Tap banner → DrillDetailScreen → tap [✓ Acknowledge]
- Back on dashboard → see status update within 10s poll

**B. Activate a shift instance:**
- From `/shifts` → click "▶ Activate" on a PENDING instance
- Open commander selector → pick Pradeep Kumar
- Save → see Zone Accountability map populate

**C. Set a reason for a missed staff:**
- From `/drills/[id]` Drill A → filter "Needs reason" — should be empty (already classified)
- Or click an existing classified row → re-edit reason → save → audit log updates

---

## 5. Reset between demos

When? After any demo where you:
- Started a real-time drill (leaves it in IN_PROGRESS state)
- Activated/Closed shift instances
- Added/edited equipment/staff/certs

Reset commands:

```bash
cd "/Volumes/Crucial X9/claude_code/NEXUS_system/products/Safecommand"

# Step 1: Reset the demo venue to canonical state
./scripts/reset-hyderabad-demo.sh

# Step 2: Re-seed the canonical demo data
./scripts/seed-hyderabad-demo.sh

# Step 3: Re-seed the rich drill participant data
./scripts/seed-drill-participants-demo.sh
```

Total time: ~30 seconds. Idempotent — safe to run repeatedly.

> **What persists vs gets reset:**
> - **Persists:** the venue itself, the SC Ops Console venue config, schema migrations, Firebase test phone numbers
> - **Resets:** all `[DEMO]`-marker rows: staff `+919999*`, shifts/instances/assignments, drills, drill participants, certs, equipment items

---

## 6. Troubleshooting

### "I don't see participant data on /drills/[id]"

**Cause:** `seed-drill-participants-demo.sh` not yet run.
**Fix:** `./scripts/seed-drill-participants-demo.sh`

### "Dashboard shows 'Failed to open database / invalid digit found in string'"

**Cause:** Next 16 Turbopack persistent cache corrupted.
**Fix:** Stop the dev server (Ctrl+C) → restart with `npm run dev:fresh`.

### "Mobile won't connect / 'Network error'"

**Cause:** `EXPO_PUBLIC_API_URL` mismatch.
**Fix:** confirm `apps/mobile/.env` has `EXPO_PUBLIC_API_URL=https://api-production-9f9dd.up.railway.app/v1`. Restart Expo with `npx expo start --clear`.

### "Login fails — 'Invalid OTP'"

**Cause:** Firebase test phone not configured for that number.
**Fix:** Open Firebase Console → Authentication → Sign-in method → Phone → Test phone numbers → confirm test phone + OTP are listed. If not, add them.

### "Dashboard /drills/[id] shows 404"

**Cause:** Next 16 hasn't compiled the new dynamic route yet.
**Fix:** Hard refresh (Cmd+Shift+R) or restart dev server with `dev:fresh`.

### "Workers Paused" notification

**Cause:** `WORKERS_PAUSED=true` env var on Railway scheduler/escalation/notifier services (May freeze posture).
**Effect on demo:** scheduled tasks won't auto-trigger; escalations won't fire; FCM/WA/SMS won't deliver. **Drill detail demo unaffected** — works fully without workers.
**Fix (only if demonstrating live escalation):** Railway Console → service Variables → set `WORKERS_PAUSED=false` → wait 30s for service restart. Reset to `true` after demo to preserve budget posture.

### "Operations Console shows nothing"

**Cause:** ops-console dev server not running, or cache corrupted.
**Fix:** Terminal 2 — `cd apps/ops-console && npm run dev:fresh -- --port 3001`.

---

## 7. Demo audience matrix

For each audience, key surfaces + narrative anchors:

| Audience | Key surface | Hero story |
|---|---|---|
| **Hospital CISO / NABH compliance** | `/drills/[id]` → Kavita Nair row | "ON_DUTY_ELSEWHERE cash vault — same pattern as ICU patient on ventilator" |
| **Mall facility head** | `/drills/[id]` + `/equipment` | "Real-time evac record + 9 fire extinguishers due-90 / due-30 / due-7 buckets" |
| **Hotel GM** | `/zones` + `/staff` | "Who owns each guest floor right now, and is anyone overdue rest?" |
| **Corporate safety director (multi-venue)** | `/dashboard` health score + `/drills/[id]` | "Same taxonomy across 65 venues — apples-to-apples comparison" |
| **VC / institutional investor** | `/drills/[id]` reason chips + research doc | "Schema-level data quality + 18-source taxonomy = compliance moat" |
| **Board director (governance lens)** | `/drills/[id]` + Faisal `DEVICE_OR_NETWORK_ISSUE` | "System bias is 'systemic gap', not 'who failed' — governance posture" |
| **Auditor (Telangana Fire / NABH)** | `/drills/[id]` print page | "This is your Form FF-3 register, digitally" |

For full per-audience walkthroughs see `docs/sales/drill-demo-narrative.md` §5.

---

## 8. Post-demo checklist

After every demo:

- [ ] Reset venue state (§5) if anything was modified during the demo
- [ ] Note any objections raised — log to `docs/sales/validation-tracker.md` if pre-pilot validation
- [ ] Note any feature requests — log to product backlog
- [ ] If live-demo was successful: ask for the next-step commitment (intro to compliance team, follow-up call, etc.)
- [ ] If live-demo had issues: fix underlying issue immediately (don't let stale state persist into next demo)

---

## 9. Failsafe — production-only fallback

If local dev environment is broken on demo day and there's no time to fix:

| Surface | Production URL fallback |
|---|---|
| Dashboard | `https://main.d3t439ur25l1xc.amplifyapp.com` |
| Mobile | Use the EAS Build APK installed on phone — connects to production directly |
| Ops Console | Currently no production URL — local-only |

The production deployment runs against the same Supabase + Railway api. All Phase 5.18 features work identically. The only loss is the ability to live-edit code mid-demo.

---

## 10. Maintenance

- **Owner:** SafeCommand sales / founder (until pilot go-live)
- **Update cadence:** review after every major demo wave; refresh per Phase 5+ feature additions
- **Companion data refresh:** `./scripts/seed-drill-participants-demo.sh` is the canonical refresh command
- **Version:** 1.0 — 2026-05-07 (Phase 5.18 baseline)
