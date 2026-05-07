# SafeCommand Incident Response Activity Templates — Architect Review Document

> **Status:** Draft for architect review (2026-05-07)
> **Author:** Engineering (Phase 5 series)
> **Scope:** Adds role-keyed action checklists to incident lifecycle so staff execute structured tasks during real events (not just "are you safe yes/no")
> **Refines:** BR-11 (Incident Declaration), BR-A (Drill Management) — extends their reach into per-staff action accountability
> **Companion docs:** `docs/research/drill-participant-reason-taxonomy.md` (sister research artefact for the reason taxonomy), `docs/adr/0004-drill-participant-reason-codes.md`

> **Architect: please review and respond to the open questions in §11. Implementation will not begin until alignment is reached.**

---

## 1. Why this exists

### 1.1 The gap today

SafeCommand currently captures *did this staff acknowledge / did this staff mark safe* during incidents and drills. This is necessary for compliance but **not sufficient** for industry-leading emergency operations. Real events demand structured per-role action lists:

- **Fire:** the security guard at zone B-3 doesn't just need to "be safe" — they need to *check no one is in their assigned zone*, *close fire doors behind them*, *guide visitors to exit*, *report headcount at assembly point*
- **Medical:** the floor supervisor doesn't just observe — they're expected to *summon ambulance*, *clear path for stretchers*, *retrieve nearest AED*, *escort responders to scene*
- **Security:** ground staff don't just shelter — they *lock zone access points*, *account for visitors in zone*, *await further instruction without media disclosure*

NABH §EM, NFPA 1561, HICS, ICS, and ISO 22320 all require *role-keyed action checklists* during emergency events. SafeCommand's current "I am safe" alone is the equivalent of taking attendance — it doesn't measure execution.

### 1.2 The opportunity

Add an Activity Template engine that:

1. **Per incident type** (`FIRE` / `MEDICAL` / `SECURITY` / `EVACUATION` / `STRUCTURAL` / `OTHER`)
2. **Per staff role** (`SH` / `DSH` / `SHIFT_COMMANDER` / `FLOOR_SUPERVISOR` / `GROUND_STAFF` / `FM` / `GM` / `AUDITOR`)
3. **Optionally per location scope** (assigned-zone / venue-wide / building-wide / external)
4. **Defines an ordered list of actions** with priority (immediate / short-term / resolution) and evidence type (verbal / photo / signature / GPS / other)

When an incident is declared, every active staff in scope receives their role-specific checklist on mobile. Each item can be marked DONE / NOT_APPLICABLE / BLOCKED-with-reason. Audit log captures every transition.

### 1.3 Strategic value

| Stakeholder | What they gain |
|---|---|
| **Hospital CISO / NABH compliance** | Direct alignment with NABH §DM (Disaster Management) standard — auditable per-role action records during Code Red / Code Blue / Code Black events |
| **Mall / hotel facility head** | Operational discipline — staff execute the same response actions every time, not whatever they remember from training |
| **Corporate safety director** | Cross-venue consistency — every venue follows the same template per incident type; deviations surface as audit anomalies |
| **VC / investor** | Compliance moat depth — schema-enforced per-role accountability is materially harder for competitors to retrofit |
| **Board director** | Governance posture — "we know exactly what every staff did during the last incident" is the board-room answer to "did we respond correctly?" |
| **Auditor (Fire NOC / NABH / TJC)** | Evidence-grade record — per-staff action timeline replaces verbal accounts and paper checklists |

---

## 2. Industry frameworks surveyed

Comprehensive cross-section of standards, regulations, and industry practice. SafeCommand's design synthesises across all of them.

### 2.1 International standards

| Source | Domain | Key insight |
|---|---|---|
| **ISO 22320:2018** — Emergency management: Requirements for incident response | International | Defines incident response as structured, decomposable into role-keyed objectives; chain-of-command + accountability |
| **ISO 22398:2013** — Societal security exercise guidelines | International | Per-role exercise objectives; lifecycle = preparation → execution → debrief |

### 2.2 US frameworks

| Source | Domain | Key insight |
|---|---|---|
| **NIMS / ICS** — National Incident Management System / Incident Command System | US federal | Modular role hierarchy: IC → Operations → Divisions → Groups → Single Resources; per-role responsibility matrices |
| **HICS** — Hospital Incident Command System | US healthcare | Adapts ICS to hospital context; defines 23 role-specific Job Action Sheets (JAS) per incident type |
| **NFPA 1600 (2019)** — Continuity, Emergency, and Crisis Management | US fire/safety | Role-keyed accountability requirements; structured response objectives |
| **NFPA 1561 (2020)** — Emergency Services Incident Management System | US fire services | Per-position checklists for fire-ground operations |
| **NFPA 1620** — Pre-Incident Planning | US fire services | Pre-defined response actions per occupancy type |
| **OSHA 29 CFR 1910.38** — Emergency Action Plans | US workplace | Minimum requirement: assigned roles + emergency procedures per incident |
| **The Joint Commission EM standards** — Emergency Operations Plan | US healthcare | Six critical EOP areas including specific staff role assignments per incident |

### 2.3 Indian frameworks (most relevant — primary market)

| Source | Domain | Key insight |
|---|---|---|
| **NABH §EM (Emergency Management) standard** | Indian healthcare | Per-clinical-role action checklists for Code Blue (cardiac arrest), Code Red (fire), Code Pink (infant abduction), Code Black (bomb threat) — directly maps to our role-keyed model |
| **NDMA Fire Safety Guidelines for Public Buildings** | Indian disaster management | Role assignments for owner / occupier / fire warden / floor warden / search-and-rescue teams |
| **BIS IS 15883:2009** — Fire safety in education buildings | Indian standard | Per-role evacuation responsibilities; standardised drill practices |
| **BIS IS 2189:2008** — Automatic fire detection | Indian standard | Pre-incident planning includes role assignments + standard operating procedures |
| **Telangana State Fire Service** — Form FF-3 + Annual Fire Plan | Indian regulatory (our pilot region) | Drill records require per-role action documentation, not just attendance |
| **Maharashtra State Disaster Management Plan** | Indian regulatory | Per-role response checklists during natural and man-made disasters |

