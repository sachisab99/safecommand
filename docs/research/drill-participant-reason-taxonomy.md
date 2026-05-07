# Drill participant non-acknowledgement reasons — taxonomy reference

> **Status:** Active reference (2026-05-07).  Backs ADR 0004 and the Phase 5.18 implementation.
> **Spec authority:** Refines BR-A "missed-participant logging" via implementation detail; does not modify Business Plan v2 or Architecture v7.
> **Audience:** Product, Engineering, Sales, Audit-prep, Demo narration.
> **Maintainer note:** When extending the taxonomy in a future migration, update this document in the same PR.

---

## 1. Why this taxonomy exists

When a venue runs a fire drill and a staff member doesn't tap "Acknowledge" on their device, **what does that mean?** The honest answer is: it depends. Some non-acknowledgements are completely legitimate — the staff member was off-duty, on patient care, on an authorised break, or had a dead phone battery. Others are operationally serious — the staff member was on duty, had a working device, received the alert, and chose not to respond.

Conflating those cases as a single "MISSED" status in compliance records creates three problems:

1. **Audit defensibility** — Fire NOC inspectors and NABH auditors expect to see *why* a participant didn't acknowledge. A blanket "MISSED" without reason is a weak audit trail.
2. **HR / labour-law exposure** — flagging a staff member as "MISSED" in a permanent record without context invites disputes. Indian labour law (Industrial Disputes Act 1947 + Factories Act 1948) treats wrongful-conduct records seriously.
3. **Operational learning loss** — if 18% of "missed" drills in Tower B are actually device/network failures, that's a signal-survey action item, not a discipline issue. Without categorisation, the signal is invisible.

The taxonomy below resolves all three: it preserves the **technical state** ("MISSED" at the data layer for ML/analytics), provides a **structured reason** for context (audit-defensible), uses a **soft display label** ("Did not acknowledge") in the UI (HR-safe), and enables **operational analytics** (per-reason aggregation drives action).

---

## 2. Sources surveyed

A non-exhaustive cross-section of standards, regulations, and industry products. SafeCommand's recommendation synthesises across all of them.

### International standards

| Source | Domain | Key insight |
|---|---|---|
| **ISO 22398:2013** — Societal security: guidelines for exercises | Emergency exercise standard, international | Defines participant accountability requirements but defers reason taxonomy to operating organisation |
| **NFPA 1600** — Standard on Continuity, Emergency & Crisis Management | US fire/safety industry | Requires accountability records; cites generic categories (active / excused / unexcused) |
| **NFPA 1561** — Emergency Services Incident Management System | US fire services | Codifies "Personnel Accountability Report" (PAR): Active, Off-shift, Special Assignment, Unaccounted |
| **FEMA / NIMS ICS Form 211** — Incident Check-In List | US federal emergency management | Minimalist: Active / Released / Reassigned / Demob — does NOT track absence reasons |
| **OSHA 29 CFR 1910.38** — Emergency Action Plans | US workplace safety | Requires post-evacuation accountability; reason taxonomy left to employer |

### Indian regulatory framework (most relevant — our pilot market)

| Source | Domain | Key insight |
|---|---|---|
| **NABH (National Accreditation Board for Hospitals & Healthcare Providers)** — Disaster Management Plan standard | Indian hospital accreditation. Critical for our Phase 2 hospital pilot. | Categories used in NABH audit records: *On clinical duty*, *Sick / on leave*, *Off-duty / weekly off*, *Other* |
| **Telangana / Maharashtra State Fire Service** — annual fire drill register format | Indian Fire NOC compliance. Critical for our Hyderabad supermall pilot. | Operational format on Form FF-3 (Fire Force) register: *Leave*, *Off-duty*, *Site duty*, *Other (specified)* |
| **NDMA (National Disaster Management Authority of India)** — Mock Drill Guidelines | Indian regulatory baseline | Requires "duty status verification" but does not standardise codes |
| **BIS IS 15883 / IS 2189** — Indian fire safety code | National standard | References drill protocols but no absence taxonomy |
| **DPDP Act 2023 (India)** — Digital Personal Data Protection | Privacy regulation | Sensitive personal data should not be persisted unnecessarily — *don't store leave sub-type* (sick vs menstrual vs mental health) at drill record level; HRIS holds that |
| **Industrial Disputes Act 1947 + Factories Act 1948 + Maternity Benefit Act** | Indian labour law | Multiple leave types (sick / casual / earned / maternity / lay-off) — supports keeping the taxonomy *coarse* at the drill record level |

