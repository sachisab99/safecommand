# ADR 0004 — Drill participant non-acknowledgement reason codes

**Status:** Accepted
**Date:** 2026-05-07
**Deciders:** Sachin Sablok (Founder), Nexus Prime (claude-opus-4-7)
**Refines:** BR-A (Drill Management Module — "missed-participant logging") — does NOT supersede; this ADR captures the implementation taxonomy
**Companion artefact:** [`docs/research/drill-participant-reason-taxonomy.md`](../research/drill-participant-reason-taxonomy.md) — full industry research, sources, demo talking points
**Schema:** repo migration `013_drill_participant_reason.sql`

---

## Context

Phase 5.11 shipped the Drill Management Module's lifecycle (schedule / start / end / cancel). The module records aggregate participation counts (`total_staff_expected` / `total_staff_acknowledged` / `total_staff_safe` / `total_staff_missed`) but does not capture **who** missed and **why**.

Phase 5.18 closes that gap by writing per-staff rows into `drill_session_participants` (the table was added in mig 010 but no flow currently writes to it). At drill end, any participant who didn't acknowledge transitions to `MISSED` status.

A blanket `MISSED` classification creates three operational problems:

1. **Audit defensibility.** Fire NOC inspectors and NABH auditors expect a *reason* per non-acknowledgement, not a single MISSED column.
2. **HR / labour-law exposure.** Indian labour law (Industrial Disputes Act 1947 + Factories Act 1948) treats wrongful-conduct records seriously. Permanent "MISSED" without context invites disputes.
3. **Operational learning loss.** A "MISSED" cluster in a basement parking zone is more likely a dead-zone signal issue than a discipline issue. Without a reason taxonomy, the system can't surface this.

A reason field is needed. The question is: **what taxonomy?**

---

## Decision

### Six reason codes plus NULL

Adopted after surveying ISO 22398, NFPA 1600/1561, FEMA NIMS, OSHA, NABH Disaster Management Plan standard (India), Telangana Fire Service Form FF-3, NDMA Mock Drill Guidelines, BIS IS 15883 / 2189, and 6 industry SaaS comparisons. Full survey in `docs/research/drill-participant-reason-taxonomy.md`.

| Code | Display label | Excused? | Audit alignment |
|---|---|---|---|
| `OFF_DUTY` | Off-duty | ✅ | Telangana Fire register, NABH, NFPA |
| `ON_LEAVE` | On leave | ✅ | Telangana Fire register, NABH; intentionally coarse for DPDP |
| `ON_BREAK` | On break | ✅ | Factories Act 1948 §55 break entitlement |
| `ON_DUTY_ELSEWHERE` | On duty elsewhere | ✅ | NABH "On clinical duty" alignment (hospital pilot) |
| `DEVICE_OR_NETWORK_ISSUE` | Device or network issue | ✅ (with IT flag) | NFR-07 (2G/3G compatibility) reality |
| `OTHER` | Other (specify) | Conditional | Universal escape; `reason_notes` ≥10 chars enforced by CHECK |
| `NULL` (no value) | Did not acknowledge | ❌ default | Honest unexcused state; SH leaves NULL when no excuse applies |

### Schema choices

- **TEXT + CHECK constraint, not PostgreSQL ENUM.** Adding a 7th category in future is a one-line ALTER (relax CHECK then re-add). PostgreSQL `ALTER TYPE ... ADD VALUE` is non-transactional and not safely revertible — too risky for production.
- **`OTHER` requires `reason_notes` ≥10 chars** — DB CHECK enforces. Prevents drive-by classifications. 10 chars accommodates "ER ambulance run" / "Off-prem training" / "Vendor escort" while blocking single-character noise.
- **Audit trail columns** (`reason_set_by` + `reason_set_at`) — defends against post-hoc reason rewrites in HR disputes; aligns with EC-10 / Hard Rule 4 audit-immutability principle (audit_logs entry written for every reason set/change as well).
- **Audit consistency CHECK** — all-or-nothing (`reason_code` ↔ `reason_set_by` ↔ `reason_set_at`) — prevents partial state.

### Display label is decoupled from data layer

