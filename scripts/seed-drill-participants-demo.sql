-- ═══════════════════════════════════════════════════════════════════════════
-- seed-drill-participants-demo.sql — industry-leading drill demo data.
--
-- Purpose: enrich the 2 completed demo drills (FIRE_EVACUATION 60d ago +
-- FULL_EVACUATION 240d ago) with rich per-staff participant timelines for
-- client / investor / board demos. Together the two drills showcase ALL
-- 6 reason codes from the ADR 0004 taxonomy with realistic Indian-context
-- narratives.
--
-- Audience: founder demos to hospital CISOs (NABH framing), mall facility
-- heads (operational realism), VCs (compliance moat), boards (governance
-- posture), and auditors (defensible evidence). Narratives chosen for
-- maximum cross-buyer relatability.
--
-- Companion: docs/sales/drill-demo-narrative.md — sales/investor/board
-- talking points keyed to the data this script seeds.
--
-- Demonstrates:
--   - Drill A FIRE_EVACUATION (60d ago) — 14 participants, 3 reason codes:
--     ON_DUTY_ELSEWHERE / DEVICE_OR_NETWORK_ISSUE / ON_LEAVE
--   - Drill B FULL_EVACUATION (240d ago) — 10 participants, 3 reason codes:
--     OTHER / ON_BREAK / OFF_DUTY
--   - Cross-drill: all 6 codes from ADR 0004 + research doc
--
-- Headline metrics post-seed:
--   Drill A: 14 expected / 12 acknowledged / 11 safe / 2 missed / 100% classified
--   Drill B: 10 expected / 8 acknowledged / 7 safe / 2 missed / 100% classified
--   Both drills: 0 unexcused — every non-acknowledgement classified
--
-- Idempotency: rerun-safe.
--   - Staff inserts use ON CONFLICT (venue_id, phone) DO NOTHING
--   - Participant rows are wiped (DELETE) for the 2 demo drills before insert
--   - Aggregate counts on drill_sessions are recomputed from participant rows
--
-- Usage:
--   ./scripts/seed-drill-participants-demo.sh
--   ./scripts/seed-drill-participants-demo.sh --dry-run
--
-- Safety:
--   Marker-filtered to [DEMO] notes only. Cannot affect non-demo drills.
--   Staff added are confined to phone range +91999900XXXX (matches existing
--   demo seed pattern) so reset-hyderabad-demo.sh cleans them up correctly.
--
-- Refs: BR-A (Drill Management), ADR 0004 (reason taxonomy), mig 013,
--       docs/research/drill-participant-reason-taxonomy.md
-- ═══════════════════════════════════════════════════════════════════════════

\set venue_id '''096a3701-beb0-4ffe-9e74-43af3c26e09f'''

BEGIN;

-- ─── 1. Verify demo venue exists + has the 2 expected drills ───────────────
DO $$
DECLARE
  drill_count INT;
BEGIN
  SELECT COUNT(*) INTO drill_count
  FROM drill_sessions
  WHERE venue_id = '096a3701-beb0-4ffe-9e74-43af3c26e09f'
    AND notes LIKE '[DEMO]%'
    AND status = 'COMPLETED';
  IF drill_count < 2 THEN
    RAISE EXCEPTION 'Expected ≥2 [DEMO] COMPLETED drills in Hyderabad Demo Supermall, found %. Run seed-hyderabad-demo.sh first.', drill_count;
  END IF;
END $$;

-- ─── 2. Add additional demo staff (idempotent) ─────────────────────────────
-- Roles aligned to a realistic mid-size supermall safety roster:
--   3 Floor Supervisors (1 per non-trivial floor)
--   7 Ground Staff (2-3 per floor, including specialists)
-- Combined with existing 6 demo staff + 1 SH = 17 active total
-- (~realistic supermall — Hyderabad Inorbit / GVK One / Sarath City scale).

-- NOTE: `is_active` is now a generated column (mig 011_staff_lifecycle.sql)
-- derived from lifecycle_status. Must INSERT into lifecycle_status only;
-- is_active populates automatically (lifecycle_status='ACTIVE' → is_active=TRUE).
INSERT INTO staff (venue_id, name, role, phone, lifecycle_status)
VALUES
  -- Floor Supervisors — 1 per Tower 1 floor
  (:venue_id, 'Meera Joshi',      'FLOOR_SUPERVISOR', '+919999000007', 'ACTIVE'),
  (:venue_id, 'Aarti Desai',      'FLOOR_SUPERVISOR', '+919999000008', 'ACTIVE'),
  -- Ground Staff — varied zones
  (:venue_id, 'Arjun Iyer',       'GROUND_STAFF',     '+919999000009', 'ACTIVE'),
  (:venue_id, 'Sanjay Verma',     'GROUND_STAFF',     '+919999000010', 'ACTIVE'),
  (:venue_id, 'Kavita Nair',      'GROUND_STAFF',     '+919999000011', 'ACTIVE'),
  (:venue_id, 'Faisal Ahmed',     'GROUND_STAFF',     '+919999000012', 'ACTIVE'),
  (:venue_id, 'Imran Hussain',    'GROUND_STAFF',     '+919999000013', 'ACTIVE'),
  (:venue_id, 'Karthik Iyer',     'GROUND_STAFF',     '+919999000014', 'ACTIVE'),
  (:venue_id, 'Suresh Reddy',     'GROUND_STAFF',     '+919999000015', 'ACTIVE'),
  (:venue_id, 'Manjusha Pillai',  'GROUND_STAFF',     '+919999000016', 'ACTIVE')
ON CONFLICT (venue_id, phone) DO NOTHING;

-- ─── 3. Wipe existing participant rows for the 2 demo drills (idempotent) ──
DELETE FROM drill_session_participants
WHERE drill_session_id IN (
  SELECT id FROM drill_sessions
  WHERE venue_id = :venue_id
    AND notes LIKE '[DEMO]%'
    AND status = 'COMPLETED'
);

