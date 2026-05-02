# SafeCommand — Cloud Infrastructure & Operations Reference

**Status:** Living document — update as practices evolve
**Owner:** Sachin Sablok (Founder)
**Last updated:** 2026-05-02
**Audience:** Solo founder + future engineering hires + Claude Code agents

---

## Purpose of this document

This is the operational source of truth for SafeCommand's cloud infrastructure. It captures:

- **What runs where** — every service, region, role, and why
- **What it costs** — current burn, projections, optimization levers
- **How to deploy** — repeatable processes for each service
- **How to recover** — rollback, restart, debug runbooks
- **What to monitor** — health checks, alerts, usage thresholds
- **How to scale** — when and how to migrate components as we grow
- **Lessons learned** — anti-patterns to avoid based on real incidents

This document supersedes any conflicting information in CLAUDE.md or session notes. When in doubt, this file wins.

---

## Table of contents

1. [Infrastructure topology — current state](#1-infrastructure-topology--current-state)
2. [Phase progression — Phase 1 → 2 → 3](#2-phase-progression--phase-1--2--3)
3. [Service inventory & operational guides](#3-service-inventory--operational-guides)
4. [Cost model & burn discipline](#4-cost-model--burn-discipline)
5. [Deployment processes](#5-deployment-processes)
6. [Monitoring, alerting & incident response](#6-monitoring-alerting--incident-response)
7. [Security, IAM & data residency](#7-security-iam--data-residency)
8. [Disaster recovery & rollback](#8-disaster-recovery--rollback)
9. [AWS migration roadmap](#9-aws-migration-roadmap)
10. [Anti-patterns & lessons learned](#10-anti-patterns--lessons-learned)
11. [Operational runbooks](#11-operational-runbooks)
12. [Decision log](#12-decision-log)

### Companion documents (same folder)

- [`upstash_redis.md`](./upstash_redis.md) — Scheduler master-tick frequency analysis + Upstash command-quota reset behavior + cost calculator (extracted from this doc 2026-05-02 to keep main reference under 1K lines)

---

## 1. Infrastructure topology — current state

### Active services (Phase 1, as of 2026-05-02)

```
┌─────────────────────────────────────────────────────────────────┐
│                       USER-FACING LAYER                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐         ┌──────────────────────────────┐   │
│  │  Mobile (Expo)  │         │  Web Dashboard (Next.js 16)  │   │
│  │  Android APK    │         │  AWS Amplify Hosting         │   │
│  │  via EAS Build  │         │  ap-south-1 (Mumbai)         │   │
│  └────────┬────────┘         └──────────┬───────────────────┘   │
│           │                             │                        │
└───────────┼─────────────────────────────┼────────────────────────┘
            │       HTTPS + JWT           │
            ▼                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                        COMPUTE LAYER (Railway)                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │  api     │  │scheduler │  │escalation│  │ notifier │        │
│  │ Express  │  │ BullMQ   │  │ BullMQ   │  │ BullMQ   │        │
│  │ 2 replic │  │ master   │  │ delayed  │  │ FCM/WA   │        │
│  └────┬─────┘  └─────┬────┘  └─────┬────┘  └─────┬────┘        │
└───────┼──────────────┼─────────────┼─────────────┼──────────────┘
        │              │             │             │
        ▼              ▼             ▼             ▼
┌────────────────┐  ┌─────────────────────────┐  ┌──────────────┐
│  Supabase      │  │  Upstash Redis          │  │ Firebase     │
│  PostgreSQL    │  │  (BullMQ backend)       │  │ FCM + Auth   │
│  (US region —  │  │  AWS ap-south-1 mirror  │  │ google-cloud │
│   migrating to │  │  Free tier → PAYG       │  │              │
│   ap-south-1)  │  │                         │  │              │
└────────────────┘  └─────────────────────────┘  └──────────────┘
                                                          │
                          ┌───────────────────────────────┘
                          ▼
                  ┌──────────────┐
                  │  AWS S3      │
                  │ ap-south-1   │
                  │ (file evid.) │
                  └──────────────┘
```

### Service-region matrix

| Service | Provider | Region | Why this region |
|---------|----------|--------|-----------------|
| Mobile build (EAS) | Expo | global CDN | global delivery |
| Dashboard hosting | AWS Amplify | ap-south-1 (Mumbai) | NFR-11 India residency |
| API + workers | Railway | us-west2 (default) | US for free tier; migrating to AWS ap-south-1 in Phase 2 |
| PostgreSQL | Supabase Pro | us-east-1 (AWS) | Pro plan default; migrating to ap-south-1 before hospital GTM |
| Redis (BullMQ) | Upstash | global edge | sufficient for current scale |
| File storage | AWS S3 | ap-south-1 | NFR-11 India residency for visitor IDs, photos, exports |
| Push notifications | Firebase FCM | global | only delivery option for Android+iOS |
| Auth (mobile) | Firebase Auth | global | phone OTP at zero marginal cost |
| Domain (planned) | TBD registrar | India | A3.3 pending |

### Account / project IDs

| Resource | Identifier |
|----------|-----------|
| AWS account | `001763926566` |
| AWS Amplify app | `d3t439ur25l1xc` (`safecommand-dashboard`) |
| Railway project | `3e27e7ad-f120-4958-b8f6-c1be42032914` |
| Supabase project | `exrewpsjrtevsicmullp` |
| Upstash Redis | `lucky-giraffe-107825` |
| Firebase project | `safecommand-51499` |
| GitHub repo | `sachisab99/safecommand` (private) |

### Live URLs

| Service | URL |
|---------|-----|
| API | `https://api-production-9f9dd.up.railway.app/v1` |
| Dashboard | `https://main.d3t439ur25l1xc.amplifyapp.com` |
| Future custom domain | `https://app.safecommand.in` (pending A3.3) |
| Future API custom domain | `https://api.safecommand.in` (pending A3.3) |

---

## 2. Phase progression — Phase 1 → 2 → 3

The architecture intentionally evolves through three phases. Decisions appropriate for one phase are wrong for another. Always check which phase a recommendation targets.

### Phase 1 — Pilot validation (current, Sprints 1–8)

- **Goal:** prove the product works at 1–3 venues
- **Tenets:** speed of iteration > architectural purity, managed services > self-hosted, free tiers used until they hurt
- **Stack:** Railway compute, Supabase Postgres (US OK), Upstash Redis, AWS Amplify dashboard (Mumbai for sovereignty signal)
- **Cost target:** <$50/mo total infra
- **Migration triggers to leave Phase 1:** first paying hospital pilot signed, OR sustained burn >$200/mo, OR 5+ active venues

### Phase 2 — Early growth (Sprints 9–24, target: 10–25 venues)

- **Goal:** stable, India-resident, hospital-compliant operations
- **Migrations from Phase 1:**
  - Supabase region → ap-south-1 (or self-host PostgreSQL on AWS RDS Mumbai)
  - Railway compute → AWS App Runner OR ECS Fargate ap-south-1
  - Custom domains live (`app.safecommand.in`, `api.safecommand.in`)
  - DPDP Act DPIA completed and filed
  - WAF in front of API + dashboard
- **Cost target:** <$500/mo for first 10 venues, scaling linearly
- **Why this is a hard cutover for hospitals:** DPDP Act + NABH compliance require India residency for PII

### Phase 3 — Scale (Sprint 25+, target: 50–200+ venues)

- **Goal:** enterprise-grade operations, multi-region option
- **Migrations from Phase 2:**
  - Upstash → AWS ElastiCache Serverless or self-managed Redis on EC2
  - Single Postgres → read replicas + connection pooling (PgBouncer)
  - Per-venue tier-based isolation (Enterprise tier may demand single-tenant DB)
  - Multi-region active-passive for 99.9%+ availability
  - Terraform / OpenTofu for full IaC reproducibility
- **Cost target:** <2% of revenue at this stage

---

## 3. Service inventory & operational guides

### 3.1 AWS Amplify Hosting (Web dashboard)

**What it does:** hosts the Next.js 16 dashboard, builds on push, terminates SSL, serves via CloudFront.

**Critical configuration:**
- App ID: `d3t439ur25l1xc`
- Region: `ap-south-1` (Mumbai)
- Branch: `main`
- Service role: must have `AdministratorAccess-Amplify` managed policy (not the auto-provisioned `AmplifySSRLoggingRole-*`)
- Build spec: `amplify.yml` at repo root (see file in repo)
- Monorepo root: `apps/dashboard`
- Env vars: managed in Amplify Console → Hosting → Environment variables

**Known gotchas (learn from these):**
1. **Default IAM role is wrong.** Amplify auto-provisions `AmplifySSRLoggingRole-*` which only grants CloudWatch logs permission. SSM secret reads silently fail. Symptom: env vars set in UI never reach build shell. Fix: replace with full Amplify service role having `AdministratorAccess-Amplify`.
2. **`npm ci` in monorepos is brittle.** Workspace lockfile drift, platform-specific deps in workspace siblings (e.g., Expo) cause `EBUSY` errors. Use `npm install --no-package-lock` from the dashboard directory only. Skip workspace install unless the dashboard truly depends on workspace packages.
3. **Next.js bracket-notation env access doesn't get inlined.** `process.env['X']` (forced by TypeScript strict's `noPropertyAccessFromIndexSignature`) is treated as runtime lookup. Always declare `NEXT_PUBLIC_*` vars in `next.config.ts` `env:` field for guaranteed inlining.
4. **Realtime websockets from web are fragile.** Supabase Realtime + Next.js prerender + Turbopack created chained issues. Decision: use polling (5s interval) instead. Realtime can return in Phase 2 with `@supabase/ssr` package only when justified by customer pain.
5. **`appRoot` in `amplify.yml` changes preBuild CWD.** Commands run from `apps/dashboard`, not repo root. `.env.production` written here is correct for Next.js.

**Cost:** Free tier covers pilot phase entirely. See section 4 for full projection.

**Deployment:** Auto-deploys on push to `main`. Manual redeploy: AWS Console → Amplify → app → Hosting environments → main → Redeploy this version.

---

### 3.2 Railway (compute services)

**What it does:** hosts 4 Node.js services — `api`, `scheduler`, `escalation`, `notifier`.

**Critical configuration:**
- Each service has its own `apps/<service>/railway.toml` with build + start commands
- **Dashboard overrides take precedence over `railway.toml`.** Check Settings → Build/Start Command if a service runs the wrong binary
- Service IDs (used for GraphQL API):
  - api: `d3fd284f-e7fd-48d9-8534-e37315388dc8`
  - scheduler: `19df0688-609d-4226-9c13-1072f4adb571`
  - escalation: `899ad603-48cc-4c06-b536-14f51dff99e5`
  - notifier: `29fdd57b-90fe-41bb-a450-95999f4b3624`

**Known gotchas:**
1. **Railway `REDIS_URL` template interception.** If you use a variable name Railway has a built-in template for (e.g. `REDIS_URL`) AND no Railway-managed Redis service is attached, Railway silently resolves it to empty. **Use a non-conflicting name** — we use `SC_REDIS_URL`.
2. **`railway up --detach` from monorepo root uses ROOT `railway.toml`** which lacks build/start commands. Each service must have its commands set in the Railway dashboard OR via the GraphQL API (`serviceInstanceUpdate` mutation).
3. **`npm ci` duplicate run causes EBUSY.** Nixpacks already runs `npm ci` (stage 6/10). Custom `buildCommand` running it again fails on cache mount. Drop `npm ci` from buildCommand; only run `npm run build --workspace=...`.
4. **BullMQ jobIds cannot contain `:`.** BullMQ uses colons for Redis key namespacing internally. Use `__` as separator instead.
5. **CLI does not expose buildCommand/startCommand.** Use Railway GraphQL API at `https://backboard.railway.com/graphql/v2` with the access token from `~/.railway/config.json` to set them programmatically.

**Cost:** Pro plan $20/mo flat (current). Plan to migrate to AWS App Runner or ECS Fargate at Phase 2.

**Deployment:**
```bash
cd /path/to/Safecommand
railway service <service-name>
railway up --detach
# or
railway redeploy --yes
```

---

### 3.3 Supabase PostgreSQL

**What it does:** primary database. RLS enforces multi-tenant isolation (NFR-01, EC-02). Auth was used pre-Sprint 3, replaced by Firebase Auth on mobile.

**Critical configuration:**
- Project ref: `exrewpsjrtevsicmullp`
- Region: `us-east-1` (will migrate to ap-south-1 before hospital GTM)
- Plan: Pro ($25/mo)
- PITR (point-in-time recovery): 7 days
- Connection pooler (Supavisor): use for Railway worker connections
- Service role key: stored in Railway env vars as `SUPABASE_SERVICE_ROLE_KEY` — **never** expose this client-side
- Anon key: safe to expose client-side (RLS is the security boundary)

**Known gotchas:**
1. **TCP pooler blocked by some networks.** Use the REST API for migrations when you can't reach the pooler directly. Manual SQL via Dashboard SQL Editor is always available.
2. **Migration files committed but not auto-applied.** Always verify a migration ran successfully via REST query before assuming. We hit this with migration 008.
3. **`set_tenant_context()` must be called before every RLS-enforced query** in services using the service role key. This is the single most common bug class — all API queries should go through `setTenantContext` middleware.

**Cost:** Pro $25/mo flat. Sufficient up to ~50 venues. Beyond that → AWS RDS Mumbai or self-host.

---

### 3.4 Upstash Redis (BullMQ backend)

**What it does:** message broker for BullMQ workers (scheduler ticks, escalations, notifications).

**Critical configuration:**
- DB: `lucky-giraffe-107825`
- Connection string: stored as `SC_REDIS_URL` (NOT `REDIS_URL` — Railway template conflict)
- Plan: **upgrade to Pay-as-You-Go** (free tier 500K cmd/mo is insufficient — see section 4)

**Burn drivers (in order of impact):**
1. **Worker idle heartbeats** — BullMQ workers keep connections alive with continuous polling. 3 workers × ~15 cmd/min/worker = ~1.7M commands/month JUST IDLE.
2. **Repeatable jobs (master-tick)** — every 60s by design. Includes lock renewal, repeat schedule check, queue add. ~6 cmd/min = ~260K/month.
3. **Per-template ticks** — fan-out depends on template count. With 10 templates ticking hourly = ~720K/month.
4. **Job lifecycle** — each task instance (add → process → ack → cleanup) ≈ 8 commands.
5. **Reconnection storms after restarts** — each Railway redeploy triggers reconnection, ~50-100 cmd burst per worker.

**What does NOT burn Redis:**
- Dashboard polling (hits API → Postgres only)
- Mobile app polling (same path)
- Login flows (Firebase + API only)
- Static asset requests

**Known incident:** 2026-05-02 — hit free tier 500K limit in ~2 days of dev. API crashed because BullMQ couldn't AUTH to Redis. Recovery required Pay-as-You-Go upgrade.

**Cost projection:** see section 4.

---

### 3.5 AWS S3 (file storage)

**What it does:** stores task evidence photos, visitor ID images (VMS), compliance PDFs, exports.

**Critical configuration:**
- Bucket: `safecommand-prod` (or similar, ap-south-1)
- Region: `ap-south-1` (Mumbai) — NFR-11 mandate from Day 1
- Encryption: SSE-S3 (managed keys) — sufficient for Phase 1; SSE-KMS for hospital tier
- Access pattern: presigned PUT URLs from API (mobile uploads directly), presigned GET URLs for downloads
- Lifecycle: not configured yet — add at Phase 2 to expire old visitor photos per DPDP

**Cost:** Phase 1: ~$1-3/mo (low volume). Hospital phase: $20-50/mo per venue with full ID photo retention.

---

### 3.6 Firebase (FCM + Auth)

**What it does:**
- **FCM:** push notifications to Android/iOS devices
- **Auth:** phone OTP login on mobile (replaces Supabase Auth as of Sprint 3)

**Critical configuration:**
- Project ID: `safecommand-51499`
- Service account: `firebase-adminsdk-fbsvc@safecommand-51499.iam.gserviceaccount.com`
- Test phone numbers: configured in Firebase Console → Auth → Phone → Test phone numbers (replaces `TEST_PHONE_PAIRS` env var)
- Client config files: `google-services.json` + `GoogleService-Info.plist` (committed to mobile repo — public-by-design, RLS/Firebase Security Rules enforce security)

**Known gotcha:** `FIREBASE_PRIVATE_KEY` in Railway env vars must be the FULL PEM string with `-----BEGIN PRIVATE KEY-----` headers and `\n` literal newlines. The code does `privateKey.replace(/\\n/g, '\n')` to convert back. If the key is stored without headers, `firebase-admin` throws "Invalid PEM formatted message" and the API fails health check.

**Cost:** Free tier covers ~10,000 phone OTP/mo and unlimited FCM. Won't be a cost concern until Phase 3.

---

## 4. Cost model & burn discipline

### Current monthly burn (Phase 1, May 2026)

| Service | Plan | Cost | Notes |
|---------|------|------|-------|
| Railway Pro | Flat | $20 | covers all 4 compute services |
| Supabase Pro | Flat | $25 | US region, 7d PITR, sufficient for pilot |
| Upstash Redis | Pay-As-You-Go (post-incident) | $5–15 estimated | up from free tier after May 2 |
| AWS S3 ap-south-1 | Usage | $1–3 | minimal volume currently |
| AWS Amplify Hosting | Free tier (12 mo) | $0–1 | within build/egress limits |
| Firebase | Free tier | $0 | well below caps |
| Domain (when bought) | Annual | ~$1/mo | A3.3 pending |
| **Total Phase 1** | | **~$50-65/mo** | |

### Projected at scale

| Phase | Venues | Total monthly | Per-venue |
|-------|--------|---------------|-----------|
| 1 (pilot) | 1–3 | $50–65 | $20+ (overhead-heavy) |
| 2 early | 10 | $150–250 | $15–25 |
| 2 mature | 25 | $400–600 | $16–24 |
| 3 scale | 100 | $1,500–2,500 | $15–25 |
| 3 enterprise | 200 | $3,000–5,000 | $15–25 |

Per-venue cost is roughly stable through scale because compute and DB scale near-linearly.

### Redis burn discipline (the lesson from 2026-05-02 incident)

**Three operating modes** depending on testing intensity:

| Mode | Master-tick | Workers idle? | Estimated cmd/month |
|------|-------------|---------------|---------------------|
| **Disciplined dev** (recommended for build phase) | 300s | scaled to 0 outside test hours | 1–2M |
| **Active dev / demo prep** | 60s | always on | 3–7M |
| **Production (1 venue)** | 60s | always on | 3–4M |
| **Production (10 venues)** | 60s | always on | 25–35M |
| **Production (50 venues)** | 60s + per-template fan-out | always on | 80–120M |

At Pay-As-You-Go ($0.20 per 100K commands beyond 500K free):
- 1M cmd/mo = ~$1
- 10M = ~$19
- 100M = ~$199 — at this point, ElastiCache Serverless becomes cheaper

**Recommended discipline practices:**

1. **Pause workers during off-hours** — 5–10× reduction in idle burn
2. **Master-tick interval bumped to 300s during dev** — only matters for incident response SLA, not for build phase
3. **Aggressive job retention cleanup** — `removeOnComplete: { age: 600, count: 100 }`
4. **Monitor weekly** — Upstash console shows command count; check before every Friday demo
5. **Budget alert at 80%** — set in Upstash console (free)

### Cost tracking discipline

Going forward, track these monthly:

| Metric | Target | Where to find |
|--------|--------|---------------|
| Railway compute hours | <750 hr/mo (covered by plan) | Railway dashboard |
| Supabase egress | <250 GB/mo | Supabase dashboard |
| Upstash Redis commands | <2M/mo (dev) / <10M/mo (prod) | Upstash dashboard |
| Amplify build minutes | <1000/mo (free) | Amplify console |
| Amplify data egress | <15 GB/mo (free) | Amplify console |
| S3 storage | venue-driven | AWS Cost Explorer |

Set the first Friday of each month as **infrastructure review day**. Pull each metric, compare to last month, flag anomalies.

---

## 5. Deployment processes

### 5.1 Dashboard (AWS Amplify)

**Standard flow:**
```bash
# Make changes in apps/dashboard/
# Commit + push to main
git push origin main
# Amplify auto-detects, builds, deploys (~3 min)
```

**Verify deployment:**
```bash
REGION="ap-south-1"
APP_ID="d3t439ur25l1xc"
aws amplify list-jobs --app-id $APP_ID --branch-name main --region $REGION --max-results 1
```

**Manual redeploy (without code change):**
AWS Console → Amplify → app → Hosting environments → main → "Redeploy this version"

**Rollback:**
AWS Console → Amplify → app → Hosting environments → main → click any past successful build → "Redeploy this version"

### 5.2 API + workers (Railway)

**Standard flow:**
```bash
git push origin main
# Railway auto-deploys watched services on push
```

**Manual deploy of specific service:**
```bash
cd /path/to/Safecommand
railway service api      # link to service
railway up --detach      # upload + deploy
```

**Set build/start command via API (when CLI lacks support):**
```bash
TOKEN=$(cat ~/.railway/config.json | python3 -c "import json,sys;print(json.load(sys.stdin)['user']['accessToken'])")
SVC="<service-id>"
ENV="<env-id>"
curl -s -X POST https://backboard.railway.com/graphql/v2 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"mutation { serviceInstanceUpdate(serviceId: \\\"$SVC\\\", environmentId: \\\"$ENV\\\", input: { startCommand: \\\"node apps/X/dist/index.js\\\" }) }\"}"
```

**Rollback:**
Railway CLI does not support rollback directly. Either revert the commit + push, or in Railway dashboard → Deployments → restore a previous successful deployment.

### 5.3 Mobile (EAS Build)

**Development build (for Metro dev client):**
```bash
cd apps/mobile
eas build --profile development --platform android
```

**Preview build (standalone APK, no Metro needed):**
```bash
eas build --profile preview --platform android
```

**Production build (when ready for store submission):**
```bash
eas build --profile production --platform android
eas submit --platform android  # to Google Play
```

### 5.4 Supabase migrations

**Apply locally:**
```bash
cd /path/to/Safecommand
npx supabase db push --db-url "$DATABASE_URL"
```

**Apply via Dashboard (when network blocks pooler):**
Supabase Dashboard → SQL Editor → paste migration → Run. Verify success via REST query before assuming applied.

---

## 6. Monitoring, alerting & incident response

### 6.1 Health endpoints

| Service | Health URL | Expected response |
|---------|-----------|-------------------|
| API | `https://api-production-9f9dd.up.railway.app/health` | `{"status":"ok","checks":{"database":"ok","firebase":"ok"}}` |
| Dashboard | `https://main.d3t439ur25l1xc.amplifyapp.com` | HTTP 200 (login page) |
| Workers (scheduler/notifier/escalation) | no HTTP — check Railway logs | recent activity = healthy |

### 6.2 Alerts to configure (priority order)

| Priority | Alert | Where | Status |
|----------|-------|-------|--------|
| P0 | API 5xx rate >5% | UptimeRobot or AWS Synthetics | TODO |
| P0 | API health endpoint reports `firebase: error` or `database: error` | Sentry alert | TODO |
| P1 | Upstash Redis usage at 80% of plan | Upstash console | **DO THIS NOW** |
| P1 | AWS Amplify build failures on main | AWS Amplify notifications | TODO |
| P1 | Supabase storage at 80% of plan | Supabase dashboard | TODO |
| P2 | Railway service crash loop (3+ restarts in 5 min) | Railway notifications | TODO |
| P2 | Daily AWS cost exceeds $5 | AWS Budget alert | TODO |
| P3 | Weekly digest of metrics | Custom email | TODO |

### 6.3 When something breaks — diagnostic order

1. **Check API health first.** If `{"status":"degraded"}`, identify which sub-system: database/firebase/redis
2. **If API degraded → check Railway logs.** Look for `ReplyError`, `connection refused`, `ECONNREFUSED`, `Invalid PEM`
3. **If Redis errors → check Upstash dashboard for usage cap or auth issues**
4. **If database errors → check Supabase Status page + connection limits**
5. **If Firebase errors → verify FIREBASE_PRIVATE_KEY env var format**
6. **If everything looks fine but feature broken → check service-specific logs** (escalation worker for missed escalations, notifier for FCM delivery, scheduler for task generation)

### 6.4 On-call standard (solo founder mode)

- **P0 incidents:** drop everything, fix immediately
- **P1 incidents:** fix within 4 hours
- **P2 incidents:** fix within 24 hours
- **All incidents:** post-mortem in section 12 of this doc, even if 2 lines

---

## 7. Security, IAM & data residency

### 7.1 IAM principles

1. **Never use root user for daily operations.** Create IAM users with scoped permissions.
2. **Service roles, not user credentials, in production.** Amplify, ECS, etc. should assume service roles.
3. **Rotate access keys quarterly** — set calendar reminder.
4. **All secrets in environment variables or Secrets Manager**, never in code.
5. **Gitleaks pre-commit hook required** — already in repo, do not disable.

### 7.2 Current IAM state

| Account | Role | Purpose |
|---------|------|---------|
| AWS root | locked, MFA enabled | should be — verify |
| AWS user `serverless-admin` | broad permissions | dev convenience; tighten at Phase 2 |
| AWS role `AmplifyServiceRole-safecommand` | `AdministratorAccess-Amplify` | Amplify build pipeline |
| Supabase service role key | full DB access | API + workers only — never client-side |
| Firebase service account | Admin SDK | API verifyIdToken + workers FCM send |

### 7.3 Data residency (NFR-11) compliance map

| Data class | Phase 1 location | Phase 2 location |
|-----------|-----------------|------------------|
| User PII (staff phones, names) | Supabase US | Supabase ap-south-1 / RDS Mumbai |
| Visitor PII (Aadhaar parsed) | Supabase US (when VMS launches) | India residency required before launch |
| Evidence photos | AWS S3 ap-south-1 ✓ | unchanged |
| Auth tokens (FCM) | Firebase global | Firebase global (acceptable per DPDP under transfer mechanism) |
| Audit logs | Supabase US | move with main DB |

**Hard rule:** no hospital contracts may sign before Supabase / DB migration to ap-south-1. Document this in sales playbook.

### 7.4 Secrets discipline

- All secrets in Railway Variables, Amplify Environment Variables, or Supabase Vault
- **NEVER** commit secrets to git (gitleaks blocks)
- Rotate JWT_SECRET when first hire joins
- Rotate Firebase service account if leak suspected
- Document every secret in section 11 runbook (where it lives, what touches it)

---

## 8. Disaster recovery & rollback

### 8.1 Backup status

| Asset | Backup mechanism | RPO | RTO |
|-------|------------------|-----|-----|
| Supabase Postgres | PITR 7 days (Pro plan) | <1 min | 5–15 min |
| AWS S3 evidence files | Versioning (TODO — enable) | 0 with versioning | minutes |
| Railway code | Git on GitHub | per-commit | minutes |
| Firebase project | export job (TODO) | none currently | high — manual |
| Mobile APK builds | EAS retains last N builds | per-build | minutes |
| Configuration (env vars, IAM roles) | manual snapshot — see section 11 | per-snapshot | hours |

**Action items:**
- Enable S3 versioning on production buckets
- Set up monthly Firebase project export
- Snapshot env vars to encrypted local file quarterly

### 8.2 Rollback playbooks

**Bad code deploy to dashboard:**
1. AWS Amplify Console → app → Hosting environments → main → click last good build → Redeploy this version
2. Force-push revert commit if needed: `git revert <bad-sha> && git push`

**Bad code deploy to API:**
1. `git revert <bad-sha> && git push` — auto-deploys the revert
2. OR Railway dashboard → Deployments → restore prior

**Bad migration on Supabase:**
1. Use PITR: Supabase Dashboard → Database → Backups → Restore to point-in-time
2. RTO: 5–15 min depending on DB size

**Lost env vars (e.g., Railway service deleted):**
1. Use snapshot from section 11 runbook
2. Re-add via Railway dashboard or `railway variables --set`

---

## 9. AWS migration roadmap

### Why migrate from Railway → AWS

- DPDP Act + NABH compliance for hospitals (mandatory before first hospital contract)
- Cost predictability at scale (Railway billing surprises at >$200/mo)
- Single account for all infra (ops simplicity)
- Open-source-first per CLAUDE.md (Railway is closed-platform)

### Migration target architecture (Phase 2)

```
                         ┌──────────────────────┐
                         │  Route 53            │
                         │  app.safecommand.in  │
                         │  api.safecommand.in  │
                         └─────┬────────────┬───┘
                               │            │
                        ┌──────▼─────┐  ┌──▼──────────┐
                        │ CloudFront │  │ API Gateway │
                        │ + WAF      │  │ + WAF       │
                        └──────┬─────┘  └──┬──────────┘
                               │           │
                        ┌──────▼──────┐  ┌─▼────────────┐
                        │ Amplify     │  │ ECS Fargate  │
                        │ Hosting     │  │ ap-south-1   │
                        │ (no change) │  │ (api+workers)│
                        └─────────────┘  └─┬────────────┘
                                           │
                          ┌────────────────┼─────────────────┐
                          │                │                 │
                    ┌─────▼──────┐  ┌──────▼──────┐  ┌──────▼─────┐
                    │ RDS        │  │ ElastiCache │  │ S3         │
                    │ PostgreSQL │  │ Serverless  │  │ ap-south-1 │
                    │ Mumbai     │  │ Redis       │  │ (no change)│
                    └────────────┘  └─────────────┘  └────────────┘
```

### Migration sequence (when triggered)

1. **Pre-migration (1 week prior):** spin up RDS Postgres in ap-south-1, replicate from Supabase via `pg_dump | pg_restore` + ongoing logical replication
2. **Cutover window (4 hours, planned at low-traffic time):**
   - Enable maintenance mode
   - Final replication sync
   - Switch DATABASE_URL across all services
   - Smoke test
   - Disable maintenance mode
3. **API/workers:** containerize with Docker (already mostly compatible), deploy to ECS Fargate with task definitions
4. **DNS cutover:** update Route 53 to point to ALB / API Gateway
5. **Decommission Railway** after 7-day verification window

### When to trigger migration

**Triggers (any one is sufficient):**
- First hospital pilot contract signed
- Sustained Railway burn >$200/mo
- 5+ active venues OR 100+ daily active users
- Compliance audit scheduled
- Phase 2 sprint window opens (~Sprint 9)

**Estimated effort:** 2–3 weeks of focused work, plus 1 week stabilization.

---

## 10. Anti-patterns & lessons learned

### 10.1 Hard-won lessons (do NOT repeat)

| # | Lesson | Cost when violated |
|---|--------|--------------------|
| 1 | Use `npm install` not `npm ci` from monorepo root in CI | 2+ hrs debugging EBUSY errors |
| 2 | Always set Amplify service role to `AdministratorAccess-Amplify` | Days of "env vars not loading" mystery |
| 3 | Declare `NEXT_PUBLIC_*` vars in `next.config.ts` `env:` field | All web env vars silently fail to inline |
| 4 | Avoid Realtime websockets in Next.js until Phase 2 | Days of prerender + Proxy + binding chaos |
| 5 | Don't use `REDIS_URL` env var name on Railway | Silent empty resolution; service crashes |
| 6 | BullMQ jobIds must not contain `:` — use `__` | Constant job-failed loop |
| 7 | Firebase private keys need `-----BEGIN PRIVATE KEY-----` headers | `Invalid PEM` errors |
| 8 | Time-box infrastructure debugging at 30–60 min | 4-hour rabbit holes are common |
| 9 | Workers always-on burn far more Redis than expected | 500K free tier hit in 2 days |
| 10 | Mobile dev requires fresh APK per native dependency change | "Native module not found" = old APK |
| 11 | Test env vars via curl scan of bundles, not just dashboard config | Configuration ≠ working |
| 12 | Always commit lockfile changes when adding deps | Deploy fails on next CI |
| 13 | Workspace package.json changes need root lockfile refresh | "Missing from lock file" cascade |
| 14 | Hardcoded fallbacks for non-secret public config (Supabase anon key) is fine | Saves env var debugging hours |
| 15 | Polling at 5s is acceptable per NFR-10; Realtime is not always required | 1-day vs week of debugging |

### 10.2 Architectural anti-patterns to avoid

- **Don't over-engineer Phase 1.** Real-time everything, perfect IaC, multi-region: defer to Phase 2.
- **Don't use Vercel as a stepping stone.** Migration to AWS later is real effort. Go direct.
- **Don't optimize Redis usage prematurely.** Pay-as-You-Go is cheap; engineering hours are not.
- **Don't manually configure infra repeatedly.** If you've done it twice, document it (in this file).
- **Don't trust auto-detected build settings.** Always verify the actual build command being run.

### 10.3 Process anti-patterns

- **Don't push to production after midnight.** Solo founder; sleep is on-call.
- **Don't deploy on Friday.** Same reason — no time to fix before weekend.
- **Don't skip post-deploy verification.** A 30-second curl check has caught countless issues.
- **Don't invest in flaky tests.** Either fix or delete; flaky CI erodes trust faster than no CI.

---

## 11. Operational runbooks

### 11.1 Daily operational checks (5 min, do at start of dev session)

```bash
# 1. API health
curl -s https://api-production-9f9dd.up.railway.app/health | python3 -m json.tool

# 2. Dashboard up
curl -sI https://main.d3t439ur25l1xc.amplifyapp.com | head -1

# 3. Recent Railway deploys
cd /path/to/Safecommand && railway service api && railway logs --deployment 2>&1 | tail -5

# 4. Mobile build state
eas build:list --limit 3 --platform android  # from apps/mobile/
```

If any fails → see section 6.3 diagnostic order.

### 11.2 Weekly review (15 min, every Friday)

1. Check Upstash command count vs plan
2. Check Supabase storage + connection metrics
3. Review Amplify build minute consumption
4. Scan AWS Cost Explorer for anomalies
5. Check Railway billing dashboard
6. Update this document if any anti-pattern was hit this week

### 11.3 Monthly review (30 min, first Friday of month)

1. Full cost reconciliation across all 6 services
2. Review error rate trends in API logs
3. Compare burn to projection in section 4
4. Plan next month's cost-discipline adjustments
5. Update [Decision log](#12-decision-log) if major decisions made

### 11.4 Pause / resume workers (cost discipline runbook)

Three executable scripts live at `scripts/`:

| Script | Purpose | Effect |
|--------|---------|--------|
| `./scripts/pause-workers.sh` | End-of-day shutdown | scheduler + escalation + notifier → 0 replicas |
| `./scripts/resume-workers.sh` | Start-of-day wake-up | All 3 workers → 1 replica + waits for API health |
| `./scripts/worker-status.sh` | State check | Shows current replicas + deployment status for all 4 services |

#### Daily flow

**Morning, before building/testing (~30 sec):**
```bash
cd "/Volumes/Crucial X9/claude_code/NEXUS_system/products/Safecommand"
./scripts/resume-workers.sh
```
Output confirms each worker scaled to 1, then polls API health until ready (60-90s typical). When you see `✓ API healthy`, start working.

**End of day, weekend, or vacation (~10 sec):**
```bash
cd "/Volumes/Crucial X9/claude_code/NEXUS_system/products/Safecommand"
./scripts/pause-workers.sh
```
Output confirms each worker scaled to 0. Workers stop within ~30 sec.

**Anytime — quick status check:**
```bash
./scripts/worker-status.sh
```

#### What's affected when paused

✅ **Still works (API stays running):**
- Mobile login, OTP verification, JWT issuance
- Mobile viewing tasks, completing tasks (writes to DB)
- Dashboard browsing, Zone Board, Incidents page
- Direct DB queries via Supabase
- File uploads to S3

🛑 **Stops working until resumed:**
- Scheduled task generation (no new task instances created)
- Push notifications (FCM/WhatsApp/SMS won't fire)
- Escalation chain firing on missed tasks
- Incident notifications (incident gets recorded in DB but no push fires)

🔒 **Preserved (no data loss):**
- All DB rows
- Existing queue contents in Upstash Redis
- On resume, queued jobs flush in order

#### Cost impact

| State | Burn/hour | Burn/day | Burn/week |
|-------|-----------|----------|-----------|
| All 3 workers running | ~2,400 cmd | ~57K | ~400K |
| All 3 workers paused | ~0 cmd | ~0 | ~0 |
| 8 hr/day pause × 7 days | savings = ~135K/week | | |
| 16 hr/day pause × 7 days | savings = ~270K/week | | |

At PAYG rates ($0.20 / 100K cmd), pausing 16 hours daily saves ~$0.50/week. Small in absolute terms but the bigger value is **discipline** — keeps you below the 500K/month free-tier line during light testing weeks, lets the free quota cover all of next month.

#### When NOT to pause

- During an active demo/pilot
- When testing escalation timing (escalation worker must be live to fire delayed jobs)
- When awaiting a scheduled task to fire (need scheduler running)
- During a multi-day soak test
- If the team is geographically distributed and someone might test at any hour

#### Edge cases

**Pause script fails partially** (1 of 3 workers not paused):
- Re-run the script — it's idempotent
- If still failing, run `./scripts/worker-status.sh` to see which one
- Fall back to Railway dashboard manual scale-down

**Resume script reports API health timeout**:
- Workers might still be coming up — wait 2-3 min, then `curl https://api-production-9f9dd.up.railway.app/health`
- If still failing, check Railway logs: `railway service api && railway logs --deployment | tail -30`

**Forgot to resume before testing**:
- Mobile shows "no tasks" indefinitely
- Push notifications never arrive
- Solution: just run `./scripts/resume-workers.sh` — auto-recovers

**Token expired** (Railway login session expired):
- Scripts fail with auth error
- Re-authenticate: `railway login`
- Then retry the script

### 11.5 Emergency contacts & links

| Service | Console | Status page |
|---------|---------|-------------|
| AWS | https://console.aws.amazon.com | https://health.aws.amazon.com |
| Railway | https://railway.app/project/3e27e7ad-f120-4958-b8f6-c1be42032914 | https://status.railway.com |
| Supabase | https://supabase.com/dashboard/project/exrewpsjrtevsicmullp | https://status.supabase.com |
| Upstash | https://console.upstash.com | https://status.upstash.com |
| Firebase | https://console.firebase.google.com/project/safecommand-51499 | https://status.firebase.google.com |
| Expo / EAS | https://expo.dev/accounts/sachisab99/projects/safecommand | https://status.expo.dev |
| GitHub | https://github.com/sachisab99/safecommand | https://www.githubstatus.com |

### 11.6 Configuration snapshots

Maintain a separate, encrypted, off-repo file with current values for:
- All Railway env vars per service
- All Amplify env vars
- Supabase API keys
- Firebase service account JSON
- Upstash connection string

Update after every significant config change. Recommended tool: 1Password Secure Document, or local encrypted folder synced to cloud backup.

---

## 12. Decision log

Append entries here as architectural decisions are made. Format: date, decision, rationale, reversibility.

### 2026-04-29 — Choose Railway over self-hosted compute for Phase 1

**Decision:** Use Railway for API + workers in Phase 1.
**Rationale:** Solo founder, NFR-19 requires solo-buildable. Self-hosting adds 2+ weeks ops overhead.
**Reversibility:** High — designed migration path to AWS ECS at Phase 2.

### 2026-04-30 — Replace Supabase Auth with Firebase Auth on mobile

**Decision:** Mobile uses Firebase phone OTP; API verifies via Firebase Admin SDK and issues own JWT.
**Rationale:** Free Firebase test numbers eliminate `TEST_PHONE_PAIRS` bypass. Cleaner separation of concerns. Better UX.
**Reversibility:** Medium — would require mobile re-implementation if reversed.

### 2026-05-02 — Use AWS Amplify Mumbai for dashboard hosting (skip Vercel)

**Decision:** Deploy Next.js dashboard to AWS Amplify ap-south-1 directly.
**Rationale:** NFR-11 India residency from Day 1. Avoids throwaway migration from Vercel later. ~$15/mo cheaper at Phase 2 scale.
**Reversibility:** High — Next.js apps move easily between hosts.

### 2026-05-02 — Replace Supabase Realtime with 5-second polling on Zone Board

**Decision:** Web dashboard polls `/zones/accountability` every 5s instead of subscribing to Supabase Realtime websockets.
**Rationale:** Realtime created chained issues with Next.js 16 SSR + Turbopack + bracket-notation env access. Polling is within NFR-10 (≤30s zone refresh). Simpler architecture.
**Reversibility:** High — Realtime can return in Phase 2 with `@supabase/ssr` package if customer pain justifies.

### 2026-05-02 — Upgrade Upstash Redis to Pay-As-You-Go

**Decision:** Move from Free tier (500K cmd/mo) to Pay-As-You-Go ($0.20 / 100K above 500K free).
**Rationale:** Hit free tier in 2 days of dev. Worker idle heartbeats are unavoidable at our scale. PAYG is cheaper than ElastiCache until Phase 3.
**Reversibility:** Easy — downgrade plan anytime if usage drops.

### 2026-05-02 — Adopt severity-coded Zone Board with neutral slate for ALL_CLEAR

**Decision:** Zone Board v2 uses 7 distinct visual states; ALL_CLEAR is slate (not green) to fight alarm fatigue.
**Rationale:** Industry standard in hospital control rooms. Green creates false comfort; slate is neutral — focuses attention on actual issues.
**Reversibility:** Medium — easy code change if customer feedback rejects it.

---

## How to use this document

- **Before any infra change:** read the relevant section. Save yourself an anti-pattern repeat.
- **During an incident:** start at section 6.3 diagnostic order.
- **Before a deploy:** verify the runbook in section 5.
- **At weekly review:** follow section 11.2 checklist.
- **When making architectural choices:** consult section 9 phase guide and section 10 lessons.
- **When onboarding anyone:** this is the first read.
- **When this doc is stale:** update it. Do not let it rot. A stale runbook is worse than no runbook.
- **For Redis quota / scheduler tick decisions:** see companion file [`upstash_redis.md`](./upstash_redis.md) in this folder.

---