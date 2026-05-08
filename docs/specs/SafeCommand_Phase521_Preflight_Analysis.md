# Phase 5.21 SIRE — Architect Analysis & Engineering Recommendations
## Pre-Flight Review Response
**Date:** May 2026 | **Authority:** SafeCommand Architecture v8 | **Status:** Ready for build (pending items §2)

> **Purpose of this document:** This is the architect's complete response to the Phase 5.21 implementation pre-flight. It resolves all 10 open architectural questions, validates and sharpens every risk mitigation, identifies discrepancies between the preflight and v8 architecture, and provides engineering clarity on every decision needed before code writing begins.
>
> **Read order:** §1 (critical blockers and discrepancies first) → §2 (architectural question resolutions) → §3 (risk analysis with enhanced mitigations) → §4 (sequence validation with concrete additions) → §5 (acceptance gate enhancements) → §6 (what engineers can and cannot defer).

---

## PART 1 — CRITICAL FINDINGS BEFORE BUILD BEGINS

### 1.1 Migration Number Conflict — Must Resolve Day 0

**The conflict:** The pre-flight names the SIRE migration `014_sire_engine.sql`. The v8 architecture document names it `011_incident_response_engine.sql`. These are not the same file.

**Why this matters:** The architecture document (v8 §20, Rule 24) is explicit: "Migration 011 must be applied before any Phase 5.21 code is deployed." If the team builds against `014`, Rule 24 will break, `CLAUDE.md` references will mismatch, and the migration index in `docs/adr/0001-migration-renumbering.md` will be inconsistent.

**Resolution — what to actually use:**

The pre-flight's numbering (`014`) is almost certainly correct for the *current state of the repo*, because migrations 011, 012, and 013 have already been applied during Phase 5 build work (the SESSION_LOG confirms 011_staff_lifecycle deployed). The architecture document's `011_incident_response_engine.sql` was written before the build produced those intermediate migrations and is now stale.

**Confirmed decision:**

```
Migration file name:  014_sire_engine.sql
Reference in CLAUDE.md and Rule 24: update to 014_sire_engine.sql
v8 Architecture §20 Rule 24: update at next version (v8.1) to read "014"
```

**Action before Day 1:** Verify the actual next migration number against Supabase Dashboard → Database → Migrations. Whatever number comes after the last applied migration is the correct one. Document it in `docs/adr/0001-migration-renumbering.md` as an amendment.

---

### 1.2 New Schema Elements in Pre-flight Not in v8 Architecture

The pre-flight introduces three schema elements not present in the v8 architecture. Each requires an explicit decision:

**A. `corp_incident_aggregates` view (Q6, Day 1)**

The v8 architecture handles CORP-* isolation through RLS policies on raw tables — governance users never touch raw data tables. The pre-flight proposes a dedicated aggregate *view* for CORP-* queries. This is a better implementation.

**Decision: Build the view.** Rationale:
- A view with aggregation logic codified in SQL is auditable, testable, and easier to verify than scattered RLS policies across multiple tables
- The 6 CORP-* visibility tests (§5) are much easier to write against a view than against scattered RLS checks
- If the view is the only read path for CORP-* users, the isolation boundary is a single place to review

**Exact view specification (engineering must implement exactly this):**

```sql
CREATE VIEW corp_incident_aggregates AS
SELECT
  i.venue_id,
  v.corporate_account_id,
  v.city,
  v.state,
  v.country,
  i.incident_type,
  i.incident_subtype,
  i.severity,
  i.status,
  i.building_id,
  DATE_TRUNC('day', i.declared_at) AS incident_date,
  -- Aggregate zone validation rate (no PII)
  COUNT(izs.id) AS total_zones,
  COUNT(izs.id) FILTER (WHERE izs.state IN ('ZONE_CLEAR','EVACUATION_COMPLETE','SH_CONFIRMED_CLEAR')) AS validated_zones,
  ROUND(
    COUNT(izs.id) FILTER (WHERE izs.state IN ('ZONE_CLEAR','EVACUATION_COMPLETE','SH_CONFIRMED_CLEAR'))::NUMERIC
    / NULLIF(COUNT(izs.id), 0) * 100, 1
  ) AS zone_validation_rate_pct,
  -- Aggregate action completion rate (no PII)
  COUNT(ira.id) AS actions_assigned,
  COUNT(ira.id) FILTER (WHERE ira.completed_at IS NOT NULL) AS actions_completed,
  -- Evacuation decision metadata (no PII)
  COUNT(iet.id) AS evacuation_triggers,
  MAX(iet.created_at) AS last_evacuation_trigger_at,
  -- Timing (no PII)
  i.declared_at,
  i.resolved_at,
  EXTRACT(EPOCH FROM (i.resolved_at - i.declared_at)) / 60 AS resolution_minutes
  -- NEVER include: staff names, staff_ids, visitor records, personal details
FROM incidents i
JOIN venues v ON i.venue_id = v.id
LEFT JOIN incident_zone_states izs ON i.id = izs.incident_id
LEFT JOIN incident_response_actions ira ON i.id = ira.incident_id
LEFT JOIN incident_evacuation_triggers iet ON i.id = iet.incident_id
GROUP BY
  i.id, i.venue_id, v.corporate_account_id, v.city, v.state, v.country,
  i.incident_type, i.incident_subtype, i.severity, i.status,
  i.building_id, i.declared_at, i.resolved_at;

-- RLS: CORP-* users can only see their own corporate account's aggregates
ALTER VIEW corp_incident_aggregates OWNER TO postgres;
-- Note: Views inherit the security context of the calling role via RLS on base tables
-- Additional middleware enforcement: corporate_account_id JWT claim checked before any CORP-* query
```

**B. `incident_threshold_configs` table (Q4, Day 14)**

The pre-flight references this table for per-venue auto-evacuation threshold overrides (the "≥2 zones, 3 minutes" default from BR-L). The v8 architecture has venue-level config but doesn't define this table explicitly.

**Decision: Build it.** It belongs in Migration 014 (not a separate migration).

```sql
CREATE TABLE incident_threshold_configs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id              UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE UNIQUE,
  -- Auto-evacuation suggestion thresholds (BR-L)
  auto_evac_zones_threshold  INTEGER NOT NULL DEFAULT 2,   -- ≥N zones NEEDS_ATTENTION
  auto_evac_window_minutes   INTEGER NOT NULL DEFAULT 3,   -- within N minutes
  -- Action time-target escalation thresholds (Q6)
  action_sla_soft_warning_pct  INTEGER NOT NULL DEFAULT 50,   -- warn at 50% of target elapsed
  action_sla_hard_escalation_pct INTEGER NOT NULL DEFAULT 100, -- escalate at 100% of target
  configured_by         TEXT,                              -- SC Ops operator ID
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE incident_threshold_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "venue_read" ON incident_threshold_configs FOR SELECT
  USING (venue_id = current_setting('app.current_venue_id', TRUE)::UUID);
-- INSERT/UPDATE: SC Ops service role only (admin client, no venue RLS)
```

**C. `incidents.escalated_from_drill_id` column (Q4, Day 1)**

Required by the drill-incident hybrid scenario resolution. Add to Migration 014 alongside `incident_subtype`.

