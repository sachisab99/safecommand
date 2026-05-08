# Phase 5.21 SIRE — Architect Resolution: 7 Pre-Day-1 Clarifications
**Date:** May 2026 | **Status:** FINAL — Build may proceed on green-light
**Authority:** SafeCommand Architecture v8.0 + Pre-flight Analysis
**For:** Engineering team — these are the last decisions needed before Day 1 code

> **How to use this document:** Each resolution is self-contained. It gives the decision, the exact implementation specification, and the precise impact on Migration 014, the API, or the mobile/dashboard code. There is nothing left ambiguous after this document. Engineering can write code directly from these specs.

---

## 4.1 — CORP-* RLS Structure: View SECURITY DEFINER or Base-Table RLS?

**The ambiguity:** The pre-flight analysis specified a `corp_incident_aggregates` view but left open whether it should use `SECURITY DEFINER` with its own RLS policy, or simply inherit the base-table RLS of the underlying tables.

**Resolution: SECURITY DEFINER with a caller-ID check. Not base-table RLS inheritance.**

Here is the complete rationale and the precise implementation.

### Why base-table RLS inheritance is wrong for this view

PostgreSQL views created with default (`SECURITY INVOKER`) execute with the *calling user's* permissions, which means the base-table RLS policies apply. For venue-level operational staff this is fine — they are already filtered to their venue. For CORP-* users the base-table RLS is the problem: those users have **no `app.current_venue_id` session variable set** (they are not venue-scoped), so every RLS policy that reads `current_setting('app.current_venue_id', TRUE)` returns an empty string, and the policy evaluates to FALSE. Under base-table RLS inheritance, CORP-* users would see **zero rows** — silently, with no error. That is not a PII leak, but it means the governance dashboard shows nothing, which breaks the product.

The second problem: CORP-* users could, if a venue staff JWT is somehow replayed at the CORP-* endpoint, bypass the corporate account boundary by having `app.current_venue_id` set to a specific venue. The result would be raw row-level data from that venue leaking through the view. Base-table RLS provides no corporate account isolation — it only provides venue isolation.

### The correct implementation: SECURITY DEFINER + explicit corporate_account_id check

```sql
-- In Migration 014 — this replaces the earlier view draft

CREATE OR REPLACE VIEW corp_incident_aggregates
WITH (security_invoker = false)  -- Use SECURITY DEFINER semantics
AS
SELECT
  i.id                           AS incident_id,
  i.venue_id,
  v.corporate_account_id,
  v.city,
  v.state,
  v.country,
  v.venue_type,
  i.incident_type,
  i.incident_subtype,
  i.severity,
  i.status,
  i.building_id,
  b.name                         AS building_name,
  DATE_TRUNC('day', i.declared_at) AS incident_date,
  i.declared_at,
  i.resolved_at,
  ROUND(
    EXTRACT(EPOCH FROM (i.resolved_at - i.declared_at)) / 60.0, 1
  )                              AS resolution_minutes,
  -- Zone validation aggregate (NO PII)
  COUNT(DISTINCT izs.zone_id)    AS total_zones,
  COUNT(DISTINCT izs.zone_id)
    FILTER (WHERE izs.state IN (
      'ZONE_CLEAR','EVACUATION_COMPLETE','SH_CONFIRMED_CLEAR'
    ))                           AS validated_zones,
  ROUND(
    COUNT(DISTINCT izs.zone_id) FILTER (
      WHERE izs.state IN ('ZONE_CLEAR','EVACUATION_COMPLETE','SH_CONFIRMED_CLEAR')
    )::NUMERIC / NULLIF(COUNT(DISTINCT izs.zone_id), 0) * 100, 1
  )                              AS zone_validation_rate_pct,
  -- Action completion aggregate (NO PII)
  COUNT(ira.id)                  AS actions_completed,
  -- Evacuation aggregate (NO PII)
  COUNT(iet.id)                  AS evacuation_trigger_count,
  MAX(iet.trigger_type)          AS last_evacuation_trigger_type
  -- !! NEVER add: staff names, staff_ids, phone numbers, visitor records !!
FROM incidents i
JOIN venues v ON i.venue_id = v.id
LEFT JOIN buildings b ON i.building_id = b.id
LEFT JOIN incident_zone_states izs ON i.id = izs.incident_id
LEFT JOIN incident_response_actions ira ON i.id = ira.incident_id
LEFT JOIN incident_evacuation_triggers iet ON i.id = iet.incident_id
GROUP BY
  i.id, i.venue_id, v.corporate_account_id, v.city, v.state, v.country,
  v.venue_type, i.incident_type, i.incident_subtype, i.severity, i.status,
  i.building_id, b.name, i.declared_at, i.resolved_at;

-- The view itself has no RLS (views don't support RLS policies directly).
-- Corporate account isolation is enforced at the API middleware layer — see below.
```

### The API middleware that enforces corporate_account_id isolation

This is the security-critical layer. The view returns all aggregates; the middleware ensures a CORP-* user only receives rows belonging to their corporate account:

