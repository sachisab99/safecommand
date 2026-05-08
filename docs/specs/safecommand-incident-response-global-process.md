# SafeCommand — Incident Response: Global Process Specification
## Research & Architecture Document | Version 1.0 | May 2026
### Nexus Archive Research + Feature Engineering

> **Document Purpose:**
> Deep research synthesis + feature specification for evolving SafeCommand's incident response from a binary *"I am safe / Resolve"* model into a structured, role-keyed, zone-aware global process for every event type.
>
> **Scope:** Supermalls · Hospitals · IT Parks · Hotels · Residential / Gated Communities
>
> **Companion:** Enriches and extends `incident-response-activity-templates.md` (Phase 5 draft). Not a replacement — a strategic layer above it.

---

## Part 1 — Why "I Am Safe" Is Not Enough: The Evidence

### 1.1 The global regulatory consensus

Every major emergency management framework in the world has reached the same conclusion: **acknowledgement without action is not compliance.** Specifically:

| Framework | Source | Key Mandate |
|---|---|---|
| **ISO 22320:2018** | International | Incident response must be decomposable into role-keyed objectives with chain-of-command accountability |
| **NFPA 1561:2020** | US fire services | Per-position checklists mandatory for fire-ground operations |
| **NFPA 101:2024** | US life safety | Updated emergency action plan requirements include assigned role-specific actions, not just notification |
| **HICS 5th Edition (2014)** | US healthcare | 23 Job Action Sheets (JAS) per incident type — one per functional role, detailing specific sequential actions |
| **NIMS / ICS** | US federal | Modular role hierarchy (IC → Operations → Divisions → Groups → Single Resources) with per-role responsibility matrices |
| **OSHA 29 CFR 1910.38** | US workplace | Minimum requirement: assigned roles + emergency procedures per incident type, not just headcount |
| **Joint Commission EM Standards** | US healthcare | Six critical EOP areas including specific staff role assignments per incident |
| **NABH §EM (6th Edition, 2025)** | India healthcare | Per-clinical-role action checklists for Code Red / Blue / Pink / Black / Orange — auditable per-role action records |
| **NDMA Fire Safety Guidelines** | India | Role assignments for owner / occupier / fire warden / floor warden / search-and-rescue per floor |
| **Telangana Fire Service Form FF-3** | India (pilot region) | Drill records must include per-role action documentation, not just attendance lists |
| **Martyn's Law (UK, 2025)** | UK | Public venues must have specific attack emergency plans with defined staff roles and documented procedures |
| **NFPA 3000** | US | Active shooter preparedness with role-specific response protocols per venue occupancy type |

### 1.2 What the draft already got right

The Phase 5 activity templates draft correctly identified the structural problem and proposed a sound 3-tier template engine. This document **validates and enriches** that foundation — it does not replace it.

**Confirmed-correct decisions from the draft:**
- Snapshot-at-declare model (Option A in §11.1) ✅
- Most-specific-wins inheritance resolution ✅
- Evidence types: VERBAL / PHOTO / GPS / SIGNATURE / NOTE ✅
- DONE / NOT_APPLICABLE / BLOCKED action states ✅
- 8-role permission model as template axis ✅
- 3-tier template inheritance: GLOBAL → VENUE_TYPE → VENUE_SPECIFIC ✅

### 1.3 The three gaps this document fills

1. **Incident taxonomy enrichment** — The 6 current types (FIRE / MEDICAL / SECURITY / EVACUATION / STRUCTURAL / OTHER) are validated but need **sub-types** to drive meaningfully different action templates. A bomb threat and an active aggressor both map to SECURITY but demand completely different immediate responses.

2. **Zone-validation and selective evacuation workflow** — The draft has no model for *how a Fire incident flows through zone-by-zone validation and triggers partial or full evacuation*. This is the feature gap Sachin specifically identified — and it is the most operationally critical.

3. **Staff action evolution** — "I am safe" needs to evolve into a **3-button model** with zone-aware consequences. Specifically for Fire: **I Am Safe / Mark Zone Clear / Trigger Evacuation** (zone-selective). This document specifies that workflow end-to-end.

---

## Part 2 — Incident Type Taxonomy: Validation and Enrichment

### 2.1 Current types: validation

All 6 current incident types are validated as correct. The HICS, ICS, NFPA, and NABH frameworks map directly onto them. No type should be removed.

| SafeCommand Type | Industry Standard Equivalents | Validated Against |
|---|---|---|
| `FIRE` | NABH Code Red · NFPA Code Red · ICS Structure Fire | NFPA 101, NABH §EM, NBC 2016, Telangana Fire Service |
| `MEDICAL` | NABH Code Blue (cardiac) · Code Yellow (mass casualty) · HICS Medical Surge | NABH §EM, HICS JAS, Joint Commission EM |
| `SECURITY` | NABH Code Black (bomb) · Code Silver (active shooter) · Code Pink (abduction) · Code Grey (aggressor) | HICS, NFPA 3000, Martyn's Law, CISA, OSHA |
| `EVACUATION` | NABH Code Green · ICS Evacuation Operations | NFPA 101, NDMA, HICS |
| `STRUCTURAL` | NABH Code Orange (hazmat) · Code White (severe weather) · ICS Hazmat | NDMA, NBC 2016, IS 15883 |
| `OTHER` | ICS "Unknown/All-Hazards" general response | ISO 22320, NIMS |

### 2.2 Sub-types: the critical addition

The research finding is unambiguous: **same parent type, radically different immediate action protocol.** A bomb threat and an active aggressor are both `SECURITY` events, but:

- Bomb threat: do NOT evacuate until bomb disposal confirms; shelter-in-place or controlled area-by-area sweep
- Active aggressor: RUN-HIDE-FIGHT immediately; evacuation-or-lockdown per threat location
- Infant abduction: full lockdown, no one exits, search protocol

Sub-types serve two purposes in SafeCommand:
1. Drive **different action template selection** at incident-declare time
2. Drive **different escalation routing** (bomb threat → police only; cardiac → 108 only; fire → 101 + fire brigade)

### 2.3 Complete enriched incident taxonomy

```
INCIDENT_TYPE (enum level 1 — keep existing)
  └── incident_subtype (new enum level 2 — optional at declaration, SH-selectable)

FIRE
  ├── FIRE_CONTAINED       — fire in one zone/room, not spreading; suppression in progress
  ├── FIRE_SPREADING       — confirmed spread across >1 zone; full evacuation likely
  ├── FIRE_SUSPECTED       — alarm activation without confirmed flame; investigate first
  └── FIRE_DRILL           — controlled exercise (maps to existing drill mode)

MEDICAL
  ├── MEDICAL_CARDIAC      — cardiac/respiratory arrest (Code Blue); CPR + AED + 108
  ├── MEDICAL_TRAUMA       — major physical injury; stabilise + ambulance route
  ├── MEDICAL_MASS_CASUALTY — 3+ affected simultaneously; triage protocol activated
  ├── MEDICAL_MENTAL_HEALTH — acute psychiatric episode; de-escalation + specialist
  └── MEDICAL_OBSTETRIC    — emergency childbirth (relevant for mall, hospital)

SECURITY
  ├── SECURITY_ACTIVE_AGGRESSOR — armed or unarmed violent person; RUN-HIDE-FIGHT
  ├── SECURITY_BOMB_THREAT       — verbal/written/device threat; do NOT evacuate until EOD
  ├── SECURITY_SUSPICIOUS_ITEM   — unattended bag/package; cordon + police, do NOT touch
  ├── SECURITY_ABDUCTION         — infant/child abduction (Code Pink); lockdown + search
  ├── SECURITY_TRESPASS          — unauthorised access to restricted zone; contain + identify
  ├── SECURITY_CIVIL_UNREST      — crowd disruption, riot-level behaviour in venue
  └── SECURITY_CYBER_PHYSICAL    — access control/surveillance system failure under duress

EVACUATION
  ├── EVACUATION_FULL            — entire venue evacuated
  ├── EVACUATION_PARTIAL_ZONE    — 1 or more specific zones evacuated (new — see Part 3)
  ├── EVACUATION_PARTIAL_FLOOR   — specific floor(s) evacuated
  ├── EVACUATION_SHELTER_IN_PLACE — occupants directed to safe rooms, NOT evacuating
  └── EVACUATION_DRILL           — planned exercise

STRUCTURAL
  ├── STRUCTURAL_GAS_LEAK        — gas detected; utility isolation + no ignition sources
  ├── STRUCTURAL_FLOOD_WATER     — water ingress; electrical isolation + evacuation of affected zone
  ├── STRUCTURAL_BUILDING_DAMAGE — visible cracks/collapse risk; structural engineer required
  ├── STRUCTURAL_POWER_FAILURE   — total or partial power loss; UPS/generator + dark-area sweep
  ├── STRUCTURAL_LIFT_ENTRAPMENT — person(s) trapped in lift; maintenance + 108
  ├── STRUCTURAL_HAZMAT          — chemical/biological spill; PPE + specialist response
  └── STRUCTURAL_SEVERE_WEATHER  — flood, storm, earthquake; venue-type specific

OTHER
  ├── OTHER_VIP_EVENT            — high-security visitor; elevated posture, no disruption
  ├── OTHER_MEDIA_INCIDENT       — press event, viral social media about venue
  ├── OTHER_UTILITY_SERVICE      — planned shutdown (power, water) with safety implications
  └── OTHER_UNKNOWN              — catch-all; SH must reclassify within 15 minutes
```