- Data layer keeps the technical term `MISSED` (matches BR-A literal "missed-participant logging") for compliance PDF + auditor raw-export consumption.
- UI displays "Did not acknowledge" — soft-language for HR / labour-law sensitivity.
- `reason_code` provides the structured context that bridges the two.

This separation is intentional: technical truth in data, human-aware language in UI, structured context bridging them.

### `is_excused` derived in api response, not stored

```typescript
function isExcused(p: DrillSessionParticipant): boolean {
  if (p.status === 'SAFE' || p.status === 'ACKNOWLEDGED') return true;
  if (p.reason_code === null) return false;
  if (p.reason_code === 'OTHER') {
    return (p.reason_notes ?? '').trim().length >= 10;
  }
  return true;
}
```

Single source of truth — api computes from raw fields. Compliance score (BR-14 drill component) and PDF report (Phase B BR-A) read this single function. Prevents drift between code and stored bool.

### On-duty determination at drill start (hybrid)

When `PUT /v1/drill-sessions/:id/start` is called, the api needs to enqueue participant rows. Source of "who is on duty":

1. **First try:** staff with active `staff_zone_assignments` joined to `shift_instances WHERE status='ACTIVE'`, filtered to `drill.building_id` if drill is building-scoped.
2. **Fallback (if zero results):** all `staff WHERE is_active=true AND venue_id=drill.venue_id`, filtered to `building_id` if drill is building-scoped.

Each path logs a distinct `audit_logs` entry: `STARTED_FROM_SHIFT_ROSTER` or `STARTED_FROM_VENUE_ALL`. Auditor can see decision basis.

Rationale: surprise after-hours drills and venues that haven't fully rolled out shift management still produce participation records. NABH-aligned (NABH allows ad-hoc drills outside scheduled shifts).

### RLS policy

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

Per-staff timing data is potentially sensitive. Command roles + AUDITOR get full venue read; other roles see only their own row. Cross-venue access blocked (Rule 2 — venue_id everywhere).

Write path is api-mediated through `requireRole('SH','DSH','FM','SHIFT_COMMANDER')` — RLS UPDATE/INSERT policy not strictly required since service-role bypass via api routes; but a future PR can add explicit UPDATE RLS for defence-in-depth.

---

## Alternatives considered

### A. Use PostgreSQL ENUM type instead of TEXT + CHECK

Considered. Rejected because:
- ENUM `ALTER TYPE ... ADD VALUE` is non-transactional in PostgreSQL — can't rollback in same transaction
- Production schema migrations should be transaction-safe
- Mig 011 staff_lifecycle does use ENUM, but lifecycle states (4) are universal and stable; reason codes are softer and likely to evolve
- TEXT + CHECK has equivalent storage cost (PostgreSQL stores TEXT efficiently) and equivalent index behaviour for the tiny enum set

### B. Add `UNEXCUSED` as an explicit enum value

Considered. Rejected because:
- NULL already represents "no reason set / unexcused" — adding an enum value creates dual representations
- The data semantic is *absence of reason*, which is exactly what NULL captures
- Adding the value invites confusion ("should I NULL this or set UNEXCUSED?") — clarity comes from a single representation

### C. Subcategorise `ON_LEAVE` into SICK / CASUAL / EARNED / MATERNITY / etc.

Considered. Rejected because:
- DPDP Act 2023 treats health-linked leave (sick) as sensitive personal data
- HRIS already holds the leave-type detail; safety system shouldn't duplicate
- Drill record needs to know "was excused via leave system" — sub-type is not load-bearing for compliance
- Audit-trail bias: singling out `SICK_LEAVE` makes one leave type more visible than others; DPDP-conservative posture is to stay coarse

### D. Promote `EXEMPT_PERMANENT` (wheelchair / late-pregnancy mobility restriction) as a code

Considered. Rejected for now because:
- Permanent exemption should live at staff-record level (`staff.drill_exempt_until DATE`), not per-drill reason
- Re-entering the same reason every drill creates maintenance burden + audit-trail noise
- Phase B item — implement as `staff` column when the use case becomes operationally common

### E. Add `LATE_ACKNOWLEDGEMENT` as a code

Considered. Rejected because:
- Lateness is a different concept — a derived flag (`acknowledged_at > drill_started_at + threshold`), not a reason
- Phase B compliance scoring may add this as a derived column, separate from reason taxonomy
- Adding it as a reason muddles the data model

