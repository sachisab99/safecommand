-- ═══════════════════════════════════════════════════════════════════════════
-- apollo-demo seed — Phase B Path C live mockup
--
-- Inserts a corporate_account ('apollo-demo') and the corresponding
-- corporate_brand_configs row that powers the live "Apollo SafeCommand"
-- demo experience for the 3-slide sales deck (Loom screen #6 — Settings >
-- About; Loom screen #1 — Splash with Apollo branding).
--
-- Brand colour pair (validated WCAG 2.1 AA on 2026-05-05 during Phase A
-- Step 4 commit):
--   Apollo red  #C8102E — contrast vs white = 5.88:1 ✓ AA
--   Apollo navy #002F6C — contrast vs white = 12.94:1 ✓ AA
--
-- ⚠ STATUS: Written 2026-05-05 on safecommand_v7. NOT YET EXECUTED.
--           Apply during Phase B June unfreeze AFTER:
--             1. Migration 009_mbv.sql + 010_brand_roaming_drill.sql deployed
--             2. Apollo logo asset uploaded to S3 sales-only path
--                (s3://sc-evidence-prod/internal/apollo-logo-demo.png) — see
--                docs/sales/apollo-mockup-spec.md §"Pre-requisites"
--             3. configured_by_sc_ops_id placeholder updated to founder's
--                actual SC Ops staff UUID
--
-- ⚠ DEMO ONLY: This brand config is for SC internal sales demonstration in
--              NDA-bound 1:1 Apollo conversations. NEVER use in production
--              for an actual Apollo customer rollout — that requires a
--              separate corporate_account row, separate brand config, and
--              Apollo signed contract + logo licence. See
--              docs/sales/apollo-mockup-spec.md §"Mandatory legal disclaimer".
--
-- Idempotency: ON CONFLICT (account_code) DO NOTHING / corporate_account_id
-- DO NOTHING — safe to re-run.
--
-- Refs: docs/sales/apollo-mockup-spec.md, docs/sales/apollo-deck-spec.md
-- Refs: BR-81 (corporate_brand_configs schema), BR-85 (Powered-by literal)
-- Refs: NFR-35 (WCAG 2.1 AA validation gate)
-- Refs: ADR 0003 (Supabase opaque-token keys; this seed uses sb_secret_*)
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Apollo corporate_account ────────────────────────────────────────────
-- Tier = CORP_ENTERPRISE per Plan §13.4 Apollo example pricing.

INSERT INTO corporate_accounts (
  account_code,
  display_name,
  country_iso,
  tier,
  is_active,
  created_by_sc_ops_id
) VALUES (
  'apollo-demo',
  'Apollo Hospitals Group (Sales Demo)',
  'IN',
  'CORP_ENTERPRISE',
  TRUE,
  -- ⚠ Replace this NULL with founder's SC Ops staff UUID before applying.
  --   Find via: SELECT id FROM staff WHERE phone = '+91...' LIMIT 1;
  NULL
)
ON CONFLICT (account_code) DO NOTHING;

-- ─── 2. Apollo brand config ─────────────────────────────────────────────────
-- Field rationale documented in docs/sales/apollo-mockup-spec.md.
--
-- powered_by_text is hard-coded — DB CHECK constraint enforces this string
-- exactly. Even attempting any other value raises a CHECK violation.

INSERT INTO corporate_brand_configs (
  corporate_account_id,
  logo_url,
  primary_colour,
  secondary_colour,
  brand_name,
  app_display_name,
  notification_sender_name,
  role_overrides,
  terminology_dictionary,
  report_header_text,
  powered_by_text,
  wcag_validated,
  is_active,
  configured_by_sc_ops_id
)
SELECT
  ca.id,
  -- ⚠ Sales-only S3 path. Bucket sc-evidence-prod, ap-south-1, internal/.
  --   Founder must upload Apollo logo PNG to this path before applying.
  --   See docs/sales/apollo-mockup-spec.md §"Implementation steps" #1.
  'https://sc-evidence-prod.s3.ap-south-1.amazonaws.com/internal/apollo-logo-demo.png',
  '#C8102E',                                 -- Apollo red    (AA: 5.88:1 vs white)
  '#002F6C',                                 -- Apollo navy   (AA: 12.94:1 vs white)
  'Apollo SafeCommand',
  'Apollo SafeCommand',
  'Apollo SafeCommand',
  -- Per-role display name overrides (Plan §9.3 examples)
  '{
    "SH":               "Apollo Safety Head",
    "DSH":              "Apollo Deputy Safety Head",
    "SHIFT_COMMANDER":  "Apollo Safety Officer",
    "GM":               "Apollo Site Manager",
    "AUDITOR":          "Apollo Compliance Auditor",
    "FM":               "Apollo Facility Manager",
    "FLOOR_SUPERVISOR": "Apollo Floor Lead",
    "GROUND_STAFF":     "Apollo Site Guardian"
  }'::jsonb,
  -- Terminology dictionary (BR-83) — sample Apollo-internal preferences
  '{
    "Incident":  "Safety Event",
    "Zone":      "Area",
    "Building":  "Block",
    "Shift":     "Watch"
  }'::jsonb,
  'Apollo Hospitals Group | Safety & Security',
  -- ⚠ HARD-CODED per EC-18 / Rule 20 — DB CHECK constraint will reject
  --   any other value for this column.
  'Platform by SafeCommand',
  -- WCAG validation flag — Apollo red + navy pre-validated 2026-05-05
  -- (apps/dashboard/lib/theme/wcag.ts smoke test)
  TRUE,
  -- is_active = TRUE because wcag_validated = TRUE; both required by the
  -- table CHECK constraint.
  TRUE,
  -- ⚠ Replace this NULL with founder's SC Ops staff UUID before applying.
  NULL