### 2.4 Sub-type to template resolution

```
Template resolution at incident-declare time:

Step 1: Match on (incident_type + incident_subtype) if template exists at that specificity
Step 2: Fall back to parent (incident_type only) template if no subtype match
Step 3: Fall back to global default if no venue-specific or venue-type match

Example:
  Declare: SECURITY / SECURITY_BOMB_THREAT at Hospital_A (NABH-accredited)
  Resolution chain:
    1. Hospital_A venue-specific SECURITY_BOMB_THREAT template?  → if yes, USE
    2. HOSPITAL venue-type SECURITY_BOMB_THREAT template?        → if yes, USE
    3. GLOBAL SECURITY_BOMB_THREAT template?                     → if yes, USE
    4. GLOBAL SECURITY template (parent)?                        → USE as fallback
```

---

## Part 3 — The Zone Validation + Evacuation Trigger Workflow

### 3.1 The problem this solves

Current state: SH declares a FIRE incident. Every staff member sees the incident. The only thing staff can do is "I Am Safe."

This is operationally inadequate because:
- SH has no way to know which zones have been physically cleared
- SH cannot selectively trigger evacuation for the affected zones without evacuating the whole venue
- Ground staff cannot communicate *zone status* (clear / occupants present / access blocked)
- The decision to escalate from "fire in Zone B-3" to "full venue evacuation" is made blindly

**What the standard says (NFPA 101:2024, HICS, NDMA Fire Safety):** Zone-by-zone validation before committing to full evacuation is both permitted and preferred in complex buildings. Progressive or phased evacuation reduces stampede risk and staircase congestion.

### 3.2 Industry models for zone-based evacuation

**Two-Stage Evacuation (BS 9999, used in UK and adopted in India commercial buildings):**
Stage 1 — Alarm activates in affected zone only. Staff validate that zone.
Stage 2 — If Stage 1 cannot contain, general alarm triggers full evacuation.
SafeCommand should implement this as a digital-native workflow.

**Progressive Horizontal Evacuation (NFPA 101, healthcare):**
Move occupants from the fire zone to the adjacent fire-resistant compartment on the same floor.
Only if the horizontal compartment is compromised, move vertically.
Critical for hospitals where vertical evacuation of ICU patients is dangerous.

**ICS Zone Semantics (fire ground):**
- HOT ZONE: Active fire; no civilians
- WARM ZONE: Adjacent; first responders only
- COLD ZONE: Assembly / staging; all civilians and unneeded staff

SafeCommand's venue zones map onto this during a Fire incident.

### 3.3 The evolved action state model

Replace the current binary model with a **3-state + zone-aware** model:

```
Current state (binary):
  [I Am Safe]   [Resolve Incident]

Evolved state (3-button, context-aware):
  [✓ I Am Safe + Zone Clear]
  [⚠ Zone Needs Attention]       ← NEW — "there are people here / access blocked / I can't clear this"
  [🚨 Trigger Zone Evacuation]   ← NEW — "this zone needs evacuation NOW" — cascades to SH + floor

For SH / Shift Commander only:
  [🏃 Trigger Partial Evacuation: Select Zones]   ← NEW — zone multi-select + confirm
  [🏃 Trigger Full Evacuation: All Zones]
  [✅ Zone Confirmed Clear by SH]
  [🔓 Resolve Incident]
```

### 3.4 Zone states during a Fire incident

Each zone in the venue tracks through this state machine during an active FIRE incident:

```
ZONE STATE MACHINE — FIRE INCIDENT
═══════════════════════════════════

                    ┌─────────────────────────────────────────────────────┐
                    │                   INCIDENT DECLARED                 │
                    │           SH taps: FIRE / subtype / zone(s)         │
                    └───────────────────────┬─────────────────────────────┘
                                            │
                                    All venue zones enter:
                                            ▼
                              ┌────────────────────────┐
                              │  UNVALIDATED           │
                              │  (pending staff sweep) │
                              └────────────┬───────────┘
                                           │
                    ┌──────────────────────┼──────────────────────┐
                    │                      │                      │
                    ▼                      ▼                      ▼
         ┌──────────────────┐  ┌────────────────────┐  ┌───────────────────┐
         │  ZONE_CLEAR      │  │  NEEDS_ATTENTION   │  │  EVACUATION       │
         │                  │  │                    │  │  TRIGGERED        │
         │ GS tapped        │  │ GS tapped          │  │                   │
         │ "Safe + Clear"   │  │ "Zone Needs        │  │ GS or FS tapped   │
         │                  │  │  Attention"        │  │ "Trigger Zone     │
         │ FS confirms by   │  │                    │  │  Evacuation"      │
         │ floor walk       │  │ FS notified        │  │                   │
         │                  │  │ immediately        │  │ — OR —            │
         │ SC sees: ✅       │  │                    │  │ SH triggered from │
         │                  │  │ SC sees: ⚠          │  │ dashboard         │
         └────────┬─────────┘  └──────────┬─────────┘  └────────┬──────────┘
                  │                       │                     │
                  │            SH reviews  │           Zone     │
                  │            and decides │           evacuation│
                  │                       │           in progress│
                  │                       │                     │
                  │       ┌───────────────┴──────────────────┐  │
                  │       │   SH DECISION POINT              │  │
                  │       │                                  │  │
                  │       │  Option A: Reclassify as CLEAR   │  │
                  │       │  Option B: Trigger Zone Evac     ├──┘
                  │       │  Option C: Trigger Full Evac     │
                  │       └──────────────────────────────────┘
                  │
                  ▼
         ┌──────────────────┐
         │   SH_CONFIRMED   │
         │   CLEAR          │
         │                  │
         │ SH taps confirm  │
         │ from dashboard   │
         │                  │
         │ SC sees: ✅✅      │
         └──────────────────┘


EVACUATION_TRIGGERED → triggers:
  1. Push notification to all staff in affected zone: "EVACUATE ZONE [X] NOW"
  2. WhatsApp broadcast to all staff in affected zone
  3. PA system announcement text generated: "Attention: Please evacuate [Zone Name] immediately..."
  4. SH dashboard: zone turns RED with pulsing indicator
  5. If fire is FIRE_SPREADING or SH selects: expand to adjacent zones
  6. Zone status locks to EVACUATING until SH or SC marks it EVACUATION_COMPLETE

EVACUATION_COMPLETE conditions:
  - Floor Supervisor confirms via "Zone Swept + Empty" action (photo evidence)
  - OR SH manually marks from dashboard with note
  - Zone status: EVACUATED_CLEAR
```

### 3.5 Partial evacuation workflow: UI specification

**Scenario:** Fire reported in Zone B-3 (east wing, 2nd floor of a mall). SH wants to evacuate east wing 2nd floor only, not the whole mall.

```
Step 1 — SH sees incident live on dashboard
  Incident card shows: Zone B-3 — FIRE_SUSPECTED — 0 zones validated

Step 2 — SH reviews zone validation grid
  Zone grid shows:
    Zone B-1: UNVALIDATED
    Zone B-2: UNVALIDATED  
    Zone B-3: UNVALIDATED  ← fire origin
    Zone B-4: UNVALIDATED
    Zone C-1: UNVALIDATED
    (etc.)

  Ground staff in Zone B-3 taps "Zone Needs Attention" → zone turns AMBER
  Ground staff in Zone B-1 taps "Safe + Clear" → zone turns GREEN

Step 3 — SH decides to trigger partial evacuation
  SH taps: "Trigger Selective Evacuation" on dashboard
  Multi-select zone picker opens:
    [x] Zone B-3  (AMBER — needs attention)
    [x] Zone B-4  (selected by SH — adjacent to fire)
    [ ] Zone B-1  (GREEN — cleared)
    [ ] Zone B-2  (unvalidated — SH leaves for now)
  SH taps: "Confirm — Evacuate Selected Zones" + mandatory reason note

Step 4 — System executes
  Notification fan-out:
    → All GS in Zone B-3 and B-4: push + WhatsApp: "EVACUATE NOW. Proceed to Assembly Point 2"
    → All FS on Floor 2: "Zones B-3 and B-4 evacuation triggered. Confirm sweep."
    → SH: confirmation that fan-out sent
    → GM: "Partial evacuation triggered: Zones B-3, B-4. SH [Name] is IC."

  PA text generated: "Attention all visitors on Floor 2, East Wing.
    Please proceed calmly to the nearest fire exit.
    Staff will guide you. Do not use lifts."

Step 5 — Zone status progresses
  Staff complete evacuation checklist actions
  FS confirms zone empty: photo upload + "Zone Swept" tap
  Zone B-3: EVACUATED_CLEAR (green with flag)
  Zone B-4: EVACUATED_CLEAR

Step 6 — SH decides: incident contained or escalate
  Option A: Mark incident resolved → zones return to NORMAL post-incident
  Option B: Fire spreading → tap "Expand Evacuation" → add more zones → repeat Step 3
  Option C: Full venue evacuation → tap "Full Evacuation" → all zones trigger simultaneously
```

### 3.6 The 3-button model: complete specification