### F. Skip the reason field entirely; rely on aggregate `total_staff_missed` count

Status quo before Phase 5.18. Rejected because:
- Audit defensibility gap (NABH / Fire NOC inspectors expect per-staff reasons)
- HR / labour-law exposure on permanent MISSED records without context
- Operational signal loss (dead-zone vs discipline indistinguishable)
- The `drill_session_participants` table was added in mig 010 specifically to enable this

---

## Consequences

### Positive

- **NABH-ready** for hospital pilot — `ON_DUTY_ELSEWHERE` directly aligns with NABH "On clinical duty"
- **Fire NOC-ready** for supermall pilot — code set mirrors Telangana Fire Service Form FF-3
- **DPDP-conservative** — coarse-grained on health data, structured on operational data
- **Operationally honest** — `DEVICE_OR_NETWORK_ISSUE` surfaces infrastructure gaps that masking would hide
- **Audit defensible** — per-staff reasons + immutable `reason_set_by` / `reason_set_at` fields
- **Sales-ready** — taxonomy doc has demo talking points; auditors and prospects respond well to "we built this against NABH + Fire NOC + DPDP"
- **Evolvable** — TEXT + CHECK schema allows easy 7th-category addition; OTHER + free-text feeds taxonomy evolution

### Negative

- **Historical drills have no participant rows.** Pre-Phase-5.18 drills (the 3 demo drills + any real ones) will show "Per-staff acknowledgement tracking begins 2026-05-08" in detail view. Acceptable — auditor sees data start date.
- **One more migration during May freeze.** Mig 013 follows the founder Choice A precedent (mig 009/010/011/012 deployed in May). Schema-only, additive, sub-second ALTER. Cost: trivial.
- **Two display labels for one DB value.** "MISSED" in DB / PDF / auditor raw export; "Did not acknowledge" in UI. Documented in this ADR + taxonomy doc; ongoing maintenance: don't drift.
- **`reason_set_by` / `reason_set_at` columns mean even read-only audit becomes mildly larger.** Negligible — 2 columns × ~50 bytes per row × few thousand rows per venue per year.

### Neutral

- **i18n debt unchanged.** New labels follow existing Phase 5 pattern (hardcoded English). Phase B i18n migration covers all screens at once.
- **Realtime not used.** Polling-only for v1 (10s refetch on detail page when status=IN_PROGRESS). Realtime in Phase B if usage justifies.

---

## Future work

Reserved for later (capture in this ADR for traceability):

| Item | Trigger |
|---|---|
| Promote `OTHER` patterns to dedicated codes | After 6 months of pilot data, when 50+ field observations cluster around a pattern |
| Add `staff.drill_exempt_until DATE` column for permanent exemption | Phase B (BR-22 cert tracker has similar patterns; bundle with) |
| `LATE_ACKNOWLEDGEMENT` derived flag for compliance scoring | Phase B BR-A PDF report |
| i18n keys for the 6 reason labels | Phase B i18n migration (all screens together) |
| Per-reason analytics dashboard ("Drill comparison" view) | Phase 5.19+ candidate — after validation gate |
| Multi-channel acknowledgement (push + WhatsApp + SMS) for drill banner | Phase B (BR-09 / BR-10 unblocked when WABA + Airtel DLT land) |
| CORP-* role aggregation queries on excused vs unexcused rates per venue | Phase 3 (governance hierarchy) |

---

## References

- `docs/research/drill-participant-reason-taxonomy.md` — full industry survey + per-code field guide + sales talking points + 18 sources
- `supabase/migrations/013_drill_participant_reason.sql` — schema implementation
- BR-A — Drill Management Module ("missed-participant logging") — Architecture v7
- NFR-07 — 2G/3G compatibility — Architecture v7
- Hard Rule 4 — Audit logs are write-once
- EC-10 — Audit logs append-only
- DPDP Act 2023 (India) — Digital Personal Data Protection
- NABH Disaster Management Plan standard (5th edition) — National Accreditation Board for Hospitals & Healthcare Providers (India)
- Telangana Fire Services Department — Form FF-3 Annual Fire Drill Register