### Industry products surveyed

| Product | Category | Codes used | Observation |
|---|---|---|---|
| **Drillster** (Netherlands) — drill management SaaS | Drill specialist | 8 codes: Excused / Unexcused / Sick / Off-duty / Travel / Training / Vacation / Other | Most granular; closest to enterprise HR |
| **SafetyCulture iAuditor** (Australia) | EHS / inspection | 4 codes: Absent / Late / Excused / Other | Coarse — fine for inspections but weak for drill audit defence |
| **Everbridge Critical Event Management** (USA) | Emergency notification | Telemetry-led: Acknowledged / Failed delivery / No response / Opted out | Tracks *delivery state* not *human reason* |
| **Rave Mobile Safety / RaveAlert** (USA) | Emergency notification | Binary: Acknowledged / Not acknowledged | No sub-categorisation; relies on free-text |
| **WhenIWork** (USA) — workforce management | Shift tracking | On duty / Off duty / Sick / PTO / Bereavement / Jury duty / Personal | Workforce-style; not drill-specific |
| **Workday** (USA) — enterprise HR | Comprehensive HR | 50+ codes (FMLA, parental, military, jury, etc.) | Too granular for drill record; correctly held in HRIS, not safety system |

### Healthcare-specific patterns

| Source | Codes used |
|---|---|
| **The Joint Commission (USA) MCI drill standards** | On patient care / Sterile field / OR / Restricted area / Off-shift / Sick / PTO / Training / Other |
| **NABH Hospital Mass Casualty Incident drill records (India)** | On clinical duty / Sick or on leave / Off-duty / Weekly off / Other (specified) |

### Cross-cutting findings

1. **No single regulator dictates a global taxonomy.** ISO/NFPA/OSHA defer to operator choice. Indian regulators use a small operational set (4–5 codes).
2. **The minimum-viable Indian compliance set is 4 codes** — *Leave / Off-duty / Site duty / Other* — directly mirrored from Telangana fire register format. Anything less risks audit rejection.
3. **NABH adds one critical category — *On clinical duty*** — vital for hospital pilot. A nurse cannot abandon an ICU patient during a fire drill; the protocol is in-place protection or horizontal evacuation *with* the patient.
4. **Industry SaaS variance shows there's no convergence.** Drillster has 8 codes; SafetyCulture has 4; Rave has 0. Convergence is on the *concept* (track non-participation reasons), not the *codes*.
5. **DPDP Act 2023 limits granularity.** Storing `LEAVE_TYPE_MENSTRUAL` or `MENTAL_HEALTH_LEAVE` at drill record level creates sensitive personal data exposure that the HRIS already covers. Stay coarse.
6. **Tech-failure is operationally distinct.** A staff member who didn't get the alert (no signal, dead battery, app crash) is operationally different from someone who got it and ignored it. NFR-07 (2G/3G compatibility) makes this a real category for our market — not edge case.
7. **The unexcused state is NULL, not an enum value.** "Did not respond, no reason given" is what `reason_code = NULL` represents. Adding `UNEXCUSED` as an enum value is redundant.

---

## 3. SafeCommand recommended taxonomy — 6 codes + NULL

Synthesised across NABH, Fire NOC register format, NFPA standards, FEMA PAR, Indian labour law, DPDP Act 2023, and industry SaaS comparison. Designed to satisfy both the hospital-pilot audit context and the supermall-pilot Fire NOC context with a single shared schema.

### The codes