### 2.4 Hospital "Code" system reference (US/India hybrid)

Hospital emergency codes provide the cleanest existing role-keyed action model. SafeCommand's incident_type taxonomy aligns:

| Hospital code | SafeCommand incident_type | Description |
|---|---|---|
| Code Red | `FIRE` | Fire / smoke detected |
| Code Blue | `MEDICAL` | Cardiac/respiratory arrest |
| Code Black | `SECURITY` (severe) | Bomb threat |
| Code Silver | `SECURITY` (severe) | Active shooter |
| Code Orange | `STRUCTURAL` (severe) | Hazardous material |
| Code Yellow | `STRUCTURAL` (severe) | Mass casualty |
| Code Pink | `SECURITY` | Infant abduction |
| Code Grey | `SECURITY` | Combative / aggressive person |
| Code White | `STRUCTURAL` | Severe weather / building damage |
| Code Green | `EVACUATION` | Evacuation order |

Indian NABH-accredited hospitals use a similar Code colour system (sometimes localised). SafeCommand's 6 incident types compress this into operationally distinct categories.

### 2.5 Industry products surveyed

| Product | Approach |
|---|---|
| **HICS (open standard)** | 23 Job Action Sheets per incident — granular but designed for IC role assignment, not per-staff field execution |
| **Everbridge CEM** | Notification-led; per-recipient "tasks" can be added but typically free-form, not structured |
| **Rave Mobile Safety** | Alert + acknowledge model; no role-keyed action lists |
| **PagerDuty Operations Center** | Runbook-style action lists per incident type but designed for IT not physical security |
| **AlertMedia** | Custom checklists per protocol; no per-role automatic dispatch |
| **AppArmor (formerly NaviGate)** — Indian-active emergency mgmt | Per-role mass notification but checklists are protocol PDFs not interactive |
| **Drillster** — Drill management SaaS | Pre-incident training, not real-time response |
| **SafetyCulture iAuditor** | Inspection checklists; not adapted to live incident execution |

**Industry gap:** no platform combines (a) per-role automatic dispatch + (b) interactive structured checklists + (c) audit-grade per-staff completion records. SafeCommand has the opportunity to be the first.

---

## 3. Conceptual model

### 3.1 Core entities

```
ACTIVITY_TEMPLATE        — re-usable definition per (incident_type, role) tuple
  ├── ACTIVITY_TEMPLATE_ITEM  — ordered list of actions in the template
  │     ├── action description (i18n key)
  │     ├── location_scope (ASSIGNED_ZONE / FLOOR / BUILDING / VENUE / EXTERNAL)
  │     ├── priority (IMMEDIATE / SHORT_TERM / RESOLUTION)
  │     ├── evidence_type (VERBAL / PHOTO / SIGNATURE / GPS / NOTE / NONE)
  │     ├── time_target_seconds (expected completion within X seconds)
  │     └── decision_branches (next-step routing based on outcome)

INCIDENT_RESPONSE_PLAN   — instance — when incident declared, snapshot of templates per active staff
  ├── INCIDENT_RESPONSE_ASSIGNMENT  — per-staff plan
  │     ├── staff_id
  │     ├── template_id (the template this staff was given)
  │     └── per-item completion records:
  │           ├── ACTION_COMPLETION
  │           │     ├── status (PENDING / DONE / NOT_APPLICABLE / BLOCKED)
  │           │     ├── completed_at
  │           │     ├── evidence_url (if photo/signature)
  │           │     ├── notes (if BLOCKED, why)
  │           │     └── set_by (staff who marked it — usually self, sometimes SH override)
```

### 3.2 Lifecycle

```
1. SH declares incident (existing BR-11 flow)
2. api: POST /v1/incidents auto-snapshots templates per active staff
       ↓
   creates INCIDENT_RESPONSE_PLAN row + N ASSIGNMENT rows
       ↓
   per-staff push notification: "Fire incident in your venue. Tap to see your action checklist."
       ↓
3. Staff opens mobile → My Incident screen → sees personalised ordered checklist
4. Staff marks each item DONE (with evidence as required) / N/A / BLOCKED
5. SH on dashboard sees real-time per-staff completion grid (similar to drill participation matrix)
6. Incident resolved → completion records frozen; full audit timeline available
```

### 3.3 Template inheritance + venue customisation

```
GLOBAL TEMPLATES (SC Ops-managed, default)
  ↓ override
VENUE-TYPE TEMPLATES (Hospital / Mall / Hotel / Corporate)
  ↓ override
INDIVIDUAL VENUE TEMPLATES (e.g. specific Apollo hospital)
  ↓
ACTIVE TEMPLATE (resolved at incident-declare time)
```

This pattern matches the existing schedule_template_seeds approach (BR-25). New venues pick a venue-type template → can customise → run their incident response off the customised set.

---

## 4. Activity templates — the guidebook

The heart of this document. Per-incident-type role-keyed action checklists, designed against industry research above and adapted to Indian operating context.

> **Notation:**
> - **Priority:** **IMM** = immediate (within 60s); **STR** = short-term (within 15 min); **RES** = resolution (post-event)
> - **Evidence:** **V** = verbal confirm via app tap; **P** = photo upload; **S** = signature on form; **G** = GPS-location confirm; **N** = note (free-text); **—** = none
> - **Loc:** **A** = assigned zone; **F** = floor; **B** = building; **V** = venue-wide; **E** = external
> - All checklist items are i18n-keyed (Hard Rule 11); Indian English shown here for design clarity

### 4.1 FIRE (Code Red equivalent)

**Trigger:** smoke / flame / fire alarm activation. SH or any staff can declare.

#### SH (Security Head) — INCIDENT COMMANDER role