-- ─── 4. Resolve all the staff + drill UUIDs into a temp table ──────────────
-- Using a temp CTE pattern via CREATE TEMP TABLE so we can reference UUIDs
-- across multiple INSERTs without repeating subqueries.

CREATE TEMP TABLE _drill_demo_ctx ON COMMIT DROP AS
SELECT
  (SELECT id FROM drill_sessions
   WHERE venue_id = :venue_id AND drill_type = 'FIRE_EVACUATION'
     AND status = 'COMPLETED' AND notes LIKE '[DEMO]%'
   ORDER BY scheduled_for DESC LIMIT 1)             AS drill_a_id,
  (SELECT started_at FROM drill_sessions
   WHERE venue_id = :venue_id AND drill_type = 'FIRE_EVACUATION'
     AND status = 'COMPLETED' AND notes LIKE '[DEMO]%'
   ORDER BY scheduled_for DESC LIMIT 1)             AS drill_a_started,
  (SELECT ended_at FROM drill_sessions
   WHERE venue_id = :venue_id AND drill_type = 'FIRE_EVACUATION'
     AND status = 'COMPLETED' AND notes LIKE '[DEMO]%'
   ORDER BY scheduled_for DESC LIMIT 1)             AS drill_a_ended,
  (SELECT id FROM drill_sessions
   WHERE venue_id = :venue_id AND drill_type = 'FULL_EVACUATION'
     AND status = 'COMPLETED' AND notes LIKE '[DEMO]%'
   ORDER BY scheduled_for DESC LIMIT 1)             AS drill_b_id,
  (SELECT started_at FROM drill_sessions
   WHERE venue_id = :venue_id AND drill_type = 'FULL_EVACUATION'
     AND status = 'COMPLETED' AND notes LIKE '[DEMO]%'
   ORDER BY scheduled_for DESC LIMIT 1)             AS drill_b_started,
  (SELECT ended_at FROM drill_sessions
   WHERE venue_id = :venue_id AND drill_type = 'FULL_EVACUATION'
     AND status = 'COMPLETED' AND notes LIKE '[DEMO]%'
   ORDER BY scheduled_for DESC LIMIT 1)             AS drill_b_ended,
  (SELECT id FROM staff WHERE venue_id = :venue_id AND role = 'SH' AND is_active = TRUE
   ORDER BY created_at LIMIT 1)                     AS sh_id;

-- ═══════════════════════════════════════════════════════════════════════════
-- DRILL A — FIRE_EVACUATION (60 days ago, Tower 1 quarterly drill)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Story: Tuesday 14:30 IST quarterly mandated drill. ~17 staff on day shift.
-- Drill announced via FCM at 14:30:00. Target full evac ≤15 min.
-- Outcome: 13:22 to all-clear. Compliance: 11/14 SAFE_CONFIRMED (78%);
-- 100% classified (no unexcused). Three legitimate exceptions:
--
--   • Kavita Nair (GS) — ON_DUTY_ELSEWHERE
--     Was at Floor 1 jewellery store cash counter handover with armed
--     escort. Locked vault per Bank Note Bureau (BNB) protocol before
--     leaving. Reached perimeter assembly at 4m12s — *just* outside ack
--     window. Status = ACKNOWLEDGED (she tapped 35s after start, but no
--     SAFE_CONFIRMED in window). Story value: identical pattern to a
--     hospital ICU nurse on patient care.
--
--   • Faisal Ahmed (GS) — DEVICE_OR_NETWORK_ISSUE
--     Was in basement parking zone P-3 at drill time. P-3 has documented
--     dead zone (no FCM/cellular). Confirmed evacuated and accounted-for
--     via radio at 14:34:18 by FS Joshi. **IT signal-survey action raised
--     post-drill** — recommendation: deploy cellular booster in P-3.
--     Story value: turns "discipline" into "Wi-Fi survey" — boards love this.
--
--   • Imran Hussain (GS) — ON_LEAVE
--     Approved sick leave from 13:00 IST. Left venue via service exit at
--     12:55 IST. HRIS leave register cross-referenced — entry verified.
--     System flagged him as missed because he was active in shift roster
--     until 13:00 (HRIS sync was lagging that day). Auto-classification
--     not possible without HRIS integration. Story value: shows DPDP-
--     conservative coarse classification (no medical detail stored in
--     SafeCommand; HRIS holds the why).
--
-- All times relative to drill_a.started_at (14:35 IST).

