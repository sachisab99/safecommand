# Apollo SafeCommand — Mockup Spec (Path C)

**Status:** Spec captured (Phase A); implementation Phase B (June 2026)
**Owner:** Sachin Sablok (Founder)
**Drafted:** 2026-05-05
**Purpose:** Sales-conversation artefact — live "Apollo SafeCommand" experience demonstrable to corporate prospects (Apollo Hospitals India primarily; pattern reusable for Infosys / Marriott / mid-size hospital groups).
**Approach (per Q6 decision):** Path C — live working software via real ThemeProvider + `apollo-demo` brand config row. NOT a static Figma; NOT throwaway HTML.

---

## ⚠️ Mandatory legal disclaimer (every artefact, footer)

*"Apollo SafeCommand concept demo — internal SafeCommand sales presentation only. 'Apollo' is a registered trademark of Apollo Hospitals Enterprise Limited. Use under fair-use sales discussion."*

This disclaimer must appear in:
- Settings > About panel (visible alongside the non-removable 'Powered by SafeCommand' credit, per Rule 20)
- Footer of any screenshot used in sales material
- First slide of any deck or Loom video walkthrough

The mockup must NEVER be:
- Published publicly (no marketing site, no public blog, no LinkedIn post with screenshots)
- Demonstrated to anyone outside an Apollo decision-maker meeting under NDA
- Reused for prospects other than Apollo without re-spec'ing for that prospect's brand

---

## Why Path C (live working software) — recap

Per Plan §22 Recommendation #4 + Q6 analysis:
- **Highest fidelity** — Apollo procurement teams in 2026 will scrutinize any mockup; static Figma raises "is this real or fake?"
- **Reuses real code** — same ThemeProvider that ships in Phase B brand layer; mockup IS the product capability proof
- **Future-proof** — no throwaway implementation; demo code becomes test fixtures
- **WCAG validation as side-effect** — running the real `passesWcagAA` helper against Apollo colours validates NFR-35 simultaneously
- **Achievable only after Phase A** — ThemeProvider must exist first (Steps 2–8 of Phase A); without it, Path C is impossible. Phase A unblocked it.

---

## What the mockup must demonstrate

### Demo 4 — "The 'Apollo SafeCommand' Moment" (Plan §16.3)

Sales sequence:
1. After closing the corporate governance conversation, founder says: *"One more thing. Would you like Apollo SafeCommand — your logo, your colours, your role terminology — so it feels like an Apollo product to every guard and nurse?"*
2. Open the live demo at `app.safecommand.in/?brand=apollo-demo` (or via authenticated session linked to a `safecommand-demo` venue with `corporate_account_id` pointing at the apollo-demo brand row).
3. Page loads with Apollo's red/navy and 'Apollo SafeCommand' branding. Founder narrates each visible Apollo element.
4. Founder navigates to Settings > About: shows 'Apollo SafeCommand — Platform by SafeCommand. Version X.Y.Z' (Rule 20 in action — this is the proof, not a concession).
5. Founder generates a sample compliance PDF: shows Apollo letterhead in header, 'Powered by SafeCommand' in footer.
6. Closing line: *"That is Enterprise Brand Enablement. It costs INR 2,00,000/month more than the governance licence. It makes SafeCommand feel like an Apollo product from Day 1."*

---

## Brand config — apollo-demo row

When migration `010_brand_roaming_drill.sql` (Spec Migration 008) lands in Phase B, the following row must be inserted into `corporate_brand_configs`:

```sql
INSERT INTO corporate_brand_configs (
  corporate_account_id,        -- FK to corporate_accounts (apollo-demo seed)
  logo_url,                    -- S3-hosted Apollo logo (sales-only, NOT production)
  primary_colour,              -- '#C8102E'    Apollo red (verified WCAG AA: 5.88:1 vs white)
  secondary_colour,            -- '#002F6C'    Apollo navy (verified WCAG AA: 12.94:1 vs white)
  brand_name,                  -- 'Apollo SafeCommand'
  app_display_name,            -- 'Apollo SafeCommand'
  notification_sender_name,    -- 'Apollo SafeCommand'
  role_overrides,              -- JSONB (see below)
  terminology_dictionary,      -- JSONB (see below)
  report_header_text,          -- 'Apollo Hospitals Group | Safety & Security'
  powered_by_text,             -- 'Platform by SafeCommand' (HARD-CODED — Rule 20)
  configured_by_sc_ops_id,     -- founder's SC Ops staff ID
  is_active,                   -- TRUE only for demo; production Apollo config separate
  wcag_validated               -- TRUE (validated 2026-05-05 via apps/dashboard/lib/theme/wcag.ts)
)
VALUES (
  'apollo-demo-account-uuid',
  'https://sc-evidence-prod.s3.ap-south-1.amazonaws.com/internal/apollo-logo-demo.png',
  '#C8102E',
  '#002F6C',
  'Apollo SafeCommand',
  'Apollo SafeCommand',
  'Apollo SafeCommand',
  '{"SH":"Apollo Safety Head","SC":"Apollo Safety Officer","DSH":"Apollo Deputy Safety Head","FM":"Apollo Facility Manager","GS":"Apollo Site Guardian","FS":"Apollo Floor Lead"}'::jsonb,
  '{"Incident":"Safety Event","Zone":"Area","Building":"Block","Shift":"Watch"}'::jsonb,
  'Apollo Hospitals Group | Safety & Security',
  'Platform by SafeCommand',
  '<sc-ops-staff-uuid>',
  TRUE,
  TRUE
);
```

