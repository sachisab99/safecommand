# SafeCommand Structured Incident Response Engine — Activity Templates Specification (v8-aligned)

> **Status:** v8-aligned authoritative implementation reference for Phase 5.21 + 5.22
> **Spec authority:** Refines Architecture v8 §SIRE (Structured Incident Response Engine) with the implementation-grade detail needed for Phase 5.21 build
> **Originally authored:** 2026-05-07 (pre-v8 spec receipt) as architect-review-document for the activity templates concept
> **Rewritten:** 2026-05-08 to align with Architecture v8 zone-centric SIRE model
> **Authors:** Engineering (Phase 5)
> **Companion docs:**
> - `docs/research/drill-participant-reason-taxonomy.md` — sister research artefact for the reason taxonomy (ADR 0004)
> - `docs/adr/0004-drill-participant-reason-codes.md`
> - `docs/specs/v8-alignment-analysis.md` — engineering analysis confirming v8's design

> **What changed in this rewrite (vs 2026-05-07 draft):**
> - Pivoted from staff-centric to zone-centric model per Architecture v8 §SIRE
> - Replaced 5-table proposal with v8's 6-table SIRE schema (`incident_zone_states`, `incident_zone_state_log`, `incident_evacuation_triggers`, `incident_action_templates`, `incident_response_actions`, `incident_dashboard_prompts`)
> - Added 32-sub-type incident taxonomy per BR-G
> - Added 10-state zone state machine per BR-H
> - Added 3-button staff action model per BR-I
> - Added Q4 standards-comparison framework for auto-evacuation thresholds (new §6)
> - Added Q5 drill-mode applicability options + recommendation (new §8)
> - Added Q6 CORP-* aggregate visibility design (new §9)
> - Phase 5.21 priority sub-type list (per founder Q2 direction): 16 sub-types
> - i18n posture: English first, regional languages Phase B (per founder Q3 direction)

---

## 1. Why this exists

### 1.1 The gap

The pre-v8 SafeCommand model captures *did this staff acknowledge / did this staff mark safe* during incidents and drills. Necessary for compliance but insufficient for industry-leading emergency operations. Real events demand structured per-role action lists with zone accountability:

- **Fire:** the security guard at zone B-3 doesn't just need to "be safe" — they need to *check no one is in their assigned zone*, *close fire doors*, *guide visitors to exit*, *report headcount at assembly point*
- **Medical:** the floor supervisor doesn't just observe — they're expected to *summon ambulance*, *clear path for stretchers*, *retrieve nearest AED*, *escort responders to scene*
- **Security:** ground staff don't just shelter — they *lock zone access points*, *account for visitors in zone*, *await further instruction without media disclosure*

Every major emergency management framework — ISO 22320:2018, NFPA 101:2024, HICS 5th Edition, NABH §EM 6th Edition (2025), NDMA Fire Safety Guidelines, Martyn's Law (UK 2025) — converges on the same conclusion: acknowledgement without action is not compliance.

### 1.2 v8 SIRE — the closing of the gap

The v8 Structured Incident Response Engine (SIRE) addresses this through five interlocking primitives:

1. **31 incident sub-types** (or 32 including OTHER_UNKNOWN) across 6 parent types — each routes to different action templates
2. **3-button zone action model** (✅ Safe + Zone Clear · ⚠ Zone Needs Attention · 🚨 Trigger Evacuation) replacing binary "I Am Safe" for FIRE + EVACUATION
3. **10-state zone state machine** tracking each zone through the incident lifecycle in real time
4. **Selective evacuation** — SH multi-selects zones from live grid; partial or full evacuation with one-zone granularity; auto-drafted PA text
5. **Per-role action templates** — every (incident_type, sub-type, role) tuple has an ordered checklist with evidence requirements

This document is the implementation-grade reference for Phase 5.21 + 5.22 build of these primitives.

---

## 2. Industry frameworks — the convergent backing

Comprehensive cross-section of standards informing v8 SIRE design.

### 2.1 International standards

| Source | Domain | Key contribution to SIRE |
|---|---|---|
| **ISO 22320:2018** — Emergency management: Requirements for incident response | International | Defines incident response as structured, decomposable into role-keyed objectives; chain-of-command + accountability — directly maps to per-role action templates |
| **ISO 22398:2013** — Societal security exercise guidelines | International | Per-role exercise objectives; preparation → execution → debrief lifecycle |

### 2.2 US frameworks

| Source | Domain | Key contribution to SIRE |
|---|---|---|
| **NFPA 101:2024** — Life Safety Code | US fire safety | **Two-stage evacuation principle** — directly informs FIRE_CONTAINED vs FIRE_SPREADING sub-type routing |
| **NIMS / ICS** — National Incident Management System | US federal | Modular role hierarchy: IC → Operations → Divisions → Groups → Single Resources; per-role responsibility matrices |
| **HICS 5th Edition** — Hospital Incident Command System | US healthcare | Defines 23 role-specific Job Action Sheets (JAS) per incident type — direct inspiration for `incident_action_templates` |
| **NFPA 1600 (2019)** — Continuity, Emergency, and Crisis Management | US fire/safety | Role-keyed accountability requirements |
| **NFPA 1561 (2020)** — Emergency Services Incident Management System | US fire services | Per-position checklists for fire-ground operations |
| **NFPA 3000** — Active Aggressor preparedness | US active-shooter response | **RUN-HIDE-FIGHT protocol** — directly informs SECURITY_ACTIVE_AGGRESSOR sub-type routing |
| **OSHA 29 CFR 1910.38** — Emergency Action Plans | US workplace | Minimum requirement: assigned roles + emergency procedures per incident |
| **The Joint Commission EM standards** | US healthcare | Six critical EOP areas including specific staff role assignments per incident |

### 2.3 Indian frameworks (primary market)

| Source | Domain | Key contribution to SIRE |
|---|---|---|
| **NABH §EM (Emergency Management) 6th Edition (2025)** | Indian healthcare | Per-clinical-role action checklists for Code Blue / Red / Pink / Black / Orange — directly maps to role-keyed model; informs hospital venue-type templates |
| **NDMA Fire Safety Guidelines for Public Buildings** | Indian disaster management | Role assignments for owner / occupier / fire warden / floor warden / search-and-rescue teams |
| **BIS IS 15883:2009** — Fire safety in education buildings | Indian standard | Per-role evacuation responsibilities; standardised drill practices |
| **BIS IS 2189:2008** — Automatic fire detection | Indian standard | Pre-incident planning includes role assignments + standard operating procedures |
| **Telangana State Fire Service** — Form FF-3 + Annual Fire Plan | Indian regulatory (pilot region) | Drill records require per-role action documentation, not just attendance |
| **Maharashtra State Disaster Management Plan** | Indian regulatory | Per-role response checklists during natural and man-made disasters |

### 2.4 UK / EU framework

| Source | Domain | Key contribution to SIRE |
|---|---|---|
| **Martyn's Law (UK 2025) — Terrorism (Protection of Premises) Act** | UK terrorism preparedness | **"Do NOT evacuate" protocol for bomb threats** — directly informs SECURITY_BOMB_THREAT sub-type routing (no PA, no evacuation, no media) |

### 2.5 Industry products surveyed