INSERT INTO drill_session_participants (
  drill_session_id, staff_id, status,
  notified_at, acknowledged_at, safe_confirmed_at, ack_latency_seconds,
  reason_code, reason_notes, reason_set_by, reason_set_at
)
SELECT * FROM (
  -- ─── 11 SAFE_CONFIRMED ──────────────────────────────────────────────────
  -- SH (drill commander)
  SELECT
    ctx.drill_a_id, ctx.sh_id, 'SAFE_CONFIRMED'::drill_participant_status_enum,
    ctx.drill_a_started, ctx.drill_a_started + INTERVAL '8 seconds',
    ctx.drill_a_started + INTERVAL '1 minute 12 seconds', 8,
    NULL::TEXT, NULL::TEXT, NULL::UUID, NULL::TIMESTAMPTZ
  FROM _drill_demo_ctx ctx

  UNION ALL
  SELECT ctx.drill_a_id, s.id, 'SAFE_CONFIRMED'::drill_participant_status_enum,
    ctx.drill_a_started, ctx.drill_a_started + INTERVAL '14 seconds',
    ctx.drill_a_started + INTERVAL '1 minute 33 seconds', 14, NULL, NULL, NULL, NULL
  FROM _drill_demo_ctx ctx, staff s
  WHERE s.venue_id = '096a3701-beb0-4ffe-9e74-43af3c26e09f' AND s.phone = '+919999000001' -- Rajesh Kumar SHIFT_COMMANDER

  UNION ALL
  SELECT ctx.drill_a_id, s.id, 'SAFE_CONFIRMED'::drill_participant_status_enum,
    ctx.drill_a_started, ctx.drill_a_started + INTERVAL '22 seconds',
    ctx.drill_a_started + INTERVAL '2 minutes 48 seconds', 22, NULL, NULL, NULL, NULL
  FROM _drill_demo_ctx ctx, staff s
  WHERE s.venue_id = '096a3701-beb0-4ffe-9e74-43af3c26e09f' AND s.phone = '+919999000002' -- Priya Sharma FLOOR_SUPERVISOR (F2 lead)

  UNION ALL
  SELECT ctx.drill_a_id, s.id, 'SAFE_CONFIRMED'::drill_participant_status_enum,
    ctx.drill_a_started, ctx.drill_a_started + INTERVAL '16 seconds',
    ctx.drill_a_started + INTERVAL '2 minutes 12 seconds', 16, NULL, NULL, NULL, NULL
  FROM _drill_demo_ctx ctx, staff s
  WHERE s.venue_id = '096a3701-beb0-4ffe-9e74-43af3c26e09f' AND s.phone = '+919999000007' -- Meera Joshi FLOOR_SUPERVISOR (F3 lead)

  UNION ALL
  SELECT ctx.drill_a_id, s.id, 'SAFE_CONFIRMED'::drill_participant_status_enum,
    ctx.drill_a_started, ctx.drill_a_started + INTERVAL '19 seconds',
    ctx.drill_a_started + INTERVAL '2 minutes 38 seconds', 19, NULL, NULL, NULL, NULL
  FROM _drill_demo_ctx ctx, staff s
  WHERE s.venue_id = '096a3701-beb0-4ffe-9e74-43af3c26e09f' AND s.phone = '+919999000008' -- Aarti Desai FLOOR_SUPERVISOR (F4 lead)

  UNION ALL
  SELECT ctx.drill_a_id, s.id, 'SAFE_CONFIRMED'::drill_participant_status_enum,
    ctx.drill_a_started, ctx.drill_a_started + INTERVAL '18 seconds',
    ctx.drill_a_started + INTERVAL '2 minutes 51 seconds', 18, NULL, NULL, NULL, NULL
  FROM _drill_demo_ctx ctx, staff s
  WHERE s.venue_id = '096a3701-beb0-4ffe-9e74-43af3c26e09f' AND s.phone = '+919999000003' -- Anil Reddy GROUND_STAFF

  UNION ALL
  SELECT ctx.drill_a_id, s.id, 'SAFE_CONFIRMED'::drill_participant_status_enum,
    ctx.drill_a_started, ctx.drill_a_started + INTERVAL '31 seconds',
    ctx.drill_a_started + INTERVAL '3 minutes 4 seconds', 31, NULL, NULL, NULL, NULL
  FROM _drill_demo_ctx ctx, staff s
  WHERE s.venue_id = '096a3701-beb0-4ffe-9e74-43af3c26e09f' AND s.phone = '+919999000004' -- Lakshmi Iyer GROUND_STAFF (food court)

  UNION ALL
  SELECT ctx.drill_a_id, s.id, 'SAFE_CONFIRMED'::drill_participant_status_enum,
    ctx.drill_a_started, ctx.drill_a_started + INTERVAL '24 seconds',
    ctx.drill_a_started + INTERVAL '2 minutes 22 seconds', 24, NULL, NULL, NULL, NULL
  FROM _drill_demo_ctx ctx, staff s
  WHERE s.venue_id = '096a3701-beb0-4ffe-9e74-43af3c26e09f' AND s.phone = '+919999000005' -- Vikram Singh GROUND_STAFF

  UNION ALL
  SELECT ctx.drill_a_id, s.id, 'SAFE_CONFIRMED'::drill_participant_status_enum,
    ctx.drill_a_started, ctx.drill_a_started + INTERVAL '19 seconds',
    ctx.drill_a_started + INTERVAL '2 minutes 38 seconds', 19, NULL, NULL, NULL, NULL
  FROM _drill_demo_ctx ctx, staff s
  WHERE s.venue_id = '096a3701-beb0-4ffe-9e74-43af3c26e09f' AND s.phone = '+919999000006' -- Nisha Patel GROUND_STAFF

  UNION ALL
  SELECT ctx.drill_a_id, s.id, 'SAFE_CONFIRMED'::drill_participant_status_enum,
    ctx.drill_a_started, ctx.drill_a_started + INTERVAL '27 seconds',
    ctx.drill_a_started + INTERVAL '2 minutes 55 seconds', 27, NULL, NULL, NULL, NULL
  FROM _drill_demo_ctx ctx, staff s
  WHERE s.venue_id = '096a3701-beb0-4ffe-9e74-43af3c26e09f' AND s.phone = '+919999000009' -- Arjun Iyer GROUND_STAFF (F1 reception)

  UNION ALL
  SELECT ctx.drill_a_id, s.id, 'SAFE_CONFIRMED'::drill_participant_status_enum,
    ctx.drill_a_started, ctx.drill_a_started + INTERVAL '35 seconds',
    ctx.drill_a_started + INTERVAL '4 minutes 18 seconds', 35, NULL, NULL, NULL, NULL
  FROM _drill_demo_ctx ctx, staff s
  WHERE s.venue_id = '096a3701-beb0-4ffe-9e74-43af3c26e09f' AND s.phone = '+919999000010' -- Sanjay Verma GROUND_STAFF (longest time-to-safe — assisted mobility-impaired visitor)

  -- ─── 1 ACKNOWLEDGED + reason ON_DUTY_ELSEWHERE ──────────────────────────
  UNION ALL
  SELECT ctx.drill_a_id, s.id, 'ACKNOWLEDGED'::drill_participant_status_enum,
    ctx.drill_a_started, ctx.drill_a_started + INTERVAL '35 seconds',
    NULL, 35,
    'ON_DUTY_ELSEWHERE',
    'Cash counter handover at Floor 1 jewellery zone — locked vault per Bank Note Bureau (BNB) protocol before evacuation. Shift commander confirmed presence at vault until 14:38. Reached perimeter assembly at 14:42 — outside SAFE_CONFIRMED window. Operationally compliant per NABH-equivalent venue protocol §EM.4.2.',
    ctx.sh_id, ctx.drill_a_ended + INTERVAL '47 minutes'
  FROM _drill_demo_ctx ctx, staff s
  WHERE s.venue_id = '096a3701-beb0-4ffe-9e74-43af3c26e09f' AND s.phone = '+919999000011' -- Kavita Nair

  -- ─── 2 MISSED + reasons ─────────────────────────────────────────────────
  UNION ALL
  SELECT ctx.drill_a_id, s.id, 'MISSED'::drill_participant_status_enum,
    ctx.drill_a_started, NULL, NULL, NULL,
    'DEVICE_OR_NETWORK_ISSUE',
    'Phone in basement parking zone P-3 had no FCM/cellular signal during drill window (documented dead zone). Confirmed evacuated and accounted-for via radio at 14:34:18 by FS Meera Joshi. IT signal-survey action raised post-drill — recommendation: deploy cellular booster or Wi-Fi extender in P-3. Compliance preserved via radio-based accountability protocol.',
    ctx.sh_id, ctx.drill_a_ended + INTERVAL '52 minutes'
  FROM _drill_demo_ctx ctx, staff s
  WHERE s.venue_id = '096a3701-beb0-4ffe-9e74-43af3c26e09f' AND s.phone = '+919999000012' -- Faisal Ahmed

  UNION ALL
  SELECT ctx.drill_a_id, s.id, 'MISSED'::drill_participant_status_enum,
    ctx.drill_a_started, NULL, NULL, NULL,
    'ON_LEAVE',
    'Approved leave from 13:00 IST (ailment). Left venue via service exit at 12:55 IST — 1h35m before drill announcement. HRIS leave register cross-referenced — entry verified by HR Manager Asha N. System flagged due to HRIS sync lag; coarse "ON_LEAVE" classification preserves DPDP-conservative posture (sub-type held only in HRIS).',
    ctx.sh_id, ctx.drill_a_ended + INTERVAL '1 hour 5 minutes'
  FROM _drill_demo_ctx ctx, staff s
  WHERE s.venue_id = '096a3701-beb0-4ffe-9e74-43af3c26e09f' AND s.phone = '+919999000013' -- Imran Hussain
) AS drill_a_participants;