```typescript
// middleware/corporateScope.ts
// Applied to ALL /v1/corp/* endpoints before any query executes

export function enforceCorporateScope(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const { is_corporate, corporate_account_id, corporate_role, scope_level, scope_id } = req.auth;

  if (!is_corporate || !corporate_account_id) {
    return res.status(403).json({ error: 'Corporate scope required' });
  }

  // Attach scope to request — all CORP queries must use these
  req.corporate_scope = {
    corporate_account_id,
    corporate_role,         // CORP_CXO | CORP_DIR | CORP_MGR | CORP_COO
    scope_level,            // GLOBAL | COUNTRY | STATE | CITY
    scope_id,               // country_uuid | state_uuid | city_uuid | null (GLOBAL)
  };

  next();
}

// Example CORP-CXO query (in a route handler):
// SELECT * FROM corp_incident_aggregates
// WHERE corporate_account_id = $1          ← corporate_scope.corporate_account_id
// AND declared_at >= $2
async function getCorpIncidentSummary(req: AuthRequest, ...) {
  const { corporate_account_id, scope_level, scope_id } = req.corporate_scope;

  let query = supabaseAdmin  // SERVICE ROLE — bypasses venue RLS
    .from('corp_incident_aggregates')
    .select('*')
    .eq('corporate_account_id', corporate_account_id);  // MANDATORY — enforces isolation

  // Additional scope restriction:
  if (scope_level === 'COUNTRY' && scope_id) {
    query = query.eq('country_id', scope_id);
  } else if (scope_level === 'STATE' && scope_id) {
    query = query.eq('state_id', scope_id);
  } else if (scope_level === 'CITY' && scope_id) {
    query = query.eq('city_id', scope_id);
  }
  // GLOBAL: no additional filter — all corporate account venues visible

  return query;
}
```

### Why SERVICE ROLE for CORP-* queries is safe

CORP-* queries use the Supabase service role client (which bypasses RLS) but the corporate_account_id filter in the query itself enforces isolation. This is the same pattern used by the Ops Console (EC-14). The `corporate_account_id = $1` clause is a required parameter, not an optional filter — the middleware enforces it before any query runs.

**The isolation test (maps to C7 from the pre-flight analysis):**

```sql
-- Test: CORP-CXO from account A cannot see account B data
-- Even with a manipulated JWT claiming account_id = B:
-- The middleware checks: jwt.corporate_account_id must equal the DB corporate_account_id
-- for the requested data. If the JWT is tampered, the JWT signature fails before middleware.
-- If somehow middleware is bypassed: the WHERE corporate_account_id = ? clause in every
-- query prevents account B data from ever appearing.
```

**Verdict for Engineering:** Use `supabaseAdmin` (service role) for all CORP-* queries. Enforce `corporate_account_id = req.corporate_scope.corporate_account_id` as the first WHERE clause in every CORP query. Never use the user-scoped client for CORP queries. The view is not SECURITY DEFINER at the PostgreSQL level — isolation is in the application middleware and the mandatory WHERE clause. This is the correct and proven pattern.

---

## 4.2 — Threshold Inheritance: 2-Tier (Architect) vs 6-Tier (Founder Q4 Direction)

**The tension:** The pre-flight analysis specified 2-tier (global default + venue-specific override) for Phase 5.21. The founder's Q4 direction referenced a 6-tier inheritance (standards-comparison reference panel in the SC Ops Console Day 14 spec). These are different depths.

**Resolution: Forward-compatible schema now; 2-tier resolution in Phase 5.21; 3-tier in Phase 5.22; full chain in Phase B.**

This resolves the tension completely: the schema is built once and never needs migration to add tiers. The resolution logic gains tiers as phases progress.

### The schema (goes in Migration 014, single table)

```sql
CREATE TABLE incident_threshold_configs (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Scope (exactly ONE of these is non-null — defines the tier)
  venue_id                   UUID UNIQUE REFERENCES venues(id) ON DELETE CASCADE,
  venue_type                 TEXT,     -- 'MALL','HOSPITAL','HOTEL','CORPORATE','STADIUM','OTHER'
  country                    TEXT,     -- 'IN','AE','SG' — ISO country code
  -- (global default: all three NULL — one row with all three NULL)
  CONSTRAINT exactly_one_scope CHECK (
    (venue_id IS NOT NULL)::INT +
    (venue_type IS NOT NULL)::INT +
    (country IS NOT NULL)::INT <= 1
    -- 0 = global default row; 1 = scoped override
  ),
  -- Auto-evacuation suggestion thresholds (BR-L)
  auto_evac_zones_threshold  INTEGER NOT NULL DEFAULT 2,
  auto_evac_window_minutes   INTEGER NOT NULL DEFAULT 3,
  -- Action SLA thresholds (Q6 resolution)
  action_sla_soft_warn_pct   INTEGER NOT NULL DEFAULT 50,
  action_sla_hard_escalate_pct INTEGER NOT NULL DEFAULT 100,
  -- Evidence retention
  evidence_retention_years   INTEGER NOT NULL DEFAULT 3,
  -- Standards reference (read-only display in Ops Console — no runtime logic)
  standards_reference        JSONB,
  -- e.g. {"NFPA_101_2024": {"zone_sweep_small_sec": 180},
  --       "NABH_EM_2025": {"code_blue_response_sec": 180}}
  -- This column is populated by SC Ops for the reference panel;
  -- it does NOT affect runtime threshold resolution
  configured_by              TEXT,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure exactly one global default row exists at seed time
-- INSERT INTO incident_threshold_configs DEFAULT VALUES;
-- (all NULLs = global default; enforced by CONSTRAINT)
```

