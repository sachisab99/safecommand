-- Migration 019 (this repo) | Phase 5.22 — SIRE template completeness
-- ───────────────────────────────────────────────────────────────────────────
-- Closes EC-23 for EVERY (incident_type × SIRE role) and adds the
-- dangerous-divergence sub-types where parent fallback would give actively
-- wrong life-safety routing.
--
-- TIER A — EC-23 completeness (24 global+parent templates):
--   EVACUATION × {DSH, SHIFT_COMMANDER, FLOOR_SUPERVISOR, GROUND_STAFF}  (SH done in mig 017)
--   MEDICAL    × {SH, DSH, SHIFT_COMMANDER, FLOOR_SUPERVISOR, GROUND_STAFF}
--   SECURITY   × {SH, DSH, SHIFT_COMMANDER, FLOOR_SUPERVISOR, GROUND_STAFF}
--   STRUCTURAL × {SH, DSH, SHIFT_COMMANDER, FLOOR_SUPERVISOR, GROUND_STAFF}
--   OTHER      × {SH, DSH, SHIFT_COMMANDER, FLOOR_SUPERVISOR, GROUND_STAFF}
--   After this, FIRE (mig 015+017) + the above = every parent type × every
--   SIRE role resolves to a real, standards-grounded list. EC-23 can never
--   throw EC23ViolationError for any declaration by any role at any venue.
--
-- TIER B — dangerous-divergence sub-types (6; SH + GROUND_STAFF):
--   SECURITY_BOMB_THREAT           — search, NOT standard evac (route may
--                                    lead toward device); no RF near suspect item
--   SECURITY_ACTIVE_AGGRESSOR      — RUN-HIDE-FIGHT, NOT orderly evacuation;
--                                    no fire alarm; no standard muster
--   EVACUATION_SHELTER_IN_PLACE    — move occupants IN, not out; opposite of evac
--   These three would be life-threatening if served the parent template, so
--   they get explicit tier-5 (global+subtype) specifics. All other sub-types
--   degrade SAFELY to their parent (consistent guidance, just less specific)
--   — a conscious, documented decision per founder direction 2026-05-16
--   (non-hospital scope; OBSTETRIC/MASS_CASUALTY/HAZMAT deferred to hospital
--   pilot under Rule 12).
--
-- Standards grounding (same corpus as mig 015/017): NFPA 1561 (incident
-- command), NFPA 1620 (pre-incident planning), NFPA 101 §A.7 (life safety /
-- sweep targets), NABH §EM (clinical role assignment, casualty privacy),
-- NDMA guidelines (per-floor warden roles, shelter-in-place), HICS Job
-- Action Sheets (command structure), DHS/ASIS RUN-HIDE-FIGHT (active
-- aggressor), ATF/NCTC bomb-threat search doctrine (no RF, search-don't-evac).
--
-- All rows: venue_id NULL, venue_type NULL → tier-6 (parent) or tier-5
-- (sub-type) universal floor. SC Ops may override per-venue later (5.22 UI).
-- Additive, idempotent-guarded, dormant-safe. Hard Rule 24: apply before code.
--
-- Refs: mig 015, mig 017 (same pattern) · docs/specs/incident-response-
-- activity-templates.md §5 · Architecture v8 §SIRE BR-G..BR-P
-- ───────────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════
-- 0. PRECONDITION — mig 014 + 015 + 017 applied
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='incident_action_templates') THEN
    RAISE EXCEPTION 'mig 019 precondition FAILED: mig 014 must be applied first';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM incident_action_templates
    WHERE venue_id IS NULL AND venue_type IS NULL
      AND incident_type='FIRE' AND incident_subtype IS NULL AND staff_role='GROUND_STAFF'
  ) THEN
    RAISE EXCEPTION 'mig 019 precondition FAILED: mig 017 (FIRE role fan-out) must be applied first';
  END IF;
  IF EXISTS (
    SELECT 1 FROM incident_action_templates
    WHERE venue_id IS NULL AND venue_type IS NULL
      AND incident_type='MEDICAL' AND incident_subtype IS NULL AND staff_role='SH'
  ) THEN
    RAISE EXCEPTION 'mig 019 precondition FAILED: MEDICAL+SH global already exists (already applied?)';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Helper — compact insert via a temp function (keeps 30 rows readable)
-- ═══════════════════════════════════════════════════════════════════════════
-- Each action tuple: order, instruction, i18n_key, secs, evidence, mand, lifecrit, scope
CREATE OR REPLACE FUNCTION pg_temp.seed_tpl(
  p_type TEXT, p_subtype TEXT, p_role TEXT, p_actions JSONB
) RETURNS VOID LANGUAGE sql AS $$
  INSERT INTO incident_action_templates
    (venue_id, venue_type, incident_type, incident_subtype, staff_role,
     template_version, is_active, actions)
  VALUES (NULL, NULL, p_type, p_subtype, p_role, 1, TRUE, p_actions);
$$;