-- ═══════════════════════════════════════════════════════════════════════════
-- DRILL B — FULL_EVACUATION (240 days ago, annual full-venue drill)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Story: Saturday 11:00 IST annual drill. Smaller team era (10 staff
-- enrolled via VENUE_ALL fallback because shift management was not yet
-- in active operation that day). Both towers. Target full evac ≤20 min.
-- Outcome: 16:43 all-clear. Compliance: 7/10 SAFE (70%); 100% classified.
--
-- Three legitimate exceptions — chosen to showcase the remaining 3 reason
-- codes that Drill A doesn't cover, completing the 6-code taxonomy:
--
--   • Karthik Iyer (GS) — OTHER (with ≥10 char notes per ADR 0004)
--     Off-prem product-training session at vendor site (pre-approved by
--     GM as a venue exception). Returned to assembly point via van escort
--     at 16:38. Story value: legitimate non-pattern case forces "OTHER" +
--     real explanation; demonstrates the system blocks drive-by classifications.
--
--   • Suresh Reddy (GS) — ON_BREAK
--     Statutory tea break in canteen 10:55–11:25 IST per Factories Act
--     1948 §55 break entitlement. Confirmed in canteen via CCTV at 11:02.
--     Floor supervisor verified break and accounted-for in evac report.
--     Story value: shows the system respects Indian labour law explicitly —
--     mandated breaks cannot be discipline events.
--
--   • Manjusha Pillai (GS) — OFF_DUTY (auto-classified)
--     Off-shift weekend; was at home. System enrolled her via VENUE_ALL
--     fallback path (no active shift_instance at drill start). SH applied
--     OFF_DUTY classification at end-of-drill review. Story value: demos
--     the hybrid on-duty determination's safety net + auto-classification.