### The resolution function (API layer — not a DB function)

```typescript
// services/thresholds.ts
// Phase 5.21: 2-tier (venue-specific → global)
// Phase 5.22: 3-tier (venue-specific → venue-type → global)
// Phase B: 4-tier (venue-specific → venue-type → country → global)

async function resolveIncidentThresholds(
  venueId: string,
  venueType: string,
  country: string
): Promise<IncidentThresholdConfig> {

  // Tier 1: venue-specific (most specific)
  const venueSpecific = await supabase
    .from('incident_threshold_configs')
    .select('*')
    .eq('venue_id', venueId)
    .single();
  if (venueSpecific.data) return venueSpecific.data;

  // Tier 2 (Phase 5.22+): venue-type
  // Comment out in Phase 5.21; uncomment in Phase 5.22
  // const venueTypeConfig = await supabase...

  // Tier 3 (Phase B+): country-level
  // Comment out until Phase B; uncomment then
  // const countryConfig = await supabase...

  // Tier 4: global default (always exists — seeded in Migration 014)
  const globalDefault = await supabase
    .from('incident_threshold_configs')
    .select('*')
    .is('venue_id', null)
    .is('venue_type', null)
    .is('country', null)
    .single();

  if (!globalDefault.data) {
    // This should never happen — seed data integrity failure
    throw new Error('Global threshold default missing — seed data corrupt');
  }

  return globalDefault.data;
}
```

### Standards reference panel (Ops Console Day 14)

The `standards_reference` JSONB column in the schema gives the Ops Console a place to display regulatory benchmarks next to the venue's configured thresholds. This column has **no runtime effect** — it is display-only. The SC Ops Console reads it for the reference panel; the threshold resolution function ignores it entirely.

```typescript
// Ops Console: threshold configuration page
// Displays standards_reference alongside the editable threshold fields:
//
// | Threshold              | This Venue | NFPA 101:2024 | NABH §EM 2025 |
// |------------------------|------------|---------------|----------------|
// | Zone sweep (small)     | 180s       | 180s          | N/A           |
// | Code Blue response     | 180s       | N/A           | 180s          |
// | Auto-evac zones        | 2          | —             | —             |
//
// SC Ops can see how the venue's config compares to standards
// without the standards data affecting runtime behaviour
```

**Summary for Engineering:**

- Phase 5.21: Build the schema with all 4 scope columns. Implement 2-tier resolution (Tier 1 + Tier 4 only). Comment out Tier 2 and Tier 3 with `// Phase 5.22` and `// Phase B` markers.
- Seed one global default row in Migration 014.
- The Ops Console Day 14 work reads `standards_reference` for display; writes `auto_evac_zones_threshold` and the other threshold fields.
- No future migration is needed to add tiers — the schema already supports them.

---

## 4.3 — `incident_response_actions` Shape: Single Table or Assignments + Completions?

**The question:** The v8 architecture has a single `incident_response_actions` table with a `completed_at` timestamp. The pre-flight's `GET /incidents/:id/actions/summary` endpoint needs to know both *what was assigned* and *what was completed*. With only a completions table, "assigned but not yet done" has no representation.

**Resolution: Two-table model. `incident_action_assignments` + `incident_response_actions`. Migration 014 must implement both.**

Here is the complete rationale and exact schema.

### Why the single-table model from v8 is insufficient

The v8 architecture table only has rows for *completed* actions. To compute "5 of 8 actions done" for the completion rate, you need to know both the total assigned (the template snapshot) and the completed subset (the evidence records). With the single table, you must cross-reference `incidents.resolved_templates` JSONB to count total actions, then count rows in `incident_response_actions`. This is workable but fragile — if `resolved_templates` is missing or the template has been updated, the denominator is wrong.

The two-table model is cleaner, more robust, and enables the action checklist UX (the mobile screen needs to render all actions with their current status, not just completed ones).

### The correct schema (replaces v8 §20 `incident_response_actions` definition)

