# ⚠️ MANDATORY REVIEW — JUNE 2026 UNFREEZE

**Created:** 2026-05-03 (budget freeze trigger)
**Last updated:** 2026-05-05 (Phase A complete + Phase B pre-writes pushed)
**Trigger date:** 2026-06-02 (first work session of June 2026)
**Status:** OPEN — must be processed and this file deleted by end of June 2026
**Companion plan:** `report-gen/2026-05-04-22:30_plan.md` (gitignored — local copy only)

---

## ⭐ TL;DR — what changed since this file was first written

**Massive Phase A scaffold work landed on `safecommand_v7` branch in May 2026** (19 commits, ~5000 lines). All pre-emptive work for v7 transition is now done. June work is mostly **deploy + integrate**, not write-from-scratch. Estimated June engineering time: ~5–6 hours (was originally ~10–12).

**Branch status:** `origin/safecommand_v7` — 19 commits ahead of `main`. Work covers:
- v7 spec authority (CLAUDE.md rewritten, ADRs 0001/0002/0003 captured)
- Mobile + Dashboard + Ops Console ThemeProvider scaffold (EC-17/Rule 19 satisfied; default SafeCommand brand baked in)
- 6 mobile screens retrofit to theme tokens (zero hardcoded `color: '#xxx'`)
- Drawer wired into TasksScreen with 5-group categorisation per UX-DESIGN-DECISIONS.md
- Apollo mockup spec (Path C) + 3-slide deck spec
- Migrations 009 (MBV) + 010 (Brand+Roaming+Drill) **pre-written but NOT deployed**
- apollo-demo seed SQL **pre-written but NOT applied**
- `scripts/seed-test-tasks.sh` for May testing without unpausing workers

**Workers paused as of 2026-05-05:** all 4 services have `WORKERS_PAUSED=true`. Hibernation through the rest of May.

---

## 🚨 PRE-MERGE — before applying anything to main / Supabase

### A. Merge `safecommand_v7` → `main`

The Phase A scaffold + Phase B pre-writes live entirely on `safecommand_v7`. Merge to main first so Phase B operations target a single canonical branch.

```bash
cd "/Volumes/Crucial X9/claude_code/NEXUS_system/products/Safecommand"
git checkout main
git pull origin main
git merge --no-ff safecommand_v7    # or --squash if cleaner log preferred
git push origin main
```

**Verify after merge:**
```bash
git log --oneline -5    # should show the new merge commit and Phase A history
ls supabase/migrations/  # should list 009_mbv.sql + 010_brand_roaming_drill.sql
ls supabase/seeds/       # should list apollo-demo.sql
```

After merge: optionally delete the branch:
```bash
git branch -d safecommand_v7
git push origin --delete safecommand_v7    # only after confirmed merged
```

### B. Backup tag retention decision

`backup/pre-history-rewrite-2026-05-04` tag exists on origin (preserves pre-rewrite SHA `772fd85`). Suggested deletion target: 2026-06-04 (≥30 days post-rewrite). After 30 days of confidence with the cleaned history, delete:
```bash
git tag -d backup/pre-history-rewrite-2026-05-04
git push origin --delete backup/pre-history-rewrite-2026-05-04
```

---

## STAGE 1 — Verify May 2026 actual state (data-driven decisions)

### 1. Verify Upstash actual burn for May 2026
Open https://console.upstash.com/redis/f39ea940-98ea-41ea-9ccf-1f1e971b1404 → Usage tab → note total commands consumed in May.

| Outcome | Action |
|---------|--------|
| <500K commands (free tier) | Panic was overestimated. Adopt always-on workers from June. |
| 500K–2M commands | Modest PAYG cost (~$1–4). Reasonable; always-on still recommended. |
| >2M commands | Investigate why (workers were supposed to be paused). |

### 2. Check current worker state
```bash
cd "/Volumes/Crucial X9/claude_code/NEXUS_system/products/Safecommand"
./scripts/worker-status.sh    # may need fixing per item 9 below
```

Or directly via Railway dashboard → each service → Variables: confirm `WORKERS_PAUSED` value.

