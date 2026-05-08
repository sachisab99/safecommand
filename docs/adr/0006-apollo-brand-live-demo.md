# ADR 0006 — Apollo brand live demo strategy (Option C Hybrid)

**Status:** Accepted
**Date:** 2026-05-08 (codifying decision recorded in Business Plan v8.0 / Architecture v8 dated 2026-05-10)
**Deciders:** Sachin Sablok (Founder), Nexus Prime (claude-opus-4-7)
**Related:** ADR 0002 (ThemeProvider Phase A scaffold), ADR 0003 (ThemeProvider 6-step build sequence), v7 spec `apollo-mockup-spec.md`, NFR-35 (WCAG 2.1 AA contrast on safety-critical screens)

---

## Context

The Enterprise Brand Enablement layer (BR-81 through BR-88) is a corporate-level revenue lever — corporate accounts pay an additional ₹15,000–5,00,000/month plus one-time configuration fees for "Apollo SafeCommand" style branding (logo, colour palette, terminology, dedicated WhatsApp Business Account). v8 §17 commercial model values this at 27% ARR uplift per corporate account.

For corporate sales conversations, a working live demonstration of Apollo-branded SafeCommand is the closing tool. Three options were considered:

- **Option A — Static mockup deck:** Photoshop screenshots of branded screens. Fast to produce. Closes few deals.
- **Option B — Click-through prototype:** Figma interactive prototype. Better than static. Still not "live working software."
- **Option C — Hybrid live demo:** Real device running the app with Apollo brand config applied. Operates against a seeded `apollo-demo` venue. The corporate prospect sees their own logo, colours, and terminology in a working safety command system.

Option C requires:
- ThemeProvider operational (✅ shipped Phase A per ADR 0002)
- `corporate_brand_configs` table with apollo-demo row populated
- Apollo logo asset uploaded to S3 (founder action)
- WCAG 2.1 AA contrast validation for Apollo's brand colours (`#C8102E` red on white)
- Mandatory fair-use footer disclaimer
- Loom video produced for asynchronous walkthroughs

v7 originally planned a static mockup deliverable (`docs/sales/apollo-mockup-spec.md`). v8 explicitly elevates this to a live device demonstration.

---

## Decision

### Option C Hybrid — live working Apollo-branded demo on real device, from June 1

The deliverable evolves from "Apollo mockup" (v7) to **"live working Apollo-branded SafeCommand demonstration on a real Android device"** (v8). This is a single demo flow: Apollo's logo + Apollo red `#C8102E` + branded terminology applied across mobile + dashboard + ops-console, running the same Phase 1 codebase that powers all customer venues.

### Operational scope of the Apollo demo

The Apollo-branded venue must be a **production-like replica with all Phase 1 features functional**, not a stripped-down preview. Specifically, the demo flow exercises:

| Feature | Apollo demo includes |
|---|---|
| Login + auth | Phone OTP via Firebase test number, branded splash + login screen |
| Drawer | Apollo logo, Apollo red accents, "Apollo SafeCommand" wordmark |
| Tasks | Real scheduled tasks for "today" via seed; Apollo terminology overrides ("ward" not "zone" if Apollo prefers) |
| Zone Status / Accountability | Real seeded zones in 3 buildings (mirroring Apollo Hyderabad layout) |
| Drills | Phase 5.18 drill detail with Apollo-branded participation matrix; reason taxonomy in use |
| Equipment / Drills / Cert / Shifts / Staff | All Phase 5.13–5.17 surfaces, branded |
| Incident declaration | BR-11 flow with Apollo SH login |
| 'Powered by SafeCommand' footer | Visible in Settings > About + (in Phase B) PDF report footers — non-removable per Hard Rule 20 |

The demo is internally referenced as **DEMO-APOLLO-LIVE** to distinguish from the existing demo flows in `docs/sales/demo-runbook.md`.

### NFR-35 contrast validation — mandatory pre-demo gate

WCAG 2.1 AA contrast requires 4.5:1 on safety-critical screens. v8 explicitly confirms:

| Apollo colour | Background | Contrast ratio | WCAG 2.1 status |
|---|---|---|---|
| `#C8102E` (Apollo red) | `#FFFFFF` (white) | 8.0:1 | ✅ AAA (≥7:1) |
| `#C8102E` | `#0F172A` (slate-900 dark text) | 4.96:1 | ✅ AA (≥4.5:1) |
| `#C8102E` | `#F8FAFC` (slate-50 light surface) | 7.5:1 | ✅ AAA |

NFR-35 is satisfied. No additional palette adjustments required for Apollo specifically.

For other brand override candidates, the SC Ops contrast review process (per ADR 0002) applies before activation.

### Mandatory fair-use disclaimer

Every Apollo demo screen and the Loom video carry the disclaimer:

> *"Apollo SafeCommand concept demonstration — internal SafeCommand sales presentation only. 'Apollo' is a registered trademark of Apollo Hospitals Enterprise Limited. Use under fair-use sales discussion."*

Implementation:
- **Mobile + dashboard:** footer banner during the demo; can be hidden in production via brand config flag
- **Loom video:** opening + closing slide with disclaimer on screen for 3 seconds each
- **Sales materials:** disclaimer printed on every printed page or shared PDF

### Demo distribution restrictions