INSERT INTO drill_session_participants (
  drill_session_id, staff_id, status,
  notified_at, acknowledged_at, safe_confirmed_at, ack_latency_seconds,
  reason_code, reason_notes, reason_set_by, reason_set_at
)
SELECT * FROM (
  -- ─── 7 SAFE_CONFIRMED ──────────────────────────────────────────────────
  -- SH (drill commander)
  SELECT
    ctx.drill_b_id, ctx.sh_id, 'SAFE_CONFIRMED'::drill_participant_status_enum,
    ctx.drill_b_started, ctx.drill_b_started + INTERVAL '5 seconds',
    ctx.drill_b_started + INTERVAL '1 minute 8 seconds', 5,
    NULL::TEXT, NULL::TEXT, NULL::UUID, NULL::TIMESTAMPTZ
  FROM _drill_demo_ctx ctx

  UNION ALL
  SELECT ctx.drill_b_id, s.id, 'SAFE_CONFIRMED'::drill_participant_status_enum,
    ctx.drill_b_started, ctx.drill_b_started + INTERVAL '11 seconds',
    ctx.drill_b_started + INTERVAL '1 minute 25 seconds', 11, NULL, NULL, NULL, NULL
  FROM _drill_demo_ctx ctx, staff s
  WHERE s.venue_id = '096a3701-beb0-4ffe-9e74-43af3c26e09f' AND s.phone = '+919999000001' -- Rajesh Kumar

  UNION ALL
  SELECT ctx.drill_b_id, s.id, 'SAFE_CONFIRMED'::drill_participant_status_enum,
    ctx.drill_b_started, ctx.drill_b_started + INTERVAL '18 seconds',
    ctx.drill_b_started + INTERVAL '2 minutes 41 seconds', 18, NULL, NULL, NULL, NULL
  FROM _drill_demo_ctx ctx, staff s
  WHERE s.venue_id = '096a3701-beb0-4ffe-9e74-43af3c26e09f' AND s.phone = '+919999000002' -- Priya Sharma

  UNION ALL
  SELECT ctx.drill_b_id, s.id, 'SAFE_CONFIRMED'::drill_participant_status_enum,
    ctx.drill_b_started, ctx.drill_b_started + INTERVAL '14 seconds',
    ctx.drill_b_started + INTERVAL '2 minutes 38 seconds', 14, NULL, NULL, NULL, NULL
  FROM _drill_demo_ctx ctx, staff s
  WHERE s.venue_id = '096a3701-beb0-4ffe-9e74-43af3c26e09f' AND s.phone = '+919999000003' -- Anil Reddy

  UNION ALL
  SELECT ctx.drill_b_id, s.id, 'SAFE_CONFIRMED'::drill_participant_status_enum,
    ctx.drill_b_started, ctx.drill_b_started + INTERVAL '25 seconds',
    ctx.drill_b_started + INTERVAL '3 minutes 2 seconds', 25, NULL, NULL, NULL, NULL
  FROM _drill_demo_ctx ctx, staff s
  WHERE s.venue_id = '096a3701-beb0-4ffe-9e74-43af3c26e09f' AND s.phone = '+919999000004' -- Lakshmi Iyer

  UNION ALL
  SELECT ctx.drill_b_id, s.id, 'SAFE_CONFIRMED'::drill_participant_status_enum,
    ctx.drill_b_started, ctx.drill_b_started + INTERVAL '21 seconds',
    ctx.drill_b_started + INTERVAL '2 minutes 20 seconds', 21, NULL, NULL, NULL, NULL
  FROM _drill_demo_ctx ctx, staff s
  WHERE s.venue_id = '096a3701-beb0-4ffe-9e74-43af3c26e09f' AND s.phone = '+919999000005' -- Vikram Singh

  UNION ALL
  SELECT ctx.drill_b_id, s.id, 'SAFE_CONFIRMED'::drill_participant_status_enum,
    ctx.drill_b_started, ctx.drill_b_started + INTERVAL '16 seconds',
    ctx.drill_b_started + INTERVAL '2 minutes 32 seconds', 16, NULL, NULL, NULL, NULL
  FROM _drill_demo_ctx ctx, staff s
  WHERE s.venue_id = '096a3701-beb0-4ffe-9e74-43af3c26e09f' AND s.phone = '+919999000006' -- Nisha Patel

  -- ─── 1 ACKNOWLEDGED + reason OTHER ──────────────────────────────────────
  UNION ALL
  SELECT ctx.drill_b_id, s.id, 'ACKNOWLEDGED'::drill_participant_status_enum,
    ctx.drill_b_started, ctx.drill_b_started + INTERVAL '42 seconds',
    NULL, 42,
    'OTHER',
    'Off-prem product-training session at vendor warehouse (Indo-American Chamber, Madhapur) — pre-approved by GM Mohanlal V on date 2025-08-22 as venue exception. Acknowledged drill alert remotely; could not return to assembly within drill window. Returned to venue at 16:38 via van escort.',
    ctx.sh_id, ctx.drill_b_ended + INTERVAL '38 minutes'
  FROM _drill_demo_ctx ctx, staff s
  WHERE s.venue_id = '096a3701-beb0-4ffe-9e74-43af3c26e09f' AND s.phone = '+919999000014' -- Karthik Iyer

  -- ─── 2 MISSED + reasons ─────────────────────────────────────────────────
  UNION ALL
  SELECT ctx.drill_b_id, s.id, 'MISSED'::drill_participant_status_enum,
    ctx.drill_b_started, NULL, NULL, NULL,
    'ON_BREAK',
    'Statutory tea break in staff canteen 10:55–11:25 IST per Factories Act 1948 §55 break entitlement. Confirmed in canteen via CCTV at 11:02 IST (footage retained per evidence policy). Floor Supervisor Priya Sharma verified break and accounted-for in evacuation report. Per Industrial Disputes Act, statutory breaks cannot be conducted disciplinary events.',
    ctx.sh_id, ctx.drill_b_ended + INTERVAL '52 minutes'
  FROM _drill_demo_ctx ctx, staff s
  WHERE s.venue_id = '096a3701-beb0-4ffe-9e74-43af3c26e09f' AND s.phone = '+919999000015' -- Suresh Reddy

  UNION ALL
  SELECT ctx.drill_b_id, s.id, 'MISSED'::drill_participant_status_enum,
    ctx.drill_b_started, NULL, NULL, NULL,
    'OFF_DUTY',
    'Off-shift Saturday weekly off; was at home at drill time. Auto-enrolled in participant set via VENUE_ALL fallback path (no active shift_instance configured at drill start — pre-shift-management era). SH applied OFF_DUTY classification at end-of-drill review per ADR 0004 standard taxonomy.',
    ctx.sh_id, ctx.drill_b_ended + INTERVAL '1 hour 14 minutes'
  FROM _drill_demo_ctx ctx, staff s
  WHERE s.venue_id = '096a3701-beb0-4ffe-9e74-43af3c26e09f' AND s.phone = '+919999000016' -- Manjusha Pillai
) AS drill_b_participants;

-- ─── 6. Recompute aggregate counts on drill_sessions ───────────────────────
-- Single source of truth = participant rows. Aggregates on drill_sessions
-- are denormalised; refresh from live counts.

UPDATE drill_sessions ds
SET
  total_staff_expected = sub.total,
  total_staff_acknowledged = sub.acknowledged,
  total_staff_safe = sub.safe,
  total_staff_missed = sub.missed,
  updated_at = NOW()
FROM (
  SELECT
    drill_session_id,
    COUNT(*)::INT AS total,
    COUNT(*) FILTER (WHERE status IN ('ACKNOWLEDGED', 'SAFE_CONFIRMED'))::INT AS acknowledged,
    COUNT(*) FILTER (WHERE status = 'SAFE_CONFIRMED')::INT AS safe,
    COUNT(*) FILTER (WHERE status = 'MISSED')::INT AS missed
  FROM drill_session_participants
  GROUP BY drill_session_id
) sub
WHERE ds.id = sub.drill_session_id
  AND ds.venue_id = :venue_id;