```sql
ALTER TABLE incidents
  ADD COLUMN incident_subtype TEXT NULL CHECK (...),
  ADD COLUMN escalated_from_drill_id UUID NULL REFERENCES drill_sessions(id),
  ADD COLUMN has_sire_data BOOLEAN NOT NULL DEFAULT FALSE;
  -- has_sire_data: computed flag for IncidentDetailScreen v2 gate (per Q8 resolution)
```

---

### 1.3 Discrepancy in EC-22 vs Pre-flight Race Condition Mitigation

**The conflict:** EC-22 in the v8 architecture says zone state changes are "NEW ROWS, never UPDATE of existing rows." The pre-flight (R1 mitigation) says "Per-zone optimistic locking via `state_changed_at` timestamp; reject stale-update PATCH with 409."

**These aren't contradictory — they operate on different tables:**
- `incident_zone_states`: one live-state row per zone per incident → this IS updated (UPSERT). The 409 optimistic lock applies here.
- `incident_zone_state_log`: append-only audit row per state transition → INSERT only, never UPDATE.

**Resolution:** Both are correct and both are required. The engineering implementation must do both atomically in a single database transaction:

```sql
-- In a single transaction on every zone state PATCH:
BEGIN;

-- Step 1: Check optimistic lock (reject if state_changed_at is stale)
UPDATE incident_zone_states
SET
  state = :new_state,
  last_updated_by = :staff_id,
  last_updated_by_role = :role,
  reason_note = :reason_note,
  evidence_url = :evidence_url,
  state_changed_at = NOW()
WHERE
  incident_id = :incident_id
  AND zone_id = :zone_id
  AND state_changed_at = :client_state_changed_at  -- Optimistic lock: reject if client is stale
  AND state != :new_state;                          -- No-op if already in target state

-- Step 2: Check if update succeeded (0 rows = stale client → return 409)
-- Handle in application code: if rowCount = 0 → check if state already equals new_state
-- If state = new_state → idempotent 200. If state_changed_at mismatch → 409 Conflict.

-- Step 3: Append to audit log (always)
INSERT INTO incident_zone_state_log (
  venue_id, incident_id, zone_id, previous_state, new_state,
  changed_by, changed_by_role, reason_note, evidence_url, changed_at
) VALUES (:venue_id, :incident_id, :zone_id, :prev_state, :new_state,
          :staff_id, :role, :reason_note, :evidence_url, NOW());

COMMIT;
```

**Engineers: this double-write transaction is the single most critical implementation detail in Phase 5.21.** Get it right in Week 1, Day 3. Test it with concurrent PATCH calls before proceeding.

---

### 1.4 `instruction_i18n_key` Field — Decision Required

The pre-flight mentions `instruction_i18n_key` as an i18n-reserved field on action template records. The v8 architecture's `ActionStep` interface doesn't include this field.

**Decision: Add it.** Add to the `actions JSONB` structure now. It costs nothing to add an optional field, and not adding it means a schema-breaking change when i18n arrives in Phase B.

```typescript
interface ActionStep {
  order: number;
  instruction: string;             // English fallback — always present
  instruction_i18n_key: string;    // e.g., "sire.fire.gs.action.close_fire_doors"
                                   // Used by useLabel() in Phase B translation
  time_target_seconds: number | null;
  evidence_type: 'VERBAL' | 'PHOTO' | 'GPS' | 'SIGNATURE' | 'NOTE' | null;
  is_mandatory: boolean;
  is_life_critical: boolean;
}
```

**Phase B:** When Telugu/Hindi translations are added, the translation file maps `instruction_i18n_key → translated string`. The resolver falls back to `instruction` if no translation exists. This is the same `useLabel()` pattern already established for the ThemeProvider.

---

## PART 2 — ARCHITECTURAL QUESTION RESOLUTIONS (§6)

Each question is resolved with full rationale, engineering specification, and any conditions on the decision.

---

### Q1 — Auto-Evacuation Suggestion for Drill Incidents (BR-L)

**Question:** Should the auto-evacuation suggestion fire during `FIRE_DRILL` incidents?

**Resolution: No — with a precise implementation.**

The pre-flight recommendation is correct. Expand it to cover all drill sub-types, not just `FIRE_DRILL`:

```typescript
// In escalation worker auto-evac suggestion check:
const DRILL_SUBTYPES = ['FIRE_DRILL', 'EVACUATION_DRILL'];

async function checkAutoEvacuationSuggestion(incidentId: string) {
  const incident = await getIncident(incidentId);

  // Skip suggestion for drill incidents — SH knows the script
  if (DRILL_SUBTYPES.includes(incident.incident_subtype)) return;
  // Also skip if no sub-type and incident_type is flagged as drill
  if (incident.is_drill) return;  // See §1.2C: new is_drill column

  // Also skip if incident already has an active evacuation trigger
  // (suggestion is only useful before first evacuation decision)
  const existingTrigger = await getLastEvacuationTrigger(incidentId);
  if (existingTrigger) return;

  // ... rest of suggestion logic
}
```

**Additional condition to add:** Skip the suggestion if the incident is already `CONTAINED` or `RESOLVED`. The worker should check `incident.status` as well.

**Data collection note:** Even when the suggestion is suppressed for drills, the system should still *log* that a suggestion *would have fired* (to a non-displayed internal analytics table). This feeds the India Safety Index — tracking how quickly real incidents would have triggered suggestions without the drill suppression.

---

### Q2 — Realtime Mechanism (Supabase Realtime vs Cloud Run WebSocket)

**Resolution: Use Supabase Realtime through Phase 2. Decision is correct.**

Additional engineering specification beyond what the pre-flight states:

**The 500-connection limit is per Supabase project, not per venue.** At Phase 2 scale (20 venues × ~5 concurrent dashboard users + mobile GS), you're well within 500. The actual risk isn't raw connection count — it's **Realtime broadcast volume** during a simultaneous multi-venue incident.

**Concrete risk calculation:**

```
Scenario: 3 venues declare incidents simultaneously (stress test)
Per venue: 50 zones × state changes during incident = ~150 state changes over 10 minutes
Per change: 1 Realtime broadcast to ~8 connected clients (SH + SC + GS on dashboard)
Total: 3 venues × 150 changes × 8 clients = 3,600 Realtime events over 10 minutes
Supabase Realtime broadcast rate limit: 10 events/second per client connection
Peak: ~6 events/second across all connections — well within limits
```

**Verdict:** No action required for Phase 2. At Phase 3 (50+ venues), monitor with Cloud Monitoring alert when venue count crosses 30. Cloud Run WebSocket migration happens at Phase 2 GCP migration regardless.

**One thing the pre-flight misses:** The Supabase Realtime subscription in the mobile app for `incident_zone_states` needs to be **scoped to the specific incident_id** to avoid receiving state updates from other venues' incidents (this is a correctness issue, not just performance). The subscription filter must be:

```typescript
.on('postgres_changes', {
  event: '*',
  schema: 'public',
  table: 'incident_zone_states',
  filter: `incident_id=eq.${incidentId}`  // Critical: scope to current incident
}, handleZoneStateUpdate)
```

Without this filter, a GS whose phone has the app open during an incident at a different venue (in a multi-tenant Supabase project) could theoretically receive state updates for an unrelated incident. RLS prevents *data leakage* but Realtime filter prevents *unnecessary network traffic and UI confusion*.

---

