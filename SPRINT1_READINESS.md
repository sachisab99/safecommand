# SafeCommand — Sprint 1 Readiness & Action Plan
**Generated:** 2026-04-27  
**Status:** BLOCKED — 6 founder actions required before first line of code

---

## Current State Summary

| Area | Status | Blocker |
|------|--------|---------|
| CLAUDE.md (build context) | ✅ Complete | — |
| Git repo (local) | ✅ 1 commit | — |
| GitHub remote | ❌ Not configured | No SSH key, no remote URL |
| GitHub SSH auth | ❌ Failing | `Permission denied (publickey)` — no key exists |
| Node.js v24 + npm | ✅ Installed | — |
| Expo CLI v55 | ✅ Installed | — |
| Supabase CLI | ❌ Not installed | Required for migrations |
| Railway CLI | ❌ Not installed | Required for deploys |
| gh CLI | ❌ Not installed | Required for GitHub ops |
| Vercel CLI | ❌ Not installed | Required for web deploys |
| Supabase project | ❌ Not created | Required for Week 1 migrations |
| Railway project | ❌ Not created | Required for Week 1 API deploy |
| Upstash Redis | ❌ Not created | Required for Week 1 Bull queues |
| Firebase project | ❌ Not created | Required for Week 4 push |
| AWS S3 ap-south-1 | ❌ Not created | Required for Week 6 photo uploads |
| Meta WhatsApp API | ❌ Not applied | 7–14 day approval — MUST START TODAY |
| Airtel DLT SMS | ❌ Not applied | 5–7 day approval — MUST START TODAY |
| Domain (safecommand.in) | ❌ Not purchased | Required before pilot go-live |

---

## PART A — Your Actions (Founder-Only — No Code Involved)

These cannot be delegated to Claude Code. Grouped by urgency.

---

### A1. CRITICAL — Start Today (Long Lead Times)

These two have regulatory approval processes you cannot shortcut.
Week 4 is blocked without them — start immediately.

---

#### A1.1 Meta WhatsApp Business API
**Why Day 1:** 7–14 day approval process. Week 4 notification stack cannot be built without approved templates.