### Field-by-field rationale

| Field | Apollo demo value | Why |
|---|---|---|
| `primary_colour` | `#C8102E` | Apollo's published brand red. WCAG AA contrast against white = 5.88:1 ✓ |
| `secondary_colour` | `#002F6C` | Apollo's navy. WCAG AA contrast against white = 12.94:1 ✓ |
| `brand_name` | "Apollo SafeCommand" | Demo 4 line item |
| `notification_sender_name` | "Apollo SafeCommand" | WhatsApp + push sender display |
| `role_overrides.SH` | "Apollo Safety Head" | Plan §9.3 example |
| `role_overrides.SC` | "Apollo Safety Officer" | Plan §9.3 example (replaces 'Shift Commander') |
| `role_overrides.GS` | "Apollo Site Guardian" | Plan §9.3 example |
| `terminology_dictionary.Incident` | "Safety Event" | Per Apollo internal terminology preference (sales hypothesis) |
| `terminology_dictionary.Zone` | "Area" | Per Apollo internal terminology preference |
| `report_header_text` | "Apollo Hospitals Group \| Safety & Security" | Compliance PDF header |
| `powered_by_text` | "Platform by SafeCommand" | **HARD-CODED — DB CHECK constraint.** Rule 20. Cannot be NULL or modified. |

---

## Demo venue setup

The brand config attaches to a `corporate_account_id` which assigns to one or more venues. For the demo, reuse the existing development venue:

| Venue setup | Detail |
|---|---|
| Venue | `safecommand-demo` (existing dev venue with full Sprint 1 data: 3 floors, 12 zones, 5 schedule templates, 1 SH staff record) |
| MBV | Optional Phase B enhancement: add 3 buildings (MAIN-BLOCK / EMRG-BLOCK / DIAG-BLOCK) per Apollo Jubilee Hills example so Demo 2 (multi-building incident) can be shown alongside Demo 4 |
| Live data | Real RLS-enforced data (not mocked); live FCM push; live Supabase Realtime |
| Brand override | `corporate_account_id` set on this venue → fetches apollo-demo brand config → ThemeProvider renders Apollo identity |

The demo venue is a normal venue from the platform's perspective; the only special thing is its corporate brand association.

---

## Mockup screens (target Loom walkthrough sequence, ~3 minutes)