### Q3 — Action Template Version Snapshot

**Resolution: Snapshot at incident declaration. Decision is correct.**

Implementation specification:

**What "snapshot" means concretely:** At the time of incident declaration, `GET /incidents/:id/my-actions` runs the 5-step template resolution chain and returns the resolved template. The resolved actions are stored in a new field on the incident:

```sql
ALTER TABLE incidents
  ADD COLUMN resolved_templates JSONB NULL;
  -- Populated at incident declaration; keyed by role
  -- {"SH": [{order:1, instruction:"...", ...}], "GS": [...], ...}
```

**Why:** Without this, if a template is updated mid-incident, repeated calls to `GET /incidents/:id/my-actions` would return different results depending on when the staff member opens the screen. With the snapshot, every staff member gets the same template that was active at declaration time.

**The snapshot write happens in the incident declaration transaction:**

```typescript
// POST /incidents handler — updated
const resolvedTemplates: Record<string, ActionStep[]> = {};
const roles = ['SH', 'DSH', 'SC', 'FM', 'FS', 'GS', 'GM'];
for (const role of roles) {
  resolvedTemplates[role] = await resolveActionTemplate(
    venue_id, venue_type, incident_type, incident_subtype, role
  );
}

await supabase.from('incidents').insert({
  ...incidentData,
  resolved_templates: resolvedTemplates  // Snapshot stored at declaration
});
```

**`GET /incidents/:id/my-actions` then reads from the snapshot** (not re-resolving the chain):

```typescript
const { data: incident } = await supabase
  .from('incidents')
  .select('resolved_templates, incident_subtype')
  .eq('id', id).single();

return incident.resolved_templates[req.auth.role] ?? [];
```

**Performance benefit:** Snapshot reads eliminate the 5-step resolution lookup on every `GET /my-actions` call. The LRU cache in the pre-flight (Day 5) becomes less critical but still useful for the initial declaration transaction.

**Exception case:** If `incident_subtype` is updated post-declaration (SH clarifies the incident type), the snapshot should be re-resolved. Add a `PATCH /incidents/:id/subtype` handler that also re-resolves and re-stores `resolved_templates`. Staff who already opened their checklist continue on the old snapshot; new openings get the updated template. This is a minor UX concern — the pre-flight doesn't cover it, but it should be in the spec.

---

### Q4 — Drill-Incident Hybrid Scenario

**Resolution: The pre-flight recommendation is correct. Here is the complete implementation specification.**

The `POST /v1/drill-sessions/:id/escalate-to-incident` endpoint must do the following atomically:

```typescript
// POST /v1/drill-sessions/:id/escalate-to-incident
// Body: { incident_type, incident_subtype, zone_id, description }
// Auth: SH or DSH only

async function escalateDrillToIncident(drillSessionId, body, auth) {
  const drillSession = await getDrillSession(drillSessionId, auth.venue_id);

  if (drillSession.status === 'COMPLETED') {
    throw new Error('Cannot escalate a completed drill');
  }

  await supabase.rpc('begin_transaction');

  // Step 1: Mark drill as escalated (not completed — it ran until real incident happened)
  await supabase.from('drill_sessions').update({
    status: 'ESCALATED_TO_INCIDENT',
    completed_at: new Date().toISOString()
  }).eq('id', drillSessionId);

  // Step 2: Create new incident (full SIRE incident)
  const incident = await createIncident({
    ...body,
    venue_id: auth.venue_id,
    declared_by: auth.staff_id,
    escalated_from_drill_id: drillSessionId,  // Link preserved
    is_drill: false                            // This is NOW a real incident
  });

  // Step 3: Broadcast to all on-duty staff:
  // "DRILL ESCALATED TO REAL INCIDENT — [type]. This is not a drill."
  await notificationQueue.add({
    type: 'DRILL_ESCALATED',
    incident_id: incident.id,
    venue_id: auth.venue_id,
    payload: {
      push_title: '⚠ DRILL ESCALATED — REAL INCIDENT',
      push_body: `${body.incident_type} confirmed. Real incident protocols now active.`,
      wa_template: 'incident_alert',
      // Critical: message must clearly distinguish from drill
    }
  }, { priority: 0 });

  await supabase.rpc('commit_transaction');
  return incident;
}
```

**One additional requirement the pre-flight misses:** When a drill escalates to a real incident, zone states already set during the drill (participants who already tapped actions) **should NOT carry over** to the new incident. The new incident starts with all zones `UNVALIDATED`. Drill participation records remain in `drill_session_participants`; new SIRE zone states start fresh. This is the correct behaviour — a guard who "cleared" a zone during a drill hasn't actually cleared it once a real fire starts.

**Compliance note:** The escalation link (`escalated_from_drill_id`) means the NABH §EM report can note: "Incident occurred during scheduled drill — escalation at [timestamp]." This is actually a positive compliance detail.

---

### Q5 — Evidence URL Retention Policy

**Resolution: The pre-flight recommendation is correct. Extending it with implementation detail.**

**Phase 5.21 (all retention = permanent for now):**

```typescript
// No lifecycle policy set on S3/GCS yet. All objects use:
const uploadParams = {
  Bucket: 'sc-evidence-prod',
  Key: `${venue_id}/incidents/${incident_id}/...`,
  // No Expires header; no lifecycle tag
};
```

**Phase B (add S3 lifecycle tags at upload time — no migration required later):**

```typescript
// Tag every incident evidence upload at time of upload
// This allows S3 lifecycle rules to act on the tags later
const uploadParams = {
  Bucket: 'sc-evidence-prod',
  Key: `${venue_id}/incidents/${incident_id}/...`,
  Tagging: `severity=${severity}&venue_id=${venue_id}`,
  // S3 lifecycle rule: objects tagged severity=SEV2 or severity=SEV3
  // AND age > 365 days → transition to Glacier
  // Objects tagged severity=SEV1 → no lifecycle rule (permanent)
};
```

**The critical discipline:** Tag at upload time in Phase 5.21, even though the lifecycle rules don't exist yet. Retrofitting tags to existing S3 objects is expensive (ListObjects + PutObjectTagging × every object). Tag now, apply lifecycle rules in Phase B.

**Legal note for hospital venues:** NABH requires incident records retained for 3 years minimum. For hospital accounts specifically, the lifecycle policy must be: SEV1=permanent, SEV2/SEV3=3 years (not 12 months). This should be configurable per venue tier, not hardcoded. Add `evidence_retention_years` to `venue_subscriptions` or `incident_threshold_configs`:

```sql
-- Add to incident_threshold_configs:
evidence_retention_years INTEGER NOT NULL DEFAULT 3  -- 3 for hospital/NABH; 1 for others
```

---

### Q6 — Action Time-Target SLA Enforcement

**Resolution: The phased approach is correct. Here is the complete implementation specification for all three phases.**

**Phase 5.21 — Soft warning at 50% elapsed:**

The worker that checks this runs on the same 60-second heartbeat as the scheduling engine. It checks `incident_response_actions` for any action with `time_target_seconds` where no completion record exists and elapsed time > (target × 0.5).