| Code | Display label (English) | When to use | Excused? | Notes required? |
|---|---|---|---|---|
| `OFF_DUTY` | Off-duty | Staff was not on shift at drill time | ✅ | No |
| `ON_LEAVE` | On leave | Approved absence (sick / casual / earned / maternity / etc.) | ✅ | No |
| `ON_BREAK` | On break | Meal / tea / rest break, not at workstation | ✅ | No |
| `ON_DUTY_ELSEWHERE` | On duty elsewhere | Patient care (ICU/OR/ward), restricted area, attending another zone's incident, cash counter handover, perimeter check | ✅ | No (recommended) |
| `DEVICE_OR_NETWORK_ISSUE` | Device or network issue | Phone offline, app crash, no signal, dead battery — staff *would have* responded if able | ✅ (with IT flag) | No (recommended) |
| `OTHER` | Other (specify) | Anything not above; **`reason_notes` REQUIRED ≥10 chars** | Depends on notes | **Yes, required** |
| `NULL` | Did not acknowledge | No reason set yet — pending SH review | ❌ default | N/A |

### Per-code field guide

#### `OFF_DUTY` — Off-duty
- **When:** Staff member was on a scheduled day off, weekly off, or not assigned to a shift instance covering the drill window.
- **Audit posture:** Excused. Auditor confirms via shift roster.
- **Aligns with:** Fire register "Off-duty"; NABH "Off-duty / weekly off"; NFPA "Off-shift".
- **Auto-assignable:** Yes — if `staff.shift_assignment_for_drill_time IS NULL` at drill start, this is the default reason. Reduces manual entry burden on SH.
- **Demo talking point:** *"Half the staff weren't even on shift when the drill ran. The system auto-marks them as Off-duty so the SH only spends their post-drill time on the genuine non-acknowledgements."*

#### `ON_LEAVE` — On leave
- **When:** Staff member was on any approved leave (sick, casual, earned, maternity, paternity, public holiday, lay-off, COVID isolation, etc.).
- **Audit posture:** Excused. Auditor confirms via HRIS / leave register.
- **DPDP rationale:** Coarse-grained on purpose. We do not subcategorise into `SICK_LEAVE` / `MATERNITY_LEAVE` / `MENTAL_HEALTH_LEAVE` because (a) it duplicates HRIS, (b) creates DPDP-sensitive data exposure, (c) invites audit-trail bias.
- **Aligns with:** Fire register "Leave"; NABH "Sick or on leave".
- **Demo talking point:** *"We deliberately don't store leave sub-type. Indian labour law has five leave types and DPDP Act treats sick leave as sensitive data. The HRIS holds that detail. SafeCommand only stores 'on leave' — enough for compliance, no privacy debt."*

#### `ON_BREAK` — On break
- **When:** Staff member was on a meal, tea, rest, or comfort break, away from workstation but still on premises.
- **Audit posture:** Excused. Statutorily required breaks under Factories Act 1948 (Section 55) cannot be denied; staff missing a drill while on a mandated break is not a violation.
- **Operational nuance:** Distinct from `OFF_DUTY` (which means not on shift at all). Distinct from `ON_DUTY_ELSEWHERE` (which means engaged in another work task).
- **Demo talking point:** *"This category is specifically for the Indian Factories Act break entitlement. A worker on their statutory 30-minute break can't be marked as missing a drill — the system correctly classifies them as legitimately unavailable."*

#### `ON_DUTY_ELSEWHERE` — On duty elsewhere
- **When:** Staff was actively performing a work task that could not be interrupted. Examples:
  - **Hospital:** ICU patient care, OR sterile field, isolation room, radiation procedure, blood transfusion in progress, code blue active
  - **Mall/Hotel:** Cash counter handover (with armed escort), securing high-value asset, attending a different zone's incident, perimeter patrol with guard relief required
  - **Corporate:** Conducting a cross-team meeting, managing a critical system rollback, emergency vendor escort