| # | Pri | Loc | Action | Evidence |
|---|---|---|---|---|
| 1 | IMM | V | Activate venue fire alarm if not already triggered | V |
| 2 | IMM | E | Phone Fire Service (Indian: 101) — provide venue address + access info | V + N |
| 3 | IMM | V | Establish command post at primary assembly point (or nominated location) | V |
| 4 | IMM | V | Confirm announcement broadcast on venue PA system | V |
| 5 | STR | V | Coordinate with Fire Service on arrival; brief on building layout, occupancy, hazards | V + N |
| 6 | STR | V | Account for staff at assembly point — review live participation matrix | V |
| 7 | STR | V | Liaise with FM on utility cuts (electricity, gas mains) per fire-fighting requirements | V |
| 8 | STR | V | Authorise re-entry only after Fire Service all-clear | V |
| 9 | RES | V | Initiate post-incident review; trigger BR-A drill-style record creation | V + N |
| 10 | RES | V | Mark each unattested staff in participation matrix with reason classification (per ADR 0004) | V |

#### DSH (Deputy Security Head) — backup IC, takes over if SH unreachable

| # | Pri | Loc | Action | Evidence |
|---|---|---|---|---|
| 1 | IMM | V | Confirm SH reachable; if not, assume IC role and notify api | V |
| 2 | IMM | V | Secure perimeter; prevent re-entry of evacuated occupants | V |
| 3 | IMM | E | Confirm Fire Service en-route; coordinate access for fire engines | V + N |
| 4 | STR | V | Manage media / public information (no disclosure beyond approved statement) | N |
| 5 | STR | V | Liaise with SH on staff and visitor accounts | V |
| 6 | RES | V | Support post-incident review | V |

#### SHIFT_COMMANDER — direct floor-level evacuation

| # | Pri | Loc | Action | Evidence |
|---|---|---|---|---|
| 1 | IMM | F | Direct assigned floor staff to begin evacuation; confirm fire stairs clear | V |
| 2 | IMM | F | Confirm lifts OUT of service for evacuees (lifts auto-recall typical but verify) | V + P |
| 3 | IMM | F | Walk floor systematically — corridor → restrooms → store rooms → service areas | V |
| 4 | STR | V | Manage assembly point headcount; report to SH | V |
| 5 | STR | V | Identify mobility-impaired persons; confirm evacuation chair / refuge area assignment | V + N |
| 6 | RES | V | Submit floor-level all-clear report to SH | V |

#### FLOOR_SUPERVISOR — primary floor evacuation lead

| # | Pri | Loc | Action | Evidence |
|---|---|---|---|---|
| 1 | IMM | F | Enable floor PA announcement; instruct calm orderly evacuation | V |
| 2 | IMM | F | Walk assigned floor zone-by-zone; close fire doors behind | V + P (door closed) |
| 3 | IMM | F | Ensure use of fire stairs only; redirect anyone heading to lifts | V |
| 4 | IMM | F | Guide guests / visitors / mobility-impaired to evacuation route | V |
| 5 | STR | F | Last person out of floor — confirm by visible sweep | V + P (empty floor) |
| 6 | STR | V | Report floor headcount to SC at assembly point | V |
| 7 | RES | V | Note any unusual observations (fire location, smoke colour, structural concerns) | N |

#### GROUND_STAFF — zone-level execution

| # | Pri | Loc | Action | Evidence |
|---|---|---|---|---|
| 1 | IMM | A | Acknowledge alert (existing BR-11 flow) | V |
| 2 | IMM | A | Walk assigned zone — physically check restrooms, changing rooms, retail back-of-house | V |
| 3 | IMM | A | Close fire doors behind you as you exit your zone | V |
| 4 | IMM | A | Assist mobility-impaired persons to evacuation route or refuge area | V + N |
| 5 | IMM | A | Account for visitors / customers in your zone — count + direction | V |
| 6 | STR | E | Proceed to designated assembly point (per zone assignment in shift roster) | G |
| 7 | STR | V | Mark self safe (existing BR-11 flow) | V |
| 8 | RES | V | Submit zone-clear note to FS; report any abnormalities seen during evacuation | N |

#### FM (Facility Manager) — utilities + suppression coordination

| # | Pri | Loc | Action | Evidence |
|---|---|---|---|---|
| 1 | IMM | V | Confirm fire suppression system activated (sprinklers, foam, etc.) | V |
| 2 | IMM | V | Cut electrical power to non-critical circuits per fire-safety protocol | V + N |
| 3 | IMM | V | Isolate gas mains / fuel lines | V + N |
| 4 | STR | V | Coordinate with utility companies (electricity, gas, water) | V |
| 5 | STR | V | Confirm emergency lighting / exit signs operational | V + P |
| 6 | RES | V | Document utility shutdowns + restoration timeline | N |

#### GM (General Manager) — venue operations + tenant communication

| # | Pri | Loc | Action | Evidence |
|---|---|---|---|---|
| 1 | IMM | V | Brief tenant retailers / restaurants — their staff respond per their own protocols | V |
| 2 | STR | V | Manage public communication — calm, accurate, infrequent | V + N |
| 3 | STR | E | Coordinate with mall / building corporate ops | V |
| 4 | RES | V | Brief insurance / corporate on initial damage assessment | N |

#### AUDITOR — observe + document, never operate

| # | Pri | Loc | Action | Evidence |
|---|---|---|---|---|
| 1 | IMM | V | Observe IC chain-of-command activation; note timestamps | N |
| 2 | STR | V | Document any deviation from documented protocol | N + P |
| 3 | RES | V | Compile post-incident compliance observation report | N + S |

### 4.2 MEDICAL (Code Blue — cardiac/respiratory; broader medical emergencies)

**Trigger:** unresponsive person / cardiac event / serious injury / illness. Any staff or visitor can declare.

#### SH

| # | Pri | Loc | Action | Evidence |
|---|---|---|---|---|
| 1 | IMM | E | Phone ambulance (Indian: 108) | V + N |
| 2 | IMM | V | Designate first responder if not yet on scene | V |
| 3 | IMM | E | Clear access route for stretchers — mark elevators dedicated to medical | V |
| 4 | STR | V | Escort emergency responders to scene on arrival | V |
| 5 | RES | V | Coordinate with affected person's family if required | V + N |

#### SHIFT_COMMANDER

| # | Pri | Loc | Action | Evidence |
|---|---|---|---|---|
| 1 | IMM | A | Establish triage if multi-casualty (more than 3 affected) | V |
| 2 | IMM | A | Manage scene access — keep visitors clear | V |
| 3 | STR | V | Coordinate with ambulance arrival point | V |

#### FLOOR_SUPERVISOR