### 3. Apply AWS Activate $1,000 startup credits
Per `~/.claude/projects/.../memory/reference_aws_activate_safecommand.md`:
- AWS Console → Billing → Credits → Apply credit code
- Covers ~$83/month worth of S3 + future GCP migration prep
- Apply before flipping workers always-on to maximize coverage window

---

## STAGE 2 — Engineering deploy sequence (in this exact order)

### 4. Apply Phase B migrations (pre-written, ready to deploy)

⚠️ **Coupled with code change** — see step 5. Apply both together in one session.

Migration files (already on `main` after step A merge):
- `supabase/migrations/009_mbv.sql` — Spec Migration 007 (MBV)
- `supabase/migrations/010_brand_roaming_drill.sql` — Spec Migration 008 (Brand + Roaming + Drill)

**Pre-deploy validation:**
```bash
cd "/Volumes/Crucial X9/claude_code/NEXUS_system/products/Safecommand"
# Inspect — must NOT have already been applied; must be additive
supabase db diff --linked   # or psql connection to remote
```

**Deploy:**
```bash
# Source SUPABASE_ACCESS_TOKEN + DATABASE_URL from .env first
supabase db push --linked
```

**Post-deploy verification:**
```bash
# 1. buildings table exists, RLS enabled
psql "$DATABASE_URL" -c "\dt buildings"
psql "$DATABASE_URL" -c "SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('buildings','corporate_brand_configs','drill_sessions','roaming_staff_assignments');"
# Expect: 4 rows, all relrowsecurity = t

# 2. building_visible() function exists
psql "$DATABASE_URL" -c "\df building_visible"

# 3. set_tenant_context now 4-param
psql "$DATABASE_URL" -c "\df set_tenant_context"
# Expect: function with 4 args (uuid, uuid, text, uuid)

# 4. powered_by_text CHECK constraint enforced — should ERROR:
psql "$DATABASE_URL" -c "INSERT INTO corporate_brand_configs (corporate_account_id, powered_by_text) VALUES (gen_random_uuid(), 'Custom Text');"
# Expect: ERROR: new row for relation "corporate_brand_configs" violates check constraint
```

### 5. Deploy api code change (4-param set_tenant_context)

The migration 009 makes `set_tenant_context` 4-param with `p_building_id DEFAULT NULL`, so existing 3-param calls keep working. Optionally update api middleware to pass building_id explicitly when authenticating staff with a `primary_building_id`. This is a small follow-up commit on `main`.

**Look for:**
- `apps/api/src/middleware/tenant.ts` — currently calls `set_tenant_context(venue, staff, role)`
- Update to: `set_tenant_context(venue, staff, role, building_id)` reading from JWT
- JWT issuance in `apps/api/src/routes/auth.ts` should embed `building_id` from `staff.primary_building_id`

This is optional Phase B — the migration alone is functionally complete; the explicit building_id pass is a refinement.

### 6. Apply apollo-demo seed (sales-only)

⚠️ **Two prerequisites before applying:**
1. **Upload Apollo logo** to S3 sales-only path: `s3://sc-evidence-prod/internal/apollo-logo-demo.png`
   - Source: apollohospitals.com brand assets (PNG with transparency)
   - Sales NDA-bound use only (per `docs/sales/apollo-mockup-spec.md` § "Mandatory legal disclaimer")
2. **Replace 2 NULL placeholders in `supabase/seeds/apollo-demo.sql`** with founder's SC Ops staff UUID:
   ```sql
   -- Find your SC Ops staff UUID:
   SELECT id, name FROM staff WHERE phone = '+91XXXXXXXXXX' LIMIT 1;
   -- Edit apollo-demo.sql lines marked with ⚠ and replace NULL with that UUID
   ```

**Deploy seed:**
```bash
psql "$DATABASE_URL" -f supabase/seeds/apollo-demo.sql
```

**Verify:**
```bash
psql "$DATABASE_URL" -c "SELECT ca.account_code, cbc.brand_name, cbc.is_active, cbc.wcag_validated, cbc.powered_by_text FROM corporate_accounts ca JOIN corporate_brand_configs cbc ON cbc.corporate_account_id = ca.id WHERE ca.account_code = 'apollo-demo';"
# Expect: 1 row, is_active=t, wcag_validated=t, powered_by_text='Platform by SafeCommand'
```