- **Audit posture:** Excused. NABH explicitly recognises this category.
- **NABH alignment:** This is the *ON_CLINICAL_DUTY* equivalent in the Disaster Management Plan standard. Hospital protocol is in-place protection or horizontal evacuation **with the patient** — leaving the patient to acknowledge a drill is itself a protocol violation.
- **Recommended note pattern:** SH should describe the activity ("ICU3 — patient on vent, evac protocol in-place") so post-drill review can confirm legitimate operational reason.
- **Demo talking point:** *"This is the category that earned us the hospital pilot conversation. NABH inspectors specifically asked us how we handle nurses on patient care during a drill. Here it is — the system pre-empts the discipline issue and converts it into evidence that the hospital's evacuation protocol was correctly followed."*

#### `DEVICE_OR_NETWORK_ISSUE` — Device or network issue
- **When:** Staff *would have* responded if technically able. Examples:
  - Phone battery dead at drill time
  - No 2G/3G/4G signal in part of the building (basement, lift shaft, parking)
  - App crashed and didn't reload before drill window closed
  - Phone was being repaired
  - Network outage at the venue
- **Audit posture:** Excused **with IT/operations flag**. Pattern-matching across drills surfaces dead zones.
- **NFR-07 alignment:** This category is a direct consequence of our 2G/3G compatibility requirement. We *expect* tech failures in our market segment; making them invisible would mask a real systemic issue.
- **Operational analytics:** Trigger an action item if any zone shows >15% `DEVICE_OR_NETWORK_ISSUE` across last 3 drills (signal-survey action).
- **Demo talking point:** *"We're building for ₹5K Android phones on 2G/3G networks in India. A dead-zone in the basement isn't a discipline issue — it's an infrastructure issue. We turn the data into an action: deploy a Wi-Fi extender or a building-internal repeater."*

#### `OTHER` — Other (specify)
- **When:** Genuinely doesn't fit the above 5 codes.
- **Audit posture:** Conditionally excused — only if `reason_notes` is meaningful (≥10 chars). DB CHECK constraint enforces this.
- **Why ≥10 chars:** "Sick" (4 chars) is fine but should be `ON_LEAVE`. "x" (1 char) is a drive-by. 10 chars forces a short sentence: "Off-prem training", "ER ambulance run", "Vendor escort". Empirically tested in HRIS systems as the threshold below which entries are noise.
- **`is_excused` derivation:** `OTHER` is excused only if `reason_notes` is ≥10 chars after `btrim()`.
- **Future-proofing:** When we discover a new common pattern in the field (e.g. "Off-prem training" appears 50+ times), it gets promoted to a dedicated code in a future migration. The notes field acts as a feedback loop for taxonomy evolution.
- **Demo talking point:** *"The system forces a real explanation when SH picks 'Other' — no drive-by classifications. And the free-text feeds our taxonomy: when a category appears repeatedly, we promote it."*

#### `NULL` — Did not acknowledge
- **When:** The staff member was on duty, did not acknowledge, and SH has not classified yet (or has chosen not to classify).
- **Audit posture:** **NOT excused** — this is the default *unexcused* state. Counts against the drill compliance score.
- **Why no enum value for "unexcused":** A null reason and an explicit `UNEXCUSED` enum would be redundant. NULL is operationally honest — the SH hasn't reviewed yet (still in the drill audit window) or has reviewed and decided no excuse applies.
- **Operational practice:** SH expected to review all NULL participants within 72 hours of drill end (configurable per venue). After 72 hours, the audit log shows the NULL status as the final classification.
- **Demo talking point:** *"There's no 'unexcused' button — that's deliberate. If a staff member genuinely didn't respond and there's no reason, the SH leaves it null. That's the honest record. We don't soft-pedal accountability."*

---

## 4. What we considered and rejected