```
BUTTON MODEL PER ROLE DURING FIRE INCIDENT
════════════════════════════════════════════

GROUND STAFF (zone-level, most common user):

  Primary screen during incident:
  ┌────────────────────────────────────────────┐
  │ 🚨 FIRE — Zone B-3 — YOUR ACTIONS (3/8)   │
  │ Zone Status: UNVALIDATED                   │
  ├────────────────────────────────────────────┤
  │ Complete your zone sweep first, then:      │
  │                                            │
  │  ✅ SAFE + ZONE CLEAR                      │
  │     "I swept my zone. No one remains."     │
  │                                            │
  │  ⚠  ZONE NEEDS ATTENTION                   │
  │     "People here / blocked / I can't clear"│
  │     → requires free-text reason (≥10 chars)│
  │                                            │
  │  🚨 TRIGGER EVACUATION                     │
  │     "Evacuate this zone immediately"        │
  │     → confirmation dialog                  │
  │     → auto-notifies SH + SC + FS           │
  └────────────────────────────────────────────┘

FLOOR SUPERVISOR (floor-level command):

  ┌────────────────────────────────────────────┐
  │ 🚨 FIRE — Floor 2 — YOUR ACTIONS (2/6)    │
  │ Zone Status Grid:                          │
  │   B-1: ✅ CLEAR   B-2: ⬜ UNVALIDATED      │
  │   B-3: ⚠ ATTENTION  B-4: ⬜ UNVALIDATED    │
  ├────────────────────────────────────────────┤
  │  ✅ CONFIRM FLOOR CLEAR                    │
  │     (only enabled after ALL zones CLEAR)   │
  │                                            │
  │  ⚠  FLOOR NEEDS ATTENTION                  │
  │     → specify zone(s) + reason             │
  │                                            │
  │  🚨 TRIGGER FLOOR EVACUATION               │
  │     → evacuates entire floor               │
  │     → requires confirmation                │
  └────────────────────────────────────────────┘

SHIFT COMMANDER / SH (venue-wide command):

  Dashboard panel — Fire Incident:
  ┌────────────────────────────────────────────┐
  │ ZONE VALIDATION GRID                       │
  │ [Live updating — refreshes every 10s]      │
  │                                            │
  │ Zone  Staff  Status    Action              │
  │ B-1   Raju   ✅ CLEAR  [Confirm SH]        │
  │ B-2   Priya  ⬜ PENDING  —                 │
  │ B-3   Ahmed  ⚠ ATTENTION  [Evac / Review] │
  │ B-4   Meera  ⬜ PENDING  —                 │
  ├────────────────────────────────────────────┤
  │ ACTIONS:                                   │
  │  [🏃 Selective Evacuation — Pick Zones]    │
  │  [🏃 Full Venue Evacuation]                │
  │  [📢 PA Announcement — Auto-draft]         │
  │  [✅ Mark Incident Resolved]               │
  └────────────────────────────────────────────┘
```

---

## Part 4 — Per-Event-Type Global Process: Enriched Templates

### Overview

This section defines the **authoritative global process** for each incident type. It enriches the Phase 5 draft's action templates with:
- Sub-type-specific variations where the response differs significantly
- Cross-venue-type notes (Hospital vs Mall vs IT Park vs Residential)
- Industry standards citation per action
- Time targets validated against ICS / HICS / NABH benchmarks

---

### 4.1 FIRE

**Authoritative standards:** NFPA 101:2024, NFPA 1561:2020, NABH §EM Code Red, NDMA Fire Safety Guidelines, NBC 2016, Telangana FF-3 Form

**Sub-type variations:**
- `FIRE_SUSPECTED`: Investigate before declaring; avoid false full evacuation
- `FIRE_CONTAINED`: Zone-level actions + suppression; selective evacuation only
- `FIRE_SPREADING`: Full evacuation imminent; compress all timelines

**Critical time targets (per NFPA 101:2024 and NDMA):**
- Alarm-to-first-acknowledgement: ≤60 seconds
- Zone sweep complete: ≤3 minutes (small zone) / ≤5 minutes (large zone)
- Assembly point confirmation: ≤8 minutes from alarm
- Fire Brigade contact (India 101): within first 2 minutes of any confirmed fire

#### Global Action Templates — FIRE

> Key upgrade from draft: GS-level action 7 is now "Mark Zone Clear OR Zone Needs Attention OR Trigger Evacuation" instead of flat "I Am Safe."

**SH (Incident Commander)**

| # | Sub-type | Pri | Time Target | Loc | Action | Evidence | Notes |
|---|---|---|---|---|---|---|---|
| 1 | ALL | IMM | 0–30s | V | Confirm alarm activation status; if not auto-triggered, activate manually | V | India: Manual call point at SH post |
| 2 | ALL | IMM | 0–60s | E | Phone Fire Service: 101 — venue address + floor + access route + occupancy | V + N | Required first action per NDMA |
| 3 | ALL | IMM | 0–60s | V | Establish ICS command post at assembly point or pre-designated location | V | Per ISO 22320:2018 |
| 4 | ALL | IMM | 0–90s | V | Broadcast via PA system; if not available, push SafeCommand broadcast to all staff | V | PA text auto-draft in app |
| 5 | CONTAINED | IMM | 1–2min | V | Assign zone sweep — confirm assigned GS in fire zone are executing | V | |
| 6 | SPREADING | IMM | 1–2min | V | Trigger full evacuation from dashboard; do not wait for zone validation | V | NFPA 101: if spreading, immediate full evac |
| 7 | SUSPECTED | IMM | 1–2min | V | Assign SC/FS to investigate and report zone status before declaring evacuation | V | Two-stage evacuation (BS 9999) |
| 8 | ALL | STR | 3–8min | V | Review zone validation grid on dashboard; make selective or full evacuation decision | V | Core of the new workflow |
| 9 | ALL | STR | 5–10min | V | Receive Fire Brigade on arrival; brief: building layout, fire location, occupancy count | V + N | HICS equivalent: incident briefing |
| 10 | ALL | STR | Ongoing | V | Coordinate FM on utility isolation (electricity, gas); confirm via dashboard | V | |
| 11 | ALL | STR | Ongoing | V | Maintain assembly point headcount; review participation matrix | V | |
| 12 | ALL | STR | Post-evac | V | Authorise re-entry ONLY on Fire Brigade all-clear; no earlier | V + S | Strict — see NABH §EM |
| 13 | ALL | RES | Post-event | V | Initiate post-incident review; lock incident record; trigger compliance report | V + N | NABH §EM + Telangana FF-3 |

**DSH (Deputy — assumes IC role if SH unreachable per BR-13)**

| # | Pri | Time Target | Loc | Action | Evidence |
|---|---|---|---|---|---|
| 1 | IMM | 0–30s | V | Confirm SH reachable; if not, assume IC role via app (triggers BR-13 deputy activation) | V |
| 2 | IMM | 0–60s | V | Secure perimeter — staff to prevent re-entry of evacuated occupants | V |
| 3 | IMM | 1–2min | E | Confirm Fire Brigade en-route; coordinate vehicle access lane | V + N |
| 4 | STR | 3min+ | V | Communications discipline — no media disclosure, no social media | V + N |
| 5 | STR | Ongoing | V | Liaise with SH on accountability updates | V |
| 6 | RES | Post-event | V | Support post-incident review and record preparation | V |

**Shift Commander**

| # | Sub-type | Pri | Time Target | Loc | Action | Evidence |
|---|---|---|---|---|---|---|
| 1 | ALL | IMM | 0–60s | F | Direct floor GS to begin zone sweeps; confirm via zone grid | V |
| 2 | ALL | IMM | 0–90s | F | Confirm lifts taken out of service (manual verify + photo) | V + P |
| 3 | ALL | IMM | 1–2min | F | Walk floor personally — high-risk areas: restrooms, service corridors, retail back-of-house | V |
| 4 | HOSPITAL | IMM | 0–60s | F | Identify bedridden/non-ambulatory patients; trigger horizontal evacuation protocol | V + N |
| 5 | ALL | STR | 3–5min | V | Report floor status to SH: cleared / occupants present / zone blocked | V |
| 6 | ALL | STR | 5–8min | V | Manage assembly point; report headcount to SH | V |
| 7 | ALL | STR | Ongoing | V | Confirm mobility-impaired persons reached refuge area or evacuation chair | V + N |
| 8 | ALL | RES | Post-event | V | Submit floor-level incident completion to SH | V |

**Floor Supervisor**

| # | Sub-type | Pri | Time Target | Loc | Action | Evidence |
|---|---|---|---|---|---|---|
| 1 | ALL | IMM | 0–60s | F | Initiate/confirm floor PA announcement; instruct calm orderly evacuation | V |
| 2 | ALL | IMM | 0–90s | F | Walk zone-by-zone; close fire doors behind you (per NBC 2016) | V + P |
| 3 | ALL | IMM | 1–2min | F | Redirect anyone heading to lifts to fire stairs | V |
| 4 | MALL/HOTEL | IMM | 1–2min | F | Identify visitors/customers; guide to nearest marked exit | V |
| 5 | HOSPITAL | IMM | 0–60s | F | Horizontal evacuation — move ambulatory patients/visitors to adjacent compartment | V + N |
| 6 | ALL | STR | 3–5min | F | Last out of floor — visual + photographic confirmation of empty floor | V + P |
| 7 | ALL | STR | 3–5min | F | Tap "Floor Confirmed Clear" — triggers zone grid update for SC/SH | V |
| 8 | ALL | STR | 5min+ | V | Report floor headcount + any abnormalities to SC at assembly point | V + N |