| # | Screen | Apollo elements visible | Talking-point |
|---|---|---|---|
| 1 | Splash / login | Apollo logo, Apollo red primary, "Apollo SafeCommand" header | *"Your guard's first impression — Apollo, not SafeCommand."* |
| 2 | Dashboard home | Health score in Apollo navy ring, Apollo red SEV1 alert tile, Apollo terminology ("Areas", "Watch") | *"Every label is yours — 'Area' instead of 'Zone' if that's how Apollo speaks internally."* |
| 3 | Zone Status Board (or Area Status Board per terminology) | Zone tiles with Apollo navy headers, severity colours UNCHANGED (red/orange/yellow — NFR-35 immutable) | *"Severity colours stay safety-standard regardless of brand — that's the WCAG and safety requirement."* |
| 4 | Active Incident detail | Apollo brand chrome, severity SEV1 in immutable red, "I AM SAFE" button in Apollo red | *"Notice the severity colour is locked — we cannot override safety-critical signals even if Apollo wanted that."* |
| 5 | Compliance PDF preview | Apollo letterhead at top: "Apollo Hospitals Group \| Safety & Security"; Apollo logo; 'Powered by SafeCommand' in footer | *"Reports go to NABH and Fire Brigade with Apollo's letterhead — and SafeCommand's name in the footer for procurement / liability traceability."* |
| 6 | Settings > About | "Apollo SafeCommand — Platform by SafeCommand. Version X.Y.Z." | *"This line is non-removable across all our enterprise customers. Here's why it protects Apollo more than us..."* (Plan §22 Rec #3 framing) |
| 7 | Push notification example | Lock screen showing: "Apollo SafeCommand: Your ICU perimeter check is due. Area C3. Tap to complete." | *"WhatsApp messages, app push, even the lock screen — your guards see Apollo, not us."* |

Each screen must include the legal disclaimer in its footer (small text, gray, but legible).

---

## Implementation steps (Phase B — June 2026)

Sequenced into the same June work session as migration 009/010 deployment:

1. **Pre-requisites** (gate-blocked by these earlier Phase B steps):
   - Migration `010_brand_roaming_drill.sql` deployed (`corporate_brand_configs` table exists with all columns + CHECK constraint)
   - Migration `009_mbv.sql` deployed (optional, only if Demo 2 multi-building demo is part of the same Loom)
   - Apollo logo asset uploaded to `s3://sc-evidence-prod/internal/apollo-logo-demo.png` (sales-only path; gitignored)

2. **Data**: insert the apollo-demo `corporate_accounts` row + `corporate_brand_configs` row (SQL above). Link `safecommand-demo` venue's `corporate_account_id`.

3. **Dashboard `app/layout.tsx`**: extend the existing ThemeProvider wiring to fetch brand config from the authenticated session's `corporate_account_id`. Default = SafeCommand if no corp account. Phase B Step 8 work item.

4. **Mobile `App.tsx`**: same — extend ThemeProvider to fetch brand config on login (post-OTP, alongside JWT). 24-hour AsyncStorage cache per NFR-34.

5. **Validation**: run `passesWcagAA('#C8102E', '#FFFFFF')` and `passesWcagAA('#002F6C', '#FFFFFF')` — both must return true (already verified during Phase A Step 4 commit). Set `wcag_validated = TRUE` in the brand config row.

6. **Loom walkthrough**: founder records 3-minute screen-by-screen narrative (sequence above). Stored privately, shared only via signed-link in Apollo NDA correspondence.

7. **Sales material**: 3-slide deck embedding the Loom (slide 1: corporate governance value prop; slide 2: brand enablement add-on; slide 3: live demo). Footer disclaimer on every slide.

---

## Estimated effort

| Task | Hours |
|---|---|
| Brand config row insert + Apollo logo upload | 0.5 |
| Dashboard ThemeProvider brand-fetch wiring (extends Phase A scaffold) | 1.5 |
| Mobile ThemeProvider brand-fetch wiring + AsyncStorage cache | 1.5 |
| Validation pass (WCAG, screen-by-screen visual check) | 0.5 |
| Loom recording + post-production | 1.0 |
| Slide deck creation | 0.5 |
| **Total** | **~5.5 hrs** in June |

This estimate is feasible because:
- Phase A scaffold did the heavy lifting (ThemeProvider, hooks, CSS-var integration, WCAG helpers)
- Phase B brand-fetch is a thin layer on top (one new endpoint + one new client query)
- No new design work required for the underlying SafeCommand product — Apollo demo IS the existing product with brand override

---

## Reusability for other corporate prospects

Same pattern applies to:

| Prospect | Primary | Secondary | Sample role override |
|---|---|---|---|
| **Apollo Hospitals India** | `#C8102E` (red) | `#002F6C` (navy) | SH → "Apollo Safety Head" |
| **Infosys** | `#007CC3` (Infosys blue) | `#3F4C5B` (Infosys gray) | SH → "Infosys Site Security Lead" |
| **Marriott India** | `#A0231E` (Marriott red) | `#1C2E3D` (Marriott navy) | SH → "Marriott Property Security Manager" |
| **Hyderabad mid-size hospital group** | TBD per prospect logo | TBD | Per prospect |

Each new prospect:
1. SC Ops creates a new `corporate_accounts` row + brand config (~30 min)
2. WCAG validation (automated via `passesWcagAA`) — gate before activation
3. New 3-minute Loom walkthrough using the same demo venue (~1 hour)

The mockup pattern scales linearly with the number of corporate sales conversations.

---

## Refs

- Business Plan v2 §9 (Enterprise Brand Enablement)
- Business Plan v2 §16.3 Demo 4 (sales sequence)
- Business Plan v2 §22 Rec #3 (Powered-by framing) + Rec #4 (mockup before product)
- Architecture v7 §18 (Brand Enablement architecture)
- ADR 0002 (`safecommand_v7` branch — Phase A scaffold landed here)
- ADR 0003 (Supabase opaque-token keys — used by brand-fetch query)
- BR-81 → BR-88 (Enterprise Brand Enablement requirements)
- EC-17 / Rule 19 (ThemeProvider mandatory from first commit)
- EC-18 / Rule 20 (Powered-by non-removable)
- NFR-34 (brand fetch <1s; 24h AsyncStorage cache)
- NFR-35 (WCAG 2.1 AA — pre-validated 2026-05-05 during Phase A Step 4 commit)

---

*Spec captured 2026-05-05 · Phase A artefact · Implementation: June 2026 (Phase B)*