### 7. Build live Apollo mockup (Path C — Loom recording)

Per `docs/sales/apollo-mockup-spec.md` §"Implementation steps":
1. Link demo venue to apollo-demo:
   ```sql
   UPDATE venues SET corporate_account_id = (SELECT id FROM corporate_accounts WHERE account_code = 'apollo-demo') WHERE venue_code = '<your-demo-venue-code>';
   ```
2. Extend api auth response to include brand config (server-side fetch using `sb_secret_*`)
3. Mobile + Dashboard `ThemeProvider` updated to consume brand from auth response (see `apps/mobile/src/theme/ThemeProvider.tsx` — currently accepts `brand` prop; just needs wiring at app root after login)
4. Record 3-minute Loom walkthrough per spec § "7-screen sequence"
5. Compose 3-slide deck per `docs/sales/apollo-deck-spec.md`
6. Internal dry-run before any Apollo conversation

### 8. Fix Railway worker Start Commands — already done

Per `2026-04-30-19:30_fix.md` G11 — confirmed by founder 2026-05-05:
- api: (blank → defaults to package.json start)
- scheduler: `node apps/scheduler/dist/index.js`
- escalation: `node apps/escalation/dist/index.js`
- notifier: `node apps/notifier/dist/index.js`

✅ **Already correct.** No action needed; confirmed during 2026-05-05 testing.

### 9. Set workers always-on

Per Q5 hybrid budget posture (resolved 2026-05-04):
1. Verify `WORKERS_PAUSED=false` on all 4 services (Railway → service → Variables)
2. Set `MASTER_TICK_INTERVAL=60000` on **scheduler** service only (per env-driven `TICK_MS` change in commit `f292b90`)
3. **Optionally** delete the broken scripts that use `numReplicas: 0`:
   - `scripts/pause-workers.sh`
   - `scripts/resume-workers.sh`
   - The env-var approach replaces them; document in `AWS-process-doc-IMP.md` if removed

### 10. Verify scheduler tick at 60-second cadence

Open Railway → scheduler → Logs. Expected within 60 seconds of redeploy:
```
[inf] Master tick registered (tick_ms: 60000)
[inf] Master tick complete    ← every 60 sec
```

Open mobile app → pull-to-refresh tasks → new HOURLY task_instances should appear within 60 sec of any HOURLY template's `due_at`.

---

## STAGE 3 — Resume the BR sequence

After steps 1–10 complete, resume the v7 Phase 1 BR sequence per CLAUDE.md "Build status" + ADR 0002:

| BR | Description | Notes |
|----|-------------|-------|
| BR-10 | Airtel SMS fallback | Blocked on Airtel DLT founder action — verify before starting |
| BR-08 | Escalation chain (3-level) | Test with seeded missed task |
| BR-12 | Shift handover protocol | Mobile + dashboard surface |
| BR-13 | Deputy SH activation | Manual + auto-emergency 5-min trigger |
| BR-A | Drill management | Schema in mig 010 already; build the operational flow |
| BR-B | Cert expiry warning on shift activation | Schema exists; add audit_logs hook |
| BR-14 | GM Dashboard with per-building health cards | Phase A theme scaffold ready |
| BR-15/16/17 | GM Broadcast, Custom Task, Auditor role | |
| BR-18/19 | Zone Status Board + Zone Accountability Map (THE hero demo) | |
| BR-39–55 + BR-64 | VMS (5 modes) + building-scoped entry points | |
| BR-57–63 | MBV operational behaviours | |
| BR-20/29 | Compliance + post-incident PDFs (with 'Powered by SafeCommand' footer) | |
| BR-32 | Cross-venue analytics (SC Ops Console) | |

---

## STAGE 4 — 25-item Go-Live Checklist (per Business Plan §15.1)

After BR sequence completes, run the 25-item checklist for first pilot venue go-live. Each item documented in `CLAUDE.md` § "25-item Go-Live Checklist".

---

## 📋 Founder action checklist (parallel, multi-day clocks — verify status here)

Status as of 2026-05-05 (founder updates as items complete):