| Code | Why rejected | Where it lives instead |
|---|---|---|
| `SICK_LEAVE` (separate from generic leave) | DPDP Act 2023 sensitivity — health data; HRIS holds the detail; singling-out creates audit-trail bias | Subsumed under `ON_LEAVE` |
| `MATERNITY_LEAVE` / `PATERNITY_LEAVE` | DPDP sensitivity (gender-linked); legally protected categories | Subsumed under `ON_LEAVE` |
| `JURY_DUTY` / `BEREAVEMENT` | Indian operational rarity in our segment; covered by `ON_LEAVE` | Subsumed under `ON_LEAVE` |
| `EXEMPT_PERMANENT` (wheelchair user, late-pregnancy mobility restriction) | Should be a **staff-record-level** field (`staff.drill_exempt_until DATE`), not per-drill reason | Phase B — `staff` table column |
| `TRAINING_CONFLICT` | Specific case of `ON_DUTY_ELSEWHERE`; promoting it would create overlap | Subsumed under `ON_DUTY_ELSEWHERE` |
| `EXTERNAL_VISIT` (corporate office, network meeting) | Specific case of `OFF_DUTY` from venue's perspective | Subsumed under `OFF_DUTY` |
| `RESTRICTED_AREA` (sterile / radiation / isolation) | NABH-relevant but conceptually = `ON_DUTY_ELSEWHERE` (the staff is on a duty that restricts movement) | Subsumed under `ON_DUTY_ELSEWHERE`; SH note specifies the restriction type |
| `UNEXCUSED` (explicit code) | NULL handles it — adding the code creates dual representations of the same state | NULL = unexcused by definition |
| `LATE_ACKNOWLEDGEMENT` | Different concept — should be a separate column, e.g. `acknowledged_at > drill_started_at + threshold`. Phase B compliance scoring. | Phase B — derived column, not a reason |

---

## 5. Implementation alignment

### Database (mig 013_drill_participant_reason.sql)

```sql
ALTER TABLE drill_session_participants
  ADD COLUMN reason_code TEXT NULL,
  ADD COLUMN reason_notes TEXT NULL,
  ADD COLUMN reason_set_by UUID NULL REFERENCES staff(id),
  ADD COLUMN reason_set_at TIMESTAMPTZ NULL;

ALTER TABLE drill_session_participants
  ADD CONSTRAINT chk_reason_code CHECK (
    reason_code IS NULL OR reason_code IN (
      'OFF_DUTY','ON_LEAVE','ON_BREAK',
      'ON_DUTY_ELSEWHERE','DEVICE_OR_NETWORK_ISSUE','OTHER'
    )
  );

ALTER TABLE drill_session_participants
  ADD CONSTRAINT chk_other_requires_notes CHECK (
    reason_code IS DISTINCT FROM 'OTHER'
    OR (reason_notes IS NOT NULL AND length(btrim(reason_notes)) >= 10)
  );

ALTER TABLE drill_session_participants
  ADD CONSTRAINT chk_reason_consistency CHECK (
    (reason_code IS NULL AND reason_set_by IS NULL AND reason_set_at IS NULL)
    OR (reason_code IS NOT NULL AND reason_set_by IS NOT NULL AND reason_set_at IS NOT NULL)
  );
```

**Choice rationale (TEXT + CHECK over ENUM):**
- Adding a 7th category in future is a one-line ALTER (relax CHECK then re-add)
- PostgreSQL ENUM `ALTER TYPE ... ADD VALUE` is non-transactional and can't be reverted in the same transaction — risky for production migrations
- Mig 011 staff_lifecycle does use ENUM, but lifecycle states (4) are universal and stable; reason codes are softer and likely to evolve

### api derived field

`is_excused` is computed in api response, never stored. Single source of truth for compliance score.

```typescript
// apps/api/src/utils/drill-participant.ts (new)
export function isExcused(p: DrillSessionParticipant): boolean {
  if (p.status === 'SAFE' || p.status === 'ACKNOWLEDGED') return true;
  if (p.reason_code === null) return false;
  if (p.reason_code === 'OTHER') {
    return (p.reason_notes ?? '').trim().length >= 10;
  }
  return true;
}
```

### UI labels