| # | Pri | Loc | Action | Evidence |
|---|---|---|---|---|
| 1 | IMM | F | Identify nearest first-aid kit + AED location (mounted defibrillator) | V |
| 2 | IMM | A | If trained: perform basic life support (CPR, AED) until paramedics arrive | V + N |
| 3 | STR | A | Maintain log of vital signs / symptoms observed | N |

#### GROUND_STAFF (first responder if on scene)

| # | Pri | Loc | Action | Evidence |
|---|---|---|---|---|
| 1 | IMM | A | Render basic first aid within training scope | V |
| 2 | IMM | A | Summon supervisor / SH | V |
| 3 | IMM | A | Keep area clear; redirect bystanders | V |
| 4 | STR | A | Identify ambulance access route / nearest entrance for paramedics | V |

#### FM

| # | Pri | Loc | Action | Evidence |
|---|---|---|---|---|
| 1 | IMM | V | Confirm AED battery + pad availability | V + P |
| 2 | IMM | V | Open security gates / emergency vehicle access | V |
| 3 | STR | V | Reserve elevator for stretcher transport | V |

> **Note:** unlike Fire, MEDICAL doesn't end with "all safe" — patient transferred to medical care; staff resume duties after scene clear. SH ends incident manually.

### 4.3 SECURITY (broad — bomb threat / active aggressor / theft / suspicious package)

**Trigger:** verifiable threat or specific suspicious activity. SH or DSH typically declares.

> **Critical:** Security incidents may require communications discipline (no media disclosure, controlled tenant communication). Some checklist items differ from Fire/Medical.

#### SH

| # | Pri | Loc | Action | Evidence |
|---|---|---|---|---|
| 1 | IMM | V | Activate security protocol; choose: lockdown / shelter-in-place / evacuation | V |
| 2 | IMM | E | Phone local police (Indian: 100) | V + N |
| 3 | IMM | V | Establish secure perimeter (or evacuation route per protocol choice) | V |
| 4 | IMM | V | Issue communications discipline directive to all staff (no media, no disclosure) | V |
| 5 | STR | V | Coordinate with private security / CISF (if present at venue) | V |
| 6 | STR | V | Brief police on arrival; share CCTV / access control logs | V + N |
| 7 | RES | V | Maintain incident log; any suspicious item — DO NOT touch, mark + photograph from distance | N + P |

#### DSH

| # | Pri | Loc | Action | Evidence |
|---|---|---|---|---|
| 1 | IMM | V | Confirm SH protocol decision (lockdown / shelter / evac); execute if SH unavailable | V |
| 2 | IMM | V | Coordinate evacuation route OR shelter assignment | V |
| 3 | STR | V | Communications discipline — repeat to staff; suppress speculation | V |

#### SHIFT_COMMANDER

| # | Pri | Loc | Action | Evidence |
|---|---|---|---|---|
| 1 | IMM | V | Activate CCTV monitoring; designate staff to watch live feeds | V |
| 2 | IMM | V | Brief on-floor staff via radio / app push | V |
| 3 | STR | V | Track perimeter integrity; report breaches | V |

#### FLOOR_SUPERVISOR

| # | Pri | Loc | Action | Evidence |
|---|---|---|---|---|
| 1 | IMM | F | Move floor occupants to nearest designated safe room OR begin evacuation per protocol | V |
| 2 | IMM | F | Lock floor access points if shelter-in-place active | V + P |
| 3 | STR | F | Maintain head-count + visible authority | V |

#### GROUND_STAFF

| # | Pri | Loc | Action | Evidence |
|---|---|---|---|---|
| 1 | IMM | A | Lock zone access points (close + secure shutters / doors) | V |
| 2 | IMM | A | Account for staff and visitors in zone | V + N |
| 3 | IMM | A | Move to assigned safe room OR follow evacuation route | V |
| 4 | STR | A | Await further instruction; do NOT take unilateral action | V |
| 5 | STR | E | No media disclosure / social-media posting | V |

#### FM

| # | Pri | Loc | Action | Evidence |
|---|---|---|---|---|
| 1 | IMM | V | Activate access-control lockdown if shelter-in-place | V |
| 2 | IMM | V | Isolate elevator banks; restrict to authorised use | V |
| 3 | STR | V | Coordinate with utility cuts only on SH directive | V |

### 4.4 EVACUATION (partial or full — distinct from Fire-triggered evac)

**Trigger:** structural concern, gas leak, water damage, or operational decision (e.g. drill). SH or DSH declares.

> **Note:** EVACUATION as standalone incident_type covers planned evacuations + non-fire emergency evacuations (e.g. gas leak). The actions below largely overlap with Fire 4.1 with different priority levels.

#### SH

| # | Pri | Loc | Action | Evidence |
|---|---|---|---|---|
| 1 | IMM | V | Sound venue evacuation alarm (distinct from fire alarm if available) | V |
| 2 | IMM | V | Communicate scope (partial — building 2 only / full venue) | V |
| 3 | IMM | E | Notify civil authorities if structural / gas-leak driven | V + N |
| 4 | STR | V | Coordinate with Fire Service if fire is downstream cause | V |
| 5 | STR | V | Authorise re-entry on engineering all-clear (NOT before) | V + S |
| 6 | RES | V | Brief on-site personnel + tenants on duration estimate | V |

#### Other roles: identical to Fire 4.1 with one exception — SH may direct partial evacuation rather than full. FS gets one extra item:

#### FLOOR_SUPERVISOR (partial-evac specific)

| # | Pri | Loc | Action | Evidence |
|---|---|---|---|---|
| 1 | IMM | F | Confirm evacuation scope (which floors / which buildings) | V |
| 2 | IMM | F | Direct unaffected floors NOT to evacuate (avoid overcrowding stairs) | V |
| 3 | … | … | (rest as per Fire 4.1) | … |

### 4.5 STRUCTURAL (building damage / collapse risk / gas leak / chemical spill)

**Trigger:** visible damage / leak / chemical release. SH typically declares; FM may co-declare.

#### SH