CREATE OR REPLACE FUNCTION pg_temp.act(
  p_order INT, p_instr TEXT, p_key TEXT, p_secs INT, p_ev TEXT,
  p_mand BOOLEAN, p_life BOOLEAN, p_scope TEXT
) RETURNS JSONB LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'order', p_order, 'instruction', p_instr, 'instruction_i18n_key', p_key,
    'time_target_seconds', p_secs, 'evidence_type', p_ev,
    'is_mandatory', p_mand, 'is_life_critical', p_life, 'location_scope', p_scope);
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. TIER A — EVACUATION × {DSH, SC, FS, GS}   (SH seeded in mig 017)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT pg_temp.seed_tpl('EVACUATION', NULL, 'DSH', jsonb_build_array(
  pg_temp.act(1,'Acknowledge the evacuation and join the venue command channel as DSH. Identify yourself to SH and Shift Commander.','sire.evac.dsh.acknowledge_join',30,'VERBAL',TRUE,TRUE,'VENUE'),
  pg_temp.act(2,'Stand by to assume Security Head command if SH is unresponsive for 5 minutes (BR-13 auto-activation).','sire.evac.dsh.standby_takeover',NULL,'VERBAL',TRUE,TRUE,'VENUE'),
  pg_temp.act(3,'Manage external command-chain comms: keep ownership/management informed; field off-site staff calls. Do not broadcast unverified information.','sire.evac.dsh.external_comms',60,'VERBAL',TRUE,FALSE,'VENUE'),
  pg_temp.act(4,'Log every command decision for audit: each evacuation trigger, escalation, and utility directive — timestamped who/what/why.','sire.evac.dsh.audit_decisions',180,'NOTE',TRUE,FALSE,'VENUE'),
  pg_temp.act(5,'If SH is unavailable on responder arrival, brief Fire Service: hand over zone-status grid + occupant accountability + signed transfer-of-command.','sire.evac.dsh.brief_responder',NULL,'SIGNATURE',TRUE,TRUE,'EXTERNAL')));

SELECT pg_temp.seed_tpl('EVACUATION', NULL, 'SHIFT_COMMANDER', jsonb_build_array(
  pg_temp.act(1,'Acknowledge. If SH is not on-site, contact SH and assume operational command pending arrival.','sire.evac.sc.acknowledge_assume',30,'VERBAL',TRUE,TRUE,'VENUE'),
  pg_temp.act(2,'Activate all on-duty Floor Supervisors. Confirm every floor has coordinated coverage on the command channel.','sire.evac.sc.activate_fs',60,'VERBAL',TRUE,TRUE,'VENUE'),
  pg_temp.act(3,'Track muster: GS coverage per floor, occupants moved, zones still occupied. Surface any stalled floor to SH.','sire.evac.sc.track_muster',120,'NOTE',TRUE,TRUE,'VENUE'),
  pg_temp.act(4,'Manage emergency-vehicle access: open gates, clear the route, position staff to direct responders.','sire.evac.sc.responder_logistics',180,'VERBAL',TRUE,TRUE,'EXTERNAL'),
  pg_temp.act(5,'Brief SH every 5 minutes (scope / status / resources / next action) until command transfers to Fire Service.','sire.evac.sc.sitrep',NULL,'VERBAL',TRUE,FALSE,'VENUE')));

SELECT pg_temp.seed_tpl('EVACUATION', NULL, 'FLOOR_SUPERVISOR', jsonb_build_array(
  pg_temp.act(1,'Acknowledge and open the floor command channel. Confirm your floor coverage to the Security Head.','sire.evac.fs.acknowledge_channel',30,'VERBAL',TRUE,TRUE,'FLOOR'),
  pg_temp.act(2,'Direct all occupants on your floor to the nearest stairwell. Do NOT use lifts. Be visible at the stairwell entrance.','sire.evac.fs.direct_stairwell',90,'VERBAL',TRUE,TRUE,'FLOOR'),
  pg_temp.act(3,'Sweep for anyone unable to self-evacuate (mobility-impaired, trapped). Escalate location to SH immediately.','sire.evac.fs.assist_impaired',120,'NOTE',TRUE,TRUE,'FLOOR'),
  pg_temp.act(4,'Account for all GS and visitors at the muster point. Report headcount + any missing person to SH within 3 minutes.','sire.evac.fs.account_persons',180,'NOTE',TRUE,TRUE,'FLOOR'),
  pg_temp.act(5,'On responder arrival, hand over the floor situation report via SH command channel.','sire.evac.fs.handover',NULL,'SIGNATURE',TRUE,TRUE,'FLOOR')));