| Action | Lead time | Status (founder updates here) |
|---|---|---|
| Meta WABA + 12 WhatsApp templates submitted | 7–14 days approval | ⏳ in flight |
| Airtel DLT entity + sender ID `SFCMND` registered | 5–7 days | ⏳ in flight |
| OPC registration via CA | 2–3 weeks | ⏳ in flight |
| Trademark filing Classes 9 + 42 | 1–2 weeks processing | ⏳ in flight |
| Apple Developer Account ($99/year) | 1–2 days | ⏳ |
| Google Play Console ($25 one-time) | Same day | ⏳ |
| Domain `safecommand.in` purchase + DNS | Same day | ⏳ |
| AWS Activate credits application | Same day | ⏳ |
| Apollo logo upload to S3 (sales-only path) | Same day | ⏳ |
| Apollo deck composed (3-slide per `docs/sales/apollo-deck-spec.md`) | 1–2 hours | ⏳ |
| Cyber liability insurance | Before pilot live | ⏳ |
| DPDP Act compliance review (1-session lawyer) | Before first hospital meeting | ⏳ |
| Razorpay KYC | Week 4 (after OPC + current account) | ⏳ |
| Validation conversations (10 done; 7+ pain confirmed; 5+ accept managed-service framing; 2 pilots committed including 1 multi-bldg supermall per Q4) | 31 May 2026 gate | ⏳ |

Update each `⏳` to ✅ as completed. Items still ⏳ on June 2 are blockers for the corresponding Phase B BR work (e.g. Airtel DLT for BR-10 SMS fallback).

---

## 📋 Cleanup — files to delete after June 2026

After processing this checklist:

1. **This file** (`JUNE-2026-REVIEW-REQUIRED.md`) — once all stages complete, delete to prevent stale guidance
2. **Memory file** `~/.claude/projects/-Volumes-Crucial-X9-claude-code/memory/project_safecommand_budget_may2026.md` — May 2026 budget memory expires
3. **Backup tag** `backup/pre-history-rewrite-2026-05-04` — after ≥30 days confidence with cleaned history (target 2026-06-04 or later)

---

## 📋 References — single-source-of-truth pointers

| Topic | Location |
|---|---|
| Spec authority | `nexus/specs/2026-05-10_prime_business-plan-report-gen.md` + `2026-05-10_SafeCommand_Architecture_v7_Complete.md` |
| Build context | `CLAUDE.md` (product root) |
| Migration numbering offset | `docs/adr/0001-migration-renumbering.md` |
| Branching decision | `docs/adr/0002-safecommand-v7-branch.md` |
| Supabase opaque-token keys | `docs/adr/0003-supabase-publishable-secret-keys.md` |
| Apollo mockup spec | `docs/sales/apollo-mockup-spec.md` |
| Apollo deck spec | `docs/sales/apollo-deck-spec.md` |
| Phase A plan + decisions | `report-gen/2026-05-04-22:30_plan.md` (local-only, gitignored) |
| Session log index | `report-gen/SESSION_LOG.md` (local-only, gitignored) |
| AWS infra reference | `AWS-process-doc-IMP.md` |
| Daily ops routine | `DAILY-OPS.md` |
| UX architecture | `UX-DESIGN-DECISIONS.md` |
| Memory: v7 spec authority | `~/.claude/.../memory/project_safecommand_v7_spec.md` |
| Memory: Phase A confirmed plan | `~/.claude/.../memory/project_safecommand_v7_phase_a.md` |
| Memory: Supabase keys | `~/.claude/.../memory/reference_supabase_keys.md` |
| Memory: AWS Activate credits | `~/.claude/.../memory/reference_aws_activate_safecommand.md` |
| Memory: WORKERS_PAUSED | `~/.claude/.../memory/reference_workers_paused_kill_switch.md` |
| Memory: May 2026 budget | `~/.claude/.../memory/project_safecommand_budget_may2026.md` |

---

## Why this file lives at the product root

Discoverability. `report-gen/` is gitignored (local-only). `nexus/decisions/` is for strategic decisions, not operational reminders. This file at the product root is impossible to miss — it shows in any directory listing, any git status, any IDE file tree, every time the project is opened.

---

**Last updated:** 2026-05-05 (Phase A complete + Phase B pre-writes pushed; workers paused; ready for June unfreeze)