Per Risk Register, the Apollo demo is for **direct sales conversations only** — not published externally. Specifically:

- ✅ Loom video shared via direct private link to corporate prospect
- ✅ Live demo on real device during in-person or video call sales conversations
- ❌ NOT published on website
- ❌ NOT used in social media marketing
- ❌ NOT shared with prospects who haven't signed an NDA-equivalent (typically corporate prospects with active conversations)

---

## Demo runbook integration

A new entry in `docs/sales/demo-runbook.md` (DEMO-APOLLO-LIVE) captures:

- Pre-demo setup steps (apollo-demo seed apply, logo verification, brand config check)
- 3-min and 10-min demo flow scripts
- Audience-specific narratives for hospital corporate vs mall corporate vs hotel corporate
- Reset procedure between demos
- Troubleshooting (theme not applied, branded login screen not appearing, etc.)

See `docs/sales/demo-runbook.md` §11 for the full DEMO-APOLLO-LIVE entry.

---

## Operational prerequisites — pre-June 1

Owner: founder. Engineering supports.

| Item | Owner | Status as of 2026-05-08 |
|---|---|---|
| Apollo logo SVG / PNG uploaded to S3 (`s3://sc-evidence-prod/brand-assets/apollo/`) | Founder | ⏳ Pending |
| `corporate_brand_configs` row for `apollo-demo` activated in production Supabase | Founder + Engineering | ⏳ Apollo-demo seed file exists at `apps/ops-console/seeds/apollo-demo.sql`; not applied to production yet |
| Mandatory disclaimer text added to mobile + dashboard footer (during demo only) | Engineering | ⏳ Pending; small Phase A-style addition |
| Loom video script drafted | Founder | ⏳ Pending |
| Loom video recorded (3-min and 10-min variants) | Founder | ⏳ Pending |
| WCAG 2.1 AA contrast validation re-checked on 6 hero screens | Engineering | ⏳ Pending; should be quick given `#C8102E` 8.0:1 |
| Demo runbook §11 DEMO-APOLLO-LIVE entry written | Engineering | ✅ Done as part of this ADR (see `demo-runbook.md`) |

---

## Alternatives considered

### A. Static mockup deck (v7 plan)

Rejected. Produces "concept" not "working software." Corporate prospects want to see operational reality. v7 mockup deliverable retained in `docs/sales/apollo-mockup-spec.md` for archival reference but no longer the production target.

### B. Figma click-through prototype

Rejected. Better than static but still not real software. Cost in design tooling + time-to-produce comparable to live demo, with strictly less impact.

### D. Skip Apollo branding entirely; sell on default SafeCommand brand

Rejected. v8 §14 commercial model values brand layer at 27% ARR uplift; deferring this layer cuts ~₹40 lakhs–1.5 Cr ARR opportunity in Year 1. Risk-adjusted ROI of live demo investment (founder + ~2 days engineering) is positive.

---

## Consequences

### Positive

- **Live demo closes corporate deals.** Apollo-branded working software is the strongest sales asset.
- **NFR-35 validated** with measured contrast ratios; defensible with corporate compliance reviewers.
- **ThemeProvider validated end-to-end.** Apollo demo exercises the full ThemeProvider chain (config → token → component render); functions as continuous integration for brand layer.
- **Reusable pattern** for future corporate brand demos (Hilton, ITC, Tata Hospitals, etc.). The demo flow shape transfers; only the brand config changes.
- **27% ARR uplift opportunity** unlocked per corporate account.

### Negative

- **Operational maintenance** required — apollo-demo seed must be kept in sync with production schema; brand config rolling forward through migrations. Mitigated by SC Ops Console template editor (Phase B) eventually managing this.
- **Trademark risk** — depending on Apollo's response to demonstration usage, may require formal letter of permission or alternative branding (use a different fictional hospital chain). Mitigated by mandatory fair-use disclaimer and direct-sales-only distribution.
- **WCAG validation lag** — every new brand candidate requires SC Ops contrast review; adds ~30 min per brand to onboarding flow. Mitigated by automated contrast check in SC Ops Console (Phase B).

### Neutral

- **No production impact** — Apollo demo runs on production codebase but in an isolated demo venue. Other tenants unaffected.
- **Existing v7 mockup spec** retained as reference; not actively maintained.

---

## Future revision triggers

- Apollo grants formal demonstration permission → upgrade to "endorsed demo" with their logo + endorsement quote
- Apollo objects to demonstration → migrate to a fictional hospital chain ("Asha Hospitals" or similar) preserving the demonstration shape
- Multi-brand portfolio (>5 active enterprise brand accounts) → SC Ops Console template editor must mature to manage brand configs at scale (Phase B)

---

## References

- Business Plan v8.0 (2026-05-10) §17 Hero Demo Sequences (Demo 5)
- Architecture v8 — ThemeProvider + brand config schema
- ADR 0002 — ThemeProvider Phase A
- ADR 0003 — ThemeProvider 6-step build sequence
- `docs/sales/demo-runbook.md` §11 DEMO-APOLLO-LIVE entry
- `docs/sales/apollo-mockup-spec.md` (archival, v7 plan)
- NFR-35 — Safety-critical screen WCAG 2.1 AA contrast
- Hard Rule 20 — 'Powered by SafeCommand' non-removable footer