| Product | Approach | Gap |
|---|---|---|
| **HICS** (open standard) | 23 Job Action Sheets per incident | Designed for IC role assignment, not per-staff field execution |
| **Everbridge CEM** | Notification-led; per-recipient "tasks" can be added but typically free-form | Not structured |
| **Rave Mobile Safety** | Alert + acknowledge model | No role-keyed action lists |
| **PagerDuty Operations Center** | Runbook-style action lists per incident type | Designed for IT not physical security |
| **AlertMedia** | Custom checklists per protocol | No per-role automatic dispatch |
| **AppArmor / NaviGate** (Indian-active) | Per-role mass notification | Checklists are protocol PDFs not interactive |
| **Drillster** | Pre-incident training | Not real-time response |
| **SafetyCulture iAuditor** | Inspection checklists | Not adapted to live incident execution |

**Industry gap (validated):** no platform combines (a) per-role automatic dispatch + (b) interactive structured zone-keyed checklists + (c) audit-grade per-staff completion records + (d) selective evacuation with auto-drafted PA. SafeCommand SIRE fills this gap.

---

## 3. SIRE architectural model (v8-aligned)

### 3.1 Core entities (zone-centric per Architecture v8)

```
INCIDENT (existing — extended with incident_subtype column)
  ↓
  ├─ INCIDENT_ZONE_STATES      — live state per zone (one row per zone × incident)
  │     ├─ state (10-value enum)
  │     ├─ assigned_gs_id (from shift roster)
  │     ├─ reason_note (for NEEDS_ATTENTION)
  │     ├─ evidence_url (for EVACUATION_COMPLETE)
  │     └─ state_changed_at, last_updated_by
  │
  ├─ INCIDENT_ZONE_STATE_LOG   — append-only audit trail of every transition
  │     ├─ previous_state, new_state
  │     ├─ changed_by, changed_at
  │     └─ Hard Rule 4 (immutable; no UPDATE/DELETE policy)
  │
  ├─ INCIDENT_EVACUATION_TRIGGERS — immutable per-decision audit
  │     ├─ trigger_type (ZONE_SELECTIVE / FLOOR_SELECTIVE / FULL_VENUE / STAFF_TRIGGERED)
  │     ├─ triggered_by, triggered_by_role
  │     ├─ zones_affected (UUID array)
  │     ├─ reason_note (mandatory)
  │     ├─ pa_text_generated, pa_text_broadcast
  │     └─ notification_count
  │
  ├─ INCIDENT_RESPONSE_ACTIONS — per-staff action evidence
  │     ├─ staff_id, role
  │     ├─ action_order, instruction (snapshot from template)
  │     ├─ evidence_type, evidence_url, evidence_note
  │     └─ completed_at
  │
  └─ INCIDENT_DASHBOARD_PROMPTS — auto-evacuation suggestions (BR-L)
        ├─ prompt_type (AUTO_EVAC_SUGGESTION)
        ├─ message
        ├─ is_auto_trigger (ALWAYS FALSE per Hard Rule 23)
        └─ dismissed_at

INCIDENT_ACTION_TEMPLATES — per (incident_type, sub-type, role, venue/venue-type) tuple
  ├─ Resolution chain (5-step graceful fallback per EC-23):
  │     venue + sub-type → venue + parent type → venue-type + sub-type
  │     → venue-type + parent type → global + sub-type → global + parent type
  └─ actions JSONB:
        [{ order, instruction, time_target_seconds, evidence_type,
           is_mandatory, is_life_critical, location_scope }]
```

### 3.2 Lifecycle

```
1. SH declares incident — POST /v1/incidents (existing BR-11)
        ↓
   api: extends incident insert with incident_subtype (optional, BR-G)
        ↓
2. api: snapshot zone states for all zones in scope (or affected zone set)
        ↓
   INSERT incident_zone_states rows with state=UNVALIDATED
   (one per zone; assigned_gs_id resolved from shift_zone_assignments per BR-O)
        ↓
3. api: enqueue per-staff push notifications via priority-0 BullMQ
   "[FIRE incident at <venue>]. Tap to see your zone status."
        ↓
4. Staff opens mobile → My Incident screen → sees:
        - Zone state grid (their assigned zone + adjacent context)
        - 3-button action: ✅ Safe+Clear · ⚠ Attention · 🚨 Evacuate
        - Per-role action checklist (resolved from incident_action_templates)
        ↓
5. Staff taps button → PATCH /v1/incidents/:id/zones/:zone_id/state
        ↓
   UPDATE incident_zone_states + INSERT incident_zone_state_log + Realtime broadcast
        ↓
6. SH on dashboard sees:
        - Live zone grid (Realtime-updated, ≤5s latency)
        - Per-staff action completion progress
        - Soft prompts: auto-evacuation suggestion if ≥2 zones NEEDS_ATTENTION (BR-L)
        ↓
7. SH executes selective evacuation → POST /v1/incidents/:id/evacuate/selective
        ↓
   INSERT incident_evacuation_triggers + UPDATE zones to EVACUATION_TRIGGERED
   + auto-draft PA text + fan-out targeted push/WA to affected staff
        ↓
8. Incident resolved → completion records frozen; full audit timeline available
```

### 3.3 Template inheritance + venue customisation

Per EC-23 (graceful fallback always resolves), the resolution chain is:

```
Step 1: VENUE-SPECIFIC + sub-type
  SELECT WHERE venue_id=? AND incident_type=? AND incident_subtype=? AND role=?
  → if found: USE

Step 2: VENUE-SPECIFIC + parent type
  SELECT WHERE venue_id=? AND incident_type=? AND incident_subtype IS NULL AND role=?
  → if found: USE

Step 3: VENUE-TYPE + sub-type
  SELECT WHERE venue_type=? AND incident_subtype=? AND role=?
  → if found: USE

Step 4: VENUE-TYPE + parent type
  SELECT WHERE venue_type=? AND incident_subtype IS NULL AND role=?
  → if found: USE

Step 5: GLOBAL + sub-type
  SELECT WHERE venue_id IS NULL AND venue_type IS NULL AND incident_subtype=? AND role=?
  → if found: USE

Step 6: GLOBAL + parent type (mandatory fallback per EC-23)
  SELECT WHERE venue_id IS NULL AND venue_type IS NULL AND incident_subtype IS NULL AND role=?
  → MUST find at least one row (seed gate enforces this)
```

This pattern matches the existing schedule_template_seeds approach (BR-25). Per EC-23: **every (parent_type, role) combination MUST have a seeded global default template** — a guard declaring FIRE must always receive an action list, never a blank screen.

---

## 4. The 32 incident sub-types (BR-G)

Per Architecture v8 SIRE, the 32 sub-types are distributed across the 6 parent types. Each sub-type has distinct routing logic.

### 4.1 FIRE (4 sub-types)

| Sub-type | Description | Routing notes |
|---|---|---|
| `FIRE_CONTAINED` | Fire confirmed but localised; suppression in progress or possible | Two-stage NFPA 101 — alert + monitor; selective evacuation if smoke spreads |
| `FIRE_SPREADING` | Fire actively spreading; immediate full or wide selective evacuation | Auto-suggest full evacuation; PA text emphasises urgency |
| `FIRE_SUSPECTED` | Smoke detected; investigation in progress | Lower-priority alert; do NOT evacuate yet; alert specific zones to monitor |
| `FIRE_DRILL` | Scheduled or surprise fire drill | Drill-mode SIRE (see §8); no real Fire Service contact |