| # | Pri | Loc | Action | Evidence |
|---|---|---|---|---|
| 1 | IMM | V | Trigger engineering assessment — contact structural engineer + civil authorities | V + N |
| 2 | IMM | V | Evacuate threatened areas (per SH judgment) | V |
| 3 | IMM | E | NDMA notification if severe (partial collapse, mass casualty, fire-resistance compromised) | V + N |
| 4 | STR | V | Coordinate with FM on safe routes + utility decisions | V |
| 5 | STR | V | Ban re-entry until engineering all-clear | V + S |

#### FM

| # | Pri | Loc | Action | Evidence |
|---|---|---|---|---|
| 1 | IMM | V | Power isolation (electrical hazard if water + electricity) | V |
| 2 | IMM | V | Water main shutoff if leak / burst | V |
| 3 | IMM | V | Gas main shutoff if leak | V |
| 4 | IMM | V | Initiate structural assessment coordination (engineer + civil authorities) | V + N |
| 5 | STR | V | Document damage with photographs from safe distance | P |
| 6 | RES | V | Coordinate insurance / loss-adjuster visit | N |

#### FLOOR_SUPERVISOR

| # | Pri | Loc | Action | Evidence |
|---|---|---|---|---|
| 1 | IMM | F | Identify cracks / bulges / water ingress; mark unsafe areas | V + P |
| 2 | IMM | F | Photograph damage from safe distance for engineer assessment | P |
| 3 | STR | F | Restrict floor access; lock entries to affected zones | V |

#### GROUND_STAFF

| # | Pri | Loc | Action | Evidence |
|---|---|---|---|---|
| 1 | IMM | A | Direct people away from unsafe areas | V |
| 2 | IMM | A | Mark + cordon damage with cones / tape | V + P |
| 3 | STR | A | Await engineering all-clear; don't enter affected zones | V |

### 4.6 OTHER (catch-all generic ICS)

**Trigger:** any incident that doesn't fit the 5 specific types. SH selects this with mandatory description.

> **Conservative default:** treat as a generic ICS — establish command, brief staff, await role-specific guidance.

#### SH

| # | Pri | Loc | Action | Evidence |
|---|---|---|---|---|
| 1 | IMM | V | Establish ICS — declare role (IC), assign deputy if not already | V |
| 2 | IMM | V | Assess situation — gather facts before broadcasting | V + N |
| 3 | IMM | V | Brief staff via app push: situation summary + immediate action | V |
| 4 | STR | V | Define response (evacuate / shelter / continue ops with caution) | V |
| 5 | STR | V | Re-classify incident_type if specific category becomes clear | V |

#### All staff

| # | Pri | Loc | Action | Evidence |
|---|---|---|---|---|
| 1 | IMM | A | Acknowledge alert | V |
| 2 | IMM | A | Stand by; do NOT take unilateral action | V |
| 3 | IMM | A | Await SH briefing | V |
| 4 | STR | A | Execute briefed action | V |

> **Important:** OTHER is a stop-gap. SH should reclassify as soon as situation is clear (e.g. OTHER → MEDICAL once cardiac event identified). Reclassification is a Phase B feature; for now staff can freely declare a new incident if scope changes materially.

---

## 5. Schema proposal (for architect review)

### 5.1 New tables

```sql
-- Activity template — reusable definition per (incident_type, role) tuple
CREATE TABLE activity_templates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Scope: NULL = global default; venue_type set = applies to all venues of that type;
  --        venue_id set = venue-specific override (most specific wins at resolution time)
  venue_type        venue_type_enum NULL,    -- 'HOSPITAL' | 'MALL' | 'HOTEL' | 'CORPORATE' | NULL
  venue_id          UUID NULL REFERENCES venues(id) ON DELETE CASCADE,
  -- Template scope
  incident_type     incident_type_enum NOT NULL,  -- existing enum
  staff_role        staff_role_enum NOT NULL,     -- existing enum
  version           INT NOT NULL DEFAULT 1,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Resolution rule: most specific wins
  --   venue_id IS NOT NULL  >  venue_type IS NOT NULL  >  both NULL (global default)
  -- Active version per scope-tuple is unique
  UNIQUE (venue_id, venue_type, incident_type, staff_role, version)
);

-- Items within a template — ordered list of actions
CREATE TABLE activity_template_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id         UUID NOT NULL REFERENCES activity_templates(id) ON DELETE CASCADE,
  display_order       INT NOT NULL,
  action_i18n_key     TEXT NOT NULL,            -- 'fire.sh.activate_alarm' etc.
  fallback_text       TEXT NOT NULL,            -- English fallback for pre-i18n
  priority            TEXT NOT NULL CHECK (priority IN ('IMMEDIATE','SHORT_TERM','RESOLUTION')),
  location_scope      TEXT NOT NULL CHECK (location_scope IN ('ASSIGNED_ZONE','FLOOR','BUILDING','VENUE','EXTERNAL')),
  evidence_type       TEXT NOT NULL CHECK (evidence_type IN ('VERBAL','PHOTO','SIGNATURE','GPS','NOTE','NONE')),
  time_target_seconds INT NULL,                 -- expected completion within X seconds
  notes               TEXT NULL,                -- context for the SH
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_template_items_template_order
  ON activity_template_items (template_id, display_order);

-- Per-incident plan — when incident declared, snapshot of templates per active staff
CREATE TABLE incident_response_plans (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id            UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  incident_id         UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  building_id         UUID NULL,                -- inherits from incident
  total_assignments   INT NOT NULL DEFAULT 0,
  total_completions   INT NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (incident_id)                          -- 1:1 with incident
);

-- Per-staff response — links staff to their assigned template
CREATE TABLE incident_response_assignments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id             UUID NOT NULL REFERENCES incident_response_plans(id) ON DELETE CASCADE,
  staff_id            UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  template_id         UUID NOT NULL REFERENCES activity_templates(id),
  -- Snapshot of template at incident-declare time (template may evolve later)
  template_version    INT NOT NULL,
  total_items         INT NOT NULL,
  completed_items     INT NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plan_id, staff_id)
);

-- Per-item completion records
CREATE TABLE incident_response_item_completions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id       UUID NOT NULL REFERENCES incident_response_assignments(id) ON DELETE CASCADE,
  template_item_id    UUID NOT NULL REFERENCES activity_template_items(id),
  status              TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','DONE','NOT_APPLICABLE','BLOCKED')),
  completed_at        TIMESTAMPTZ NULL,
  evidence_url        TEXT NULL,           -- S3 link for photos
  signature_data      TEXT NULL,           -- base64 signature blob
  gps_latitude        NUMERIC(9,6) NULL,
  gps_longitude       NUMERIC(9,6) NULL,
  notes               TEXT NULL,
  set_by              UUID NULL REFERENCES staff(id),  -- usually self; SH override capability
  set_by_role         TEXT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, template_item_id)
);

-- RLS policies (similar to drill_session_participants pattern from mig 013)
ALTER TABLE activity_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_response_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_response_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_response_item_completions ENABLE ROW LEVEL SECURITY;

-- Permissive venue isolation policies
-- Restrictive role-based read policies for completion records (PII-sensitive)
```