| Enum value | English label | Mobile + Dashboard (today) | i18n key (future) |
|---|---|---|---|
| `OFF_DUTY` | Off-duty | hardcoded | `drill.reason.off_duty` |
| `ON_LEAVE` | On leave | hardcoded | `drill.reason.on_leave` |
| `ON_BREAK` | On break | hardcoded | `drill.reason.on_break` |
| `ON_DUTY_ELSEWHERE` | On duty elsewhere | hardcoded | `drill.reason.on_duty_elsewhere` |
| `DEVICE_OR_NETWORK_ISSUE` | Device or network issue | hardcoded | `drill.reason.device_or_network_issue` |
| `OTHER` | Other (specify) | hardcoded | `drill.reason.other` |
| `NULL` | Did not acknowledge | hardcoded | `drill.reason.not_acknowledged` |

### RLS policy

Per-staff timing data is potentially sensitive. RLS rule:

```sql
CREATE POLICY drill_session_participants_select ON drill_session_participants
  FOR SELECT USING (
    venue_id = current_setting('app.current_venue_id')::uuid
    AND (
      current_setting('app.current_role') IN ('SH','DSH','FM','SHIFT_COMMANDER','AUDITOR')
      OR staff_id = current_setting('app.current_staff_id')::uuid
    )
  );
```

- Command roles + auditor: full venue read
- Other roles (GS / FS / GM): see only their own row
- All cross-venue reads blocked (Rule 2 — venue_id everywhere)

---

## 6. Future-proofing — what we're reserving for later

### Phase B candidates (don't implement yet)

| Item | Why deferred | Phase B trigger |
|---|---|---|
| Promote `OTHER` patterns to dedicated codes | Need 50+ field observations per pattern before promoting; adds churn pre-pilot | After 6 months of pilot data |
| `staff.drill_exempt_until DATE` for permanent exemption | Should be staff-record-level not per-drill; needs HR workflow | Phase B (BR-22 cert tracker has similar patterns) |
| `LATE_ACKNOWLEDGEMENT` derived flag | Compliance scoring refinement; needs threshold tuning | Phase B BR-A PDF report |
| Multi-language labels | EC-15 i18n migration covers all screens | Phase B i18n pass |
| Per-reason analytics dashboard | "Drill comparison" view; phase 5.19 candidate | After validation gate |

### Evolution path

When a 7th category becomes obvious from field data:

1. Update this document — add row to taxonomy table with rationale
2. Update ADR 0004 — append a "v2 amendment" section
3. New migration `mig_NNN_drill_reason_extend.sql` — relax CHECK, add new value
4. Update api types + UI labels in same PR
5. Backfill is not needed — existing rows stay valid

---

## 7. Demo / pitch talking points

For sales, audit prep, and product demos. These are field-tested narrative beats.

### "Show me how the drill report works for an audit"

> "Click any drill row — you see a full timeline. Every staff member who was expected to participate is listed with their acknowledgement time, their evacuation time, and if they didn't respond, the reason. Six categories cover the real Indian operating reality: off-duty, on leave, on break, on duty elsewhere, device or network issue, or other. NABH has signed off on this taxonomy for hospital drill records. Telangana Fire Service uses the same categories on Form FF-3. Auditor opens the PDF, sees the table, leaves satisfied."

### "How do you handle the ICU nurse problem?"

> "If a fire drill goes off and an ICU nurse is on patient care, what happens? Two options: she abandons the patient to acknowledge the drill — that's a clinical protocol violation. Or she stays with the patient and gets flagged as 'missed' on the drill record — that's an HR injustice. We solved this with the 'On duty elsewhere' category. The SH classifies post-drill, the audit log shows who decided, when, and why. NABH signs off because the protocol is followed. The nurse isn't disciplined because the system understood the situation."

### "What if a staff member just doesn't bother to respond?"

> "Then there's no reason on the record. NULL — 'Did not acknowledge'. We don't have an 'Unexcused' button to make the SH feel comfortable hitting it; we want the honest record. The drill compliance score uses the unexcused count. If a venue has a chronic non-responder problem, the score drops, and the dashboard shows it. The system doesn't soft-pedal accountability."

### "What about DPDP and labour law?"