**Ground Staff** *(— the critical evolution from "I Am Safe")*

| # | Sub-type | Pri | Time Target | Loc | Action | Evidence |
|---|---|---|---|---|---|---|
| 1 | ALL | IMM | 0–15s | A | Acknowledge incident alert — opens action checklist on mobile | V |
| 2 | ALL | IMM | 0–30s | A | Begin zone sweep: restrooms → changing rooms → service rooms → retail back-of-house | V |
| 3 | ALL | IMM | 1–2min | A | Close all fire doors behind you as you exit the zone | V |
| 4 | ALL | IMM | 1–2min | A | Assist any mobility-impaired persons to evacuation route or refuge area | V + N |
| 5 | ALL | IMM | 1–2min | A | Count/note any visitors/customers directed out of zone | V + N |
| 6 | ALL | IMM | 2–3min | A | **EVOLVED ACTION: Tap zone status button:** | |
| | CLEAR | | | | → ✅ "SAFE + ZONE CLEAR" — zone is empty, all fire doors closed, I am exiting | V |
| | ISSUE | | | | → ⚠ "ZONE NEEDS ATTENTION" — reason note required | V + N |
| | DANGER | | | | → 🚨 "TRIGGER EVACUATION" — auto-notifies SC/FS/SH | V |
| 7 | ALL | STR | 3–5min | E | Proceed to designated assembly point | G (GPS confirm) |
| 8 | ALL | STR | 5–8min | E | Report to FS at assembly point; declare self accounted | V |
| 9 | ALL | RES | Post-event | V | Submit zone-clear completion note + any observed abnormalities | N |

**FM (Facility Manager)**

| # | Pri | Time Target | Loc | Action | Evidence |
|---|---|---|---|---|---|
| 1 | IMM | 0–60s | V | Confirm fire suppression activated (sprinklers, FM200, etc.) | V |
| 2 | IMM | 0–90s | V | Isolate electrical supply to non-critical zones (SH authorisation required) | V + N |
| 3 | IMM | 1–2min | V | Isolate gas mains; isolate fuel lines | V + N |
| 4 | IMM | 1–2min | V | Confirm emergency lighting and exit signs operational | V + P |
| 5 | STR | 3min+ | V | Coordinate with utility companies if required | V |
| 6 | RES | Post-event | V | Document all utility shutdowns with timestamps; restoration timeline | N |

**GM**

| # | Pri | Loc | Action | Evidence |
|---|---|---|---|---|
| 1 | IMM | V | Brief tenant retailers / occupants — their staff follow own protocols | V |
| 2 | STR | V | Manage public/media communication — calm, controlled | V + N |
| 3 | STR | E | Coordinate with corporate operations | V |
| 4 | RES | V | Brief insurance and corporate on damage assessment | N |

---

### 4.2 MEDICAL

**Authoritative standards:** NABH Code Blue (cardiac), HICS Medical Surge JAS, IS 13947, NDMA, OSHA 1910.151

**Critical time standards:**
- Code Blue response (cardiac): First responder on-scene within 3 minutes (NABH mandate)
- AED shock within 3–5 minutes maximises survival
- Ambulance contact (India 108): within first 60 seconds of confirmed medical emergency

#### Sub-type differences

| Sub-type | Key difference from default |
|---|---|
| `MEDICAL_CARDIAC` | AED deployment is immediate, mandatory; CPR-trained staff must respond in 3 min |
| `MEDICAL_TRAUMA` | Minimal movement; stabilise in-place; do not move suspected spinal injury |
| `MEDICAL_MASS_CASUALTY` | Triage protocol: START (Simple Triage and Rapid Treatment); 3+ casualty threshold |
| `MEDICAL_MENTAL_HEALTH` | DO NOT physically restrain; de-escalation only; specialist required |
| `MEDICAL_OBSTETRIC` | Hospital: obstetrics team immediate. Non-hospital: 108 + basic obstetric first aid |

**SH**

| # | Pri | Time | Loc | Action | Evidence |
|---|---|---|---|---|---|
| 1 | IMM | 0–60s | E | Phone ambulance (108); venue address + floor + patient condition | V + N |
| 2 | IMM | 0–60s | V | Designate first responder if not yet on scene; assign from closest trained staff | V |
| 3 | IMM | 0–90s | V | Reserve elevator for medical access; broadcast to clear path for stretcher | V |
| 4 | IMM | 1–2min | V | Clear access route from main entrance to patient location | V |
| 5 | MASS_CASUALTY | IMM | 0–60s | V | Activate mass-casualty protocol; assign triage officer (trained) | V |
| 6 | STR | 3min+ | V | Escort paramedics to scene on arrival | V |
| 7 | STR | Ongoing | V | Coordinate with patient's employer/family if required | V + N |
| 8 | RES | Post-event | V | Manual incident closure; medical transfer confirmed | V + N |

**Floor Supervisor**

| # | Sub-type | Pri | Time | Loc | Action | Evidence |
|---|---|---|---|---|---|---|
| 1 | ALL | IMM | 0–30s | F | Locate and retrieve nearest AED + first aid kit | V + P (photo of AED ready) |
| 2 | CARDIAC | IMM | 0–60s | A | If BLS-trained: begin CPR; if not, locate nearest trained colleague | V + N |
| 3 | CARDIAC | IMM | 0–90s | A | Apply AED per AED device guidance | V |
| 4 | ALL | IMM | 0–60s | A | Clear crowd from scene; maintain 2-metre clear radius | V |
| 5 | TRAUMA | IMM | 0–30s | A | Do NOT move patient; stabilise in-place; note suspected injuries | V + N |
| 6 | ALL | STR | 3min+ | A | Handover to paramedics; provide witnessed symptom timeline | V + N |
| 7 | ALL | STR | Ongoing | A | Maintain observation log until handover | N |

**Ground Staff**

| # | Sub-type | Pri | Time | Loc | Action | Evidence |
|---|---|---|---|---|---|---|
| 1 | ALL | IMM | 0–15s | A | Render basic first aid within training scope | V |
| 2 | ALL | IMM | 0–30s | A | Call supervisor/SH; tap incident alert | V |
| 3 | ALL | IMM | 0–30s | A | Keep area clear; redirect bystanders | V |
| 4 | CARDIAC | IMM | 0–30s | A | Send a colleague to fetch the AED from nearest cabinet; stay with patient | V |
| 5 | MENTAL_HEALTH | IMM | 0–30s | A | Use calm voice; stay at distance; do NOT physically touch or restrain | V + N |
| 6 | ALL | STR | 3min+ | A | Guide ambulance from venue entrance to patient location | V |

**FM**

| # | Pri | Time | Action | Evidence |
|---|---|---|---|---|
| 1 | IMM | 0–60s | Confirm AED operational (battery indicator OK) | V + P |
| 2 | IMM | 0–60s | Open security barriers / emergency vehicle gates | V |
| 3 | STR | 1–2min | Reserve elevator for stretcher transport; lock to manual control | V |

---

### 4.3 SECURITY

**Authoritative standards:** HICS Code Silver / Black, NFPA 3000, DHS Run-Hide-Fight, NDMA, Martyn's Law (UK 2025), CISA Venue Security Guide

> **Critical principle (HICS, NFPA 3000):** Security sub-types require *fundamentally different* immediate responses. The most dangerous error is to apply an "active aggressor" (run/evacuate) response to a "bomb threat" (do NOT evacuate until EOD clears). Template sub-type selection at declaration is life-critical.

#### Sub-type divergence summary

| Sub-type | Immediate response | Evacuation? | Police contact |
|---|---|---|---|
| `SECURITY_ACTIVE_AGGRESSOR` | RUN-HIDE-FIGHT; immediate evacuation away from threat | YES — away from threat | 100 immediately |
| `SECURITY_BOMB_THREAT` | Do NOT evacuate; shelter-in-place or controlled sweep | NO (until EOD clears) | 100 immediately + NSG/ATS |
| `SECURITY_SUSPICIOUS_ITEM` | Cordon 100m; do NOT touch; evacuate area around item only | PARTIAL — blast radius | 100 immediately |
| `SECURITY_ABDUCTION` | LOCKDOWN — nobody exits; all entry/exit points sealed | NO | 100 immediately |
| `SECURITY_TRESPASS` | Contain; do not confront alone; await police | NO | 100 if refuses to leave |
| `SECURITY_CIVIL_UNREST` | Shelter staff; close shutters; monitor; manage exits | CONTROLLED | 100 if escalating |

**SH — SECURITY (all sub-types)**