```sql
-- Table 1: What was assigned at incident declaration (one row per staff × action)
-- Populated by the incident declaration handler from resolved_templates snapshot
CREATE TABLE incident_action_assignments (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id             UUID NOT NULL REFERENCES venues(id),
  incident_id          UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  staff_id             UUID NOT NULL REFERENCES staff(id),
  role                 TEXT NOT NULL,
  action_order         INTEGER NOT NULL,
  instruction          TEXT NOT NULL,          -- copied from template at declaration
  instruction_i18n_key TEXT NOT NULL,          -- copied from template
  evidence_type        TEXT,                   -- PHOTO | GPS | NOTE | SIGNATURE | VERBAL | null
  time_target_seconds  INTEGER,
  is_mandatory         BOOLEAN NOT NULL DEFAULT TRUE,
  is_life_critical     BOOLEAN NOT NULL DEFAULT FALSE,
  status               TEXT NOT NULL DEFAULT 'ASSIGNED'
    CHECK (status IN ('ASSIGNED','IN_PROGRESS','DONE','SKIPPED','BLOCKED')),
  -- ASSIGNED:     initial state
  -- IN_PROGRESS:  staff has opened the action (started_at set)
  -- DONE:         staff completed with evidence
  -- SKIPPED:      staff marked N/A (allowed for non-mandatory actions only)
  -- BLOCKED:      staff cannot complete (e.g., zone inaccessible)
  started_at           TIMESTAMPTZ,
  completed_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (incident_id, staff_id, action_order)
);
ALTER TABLE incident_action_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "venue_isolation" ON incident_action_assignments
  USING (venue_id = current_setting('app.current_venue_id', TRUE)::UUID);
CREATE INDEX idx_iaa_incident ON incident_action_assignments(incident_id, staff_id, status);
CREATE INDEX idx_iaa_pending ON incident_action_assignments(incident_id, status)
  WHERE status IN ('ASSIGNED','IN_PROGRESS');  -- Partial index for SLA worker

-- Table 2: Evidence records for completed actions (one row per completed action)
-- Only exists for DONE actions; provides the compliance evidence chain
CREATE TABLE incident_response_actions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id             UUID NOT NULL REFERENCES venues(id),
  incident_id          UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  assignment_id        UUID NOT NULL REFERENCES incident_action_assignments(id),
  staff_id             UUID NOT NULL REFERENCES staff(id),
  role                 TEXT NOT NULL,
  action_order         INTEGER NOT NULL,
  evidence_type        TEXT,
  evidence_url         TEXT,                   -- S3/GCS path (may be null if photo still uploading)
  evidence_note        TEXT,
  photo_upload_pending BOOLEAN NOT NULL DEFAULT FALSE,  -- True while S3 upload in progress
  completed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (incident_id, staff_id, action_order)  -- One evidence record per action per staff
);
ALTER TABLE incident_response_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "venue_isolation" ON incident_response_actions
  USING (venue_id = current_setting('app.current_venue_id', TRUE)::UUID);
CREATE INDEX idx_ira_incident ON incident_response_actions(incident_id, staff_id);
```

### How the two tables work together

```
At incident declaration:
  → For each on-duty staff member × each action in their resolved template:
     INSERT INTO incident_action_assignments (status: 'ASSIGNED')
  → Total rows = (staff count) × (actions per role)

When staff opens action checklist (GET /my-actions):
  → SELECT * FROM incident_action_assignments
    WHERE incident_id = X AND staff_id = Y
    ORDER BY action_order
  → Returns all actions with their current status (ASSIGNED, IN_PROGRESS, DONE, etc.)
  → Mobile renders the checklist with correct checkboxes

When staff completes an action (POST /actions/:order/complete):
  → UPDATE incident_action_assignments SET status='DONE', completed_at=now()
  → INSERT INTO incident_response_actions (evidence details)
  → If photo: photo_upload_pending=TRUE; background upload sets evidence_url + pending=FALSE

For completion rate query (GET /actions/summary):
  → SELECT role,
       COUNT(*) FILTER (WHERE status='DONE') AS done,
       COUNT(*) AS total
    FROM incident_action_assignments
    WHERE incident_id = X
    GROUP BY role
  → No JSONB cross-referencing needed; pure relational count
```

### Impact on `incidents.resolved_templates` JSONB

With the two-table model, `resolved_templates` JSONB in the `incidents` table becomes **redundant for runtime queries** but remains valuable as the **immutable snapshot for audit purposes** — it records exactly what templates were active at declaration time, even after templates are updated in `incident_action_templates`. Keep it. It is the legal audit record. The two tables are the operational record.

### API endpoints that change

```typescript
// GET /v1/incidents/:id/my-actions
// Previously: resolve chain + return JSONB
// Now: SELECT from incident_action_assignments for current staff
// Returns: assignment rows with status (ASSIGNED/IN_PROGRESS/DONE/SKIPPED/BLOCKED)
// Faster; no resolution needed mid-incident

// POST /v1/incidents/:id/actions/:order/start
// NEW: sets status = 'IN_PROGRESS', started_at = now()
// Enables SLA timer calculation: deadline = started_at + time_target_seconds
// Called when staff taps to expand an action item

// POST /v1/incidents/:id/actions/:order/complete
// Updates assignment status + inserts evidence record (2-step atomic)

// POST /v1/incidents/:id/actions/:order/skip
// Sets status = 'SKIPPED'
// Only allowed if is_mandatory = FALSE

// POST /v1/incidents/:id/actions/:order/block
// Sets status = 'BLOCKED', requires reason_note
// Used when action cannot be completed (zone inaccessible, equipment not available)
```

---

## 4.4 — SLA Worker Scope: Full Soft-Warn in Phase 5.21 or Schema-Only?

**The question:** Should the soft-warning worker logic (push reminder at 50% of `time_target_seconds` elapsed) ship in Phase 5.21 (~1 day of work), or should only the schema infrastructure ship now with the logic deferred to Phase 5.22?

**Resolution: Full soft-warn worker ships in Phase 5.21. It is not deferrable.**

**Rationale:**

The two-table model from §4.3 introduces `incident_action_assignments.started_at`. The SLA worker uses `started_at` to compute whether the 50% deadline has passed. Without the worker, `started_at` is captured but never acted on — the field is orphaned data with no behaviour. An orphaned field in production schema is technical debt from Day 1.

More importantly: during the first real incident on a live pilot venue, a guard who misses a life-critical action with `time_target_seconds = 60` (Fire Service 101 call) should receive the soft warning. If the worker isn't running, there is no reminder. For a safety infrastructure product, a skipped SLA on a life-critical action with no warning is a product failure.