SELECT pg_temp.seed_tpl('EVACUATION', NULL, 'GROUND_STAFF', jsonb_build_array(
  pg_temp.act(1,'Acknowledge on your device and proceed immediately to your assigned zone.','sire.evac.gs.acknowledge_proceed',30,'VERBAL',TRUE,TRUE,'ASSIGNED_ZONE'),
  pg_temp.act(2,'Sweep your zone and move all occupants toward the nearest evacuation route. Check restrooms, storerooms, private spaces.','sire.evac.gs.sweep_move',90,'VERBAL',TRUE,TRUE,'ASSIGNED_ZONE'),
  pg_temp.act(3,'Assist anyone who cannot self-evacuate. Do not leave a person behind — escalate to your Floor Supervisor if you need help.','sire.evac.gs.assist_impaired',120,'NOTE',TRUE,TRUE,'ASSIGNED_ZONE'),
  pg_temp.act(4,'Report your zone state on your device: Zone Clear (empty), Needs Attention (person/hazard found), or Inaccessible.','sire.evac.gs.report_state',60,'NOTE',TRUE,TRUE,'ASSIGNED_ZONE'),
  pg_temp.act(5,'Proceed to the muster point and stand by. Do NOT re-enter until all-clear is announced.','sire.evac.gs.muster_standby',NULL,'VERBAL',TRUE,TRUE,'FLOOR')));

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. TIER A — MEDICAL × all 5 roles  (casualty care + EMS access; NOT mass evac)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT pg_temp.seed_tpl('MEDICAL', NULL, 'SH', jsonb_build_array(
  pg_temp.act(1,'Acknowledge and assume medical incident command. Confirm exact casualty location and nature.','sire.med.sh.assume_command',30,'VERBAL',TRUE,TRUE,'VENUE'),
  pg_temp.act(2,'Dispatch the nearest first-aid-certified staff with the closest AED / first-aid kit to the casualty.','sire.med.sh.dispatch_first_aid',30,'VERBAL',TRUE,TRUE,'VENUE'),
  pg_temp.act(3,'Confirm emergency medical services (108 / ambulance) have been called with location and casualty count.','sire.med.sh.confirm_ems',60,'NOTE',TRUE,TRUE,'EXTERNAL'),
  pg_temp.act(4,'Clear and hold the EMS access route (gate, lift, corridor). Control bystanders; protect casualty privacy (no photos, no clinical detail broadcast — DPDP).','sire.med.sh.clear_route_privacy',120,'VERBAL',TRUE,TRUE,'VENUE'),
  pg_temp.act(5,'Hand over to EMS on arrival with time-of-onset and care given. Log the incident timeline.','sire.med.sh.handover_log',NULL,'SIGNATURE',TRUE,TRUE,'EXTERNAL')));

SELECT pg_temp.seed_tpl('MEDICAL', NULL, 'DSH', jsonb_build_array(
  pg_temp.act(1,'Acknowledge and join command. Stand by to assume SH role if SH is unresponsive for 5 minutes.','sire.med.dsh.acknowledge_standby',30,'VERBAL',TRUE,TRUE,'VENUE'),
  pg_temp.act(2,'Manage family / external communications. Do NOT disclose clinical details or identity to unauthorised parties (DPDP / NABH privacy).','sire.med.dsh.family_comms',120,'NOTE',TRUE,FALSE,'VENUE'),
  pg_temp.act(3,'Document command decisions and timeline for the post-incident report.','sire.med.dsh.document',180,'NOTE',TRUE,FALSE,'VENUE'),
  pg_temp.act(4,'Lead the post-incident review once the casualty is handed to EMS.','sire.med.dsh.post_review',NULL,'NOTE',TRUE,FALSE,'VENUE')));

SELECT pg_temp.seed_tpl('MEDICAL', NULL, 'SHIFT_COMMANDER', jsonb_build_array(
  pg_temp.act(1,'Acknowledge. Mobilise all on-duty first-aiders; retrieve the nearest AED and first-aid kit toward the casualty.','sire.med.sc.mobilise',30,'VERBAL',TRUE,TRUE,'VENUE'),
  pg_temp.act(2,'Prepare EMS logistics: hold a lift, clear the corridor, post staff to guide the ambulance crew from gate to casualty.','sire.med.sc.ems_logistics',120,'VERBAL',TRUE,TRUE,'EXTERNAL'),
  pg_temp.act(3,'Track resources: who is with the casualty, AED status, certified staff on scene.','sire.med.sc.track_resources',120,'NOTE',TRUE,FALSE,'VENUE'),
  pg_temp.act(4,'Brief SH on status and ETA; sitrep every 5 minutes until EMS takes over.','sire.med.sc.sitrep',NULL,'VERBAL',TRUE,FALSE,'VENUE')));

SELECT pg_temp.seed_tpl('MEDICAL', NULL, 'FLOOR_SUPERVISOR', jsonb_build_array(
  pg_temp.act(1,'Acknowledge and proceed toward the casualty floor. Confirm a first-aider is en route.','sire.med.fs.acknowledge_proceed',30,'VERBAL',TRUE,TRUE,'FLOOR'),
  pg_temp.act(2,'Secure the scene: keep bystanders back, create a privacy screen, keep the access path open.','sire.med.fs.secure_scene',60,'VERBAL',TRUE,TRUE,'FLOOR'),
  pg_temp.act(3,'Guide EMS from the floor entry directly to the casualty on arrival.','sire.med.fs.guide_ems',NULL,'VERBAL',TRUE,TRUE,'FLOOR'),
  pg_temp.act(4,'Report scene status and any change in casualty condition to SH / Shift Commander.','sire.med.fs.report',120,'NOTE',TRUE,TRUE,'FLOOR')));