| # | Sub-type | Pri | Time | Loc | Action | Evidence |
|---|---|---|---|---|---|---|
| 1 | ALL | IMM | 0–30s | V | Choose response posture: LOCKDOWN / SHELTER-IN-PLACE / EVACUATE + notify staff | V |
| 2 | ALL | IMM | 0–60s | E | Phone Police: 100; provide venue address + situation type + suspect description if available | V + N |
| 3 | ACTIVE_AGGRESSOR | IMM | 0–30s | V | Broadcast: "Secure in place / evacuate away from [location]" | V |
| 4 | BOMB_THREAT | IMM | 0–30s | V | DO NOT broadcast on PA — alerts suspect. Use push notification only to staff | V |
| 5 | BOMB_THREAT | IMM | 1–2min | V | Initiate controlled area search — trained staff only; do NOT touch suspicious items | V + N |
| 6 | ABDUCTION | IMM | 0–30s | V | FULL LOCKDOWN — all exits sealed; no one enters or exits venue | V |
| 7 | ALL | IMM | 0–60s | V | Issue communications discipline: no media, no social media, controlled tenant communication | V |
| 8 | ALL | STR | 3min+ | V | Brief police on arrival; share CCTV / access control logs | V + N |
| 9 | ALL | STR | Ongoing | V | Maintain incident log with timestamps; preserve evidence | N |
| 10 | ALL | RES | Post-event | V | Full post-incident report; coordinate with police investigation | N + S |

**Ground Staff — SECURITY**

| # | Sub-type | Pri | Time | Loc | Action | Evidence |
|---|---|---|---|---|---|---|
| 1 | ACTIVE_AGGRESSOR | IMM | 0–15s | A | RUN — if safe exit exists, evacuate immediately; help others if safe to do so | V |
| 2 | ACTIVE_AGGRESSOR | IMM | 0–30s | A | HIDE — if cannot run; lock doors; barricade; silence phones; do NOT open for anyone | V |
| 3 | BOMB_THREAT | IMM | 0–30s | A | Do NOT use mobile phones / radios near suspicious item (can trigger some devices) | V |
| 4 | BOMB_THREAT | IMM | 0–60s | A | Leave by normal exit if directed; do NOT use fire alarms (may trigger device) | V |
| 5 | ABDUCTION | IMM | 0–15s | A | Lock zone access points; no one exits; document anyone trying to exit | V + N |
| 6 | SUSPICIOUS_ITEM | IMM | 0–30s | A | Mark item location; do NOT approach or touch; cordon with tape | V + P (from distance) |
| 7 | CIVIL_UNREST | IMM | 0–30s | A | Secure zone shutters/doors; move to safe room; stay off social media | V |
| 8 | ALL | STR | Await | A | Await instruction from SH; do NOT take unilateral action | V |

---

### 4.4 EVACUATION (standalone — not fire-triggered)

**Triggers:** Gas leak, flood, structural concern, operational decision, drill

**Key distinction from Fire:** No active fire. The urgency is different. Two-stage process applies (validate first if time permits; immediate if structural/gas).

**Sub-type time differences:**

| Sub-type | Can validate first? | Full or partial? |
|---|---|---|
| `EVACUATION_FULL` | Only if no immediate life risk | All zones, all floors |
| `EVACUATION_PARTIAL_ZONE` | Yes — SH selects zones | Selected zones only |
| `EVACUATION_PARTIAL_FLOOR` | Yes — SH selects floors | Selected floors only |
| `EVACUATION_SHELTER_IN_PLACE` | Yes | No evacuation — all stay in designated rooms |
| `EVACUATION_DRILL` | N/A — planned | As per drill scope |

**SH**

| # | Sub-type | Pri | Time | Loc | Action | Evidence |
|---|---|---|---|---|---|---|
| 1 | ALL | IMM | 0–30s | V | Confirm evacuation scope (partial / full) and trigger via dashboard | V |
| 2 | ALL | IMM | 0–60s | V | Sound evacuation alarm; broadcast scope on PA | V |
| 3 | GAS_LEAK | IMM | 0–60s | E | Phone Gas Emergency (India: 1906) + Fire Brigade (101) | V + N |
| 4 | FLOOD | IMM | 0–60s | V | Confirm electrical isolation of flooded zones; notify FM | V |
| 5 | ALL | STR | 1–2min | E | Notify civil authorities if structural / utility-driven | V + N |
| 6 | ALL | STR | 3min+ | V | Authorise re-entry ONLY on engineering/structural all-clear, NOT before | V + S |

**Floor Supervisor (Partial-Evac specific)**

| # | Pri | Time | Action | Evidence |
|---|---|---|---|---|
| 1 | IMM | 0–30s | Confirm exact evacuation scope: which floors/zones | V |
| 2 | IMM | 0–60s | Direct unaffected floors NOT to evacuate (prevents staircase overcrowding — NFPA 101) | V |
| 3 | IMM | 1–2min | Monitor staircase capacity; use radio/app to stagger flow if crowded | V |
| 4 | STR | 3–5min | Confirm affected zones evacuated; tap "Floor Partial Clear" | V |

**Ground Staff (Shelter-in-Place specific)**

| # | Pri | Time | Action | Evidence |
|---|---|---|---|---|
| 1 | IMM | 0–15s | Move to designated safe room for zone; do NOT evacuate building | V |
| 2 | IMM | 0–30s | Close and seal door gaps (wet towels for gas; close vents) | V + P |
| 3 | STR | 1–2min | Account for all persons in room; report count to FS | V + N |
| 4 | STR | Ongoing | Await SH all-clear; do NOT open door until app notification received | V |

---

### 4.5 STRUCTURAL

**Authoritative standards:** NDMA, NBC 2016, IS 1893 (seismic), BIS IS 15883, OSHA 1910.119 (process safety)

**Critical principle:** STRUCTURAL events frequently require specialist confirmation before re-entry (structural engineer, utility company, hazmat team). SH cannot give all-clear alone.

**Sub-type-specific immediate actions:**

| Sub-type | First 60 seconds | Specialist required |
|---|---|---|
| `STRUCTURAL_GAS_LEAK` | NO ignition sources; phones away from leak; ventilate; evacuate | Gas company engineer |
| `STRUCTURAL_FLOOD_WATER` | Electrical isolation before entering water; do NOT use electrical equipment | FM + civil contractor |
| `STRUCTURAL_BUILDING_DAMAGE` | Evacuate affected zone; mark unsafe areas; photograph from safe distance | Structural engineer |
| `STRUCTURAL_POWER_FAILURE` | Emergency lighting; dark-area sweep; no lift use | FM + electrician |
| `STRUCTURAL_LIFT_ENTRAPMENT` | Calm voice contact with trapped person; do NOT force doors | Lift maintenance company |
| `STRUCTURAL_HAZMAT` | PPE; upwind; cordon; do NOT touch; specialist only | HAZMAT team / NDMA |
| `STRUCTURAL_SEVERE_WEATHER` | Shelter all; no outdoor areas; structural assessment if wind/flood damage | Civil authorities |

**SH**

| # | Sub-type | Pri | Time | Loc | Action | Evidence |
|---|---|---|---|---|---|---|
| 1 | ALL | IMM | 0–30s | V | Evacuate threatened zones per SH judgment; NOT full venue unless severity warrants | V |
| 2 | GAS_LEAK | IMM | 0–60s | E | Phone gas emergency (1906) + fire brigade (101); NO ignition sources | V + N |
| 3 | HAZMAT | IMM | 0–60s | E | Phone NDMA / civil defence; do NOT send untrained staff into affected area | V + N |
| 4 | POWER_FAILURE | IMM | 0–60s | V | Confirm UPS/generator active; dark-area sweep by FS | V |
| 5 | LIFT_ENTRAPMENT | IMM | 0–60s | E | Phone lift maintenance company; keep calm contact with trapped person | V + N |
| 6 | ALL | STR | 1–3min | V | Coordinate with FM on utility isolation sequence | V |
| 7 | ALL | STR | Ongoing | V | Ban re-entry until specialist all-clear — this is non-negotiable | V + S |

**FM**

| # | Sub-type | Pri | Time | Action | Evidence |
|---|---|---|---|---|---|
| 1 | ALL | IMM | 0–60s | Isolate relevant utility per sub-type (gas / electrical / water) | V + N |
| 2 | GAS_LEAK | IMM | 0–60s | Gas main shutoff; confirm with SH | V |
| 3 | FLOOD | IMM | 0–60s | Electrical isolation; water main shutoff | V |
| 4 | POWER_FAILURE | IMM | 0–30s | Confirm UPS active; switch to generator; check emergency lighting | V + P |
| 5 | BUILDING_DAMAGE | STR | 1–2min | Document damage with photographs from safe distance; contact structural engineer | P + N |
| 6 | HAZMAT | STR | 1–2min | Provide hazmat material data sheet (SDS) to emergency responders | P |
| 7 | ALL | RES | Post-event | Coordinate insurance / loss adjuster; document restoration timeline | N |

---

### 4.6 OTHER (General ICS)

**Design principle:** OTHER is a containment type. Every SH action drives toward re-classification within 15 minutes. It should never be a long-running incident type.

**SH**

| # | Pri | Time | Action | Evidence |
|---|---|---|---|---|
| 1 | IMM | 0–30s | Establish ICS; declare IC role; assign deputy | V |
| 2 | IMM | 0–60s | Assess situation — gather facts before broadcasting | V + N |
| 3 | IMM | 1–2min | Brief staff via app push: situation summary + immediate hold-position instruction | V |
| 4 | STR | 3–5min | Define response: evacuate / shelter / continue ops with caution | V |
| 5 | STR | ≤15min | Re-classify incident type if specific category is clear; create new incident in correct type | V |
| 6 | STR | Ongoing | Communicate to GM and affected staff with regular updates | V |

**All Staff (pending SH brief)**