```typescript
// In escalation worker — add to 60-second tick alongside existing escalation checks
async function checkActionTimeSLAWarnings(venueId: string) {
  const activeIncidents = await getActiveIncidents(venueId);

  for (const incident of activeIncidents) {
    const thresholds = await getIncidentThresholds(venueId);
    const softWarnPct = thresholds.action_sla_soft_warning_pct / 100; // 0.5

    // Find action assignments that are overdue for soft warning
    // Note: resolved_templates is the source of truth for assigned actions
    // incident_response_actions only has COMPLETED actions
    // So: check for templates assigned to on-duty staff with no completion record
    // and elapsed time > target × softWarnPct

    // This logic is complex — see detailed spec in activity-templates.md
    // Key: only warn ONCE per action per staff (use Redis key: `sla_warned:${incident_id}:${staff_id}:${action_order}`)
  }
}
```

**Phase 5.22 — Hard escalation at 100% elapsed:**

Same pattern, but sends push+WA to SC/SH instead of the staff member, and escalation is logged in `escalation_events` for audit trail.

**Phase B — Full escalation chain:**

Integrates with the existing escalation chain pattern (BR-08). The action SLA escalation follows the same chain as task escalation: Staff → FS → SC → SH. Requires workers always-on (ADR-0005 — already resolved).

**One practical constraint:** Time targets in action templates are per-step, not per-incident. The worker needs to know the **incident declaration time** plus the **cumulative time budget** for prior steps to compute absolute deadlines. The simplest implementation: store `action_started_at` in `incident_response_actions` when a staff member opens the action list (PATCH with `status: 'IN_PROGRESS'`). SLA deadline = `action_started_at + time_target_seconds`.

---

### Q7 — Photo Evidence on Slow Connections (2G/3G, NFR-07)

**Resolution: Non-blocking upload. Pre-flight recommendation is correct. Here is the complete implementation.**

**The user flow (engineering must implement exactly this):**

```typescript
// In completeAction() service:
async function completeAction(incidentId, actionOrder, evidence) {
  const localId = uuid();

  // 1. Save completion locally immediately (SQLite)
  await localDb.runSync(`
    INSERT INTO pending_action_completions
    (id, incident_id, action_order, evidence_type, evidence_text, submitted_at, synced, photo_pending)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?)
  `, [localId, incidentId, actionOrder, evidence.type, evidence.text,
      new Date().toISOString(), evidence.photoPath ? 1 : 0]);

  // 2. Mark action as DONE on screen immediately (optimistic update)
  // User sees checkmark. Photo shows "uploading..." indicator.

  // 3. If photo: start background upload (non-blocking)
  if (evidence.photoPath) {
    uploadPhotoInBackground(localId, evidence.photoPath, incidentId, actionOrder);
    // Returns immediately — does not await
  }

  // 4. POST completion to server (photo_url = null if still uploading)
  const { upload_url, file_key } = await api.post('/upload/presign', {
    entity_type: 'incident_actions', file_ext: 'jpg'
  });

  // If online: POST immediately
  // If offline: add to pending queue (existing offline pattern from BR-35)
  await api.post(`/incidents/${incidentId}/actions/${actionOrder}/complete`, {
    evidence_type: evidence.type,
    evidence_note: evidence.text,
    evidence_url: evidence.photoPath ? file_key : null,
    // photo_upload_pending: true if photo not yet uploaded
  });
}

// Background photo upload (doesn't block user)
async function uploadPhotoInBackground(localId, photoPath, incidentId, actionOrder) {
  try {
    const { upload_url, file_key } = await api.post('/upload/presign', {...});
    const blob = await FileSystem.readAsStringAsync(photoPath, { encoding: 'base64' });
    await fetch(upload_url, { method: 'PUT', body: blob, headers: {...} });

    // Update the server record with the photo URL
    await api.patch(`/incidents/${incidentId}/actions/${actionOrder}/photo`, {
      evidence_url: file_key
    });

    // Update local SQLite: photo no longer pending
    await localDb.runSync(
      'UPDATE pending_action_completions SET photo_pending=0 WHERE id=?', [localId]
    );
  } catch (e) {
    // Queue for retry on reconnect (same pattern as task completion sync)
    // Photo upload failure does NOT un-complete the action
  }
}
```

**UX requirement (must be in Day 7-8 build):**
- Action checklist item shows: ✅ Done | 📷 Uploading... (spinner) | 📷 Failed (retry button)
- The action is considered COMPLETE regardless of photo upload status
- Photo evidence is "best effort" on 2G — the action completion is not gated on it
- NABH §EM report notes: "Photo evidence pending upload" for any action where `evidence_url IS NULL AND evidence_type = 'PHOTO'`

---

### Q8 — IncidentDetailScreen v2 — Same Screen or Separate?

**Resolution: Same component, feature-flag gated. Pre-flight recommendation is correct. Here is the complete gate logic.**

The `has_sire_data` flag (added to `incidents` table in §1.2C) drives the gate:

```typescript
// IncidentDetailScreen.tsx (single file — no rename required)
export function IncidentDetailScreen({ route }) {
  const { incidentId } = route.params;
  const { data: incident } = useIncidentDetail(incidentId);
  const isSIREIncident = incident?.has_sire_data === true;

  return (
    <ScrollView>
      {/* V1 header (always shown) */}
      <IncidentHeaderCard incident={incident} />

      {/* V1 components — shown for all incidents */}
      <IncidentTimelineSection incident={incident} />

      {/* V2 components — shown only for SIRE incidents */}
      {isSIREIncident && (
        <>
          <ZoneActionSection incidentId={incidentId} />
          <ZoneStateGrid incidentId={incidentId} />
          <ActionChecklistSection incidentId={incidentId} role={session.staff.role} />
        </>
      )}

      {/* V1 staff-safe button — shown for non-SIRE incidents (FIRE + EVAC types: show 3-button instead) */}
      {!isSIREIncident && (
        <StaffSafeButton incidentId={incidentId} />
      )}
    </ScrollView>
  );
}
```

**`has_sire_data` is set `TRUE` on incident creation once Phase 5.21 is deployed.** All incidents created before Phase 5.21 have `has_sire_data = FALSE` (default). Pre-Phase 5.21 incidents render the v1 layout automatically.

**One thing the pre-flight misses:** `has_sire_data` should also gate the **drawer banner CTA text** (Day 9). The banner needs to adapt:

```typescript
// Drawer banner:
const bannerCTA = activeIncident?.has_sire_data
  ? 'View zone state'    // SIRE-aware
  : 'I Am Safe';         // Legacy
```

---

### Q9 — Workers-Paused Fallback During Active Incident

**Resolution: Pre-flight recommendation is correct. Add one more mitigation layer.**

The pre-flight says: "SH dashboard shows banner `Workers paused — manual notification required.`"

**Engineering must implement this banner.** It is not optional. If workers are paused during an active incident:

1. **The evacuation fan-out will NOT fire** — this is a safety-critical failure mode
2. **The SH must know this immediately** — not discover it after 30 seconds of silence

**Banner implementation (must be in Phase 5.21 Day 11-12 dashboard build):**

```typescript
// Dashboard: poll /v1/health every 30 seconds during active incident
// /v1/health should return workers_status: 'RUNNING' | 'PAUSED' | 'DEGRADED'

const IncidentCommandBanner = ({ incident, workersStatus }) => {
  if (workersStatus === 'PAUSED') {
    return (
      <Banner variant="critical">
        ⚠️ <strong>Notification workers paused.</strong> Evacuation fan-outs are queued but
        not delivering. Use radio / verbal / personal mobile for immediate staff notification.
        Contact SafeCommand Operations to resume workers immediately.
        [worker-paused contact number]
      </Banner>
    );
  }
  // ... normal incident banner
};
```