SELECT pg_temp.seed_tpl('MEDICAL', NULL, 'GROUND_STAFF', jsonb_build_array(
  pg_temp.act(1,'Acknowledge and proceed to the casualty. Confirm receipt to your Floor Supervisor.','sire.med.gs.acknowledge_proceed',30,'VERBAL',TRUE,TRUE,'ASSIGNED_ZONE'),
  pg_temp.act(2,'Provide first aid ONLY within your trained competence. Do not exceed your certification. If untrained, stay with the casualty and summon a first-aider.','sire.med.gs.first_aid_in_scope',NULL,'NOTE',TRUE,TRUE,'ASSIGNED_ZONE'),
  pg_temp.act(3,'Do NOT move the casualty unless they are in immediate danger. Keep them comfortable and reassured.','sire.med.gs.do_not_move',NULL,'VERBAL',TRUE,TRUE,'ASSIGNED_ZONE'),
  pg_temp.act(4,'Keep bystanders back and guide responders in when they arrive.','sire.med.gs.guide_responders',NULL,'VERBAL',TRUE,TRUE,'ASSIGNED_ZONE')));

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. TIER A — SECURITY × all 5 roles  (generic threat; DO NOT default to evac)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT pg_temp.seed_tpl('SECURITY', NULL, 'SH', jsonb_build_array(
  pg_temp.act(1,'Acknowledge and assume security incident command. Establish what the threat is and where, before deciding any movement.','sire.sec.sh.assume_command',30,'VERBAL',TRUE,TRUE,'VENUE'),
  pg_temp.act(2,'Decide posture deliberately — lockdown, shelter-in-place, partial or full evacuation. Do NOT default to evacuation; evacuating can move people toward the threat.','sire.sec.sh.decide_posture',60,'NOTE',TRUE,TRUE,'VENUE'),
  pg_temp.act(3,'Liaise with police (100). Provide location, description, numbers. Follow their direction.','sire.sec.sh.police_liaison',120,'NOTE',TRUE,TRUE,'EXTERNAL'),
  pg_temp.act(4,'Control communications — no panic-inducing public broadcast; brief staff on the command channel only.','sire.sec.sh.controlled_comms',120,'VERBAL',TRUE,TRUE,'VENUE'),
  pg_temp.act(5,'Account for staff and visitors per the chosen posture; hand over to police command on arrival.','sire.sec.sh.account_handover',NULL,'SIGNATURE',TRUE,TRUE,'EXTERNAL')));

SELECT pg_temp.seed_tpl('SECURITY', NULL, 'DSH', jsonb_build_array(
  pg_temp.act(1,'Acknowledge and join command. Stand by to assume SH role if SH is unresponsive for 5 minutes.','sire.sec.dsh.acknowledge_standby',30,'VERBAL',TRUE,TRUE,'VENUE'),
  pg_temp.act(2,'Run police / external liaison so SH can focus on the floor decision.','sire.sec.dsh.police_liaison',120,'NOTE',TRUE,TRUE,'EXTERNAL'),
  pg_temp.act(3,'Document every command decision and timestamp for audit and the police statement.','sire.sec.dsh.audit',180,'NOTE',TRUE,FALSE,'VENUE'),
  pg_temp.act(4,'Lead the post-incident review and evidence preservation once stood down.','sire.sec.dsh.post_review',NULL,'NOTE',TRUE,FALSE,'VENUE')));

SELECT pg_temp.seed_tpl('SECURITY', NULL, 'SHIFT_COMMANDER', jsonb_build_array(
  pg_temp.act(1,'Acknowledge. Secure entries/exits per SH directive — do not act independently.','sire.sec.sc.secure_entries',60,'VERBAL',TRUE,TRUE,'VENUE'),
  pg_temp.act(2,'Monitor CCTV and track the threat location; relay observations to SH.','sire.sec.sc.cctv_track',120,'NOTE',TRUE,TRUE,'VENUE'),
  pg_temp.act(3,'Position staff per the chosen posture; keep staff away from the threat area.','sire.sec.sc.position_staff',120,'VERBAL',TRUE,TRUE,'VENUE'),
  pg_temp.act(4,'Sitrep to SH every 5 minutes until police assume control.','sire.sec.sc.sitrep',NULL,'VERBAL',TRUE,FALSE,'VENUE')));

SELECT pg_temp.seed_tpl('SECURITY', NULL, 'FLOOR_SUPERVISOR', jsonb_build_array(
  pg_temp.act(1,'Acknowledge. Calm and control occupants on your floor — do NOT make announcements that could cause panic.','sire.sec.fs.calm_control',60,'VERBAL',TRUE,TRUE,'FLOOR'),
  pg_temp.act(2,'Keep occupants away from the threat area. Follow SH posture (hold, shelter, or routed movement).','sire.sec.fs.keep_clear',120,'VERBAL',TRUE,TRUE,'FLOOR'),
  pg_temp.act(3,'Report observations (numbers, direction, behaviour) to SH on the command channel only.','sire.sec.fs.report',120,'NOTE',TRUE,TRUE,'FLOOR'),
  pg_temp.act(4,'Account for persons on your floor when SH calls for it.','sire.sec.fs.account',NULL,'NOTE',TRUE,TRUE,'FLOOR')));