| # | Pri | Time | Action | Evidence |
|---|---|---|---|---|
| 1 | IMM | 0–15s | Acknowledge alert | V |
| 2 | IMM | 0–30s | Stand by in position; do NOT take unilateral action | V |
| 3 | STR | Await | Execute briefed action from SH broadcast | V |

---

## Part 5 — Venue-Type Specialisation Map

### 5.1 Hospital-specific additions

Hospitals require the deepest specialisation because of non-ambulatory patients, controlled medications, and the NABH Code system.

| Incident | Hospital Addition | NABH Standard |
|---|---|---|
| FIRE (Code Red) | Horizontal evacuation mandatory before vertical; bedridden patients use evacuation frames; ICU: defend-in-place unless fire in ICU zone | NABH §EM |
| MEDICAL / CARDIAC (Code Blue) | Crash cart location check at shift start; every nurse trained in BLS; response within 3 min | NABH §DM |
| SECURITY_ABDUCTION (Code Pink) | Full lockdown; all infants checked against wristband records; all exit CCTV reviewed immediately | NABH §FMS |
| SECURITY_ACTIVE_AGGRESSOR (Code Silver) | Staff trained in ALICE protocol; panic buttons at nursing stations; police on pre-registered contact | MoHFW 2024 circular |
| MEDICAL_MASS_CASUALTY (Code Yellow) | Surge protocol; OPD cleared; wards freed by early discharge where possible; HICS activated | HICS, NDMA |
| STRUCTURAL_GAS_LEAK / HAZMAT (Code Orange) | Dedicated hazmat team; full PPE; affected wing evacuated; no patient transfer without clinical clearance | NABH §HIC |

### 5.2 Mall-specific additions

| Incident | Mall Addition | Standard |
|---|---|---|
| FIRE | Tenant retailers have their own staff — they need to receive SafeCommand alerts even though they're not SafeCommand staff (BR-24 visitor alert → tenant alert extension) | NBC 2016, NDMA |
| SECURITY_ACTIVE_AGGRESSOR | Multiplex + food court are highest density zones; Run-Hide-Fight training mandatory for F&B staff | NFPA 3000 |
| SECURITY_CIVIL_UNREST | Shutter closure sequence; anchor tenant communication; CCTV handover to police | |
| EVACUATION | Peak-period (Diwali, IPL screening) special protocol; staircase capacity pre-mapped | NFPA 101 |
| MEDICAL_MASS_CASUALTY | Multiplex audience event: crush potential; crowd flow corridors pre-mapped in SafeCommand | NDMA |

### 5.3 IT Park / Corporate-specific additions

| Incident | IT Park Addition | Standard |
|---|---|---|
| SECURITY (all) | Server room / data centre: specific "no-exit without asset check" protocol; cyber-physical incident type | ISO 27001, SOC 2 |
| EVACUATION | After-hours lone worker welfare check — confirm all after-hours staff accounted before building clear | OSHA |
| STRUCTURAL_POWER_FAILURE | UPS for critical systems; data centre cooling check; incident bridges to IT incident management | |
| FIRE | Raised floor / server room suppression (FM200/Novec) — different from standard wet sprinkler; staff trained on suppression type | NFPA 75 |

### 5.4 Residential apartment-specific additions

| Incident | Residential Addition | Standard |
|---|---|---|
| FIRE | Night-time fire protocol (most residents asleep); door-to-door sweep by security guard; children's floors prioritised | NBC 2016 |
| SECURITY_TRESPASS | Resident vs visitor distinction; domestic violence scenarios require police call not security response | |
| STRUCTURAL_POWER_FAILURE | Lift entrapment most common in residential; pump failure = no water; generator check protocol | |
| MEDICAL | Likely in-home — guard cannot enter without resident consent except confirmed life emergency | |

---

## Part 6 — Schema Evolution: New Tables and Columns

### 6.1 New `incident_subtype` column

```sql
-- Add to existing incidents table
ALTER TABLE incidents
  ADD COLUMN incident_subtype TEXT NULL
  CHECK (incident_subtype IN (
    'FIRE_CONTAINED', 'FIRE_SPREADING', 'FIRE_SUSPECTED', 'FIRE_DRILL',
    'MEDICAL_CARDIAC', 'MEDICAL_TRAUMA', 'MEDICAL_MASS_CASUALTY',
    'MEDICAL_MENTAL_HEALTH', 'MEDICAL_OBSTETRIC',
    'SECURITY_ACTIVE_AGGRESSOR', 'SECURITY_BOMB_THREAT',
    'SECURITY_SUSPICIOUS_ITEM', 'SECURITY_ABDUCTION',
    'SECURITY_TRESPASS', 'SECURITY_CIVIL_UNREST', 'SECURITY_CYBER_PHYSICAL',
    'EVACUATION_FULL', 'EVACUATION_PARTIAL_ZONE', 'EVACUATION_PARTIAL_FLOOR',
    'EVACUATION_SHELTER_IN_PLACE', 'EVACUATION_DRILL',
    'STRUCTURAL_GAS_LEAK', 'STRUCTURAL_FLOOD_WATER', 'STRUCTURAL_BUILDING_DAMAGE',
    'STRUCTURAL_POWER_FAILURE', 'STRUCTURAL_LIFT_ENTRAPMENT',
    'STRUCTURAL_HAZMAT', 'STRUCTURAL_SEVERE_WEATHER',
    'OTHER_VIP_EVENT', 'OTHER_MEDIA_INCIDENT', 'OTHER_UTILITY_SERVICE', 'OTHER_UNKNOWN'
  ));

-- Note: incident_subtype is optional at declaration. SH can add or change it.
-- Template resolution degrades gracefully to parent type if no subtype template exists.
```

### 6.2 Zone state machine table

```sql
-- Per-zone incident state tracking (new table)
CREATE TABLE incident_zone_states (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id          UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  incident_id       UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  zone_id           UUID NOT NULL REFERENCES venue_zones(id) ON DELETE CASCADE,
  state             TEXT NOT NULL DEFAULT 'UNVALIDATED'
    CHECK (state IN (
      'UNVALIDATED',        -- no staff report yet
      'SWEEP_IN_PROGRESS',  -- GS acknowledged and is sweeping
      'ZONE_CLEAR',         -- GS reported clear
      'NEEDS_ATTENTION',    -- GS reported issue / people present
      'EVACUATION_TRIGGERED',  -- evacuation ordered for this zone
      'EVACUATING',         -- evacuation in progress
      'EVACUATION_COMPLETE',   -- FS confirmed zone empty
      'SH_CONFIRMED_CLEAR', -- SH manually confirmed clear
      'LOCKED_DOWN',        -- security lockdown active (SECURITY type only)
      'INACCESSIBLE'        -- zone cannot be validated (fire blocking access etc.)
    )),
  assigned_gs_id    UUID NULL REFERENCES staff(id),  -- which GS is responsible for this zone
  last_updated_by   UUID NULL REFERENCES staff(id),
  last_updated_by_role TEXT NULL,
  reason_note       TEXT NULL,       -- required for NEEDS_ATTENTION / INACCESSIBLE
  evidence_url      TEXT NULL,       -- photo link (for EVACUATION_COMPLETE, SH_CONFIRMED)
  state_changed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (incident_id, zone_id)      -- one state row per zone per incident
);

CREATE INDEX idx_incident_zone_states_incident
  ON incident_zone_states (incident_id, state);

ALTER TABLE incident_zone_states ENABLE ROW LEVEL SECURITY;
```

### 6.3 Evacuation trigger log

```sql
-- Tracks every selective / full evacuation trigger with full audit chain
CREATE TABLE incident_evacuation_triggers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id          UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  incident_id       UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  trigger_type      TEXT NOT NULL CHECK (trigger_type IN (
    'ZONE_SELECTIVE',    -- SH picked specific zones
    'FLOOR_SELECTIVE',   -- SH picked specific floors
    'FULL_VENUE',        -- all zones
    'STAFF_TRIGGERED',   -- GS tapped "Trigger Evacuation" on mobile
    'AUTO_ESCALATION'    -- system auto-escalated (e.g. too many NEEDS_ATTENTION zones)
  )),
  triggered_by      UUID NOT NULL REFERENCES staff(id),
  triggered_by_role TEXT NOT NULL,
  zones_affected    UUID[] NOT NULL,      -- array of zone_ids in scope
  floors_affected   UUID[] NULL,
  reason_note       TEXT NOT NULL,        -- mandatory for all triggers
  pa_text_generated TEXT NULL,            -- auto-drafted PA announcement text
  notification_sent_at TIMESTAMPTZ NULL,
  notification_count   INT NULL,          -- how many staff received the alert
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE incident_evacuation_triggers ENABLE ROW LEVEL SECURITY;
```

### 6.4 Updated `activity_templates` with subtype axis

```sql
-- Add incident_subtype axis to existing activity_templates table
ALTER TABLE activity_templates
  ADD COLUMN incident_subtype TEXT NULL;  -- NULL = applies to all subtypes of parent type

-- New index to support subtype-specific template lookup
CREATE INDEX idx_activity_templates_subtype
  ON activity_templates (incident_type, incident_subtype, staff_role)
  WHERE is_active = TRUE;

-- Updated resolution rule (comment update):
-- Most specific template wins:
-- 1. venue_id + incident_type + incident_subtype
-- 2. venue_id + incident_type (no subtype)
-- 3. venue_type + incident_type + incident_subtype
-- 4. venue_type + incident_type (no subtype)
-- 5. NULL + incident_type + incident_subtype (global subtype default)
-- 6. NULL + incident_type + NULL (global parent default)
```