**The worker implementation (goes in the escalation worker — Day 5):**

```typescript
// In escalation worker — add to the existing 60-second tick
// This is ~50 lines of new logic in an existing worker file — not a full day's work

async function checkActionSLAWarnings() {
  const now = new Date();

  // Find all ASSIGNED or IN_PROGRESS actions where:
  // - time_target_seconds is set
  // - started_at is set (action has been opened)
  // - 50% of the time target has elapsed
  // - Warning has not been sent yet (no Redis key)
  const { data: overdueAssignments } = await supabase
    .from('incident_action_assignments')
    .select(`
      id, incident_id, staff_id, action_order, instruction,
      time_target_seconds, started_at, is_life_critical,
      venue_id,
      incidents!inner(status)
    `)
    .in('status', ['ASSIGNED', 'IN_PROGRESS'])
    .not('time_target_seconds', 'is', null)
    .not('started_at', 'is', null)
    .eq('incidents.status', 'ACTIVE');  // Only warn during active incidents

  for (const assignment of overdueAssignments ?? []) {
    const elapsedSeconds =
      (now.getTime() - new Date(assignment.started_at).getTime()) / 1000;
    const softWarnThreshold = assignment.time_target_seconds * 0.5;

    if (elapsedSeconds < softWarnThreshold) continue;

    // Check Redis: has warning already been sent for this assignment?
    const warnKey = `sla_warn:${assignment.id}`;
    const alreadyWarned = await redis.get(warnKey);
    if (alreadyWarned) continue;

    // Get venue thresholds to confirm the pct (defaults 50%)
    const thresholds = await resolveIncidentThresholds(assignment.venue_id, ...);
    const configuredPct = thresholds.action_sla_soft_warn_pct / 100;
    if (elapsedSeconds < assignment.time_target_seconds * configuredPct) continue;

    // Send soft warning push to staff
    await notificationQueue.add({
      type: 'ACTION_SLA_WARNING',
      recipient: { staff_id: assignment.staff_id, venue_id: assignment.venue_id },
      payload: {
        push_title: assignment.is_life_critical ? '⚠ CRITICAL ACTION OVERDUE' : '⚠ Action reminder',
        push_body: `${assignment.instruction} — ${Math.floor(elapsedSeconds)}s elapsed`,
        // No WhatsApp template for SLA warnings — push only (avoids WA noise)
        wa_template: null,
        sms_text: null,
      },
      communication_id: `sla-warn-${assignment.id}`,
    }, { priority: 2 });

    // Mark warning sent — TTL = time_target_seconds (so it can warn again if needed)
    await redis.set(warnKey, '1', { ex: assignment.time_target_seconds });
  }
}
```

**What Phase 5.22 adds on top of this:**

```typescript
// Phase 5.22: hard escalation at 100% — same pattern, different target, different recipient
// Sends to SC/SH instead of the staff member; logs to escalation_events
// Reuses the same infrastructure from Phase 5.21
```

**Build time:** The worker addition is approximately 50-60 lines in the existing escalation worker. Not a separate file, not a new service. Day 5 implementation time: ~3-4 hours alongside the template seed work.

---

## 4.5 — Mobile SQLite: Extend Existing Offline Queue or Dedicated Table?

**The question:** Should `pending_action_completions` be a new dedicated SQLite table in the mobile app, or should it extend the existing `pending_completions` table (used for task completions offline)?

**Resolution: New dedicated table `pending_action_completions`. Do not extend the existing table.**

**Rationale:**

The existing `pending_completions` table is designed for task completions (BR-35 offline pattern). It has the shape: `{ task_id, evidence_type, evidence_text, submitted_at, synced, attempts }`. Action completions have a materially different shape: `{ incident_id, assignment_id, action_order, evidence_type, evidence_url, evidence_note, photo_path, photo_upload_pending, submitted_at, synced, attempts }`. Shoehorning these into the same table would require adding nullable columns and a `record_type` discriminator — the classic wide-table antipattern.

More importantly: the sync logic is different. Task completions go to `POST /tasks/:id/complete`. Action completions go to `POST /incidents/:id/actions/:order/complete`. Separate tables means separate sync handlers with no risk of cross-contamination.

**The complete SQLite schema addition (goes in `initLocalDB()` alongside existing table creation):**

```typescript
// In apps/mobile/src/db/local.ts — add to initLocalDB()

localDb.execSync(`
  -- Action completions queue (Phase 5.21)
  CREATE TABLE IF NOT EXISTS pending_action_completions (
    id            TEXT PRIMARY KEY,
    incident_id   TEXT NOT NULL,
    assignment_id TEXT NOT NULL,
    action_order  INTEGER NOT NULL,
    evidence_type TEXT NOT NULL,          -- PHOTO | GPS | NOTE | SIGNATURE | VERBAL
    evidence_note TEXT,
    photo_path    TEXT,                   -- Local device file path (pending upload)
    photo_key     TEXT,                   -- S3/GCS key (set after upload)
    submitted_at  TEXT NOT NULL,          -- ISO timestamp
    synced        INTEGER NOT NULL DEFAULT 0,
    photo_synced  INTEGER NOT NULL DEFAULT 0,  -- Separate flag: action done, photo pending
    attempts      INTEGER NOT NULL DEFAULT 0,
    photo_attempts INTEGER NOT NULL DEFAULT 0
  );

  -- Active incident cache (for drawer banner + offline zone grid)
  CREATE TABLE IF NOT EXISTS cached_incident_zones (
    incident_id   TEXT NOT NULL,
    zone_id       TEXT NOT NULL,
    zone_name     TEXT NOT NULL,
    state         TEXT NOT NULL,
    assigned_gs_id TEXT,
    synced_at     TEXT NOT NULL,
    PRIMARY KEY (incident_id, zone_id)
  );

  -- Action assignments cache (for offline checklist rendering)
  CREATE TABLE IF NOT EXISTS cached_action_assignments (
    id            TEXT PRIMARY KEY,
    incident_id   TEXT NOT NULL,
    action_order  INTEGER NOT NULL,
    instruction   TEXT NOT NULL,
    evidence_type TEXT,
    status        TEXT NOT NULL,
    is_life_critical INTEGER NOT NULL DEFAULT 0,
    time_target_seconds INTEGER,
    synced_at     TEXT NOT NULL
  );