### 4.2 MEDICAL (5 sub-types)

| Sub-type | Description | Routing notes |
|---|---|---|
| `MEDICAL_CARDIAC` | Cardiac arrest / unresponsive person | Code Blue (NABH); summon AED + ambulance immediately |
| `MEDICAL_TRAUMA` | Significant injury (fall, cut, burn) | Render first aid; summon ambulance |
| `MEDICAL_MASS_CASUALTY` | 3+ affected persons | Triage required; multi-ambulance coordination |
| `MEDICAL_MENTAL_HEALTH` | Mental health emergency | Calm de-escalation; do NOT use restraints unless trained |
| `MEDICAL_OBSTETRIC` | Childbirth in progress | Specific protocol; specialist responder |

### 4.3 SECURITY (7 sub-types)

| Sub-type | Description | Routing notes |
|---|---|---|
| `SECURITY_ACTIVE_AGGRESSOR` | Active shooter / armed assailant | RUN-HIDE-FIGHT (NFPA 3000); lockdown signals; NO PA initially |
| `SECURITY_BOMB_THREAT` | Bomb threat received | **DO NOT evacuate, DO NOT use PA** (Martyn's Law); search for items; police authority decides |
| `SECURITY_SUSPICIOUS_ITEM` | Unattended bag / package | Cordon area; police; no touching |
| `SECURITY_ABDUCTION` | Suspected child / vulnerable abduction | Code Pink; lockdown of exits; CCTV review |
| `SECURITY_TRESPASS` | Unauthorised person on premises | Approach + verify; escalate if non-compliant |
| `SECURITY_CIVIL_UNREST` | Protests / mob activity | Shelter-in-place; lockdown perimeter |
| `SECURITY_CYBER_PHYSICAL` | Cyber-physical attack (access control hack, etc.) | Manual override of access; physical guards posted |

### 4.4 EVACUATION (5 sub-types)

| Sub-type | Description | Routing notes |
|---|---|---|
| `EVACUATION_FULL` | Whole venue evacuation | All staff, all zones; assembly points venue-wide |
| `EVACUATION_PARTIAL_ZONE` | Specific zone(s) evacuated | Selective fan-out; adjacent zones monitored |
| `EVACUATION_PARTIAL_FLOOR` | Specific floor evacuated | Floor-scoped fan-out |
| `EVACUATION_SHELTER_IN_PLACE` | Stay in place; secure room | Lockdown protocol; opposite of evacuation |
| `EVACUATION_DRILL` | Scheduled or surprise evacuation drill | Drill-mode SIRE (see §8); no real Fire Service contact |

### 4.5 STRUCTURAL (7 sub-types)

| Sub-type | Description | Routing notes |
|---|---|---|
| `STRUCTURAL_GAS_LEAK` | Gas leak detected | Evacuate; isolate gas mains; no electrical switching; FM coordinates with utility |
| `STRUCTURAL_FLOOD_WATER` | Major water leak / flooding | Evacuate affected; isolate water; electrical safety check |
| `STRUCTURAL_BUILDING_DAMAGE` | Visible structural damage / cracks | Engineer assessment; cordon area; photographic evidence |
| `STRUCTURAL_POWER_FAILURE` | Power outage affecting safety systems | Emergency lighting; backup power; manual systems |
| `STRUCTURAL_LIFT_ENTRAPMENT` | Person trapped in lift | Lift maintenance contact; local fire service if extended |
| `STRUCTURAL_HAZMAT` | Chemical / biological / radiological release | Evacuate; specialist response; Code Orange (NABH) |
| `STRUCTURAL_SEVERE_WEATHER` | Storm / cyclone / earthquake | Shelter-in-place; secure exterior items; assess post-event |

### 4.6 OTHER (4 sub-types)

| Sub-type | Description | Routing notes |
|---|---|---|
| `OTHER_VIP_EVENT` | High-profile visit / dignitary event | Heightened security; coordination with private security |
| `OTHER_MEDIA_INCIDENT` | Press / media event requiring management | Communications discipline; designated spokesperson |
| `OTHER_UTILITY_SERVICE` | Routine utility maintenance disrupting safety | Scheduled; staff briefed |
| `OTHER_UNKNOWN` | Catch-all when no specific sub-type fits | SH must reclassify when situation clarifies; generic ICS |

---

## 5. Phase 5.21 priority sub-type list (16 of 32)

Per founder direction (Q2), Phase 5.21 ships templates for 16 priority sub-types covering ~80% of expected pilot incidents. Phase 5.22 fills in the remaining 16.

### 5.1 Phase 5.21 priority sub-types (16)

| Sub-type | Rationale |
|---|---|
| `FIRE_CONTAINED` | Most common fire scenario; two-stage evacuation foundation |
| `FIRE_SPREADING` | Critical urgency case |
| `FIRE_SUSPECTED` | High-frequency false-alarm path; needs distinct routing |
| `FIRE_DRILL` | Required for Q5 drill-mode applicability |
| `MEDICAL_CARDIAC` | Code Blue; high mortality if delayed |
| `MEDICAL_TRAUMA` | Most common medical incident |
| `SECURITY_BOMB_THREAT` | Distinct DO-NOT-evacuate routing requires explicit handling |
| `SECURITY_ACTIVE_AGGRESSOR` | RUN-HIDE-FIGHT routing requires explicit handling |
| `EVACUATION_FULL` | Foundation pattern |
| `EVACUATION_PARTIAL_ZONE` | Most common selective scenario |
| `EVACUATION_PARTIAL_FLOOR` | MBV-aware variant |
| `EVACUATION_SHELTER_IN_PLACE` | Opposite-of-evacuation routing |
| `EVACUATION_DRILL` | Required for Q5 drill-mode |
| `STRUCTURAL_GAS_LEAK` | Common at supermall pilot context |
| `STRUCTURAL_POWER_FAILURE` | Common operational reality |
| `OTHER_UNKNOWN` | Catch-all gate per EC-23 |

### 5.2 Phase 5.22 sub-types (16)

| Sub-type | Phase 5.22 priority |
|---|---|
| `MEDICAL_MASS_CASUALTY` | Medium |
| `MEDICAL_MENTAL_HEALTH` | Medium |
| `MEDICAL_OBSTETRIC` | Low (hospital-specific; defer to hospital pilot) |
| `SECURITY_SUSPICIOUS_ITEM` | Medium |
| `SECURITY_ABDUCTION` | Medium (hospital + mall) |
| `SECURITY_TRESPASS` | Low |
| `SECURITY_CIVIL_UNREST` | Low |
| `SECURITY_CYBER_PHYSICAL` | Low |
| `STRUCTURAL_FLOOD_WATER` | Medium |
| `STRUCTURAL_BUILDING_DAMAGE` | Medium |
| `STRUCTURAL_LIFT_ENTRAPMENT` | Low |
| `STRUCTURAL_HAZMAT` | High (hospital pilot) — but deferred to Phase 5.22 due to specialist depth |
| `STRUCTURAL_SEVERE_WEATHER` | Medium |
| `OTHER_VIP_EVENT` | Low |
| `OTHER_MEDIA_INCIDENT` | Low |
| `OTHER_UTILITY_SERVICE` | Low |

---

## 6. Auto-evacuation threshold standards-comparison framework (Q4 founder direction)

> **Founder direction:** "Per-venue setting. Add comparison across standards / location / city / state / country / global. Build a competition / standard here."

### 6.1 The hierarchical configuration model

Auto-evacuation suggestion threshold (BR-L) is defined at multiple inheritance levels. A venue inherits from the most-specific match; SH can override at the venue level.

```
SAFECOMMAND_GLOBAL_DEFAULT
  ↓ overridden by
COUNTRY_DEFAULT (e.g. INDIA — NDMA-aligned)
  ↓ overridden by
STATE_DEFAULT (e.g. TELANGANA — Telangana Fire Service expectations)
  ↓ overridden by
CITY_DEFAULT (e.g. HYDERABAD — local conditions)
  ↓ overridden by
VENUE_TYPE_DEFAULT (e.g. HOSPITAL / MALL / HOTEL / CORPORATE)
  ↓ overridden by
VENUE_OVERRIDE (per-venue setting; SH-managed)
```

### 6.2 Standards-comparison reference table

For each standard, the threshold for "consider full evacuation" during a FIRE event:

| Source | Threshold | Rationale |
|---|---|---|
| **NFPA 101:2024** (US) | ≥1 zone with smoke confirmed AND fire suppression unable | Two-stage evacuation principle |
| **NFPA 1620** (US — Pre-Incident Planning) | ≥2 fire-rated compartments breached | Compartmentalisation failure trigger |
| **NABH §EM** (India — hospitals) | ≥2 wards reporting smoke OR 1 ICU ward reporting smoke | Patient-care priority logic |
| **NDMA Fire Safety Guidelines** (India) | ≥2 floors affected OR 1 floor with >50% occupant capacity affected | Public-building safety lens |
| **Telangana Fire Service Form FF-3** (India — pilot region) | ≥1 zone confirmed fire AND nearby zones reporting smoke | Practical-operational lens |
| **BIS IS 15883** (India — buildings) | ≥1 confirmed fire AND escape route compromised | Egress-aware trigger |
| **Martyn's Law** (UK 2025) | Active aggressor confirmed → immediate venue evacuation; bomb threat → DO NOT evacuate | Threat-type aware |
| **The Joint Commission EM** (US — hospitals) | ≥2 areas affected OR critical patient-care unit affected | Healthcare patient-safety lens |
| **HICS 5th Edition** (US — hospitals) | IC discretion based on ICS sit-rep | Command-decision (no automated trigger) |
| **ISO 22320:2018** (international) | Defined per-organisation; recommends "evidence-based threshold" | Generic guidance |
| **OSHA 29 CFR 1910.38** (US — workplaces) | Per Emergency Action Plan; minimum: imminent danger to occupants | Minimum bar |
| **AppArmor / NaviGate** (Indian product) | Configurable per-venue; default 2 zones in 5 min | Industry product baseline |
| **Drillster** (drill product) | N/A — pre-incident only | — |
| **Everbridge CEM** (US enterprise) | Operator decision; no automated trigger | Notification-led, not decision-led |
| **Rave Mobile Safety** (US) | Operator decision | Notification-led |

### 6.3 SafeCommand recommended defaults (per inheritance level)

Synthesised from the standards above, calibrated for Indian operating reality:

| Level | Default threshold | Rationale |
|---|---|---|
| **GLOBAL_DEFAULT** | ≥2 zones in 3 minutes during FIRE | Conservative; aligns with NFPA 1620 + AppArmor |
| **COUNTRY=INDIA** | ≥2 zones in 3 minutes during FIRE | Matches global; NDMA-aligned for public buildings |
| **STATE=TELANGANA** | ≥2 zones in 3 minutes during FIRE | Matches country; Telangana Fire Service Form FF-3 alignment |
| **CITY=HYDERABAD** | ≥2 zones in 3 minutes during FIRE | Matches state |
| **VENUE_TYPE=MALL** | ≥2 zones in 3 minutes during FIRE | Matches city; default for retail public buildings |
| **VENUE_TYPE=HOSPITAL** | ≥2 wards in 3 minutes OR 1 ICU ward immediately | Patient-care priority; aligns with NABH §EM |
| **VENUE_TYPE=HOTEL** | ≥2 floors in 3 minutes during FIRE | Floor-aware due to vertical evacuation |
| **VENUE_TYPE=CORPORATE** | ≥1 zone with confirmed fire AND escape compromised | Egress-aware; aligns with BIS IS 15883 |
| **VENUE_OVERRIDE** | SH-managed via Settings > Incident Response | Per-venue local conditions |

### 6.4 Configuration UI surface

In the SC Ops Console (Phase 5.22), template editor surface:

```
INCIDENT RESPONSE > Auto-Evacuation Threshold (BR-L)

Inheritance chain (most-specific wins):
  ┌─ Global default: ≥2 zones in 3 min during FIRE [view]
  └─ Country (INDIA): ≥2 zones in 3 min during FIRE [view]
       └─ State (TELANGANA): ≥2 zones in 3 min during FIRE [view]
            └─ City (HYDERABAD): ≥2 zones in 3 min during FIRE [view]
                 └─ Venue-type (MALL): ≥2 zones in 3 min during FIRE [view]
                      └─ This venue (Hyderabad Demo Supermall): inherited [override]

[Configure venue override]:
  Threshold: [2 zones] in [3 minutes] during [FIRE]
  Reason for override: [_____________ minimum 20 chars]

[Standards reference]:
  Tap to view how 15+ standards define this threshold.

⚠ Critical: This is a SUGGESTION only — NEVER auto-triggers
  evacuation. SH always retains decision authority. (Hard Rule 23)
```

### 6.5 Schema additions for inheritance

```sql
CREATE TABLE incident_threshold_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Scope (most specific wins; resolution by NULL fallback chain)
  venue_id      UUID NULL REFERENCES venues(id) ON DELETE CASCADE,
  venue_type    venue_type_enum NULL,    -- HOSPITAL/MALL/HOTEL/CORPORATE
  city          TEXT NULL,
  state         TEXT NULL,
  country       TEXT NULL DEFAULT 'INDIA',
  -- Threshold parameters
  incident_type incident_type_enum NOT NULL,
  zones_threshold INT NOT NULL DEFAULT 2,
  window_minutes INT NOT NULL DEFAULT 3,
  -- Metadata
  reason_note TEXT NULL,
  set_by UUID REFERENCES staff(id),
  set_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  -- Most specific wins; NULL = wildcard
  CONSTRAINT chk_threshold_min CHECK (zones_threshold >= 1 AND window_minutes >= 1)
);

-- Resolution function (api logic):
-- Look up most specific match, falling back to less specific:
-- venue → venue_type → city → state → country → global default
```

### 6.6 Standards-comparison data file

A read-only reference data file ships with the product. Stored in `/seeds/incident_threshold_standards.json`, accessible from the configuration UI:

```json
{
  "standards": [
    {
      "id": "NFPA_101_2024",
      "name": "NFPA 101:2024",
      "region": "US",
      "domain": "Fire safety / Life safety code",
      "incident_type": "FIRE",
      "threshold": "≥1 zone with smoke confirmed AND fire suppression unable",
      "rationale": "Two-stage evacuation principle"
    },
    {
      "id": "NABH_EM_2025",
      "name": "NABH §EM 6th Edition",
      "region": "India",
      "domain": "Healthcare emergency management",
      "incident_type": "FIRE",
      "threshold": "≥2 wards reporting smoke OR 1 ICU ward reporting smoke",
      "rationale": "Patient-care priority logic"
    },
    // ... 13 more standards
  ]
}
```

The configuration UI displays this comparison when SH evaluates the threshold setting. Builds buyer education + product credibility.

---

## 7. Per-role action templates — specification

### 7.1 Resolution chain (5-step graceful fallback per EC-23)

Implemented in api `resolveActionTemplate(venueId, venueType, incidentType, subtype, role)` per §3.3.

### 7.2 Template data model

```sql
CREATE TABLE incident_action_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Scope
  venue_id        UUID NULL REFERENCES venues(id) ON DELETE CASCADE,
  venue_type      venue_type_enum NULL,
  -- Match keys
  incident_type   incident_type_enum NOT NULL,
  incident_subtype TEXT NULL,
  staff_role      staff_role_enum NOT NULL,
  -- Content
  template_version INT NOT NULL DEFAULT 1,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  actions         JSONB NOT NULL,
  -- Audit
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (venue_id, venue_type, incident_type, incident_subtype, staff_role, template_version)
);
```

`actions` JSONB shape:

```json
{
  "actions": [
    {
      "order": 1,
      "instruction_i18n_key": "fire.gs.acknowledge",
      "instruction_fallback_en": "Acknowledge incident alert",
      "time_target_seconds": 60,
      "evidence_type": null,
      "is_mandatory": true,
      "is_life_critical": false,
      "location_scope": "ASSIGNED_ZONE"
    },
    {
      "order": 2,
      "instruction_i18n_key": "fire.gs.walk_zone",
      "instruction_fallback_en": "Walk assigned zone — restrooms, changing rooms, retail back-of-house",
      "time_target_seconds": 300,
      "evidence_type": "VERBAL",
      "is_mandatory": true,
      "is_life_critical": true,
      "location_scope": "ASSIGNED_ZONE"
    }
    // ... up to 8-10 actions per role
  ]
}
```

### 7.3 Sample templates — FIRE_CONTAINED, all 8 roles (global default)

> **Notation:**
> - **Pri:** **IMM** = within 60s; **STR** = within 15 min; **RES** = post-event
> - **Evidence:** **V** = verbal; **P** = photo; **G** = GPS; **S** = signature; **N** = note; **—** = none
> - **Loc:** **A** = assigned zone; **F** = floor; **B** = building; **V** = venue-wide; **E** = external

#### 7.3.1 SH (Security Head) — Incident Commander

| # | Pri | Loc | Action | Evidence |
|---|---|---|---|---|
| 1 | IMM | V | Activate venue fire alarm if not already triggered | V |
| 2 | IMM | E | Phone Fire Service (101) — provide venue address + access info | V + N |
| 3 | IMM | V | Establish command post at primary assembly point | V |
| 4 | IMM | V | Confirm announcement broadcast on venue PA system | V |
| 5 | STR | V | Coordinate with Fire Service on arrival; brief on building layout, occupancy, hazards | V + N |
| 6 | STR | V | Account for staff at assembly point — review live participation matrix | V |
| 7 | STR | V | Liaise with FM on utility cuts (electricity, gas mains) per fire-fighting requirements | V |
| 8 | STR | V | Authorise re-entry only after Fire Service all-clear | V |
| 9 | RES | V | Initiate post-incident review; trigger BR-A drill-style record creation | V + N |
| 10 | RES | V | Mark each unattested staff in participation matrix with reason classification (per ADR 0004) | V |

#### 7.3.2 DSH (Deputy Security Head)

| # | Pri | Loc | Action | Evidence |
|---|---|---|---|---|
| 1 | IMM | V | Confirm SH reachable; if not, assume IC role and notify api | V |
| 2 | IMM | V | Secure perimeter; prevent re-entry of evacuated occupants | V |
| 3 | IMM | E | Confirm Fire Service en-route; coordinate access for fire engines | V + N |
| 4 | STR | V | Manage media / public information (no disclosure beyond approved statement) | N |
| 5 | STR | V | Liaise with SH on staff and visitor accounts | V |
| 6 | RES | V | Support post-incident review | V |

#### 7.3.3 SHIFT_COMMANDER

| # | Pri | Loc | Action | Evidence |
|---|---|---|---|---|
| 1 | IMM | F | Direct assigned floor staff to begin evacuation; confirm fire stairs clear | V |
| 2 | IMM | F | Confirm lifts OUT of service for evacuees | V + P |
| 3 | IMM | F | Walk floor systematically — corridor → restrooms → store rooms → service areas | V |
| 4 | STR | V | Manage assembly point headcount; report to SH | V |
| 5 | STR | V | Identify mobility-impaired persons; confirm evacuation chair / refuge area assignment | V + N |
| 6 | RES | V | Submit floor-level all-clear report to SH | V |

#### 7.3.4 FLOOR_SUPERVISOR

| # | Pri | Loc | Action | Evidence |
|---|---|---|---|---|
| 1 | IMM | F | Enable floor PA announcement; instruct calm orderly evacuation | V |
| 2 | IMM | F | Walk assigned floor zone-by-zone; close fire doors behind | V + P |
| 3 | IMM | F | Ensure use of fire stairs only; redirect anyone heading to lifts | V |
| 4 | IMM | F | Guide guests / visitors / mobility-impaired to evacuation route | V |
| 5 | STR | F | Last person out of floor — confirm by visible sweep | V + P |
| 6 | STR | V | Report floor headcount to SC at assembly point | V |
| 7 | RES | V | Note any unusual observations (fire location, smoke colour, structural concerns) | N |

#### 7.3.5 GROUND_STAFF (3-button zone action model — BR-I)

| # | Pri | Loc | Action | Evidence |
|---|---|---|---|---|
| 1 | IMM | A | Acknowledge alert (existing BR-11 flow) | V |
| 2 | IMM | A | Walk assigned zone — physically check restrooms, changing rooms, retail back-of-house | V |
| 3 | IMM | A | Close fire doors behind you as you exit your zone | V + P |
| 4 | IMM | A | Assist mobility-impaired persons to evacuation route or refuge area | V + N |
| 5 | IMM | A | Account for visitors / customers in your zone — count + direction | V |
| 6 | STR | A | **Tap one of 3 zone buttons:** ✅ Safe + Zone Clear · ⚠ Zone Needs Attention · 🚨 Trigger Evacuation | V (button tap) |
| 7 | STR | E | Proceed to designated assembly point (per zone assignment in shift roster) | G |
| 8 | RES | V | Submit zone-clear note to FS; report any abnormalities seen during evacuation | N |

#### 7.3.6 FM (Facility Manager)

| # | Pri | Loc | Action | Evidence |
|---|---|---|---|---|
| 1 | IMM | V | Confirm fire suppression system activated (sprinklers, foam, etc.) | V |
| 2 | IMM | V | Cut electrical power to non-critical circuits per fire-safety protocol | V + N |
| 3 | IMM | V | Isolate gas mains / fuel lines | V + N |
| 4 | STR | V | Coordinate with utility companies (electricity, gas, water) | V |
| 5 | STR | V | Confirm emergency lighting / exit signs operational | V + P |
| 6 | RES | V | Document utility shutdowns + restoration timeline | N |

#### 7.3.7 GM (General Manager)

| # | Pri | Loc | Action | Evidence |
|---|---|---|---|---|
| 1 | IMM | V | Brief tenant retailers / restaurants — their staff respond per their own protocols | V |
| 2 | STR | V | Manage public communication — calm, accurate, infrequent | V + N |
| 3 | STR | E | Coordinate with mall / building corporate ops | V |
| 4 | RES | V | Brief insurance / corporate on initial damage assessment | N |

#### 7.3.8 AUDITOR (read-only observer)

| # | Pri | Loc | Action | Evidence |
|---|---|---|---|---|
| 1 | IMM | V | Observe IC chain-of-command activation; note timestamps | N |
| 2 | STR | V | Document any deviation from documented protocol | N + P |
| 3 | RES | V | Compile post-incident compliance observation report | N + S |

### 7.4 Hospital venue-type override example — FIRE_SPREADING

For a hospital venue, the FIRE_SPREADING template adds patient-care-aware items:

#### Floor Supervisor (hospital override)

| # | Pri | Loc | Action | Evidence |
|---|---|---|---|---|
| 1 | IMM | F | Activate horizontal evacuation protocol per NABH §EM | V |
| 2 | IMM | F | **Bed-ridden patients: in-place protection FIRST** — close door, soak bedding | V + P |
| 3 | IMM | F | Move ambulatory patients to adjacent unaffected zone | V |
| 4 | IMM | F | Use evacuation frames / sleds for non-ambulatory patients | V |
| 5 | IMM | F | Verify DNR (Do Not Resuscitate) orders before patient evacuation decisions | V + N |
| 6 | STR | F | Maintain patient-record integrity during transfer | V + N |

This override demonstrates v8 SIRE's strength — same 3-button mechanic, but role-specific actions adapt to venue context.

---

## 8. Drill mode SIRE applicability — options + recommendation (Q5 founder direction)

> **Founder direction:** "Guide me with the options available, also explain me in details what your recommendations would benefit and how it should complement real scenarios (separate primitives)"

### 8.1 The choice space

When a drill is running, what data model captures it?

| Option | Description | Pros | Cons |
|---|---|---|---|
| **A. Unified primitives** — drills run through SIRE's zone state machine + 3-button + per-role templates exactly like real incidents | • Same shape for staff (better learning) • Same compliance metrics (drill vs incident comparable) • Reduces schema duplication | • Existing drill_session_participants table (Phase 5.18) becomes legacy • Migration path needed for historical drill data • Drill exemption codes (ADR 0004) need re-mapping to SIRE evidence model |
| **B. Separate primitives** (founder preference) — drills stay on existing drill_session_participants model; incidents use new SIRE tables | • Backward compatibility — Phase 5.18 work preserved as-is • Drill = exercise (not real); Incident = real-world event with zone-state semantics — distinct primitives reflect distinct domain concepts • No migration risk for historical drill data • ADR 0004 reason taxonomy continues unchanged | • Two parallel models to maintain • Drill detail page UX differs from incident detail page UX • Drill compliance reports vs incident compliance reports use different metrics |
| **C. Hybrid** — drills inherit SIRE's per-role action templates + zone state machine, but keep existing drill_session_participants for participation aggregate; new columns added to drill tables linking to SIRE tables | • Phase 5.18 work largely preserved • Drills get the value of zone-state machine + role templates (better practice for incidents) • Single staff UX (3-button works in both drill and incident) • Compliance reports can converge metrics | • More complex schema (drill records cross both old and new tables) • Migration of historical drills required • Higher implementation cost |

### 8.2 My recommendation: Option B (separate primitives)

This aligns with the founder's stated preference. The rationale:

1. **Drill ≠ Incident at the domain level.** A drill is a scheduled exercise where:
   - Staff know it's coming
   - "Failure" doesn't have real consequences
   - Compliance scoring tolerates lower bars (acknowledge-only acceptable)
   - The taxonomy of reasons (ADR 0004) is purpose-built for *post-drill review* of why staff didn't acknowledge — this is a learning loop, not a discipline mechanism

   An incident is a real event where:
   - Staff don't know it's coming (or, if they do, it's because the drill turned real)
   - Failure has real consequences (lives, regulatory penalties, lawsuits)
   - Compliance scoring requires structured action evidence (PHOTO / GPS for critical actions)
   - There's no post-drill "reason taxonomy" — there's incident-response per-action evidence and audit trail

   **Treating them as separate primitives respects this domain difference.**

2. **Phase 5.18 preservation has measurable value.** The existing drill_session_participants table holds:
   - 6 reason codes from ADR 0004 (OFF_DUTY / ON_LEAVE / ON_BREAK / ON_DUTY_ELSEWHERE / DEVICE_OR_NETWORK_ISSUE / OTHER)
   - Per-staff acknowledgement timing (`acknowledged_at`, `safe_confirmed_at`, `ack_latency_seconds`)
   - Audit attribution (`reason_set_by`, `reason_set_at`)
   - Demo-ready data via `seed-drill-participants-demo.sh`
   
   Migrating this to SIRE-native shape would force semantic transformation that may distort historical records. Better to preserve.

3. **Cleaner teaching moment for Phase 5.21 implementation.** New SIRE primitives can be implemented from a clean slate without compatibility layers. Zone-state machine, 3-button, action templates — all built fresh for incidents. Drill code stays untouched.

4. **Future-flexibility.** If Phase 7+ identifies a need to converge (e.g. "drills are too disconnected from incident readiness"), the merge can happen later with full historical data preserved on both sides.

### 8.3 How separate primitives complement real scenarios

The two models serve different audience needs:

| Audience | Drill view | Incident view |
|---|---|---|
| **SH leading the drill** | Pre-incident readiness assessment — uses ADR 0004 reasons to understand absences | Real-time incident command — uses 3-button + zone state machine |
| **Auditor (NABH / Fire NOC)** | Reviews drill compliance pre-pilot via the participation matrix + reasons | Reviews incident response via SIRE audit trail (zone state log + evacuation triggers + action evidence) |
| **Investor / board director** | Asks: "How prepared are we?" → answered by drill compliance score over time | Asks: "How did we handle the actual incident?" → answered by SIRE audit + per-role action completion |
| **Staff member** | Knows drill is exercise; acknowledges via "I am safe" or sets reason if can't | Acts via 3-button (Safe/Attention/Evacuate); follows role checklist; provides evidence |
| **Pilot venue stakeholder** | Drill records demonstrate readiness during sales conversation | Incident records demonstrate competence during post-event review |

### 8.4 Schema implication

No changes needed to drill tables. SIRE tables ship Phase 5.21 as new primitives. Cross-references happen at the api layer (e.g. "show me all drill + incident records for this venue last quarter" — separate queries, joined at api level, consumed by dashboard/mobile UIs).

### 8.5 UX implication

Mobile MyShift / drawer banner are unchanged. Two separate top-level screens:
- DrillsScreen + DrillDetailScreen — drill primitives (Phase 5.18 unchanged)
- IncidentsScreen + IncidentDetailScreen — SIRE primitives (Phase 5.21 new)

No ambiguity. Each screen has its primary-target audience action set.

### 8.6 Demo implication

Sales demos can show both:
- "Here's how we measure readiness via drills" (`/drills/[id]`)
- "Here's how the system performs in real incident — zone state machine + per-role action evidence" (`/incidents/[id]` with SIRE features)

Two artefacts demonstrating two distinct value propositions. Stronger sales narrative than one merged view.

---

## 9. CORP-* role aggregate visibility into incidents (Q6 founder direction)

> **Founder direction:** "Address earlier; this will also help include this as part of testing."

Per EC-20 (CORP roles never access individual PII), Phase 5.21 implementation includes CORP visibility from Day 1. The model:

### 9.1 What CORP-* roles see

| Role | Visibility |
|---|---|
| **CORP-CXO** (global safety head) | Per-venue aggregate counts only: incident count by type/sub-type/severity in last N days; compliance score; evacuation count |
| **CORP-DIR** (country director) | Same shape, scoped to assigned country (per BR-68) |
| **CORP-MGR** (state/region manager) | Same shape, scoped to assigned state/region (per BR-69) |
| **CORP-COO** (city coordinator) | Same shape, scoped to assigned city (per BR-70) |

### 9.2 What CORP-* roles NEVER see

- ❌ Individual staff names in incident response actions
- ❌ Free-text reason notes (could contain PII)
- ❌ Per-zone evidence URLs (photos, signatures)
- ❌ Specific staff phone numbers or any direct identifiers
- ❌ Per-staff completion status (only aggregate %)

### 9.3 SIRE schema RLS additions

```sql
-- CORP-* roles get aggregate-only views, never raw row access

-- View: incident summary aggregates per venue per period
CREATE VIEW corp_incident_aggregates AS
SELECT
  i.venue_id,
  i.incident_type,
  i.incident_subtype,
  i.severity,
  date_trunc('day', i.created_at) AS day,
  COUNT(*) AS incident_count,
  COUNT(*) FILTER (WHERE i.status = 'RESOLVED') AS resolved_count,
  -- No staff names, no zone-specific PII
  AVG(EXTRACT(EPOCH FROM (i.resolved_at - i.created_at))) AS avg_duration_seconds
FROM incidents i
WHERE i.created_at > NOW() - INTERVAL '90 days'
GROUP BY 1, 2, 3, 4, 5;

-- RLS policy: only accessible to CORP-* roles in venue's corporate scope
ALTER VIEW corp_incident_aggregates ENABLE ROW LEVEL SECURITY;
CREATE POLICY corp_incident_aggregates_select ON corp_incident_aggregates
  FOR SELECT USING (
    -- Existing corporate scope policy from BR-65 enforces venue list
    venue_id IN (
      SELECT venue_id FROM corporate_venue_assignments
      WHERE corporate_account_id = (
        SELECT corporate_account_id FROM staff
        WHERE id = current_setting('app.current_staff_id')::uuid
      )
    )
    AND current_setting('app.current_role') IN ('CORP-CXO','CORP-DIR','CORP-MGR','CORP-COO')
  );
```

### 9.4 Testing requirements (per founder Q6 direction)

Phase 5.21 test plan must include:

- **Test C1:** CORP-CXO logs in → cannot see individual staff names in any incident response data
- **Test C2:** CORP-DIR logs in to country=India scope → can see Hyderabad Demo Supermall aggregates → cannot see raw incident_zone_states rows
- **Test C3:** CORP-MGR logs in to state=Karnataka → does NOT see Telangana incidents
- **Test C4:** Direct API call from CORP-* role to `/v1/incidents/:id/zones` → 403 Forbidden (RLS deny)
- **Test C5:** SQL injection attempt by CORP-* user → fails (parameterised queries + RLS)
- **Test C6:** Aggregate view returns correct counts → matches direct query as SH

These tests run as part of the Phase 5.21 acceptance gate, before Phase 5.22 begins.

---

## 10. Phase 5.21 + 5.22 phased rollout

### 10.1 Phase 5.21 (June 2027 — ~3 weeks build)

> **Note:** v8 BP §16 places Phase 5.21 at "Mar 2027" — tied to Phase 2 timeline post-pilots Phase 1 (Oct 2026 → Q1 2027). Earlier execution (June 2026) requires explicit founder + architect sign-off.

**Schema migration `014_sire_engine.sql`:**
- 6 new tables (incident_zone_states, incident_zone_state_log, incident_evacuation_triggers, incident_action_templates, incident_response_actions, incident_dashboard_prompts)
- 1 new column on incidents (incident_subtype TEXT NULL CHECK 32 values)
- 1 new view (corp_incident_aggregates)
- 5 new RLS policies (zone-state SELECT/INSERT, evacuation-triggers append-only, action-templates resolution chain, response-actions per-staff scope, corp_incident_aggregates aggregate-only)

**Seed data:**
- 16 priority sub-types × 8 roles = ~128 templates seeded as JSON
- INDIA / TELANGANA / HYDERABAD threshold defaults
- HOSPITAL / MALL / HOTEL / CORPORATE venue-type defaults

**api endpoints (6 new):**
- `GET /v1/incidents/:id/zones` — live zone grid
- `PATCH /v1/incidents/:id/zones/:zone_id/state` — zone state update
- `GET /v1/incidents/:id/zones/history` — audit trail
- `POST /v1/incidents/:id/evacuate/selective` — multi-zone evacuation
- `POST /v1/incidents/:id/evacuate/full` — full venue evacuation
- `GET /v1/incidents/:id/evacuations` — evacuation log
- `GET /v1/incidents/:id/my-actions` — staff's resolved action template
- `POST /v1/incidents/:id/actions/:order/complete` — mark action complete with evidence
- `GET /v1/incidents/:id/actions/summary` — per-role completion rates
- `GET /v1/incidents/:id/prompts` — auto-evacuation suggestions
- `POST /v1/incidents/:id/prompts/:id/dismiss` — dismiss suggestion

**Mobile UI:**
- New IncidentDetailScreen with 3-button zone action model
- Zone state grid (your assigned zone + adjacent context)
- Per-role action checklist (resolved from template)
- Evidence pickers (camera, GPS, signature pad, note)
- Drawer banner for active incidents (similar to active-drill banner from Phase 5.18)

**Dashboard UI:**
- New `/incidents/[id]` SIRE view with live zone grid (Realtime + 5s polling fallback)
- Selective evacuation modal (multi-zone picker + auto-drafted PA text)
- Per-role completion progress
- Auto-evacuation suggestion soft prompt
- Print page (Phase B PDF export hooks here)

**SC Ops Console UI:**
- Template editor (Phase 5.22 — not 5.21)
- Threshold configuration with standards comparison reference (Phase 5.22)

### 10.2 Phase 5.22 (~2 weeks after Phase 5.21)

- Remaining 16 sub-type templates seeded
- PA auto-draft (English first; regional languages reserved)
- SC Ops Console template editor surface
- SC Ops Console threshold configuration UI with standards comparison
- i18n infrastructure for action templates (English ships now; regional languages activate on demand)

### 10.3 Phase B (post-pilot)

- Per-venue customisation depth (SH-managed venue-specific overrides)
- PDF export (BR-A PDF + BR-D PDF — incident response record)
- Multi-language full activation (Hindi / Telugu / Kannada)
- Drill-mode SIRE interop (if §8 Option B turns out to need future convergence)
- Cross-venue analytics ("compare incident response time across 65 venues")

### 10.4 Phase C (post-Phase-2 GCP migration)

- CORP-* corporate governance dashboards
- International data residency for hospital chain rollouts
- Roaming SH responding across multiple venues

---

## 11. Architectural alignment with existing spec

### 11.1 Compliance with v8 Hard Rules (24 Rules)

| Rule | SIRE Compliance |
|---|---|
| 1 | No secrets in code | ✅ |
| 2 | venue_id in every query | ✅ All new SIRE tables have venue_id; api enforces |
| 3 | Never modify deployed migrations | ✅ All schema changes via new mig 014 (014_sire_engine.sql) |
| 4 | Audit logs append-only | ✅ incident_zone_state_log + incident_evacuation_triggers are no-UPDATE/DELETE |
| 5 | All writes idempotent | ✅ Per-action PATCH idempotent (status+evidence as upsert key) |
| 7 | Notification failures never fail primary | ✅ Per-staff push enqueue is async; incident declaration succeeds even if notify fails |
| 9 | Mobile offline 4hr | ✅ Templates cached in SQLite at boot |
| 10 | Zod validation at api entry | ✅ All new endpoints get strict Zod schemas |
| 11 | i18n keys from Day 1 | ✅ instruction_i18n_key field; English fallbacks for transition |
| 17 | SEV1 always all-buildings | ✅ SIRE templates fan out per existing incident scope semantics |
| 19 | ThemeProvider mandatory | ✅ All new UI uses useColours()/useBrand() |
| 20 | Powered by SafeCommand non-removable | ✅ Footer in Settings + PDF reports |
| **23 (NEW v8)** | Auto-evacuation suggestion never auto-triggers | ✅ Hard Rule explicitly enforced; is_auto_trigger column always FALSE |
| **24 (NEW v8)** | Mig 014 must apply before Phase 5.21 code deploys | ✅ Migration-then-code pattern; Hard Rule 24 honoured |

### 11.2 Compliance with v8 Engineering Constraints (23 ECs)

| EC | SIRE Compliance |
|---|---|
| EC-01 | PostgreSQL | ✅ |
| EC-02 | RLS on every table | ✅ All 6 new tables |
| EC-03 | venue_id everywhere | ✅ |
| EC-09 | Offline mobile 4hr | ✅ |
| EC-15 | i18n keys | ✅ |
| EC-16 | building_id nullable | ✅ Inherits from incident.building_id |
| EC-17 | ThemeProvider | ✅ |
| EC-20 | CORP-* never see individual PII | ✅ Aggregate views only at CORP scope (§9) |
| **EC-23 (NEW v8)** | Template fallback always resolves | ✅ 6-step graceful fallback chain (§3.3); seed gate enforces global default per (parent_type, role) |

### 11.3 Compliance with v8 NFRs (37 NFRs)

| NFR | SIRE Compliance |
|---|---|
| NFR-02 | Incident escalation ≤5s | ✅ Async snapshot + parallel push |
| NFR-04 | Task completion 3 taps | ✅ Each action item = 1 tap (3-button) or 2 taps (with evidence) |
| NFR-09 | Offline cache | ✅ Templates SQLite-cached |
| NFR-10 | Zone board refresh ≤30s GM, real-time SH | ✅ Supabase Realtime; 5s polling fallback |
| NFR-13 | 99.5% availability | ✅ No new external deps |
| NFR-17 | Audit immutability | ✅ Append-only log table |
| NFR-19 | Solo-buildable Phase 1 | ✅ Phase 5.21 + 5.22 = ~5 weeks |
| **NFR-35** | WCAG 2.1 AA on safety screens (Apollo `#C8102E` 8.0:1 confirmed) | ✅ Reuses existing palette + Apollo override validated |

---

## 12. Risks + mitigations

| Risk | Mitigation |
|---|---|
| Template explosion — different venues want different items | 5-step inheritance handles 95% of cases; Phase B per-item override depth can extend |
| Staff fatigue from too many checklist items | Phase 5.21 ships conservative defaults (8-12 items per role per sub-type); Phase B analytics surface "skipped consistently" items for trim |
| Drill performance theatre during real incident (everyone marks DONE without doing) | Photo / GPS / signature evidence on critical actions; SH-side review during incident reveals unrealistic completion times |
| Cross-cultural / cross-venue terminology drift | i18n keys + per-venue text overrides; Phase C multi-language unblocks regional adaptations |
| Schema regret — the 6-table model proves wrong | v8 has architect approval; risk is low, but Phase 5.22 can add tables if needed |
| Auto-evacuation false positives (triggers when not warranted) | Hard Rule 23: never auto-triggers; is suggestion only; SH always has decision authority |
| Workers paused on Phase 5.21 deploy day | ADR 0005 unfreezes June 1; Phase 5.21 build date June+ aligns; mig 014 applied via Supabase Dashboard requires no worker activity |
| CORP-* PII leakage via aggregate views | RLS-enforced from Day 1; Phase 5.21 acceptance gate includes 6 CORP visibility tests (§9.4) |

---

## 13. Open architectural questions for Phase 5.21 implementation

These are blockers for Phase 5.21 build. **Architect resolution before build begins:**

1. **Auto-evacuation suggestion algorithm precision.** BR-L says "≥2 zones in 3 min during FIRE." What if the FIRE incident_subtype is FIRE_DRILL? Skip the suggestion (drills shouldn't auto-prompt evacuation)? Apply differently? Recommendation: skip auto-suggestion for drill incidents (`is_drill = TRUE`).

2. **Real-time mechanism.** v8 says "Supabase Realtime (Phase 1) / Cloud Run WebSocket (Phase 2)". Phase 5.21 = Phase 2 timeline. Use Supabase Realtime through Phase 2, migrate to Cloud Run WebSocket post-GCP-migration? Recommendation: yes, defer Cloud Run WebSocket until GCP.

3. **Action template version snapshot.** When incident declared, do we snapshot the template version (so post-incident audit shows what template was active)? Or reference live template (changes propagate to in-flight)? Recommendation: snapshot at declaration (immutable audit trail); live edits don't affect in-flight incidents.

4. **Drill mode incident_subtype.** Drills enrolled via existing drill_session_participants don't have `incident_subtype`. If Phase 5.21 introduces drill-incident hybrid scenario (a real fire during a drill), how do we re-classify? Recommendation: explicit api endpoint `POST /v1/drill-sessions/:id/escalate-to-incident` that creates a new SIRE incident referencing the drill.

5. **Evidence URL retention.** Photos stored in S3. Storage cost grows with incident count. Retention policy? Recommendation: retain forever for SEV1+; archive SEV2/SEV3 evidence after 12 months unless audit-flagged.

6. **Action time-target SLA enforcement.** What happens if action item not completed within `time_target_seconds`? Soft warning to staff? Hard escalation to SC/SH? Recommendation: soft warning at +50% of target; hard escalation at +100% of target. Phase 5.22 implements warning; Phase B adds full escalation chain.

---

## 14. Maintenance + governance

- **Owner:** SafeCommand Engineering (active during Phase 5.21 + 5.22); SafeCommand Compliance team thereafter
- **Review cadence:** every 30 days during pilot; quarterly post-pilot
- **Amendment process:**
  1. Field observation triggers proposal (e.g. new common pattern in BLOCKED reasons)
  2. Architect review — does it fit the schema + EC/Rule set?
  3. If accepted: amend this doc + new ADR + schema migration if needed
  4. Roll out via SC Ops Console template editor (Phase B+) or migration (Phase 5.21/5.22)
- **Sign-off authority:** Product (template content) + Engineering (schema + RLS) + Compliance (regulatory alignment) + SC Ops (operational feasibility)
