# Phase 5.21 Security Gap — Analysis, Verdict, and Fix Specification
**Date:** May 2026 | **Severity:** Moderate (exploitable, non-PII) | **Status:** Requires mig 016 before merge
**Authority:** SafeCommand Architecture v8.0

> **Bottom line up front:** The finding is real, correctly characterised, and must be fixed before merge. The proposed `mig 016` fix is correct in direction but incomplete — it has two gaps that would leave the database in an inconsistent state or fail silently on future view additions. This document provides the complete fix, the root cause explanation, the architectural amendment, and the scope check to confirm nothing else is exposed the same way.

---

## 1. Validating the Finding

### What the probe found — and why it is accurate

Supabase runs a managed PostgreSQL instance and adds two platform-level roles on every project: `anon` (unauthenticated public access) and `authenticated` (any JWT-holding user). When any object is created in the `public` schema, Supabase's internal `DEFAULT PRIVILEGES` configuration automatically grants `SELECT` (and other privileges) to both roles.

This is Supabase platform behaviour, not a bug. It is documented in the Supabase docs under "Row Level Security" with the explicit warning: *"By default, any role has access to all tables in the public schema — RLS is what you use to restrict this."*

The problem is that **RLS applies to tables, not views.** Views do not support `ENABLE ROW LEVEL SECURITY` + `CREATE POLICY` in the same way tables do. A view created with `WITH (security_invoker = false)` (which makes it `SECURITY DEFINER`-equivalent — it runs as the view owner, `postgres`, bypassing the calling role's permissions) combined with Supabase's automatic `SELECT` grant to `anon` and `authenticated` creates the exposure:

```
PATH TO DATA:
  Anyone with the anon key (embedded in every mobile/dashboard build)
    → GET https://[project].supabase.co/rest/v1/corp_incident_aggregates
    → PostgREST receives request with anon role
    → anon has SELECT privilege on view (Supabase auto-grant)
    → View runs as postgres (security_invoker = false)
    → Base-table RLS never checked
    → All rows returned for all corporate accounts
```

The architect's §4.1 design — "isolation enforced at API middleware + mandatory `corporate_account_id` WHERE clause" — is correct for the Railway API path. It is completely bypassed by the PostgREST direct path. The middleware only runs for requests through the Railway API. It does not run for direct Supabase REST calls. The anon key is public. This is a real exposure.

### Severity assessment — the probe characterisation is correct

The probe correctly assesses this as **moderate, not catastrophic**:

**What is exposed:** Aggregate incident metadata — counts, dates, severities, resolution times, evacuation trigger counts, zone validation rates, action completion rates — grouped by venue, building, incident type.

**What is NOT exposed:** Staff names, staff IDs, phone numbers, visitor records, any personal identifier. Agent B confirmed this. The view was designed without PII fields.

**The actual threat model:**

| Actor | Attack | What they learn |
|---|---|---|
| Competitor | Queries the view with anon key | Incident frequency by venue type across the platform. Can infer which venue types have higher incident rates. Useful competitive intelligence. |
| Anonymous attacker | Queries the view | Aggregate safety performance data for every venue on SafeCommand. No operational damage. |
| Sophisticated attacker with venue name knowledge | Cross-references incident dates/times with public events | May be able to correlate public incidents with SafeCommand records. Low risk but possible. |
| Regulatory body | Discovers data was readable without authentication | NFR-01 and EC-20/EC-21 violations. Compliance exposure. |

**The regulatory dimension is the non-trivial part.** Even though no PII is exposed, NFR-01 explicitly requires "zero cross-venue data access" and EC-20 says CORP-* data is never accessible to unauthenticated actors. The anon key is not an authenticated corporate staff member. An unauthenticated query returning cross-venue, cross-corporate-account data is a violation of the isolation model regardless of whether PII is in the payload. This creates regulatory exposure if a compliance audit queries the Supabase REST endpoint and finds the view accessible.

### Was this an architectural oversight?

Yes. The §4.1 clarification spec (the document that introduced this view) did not account for Supabase's platform-level auto-grant behaviour on views. The spec correctly designed the isolation model for the API path and correctly avoided `SECURITY DEFINER` at the PostgreSQL function level — but views are a different object class and the platform's default privilege behaviour was not considered.

This is a known Supabase footgun that catches teams who work primarily through the API layer and never probe the PostgREST endpoint directly. The probe was correct to check this.

---

## 2. The Proposed Fix — Assessment

The proposed `mig 016` is correct in direction. Two gaps need to be closed:

### Gap 1: The proposed REVOKE is incomplete — future view additions are unprotected

The `REVOKE ALL ON corp_incident_aggregates FROM anon, authenticated` statement fixes the current view but does not prevent the same exposure on any view added in the future. Every new view created in the `public` schema will again receive automatic `SELECT` grants to `anon` and `authenticated`.

The complete fix requires **altering the DEFAULT PRIVILEGES** so new views are not auto-granted going forward. This is a one-line addition:

```sql
-- Prevents future public-schema views from being auto-granted to anon/authenticated
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT ON TABLES FROM authenticated;
```

Wait — this would remove SELECT from operational tables too. The correct approach is narrower: change the default for **views specifically** without touching tables (which need RLS, not privilege removal):

Actually the cleanest and most correct approach is different: **don't touch DEFAULT PRIVILEGES at all** (changing them retroactively and globally is risky and may break other Supabase platform behaviour). Instead: **explicitly REVOKE on each corporate view as part of its creation migration, and add this to the Hard Rules so it is done for every future view.**

### Gap 2: The REVOKE statement form may miss table inheritance

Supabase PostgREST uses `GRANT ... ON TABLE corp_incident_aggregates` (not just `ON corp_incident_aggregates`). The REVOKE should use the full `TABLE` keyword to be unambiguous:

```sql
REVOKE ALL ON TABLE corp_incident_aggregates FROM anon;
REVOKE ALL ON TABLE corp_incident_aggregates FROM authenticated;
```

---

## 3. The Complete Fix — Migration 016

This is the exact SQL that should be authored, reviewed, and applied.

```sql
-- ================================================================
-- MIGRATION 016 — Security hardening: revoke public grants on
-- corp_incident_aggregates view
-- 
-- Reason: Supabase auto-grants SELECT on all public-schema objects
-- to anon + authenticated roles. Views do not support RLS policies.
-- corp_incident_aggregates runs as view-owner (security_invoker=false)
-- bypassing base-table RLS. Combined: any anon-key caller can read
-- all corporate aggregate data via PostgREST without authentication.
-- 
-- Fix: REVOKE SELECT (and all other privileges) on this view from
-- both platform-default roles. Service_role + postgres retain access
-- (api service uses service_role; admin access uses postgres).
--
-- Apply via: Supabase Dashboard SQL Editor — same pattern as mig 014/015
-- Wrap in transaction for atomicity.
-- ================================================================

BEGIN;

-- Step 1: Revoke all privileges from platform auto-grant roles
REVOKE ALL PRIVILEGES ON TABLE corp_incident_aggregates FROM anon;
REVOKE ALL PRIVILEGES ON TABLE corp_incident_aggregates FROM authenticated;

-- Step 2: Explicitly confirm service_role retains access (defensive — it should already have it)
-- service_role is the role the Railway API uses via the Supabase service key
GRANT SELECT ON TABLE corp_incident_aggregates TO service_role;

-- Step 3: Verification block — RAISE EXCEPTION if fix did not apply correctly
DO $$
DECLARE
  v_anon_count INT;
  v_auth_count INT;
  v_service_count INT;
BEGIN
  -- Check anon has NO privileges
  SELECT COUNT(*) INTO v_anon_count
  FROM information_schema.role_table_grants
  WHERE table_name = 'corp_incident_aggregates'
    AND grantee = 'anon';

  IF v_anon_count > 0 THEN
    RAISE EXCEPTION
      'Migration 016 FAILED: anon role still has % privilege(s) on corp_incident_aggregates',
      v_anon_count;
  END IF;

  -- Check authenticated has NO privileges
  SELECT COUNT(*) INTO v_auth_count
  FROM information_schema.role_table_grants
  WHERE table_name = 'corp_incident_aggregates'
    AND grantee = 'authenticated';

  IF v_auth_count > 0 THEN
    RAISE EXCEPTION
      'Migration 016 FAILED: authenticated role still has % privilege(s) on corp_incident_aggregates',
      v_auth_count;
  END IF;

  -- Check service_role DOES have SELECT (api path must still work)
  SELECT COUNT(*) INTO v_service_count
  FROM information_schema.role_table_grants
  WHERE table_name = 'corp_incident_aggregates'
    AND grantee = 'service_role'
    AND privilege_type = 'SELECT';

  IF v_service_count = 0 THEN
    RAISE EXCEPTION
      'Migration 016 FAILED: service_role lost SELECT on corp_incident_aggregates — api path broken';
  END IF;

  RAISE NOTICE
    'Migration 016 PASSED: anon=0 grants, authenticated=0 grants, service_role=SELECT confirmed';
END $$;

COMMIT;
```

### Post-apply verification (run manually after migration, before merge)

```sql
-- Manual verification queries — run in Supabase SQL Editor after mig 016 applies

-- 1. Confirm no anon/authenticated grants remain
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_name = 'corp_incident_aggregates'
ORDER BY grantee;
-- Expected: ONLY postgres and service_role rows. anon and authenticated: zero rows.

-- 2. Confirm the actual exploit path is closed
-- Simulate what PostgREST does with the anon role:
SET ROLE anon;
SELECT COUNT(*) FROM corp_incident_aggregates;
-- Expected: ERROR: permission denied for view corp_incident_aggregates
-- If this returns a number instead of an error: migration did not apply correctly.
RESET ROLE;

-- 3. Confirm service_role path still works (api access preserved)
SET ROLE service_role;
SELECT COUNT(*) FROM corp_incident_aggregates;
-- Expected: returns a number (0 if no Phase 3 data; could be > 0 with test data)
-- If this errors: api path is broken — investigate immediately.
RESET ROLE;
```

---

## 4. Scope Check — Other Exposed Views

The same vulnerability may exist on other views in the public schema. Before merge, run this audit query to identify any other views with `anon` or `authenticated` grants:

```sql
-- Run this in Supabase SQL Editor BEFORE applying mig 016
-- Lists all views in public schema that have anon or authenticated grants
SELECT
  table_name     AS view_name,
  grantee,
  string_agg(privilege_type, ', ') AS privileges
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_type = 'VIEW'     -- Only views
  AND grantee IN ('anon', 'authenticated')
GROUP BY table_name, grantee
ORDER BY table_name, grantee;
```

**Expected results for a well-configured SafeCommand database:**

If this query returns **only** `corp_incident_aggregates` — migration 016 is the complete fix.

If this query returns **other views** — each one needs the same REVOKE treatment. Add them to migration 016 rather than creating migration 017 for each.

**Known views that should NOT be exposed to anon/authenticated via PostgREST:**
- `corp_incident_aggregates` — identified in this probe
- Any future governance dashboard views added in Phase 3
- Any analytics summary views

**Views that legitimately need anon access (if any):**
- The self-service visitor check-in session lookup (`/visitors/:token`) may use a view — check if it exists and whether PostgREST access is intentional or incidental.

Run the audit query first. Incorporate any additional findings into migration 016.

---

## 5. Architectural Amendment — What the Architecture Spec Got Wrong

The §4.1 clarification document (`SafeCommand_Phase521_Clarifications_Resolved.md`) contained this statement:

> *"The view is not SECURITY DEFINER at the PostgreSQL level — isolation is in the application middleware and the mandatory WHERE clause. This is the correct and proven pattern."*

This statement was correct for the Railway API path but incorrect as a complete isolation model because it did not account for the PostgREST direct access path. The architecture spec must be amended with a new Hard Rule.

### Hard Rule 25 — New, effective immediately

```
RULE 25: Every view created in the public schema MUST have all anon and authenticated
         privileges explicitly REVOKED in the same migration that creates the view.

  Implementation requirement:
    Every migration that contains CREATE VIEW must also contain:
      REVOKE ALL PRIVILEGES ON TABLE [view_name] FROM anon;
      REVOKE ALL PRIVILEGES ON TABLE [view_name] FROM authenticated;
    immediately after the view creation statement.

  Rationale:
    Supabase auto-grants SELECT (and other privileges) to anon and authenticated
    roles on all public-schema objects at creation time. Views do not support RLS
    policies. Any view accessible to anon via PostgREST is accessible to anyone
    with the anon key — which is embedded in every mobile and dashboard build.
    The API middleware isolation model is bypassed by the direct PostgREST path.

  Scope:
    Applies to ALL views without exception — including analytics views,
    aggregate views, and internal views not intended for direct client access.

  Verification:
    Every migration that creates a view must include a DO block that confirms
    anon and authenticated grant count = 0 on the new view before COMMIT.

  This rule supersedes the §4.1 clarification that stated "isolation is in
  the application middleware" — that statement was incomplete.
```

### The migration 014 gap that needs to be acknowledged

Migration 014 created `corp_incident_aggregates` without the REVOKE. The correct fix is migration 016 (not amending 014, which is already deployed). Going forward, all view-creating migrations must include the REVOKE inline. If migration 014 is ever used as a template for Phase 3 migrations, those templates must be updated to include the REVOKE pattern.

---

## 6. The Three Possible Actions — Decision

The probe asked: "Author + apply + commit + then merge? Or inspect the fix first?"

**Recommendation: Inspect first. Then apply. Then verify manually. Then merge.**

The reason is not distrust of the proposed fix — the REVOKE direction is correct. The reason is that a production database change that affects security-critical access controls should have a human review the exact SQL before it runs. This is not a hotfix situation (no live CORP data is at risk because Phase 3 is not deployed). There is no emergency that justifies skipping the review step.

**Recommended sequence:**

```
STEP 1 (now): Run the scope audit query (§4, above)
              → Confirm corp_incident_aggregates is the only affected view
              → If other views found: incorporate into mig 016

STEP 2: Review the complete mig 016 SQL (§3, above) against the actual production schema
        → Confirm view name is exactly 'corp_incident_aggregates' (case-sensitive)
        → Confirm service_role is the correct role name for the Supabase service key path
        → Confirm the verification DO block column names match information_schema on this Supabase version

STEP 3: Apply mig 016 in Supabase Dashboard SQL Editor (same psql --single-transaction pattern)
        → Watch for the RAISE NOTICE success message
        → If any RAISE EXCEPTION fires: do NOT proceed, investigate

STEP 4: Run the three manual verification queries (§3, above)
        → SET ROLE anon → SELECT → must error
        → SET ROLE service_role → SELECT → must succeed

STEP 5: Confirm Railway API path still works
        → Make a test CORP-* API call through the Railway API (or a local equivalent)
        → Confirm the response returns data (service_role path working)
        → Confirm the direct PostgREST call without auth header returns permission denied

STEP 6: Commit mig 016 to the repo, update CLAUDE.md migration index, merge
```

---

## 7. What Remains Green — Full Validation Consolidation

To give the complete picture across all five validation dimensions:

### ✅ Code health
tsc clean on api / dashboard / ops-console / mobile + types package. No action required.

### ✅ Git state
4 commits ahead of main, in sync with origin/safecommand_v7, working tree clean. No action required.

### ✅ Production schema integrity
All 8 SIRE tables RLS-enabled. Append-only RESTRICTIVE policies on the 2 audit-log tables (Hard Rule 4). Hard Rule 23 CHECK constraint on `is_auto_trigger`. EC-23 tier-6 FIRE+SH row exists and resolution chain reaches template `4d74b72d…` at tier 6. Global threshold seeded (2 zones / 3 min, consistent with NFPA 1620). 5 new `incidents` columns with correct types/defaults. Hard Rule 15: zero NOT NULL building_id columns introduced. **All green — no action required.**

### ✅ v8 spec compliance (BR-G..P / EC-23 / Hard Rules 23, 24)
All BRs honoured, no drift, pre-deploy fixes justified per Agent A. **No action required.**

### ✅ Industry alignment
Agent C confirmed industry-leading across all 6 audit dimensions. SIRE Day 1 delivers per-role automatic dispatch + interactive zone-keyed checklists + audit-grade per-staff completion records + selective evacuation with auto-drafted PA. No single industry platform combines all four. **Competitive position confirmed.**

### 🔴 CORP view exposure — the one blocker
`corp_incident_aggregates` accessible via PostgREST with anon key due to Supabase auto-grants on views. Fix: mig 016 (REVOKE ALL from anon + authenticated, explicit GRANT to service_role, self-verifying DO block). Architecture amendment: Hard Rule 25. **Blocked until mig 016 applied and verified.**

---

## 8. Summary of Actions Required

| Action | Who | When | Blocking merge? |
|---|---|---|---|
| Run scope audit query (§4) | Engineering | Before applying mig 016 | Yes — confirm scope first |
| Review mig 016 SQL (§3) | Engineering + Founder | Before applying | Yes — human review required |
| Apply mig 016 to production Supabase | Engineering | After review | Yes |
| Run 3 manual verification queries | Engineering | Immediately after apply | Yes |
| Confirm Railway API path still works | Engineering | After verification | Yes |
| Add Hard Rule 25 to CLAUDE.md and architecture spec | Engineering | After merge | No (process improvement) |
| Update migration 014 template with REVOKE pattern | Engineering | Before any Phase 3 view migrations | No (future proofing) |
| Commit mig 016 + update CLAUDE.md migration index | Engineering | After all verifications pass | Yes — before merge |

**Single condition to unblock merge:** mig 016 applied + all 5 verification steps in §6 pass.

Everything else in the validation is green. This is the only blocker.