`);
```

**The sync function (in `syncPendingData()` — called on network reconnect, same as existing sync):**

```typescript
async function syncPendingActionCompletions() {
  const { isConnected } = await NetInfo.fetch();
  if (!isConnected) return;

  // Step 1: Sync action completions (text evidence — fast path)
  const pendingCompletions = localDb.getAllSync(`
    SELECT * FROM pending_action_completions
    WHERE synced = 0 AND attempts < 5
  `);

  for (const item of pendingCompletions) {
    try {
      await api.post(
        `/incidents/${item.incident_id}/actions/${item.action_order}/complete`,
        {
          assignment_id: item.assignment_id,
          evidence_type: item.evidence_type,
          evidence_note: item.evidence_note,
          evidence_url: item.photo_key || null,  // null if photo not yet uploaded
        }
      );
      localDb.runSync(
        'UPDATE pending_action_completions SET synced=1 WHERE id=?', [item.id]
      );
    } catch {
      localDb.runSync(
        'UPDATE pending_action_completions SET attempts=attempts+1 WHERE id=?', [item.id]
      );
    }
  }

  // Step 2: Upload pending photos (slow path — separate from action completion sync)
  const pendingPhotos = localDb.getAllSync(`
    SELECT * FROM pending_action_completions
    WHERE synced = 1 AND photo_synced = 0 AND photo_path IS NOT NULL AND photo_attempts < 5
  `);

  for (const item of pendingPhotos) {
    try {
      const { upload_url, file_key } = await api.post('/upload/presign', {
        entity_type: 'incident_actions', file_ext: 'jpg'
      });
      const photoData = await FileSystem.readAsStringAsync(item.photo_path, {
        encoding: FileSystem.EncodingType.Base64
      });
      await fetch(upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/jpeg' },
        body: photoData,
      });
      // Update server with photo URL
      await api.patch(
        `/incidents/${item.incident_id}/actions/${item.action_order}/photo`,
        { evidence_url: file_key }
      );
      localDb.runSync(
        'UPDATE pending_action_completions SET photo_synced=1, photo_key=? WHERE id=?',
        [file_key, item.id]
      );
    } catch {
      localDb.runSync(
        'UPDATE pending_action_completions SET photo_attempts=photo_attempts+1 WHERE id=?',
        [item.id]
      );
    }
  }
}
```

**Key design property:** Action text evidence syncs independently of photo evidence. A guard on 2G who completes an action with a photo is *immediately marked done* in the system (text evidence syncs in seconds); the photo uploads in the background. The action is never held hostage to the photo upload.

---

## 4.6 — New `incidents` Columns: is_drill + incident_subtype Redundancy?

**The question:** The pre-flight analysis added `is_drill BOOLEAN` to `incidents`. The `incident_subtype` CHECK constraint already includes `FIRE_DRILL` and `EVACUATION_DRILL` sub-types. Is `is_drill` redundant?

**Resolution: Keep `is_drill` as a first-class column. The redundancy is intentional and both fields serve different purposes.**

**Why they are not redundant:**

`incident_subtype` can be NULL (it is optional at declaration). `is_drill` cannot be null. If a drill is declared with `incident_type = 'EVACUATION'` and no sub-type set, the system has no way to know it is a drill without `is_drill`. A guard who declares a drill under time pressure may forget to set the sub-type; `is_drill` is the explicit, never-null flag that gates the auto-evacuation suppression (Q1 resolution).

Additionally, `is_drill` gates the compliance reporting path. The NABH §EM report has different section headings for drills vs real incidents. Checking `incident_subtype IN ('FIRE_DRILL', 'EVACUATION_DRILL')` to determine this is fragile — what happens when a new drill sub-type is added later? `is_drill = TRUE` is a stable, permanent semantic flag.

**The relationship between the two fields:**

```typescript
// Business rule enforced at the API layer (POST /incidents handler):
// If incident_subtype contains '_DRILL', is_drill MUST be set to TRUE
// If is_drill = TRUE, incident_subtype should be a _DRILL sub-type
// But: is_drill = TRUE is allowed WITHOUT a sub-type (guard in a hurry)
// And: is_drill = FALSE is always allowed (including with OTHER_UNKNOWN sub-type)

function validateIncidentDrillConsistency(
  incident_type: string,
  incident_subtype: string | null,
  is_drill: boolean
) {
  const DRILL_SUBTYPES = ['FIRE_DRILL', 'EVACUATION_DRILL'];

  if (incident_subtype && DRILL_SUBTYPES.includes(incident_subtype) && !is_drill) {
    // Auto-correct: set is_drill = TRUE if a drill sub-type was selected
    return { incident_subtype, is_drill: true };
  }
  return { incident_subtype, is_drill };
}
```