**The `/v1/health` endpoint must surface worker status.** Add to the existing health check:

```typescript
// GET /health
app.get('/health', async (req, res) => {
  const workersPaused = process.env.WORKERS_PAUSED === 'true';
  res.json({
    status: 'ok',
    db: await checkDbConnection(),
    queue: await checkQueueConnection(),
    workers_status: workersPaused ? 'PAUSED' : 'RUNNING'
  });
});
```

---

### Q10 — Drill Mode SIRE Applicability (Separate Primitives)

**Resolution: Confirmed. Phase 5.21 ships SIRE for incidents only. Drills unchanged.**

Additional precision on the boundary:

| Feature | Incidents (SIRE — Phase 5.21) | Drills (unchanged) |
|---|---|---|
| Zone state machine | ✅ `incident_zone_states` | ❌ Not applicable |
| 3-button action model | ✅ In-app during incident | ❌ Drill uses existing participation record |
| Per-role action templates | ✅ From `incident_action_templates` | ❌ Drills use `drill_session_participants.notes` |
| Evacuation trigger log | ✅ `incident_evacuation_triggers` | ❌ Drill records remain in `drill_sessions` |
| Auto-evacuation suggestion | ✅ (suppressed for FIRE_DRILL sub-type) | ❌ N/A |
| PA auto-draft | ✅ On evacuation trigger | ❌ Drill PA managed manually |
| NABH §EM compliance report | ✅ Auto-generated | ✅ FF-3 auto-generated from drill schema |

**Phase B:** Drills *may* get SIRE zone state tracking to generate richer FF-3 reports (zone-by-zone drill validation). This is a Phase B decision, not Phase 5.21 scope.

---

## PART 3 — ENHANCED RISK ANALYSIS

Each of the 15 risks is reviewed. Where the pre-flight mitigation is incomplete, additional engineering guidance is provided.

---

### R1 — Zone State Machine Race Conditions ✅ with enhancements

The pre-flight mitigation (optimistic locking via `state_changed_at`) is correct. Two enhancements:

**Enhancement 1: Last-writer-wins is acceptable for ZONE_CLEAR only.** For `NEEDS_ATTENTION` and `TRIGGER_EVACUATION`, a 409 conflict should be surfaced to the user with a clear message: "Another staff member updated this zone while you were deciding. Current state: [state]." For `ZONE_CLEAR`, last-writer-wins is fine — if two GS both tap "Zone Clear", the second write is idempotent.

**Enhancement 2: The state transition matrix enforces an additional safety constraint.** A zone in `EVACUATION_TRIGGERED` state cannot be set back to `UNVALIDATED`, `SWEEP_IN_PROGRESS`, or `ZONE_CLEAR` by anyone except SH/DSH. This prevents a scenario where a nervous GS taps "Zone Clear" during an ongoing evacuation, causing the dashboard to show a false green state.

**The transition matrix (must be implemented in Day 3 PATCH endpoint):**

```typescript
const VALID_TRANSITIONS: Record<string, Record<string, string[]>> = {
  UNVALIDATED: {
    GS: ['SWEEP_IN_PROGRESS', 'INACCESSIBLE'],
    FS: ['SWEEP_IN_PROGRESS', 'ZONE_CLEAR', 'NEEDS_ATTENTION', 'INACCESSIBLE'],
    SC: ['SWEEP_IN_PROGRESS', 'ZONE_CLEAR', 'NEEDS_ATTENTION', 'EVACUATION_TRIGGERED', 'LOCKED_DOWN', 'INACCESSIBLE'],
    SH: ['SWEEP_IN_PROGRESS', 'ZONE_CLEAR', 'NEEDS_ATTENTION', 'EVACUATION_TRIGGERED', 'LOCKED_DOWN', 'SH_CONFIRMED_CLEAR', 'INACCESSIBLE'],
    DSH: ['SWEEP_IN_PROGRESS', 'ZONE_CLEAR', 'NEEDS_ATTENTION', 'EVACUATION_TRIGGERED', 'LOCKED_DOWN', 'SH_CONFIRMED_CLEAR', 'INACCESSIBLE'],
  },
  SWEEP_IN_PROGRESS: {
    GS: ['ZONE_CLEAR', 'NEEDS_ATTENTION', 'EVACUATION_TRIGGERED', 'INACCESSIBLE'],
    FS: ['ZONE_CLEAR', 'NEEDS_ATTENTION', 'EVACUATION_TRIGGERED', 'INACCESSIBLE'],
    SC: ['ZONE_CLEAR', 'NEEDS_ATTENTION', 'EVACUATION_TRIGGERED', 'LOCKED_DOWN', 'INACCESSIBLE'],
    SH: ['ZONE_CLEAR', 'NEEDS_ATTENTION', 'EVACUATION_TRIGGERED', 'LOCKED_DOWN', 'SH_CONFIRMED_CLEAR', 'INACCESSIBLE'],
    DSH: ['ZONE_CLEAR', 'NEEDS_ATTENTION', 'EVACUATION_TRIGGERED', 'LOCKED_DOWN', 'SH_CONFIRMED_CLEAR', 'INACCESSIBLE'],
  },
  NEEDS_ATTENTION: {
    GS: ['ZONE_CLEAR', 'EVACUATION_TRIGGERED'],
    FS: ['ZONE_CLEAR', 'EVACUATION_TRIGGERED', 'INACCESSIBLE'],
    SC: ['ZONE_CLEAR', 'EVACUATION_TRIGGERED', 'LOCKED_DOWN', 'INACCESSIBLE'],
    SH: ['ZONE_CLEAR', 'EVACUATION_TRIGGERED', 'LOCKED_DOWN', 'SH_CONFIRMED_CLEAR', 'INACCESSIBLE'],
    DSH: ['ZONE_CLEAR', 'EVACUATION_TRIGGERED', 'LOCKED_DOWN', 'SH_CONFIRMED_CLEAR', 'INACCESSIBLE'],
  },
  EVACUATION_TRIGGERED: {
    GS: [],  // GS cannot change a zone in EVACUATION_TRIGGERED state
    FS: ['EVACUATING'],
    SC: ['EVACUATING'],
    SH: ['EVACUATING', 'SH_CONFIRMED_CLEAR'],  // SH can override if evacuation was mistaken
    DSH: ['EVACUATING', 'SH_CONFIRMED_CLEAR'],
  },
  EVACUATING: {
    GS: [],
    FS: ['EVACUATION_COMPLETE'],
    SC: ['EVACUATION_COMPLETE'],
    SH: ['EVACUATION_COMPLETE', 'SH_CONFIRMED_CLEAR'],
    DSH: ['EVACUATION_COMPLETE', 'SH_CONFIRMED_CLEAR'],
  },
  EVACUATION_COMPLETE: {
    GS: [],
    FS: [],
    SC: [],
    SH: ['SH_CONFIRMED_CLEAR'],  // SH can further confirm after evacuation complete
    DSH: ['SH_CONFIRMED_CLEAR'],
  },
  SH_CONFIRMED_CLEAR: {
    // Terminal state — no further transitions allowed by anyone
    GS: [], FS: [], SC: [], SH: [], DSH: [],
  },
  LOCKED_DOWN: {
    GS: [],
    FS: [],
    SC: [],
    SH: ['UNVALIDATED'],  // SH can release lockdown and reset to unvalidated
    DSH: ['UNVALIDATED'],
  },
  INACCESSIBLE: {
    GS: ['SWEEP_IN_PROGRESS'],  // GS can retry access
    FS: ['SWEEP_IN_PROGRESS'],
    SC: ['SWEEP_IN_PROGRESS', 'SH_CONFIRMED_CLEAR'],
    SH: ['SWEEP_IN_PROGRESS', 'SH_CONFIRMED_CLEAR'],
    DSH: ['SWEEP_IN_PROGRESS', 'SH_CONFIRMED_CLEAR'],
  },
};
```