### 5.2 New BRs (additions to spec, for architect approval)

| BR | Title | Phase |
|----|-------|-------|
| BR-C | Activity Template Engine — global / venue-type / venue-specific template inheritance with role × incident_type resolution | Phase 5.19 |
| BR-D | Per-staff incident response checklist execution — mobile UI with PENDING/DONE/N/A/BLOCKED transitions | Phase 5.20 |
| BR-E | Audit-grade incident response record — chronological per-staff completion timeline; exports to PDF | Phase B (with BR-A PDF) |
| BR-F | Pre-incident readiness — staff sees their incident-response checklist on shift start (preview mode) | Phase B |

### 5.3 New BR-A facet

BR-A's "missed-participant logging" extends naturally — drills also follow Activity Templates. A drill is just an incident in EXERCISE mode where checklist completion is "graded" but no real-world action occurs.

---

## 6. UX flow proposal

### 6.1 Mobile — staff incident response screen

When an incident is declared in the staff's venue + they're an active participant:

```
┌─ Drawer banner ─────────────────────────────────┐
│ 🚨 FIRE incident in progress                    │
│ Tap to see your action checklist                │
│                                  Open ›         │
└─────────────────────────────────────────────────┘

After tap: My Incident screen
┌────────────────────────────────────────────────┐
│ ← Back        Fire Evacuation [ACTIVE]         │
│               Tower 1 · Started 2m ago         │
├────────────────────────────────────────────────┤
│ YOUR ACTIONS (5 of 8 done)              ●●●●●○○○│
├────────────────────────────────────────────────┤
│ ✓ 1. Acknowledge alert                          │
│   ✓ Done · 8s after alert                       │
├────────────────────────────────────────────────┤
│ ✓ 2. Walk Zone B-3 (your zone) — restrooms,    │
│      changing rooms, retail back-of-house       │
│   ✓ Done · 1m 22s                               │
├────────────────────────────────────────────────┤
│ ◯ 3. Close fire doors behind you                │
│   ◯ Pending · Mark done [Photo required]        │
│      [📷 Take photo]                             │
├────────────────────────────────────────────────┤
│ ◯ 4. Assist mobility-impaired persons           │
│   ◯ Pending · [✓ Done] [🚫 N/A] [⛔ Blocked]   │
├────────────────────────────────────────────────┤
│ ◯ 5. Account for visitors in your zone          │
│   [✓ Done] [🚫 N/A] [⛔ Blocked]                │
├────────────────────────────────────────────────┤
│ … (3 more actions)                              │
└────────────────────────────────────────────────┘
```

**Interaction details:**
- Each item has 3 outcome buttons: **DONE / N/A / BLOCKED**
- Photo / signature / GPS items show evidence picker before DONE accepted
- BLOCKED requires text note (≥10 chars, mirroring ADR 0004 OTHER pattern)
- Top progress bar updates live
- Order is preserved; staff can complete in non-sequential order (some are non-blocking)

### 6.2 Dashboard — SH situational awareness

```
/incidents/[id] page extension:

Add new section: "Incident Response Plan"
  - List of all assignments (per staff, similar to drill participation)
  - Per-staff: name + role + assigned template + completion progress + status pills
  - Filter: All / Pending / Stuck (≥X min PENDING) / Blocked / Done
  - Click a staff row → expand showing the per-item completion list (same shape as mobile)
  - SH can override (mark item DONE on behalf of a staff) — audit-logged
```

### 6.3 SC Ops Console — template management

Internal tool for SafeCommand Operations team:

```
/templates page (new):
  - Browse global / venue-type / venue-specific templates
  - Edit individual template items (drag to reorder, edit action text, change priority)
  - Version control: edit creates new version; existing incidents keep their snapshotted version
  - Test mode: simulate a template against a fake incident (no real notification)
  - Translation surface: each item's i18n_key + per-language string table
```

---

## 7. Phased rollout

### 7.1 Phase 5.19 (1.5 weeks) — Read-only template display

- Schema migration `014_activity_templates.sql`
- Seed 6 incident_type × 8 roles = 48 default global templates from §4 of this doc
- api: `GET /v1/activity-templates?incident_type=&staff_role=` for resolved template lookup
- Mobile incident detail: read-only display of "Your actions" — no completion tracking yet
- Dashboard incident detail: list of "Expected actions per staff" as informational

### 7.2 Phase 5.20 (1.5 weeks) — Completion tracking

- New tables: `incident_response_plans`, `incident_response_assignments`, `incident_response_item_completions`
- api: `POST /v1/incidents/:id/responses` (auto-snapshot at declare time), `PATCH /v1/incidents/:id/responses/:assignment_id/items/:item_id` (per-item completion)
- Mobile: full interactive checklist with DONE / N/A / BLOCKED + evidence pickers
- Dashboard: per-staff progress grid with filtering

### 7.3 Phase B (post-pilot) — Specialisation

- Per-venue-type templates (HOSPITAL adds Code Pink + Code Silver subtypes)
- Per-venue customisation surface in SC Ops Console
- i18n migration for all checklist items
- PDF export — incident response record (as part of BR-A PDF)
- Drill-mode: same templates run during drills with "graded" indicator

### 7.4 Phase C (post-Phase 2 GCP migration)

- Multi-language UI (Hindi / Telugu / Kannada)
- Cross-venue analytics — "average evacuation completion time" per template
- Corporate governance: CXO sees aggregate compliance scores across 65 venues