SELECT pg_temp.seed_tpl('SECURITY', NULL, 'GROUND_STAFF', jsonb_build_array(
  pg_temp.act(1,'Acknowledge. Do NOT approach or confront the threat. Your job is observe and report.','sire.sec.gs.do_not_confront',30,'VERBAL',TRUE,TRUE,'ASSIGNED_ZONE'),
  pg_temp.act(2,'Report precise details to command: exact location, description, number of persons, direction of movement.','sire.sec.gs.report_details',60,'NOTE',TRUE,TRUE,'ASSIGNED_ZONE'),
  pg_temp.act(3,'Keep occupants in your zone calm and away from the threat area. Await command instruction before any movement.','sire.sec.gs.keep_calm_await',NULL,'VERBAL',TRUE,TRUE,'ASSIGNED_ZONE'),
  pg_temp.act(4,'Report your zone state on your device when instructed.','sire.sec.gs.report_state',NULL,'NOTE',TRUE,FALSE,'ASSIGNED_ZONE')));

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. TIER A — STRUCTURAL × all 5 roles  (isolate hazard / restrict / utilities)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT pg_temp.seed_tpl('STRUCTURAL', NULL, 'SH', jsonb_build_array(
  pg_temp.act(1,'Acknowledge and assume command. Establish the affected area and the nature of the structural hazard.','sire.struc.sh.assume_command',30,'VERBAL',TRUE,TRUE,'VENUE'),
  pg_temp.act(2,'Decide the evacuation scope for the affected zone(s) — do not over- or under-evacuate; isolate, do not ignite/aggravate.','sire.struc.sh.decide_scope',60,'NOTE',TRUE,TRUE,'VENUE'),
  pg_temp.act(3,'Direct utility isolation as relevant (gas, power, water, HVAC) via Shift Commander.','sire.struc.sh.utility_isolation',120,'VERBAL',TRUE,TRUE,'VENUE'),
  pg_temp.act(4,'Notify the relevant authority (Fire Service / civil / utility provider). Restrict access to the affected area.','sire.struc.sh.notify_restrict',120,'NOTE',TRUE,TRUE,'EXTERNAL'),
  pg_temp.act(5,'Hand over to responders with the affected-area map and utility status.','sire.struc.sh.handover',NULL,'SIGNATURE',TRUE,TRUE,'EXTERNAL')));

SELECT pg_temp.seed_tpl('STRUCTURAL', NULL, 'DSH', jsonb_build_array(
  pg_temp.act(1,'Acknowledge and join command. Stand by for SH takeover (5-minute rule).','sire.struc.dsh.acknowledge_standby',30,'VERBAL',TRUE,TRUE,'VENUE'),
  pg_temp.act(2,'Liaise with the utility provider / civil authority as directed.','sire.struc.dsh.authority_liaison',120,'NOTE',TRUE,TRUE,'EXTERNAL'),
  pg_temp.act(3,'Document command decisions and the timeline for audit.','sire.struc.dsh.audit',180,'NOTE',TRUE,FALSE,'VENUE'),
  pg_temp.act(4,'Lead the post-incident review and damage assessment record.','sire.struc.dsh.post_review',NULL,'NOTE',TRUE,FALSE,'VENUE')));

SELECT pg_temp.seed_tpl('STRUCTURAL', NULL, 'SHIFT_COMMANDER', jsonb_build_array(
  pg_temp.act(1,'Acknowledge. Coordinate utility shutdown as directed (gas valve / power / water / HVAC). Record who/when/what.','sire.struc.sc.utility_shutdown',120,'NOTE',TRUE,TRUE,'EXTERNAL'),
  pg_temp.act(2,'Cordon the affected zones; ensure no staff or occupant enters the unsafe structure.','sire.struc.sc.cordon',120,'VERBAL',TRUE,TRUE,'VENUE'),
  pg_temp.act(3,'Stage equipment and position staff to guide the responding authority.','sire.struc.sc.stage',180,'VERBAL',TRUE,FALSE,'EXTERNAL'),
  pg_temp.act(4,'Sitrep to SH every 5 minutes.','sire.struc.sc.sitrep',NULL,'VERBAL',TRUE,FALSE,'VENUE')));

SELECT pg_temp.seed_tpl('STRUCTURAL', NULL, 'FLOOR_SUPERVISOR', jsonb_build_array(
  pg_temp.act(1,'Acknowledge. Clear and restrict the affected area on your floor. Keep occupants well clear of the structural hazard.','sire.struc.fs.clear_restrict',90,'VERBAL',TRUE,TRUE,'FLOOR'),
  pg_temp.act(2,'Move occupants to a safe part of the floor or off the floor per SH directive — away from the hazard, not toward it.','sire.struc.fs.move_clear',120,'VERBAL',TRUE,TRUE,'FLOOR'),
  pg_temp.act(3,'Report the observed extent (cracks, water, smell of gas, outage) precisely to SH.','sire.struc.fs.report_extent',120,'NOTE',TRUE,TRUE,'FLOOR'),
  pg_temp.act(4,'Account for persons on the floor.','sire.struc.fs.account',NULL,'NOTE',TRUE,TRUE,'FLOOR')));