---

### R2 — Auto-Evacuation Suggestion Fires Erroneously ✅

Hard Rule 23 handles this. The Q1 resolution adds the drill suppression. **Fully mitigated.**

One addition: add an operator-configurable **silence period** after an evacuation decision. If SH already triggered a selective evacuation, suppress the "consider full evacuation" suggestion for 10 minutes (configurable). A suggestion that arrives after SH already acted is noise.

---

### R3 — Migration Deploy Fails Partway ✅ with critical addition

The transactional migration pattern is the right approach. **One critical addition:** The verification block must explicitly test for correct RLS policies, not just table existence.

```sql
-- End of 014_sire_engine.sql — enhanced verification block
DO $$
DECLARE
  v_table_count INT;
  v_rls_count INT;
  v_view_exists BOOLEAN;
BEGIN
  -- Check all 6 tables exist
  SELECT COUNT(*) INTO v_table_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name IN (
    'incident_zone_states', 'incident_zone_state_log',
    'incident_evacuation_triggers', 'incident_action_templates',
    'incident_response_actions', 'incident_threshold_configs'
  );
  IF v_table_count < 6 THEN
    RAISE EXCEPTION 'Migration 014 verification FAILED: Expected 6 tables, found %', v_table_count;
  END IF;

  -- Check RLS is enabled on all new tables
  SELECT COUNT(*) INTO v_rls_count
  FROM pg_tables
  WHERE schemaname = 'public'
  AND tablename IN ('incident_zone_states', 'incident_evacuation_triggers', 'incident_response_actions')
  AND rowsecurity = TRUE;
  IF v_rls_count < 3 THEN
    RAISE EXCEPTION 'Migration 014 verification FAILED: RLS not enabled on all required tables. Found: %', v_rls_count;
  END IF;

  -- Check corp aggregate view exists
  SELECT EXISTS(
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public' AND table_name = 'corp_incident_aggregates'
  ) INTO v_view_exists;
  IF NOT v_view_exists THEN
    RAISE EXCEPTION 'Migration 014 verification FAILED: corp_incident_aggregates view missing';
  END IF;

  -- Check incidents table has new columns
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'incidents' AND column_name = 'incident_subtype'
  ) THEN
    RAISE EXCEPTION 'Migration 014 verification FAILED: incident_subtype column missing from incidents';
  END IF;

  RAISE NOTICE 'Migration 014 verification PASSED: % tables, % with RLS, view exists, columns present',
    v_table_count, v_rls_count;
END $$;
```

---

### R4 — Existing Incident Declaration Flow Must Stay Unchanged ✅

This is correctly handled. Engineering must verify:

**The existing `POST /v1/incidents` response contract is unchanged:**

```json
// Response before Phase 5.21 — unchanged:
{
  "incident_id": "uuid",
  "incident_code": "INC-...",
  "status": "ACTIVE",
  "escalation_queued": true
}

// Response after Phase 5.21 — additive only (no removals):
{
  "incident_id": "uuid",
  "incident_code": "INC-...",
  "status": "ACTIVE",
  "escalation_queued": true,
  "has_sire_data": true,         // ← NEW: field added
  "zone_states_initialised": true // ← NEW: confirms SIRE tables populated
}
```

**Backward compatibility guarantee:** Any mobile app version that doesn't know about `has_sire_data` will simply ignore the new field. No breaking change.

---

### R5 — IncidentDetailScreen v2 Conflict with v1 ✅

Resolved in Q8. The `has_sire_data` gate approach is cleaner than the rename. **Fully resolved.**

---

### R6 — Realtime Performance at Scale ✅

Resolved in Q2. Within limits for Phase 2. **Subscription scope filter is mandatory** (see Q2 resolution).

---

### R7 — Template Resolution Chain at Scale ✅ with enhancement

LRU cache is correct. **One enhancement:** The cache key must include `template_version` to prevent stale cached templates when SC Ops updates a template.

```typescript
const TEMPLATE_CACHE_KEY = (venueId, venueType, incidentType, subtype, role, version) =>
  `template:${venueId}:${venueType}:${incidentType}:${subtype ?? 'null'}:${role}:v${version}`;
```

When `incident_action_templates.template_version` is bumped (SC Ops update), the old cache key naturally becomes stale (LRU evicts it on next resolution). No active invalidation needed.

---

### R8 — Drill Schema Co-existence ✅

Confirmed separate primitives (Q10). **Fully resolved.**

---

### R9 — Photo Storage Cost Growth ✅ with enhancement

Resolved in Q5 (tag at upload time for future lifecycle rules). **Evidence retention `evidence_retention_years` field added to `incident_threshold_configs`.**

---

### R10 — Test Coverage for 32 Sub-Types ✅

Phase 5.21 ships 16 priority sub-types. The 8-path end-to-end test approach is correct. **Specify the 8 test paths explicitly:**

| Test Path | Sub-type | Venue Type | Roles tested |
|---|---|---|---|
| T1 | `FIRE_SPREADING` | MALL | GS→Zone Clear, SC→Selective Evac |
| T2 | `MEDICAL_CARDIAC` | HOSPITAL | GS→Needs Attention, SH→Confirm Clear |
| T3 | `SECURITY_ACTIVE_AGGRESSOR` | CORPORATE | SH→Lockdown, DSH→Confirm |
| T4 | `SECURITY_BOMB_THREAT` | MALL | SC→No-PA-broadcast logic tested |
| T5 | `FIRE_DRILL` | MALL | Drill suppression of auto-evac suggestion tested |
| T6 | `EVACUATION_FULL` | HOSPITAL | Full venue fan-out, visitor alerts tested |
| T7 | `STRUCTURAL_POWER_FAILURE` | CORPORATE | FM-specific actions tested |
| T8 | `OTHER_UNKNOWN` | MALL | EC-23 graceful fallback tested (no venue-specific template) |

---

### R11 — i18n Debt in Templates ✅

Resolved — `instruction_i18n_key` added in §1.4. **Fully resolved.**

---

### R12 — Worker Freeze Regression ✅

ADR-0005 handles the intentional semantics. The Q9 resolution (workers-paused banner in incident dashboard) handles the operational risk. **Fully resolved.**

---

### R13 — CORP-* PII Leakage via RLS ✅ with critical note

The `corp_incident_aggregates` view (§1.2A) is the primary mitigation. **One critical implementation note:** The 6 CORP-* visibility tests must be run against the ACTUAL production database (staging clone), not a local SQLite or mock. RLS policies are Supabase-specific — they may not behave identically in a mocked environment.