---

## 8. Special considerations

### 8.1 Drill mode vs incident mode

Same templates run in both. Difference:

| Aspect | Drill mode | Incident mode |
|---|---|---|
| Evidence required | Verbal-only acceptable; photos optional | All evidence per template specification |
| BLOCKED | Records SH-classifiable reason (per ADR 0004 taxonomy) | Records reason as audit trail; reviewed post-incident |
| Time target | Used for "graded" feedback | Used for SLA tracking + escalation |
| Notification | Drawer banner (current Phase 5.18) | Drawer banner + push + WhatsApp + SMS (Phase B multi-channel) |
| Output | Drill compliance report | Incident response record (regulator-defensible) |

### 8.2 Multi-language

EC-15 (i18n keys for all user-visible strings) requires `action_i18n_key` not raw text. For Phase 5.19 we ship hardcoded English fallbacks alongside the i18n keys (matches existing Phase 5 pattern). Phase B i18n migration translates all keys at once.

### 8.3 Per-venue-type specialisation depth

Templates support 3-tier inheritance:

```
GLOBAL DEFAULT  (e.g. "Walk assigned zone")
   ↓ overridden by
VENUE_TYPE='HOSPITAL'  (e.g. "Walk assigned ward; verify in-place protection of bedridden patients")
   ↓ overridden by
VENUE_ID specific  (e.g. "Walk Apollo-Hyderabad ICU3; horizontal evacuation procedure per attending physician")
```

Resolution at incident-declare time: most specific match wins. Default to global if no override.

### 8.4 Role substitutions when staff unavailable

Real-world: SH may be off-site. The DSH inherits SH's checklist. The api auto-promotes when SH is unreachable (per BR-13 deputy activation):

- DSH `primary` role: assigned the SH template + their own DSH template (concatenated)
- DSH receives both checklists in one combined view

### 8.5 Audit trail integrity (Hard Rule 4)

Every completion transition writes to `audit_logs`. Once an item is marked DONE, it cannot be reverted (only the SH can override-correct, which is itself audit-logged). This protects against post-hoc HR pressure to "change my record".

### 8.6 Performance (NFR-02 / NFR-04)

- Template snapshot at incident declare must complete in <500ms (single SQL transaction with COPY)
- Per-staff push notification fan-out within 5s (NFR-02 incident-escalation latency)
- Mobile checklist interaction: each item completion = <200ms api roundtrip on Redmi 9A on 3G

### 8.7 Offline mode (Rule 9 / NFR-09)

- Templates pre-cached in mobile SQLite at app cold-start
- Item completions queued locally if offline; flushed on reconnect (matches existing BR-07 pattern)
- 4-hour offline cache window per Rule 9

### 8.8 Visitor / non-staff scope

Activity templates apply only to staff. Visitors get the existing BR-24 visitor-safety-alert flow (push + WhatsApp). Gap: in a hospital pilot, *patients* and their families are also on-site but not "staff". The HICS standard handles this via in-charge assignments to medical staff (covered by ON_DUTY_ELSEWHERE in BR-A taxonomy + ICU patient-care checklist items in our templates).

---

## 9. Architectural alignment with existing spec

### 9.1 Compliance with Hard Rules (22 Rules)

| Rule | Activity Templates | Compliance |
|---|---|---|
| 1 | Never store secrets | ✅ No secrets in template content |
| 2 | venue_id in every query | ✅ All new tables have venue_id; all api queries filter |
| 3 | Never modify deployed migrations | ✅ All schema changes via new migration `014_activity_templates.sql` |
| 4 | Audit logs append-only | ✅ Per-item completion writes to audit_logs; never UPDATE/DELETE |
| 5 | All writes idempotent | ✅ Per-item PATCH idempotent (status+evidence as upsert key) |
| 7 | Notification failures never fail primary | ✅ Per-staff push enqueue is async; incident declaration succeeds even if notify fails |
| 9 | Mobile offline 4hr | ✅ Templates cached in SQLite at boot |
| 10 | Zod validation at api entry | ✅ All new endpoints get strict Zod schemas |
| 11 | i18n keys from Day 1 | ✅ `action_i18n_key` field; English fallbacks for transition |
| 17 | SEV1 always all-buildings | ✅ Templates fan out per existing incident scope semantics |
| 19 | ThemeProvider mandatory | ✅ All UI uses `useColours()` / `useBrand()` |

### 9.2 Compliance with Engineering Constraints (22 ECs)

| EC | Activity Templates | Compliance |
|---|---|---|
| EC-01 | PostgreSQL | ✅ |
| EC-02 | RLS on every table | ✅ All 5 new tables |
| EC-03 | venue_id everywhere | ✅ |
| EC-09 | Offline mobile 4hr | ✅ |
| EC-15 | i18n keys | ✅ |
| EC-16 | building_id nullable | ✅ Inherits from incident.building_id |
| EC-17 | ThemeProvider | ✅ |
| EC-20 | CORP-* never see PII | ✅ Aggregate completion scores only at CORP scope |

### 9.3 Compliance with NFRs (37 NFRs)

| NFR | Activity Templates | Compliance |
|---|---|---|
| NFR-02 | Incident escalation ≤5s | ✅ Async snapshot + parallel push |
| NFR-04 | Task completion 3 taps | ✅ Each checklist item = 1 tap (Done) or 2 taps (with evidence) |
| NFR-09 | Offline cache | ✅ Templates SQLite-cached |
| NFR-13 | 99.5% availability | ✅ No new external deps |
| NFR-17 | Audit immutability | ✅ Append-only completion log |
| NFR-19 | Solo-buildable Phase 1 | ✅ ~3 weeks for Phases 5.19 + 5.20 |
| NFR-35 | WCAG 2.1 AA on safety screens | ✅ Reuses existing palette |

---

## 10. Risks + mitigations