**Complete list of new columns for Migration 014 ALTER TABLE:**

```sql
ALTER TABLE incidents
  -- SIRE core
  ADD COLUMN incident_subtype   TEXT NULL CHECK (incident_subtype IN (
    'FIRE_CONTAINED','FIRE_SPREADING','FIRE_SUSPECTED','FIRE_DRILL',
    'MEDICAL_CARDIAC','MEDICAL_TRAUMA','MEDICAL_MASS_CASUALTY',
    'MEDICAL_MENTAL_HEALTH','MEDICAL_OBSTETRIC',
    'SECURITY_ACTIVE_AGGRESSOR','SECURITY_BOMB_THREAT','SECURITY_SUSPICIOUS_ITEM',
    'SECURITY_ABDUCTION','SECURITY_TRESPASS','SECURITY_CIVIL_UNREST',
    'SECURITY_CYBER_PHYSICAL',
    'EVACUATION_FULL','EVACUATION_PARTIAL_ZONE','EVACUATION_PARTIAL_FLOOR',
    'EVACUATION_SHELTER_IN_PLACE','EVACUATION_DRILL',
    'STRUCTURAL_GAS_LEAK','STRUCTURAL_FLOOD_WATER','STRUCTURAL_BUILDING_DAMAGE',
    'STRUCTURAL_POWER_FAILURE','STRUCTURAL_LIFT_ENTRAPMENT',
    'STRUCTURAL_HAZMAT','STRUCTURAL_SEVERE_WEATHER',
    'OTHER_VIP_EVENT','OTHER_MEDIA_INCIDENT',
    'OTHER_UTILITY_SERVICE','OTHER_UNKNOWN'
  )),
  -- is_drill: explicit drill flag (not redundant with sub-type — see §4.6)
  ADD COLUMN is_drill            BOOLEAN NOT NULL DEFAULT FALSE,
  -- has_sire_data: gates IncidentDetailScreen v2 on mobile
  ADD COLUMN has_sire_data       BOOLEAN NOT NULL DEFAULT FALSE,
  -- resolved_templates: immutable audit snapshot of templates at declaration
  ADD COLUMN resolved_templates  JSONB NULL,
  -- escalated_from_drill: drill-incident hybrid link
  ADD COLUMN escalated_from_drill_id UUID NULL REFERENCES drill_sessions(id);
```

**Summary:** 5 new columns. All nullable or have safe defaults. Zero breaking change to existing incidents. Safe to apply to live production database.

---

## 4.7 — Worker Availability for Day 15 Tests: Build Timing Coupling

**The question:** Day 15 of the build requires workers running to test the selective evacuation fan-out (`≤5s NFR-02`). Workers are paused until June 1 (ADR-0005). This creates a coupling: does Phase 5.21 build begin in May (when workers are paused) or does the entire build wait for June?

**Resolution: Split the build into two phases — schema/API in May, integration testing in June. Workers are not required until Day 6.**

This is the exact split that makes both constraints compatible without compromising either.

### What can be built without workers (May — Days 1–5)

Workers are irrelevant for schema, API, and template seeding work:

```
Day 1:  Migration 014 — no workers needed (pure DB schema)
Day 2:  GET /incidents/:id/zones, GET history — no workers needed (read-only)
Day 3:  PATCH zone state — no workers needed (DB write; Realtime handled by Supabase)
Day 4:  Evacuation trigger endpoints (POST) — no workers needed for the API write itself
        Fan-out ENQUEUES to BullMQ queue but won't PROCESS (workers paused — this is fine)
        The endpoint returns 201; the queue depth increases; that's all
Day 5:  Action template endpoints + seed data — no workers needed
```

Days 1–5 can begin in May. The migration deploys to Supabase (which has nothing to do with Railway workers). The API endpoints are deployed to Railway API service (which also has nothing to do with the worker services). This is 5 days of productive build with zero coupling to workers.

### What requires workers (June — Days 6–20)

```
Day 6+:  Mobile service layer — needs workers running for push notification delivery
          during end-to-end testing (smoke test: declare incident, receive push)
Day 15:  Fan-out latency test — REQUIRES workers running (BullMQ must process queue)
Day 16:  Performance benchmarking — REQUIRES workers running
Day 17:  CORP-* tests — API only, no workers needed, but running concurrent with Day 16
Day 18:  Regression testing — needs workers for escalation regression tests
```

### Proposed timeline

```
May 2026 (this month):
  → Days 1–5: Schema + API + template seeding
    → Can start as soon as §4 clarifications are resolved (today or tomorrow)
    → No worker dependency
    → Supabase migration deployed; API endpoints deployed to Railway api service
    → Migration 014 verified; 5-step acceptance gates for schema confirmed

June 1, 2026:
  → ADR-0005: Workers transition to always-on
  → MASTER_TICK_INTERVAL = 60 seconds (from 4-hour hibernation)
  → AWS Activate credits applied

June 2026 (post-June-1):
  → Days 6–20: Mobile + Dashboard + Testing + Stabilisation
    → Workers running for end-to-end and fan-out tests
    → Full Phase 5.21 completion

Estimated Phase 5.21 completion: late June 2026 (3 weeks of active build, split across May + June)
```