SELECT pg_temp.seed_tpl('STRUCTURAL', NULL, 'GROUND_STAFF', jsonb_build_array(
  pg_temp.act(1,'Acknowledge and proceed toward — but NOT into — your assigned zone if the structure there is compromised.','sire.struc.gs.acknowledge_proceed',30,'VERBAL',TRUE,TRUE,'ASSIGNED_ZONE'),
  pg_temp.act(2,'Restrict access to the affected zone. Do NOT enter an unsafe structure. Move occupants clear.','sire.struc.gs.restrict_clear',90,'VERBAL',TRUE,TRUE,'ASSIGNED_ZONE'),
  pg_temp.act(3,'If you smell gas: do NOT operate switches, phones, or anything that could spark, inside the area. Move people out and report from a safe distance.','sire.struc.gs.no_ignition',NULL,'VERBAL',TRUE,TRUE,'ASSIGNED_ZONE'),
  pg_temp.act(4,'Report your zone state and observed hazard from a safe location.','sire.struc.gs.report_state',60,'NOTE',TRUE,TRUE,'ASSIGNED_ZONE')));

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. TIER A — OTHER × all 5 roles  (EC-23 ultimate catch-all; safe + neutral)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT pg_temp.seed_tpl('OTHER', NULL, 'SH', jsonb_build_array(
  pg_temp.act(1,'Acknowledge and assume incident command. Establish exactly what has happened before directing any action.','sire.other.sh.assume_command',30,'VERBAL',TRUE,TRUE,'VENUE'),
  pg_temp.act(2,'Decide a proportionate response posture. When unsure, default to the safest reversible action (hold + assess) — never an irreversible one.','sire.other.sh.decide_posture',60,'NOTE',TRUE,TRUE,'VENUE'),
  pg_temp.act(3,'Communicate clear instructions on the command channel. Escalate to the relevant authority if life-safety is in question.','sire.other.sh.communicate',120,'NOTE',TRUE,TRUE,'VENUE'),
  pg_temp.act(4,'Account for persons as appropriate and document the incident timeline for review.','sire.other.sh.account_log',NULL,'NOTE',TRUE,FALSE,'VENUE')));

SELECT pg_temp.seed_tpl('OTHER', NULL, 'DSH', jsonb_build_array(
  pg_temp.act(1,'Acknowledge and join command. Stand by for SH takeover (5-minute rule).','sire.other.dsh.acknowledge_standby',30,'VERBAL',TRUE,TRUE,'VENUE'),
  pg_temp.act(2,'Handle external communications as directed; do not broadcast unverified information.','sire.other.dsh.external_comms',120,'NOTE',TRUE,FALSE,'VENUE'),
  pg_temp.act(3,'Document command decisions and timeline for audit.','sire.other.dsh.audit',180,'NOTE',TRUE,FALSE,'VENUE'),
  pg_temp.act(4,'Lead the post-incident review.','sire.other.dsh.post_review',NULL,'NOTE',TRUE,FALSE,'VENUE')));

SELECT pg_temp.seed_tpl('OTHER', NULL, 'SHIFT_COMMANDER', jsonb_build_array(
  pg_temp.act(1,'Acknowledge. Mobilise staff per SH directive only.','sire.other.sc.mobilise',60,'VERBAL',TRUE,TRUE,'VENUE'),
  pg_temp.act(2,'Track resources and manage any logistics the SH requests.','sire.other.sc.track_logistics',120,'NOTE',TRUE,FALSE,'VENUE'),
  pg_temp.act(3,'Sitrep to SH every 5 minutes until stood down.','sire.other.sc.sitrep',NULL,'VERBAL',TRUE,FALSE,'VENUE')));

SELECT pg_temp.seed_tpl('OTHER', NULL, 'FLOOR_SUPERVISOR', jsonb_build_array(
  pg_temp.act(1,'Acknowledge. Manage occupants on your floor per the SH directive — keep them calm and informed only with verified instruction.','sire.other.fs.manage_floor',60,'VERBAL',TRUE,TRUE,'FLOOR'),
  pg_temp.act(2,'Report observations to SH on the command channel.','sire.other.fs.report',120,'NOTE',TRUE,FALSE,'FLOOR'),
  pg_temp.act(3,'Account for persons on the floor when asked.','sire.other.fs.account',NULL,'NOTE',TRUE,TRUE,'FLOOR')));

SELECT pg_temp.seed_tpl('OTHER', NULL, 'GROUND_STAFF', jsonb_build_array(
  pg_temp.act(1,'Acknowledge and proceed to your assigned zone.','sire.other.gs.acknowledge_proceed',30,'VERBAL',TRUE,TRUE,'ASSIGNED_ZONE'),
  pg_temp.act(2,'Follow the specific instruction from your Floor Supervisor or SH. Do not improvise an irreversible action.','sire.other.gs.follow_instruction',NULL,'VERBAL',TRUE,TRUE,'ASSIGNED_ZONE'),
  pg_temp.act(3,'Keep occupants calm. Observe and report anything relevant to command.','sire.other.gs.observe_report',NULL,'NOTE',TRUE,FALSE,'ASSIGNED_ZONE'),
  pg_temp.act(4,'Report your zone state and stand by for further instruction.','sire.other.gs.report_standby',NULL,'NOTE',TRUE,FALSE,'ASSIGNED_ZONE')));

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. TIER B — dangerous-divergence sub-types (SH + GROUND_STAFF)
-- ═══════════════════════════════════════════════════════════════════════════
-- 7.1 SECURITY_BOMB_THREAT — search, do NOT run standard evacuation; no RF
SELECT pg_temp.seed_tpl('SECURITY', 'SECURITY_BOMB_THREAT', 'SH', jsonb_build_array(
  pg_temp.act(1,'Acknowledge. Do NOT activate the fire alarm or a standard evacuation — a default route may lead people toward a device. Treat as a deliberate, controlled response.','sire.sec.bomb.sh.no_standard_evac',30,'NOTE',TRUE,TRUE,'VENUE'),
  pg_temp.act(2,'Initiate a discreet search using staff who know their own areas (they spot what is out of place). They identify, never touch.','sire.sec.bomb.sh.staff_search',120,'NOTE',TRUE,TRUE,'VENUE'),
  pg_temp.act(3,'Call police (100) / bomb disposal. Follow their direction on whether and how to move people, and on the evacuation route AWAY from any suspect location.','sire.sec.bomb.sh.police_route',120,'NOTE',TRUE,TRUE,'EXTERNAL'),
  pg_temp.act(4,'Order no radio, no mobile transmission within 15 m of any suspected item (RF can initiate a device). Use runners or landline.','sire.sec.bomb.sh.no_rf',60,'VERBAL',TRUE,TRUE,'VENUE'),
  pg_temp.act(5,'If movement is ordered, evacuate via a route confirmed clear and away from the suspect location. Hand over to police on arrival.','sire.sec.bomb.sh.controlled_handover',NULL,'SIGNATURE',TRUE,TRUE,'EXTERNAL')));