**Test setup for Day 17:**

```sql
-- Create test CORP-CXO user and verify they CANNOT see staff names
SET LOCAL "app.current_venue_id" = '';   -- CORP-* has no venue_id
SET LOCAL "app.current_role" = 'CORP_CXO';

-- This query MUST return 0 rows (RLS blocks direct table access):
SELECT staff_id, last_updated_by FROM incident_zone_states
WHERE incident_id = :known_incident_id;

-- This query MUST return aggregate data only (via corp_incident_aggregates view):
SELECT zone_validation_rate_pct, actions_completed
FROM corp_incident_aggregates
WHERE corporate_account_id = :corp_account_id;
```

---

### R14 — Drill-Incident Hybrid During Real Fire ✅

Resolved in Q4 with complete implementation. **Fully resolved.**

---

### R15 — Migration Applied to Wrong Environment ✅ with enhancement

Add environment verification at the TOP of Migration 014, not just a verbal procedure:

```sql
-- 014_sire_engine.sql — first lines
DO $$
DECLARE v_db_name TEXT;
BEGIN
  SELECT current_database() INTO v_db_name;
  -- Prevent accidental apply to local dev named 'postgres'
  IF v_db_name = 'postgres' AND current_setting('app.environment', true) != 'production' THEN
    RAISE NOTICE 'WARNING: Applying to default postgres database. Verify this is correct environment.';
  END IF;
END $$;
```

For extra safety: before running in production, verify the latest incident in the DB is consistent with expected production data (row count sanity check).

---

## PART 4 — IMPLEMENTATION SEQUENCE VALIDATION AND ADDITIONS

The 4-week sequence in the pre-flight is well-designed. The following enhancements prevent the most likely failure modes.

---

### Week 1 — Critical Day-by-Day Additions

**Day 1 (Schema) — Three additions:**

1. **Add the `corp_incident_aggregates` view** to Migration 014 (§1.2A). It's a schema artefact — belongs in Day 1 with the tables.

2. **Add the `incident_threshold_configs` table** to Migration 014 (§1.2B). Also Day 1.

3. **Seed one global template immediately after migration** for `FIRE + SH` role. Verify the 5-step resolution chain returns it before building any other endpoint. If the resolution chain is broken, you want to know on Day 1, not Day 5.

**Day 3 (Zone State PATCH) — The most critical single endpoint:**

The state transition matrix (§Part 3, R1) must be codified as a TypeScript constant in `packages/types/` and imported by the API route — not hardcoded in the route handler. This constant is also needed by the mobile app for client-side validation before making the API call. Shared constant = single source of truth = zero divergence.

The optimistic locking pattern (§1.3) must be **tested with concurrent PATCH calls** before moving to Day 4. Write a test that fires two simultaneous PATCHes for the same zone and verifies one returns 200 and the other returns 409 (or idempotent 200 if both set the same state).

**Day 5 (Templates + Seed Data) — Language quality gate:**

The 128 template actions are the most visible content in Phase 5.21. Engineers should not author the action language without founder/ops review. The pre-flight's sign-off checklist (§7 item 7) confirms this. **Engineering must provide the JSON structure; founder approves the action language for Indian-context appropriateness.** This review must happen before Day 5, not after.

Recommended approach: create `seeds/incident_action_templates.schema.json` (structure only, placeholder text) in Week 1 Day 5 for API wiring. Request founder content review of `seeds/incident_action_templates.content.json` (actual action language) in parallel during Week 2. Merge content in Week 2 Day 10.

---

### Week 2 — Critical Additions

**Day 7-8 (IncidentDetailScreen v2):**

The screen requires knowing the `incident.building_id` to scope the zone grid correctly. If a GS is assigned to Building A and the incident is scoped to Building B, they should see their building's zones but with context that the incident is elsewhere. The building scope context must be in the service layer call:

```typescript
// fetchIncidentDetail MUST return:
{
  incident: {...},
  zones: [...],           // All zones in the incident's building scope
  my_zone: { ... },       // The GS's assigned zone specifically
  my_actions: [...],      // Their role's resolved action template
}
```

Combining these in one API call avoids 3 waterfall fetches on a 2G connection.

**Day 9 (Drawer Banner):**

The banner must handle the edge case where a GS has an **active incident in their building but is not assigned to any zone** (e.g., a new staff member added after shift roster was set). In this case, the banner should show: "Incident active in [Building]. Report to Shift Commander for zone assignment." This prevents a staff member being silently left without an action.

---

### Week 3 — Critical Additions

**Day 14 (SC Ops Console Threshold Config):**

The 6-tier threshold inheritance model referenced in the pre-flight needs a clear precedence specification. From highest priority (most specific) to lowest (most general):

```
Priority 1: venue-specific threshold (incident_threshold_configs.venue_id = X)
Priority 2: venue-type threshold (venue_type = 'HOSPITAL' etc. — add venue_type column)
Priority 3: global default (auto_evac_zones_threshold=2, auto_evac_window_minutes=3)
```

For Phase 5.21, only global defaults and venue-specific overrides are needed. Venue-type inheritance is Phase B. Don't over-engineer this now.

**Day 15 (Integration Testing):**

Test the **notification worker specifically during selective evacuation**. The fan-out uses the priority-0 queue — but during a test, if workers are paused (still in WORKERS_PAUSED=true mode from Phase 5 cost discipline), the fan-out will queue but not process. **Ensure workers are actually running during Day 15 tests.** If workers aren't unfrozen yet (item 5 in pre-conditions), create a local worker instance for testing only.

---

### Week 4 — Enhanced Test Specifications

**Day 16 (Performance Benchmarking):**

The pre-flight targets are correct. Add one more test that the pre-flight doesn't mention:

**Concurrent incident test (most realistic scenario):**

Simulate 3 venues with simultaneous active incidents, each with 20 zones, with GS tapping zone state updates every 30 seconds. Measure:
- Dashboard page load time during peak Realtime broadcast
- Database connection pool exhaustion (PgBouncer pool depth)
- API p95 response time for zone state PATCH

This is the most realistic stress scenario and it's not in the pre-flight.

**Day 17 (CORP-* Tests):**

Add test C7 beyond the pre-flight's 6:

> **C7:** A CORP-CXO who is subscribed to `corp_incident_aggregates` for their account cannot see aggregates from another corporate account (even via manipulated JWT claims).

This tests the `corporate_account_id` enforcement in the middleware, not just the RLS policy.

---

## PART 5 — ACCEPTANCE GATE ENHANCEMENTS

The pre-flight's 13 acceptance gates are well-defined. Add these:

| Gate | How to Verify |
|---|---|
| **G14: Concurrent zone state PATCH returns correct 409/200** | Test: 2 simultaneous PATCHes for same zone — verify exactly one 200 and one 409 (or both 200 if same state) |
| **G15: `has_sire_data = TRUE` on all new incidents; `FALSE` on pre-Phase 5.21 incidents** | SELECT: new incident → has_sire_data = TRUE. Pre-existing incidents → has_sire_data = FALSE. IncidentDetailScreen v1 renders for old incidents. |
| **G16: Drill sub-type suppresses auto-evac suggestion** | Create FIRE_DRILL incident. Add 3 NEEDS_ATTENTION zones in 2 minutes. Verify: no suggestion fired. |
| **G17: Workers-paused banner appears on incident dashboard when WORKERS_PAUSED=true** | Set WORKERS_PAUSED=true in local env. Declare incident. Verify banner appears. Resume workers. Verify banner disappears. |
| **G18: Template snapshot in `incidents.resolved_templates` populated at declaration** | SELECT resolved_templates FROM incidents WHERE id = :new_incident_id → non-null JSONB with SH and GS keys |
| **G19: `instruction_i18n_key` present on all seeded template action steps** | SELECT * FROM incident_action_templates → verify actions JSONB contains instruction_i18n_key on every action |
| **G20: `corp_incident_aggregates` view returns no staff_id, no staff name, no phone** | CORP-CXO query against view → verify column list has no PII fields |

---

## PART 6 — WHAT ENGINEERS CAN DEFER (AND WHAT THEY CANNOT)

### Cannot Defer to Phase 5.22 (Must Ship in Phase 5.21)

These items are in the pre-flight as Phase 5.22 or vaguely scoped, but must be in Phase 5.21 for the SIRE to function correctly:

| Item | Why Not Deferrable |
|---|---|
| `instruction_i18n_key` field on all action steps | Retrofitting this later requires re-seeding 128+ templates and updating all existing incident snapshots |
| `has_sire_data` column on incidents | IncidentDetailScreen v2 gate depends on this; cannot add it after Phase 5.21 ships without a separate migration |
| `escalated_from_drill_id` column on incidents | Drill-incident hybrid is a live operational scenario; if a drill escalates before this column exists, data is lost permanently |
| S3 upload severity tagging | Untagged objects cannot be retrospectively filtered for lifecycle rules without scanning the entire bucket |
| Workers-paused banner in incident dashboard | Without this, an SH cannot know that evacuation fan-outs are silently failing |
| Zone state scope filter in Realtime subscription | Without this, multi-tenant Realtime broadcasts may bleed between venues during simultaneous incidents |

### Can Defer to Phase 5.22

| Item | Defer Safely Because |
|---|---|
| Regional language PA text (Telugu/Hindi) | English-only PA text is functional for first pilots; language is additive |
| Action SLA hard escalation (100% target) | Soft warning (50%) is in Phase 5.21; hard escalation needs workers fully stable |
| Remaining 16 sub-types (17–32) | 16 priority sub-types cover all common scenarios for first pilots |
| Compress photos at upload | Storage cost is negligible at pilot scale; deduplication is Phase B anyway |
| Suggestion silence period after SH decision | Minor UX refinement; suppression is the correct behaviour; silence period is a polish layer |

### Can Defer to Phase B (Month 11–14)

| Item | Defer Safely Because |
|---|---|
| NABH portal API integration | Portal integration is a Phase 3 business relationship, not a technical prerequisite |
| Venue-type threshold inheritance | Venue-specific override (Priority 1) covers Phase 2 pilot needs |
| Custom template creation UI in Ops Console | SC Ops can seed templates via SQL during Phase 2 |
| Action completion rate analytics in corporate dashboard | Corporate governance dashboard isn't built until Phase 3 |
| Full drill SIRE integration | Drills with FF-3 compliance work without zone state machine |

---

## PART 7 — BUILD READINESS SUMMARY

### Confirmed Resolution: All 10 Open Questions Answered

| # | Question | Resolution | Engineering Action |
|---|---|---|---|
| Q1 | Auto-evac suggestion for FIRE_DRILL | **Skip** — add `DRILL_SUBTYPES` check + `is_drill` column check | Day 1: add `is_drill` column; Day 5: implement in worker |
| Q2 | Realtime mechanism | **Supabase Realtime through Phase 2** — add incident-scoped subscription filter | Day 2: implement scoped subscription filter |
| Q3 | Template version snapshot | **Snapshot at declaration** — store in `incidents.resolved_templates` JSONB | Day 5: add snapshot logic to POST /incidents |
| Q4 | Drill-incident hybrid | **New endpoint** `POST /v1/drill-sessions/:id/escalate-to-incident` + `escalated_from_drill_id` column | Day 1: add column; Day 5: add endpoint |
| Q5 | Evidence URL retention | **Forever Phase 5.21, tag at upload, lifecycle rules Phase B** — add severity tag to all S3 uploads | Week 1 Day 5: add tagging to presigned URL generation |
| Q6 | Action time-target SLA | **Soft warn 50% Phase 5.21, hard escalate 100% Phase 5.22** — requires `incident_threshold_configs` table | Day 1: add table; Day 5: implement soft warn in worker |
| Q7 | Photo on 2G | **Non-blocking upload** — mark complete locally, upload in background, retry on reconnect | Day 7-8: implement in completeAction() service |
| Q8 | IncidentDetailScreen v2 | **Same file, feature-flag via `has_sire_data`** — no rename required | Day 1: add column; Day 7-8: implement gate |
| Q9 | Workers paused during incident | **Workers-paused banner** on incident dashboard + `/v1/health` workers_status field | Day 11-12: implement banner; today: add health check field |
| Q10 | Drill mode SIRE | **Confirmed separate primitives** — drills unchanged | No additional action |

---

### Pre-Build Checklist — Additions to §7 Pre-flight Sign-off

Beyond the pre-flight's 10 sign-off items, the following must also be complete:

- [ ] Migration number confirmed against actual Supabase migration index (014 assumed — verify)
- [ ] `docs/adr/0001-migration-renumbering.md` updated with Migration 014 entry
- [ ] `incidents.has_sire_data`, `incidents.escalated_from_drill_id`, `incidents.resolved_templates`, `incidents.is_drill` columns added to Migration 014
- [ ] `incident_threshold_configs` table added to Migration 014
- [ ] `corp_incident_aggregates` view added to Migration 014
- [ ] Zone state transition matrix published as shared TypeScript constant in `packages/types/`
- [ ] Template action language draft reviewed by founder before Day 5 seed implementation
- [ ] `seeds/incident_action_templates.json` structure (not language) drafted before Week 2
- [ ] S3 upload function updated to accept severity tag parameter
- [ ] `/v1/health` endpoint updated to return `workers_status` field
- [ ] CORP-* test cases C1–C7 written and queued for Day 17

---

### The Critical Path

The most risk-concentrated 72 hours of Phase 5.21:

```
Day 1:  Migration 014 deployed to production with all 6 tables + 2 new columns
        + corp view + threshold table + verification block passes
              ↓ (if this fails: entire Phase 5.21 is blocked)
Day 3:  Zone state PATCH with concurrent-write test passes
              ↓ (if this fails: Week 2 mobile build is blocked)
Day 5:  Template resolution chain returns correct template for all 4 test paths
              ↓ (if this fails: Week 2 mobile action checklist is blocked)
```

Protect the critical path. If Day 1 has unexpected issues, do not push to Day 2 work. Resolve Day 1 completely before proceeding. The entire Week 2 and Week 3 build depends on the schema being correct and stable.

---

*This document was produced by Nexus Forge in response to the Phase 5.21 pre-flight review request.*
*Authority: SafeCommand Architecture v8.0.*
*All decisions herein are final unless a formal Change Request is raised to the founding architect.*
*Next review: beginning of Phase 5.21 Week 2 (confirm Day 1–5 assumptions held).*