FROM corporate_accounts ca
WHERE ca.account_code = 'apollo-demo'
ON CONFLICT (corporate_account_id) DO NOTHING;

-- ─── 3. Optional — link an existing demo venue to apollo-demo ──────────────
-- The mockup walkthrough renders against the existing safecommand-demo
-- venue (Sprint 1 Gate 2 verified — 3 floors, 12 zones, 5 templates, 1 SH).
-- Linking sets the corporate_account_id so the api fetches Apollo brand
-- config when this venue's users authenticate.
--
-- Uncomment + replace the venue_code with your actual demo venue's code
-- (e.g., 'SC-MAL-HYD-00001') before applying.

-- UPDATE venues
-- SET corporate_account_id = (SELECT id FROM corporate_accounts WHERE account_code = 'apollo-demo')
-- WHERE venue_code = 'SC-MAL-HYD-00001';

-- ─── 4. Verification queries (run after seed completes) ────────────────────
-- These are commented; run manually to verify:
--
-- 1. Account + brand config rows exist:
--    SELECT ca.account_code, ca.display_name, cbc.brand_name, cbc.is_active,
--           cbc.wcag_validated, cbc.powered_by_text
--    FROM corporate_accounts ca
--    JOIN corporate_brand_configs cbc ON cbc.corporate_account_id = ca.id
--    WHERE ca.account_code = 'apollo-demo';
--    -- Expect: 1 row; powered_by_text = 'Platform by SafeCommand'
--
-- 2. powered_by_text CHECK constraint enforced:
--    UPDATE corporate_brand_configs SET powered_by_text = 'Custom'
--    WHERE corporate_account_id = (SELECT id FROM corporate_accounts WHERE account_code = 'apollo-demo');
--    -- Expect: ERROR: new row for relation "corporate_brand_configs" violates check constraint
--
-- 3. Role overrides + terminology shape correct:
--    SELECT role_overrides->>'SH', terminology_dictionary->>'Incident'
--    FROM corporate_brand_configs cbc
--    JOIN corporate_accounts ca ON cbc.corporate_account_id = ca.id
--    WHERE ca.account_code = 'apollo-demo';
--    -- Expect: 'Apollo Safety Head', 'Safety Event'

COMMIT;