SELECT pg_temp.seed_tpl('SECURITY', 'SECURITY_BOMB_THREAT', 'GROUND_STAFF', jsonb_build_array(
  pg_temp.act(1,'Acknowledge silently. Do NOT shout, do NOT announce "bomb", do NOT pull the fire alarm.','sire.sec.bomb.gs.silent_ack',30,'VERBAL',TRUE,TRUE,'ASSIGNED_ZONE'),
  pg_temp.act(2,'Visually scan your own zone for anything unfamiliar or out of place. You know your area best.','sire.sec.bomb.gs.visual_scan',120,'NOTE',TRUE,TRUE,'ASSIGNED_ZONE'),
  pg_temp.act(3,'If you find a suspect item: do NOT touch, move, or cover it. Note its exact location and description.','sire.sec.bomb.gs.do_not_touch',NULL,'NOTE',TRUE,TRUE,'ASSIGNED_ZONE'),
  pg_temp.act(4,'Move people calmly away from the item and do NOT use your radio or phone within 15 m of it. Report from a safe distance.','sire.sec.bomb.gs.no_rf_clear',60,'NOTE',TRUE,TRUE,'ASSIGNED_ZONE'),
  pg_temp.act(5,'Follow the routed evacuation instruction from command — it may NOT be the nearest exit. Do not freelance a route.','sire.sec.bomb.gs.follow_route',NULL,'VERBAL',TRUE,TRUE,'ASSIGNED_ZONE')));

-- 7.2 SECURITY_ACTIVE_AGGRESSOR — RUN-HIDE-FIGHT, not orderly evacuation
SELECT pg_temp.seed_tpl('SECURITY', 'SECURITY_ACTIVE_AGGRESSOR', 'SH', jsonb_build_array(
  pg_temp.act(1,'Acknowledge. Broadcast RUN-HIDE-FIGHT guidance, NOT an orderly evacuation. Do NOT trigger the fire alarm (it gathers people in corridors).','sire.sec.aggr.sh.run_hide_fight',30,'NOTE',TRUE,TRUE,'VENUE'),
  pg_temp.act(2,'Lock down unaffected zones; do not push everyone into shared corridors or the standard muster (it may be the target).','sire.sec.aggr.sh.lockdown',60,'NOTE',TRUE,TRUE,'VENUE'),
  pg_temp.act(3,'Call police (100) immediately: location, description, number of aggressors, weapons, direction of movement.','sire.sec.aggr.sh.police',60,'NOTE',TRUE,TRUE,'EXTERNAL'),
  pg_temp.act(4,'Account for people via secure remote check-in, not a physical assembly. Keep the command channel disciplined.','sire.sec.aggr.sh.secure_account',NULL,'NOTE',TRUE,TRUE,'VENUE'),
  pg_temp.act(5,'On police arrival, hand over command. Keep staff hidden/secured until police declare the area safe.','sire.sec.aggr.sh.police_handover',NULL,'SIGNATURE',TRUE,TRUE,'EXTERNAL')));

SELECT pg_temp.seed_tpl('SECURITY', 'SECURITY_ACTIVE_AGGRESSOR', 'GROUND_STAFF', jsonb_build_array(
  pg_temp.act(1,'Acknowledge. If there is a safe route AWAY from the threat — RUN, and take others with you. Leave belongings.','sire.sec.aggr.gs.run',NULL,'VERBAL',TRUE,TRUE,'ASSIGNED_ZONE'),
  pg_temp.act(2,'If you cannot run — HIDE: lock or barricade, lights off, silence your phone, stay out of sight and quiet.','sire.sec.aggr.gs.hide',NULL,'VERBAL',TRUE,TRUE,'ASSIGNED_ZONE'),
  pg_temp.act(3,'FIGHT only as an absolute last resort if your life is in immediate danger.','sire.sec.aggr.gs.fight_last',NULL,'VERBAL',TRUE,TRUE,'ASSIGNED_ZONE'),
  pg_temp.act(4,'Do NOT pull the fire alarm and do NOT move toward the threat to investigate.','sire.sec.aggr.gs.no_alarm',NULL,'VERBAL',TRUE,TRUE,'ASSIGNED_ZONE'),
  pg_temp.act(5,'Report your location and what you saw to command ONLY when it is safe to do so (silently if hidden).','sire.sec.aggr.gs.report_when_safe',NULL,'NOTE',TRUE,TRUE,'ASSIGNED_ZONE')));