| Risk | Mitigation |
|---|---|
| Template explosion — different venues want different items | 3-tier inheritance (global → venue_type → venue) handles 95% of cases; Phase B per-item override depth can extend |
| Staff fatigue from too many checklist items | Phase 5.19 ships with conservative defaults (8-12 items per role); Phase B analytics surface "skipped consistently" items for trim |
| Drill performance theatre (everyone marks DONE without doing) | Photo / GPS / signature evidence on critical items; SH-side review during incident reveals unrealistic completion times |
| Cross-cultural / cross-venue terminology drift | i18n keys + per-venue text overrides; Phase C multi-language unblocks regional adaptations |
| Schema regret — the 5-table model proves wrong | Phase 5.19 read-only ships first; Phase 5.20 completion tracking adds the assignment + completion tables only after read-only validates the model |

---

## 11. Open questions for architect review

The following decisions are blockers for implementation. **Please respond with positions before Phase 5.19 begins.**

1. **Template-to-incident binding model.** Two options:
   - (A) **Snapshot at incident-declare time** (current proposal) — frozen template baseline, post-event templates can evolve safely
   - (B) **Reference live template** — incident always shows current template version
   - Recommendation: (A). Trade-off: live updates won't propagate to in-flight incidents (acceptable; rare to update mid-incident).

2. **Inheritance resolution conflict policy.** When venue-type and venue-specific templates both define the same item:
   - (A) Venue-specific wholly replaces venue-type (current proposal — most specific wins entirely)
   - (B) Venue-specific *adds* to venue-type (concatenation)
   - Recommendation: (A). Cleaner mental model. Phase B can add (B) as opt-in if needed.

3. **Per-item evidence requirements depth.** Should evidence be:
   - (A) Set at template authoring (current proposal — "Photo required" is part of template)
   - (B) Set at incident-declare time (SH selects evidence stringency per incident)
   - Recommendation: (A). Default per template; SH can downgrade evidence requirements on a per-item basis at incident time as escape hatch.

4. **Time-target SLAs and escalation.** What happens when an item misses its time_target_seconds?
   - (A) Soft warning to staff (push reminder)
   - (B) Hard escalation to SC / SH
   - (C) Both
   - Recommendation: (C) — soft warning at +50% of target; hard escalation at +100% of target. Phase 5.20 implements warning; Phase B adds full escalation chain (depends on workers being unfrozen).

5. **CORP-* role aggregate views (Phase 3).** Activity Templates produce per-staff PII data. Corporate governance should see:
   - (A) Aggregate compliance scores per venue (current EC-20 conformance — no individual PII)
   - (B) Per-staff records with role names but no personal identifiers (anonymous role-only)
   - (C) Both depending on permission grant
   - Recommendation: (A). EC-20 conservative posture. Phase 3 / 4 can layer (B) if regulators require role-level visibility for corporate governance audits.

6. **Drill-mode evidence relaxation.** During drills, should photo/GPS/signature evidence be:
   - (A) Required as in incidents (full fidelity)
   - (B) Optional (verbal-only OK)
   - (C) Configured per-template
   - Recommendation: (B) for staff training; (C) for drill audit-grade reports (BR-A PDF). Phase 5.20 ships (B); Phase B adds (C) toggle.

7. **Visitor / patient scope.** As per §8.8 — visitors covered by BR-24; patients in hospital pilot covered by ON_DUTY_ELSEWHERE in BR-A taxonomy. Should the templates explicitly handle patient evacuation (e.g. NABH "horizontal evacuation with patient")? Or stay staff-only?
   - Recommendation: stay staff-only at template level. Hospital pilot adds dedicated venue-type template ("Hospital Evacuation") with explicit "Verify in-place protection of bedridden patients" item for floor supervisors / nurses.

8. **Template versioning governance.** Who authors templates?
   - (A) SC Ops only (centralised) — current proposal
   - (B) Venue SH can edit venue-specific overrides
   - (C) Both
   - Recommendation: (A) for Phase 5.19. Phase B ships SH-editable surface for venue overrides only (Operations Console retains global + venue-type).

9. **Audit log volume.** Per-item completion = 1 audit_logs entry. A 50-staff venue × 6 incident_types × ~10 items = up to 3000 log entries per drill cycle. Per-incident: ~500 entries.
   - Mitigations: index on `entity_id` + retention policy in Phase B (archive entries older than X months). Acceptable for Phase 5.19 (single-venue pilot).

10. **Template authoring — JSON file vs DB-only.** For Phase 5.19 seeding:
    - (A) SQL migration with hard-coded INSERTs (current proposal)
    - (B) JSON file at repo + import script (templates evolve via PR)
    - (C) Admin UI (deferred to Phase B)
    - Recommendation: (A) for Phase 5.19 → (B) for Phase 5.20+ → (C) for Phase B. Each step incrementally easier.

---

## 12. Appendix — sample template item record (JSON form)

For reference, illustrating how a single item from §4.1 (Fire / GROUND_STAFF / item 2) would look at the data layer:

```json
{
  "id": "uuid",
  "template_id": "uuid",
  "display_order": 2,
  "action_i18n_key": "fire.ground_staff.walk_assigned_zone",
  "fallback_text": "Walk assigned zone — physically check restrooms, changing rooms, retail back-of-house",
  "priority": "IMMEDIATE",
  "location_scope": "ASSIGNED_ZONE",
  "evidence_type": "VERBAL",
  "time_target_seconds": 120,
  "notes": "Walk pattern: enter zone → restrooms → changing rooms → service rooms → retail back-of-house → exit. Required for Fire NOC Form FF-3 attestation."
}
```

---

## 13. Maintenance + change-management

- **Owner:** SafeCommand Engineering (active during Phase 5.19 + 5.20); SafeCommand Compliance team thereafter
- **Review cadence:** Every 30 days during pilot; quarterly post-pilot
- **Amendment process:**
  1. Field observation triggers proposal (e.g. new common pattern in BLOCKED reasons)
  2. Architect review — does it fit the schema + EC/Rule set?
  3. If accepted: amend this doc + new ADR + schema migration if needed
  4. Roll out via SC Ops Console template editor (Phase B+) or migration (Phase 5.19/5.20)
- **Sign-off authority:** Product (template content) + Engineering (schema + RLS) + Compliance (regulatory alignment) + SC Ops (operational feasibility)

---

> **Architect: per §11, please respond with positions on the 10 open questions before implementation begins. This is the gate to Phase 5.19 scoping.**