### 6.5 New action status: `ZONE_CLEARED`

```sql
-- Extend existing status enum with zone-specific action outcomes
-- (Applies to template items with action_type = 'ZONE_VALIDATION')
ALTER TABLE incident_response_item_completions
  DROP CONSTRAINT incident_response_item_completions_status_check,
  ADD CONSTRAINT incident_response_item_completions_status_check
    CHECK (status IN (
      'PENDING',
      'DONE',             -- generic completion
      'ZONE_CLEAR',       -- zone sweep complete, no one remaining
      'ZONE_ATTENTION',   -- zone has issues; reason required
      'EVACUATION_TRIGGERED',  -- staff triggered evacuation from their zone
      'NOT_APPLICABLE',
      'BLOCKED'
    ));
```

---

## Part 7 — New Business Requirements

The following BRs extend the existing BR-C / BR-D / BR-E from the Phase 5 draft:

| BR | Title | Priority | Phase |
|---|---|---|---|
| **BR-G** | Incident sub-type taxonomy — 31 sub-types across 6 parent types; optional at declaration; selectable by SH up to incident resolution | Critical | 5.21 |
| **BR-H** | Zone state machine during incidents — 10 zone states per incident; per-GS assignment; real-time grid visible to SC/SH | Critical | 5.21 |
| **BR-I** | 3-button evolved staff action model — `SAFE+CLEAR` / `NEEDS_ATTENTION` / `TRIGGER_EVACUATION` replaces binary "I Am Safe" for FIRE and EVACUATION incident types | Critical | 5.21 |
| **BR-J** | Selective zone evacuation — SH multi-selects zones from live zone grid; system fan-outs targeted push + WhatsApp + PA-text draft; audit log entry per trigger | Critical | 5.21 |
| **BR-K** | Full venue evacuation trigger from dashboard — single-tap with mandatory reason note; fan-out to all active staff + visitor safety alerts (BR-24) | Critical | 5.21 |
| **BR-L** | Auto-evacuation escalation — if ≥[configurable threshold, default 2] zones report `NEEDS_ATTENTION` within [configurable window, default 3 min] during FIRE, auto-suggest full evacuation to SH (soft suggest, not auto-trigger) | High | 5.22 |
| **BR-M** | Sub-type template resolution — graceful fallback from subtype → parent type → global default | High | 5.21 |
| **BR-N** | PA announcement auto-draft — when evacuation triggered, system generates plain-language PA text in English + venue regional language; SH can broadcast immediately or edit | Medium | 5.22 |
| **BR-O** | Zone assignment to GS at shift start — pre-assign zones to ground staff via shift roster; used in zone grid during incidents | High | 5.21 |
| **BR-P** | Evacuation trigger log — immutable record of every evacuation decision: who triggered, what zones, when, why, how many notified | Critical | 5.21 |

---

## Part 8 — UI/UX Specifications

### 8.1 Mobile: Evolved ground staff incident screen (FIRE)

```
┌────────────────────────────────────────────────────────┐
│ ← Back          🚨 FIRE — Zone B-3 [ACTIVE]           │
│                 Tower 1 · Started 4m ago               │
├────────────────────────────────────────────────────────┤
│ YOUR ZONE: B-3 (East Wing, Floor 2)                    │
│ Zone Status: SWEEP IN PROGRESS                         │
├────────────────────────────────────────────────────────┤
│ YOUR ACTIONS  (3 of 9 done)  ●●●○○○○○○                 │
├────────────────────────────────────────────────────────┤
│ ✓ 1. Acknowledge alert                    Done · 4s   │
│ ✓ 2. Walk zone: restrooms → changing      Done · 2m   │
│      rooms → service rooms                             │
│ ✓ 3. Close fire doors as you exit         Done · 3m   │
├────────────────────────────────────────────────────────┤
│ ◯ 4. Assist mobility-impaired persons                  │
│   [✓ Done]   [🚫 N/A]   [⛔ Blocked]                   │
├────────────────────────────────────────────────────────┤
│ ◯ 5. Count visitors in your zone                       │
│   [Enter number]  ___  [Confirm]                       │
├────────────────────────────────────────────────────────┤
│   ══════════════════════════════════════════           │
│   MARK YOUR ZONE STATUS                                │
│   ══════════════════════════════════════════           │
│                                                        │
│   ┌──────────────────────────────────────────┐        │
│   │  ✅  SAFE + ZONE CLEAR                   │        │
│   │      Zone is empty. All doors closed.   │        │
│   │      I am exiting now.                  │        │
│   └──────────────────────────────────────────┘        │
│                                                        │
│   ┌──────────────────────────────────────────┐        │
│   │  ⚠   ZONE NEEDS ATTENTION               │        │
│   │      People here / access blocked /     │        │
│   │      I cannot clear this zone           │        │
│   │      [Reason required — type here]      │        │
│   └──────────────────────────────────────────┘        │
│                                                        │
│   ┌──────────────────────────────────────────┐        │
│   │  🚨  TRIGGER ZONE EVACUATION             │        │
│   │      This zone needs evacuation NOW      │        │
│   │      Immediately notifies SC + SH        │        │
│   │      [Confirm: "Yes, evacuate Zone B-3"] │        │
│   └──────────────────────────────────────────┘        │
│   ══════════════════════════════════════════           │
├────────────────────────────────────────────────────────┤
│ ◯ 6. Proceed to Assembly Point 2         G (GPS)      │
│ ◯ 7. Report to Floor Supervisor                       │
│ ◯ 8. Submit zone-clear note to FS                     │
└────────────────────────────────────────────────────────┘
```

### 8.2 Dashboard: Zone validation grid (SH view during FIRE)

```
FIRE INCIDENT — LIVE ZONE STATUS
Tower 1 | Started 14m ago | SH: Rajesh Kumar (IC)
════════════════════════════════════════════════════════════

[🏃 Selective Evacuation]  [🏃 Full Venue Evacuation]  [✅ Resolve]

ZONE GRID (live · updates every 5s)
┌──────────────────────────────────────────────────────────┐
│ Floor 1                                                  │
│  A-1: ✅ CLEAR (Priya · 3m ago)                          │
│  A-2: ✅ CLEAR (Raju · 4m ago)                           │
│  A-3: 🟡 SWEEP IN PROGRESS (Ahmed)                       │
│  A-4: ⬜ UNVALIDATED                                     │
├──────────────────────────────────────────────────────────┤
│ Floor 2                                                  │
│  B-1: ✅ CLEAR (Meera · 2m ago)                          │
│  B-2: ⬜ UNVALIDATED                                     │
│  B-3: 🔴 NEEDS ATTENTION (Suresh · "visitors won't move")│
│         [Trigger B-3 Evacuation]  [Contact Suresh]       │
│  B-4: ⬜ UNVALIDATED                                     │
├──────────────────────────────────────────────────────────┤
│ Floor 3                                                  │
│  C-1: ⬜ UNVALIDATED                                     │
│  C-2: ⬜ UNVALIDATED                                     │
│  C-3: 🚨 EVACUATION TRIGGERED (SH · 2m ago)              │
│         17 staff notified · PA text sent                 │
│  C-4: 🚨 EVACUATING (in progress)                        │
└──────────────────────────────────────────────────────────┘

SUMMARY:  3 CLEAR  ·  1 ATTENTION  ·  2 EVACUATING  ·  6 UNVALIDATED
STAFF: 18/24 accounted  ·  4 unresponsive  ·  2 offline (cached mode)
```

### 8.3 Selective evacuation trigger UI (SH dashboard)

```
TRIGGER SELECTIVE EVACUATION
══════════════════════════════════════════════════════
Incident: FIRE — Zone B-3 — Tower 1
──────────────────────────────────────────────────────

Select zones to evacuate:
(Tip: select the fire zone + adjacent zones as minimum)

  [x] Zone B-3  🔴 NEEDS ATTENTION — fire origin
  [x] Zone B-4  ⬜ UNVALIDATED — adjacent to B-3
  [ ] Zone B-2  ⬜ UNVALIDATED
  [ ] Zone B-1  ✅ CLEAR — do not disturb
  [ ] Zone A-3  🟡 SWEEP IN PROGRESS
  [ ] Zone C-3  ✅ CLEAR
  ── ── ── ── ──
  Select All Zones on Floor 2
  Select All Zones in Building

Reason for selective evacuation (required):
  [Fire confirmed in B-3. Evacuating fire zone + adjacent]

PA Announcement text (auto-drafted, SH can edit):
  "Attention visitors on Floor 2, East Wing.
   Please proceed calmly to the nearest fire exit.
   Staff will guide you. Do not use lifts.
   This is not a drill."

  [Edit PA Text]   [Broadcast to Staff Only]

──────────────────────────────────────────────────────
Notification preview:
  · 6 staff in B-3 and B-4 will receive push + WhatsApp
  · Floor 2 supervisor will receive escalation alert
  · GM will receive incident update notification
  · Visitor safety alerts will trigger for opted-in visitors
──────────────────────────────────────────────────────

     [Cancel]          [CONFIRM EVACUATION ▶]
```