-- 7.3 EVACUATION_SHELTER_IN_PLACE — move people IN, not out (opposite of evac)
SELECT pg_temp.seed_tpl('EVACUATION', 'EVACUATION_SHELTER_IN_PLACE', 'SH', jsonb_build_array(
  pg_temp.act(1,'Acknowledge. This is SHELTER-IN-PLACE, NOT evacuation. Direct everyone INTO secure interior areas away from windows and exterior walls.','sire.evac.shelter.sh.shelter_not_evac',30,'NOTE',TRUE,TRUE,'VENUE'),
  pg_temp.act(2,'For an external airborne hazard, order HVAC shut down and exterior openings closed.','sire.evac.shelter.sh.seal',60,'VERBAL',TRUE,TRUE,'VENUE'),
  pg_temp.act(3,'Account for all occupants in shelter locations. No one is to go outside.','sire.evac.shelter.sh.account_inside',120,'NOTE',TRUE,TRUE,'VENUE'),
  pg_temp.act(4,'Maintain communication with occupants and the external authority; provide status.','sire.evac.shelter.sh.maintain_comms',NULL,'NOTE',TRUE,TRUE,'EXTERNAL'),
  pg_temp.act(5,'Lift shelter-in-place ONLY on confirmed all-clear from the external authority. Do not release early.','sire.evac.shelter.sh.lift_on_allclear',NULL,'SIGNATURE',TRUE,TRUE,'VENUE')));

SELECT pg_temp.seed_tpl('EVACUATION', 'EVACUATION_SHELTER_IN_PLACE', 'GROUND_STAFF', jsonb_build_array(
  pg_temp.act(1,'Acknowledge. Move occupants in your zone INTO the designated shelter area (interior, away from windows). Do NOT send anyone outside.','sire.evac.shelter.gs.move_in',60,'VERBAL',TRUE,TRUE,'ASSIGNED_ZONE'),
  pg_temp.act(2,'Close doors and windows in your zone. If told, help seal gaps for an external airborne hazard.','sire.evac.shelter.gs.close_seal',90,'VERBAL',TRUE,TRUE,'ASSIGNED_ZONE'),
  pg_temp.act(3,'Keep occupants calm and together inside the shelter area. Reassure them this is the safest place right now.','sire.evac.shelter.gs.keep_together',NULL,'VERBAL',TRUE,TRUE,'ASSIGNED_ZONE'),
  pg_temp.act(4,'Report your shelter headcount on your device.','sire.evac.shelter.gs.report_headcount',120,'NOTE',TRUE,TRUE,'ASSIGNED_ZONE'),
  pg_temp.act(5,'Do NOT release anyone until command confirms the all-clear.','sire.evac.shelter.gs.hold_until_allclear',NULL,'VERBAL',TRUE,TRUE,'ASSIGNED_ZONE')));

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. VERIFICATION — EC-23 completeness for every (type × SIRE role)
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_parent_total  INT;
  v_missing       INT;
  v_tierb         INT;
  r_type          TEXT;
  r_role          TEXT;
BEGIN
  -- Every parent type × SIRE role must have a global+parent template.
  v_missing := 0;
  FOREACH r_type IN ARRAY ARRAY['FIRE','MEDICAL','SECURITY','EVACUATION','STRUCTURAL','OTHER'] LOOP
    FOREACH r_role IN ARRAY ARRAY['SH','DSH','SHIFT_COMMANDER','FLOOR_SUPERVISOR','GROUND_STAFF'] LOOP
      IF NOT EXISTS (
        SELECT 1 FROM incident_action_templates
        WHERE venue_id IS NULL AND venue_type IS NULL
          AND incident_type = r_type AND incident_subtype IS NULL
          AND staff_role = r_role AND is_active = TRUE
      ) THEN
        RAISE WARNING 'EC-23 GAP: % x % has no global+parent template', r_type, r_role;
        v_missing := v_missing + 1;
      END IF;
    END LOOP;
  END LOOP;

  SELECT COUNT(*) INTO v_parent_total
  FROM incident_action_templates
  WHERE venue_id IS NULL AND venue_type IS NULL
    AND incident_subtype IS NULL AND is_active = TRUE;

  SELECT COUNT(*) INTO v_tierb
  FROM incident_action_templates
  WHERE venue_id IS NULL AND venue_type IS NULL
    AND incident_subtype IN ('SECURITY_BOMB_THREAT','SECURITY_ACTIVE_AGGRESSOR','EVACUATION_SHELTER_IN_PLACE')
    AND is_active = TRUE;

  RAISE NOTICE 'mig 019 Phase 5.22 completeness verification:';
  RAISE NOTICE '  Global+parent templates total: % (6 types x 5 roles = expect 30)', v_parent_total;
  RAISE NOTICE '  EC-23 (type x role) gaps:      % (expect 0)', v_missing;
  RAISE NOTICE '  Tier-B divergence sub-types:   % (expect 6)', v_tierb;

  IF v_missing <> 0 THEN
    RAISE EXCEPTION 'mig 019 FAILED: % EC-23 (type x role) gaps remain', v_missing;
  END IF;
  IF v_parent_total <> 30 THEN
    RAISE EXCEPTION 'mig 019 FAILED: expected 30 global+parent templates, got %', v_parent_total;
  END IF;
  IF v_tierb <> 6 THEN
    RAISE EXCEPTION 'mig 019 FAILED: expected 6 Tier-B sub-type templates, got %', v_tierb;
  END IF;

  RAISE NOTICE '  All checks PASSED. Every incident_type x SIRE role resolves; SIRE template library complete for non-hospital go-live.';
END $$;