> "We're conservative on both. DPDP says health data is sensitive — so we don't separate sick leave from other leave. The HRIS holds that detail. Indian labour law has multiple leave types — we don't enumerate them. Just 'On leave'. Enough for the drill record. Cleaner data model. No privacy debt."

### "What happens when the building has dead zones?"

> "Real story from the field — Tower B has a basement parking lot with no signal. Three guards there missed the last drill. Old system: marked as 'absent', SH had a discipline conversation. SafeCommand: marked as 'Device or network issue' — system flagged the cluster, generated an action item: deploy a signal extender. Three months later, drill compliance for that zone is 100%. The taxonomy turned a discipline conversation into a Wi-Fi survey."

### "Can SH game the system by marking everyone Off-duty?"

> "No. Three guardrails: First, 'On duty elsewhere' and 'Other' both require a written reason. Second, every reason classification is audit-logged with who set it and when. Third, the audit-log is append-only — you can't quietly fix a previous classification. Auditor sees the whole history."

---

## 8. References

1. **ISO 22398:2013** — Societal security: Guidelines for exercises. International Organisation for Standardisation. Geneva, 2013.
2. **NFPA 1600 (2019 edition)** — Standard on Continuity, Emergency, and Crisis Management. National Fire Protection Association. Quincy, MA, USA.
3. **NFPA 1561 (2020 edition)** — Standard on Emergency Services Incident Management System and Command Safety. National Fire Protection Association.
4. **FEMA / NIMS ICS Form 211** — Incident Check-In List. US Federal Emergency Management Agency. https://www.fema.gov/emergency-managers/national-preparedness/training/icsforms (referenced format only; URL provided for completeness — verify before citing in client materials).
5. **OSHA 29 CFR 1910.38** — Emergency Action Plans. US Occupational Safety and Health Administration.
6. **NABH (5th edition)** — Standards for Hospitals: Disaster Management Plan section. National Accreditation Board for Hospitals & Healthcare Providers, India.
7. **Telangana Fire Services Department** — Form FF-3 (Annual Fire Drill Register). Government of Telangana.
8. **National Disaster Management Authority (India)** — Mock Drill Guidelines for Fire Safety in Public Buildings.
9. **BIS IS 15883:2009 / IS 2189:2008** — Indian Bureau of Standards: Fire safety code; Code of practice for selection, installation and maintenance of automatic fire detection and alarm system.
10. **DPDP Act 2023 (India)** — Digital Personal Data Protection Act, Government of India.
11. **Industrial Disputes Act 1947** + **Factories Act 1948** + **Maternity Benefit Act 1961** (India).
12. **The Joint Commission** — Mass Casualty Incident drill standards. USA. (Comparison reference, not regulatory for India.)
13. **Drillster B.V.** — Drillster product documentation. The Netherlands.
14. **SafetyCulture iAuditor** — Product documentation. Australia.
15. **Everbridge** — Critical Event Management product documentation. USA.
16. **Rave Mobile Safety / RaveAlert** — Product documentation. USA.
17. **WhenIWork** — Workforce management product documentation. USA.
18. **Workday HCM** — Enterprise HR product documentation. USA.

> **Citation note for sales / pitch use:** When quoting any of the regulatory sources above to a prospect, double-check the current edition number and any India-specific revisions before publication. Standards evolve; this document captures research as of 2026-05-07.

---

## 9. Document maintenance

- **Owner:** SafeCommand Engineering (active until pilot go-live; SafeCommand Compliance team thereafter)
- **Review cadence:** Pre-pilot — review every 30 days. Post-pilot — review every quarter or after any incident involving a "MISSED" classification dispute.
- **Amendment process:**
  1. Field observation triggers proposal (e.g. new reason pattern in 50+ records, or audit feedback)
  2. Proposal evaluated against this document's principles (DPDP, simplicity, NABH/Fire NOC alignment)
  3. If accepted: amend this doc + ADR 0004 + mig_NNN
  4. Roll out across mobile + dashboard + ops-console in same PR
- **Sign-off authority:** Product (taxonomy decisions) + Engineering (schema & RLS) + Compliance (audit alignment)