-- ─── 7. Seed audit_logs lifecycle events for the timeline display ─────────
-- The /drills/[id] detail page reads audit_logs filtered by entity_id.
-- Without these rows the Timeline section displays "No audit-log events".
-- These entries simulate what the api auditLog() middleware would have
-- written for a real drill lifecycle: SCHEDULE → START → STARTED_FROM_*
-- → ACK events → SAFE events → REASON_SET (post-drill classification)
-- → END.
--
-- Wipe + re-insert pattern matches participant seed (idempotent rerun).

DELETE FROM audit_logs
WHERE venue_id = :venue_id
  AND entity_type = 'drill-sessions'
  AND entity_id IN (
    SELECT drill_a_id FROM _drill_demo_ctx
    UNION ALL
    SELECT drill_b_id FROM _drill_demo_ctx
  );

-- Drill A timeline (FIRE_EVACUATION 60d ago) — 11 lifecycle events
INSERT INTO audit_logs (
  venue_id, actor_staff_id, actor_role, action, entity_type, entity_id,
  metadata, created_at
)
SELECT * FROM (
  -- Schedule event (5 minutes before drill scheduled_for)
  SELECT '096a3701-beb0-4ffe-9e74-43af3c26e09f'::UUID,
         ctx.sh_id, 'SH', 'DRILL_SCHEDULE', 'drill-sessions', ctx.drill_a_id,
         jsonb_build_object('drill_type', 'FIRE_EVACUATION', 'method', 'POST', 'path', '/v1/drill-sessions', 'status', 201),
         ctx.drill_a_started - INTERVAL '5 minutes'
  FROM _drill_demo_ctx ctx

  UNION ALL
  -- Start event (drill.started_at)
  SELECT '096a3701-beb0-4ffe-9e74-43af3c26e09f'::UUID,
         ctx.sh_id, 'SH', 'DRILL_START', 'drill-sessions', ctx.drill_a_id,
         jsonb_build_object('drill_type', 'FIRE_EVACUATION', 'method', 'PUT', 'path', '/v1/drill-sessions/:id/start', 'status', 200),
         ctx.drill_a_started
  FROM _drill_demo_ctx ctx

  UNION ALL
  -- On-duty determination path metadata
  SELECT '096a3701-beb0-4ffe-9e74-43af3c26e09f'::UUID,
         ctx.sh_id, 'SH', 'DRILL_STARTED_FROM_SHIFT_ROSTER', 'drill-sessions', ctx.drill_a_id,
         jsonb_build_object('participant_count', 14, 'source_path', 'SHIFT_ROSTER', 'building_id', NULL),
         ctx.drill_a_started + INTERVAL '1 second'
  FROM _drill_demo_ctx ctx

  UNION ALL
  -- Sample acknowledgement events (3 representative)
  SELECT '096a3701-beb0-4ffe-9e74-43af3c26e09f'::UUID,
         ctx.sh_id, 'SH', 'DRILL_PARTICIPANT_ACK', 'drill-sessions', ctx.drill_a_id,
         jsonb_build_object('staff_name', 'Pradeep Kumar', 'ack_latency_seconds', 8),
         ctx.drill_a_started + INTERVAL '8 seconds'
  FROM _drill_demo_ctx ctx
  UNION ALL
  SELECT '096a3701-beb0-4ffe-9e74-43af3c26e09f'::UUID,
         (SELECT id FROM staff WHERE phone='+919999000007' AND venue_id='096a3701-beb0-4ffe-9e74-43af3c26e09f'),
         'FLOOR_SUPERVISOR', 'DRILL_PARTICIPANT_ACK', 'drill-sessions', ctx.drill_a_id,
         jsonb_build_object('staff_name', 'Meera Joshi', 'ack_latency_seconds', 16),
         ctx.drill_a_started + INTERVAL '16 seconds'
  FROM _drill_demo_ctx ctx
  UNION ALL
  SELECT '096a3701-beb0-4ffe-9e74-43af3c26e09f'::UUID,
         (SELECT id FROM staff WHERE phone='+919999000003' AND venue_id='096a3701-beb0-4ffe-9e74-43af3c26e09f'),
         'GROUND_STAFF', 'DRILL_PARTICIPANT_ACK', 'drill-sessions', ctx.drill_a_id,
         jsonb_build_object('staff_name', 'Anil Reddy', 'ack_latency_seconds', 18),
         ctx.drill_a_started + INTERVAL '18 seconds'
  FROM _drill_demo_ctx ctx

  UNION ALL
  -- Sample safe-confirmed events (2 representative)
  SELECT '096a3701-beb0-4ffe-9e74-43af3c26e09f'::UUID,
         ctx.sh_id, 'SH', 'DRILL_PARTICIPANT_SAFE', 'drill-sessions', ctx.drill_a_id,
         jsonb_build_object('staff_name', 'Pradeep Kumar', 'time_to_safe_seconds', 72),
         ctx.drill_a_started + INTERVAL '1 minute 12 seconds'
  FROM _drill_demo_ctx ctx
  UNION ALL
  SELECT '096a3701-beb0-4ffe-9e74-43af3c26e09f'::UUID,
         (SELECT id FROM staff WHERE phone='+919999000010' AND venue_id='096a3701-beb0-4ffe-9e74-43af3c26e09f'),
         'GROUND_STAFF', 'DRILL_PARTICIPANT_SAFE', 'drill-sessions', ctx.drill_a_id,
         jsonb_build_object('staff_name', 'Sanjay Verma', 'time_to_safe_seconds', 258, 'note', 'longest evac — assisted mobility-impaired visitor'),
         ctx.drill_a_started + INTERVAL '4 minutes 18 seconds'
  FROM _drill_demo_ctx ctx

  UNION ALL
  -- End event (drill.ended_at)
  SELECT '096a3701-beb0-4ffe-9e74-43af3c26e09f'::UUID,
         ctx.sh_id, 'SH', 'DRILL_END', 'drill-sessions', ctx.drill_a_id,
         jsonb_build_object('drill_type', 'FIRE_EVACUATION', 'method', 'PUT', 'path', '/v1/drill-sessions/:id/end', 'status', 200, 'duration_seconds', 502),
         ctx.drill_a_ended
  FROM _drill_demo_ctx ctx

  UNION ALL
  -- Post-drill reason classifications (3 — match the participant rows)
  SELECT '096a3701-beb0-4ffe-9e74-43af3c26e09f'::UUID,
         ctx.sh_id, 'SH', 'DRILL_PARTICIPANT_REASON_SET', 'drill-sessions', ctx.drill_a_id,
         jsonb_build_object('staff_name', 'Kavita Nair', 'reason_code', 'ON_DUTY_ELSEWHERE'),
         ctx.drill_a_ended + INTERVAL '47 minutes'
  FROM _drill_demo_ctx ctx
  UNION ALL
  SELECT '096a3701-beb0-4ffe-9e74-43af3c26e09f'::UUID,
         ctx.sh_id, 'SH', 'DRILL_PARTICIPANT_REASON_SET', 'drill-sessions', ctx.drill_a_id,
         jsonb_build_object('staff_name', 'Faisal Ahmed', 'reason_code', 'DEVICE_OR_NETWORK_ISSUE', 'it_action_raised', TRUE),
         ctx.drill_a_ended + INTERVAL '52 minutes'
  FROM _drill_demo_ctx ctx
  UNION ALL
  SELECT '096a3701-beb0-4ffe-9e74-43af3c26e09f'::UUID,
         ctx.sh_id, 'SH', 'DRILL_PARTICIPANT_REASON_SET', 'drill-sessions', ctx.drill_a_id,
         jsonb_build_object('staff_name', 'Imran Hussain', 'reason_code', 'ON_LEAVE'),
         ctx.drill_a_ended + INTERVAL '1 hour 5 minutes'
  FROM _drill_demo_ctx ctx
) AS drill_a_audit;

