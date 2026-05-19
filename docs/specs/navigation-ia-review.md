# Navigation Consistency — Validated UX Review (PARKED)

> **Status: PARKED for later review (2026-05-19).** No code changes made.
> Captured at founder request; revisit alongside `UX-DESIGN-DECISIONS.md`.
> Authoritative inputs: `UX-DESIGN-DECISIONS.md` §1.4/§2/§4.4 · CLAUDE.md
> Roles "Interface" model · industry best-practice (cross-platform IA).

## 1. Premise check — "identical menus" is the WRONG target

- `UX-DESIGN-DECISIONS.md` §2: native GM mobile shell was **rejected** —
  the Expo mobile app covers ground staff (GS/FS/SC); the GM role uses
  the dashboard. → **Two apps, two user populations, by design.**
- CLAUDE.md Roles Interface model: GS/FS = Mobile+WhatsApp only; SC/FM/
  SH/DSH = Mobile + Web Dashboard (dual); GM = Web Dashboard primary;
  AUD = Web Dashboard read-only. Navigation is role/context-scoped.
- Industry practice: consistency = shared mental model + taxonomy with
  **platform-adapted presentation/scope**, not pixel-identical menus.
  Identical menus would also violate NFR-04 (≤3 taps) / NFR-05.
- **Goal = principled parity:** one canonical taxonomy + explicit
  role×platform visibility rules. Fix accidental drift; preserve
  intentional role/context divergence.

## 2. Ground-truth correction

- Mobile "Declare Incidents → should be Incidents w/ search": **already
  fixed in PR #13** (merged) — mobile drawer now has distinct
  "Incidents" → IncidentsListScreen (Active/Past/Scheduled + search) AND
  separate "Declare Incident". Observation predated the merge.
- Mobile lacks Safety Analytics: confirmed (GM/command BI = dashboard by
  Roles model; optional dual-role parity, not a defect).
- Disabled placeholders largely consistent-by-intent.

## 3. Root cause

No shared navigation manifest. `apps/dashboard/lib/nav-config.ts`
(clean §4.4 5-group taxonomy) and mobile `TasksScreen.drawerGroups`
(ad-hoc groups) evolved independently and drift structurally. The
inconsistency is mostly taxonomy/label drift, not missing capability.

## 4. Canonical destination matrix (verdicts)

✅ consistent · 🔵 intentional divergence (keep) · ⚠️ accidental drift (fix) · 🚫 not-built placeholder

| Destination | Dashboard | Mobile | Verdict |
|---|---|---|---|
| Dashboard (venue BI home) | ✅ | — | 🔵 keep (GM/command) |
| Zone Status / Accountability | ✅ | ✅ | ✅ |
| Incidents (list+search) | ✅ | ✅ (PR#13) | ✅ |
| My Tasks / My Shift / My Certs | — | ✅ | 🔵 keep (personal scope) |
| Shifts & Roster · Handover | ✅ | ✅ | ✅ |
| Equipment · Drills · Certifications | ✅ | ✅ | ⚠️ grouping/label drift |
| Staff | ✅ "Staff" | ✅ "Manage Staff" | ⚠️ label drift |
| Safety Analytics (BR-31) | ✅ | ✗ | 🔵→optional dual-role parity |
| Festival/Event Mode | control+banner | drawer toggle+banner | ⚠️ minor presentation |
| Broadcast/Tasks/Briefings/Visitors/Audit/Exports/Permissions/VenueProfile/Notifications/Help/Support | shown disabled | mostly omitted | ⚠️ placeholder-treatment drift |

## 5. Recommendations (await sign-off — no code yet)

1. Adopt UX-DESIGN-DECISIONS §4.4 5-group taxonomy as the **canonical
   cross-platform IA**; refactor mobile drawer to same groups/labels/order.
2. Codify a **role × platform visibility matrix** (from Roles Interface
   model) → divergence becomes rule-driven, intentional.
3. **Structural fix:** shared nav manifest in `packages/` consumed by
   both surfaces so they can't drift again (root-cause fix).
4. Label normalization; keep "My …" only where scope is personal,
   documented as intentional; "Manage Staff" → "Staff".
5. One placeholder policy (recommend: show disabled items on both).
6. Do NOT menu-clone (contraindicated by architecture + NFR-04/05).
7. Optional fast-follow: compact mobile Safety Analytics + mobile
   post-incident report for dual-interface roles (SH/DSH/SC).
8. Re-verify PR #13 Incidents entry on a fresh mobile build.

## 6. Suggested sequencing (when un-parked)
(a) Produce canonical role×platform navigation manifest spec doc →
(b) implement shared manifest + mobile drawer refactor to §4.4 →
(c) optional analytics/report mobile parity.