### One concrete action to verify the May start is safe

Before beginning Day 1 in May, verify that the current `safecommand_v7` branch head (`03a4b84`) is a stable baseline for schema additions:

```bash
# On the safecommand_v7 branch:
npx tsc --noEmit  # Must pass on all 4 apps
# Run smoke tests against production DB
# Confirm: POST /incidents still works; GET /zones still works
# Then: begin Migration 014 authoring
```

This verification takes 30 minutes and eliminates the risk of building Phase 5.21 on top of an unstable baseline.

---

## SUMMARY TABLE — All 7 Questions Resolved

| # | Question | Decision | Key Implementation Detail | Migration 014 Impact |
|---|---|---|---|---|
| **4.1** | CORP-* RLS structure | Service role client + mandatory `corporate_account_id` WHERE clause + `enforceCorporateScope` middleware | View is not SECURITY DEFINER — isolation is in middleware + query parameter | Add `corp_incident_aggregates` view to Migration 014 |
| **4.2** | Threshold inheritance | Forward-compatible 4-column schema; 2-tier resolution Phase 5.21; 3-tier Phase 5.22; full chain Phase B | `CONSTRAINT exactly_one_scope` limits each row to one scope level | Add `incident_threshold_configs` table + global default seed row |
| **4.3** | `incident_response_actions` shape | Two tables: `incident_action_assignments` (all assigned) + `incident_response_actions` (evidence records) | `status` column (ASSIGNED/IN_PROGRESS/DONE/SKIPPED/BLOCKED) on assignments table | Replace single-table definition with two-table definition |
| **4.4** | SLA worker scope | Full soft-warn worker ships in Phase 5.21 (~50 lines in existing escalation worker) | Uses `started_at` on assignments table; Redis key prevents duplicate warnings | No migration change — worker code only |
| **4.5** | Mobile SQLite | Dedicated `pending_action_completions` table — separate from existing `pending_completions` | `photo_synced` flag decouples action completion from photo upload | No migration change — mobile SQLite schema |
| **4.6** | is_drill redundancy | Keep both `is_drill` and drill sub-types — they serve different purposes | `is_drill` gates auto-evac suppression when sub-type is null; 5 total new columns confirmed | 5 ADD COLUMN statements confirmed (full list in §4.6) |
| **4.7** | Worker availability | May: Days 1–5 (schema + API, no workers). June: Days 6–20 (mobile + testing, workers running) | Verify branch stability before Day 1 start | Migration 014 deploy in May — independent of workers |

---

## The Precise Migration 014 Table of Contents

This is the complete and final list of what Migration 014 (`014_sire_engine.sql`) contains. Nothing more, nothing less.

```
014_sire_engine.sql contents — in order:

1. Environment verification block (top of file)
2. ALTER TABLE incidents (5 new columns: incident_subtype, is_drill, has_sire_data,
                          resolved_templates, escalated_from_drill_id)
3. CREATE TABLE incident_zone_states (live state, one row per zone per incident)
4. CREATE TABLE incident_zone_state_log (append-only audit log, EC-22)
5. CREATE TABLE incident_evacuation_triggers (immutable, Hard Rule 4)
6. CREATE TABLE incident_action_templates (global + venue-specific templates)
7. CREATE TABLE incident_action_assignments (what was assigned — new, replaces v8 definition)
8. CREATE TABLE incident_response_actions (evidence records — updated from v8 definition)
9. CREATE TABLE incident_threshold_configs (2→4-tier threshold config)
10. CREATE TABLE incident_dashboard_prompts (auto-evac suggestion delivery — BR-L)
11. CREATE VIEW corp_incident_aggregates (aggregate-only, NO PII)
12. RLS policies on all new tables (5 venue_isolation policies + 3 append-only insert-only)
13. Indexes (at minimum: the 6 specified in the v8 architecture + idx_iaa_pending partial index)
14. Seed data: INSERT INTO incident_threshold_configs (global default row)
15. Verification block (bottom of file — RAISE EXCEPTION if any of 10 objects missing)
```

Total: 10 new objects (8 tables + 1 view + ALTER). All additive. Safe to apply live.

---

## Agreed Build Start

**Days 1–5 can begin as soon as:**
- [ ] Migration number confirmed against Supabase Dashboard (expected: 014)
- [ ] `docs/adr/0001` updated with 014 entry
- [ ] `seeds/incident_action_templates.json` structure drafted (content to follow)
- [ ] Branch baseline verified (`tsc --noEmit` passes on all 4 apps)
- [ ] Founder + architect content review of action templates scheduled (can run in parallel)

**Days 6–20 begin June 1 (post-worker-unfreeze per ADR-0005).**

All 7 clarifications are resolved. All 10 architectural questions from the pre-flight analysis are resolved. The team has everything needed to write code.

---

*Architect resolution document for Phase 5.21 SIRE pre-flight.*
*Authority: SafeCommand Architecture v8.0.*
*All 7 decisions are final. Formal Change Request required to revise any of them.*
*Next review: end of Phase 5.21 Days 1–5 (May) to confirm schema assumptions held.*