**Steps:**
1. Go to [business.facebook.com](https://business.facebook.com) → create a Meta Business Manager account (use your business email)
2. Inside Business Manager → go to **WhatsApp Accounts** → click **Add** → **Create a WhatsApp Business Account**
3. Verify your business phone number (use a number that is NOT already on WhatsApp consumer app)
4. Go to [developers.facebook.com](https://developers.facebook.com) → **My Apps** → **Create App** → select **Business** type
5. Inside the app → add **WhatsApp** product → link to your WhatsApp Business Account
6. Note down:
   - `WHATSAPP_PHONE_NUMBER_ID` (shown in WhatsApp > Getting Started)
   - `WHATSAPP_BUSINESS_ACCOUNT_ID`
   - Generate a permanent System User token: Business Settings → System Users → Add → assign WhatsApp permissions → Generate Token
   - Save as `WHATSAPP_API_TOKEN`
7. Submit business verification documents (GST certificate, address proof) — this is what triggers the 7–14 day wait
8. Once approved: create a webhook endpoint (Claude Code will build this) and register it in the Meta app dashboard

**What to hand back to Claude Code:** `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_API_TOKEN`

---

#### A1.2 Airtel Business SMS — DLT Registration
**Why Day 1:** TRAI regulatory requirement. Any SMS sent without DLT registration is blocked by Indian carriers. 5–7 business days.

**Steps:**
1. Go to [airtel.in/business/sms](https://airtel.in/business/sms) → click **Get Started** or **Contact Sales** → request Business SMS account
2. You will need to register on the **DLT (Distributed Ledger Technology) portal** — Airtel will guide you to their specific DLT portal
3. Documents required for DLT registration:
   - GST certificate (your company or proprietorship)
   - PAN card
   - Address proof (utility bill or lease agreement)
   - Business authorization letter on company letterhead
4. Register your **Entity Name** (your company name) on the DLT portal
5. Register the **Header/Sender ID:** `SFCMND` (6 characters, this is your SMS "from" name)
6. Once approved, register your SMS **content templates** — Claude Code will provide the exact 8 template texts when building Week 4
7. Note down: Airtel API key, Entity ID, Header ID (`SFCMND`), and template IDs once registered

**What to hand back to Claude Code:** Airtel API Key, Entity ID, Sender ID (`SFCMND`), Template IDs

---

### A2. BLOCKING for Week 1 — Complete Before First Build Session

These take same-day or 1–2 hours to set up. Week 1 code cannot run without them.

---

#### A2.1 GitHub — Create Repo + Add SSH Key

**Why blocking:** No code can be pushed. Local git has no remote. SSH auth is currently failing (`Permission denied (publickey)`).

**Step 1 — Generate SSH key** (run this in your terminal):
```bash
ssh-keygen -t ed25519 -C "sachisab99@gmail.com" -f ~/.ssh/safecommand_github
```
When prompted for passphrase: press Enter (no passphrase for automation compatibility)

**Step 2 — Add key to SSH agent:**
```bash
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/safecommand_github
```

**Step 3 — Add to `~/.ssh/config`** (create if it doesn't exist):
```
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/safecommand_github
```

**Step 4 — Copy the public key:**
```bash
cat ~/.ssh/safecommand_github.pub
```
Copy the entire output.

**Step 5 — Add to GitHub:**
- Go to [github.com/settings/ssh/new](https://github.com/settings/ssh/new)
- Title: `SafeCommand MacBook`
- Key: paste the public key
- Click **Add SSH key**

**Step 6 — Test auth:**
```bash
ssh -T git@github.com
```
Expected: `Hi sachinsab99! You've successfully authenticated`

**Step 7 — Create GitHub repo:**
- Go to [github.com/new](https://github.com/new)
- Repository name: `safecommand`
- Visibility: **Private**
- Do NOT add README, .gitignore, or licence (repo already has commits locally)
- Click **Create repository**

**Step 8 — Copy the SSH clone URL** (format: `https://github.com/sachisab99/safecommand.git`)
Hand this URL back to Claude Code — it will add the remote and push.
- https://github.com/sachisab99/safecommand.git

---

#### A2.2 Supabase — Create Project (Pro Plan)

**Why blocking:** All Supabase migrations run against a live Supabase project. The Pro plan is required from Day 1 for PITR (7-day point-in-time recovery).

**Steps:**
1. Go to [supabase.com](https://supabase.com) → sign up / log in
2. Click **New project**
3. Settings:
   - Organization: create one named `SafeCommand`
   - Project name: `safecommand-prod` #Ilovelife@99safe
   - Database password: generate a strong one — **save it immediately**
   - Region: **us-east-1** (this is Phase 1; India migration happens in Phase 2)
4. **Upgrade to Pro plan:** Project Settings → Billing → Upgrade → Pro ($25/month)
5. **Enable PITR:** Project Settings → Add-ons → Point in Time Recovery → Enable (7-day)
6. Collect these values from Project Settings → API:
   - `SUPABASE_URL` (e.g. `https://exrewpsjrtevsicmullp.supabase.co`) # https://exrewpsjrtevsicmullp.supabase.co
   - `SUPABASE_ANON_KEY` # eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV4cmV3cHNqcnRldnNpY211bGxwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMDA0MjMsImV4cCI6MjA5Mjg3NjQyM30.yl66Kv3yEoBkvFchH8kwY8yQ-CrgM7Y-6nnzq8VzRdE
   - `SUPABASE_SERVICE_ROLE_KEY` (keep secret — never commit) # eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV4cmV3cHNqcnRldnNpY211bGxwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzMwMDQyMywiZXhwIjoyMDkyODc2NDIzfQ.zYh3LceNVLzFgq4TVLWdQ6Xqdp_xY5Exm_0V3aJ2HcY
7. From Project Settings → Database → Connection string (URI mode):
   - `DATABASE_URL` (the direct Postgres connection string with password) # postgresql://postgres:[YOUR-PASSWORD]@db.exrewpsjrtevsicmullp.supabase.co:5432/postgres
8. Enable Realtime: Database → Replication → enable `supabase_realtime` publication

**What to hand back to Claude Code:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`
- https://exrewpsjrtevsicmullp.supabase.co
- eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV4cmV3cHNqcnRldnNpY211bGxwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMDA0MjMsImV4cCI6MjA5Mjg3NjQyM30.yl66Kv3yEoBkvFchH8kwY8yQ-CrgM7Y-6nnzq8VzRdE
- eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV4cmV3cHNqcnRldnNpY211bGxwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzMwMDQyMywiZXhwIjoyMDkyODc2NDIzfQ.zYh3LceNVLzFgq4TVLWdQ6Xqdp_xY5Exm_0V3aJ2HcY
- postgresql://postgres:[YOUR-PASSWORD]@db.exrewpsjrtevsicmullp.supabase.co:5432/postgres

---

#### A2.3 Railway — Create Project + 4 Services

**Why blocking:** The API service must deploy to Railway for Week 1. Claude Code writes the code; Railway is where it runs.

**Steps:**
1. Go to [railway.app](https://railway.app) → sign up with GitHub
2. **Upgrade to Pro plan:** $20/month — required for 2 replicas on the API service
3. Click **New Project** → **Empty Project**
4. Name the project: `safecommand`
5. Inside the project, create 4 services (click **+ New** → **Empty Service** for each):
   - Service 1 name: `api` - api-production-9f9dd.up.railway.app
   - Service 2 name: `scheduler` - scheduler-production-c169.up.railway.app
   - Service 3 name: `escalation` - escalation-production.up.railway.app
   - Service 4 name: `notifier` - notifier-production-2346.up.railway.app
6. For each service, go to Settings → note the auto-generated Railway URL
7. For the `api` service → Settings → Networking → Generate Domain (this gives you `api-xxx.railway.app` for testing before domain setup)
8. In Project Settings → collect the **Railway API Token** (needed for CLI deploys)

**What to hand back to Claude Code:** Railway API Token, service names, generated domain for `api` service
   - Railway API Token: beb68313-4bfa-426e-bed7-cd325afa600c
   - Service 1 name: `api` - api-production-9f9dd.up.railway.app
   - Service 2 name: `scheduler` - scheduler-production-c169.up.railway.app
   - Service 3 name: `escalation` - escalation-production.up.railway.app
   - Service 4 name: `notifier` - notifier-production-2346.up.railway.app


---

#### A2.4 Upstash Redis — Create Database

**Why blocking:** Bull queues (scheduler, escalation, notifier workers) require Redis from the first line of worker code.

**Steps:**
1. Go to [upstash.com](https://upstash.com) → sign up
2. Click **Create Database**
3. Settings:
   - Name: `safecommand-redis`
   - Type: **Regional** (not Global — lower latency for single-region Phase 1)
   - Region: **us-east-1** (same as Supabase)
   - Enable **TLS** ✓
   - Enable **Eviction**: No (queues must not evict job data)
4. From the database dashboard, collect:
   - `UPSTASH_REDIS_URL` (format: `rediss://default:TOKEN@HOST:PORT`) - REDIS_URL="rediss://default:gQAAAAAAAaUxAAIgcDE5YjZlMzE2YzU4ZDQ0MThiYjY3NmI4MWJlZTY5YzY1Yw@lucky-giraffe-107825.upstash.io:6379"
   - `UPSTASH_REDIS_REST_URL` - https://lucky-giraffe-107825.upstash.io
   - `UPSTASH_REDIS_REST_TOKEN` - gQAAAAAAAaUxAAIgcDE5YjZlMzE2YzU4ZDQ0MThiYjY3NmI4MWJlZTY5YzY1Yw
5. In Configuration, confirm **AOF Persistence** is enabled (jobs survive Upstash restarts)

**What to hand back to Claude Code:** `UPSTASH_REDIS_URL`
UPSTASH_REDIS_REST_URL="https://lucky-giraffe-107825.upstash.io"
---

### A3. Needed by Week 3–4 — Complete This Week

These don't block Week 1 code but must be ready before Week 3 coding sessions.

---

#### A3.1 Firebase Project

**Steps:**
1. Go to [console.firebase.google.com](https://console.firebase.google.com) → **Add project**
2. Project name: `safecommand`
3. Enable Google Analytics: No (keep it simple)
4. In the project:
   - Authentication → Sign-in method → **Phone** → Enable
   - Project settings → **Add app** → Android → package name: `in.safecommand.app` → download `google-services.json`
   - Project settings → **Add app** → iOS → bundle ID: `in.safecommand.app` → download `GoogleService-Info.plist`
   - Project settings → Service accounts → **Generate new private key** → save as `firebase-admin.json` (never commit this)
5. Cloud Messaging → note the **Server Key** (for FCM push) - BNbO6bzL6vo5ovGyXX5S4JLanXpjZnOxdTB1ENnTnYMNQvga-Uj2GdU1Jj3FK-HnT-ebtfO83TL1IbsSgIqNqjU

**What to hand back to Claude Code:** `google-services.json`, `GoogleService-Info.plist`, `firebase-admin.json`, Server Key

---

#### A3.2 AWS S3 Bucket (India Storage)

**Steps:**
1. Log in to [aws.amazon.com](https://aws.amazon.com) → go to S3
2. Click **Create bucket**
3. Settings:
   - Bucket name: `safecommand-uploads-prod`
   - Region: **ap-south-1** (Mumbai — India data residency from Day 1)
   - Block all public access: ✓ enabled (files served via presigned URLs only)
   - Versioning: disabled (not needed — presigned URLs handle this)
   - Encryption: **SSE-S3** (Server-side encryption with S3 managed keys)
4. Create an IAM user for the API:
   - IAM → Users → Add user → name: `safecommand-api`
   - Permissions: attach policy `AmazonS3FullAccess` (Claude Code will scope this down later)
   - Create access key → download `credentials.csv`
5. Collect:
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - `AWS_S3_BUCKET=safecommand-uploads-prod`
   - `AWS_REGION=ap-south-1`

**What to hand back to Claude Code:** All 4 env vars above

---

#### A3.3 Domain Purchase (safecommand.in)

**Steps:**
1. Go to [GoDaddy.in](https://godaddy.com/en-in) or [Namecheap](https://namecheap.com) → search `safecommand.in`
2. Purchase for 1 year (~₹900–1,500)
3. Point nameservers to Vercel or keep at registrar — Claude Code will provide the DNS records needed once Railway + Vercel are deployed
4. Records Claude Code will need you to add later:
   - `api.safecommand.in` → Railway CNAME
   - `app.safecommand.in` → Vercel CNAME
   - `ops.safecommand.in` → Vercel CNAME

No immediate action needed beyond purchase — DNS records come after first deploy.

---

#### A3.4 Apple Developer Account (for iOS build)

**Steps:**
1. Go to [developer.apple.com/enroll](https://developer.apple.com/enroll) → enroll as **Individual** ($99/year)
2. You need an Apple ID — create one if you don't have one with your business email
3. Enrollment takes 24–48 hours for approval
4. Once approved, collect:
   - Apple Team ID (visible in Membership section)

**What to hand back to Claude Code:** Apple Team ID (needed for Expo EAS build config)

---

## PART B — Claude Code Actions (Development Work)

These are done in build sessions. None require your accounts — they use credentials you hand back from Part A.

### B1. Blocking — Must Complete Before Any Build Session

| Task | When | What Claude Code does |
|------|------|-----------------------|
| Install CLI tools | Before Session 1 | `brew install supabase/tap/supabase railway gh` + `npm install -g vercel` |
| Set up global git config | Before Session 1 | Set user.name + user.email globally |
| Add GitHub remote + push | Once you give repo SSH URL (A2.1 Step 8) | `git remote add origin ...` + `git push -u origin main` |
| Create `.gitignore` + `.env.example` | Session 1 | Standard Node/Expo ignores + all env var keys (values never committed) |
| gitleaks pre-commit hook | Session 1 | Install + configure to block accidental secret commits |

### B2. Week 1 Development Tasks (Claude Code builds)

| Task | Depends on | Output |
|------|-----------|--------|
| Monorepo scaffold (turborepo + npm workspaces) | GitHub remote | `apps/api`, `apps/scheduler`, `apps/escalation`, `apps/notifier`, `apps/mobile`, `apps/dashboard`, `apps/ops-console`, `packages/db`, `packages/types`, `packages/schemas`, `packages/queue` |
| Supabase migrations (001–005) | Supabase project (A2.2) | All enums, tables, RLS policies, indexes, seed templates deployed |
| Supabase Realtime enabled | Supabase project | `zones` + `incidents` tables broadcasting |
| Expo mobile scaffold | — | iOS + Android compile and run on physical device |
| i18n setup (i18next) | — | All user-visible strings use translation keys from Day 1 |
| Bull queue definitions | Upstash Redis (A2.4) | `schedule-generation`, `escalations`, `notifications` queues defined |
| Railway `api` service deploy | Railway project (A2.3) | `GET /health` → 200 |
| GitHub Actions CI | GitHub remote | Test workflow runs on every PR |
| **GATE: RLS Isolation Proof** | Migrations deployed | Cross-venue query returns 0 rows — must pass before Week 2 |

### B3. Week 2 Development Tasks (Claude Code builds)

| Task | Depends on | Output |
|------|-----------|--------|
| Auth endpoints | Supabase Auth | `POST /auth/send-otp`, `/verify-otp`, `/refresh`, `/logout` |
| JWT middleware | Firebase Admin SDK (A3.1) | `req.auth` populated; tenant context `SET LOCAL` for RLS |
| Role permission matrix | — | All 8 roles enforced at middleware layer |
| Audit middleware | — | Every mutation auto-writes to `audit_logs` |
| Ops Console scaffold | Separate Supabase auth project | Next.js app at `ops.safecommand.in` (dev: localhost:3001) |
| Venue onboarding wizard | Ops Console | Name → type → city → tier → auto-generates `SC-[TYPE]-[CITY]-[SEQ]` |
| Floor + zone editor | Ops Console | Create floors, zones, set zone type, two-person-required toggle |
| Schedule template CRUD | Ops Console | Frequency, role, evidence type, escalation chain |
| Initial SH account creation | Ops Console | Phone → Firebase auth_id → staff record in DB |
| **GATE: Full Venue Creation** | All Week 2 tasks | 3 floors, 12 zones, 5 templates, 1 SH — SH can log into mobile |

---

## PART C — GitHub Push: Current Status + Fix

### Status
- ❌ **SSH authentication failing** — `Permission denied (publickey)`
- ❌ **No SSH key exists** on this machine
- ❌ **No remote configured** on the Safecommand repo
- ✅ GitHub.com is reachable over HTTPS (HTTP 200)

### What's blocked
Every `git push` will fail until A2.1 (SSH key setup) is complete.
No CI/CD pipeline can run. No collaborator can pull code.

### Fix sequence
Follow **A2.1** above completely, then hand Claude Code the SSH repo URL.
Claude Code will then run:
```bash
git remote add origin git@github.com:YOUR_USERNAME/safecommand.git
git push -u origin main
```
This pushes the existing commit (`538600e` — CLAUDE.md + session logs) to GitHub.

### Alternative (HTTPS instead of SSH)
If you prefer HTTPS over SSH, skip A2.1 SSH key steps and instead:
1. Create a GitHub Personal Access Token: Settings → Developer Settings → Personal Access Tokens → Tokens (classic) → Generate
2. Scopes required: `repo` (full)
3. Save the token — it replaces your password in git operations
4. Hand the token to Claude Code

---

## PART D — Dev Environment: CLI Tools to Install

Run these once on your MacBook. Claude Code will use them in every build session.

```bash
# Install Homebrew if not present
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Supabase CLI (for migrations + local dev)
brew install supabase/tap/supabase

# Railway CLI (for deploy + logs)
brew install railway

# GitHub CLI (for PR + Actions management)
brew install gh

# Vercel CLI (for dashboard + ops-console deploy)
npm install -g vercel

# Verify all installed
supabase --version
railway --version
gh --version
vercel --version
```

After installing gh, authenticate it:
```bash
gh auth login
# Choose: GitHub.com → SSH → select your safecommand_github key → authenticate via browser
```

---

## PART E — Week 1 & Week 2 Summary: Who Does What

### Week 1 (Foundation)

| Task | Owner | Blocking on |
|------|-------|------------|
| GitHub SSH key + repo creation | **You (A2.1)** | Everything |
| Supabase Pro project | **You (A2.2)** | Migrations |
| Railway project + 4 services | **You (A2.3)** | API deploy |
| Upstash Redis | **You (A2.4)** | Bull queues |
| Meta WABA application submitted | **You (A1.1)** | Week 4 |
| Airtel DLT application submitted | **You (A1.2)** | Week 4 |
| Install CLI tools | **You (Part D)** | All deploys |
| Monorepo scaffold + .gitignore | **Claude Code** | GitHub remote ✓ |
| Supabase migrations 001–005 | **Claude Code** | Supabase project ✓ |
| Railway api service GET /health | **Claude Code** | Railway project ✓ |
| Expo mobile scaffold | **Claude Code** | — |
| i18n (i18next) setup | **Claude Code** | — |
| Bull queue definitions | **Claude Code** | Upstash Redis ✓ |
| GitHub Actions CI | **Claude Code** | GitHub remote ✓ |
| **GATE: RLS Isolation Proof** | **Claude Code** | Migrations ✓ |

### Week 2 (Auth + Ops Console)

| Task | Owner | Blocking on |
|------|-------|------------|
| Firebase project + Phone Auth | **You (A3.1)** | JWT middleware |
| Apple Developer Account | **You (A3.4)** | iOS build (Week 6) |
| Auth endpoints + JWT middleware | **Claude Code** | Firebase ✓ |
| Role permission matrix | **Claude Code** | — |
| Audit middleware | **Claude Code** | — |
| Ops Console scaffold | **Claude Code** | — |
| Venue onboarding wizard | **Claude Code** | — |
| Floor + zone editor | **Claude Code** | — |
| Schedule template CRUD | **Claude Code** | — |
| SH account creation | **Claude Code** | Firebase ✓ |
| **GATE: Full Venue Creation** | **Claude Code** | All above ✓ |

---

## PART F — Go / No-Go Checklist for Sprint 1 Week 1

Before the first build session begins, confirm:

- [x] GitHub SSH key generated + added to GitHub account (A2.1) ✅ 2026-04-29
- [x] GitHub repo `safecommand` created (private) + SSH URL noted ✅ pushed 3 commits
- [x] Supabase Pro project created + PITR enabled + credentials noted (A2.2) ✅ credentials live
- [x] Railway project + 4 services created + API token noted (A2.3) ✅ all 4 services up
- [x] Upstash Redis created + `UPSTASH_REDIS_URL` noted (A2.4) ✅ connected
- [ ] Meta WhatsApp API application SUBMITTED (A1.1) — does not need to be approved, just submitted
- [ ] Airtel DLT application SUBMITTED (A1.2) — does not need to be approved, just submitted
- [ ] CLI tools installed: supabase, railway, gh, vercel — vercel ✅; supabase/railway/gh installing

## PART H — Sprint 1 Week 1 Build Progress (2026-04-29)

| Deliverable | Status | Notes |
|-------------|--------|-------|
| Monorepo scaffold (turborepo + workspaces) | ✅ Complete | packages: types, schemas, db, queue |
| apps/api (Express + TypeScript) | ✅ Complete | health, auth, venues, staff, zones, tasks, incidents |
| apps/scheduler | ✅ Complete | BullMQ worker — schedule-generation queue |
| apps/escalation | ✅ Complete | BullMQ worker — escalations + incident-escalations queues |
| apps/notifier | ✅ Complete | BullMQ worker — notifications queue (FCM stub, WA/SMS Week 4) |
| apps/mobile | ✅ Scaffolded | Expo blank-TypeScript; i18next configured |
| apps/dashboard | ✅ Scaffolded | Next.js 14 + Tailwind |
| apps/ops-console | ✅ Scaffolded | Next.js 14 + Tailwind (separate auth domain) |
| Supabase migrations 001–005 | ⚠️ Written | Blocked: need DB password to deploy |
| Supabase Realtime | ⏳ Pending | Enable after migrations deployed |
| i18n (i18next, all keys) | ✅ Complete | EN locale with all BR string keys |
| Bull queue definitions | ✅ Complete | 4 queues: schedule-gen, escalations, incident-esc, notifications |
| GitHub Actions CI | ✅ Complete | type-check + gitleaks on every PR |
| gitleaks pre-commit hook | ✅ Complete | .husky/pre-commit |
| .gitignore + .env.example | ✅ Complete | secrets never committed |
| GitHub push | ✅ Complete | 3 commits on main |

## Blocker: DB password needed for migrations

The `DATABASE_URL` was provided with `[YOUR-PASSWORD]` placeholder.
Run this to deploy migrations once the correct password is confirmed:

```bash
PGPASSWORD='YOUR_ACTUAL_PASSWORD' psql \
  -h aws-0-us-east-1.pooler.supabase.com \
  -p 5432 \
  -U postgres.exrewpsjrtevsicmullp \
  -d postgres \
  -f supabase/migrations/001_enums.sql \
  -f supabase/migrations/002_tables.sql \
  -f supabase/migrations/003_rls.sql \
  -f supabase/migrations/004_indexes.sql \
  -f supabase/migrations/005_seed_templates.sql
```

OR once supabase CLI is installed:
```bash
supabase db push --db-url "postgresql://postgres:YOUR_PASS@db.exrewpsjrtevsicmullp.supabase.co:5432/postgres"
```

---

## PART G — Credential Handoff Template

When you're ready to start, share this filled-in block with Claude Code:

```
GITHUB_REPO_SSH_URL=git@github.com:YOUR_USERNAME/safecommand.git

SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=

RAILWAY_TOKEN=
RAILWAY_API_SERVICE_URL=  (the railway.app subdomain for api service)

UPSTASH_REDIS_URL=
```

Firebase, AWS, Meta, and Airtel credentials will be collected in the relevant build sessions (Week 2, 3, 4) — no need to hand them all at once.

---

*This document is current as of 2026-04-27. Update SPRINT1_READINESS.md if any status changes.*