---

## Part 9 — Open Questions for Architect

These are net-new architectural decisions not covered in the Phase 5 draft open questions:

1. **Zone assignment model.** Ground staff currently receive their zone from shift roster. Is `zone_id` already on the `shift_assignments` table? If not, this is a prerequisite for the zone grid. Clarification needed before Phase 5.21 schema migration.

2. **Auto-evacuation suggestion threshold.** BR-L proposes suggesting full evacuation to SH when ≥2 zones report NEEDS_ATTENTION in 3 minutes. Should this threshold be configurable per venue (venue setting) or global (SC Ops Console default)? Recommendation: venue-level configurable with global default.

3. **Who can trigger zone evacuation from mobile?** Proposed: GS can trigger for their own assigned zone only; FS can trigger for zones on their floor; SC and SH can trigger any zone. Confirm this matches existing role permission model. The `trigger_type=STAFF_TRIGGERED` constraint in `incident_evacuation_triggers` should be linked to the triggering staff's zone assignment.

4. **PA announcement channel.** SafeCommand drafts the PA text. But the actual PA system is physical hardware. Is there a future integration path (via FM-level hardware bridge)? For Phase 5.21, PA text is displayed to SH who manually announces. Phase B: explore hardware integration API. Confirm this phasing is acceptable.

5. **Visitor safety alert expansion for zone evacuation.** When a zone evacuation is triggered (not full venue), should BR-24 visitor alerts be sent? Proposed: yes, for opted-in visitors whose check-in zone matches an evacuating zone (requires VMS integration from Section 14 of architecture doc). This is a Phase B dependency — confirm acceptable to defer.

6. **FIRE_SPREADING sub-type auto-detection.** If ≥3 zones simultaneously report `NEEDS_ATTENTION` or `EVACUATION_TRIGGERED` within 5 minutes, should the system suggest to SH to upgrade incident sub-type to FIRE_SPREADING? This is a soft suggestion only (no auto-action). Useful for dashboard situational awareness. Phase 5.22 candidate.

7. **Sub-type at declaration vs after.** The proposal allows SH to select sub-type after declaration. Should there be a time limit (e.g., sub-type must be set within 10 minutes) before it locks? This prevents ambiguity in the audit record. Recommendation: prompt at 10 minutes if sub-type is still null; no hard lock.

8. **Drill mode with zone states.** During drills (FIRE_DRILL sub-type), should zone states be tracked? Recommendation: yes — drill mode zone tracking is how venues practice the new workflow, building muscle memory for real incidents. Evidence requirements relaxed per existing Phase 5 drill-mode rules.

---

## Part 10 — Implementation Priority: What Builds First

```
PHASE 5.21 — Core Zone + 3-Button Model (3 weeks)
────────────────────────────────────────────────────
Week 1:
  · Schema migration: add incident_subtype column to incidents
  · Schema migration: create incident_zone_states table
  · Schema migration: create incident_evacuation_triggers table
  · api: GET /v1/incidents/:id/zone-states (live zone grid)
  · api: PATCH /v1/incidents/:id/zone-states/:zone_id (zone status update)

Week 2:
  · Mobile: 3-button zone action UI (CLEAR / ATTENTION / TRIGGER_EVAC)
  · Mobile: Zone status badge on incident screen header
  · Dashboard: Zone grid panel on incident detail page
  · api: POST /v1/incidents/:id/evacuation-triggers (selective + full)

Week 3:
  · Dashboard: Selective evacuation zone picker UI
  · Push/WhatsApp fan-out for selective evacuation
  · PA announcement text auto-draft
  · Evacuation trigger audit log
  · Sub-type selector in incident declaration flow

PHASE 5.22 — Sub-type Templates + Auto-Suggestions (2 weeks)
────────────────────────────────────────────────────────────
  · Add incident_subtype axis to activity_templates
  · Seed 15 priority sub-type templates (FIRE sub-types + top SECURITY + MEDICAL_CARDIAC)
  · Auto-evacuation suggestion logic (BR-L)
  · FIRE_SPREADING sub-type detection suggestion (open question 6)
  · Sub-type prompt at 10 minutes if unset

PHASE B — Full Sub-type Library + Venue-Type Specialisation
────────────────────────────────────────────────────────────
  · All 31 sub-types seeded with full templates
  · Hospital venue-type template specialisation (horizontal evacuation, Code Blue AED)
  · Visitor zone-evacuation alert integration (BR-24 × zone evacuation)
  · Multi-language PA text (Hindi/Telugu)
  · PA hardware integration API surface
```

---

## Part 11 — Compliance Verification: Hard Rules + ECs

| Rule / EC | Impact on this document | Status |
|---|---|---|
| EC-02 (RLS on every table) | All 3 new tables have venue_id + RLS | ✅ Designed |
| EC-03 (venue_id everywhere) | All new tables include venue_id column | ✅ Designed |
| EC-05 (async queue for notifications) | Evacuation trigger fan-out goes through existing notification queue | ✅ |
| EC-09 (4h offline cache) | Zone states cached in mobile SQLite; submissions queue offline | ✅ |
| EC-10 (audit logs append-only) | evacuation_triggers is append-only; zone state history not deleted | ✅ |
| EC-13 (idempotent writes) | Zone state PATCH is idempotent (upsert on zone_id + incident_id) | ✅ |
| EC-15 (i18n keys) | PA text and 3-button labels use i18n keys; English fallbacks at Phase 5.21 | ✅ |
| Hard Rule 4 (audit immutability) | Evacuation trigger log and zone state changes write to audit_logs | ✅ |
| Hard Rule 7 (notification failure non-blocking) | Evacuation trigger succeeds even if push fails; SMS fallback in queue | ✅ |
| NFR-02 (incident escalation ≤5s) | Zone evacuation fan-out target: ≤5s to notification queue entry | ✅ |
| NFR-04 (task completion 3 taps) | Zone clear: 1 tap. Zone attention: 2 taps (button + reason). Evac: 2 taps + confirm | ✅ |

---

## Appendix A — Framework Reference Map

| Framework | Incident Types Covered | Primary Insight Used |
|---|---|---|
| NFPA 101:2024 | FIRE, EVACUATION | Two-stage evacuation; zone-selective trigger; emergency action plan per role |
| NFPA 1561:2020 | FIRE | Per-position checklists; hot/warm/cold zone semantics |
| NFPA 3000 | SECURITY | Active shooter role-specific response; Run-Hide-Fight |
| HICS 5th Ed | MEDICAL, SECURITY, EVACUATION | Job Action Sheets; 23 per-role response guides; Code system |
| ICS/NIMS | ALL | Modular scalable command structure; IC → SC → FS → GS hierarchy |
| ISO 22320:2018 | ALL | Role-keyed incident response requirements |
| NABH §EM 6th Ed | FIRE, MEDICAL, SECURITY, STRUCTURAL | India-specific Code system; per-role checklists; drill records |
| NDMA Guidelines | ALL | India disaster management framework; venue safety classification |
| Martyn's Law UK 2025 | SECURITY | Role-defined attack response plans; documented procedures |
| CISA Venue Guide | SECURITY, STRUCTURAL | IED response protocols; suspicious item handling |
| BS 9999:2017 | FIRE, EVACUATION | Two-stage evacuation; progressive horizontal evacuation |
| MoHFW Circular 2024 | MEDICAL, SECURITY | Hospital staff protection; panic button + police coordination |
| Telangana FF-3 | FIRE | Per-role action documentation in drill/incident records |

---

## Appendix B — Glossary

| Term | Definition |
|---|---|
| **Zone** | A defined physical area within a venue floor (e.g. "Zone B-3 — East Wing, Floor 2") |
| **Zone Sweep** | Physical walk-through of an assigned zone to confirm no persons remain |
| **Zone Clear** | GS-confirmed state: zone is empty, fire doors closed, GS has exited |
| **Two-Stage Evacuation** | Stage 1: affected zone only; Stage 2: full building if Stage 1 cannot contain |
| **Progressive Horizontal Evacuation** | Moving occupants to adjacent fire-resistant compartment on same floor before vertical evacuation |
| **Hot Zone** | Area with active threat (fire, aggressor); no civilians |
| **Warm Zone** | Adjacent to hot zone; first responders only |
| **Cold Zone** | Assembly/staging area; all civilians and unneeded staff |
| **IC (Incident Commander)** | SH or DSH; person with overall incident command authority |
| **JAS (Job Action Sheet)** | HICS term for per-role action checklist during a specific incident type |
| **ICS** | Incident Command System — US federal modular emergency management framework |
| **HICS** | Hospital Incident Command System — healthcare adaptation of ICS |
| **NABH §EM** | National Accreditation Board for Hospitals Emergency Management standard |
| **NDMA** | National Disaster Management Authority (India) |
| **Sub-type** | A specific classification within an incident type (e.g., FIRE_SPREADING within FIRE) |
| **RHF** | Run-Hide-Fight — DHS protocol for active shooter response |
| **PA Text** | Plain-language announcement text for physical PA system; auto-drafted by SafeCommand |

---

*SafeCommand Nexus Archive Research | Version 1.0 | May 2026 | Confidential*
*Next review: after Phase 5.21 implementation, before Phase 5.22 scoping*
