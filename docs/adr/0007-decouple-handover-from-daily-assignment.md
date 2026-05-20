# ADR 0007 — Decouple Shift Handover from Daily Assignment

**Status:** Accepted (implementation gated by Hard Rule 24 — Migration 021)
**Date:** 2026-05-20
**Deciders:** Sachin Sablok (Founder), Nexus Prime, Nexus Forge
**Spec source:**
- SafeCommand Shift Roster Architecture v1.0 §9 (Forge, 2026-05-20) — engineering ADR text + §3.6 BR-12 surgical refactor + §5.1 mig-021 DDL
- SafeCommand Shift Roster Requirements v1.1 §9 (Prime, 2026-05-20) — business ADR text (originally numbered "ADR-0011" in the spec; renumbered per ADR 0001's next-free-integer invariant — see Reconciliation below)

---

## Context

The current shift model materialises **one `shift_instance` row per (venue, shift, date)** with per-instance bulk-replace zone assignments — every day, an SC/SH must manually create the instance, activate it, assign the commander, and bulk-assign every staff→zone. For a 24×7 supermall pilot (3 buildings, ~30 staff) this is ~39 manual ops/day → ~4,700/SC/year, with **no NABH §HRM duty-roster artefact** produced.

The planned recurring-pattern engine (BR-AK…BR-AU, Phase 5.24) replaces the producer of `shift_instance`/`shift_assignment` rows with an auto-materialisation worker (BR-AO) driven by published roster patterns. The question this ADR resolves: **does BR-12 (Shift Handover, LIVE per PRs #9 + #10) need to change?**

## Decision

**The BR-12 contract remains unchanged.** What changes is the *mechanism* that produces the `shift_instance` rows on which the handover keys.

- **Before (today):** SC/SH manually creates `shift_instances` and bulk-assigns staff each day → BR-12 handover keys on those instances → works.
- **After (Phase 5.24):** Auto-materialisation worker (BR-AO) generates `shift_instances` and `shift_assignments` from published roster patterns → BR-12 handover keys on those instances → **same contract**.

The handover code path is preserved verbatim at the **API contract level** — endpoints, payloads, status codes, and `shift_handovers` table schema all unchanged. **One internal refactor** lands when Migration 021 ships: the handover-pending notification service reads `shifts.min_handover_minutes` (mig 021 BR-AR column) instead of a hardcoded `15` constant. Tests are parameterised over default (15), custom (e.g., 20-min ICU, 30-min high-stakes), and overnight cases.

```typescript
// Before (today)
const NOTIFICATION_LEAD_MINUTES = 15;
const fireAt = subMinutes(outgoingInstance.shift_end_at, NOTIFICATION_LEAD_MINUTES);

// After (post mig 021)
const fireAt = subMinutes(
  outgoingInstance.shift_end_at,
  outgoingShift.min_handover_minutes,  // read from outgoing shift's row
);
```

This is the *only* application-code change in Wave 1 of the shift-roster wave.

## Consequences

### Positive
- **Customer migration narrative.** Existing bulk-assignment venues continue to work; BR-12 handover continues; new pattern-driven venues get the same BR-12 handover; zero workflow change visible to staff.
- **Engineering clarity.** Prevents the months-long debate about whether the pattern engine refactors handover.
- **Hospital pipeline (Phase 2).** Published roster + immutable handover audit = NABH §HRM duty-roster artefact natively.
- **Test reuse.** Existing BR-12 test suite stays valid; new tests cover only the new parameterisation.

### Negative / risks
- **Small internal refactor.** The "BR-12 contract unchanged" claim is true at the API level; the *internal* handover-window calculation does change (one function in `services/handover-notification.ts`). Mitigation: parameterised tests covering default/custom/overnight.
- **Hard Rule 24 coupling.** The handover-service refactor MUST NOT deploy before mig 021 is applied to production (CI gate enforces).

### Hard Rule alignment
- **Rule 24** (schema before code): mig 021 is applied + verified before the handover-service refactor deploys.
- **Rule 3** (never modify deployed migration): respected — mig 021 is new and purely additive.
- **Rule 4** (audit append-only): unchanged; BR-12's existing audit-log writes continue.

## Reconciliation flags (resolved)

| # | Spec assumption | Repo reality | Resolution |
|---|---|---|---|
| 1 | This ADR is "ADR-0011" per Arch v9.1 §1.3b reservation + Shift Roster spec | Next-free integer in `docs/adr/` is `0007` (deployed: 0001–0006) | **ADR-0007** — this file. v9.1 §1.3b's four placeholders (0007 IMDF / 0008 Konva / 0009 jurisdiction-profiles / 0010 AI-parsing) are forward-looking only; none has been formalised. Per ADR-0001's next-free-integer invariant, the next ADR to be formalised claims the next-available slot regardless of reservation. |
| 2 | Shift-roster wave migration numbering = 024+ per spec | Next-free integer in `supabase/migrations/` is `021` (020 consumed by §23 standards-closure P1 on 2026-05-19) | Shift-roster wave = **021/022/023**. See ADR 0001 amendment 2026-05-20. |
| 3 | Spec footnote: "ADR-0004 is Phase 1 pilot selection" per Arch v9.1 §1.3b | `docs/adr/0004-drill-reason-codes.md` is LIVE drill-reason-codes ADR | Repo authoritative. BR-AN unavailability types mirror the *repo's* 0004 taxonomy. |

Architecture v10 will correct the v9.1 §1.3b reservation table to match the deployed reality.

## Implementation gate

This ADR is **Accepted** as a design decision; implementation gates on **Hard Rule 24 — Migration 021 applied + verified in production** before the handover-service refactor + BR-AR API/UI extensions deploy. Wave 1 deployment sequence:

1. Founder applies `021_shifts_multi_shift_breaks.sql` via psql `--single-transaction` (same mechanism as SIRE mig 014 and §23 mig 020).
2. Verification: `NOTICE: Migration 021 PASSED: shifts extended with 5 columns; is_overnight is GENERATED`.
3. Code ships: handover-service refactor + `/v1/shifts` field surface + Ops Console editor + dashboard editor.
4. Tests: parameterised handover-window + JSONB breaks structural + overnight cases.

## References

- **SafeCommand Shift Roster Architecture v1.0** (Forge, 2026-05-20) — `nexus/specs/SafeCommand_ShiftRoster_Architecture_v1.md`. Full §9 ADR text + §3 BR-AR pull-forward spec + §5.1 mig-021 DDL + §3.6 BR-12 surgical refactor + §2 reconciliation.
- **SafeCommand Shift Roster Requirements v1.1** (Prime, 2026-05-20) — `nexus/specs/2026-05-20_shift-roster-requirements.md`. 11 BRs (BR-AK…BR-AU) + original ADR-0011 (now ADR-0007 here).
- **BR-12 (Shift Handover)** — LIVE per PRs #9 + #10; see `docs/specs/sire-delivery-validation.md` and `apps/api/src/routes/handovers.ts`.
- **BR-AR (Multi-Shift Flexibility)** — schema in `supabase/migrations/021_shifts_multi_shift_breaks.sql`.
- **BR-AK through BR-AU** — full Phase 5.24 roster engine (Q1 2028 per architecture timing).
- **ADR-0001** — migration numbering invariant + spec↔repo authority principle (2026-05-20 amendment).
- **ADR-0005** — workers always-on from June 2026 (BR-AO materialisation worker activates after this).

---

*ADR captured 2026-05-20 · Status: Accepted (implementation gated by Hard Rule 24 — Migration 021)*