-- Drill B timeline (FULL_EVACUATION 240d ago) — 9 lifecycle events
INSERT INTO audit_logs (
  venue_id, actor_staff_id, actor_role, action, entity_type, entity_id,
  metadata, created_at
)
SELECT * FROM (
  SELECT '096a3701-beb0-4ffe-9e74-43af3c26e09f'::UUID,
         ctx.sh_id, 'SH', 'DRILL_SCHEDULE', 'drill-sessions', ctx.drill_b_id,
         jsonb_build_object('drill_type', 'FULL_EVACUATION', 'method', 'POST', 'path', '/v1/drill-sessions', 'status', 201),
         ctx.drill_b_started - INTERVAL '2 minutes'
  FROM _drill_demo_ctx ctx

  UNION ALL
  SELECT '096a3701-beb0-4ffe-9e74-43af3c26e09f'::UUID,
         ctx.sh_id, 'SH', 'DRILL_START', 'drill-sessions', ctx.drill_b_id,
         jsonb_build_object('drill_type', 'FULL_EVACUATION', 'method', 'PUT', 'path', '/v1/drill-sessions/:id/start', 'status', 200),
         ctx.drill_b_started
  FROM _drill_demo_ctx ctx

  UNION ALL
  -- VENUE_ALL fallback path (no active shift_instance at drill start — older drill)
  SELECT '096a3701-beb0-4ffe-9e74-43af3c26e09f'::UUID,
         ctx.sh_id, 'SH', 'DRILL_STARTED_FROM_VENUE_ALL', 'drill-sessions', ctx.drill_b_id,
         jsonb_build_object('participant_count', 10, 'source_path', 'VENUE_ALL', 'building_id', NULL, 'note', 'no active shift_instance at drill start; fell back to all is_active staff'),
         ctx.drill_b_started + INTERVAL '1 second'
  FROM _drill_demo_ctx ctx

  UNION ALL
  -- Sample ack events (2 representative)
  SELECT '096a3701-beb0-4ffe-9e74-43af3c26e09f'::UUID,
         ctx.sh_id, 'SH', 'DRILL_PARTICIPANT_ACK', 'drill-sessions', ctx.drill_b_id,
         jsonb_build_object('staff_name', 'Pradeep Kumar', 'ack_latency_seconds', 5),
         ctx.drill_b_started + INTERVAL '5 seconds'
  FROM _drill_demo_ctx ctx
  UNION ALL
  SELECT '096a3701-beb0-4ffe-9e74-43af3c26e09f'::UUID,
         (SELECT id FROM staff WHERE phone='+919999000001' AND venue_id='096a3701-beb0-4ffe-9e74-43af3c26e09f'),
         'SHIFT_COMMANDER', 'DRILL_PARTICIPANT_ACK', 'drill-sessions', ctx.drill_b_id,
         jsonb_build_object('staff_name', 'Rajesh Kumar', 'ack_latency_seconds', 11),
         ctx.drill_b_started + INTERVAL '11 seconds'
  FROM _drill_demo_ctx ctx

  UNION ALL
  -- End event
  SELECT '096a3701-beb0-4ffe-9e74-43af3c26e09f'::UUID,
         ctx.sh_id, 'SH', 'DRILL_END', 'drill-sessions', ctx.drill_b_id,
         jsonb_build_object('drill_type', 'FULL_EVACUATION', 'method', 'PUT', 'path', '/v1/drill-sessions/:id/end', 'status', 200, 'duration_seconds', 1003),
         ctx.drill_b_ended
  FROM _drill_demo_ctx ctx

  UNION ALL
  -- Reason classifications (3 — match participant rows)
  SELECT '096a3701-beb0-4ffe-9e74-43af3c26e09f'::UUID,
         ctx.sh_id, 'SH', 'DRILL_PARTICIPANT_REASON_SET', 'drill-sessions', ctx.drill_b_id,
         jsonb_build_object('staff_name', 'Karthik Iyer', 'reason_code', 'OTHER'),
         ctx.drill_b_ended + INTERVAL '38 minutes'
  FROM _drill_demo_ctx ctx
  UNION ALL
  SELECT '096a3701-beb0-4ffe-9e74-43af3c26e09f'::UUID,
         ctx.sh_id, 'SH', 'DRILL_PARTICIPANT_REASON_SET', 'drill-sessions', ctx.drill_b_id,
         jsonb_build_object('staff_name', 'Suresh Reddy', 'reason_code', 'ON_BREAK'),
         ctx.drill_b_ended + INTERVAL '52 minutes'
  FROM _drill_demo_ctx ctx
  UNION ALL
  SELECT '096a3701-beb0-4ffe-9e74-43af3c26e09f'::UUID,
         ctx.sh_id, 'SH', 'DRILL_PARTICIPANT_REASON_SET', 'drill-sessions', ctx.drill_b_id,
         jsonb_build_object('staff_name', 'Manjusha Pillai', 'reason_code', 'OFF_DUTY'),
         ctx.drill_b_ended + INTERVAL '1 hour 14 minutes'
  FROM _drill_demo_ctx ctx
) AS drill_b_audit;

-- ─── 8. Verification block — print results ─────────────────────────────────
DO $$
DECLARE
  drill_a_total   INT;
  drill_b_total   INT;
  drill_a_safe    INT;
  drill_b_safe    INT;
  drill_a_missed  INT;
  drill_b_missed  INT;
  drill_a_excused INT;
  drill_b_excused INT;
  reason_codes_used INT;
  audit_count_a   INT;
  audit_count_b   INT;
BEGIN
  SELECT COUNT(*) FILTER (WHERE ds.drill_type = 'FIRE_EVACUATION'),
         COUNT(*) FILTER (WHERE ds.drill_type = 'FULL_EVACUATION'),
         COUNT(*) FILTER (WHERE ds.drill_type = 'FIRE_EVACUATION' AND p.status = 'SAFE_CONFIRMED'),
         COUNT(*) FILTER (WHERE ds.drill_type = 'FULL_EVACUATION' AND p.status = 'SAFE_CONFIRMED'),
         COUNT(*) FILTER (WHERE ds.drill_type = 'FIRE_EVACUATION' AND p.status = 'MISSED'),
         COUNT(*) FILTER (WHERE ds.drill_type = 'FULL_EVACUATION' AND p.status = 'MISSED'),
         COUNT(*) FILTER (WHERE ds.drill_type = 'FIRE_EVACUATION' AND (p.status IN ('ACKNOWLEDGED','SAFE_CONFIRMED') OR p.reason_code IS NOT NULL)),
         COUNT(*) FILTER (WHERE ds.drill_type = 'FULL_EVACUATION' AND (p.status IN ('ACKNOWLEDGED','SAFE_CONFIRMED') OR p.reason_code IS NOT NULL))
    INTO drill_a_total, drill_b_total,
         drill_a_safe, drill_b_safe,
         drill_a_missed, drill_b_missed,
         drill_a_excused, drill_b_excused
  FROM drill_session_participants p
  JOIN drill_sessions ds ON ds.id = p.drill_session_id
  WHERE ds.venue_id = '096a3701-beb0-4ffe-9e74-43af3c26e09f'
    AND ds.notes LIKE '[DEMO]%';

  SELECT COUNT(DISTINCT p.reason_code) INTO reason_codes_used
  FROM drill_session_participants p
  JOIN drill_sessions ds ON ds.id = p.drill_session_id
  WHERE ds.venue_id = '096a3701-beb0-4ffe-9e74-43af3c26e09f'
    AND ds.notes LIKE '[DEMO]%'
    AND p.reason_code IS NOT NULL;

  SELECT
    COUNT(*) FILTER (WHERE ds.drill_type = 'FIRE_EVACUATION'),
    COUNT(*) FILTER (WHERE ds.drill_type = 'FULL_EVACUATION')
    INTO audit_count_a, audit_count_b
  FROM audit_logs al
  JOIN drill_sessions ds ON ds.id = al.entity_id
  WHERE al.venue_id = '096a3701-beb0-4ffe-9e74-43af3c26e09f'
    AND al.entity_type = 'drill-sessions'
    AND ds.notes LIKE '[DEMO]%';

  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE '  Drill demo participant seed — SUCCESS';
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE '  Drill A (FIRE_EVACUATION 60d ago):';
  RAISE NOTICE '    % participants / % safe / % missed / % excused-or-safe',
    drill_a_total, drill_a_safe, drill_a_missed, drill_a_excused;
  RAISE NOTICE '  Drill B (FULL_EVACUATION 240d ago):';
  RAISE NOTICE '    % participants / % safe / % missed / % excused-or-safe',
    drill_b_total, drill_b_safe, drill_b_missed, drill_b_excused;
  RAISE NOTICE '  Reason codes used across both drills: % / 6',
    reason_codes_used;
  RAISE NOTICE '  Timeline events seeded — Drill A: % / Drill B: %',
    audit_count_a, audit_count_b;
  RAISE NOTICE '';

  -- Sanity gates
  IF drill_a_total <> 14 THEN
    RAISE EXCEPTION 'Drill A expected 14 participants, got %', drill_a_total;
  END IF;
  IF drill_b_total <> 10 THEN
    RAISE EXCEPTION 'Drill B expected 10 participants, got %', drill_b_total;
  END IF;
  IF reason_codes_used <> 6 THEN
    RAISE EXCEPTION 'Expected all 6 reason codes used, got %', reason_codes_used;
  END IF;
  IF audit_count_a < 8 OR audit_count_b < 6 THEN
    RAISE EXCEPTION 'Audit timeline counts low — A=%, B=% (expected ≥8 / ≥6)', audit_count_a, audit_count_b;
  END IF;

  RAISE NOTICE '  All sanity checks PASSED. Demo data ready.';
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
END $$;

COMMIT;
