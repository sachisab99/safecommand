/**
 * SIRE Compliance Export — Telangana FF-3 + NABH §EM (server-rendered PDF).
 *
 * Per Architecture v9.1 §20.13. Generated entirely from already-LIVE SIRE
 * schema (incident, incident_zone_state_log, incident_action_assignments,
 * incident_evacuation_triggers, incident_timeline — all in production since
 * mig 014–019). NO new schema, NO worker. On-demand only — the spec's
 * "auto-generate on incident resolution" trigger is the separate
 * worker/June concern (same scoping discipline as BR-A).
 *
 * Two authority formats:
 *   TELANGANA_FF3 — Telangana Fire Service Form FF-3 compliant record
 *                   (the venue GM's #1 paper-form compliance pain point;
 *                   the Fire-NOC pilot closer). Non-hospital.
 *   NABH_EM       — NABH §EM 6th Edition (2025) evidence pack: 5-section
 *                   layout per §20.13. Mechanism is venue-type-agnostic;
 *                   only meaningful once hospital venues onboard (Phase 2,
 *                   Rule 12) — the renderer itself stores no patient PII.
 *
 * 'Powered by SafeCommand' footer on every page — non-removable per
 * EC-18 / Hard Rule 20 (literal string; no domain, consistent with the
 * existing incidentReport.ts footer). venue-scoped on every query (Rule 2).
 */

import PDFDocument from 'pdfkit';
import { getServiceClient } from '@safecommand/db';
import { logger } from './logger.js';

const POWERED_BY = 'Powered by SafeCommand'; // EC-18 / Rule 20 — literal, non-removable

export type SireExportFormat = 'TELANGANA_FF3' | 'NABH_EM';

interface BuildResult {
  buffer: Buffer;
  /** Short human ref for filenames / audit log. */
  ref: string;
}

type StaffLite = { name: string; role: string };

interface IncidentRow {
  id: string;
  incident_type: string;
  incident_subtype: string | null;
  severity: string;
  status: string;
  description: string | null;
  declared_at: string;
  resolved_at: string | null;
  has_sire_data: boolean | null;
  is_drill: boolean | null;
  declared_by_staff_id: string | null;
  zones: { name: string } | null;
  venues: { name: string; type?: string; venue_code?: string } | null;
  declarer: StaffLite | null;
}

function fmt(ts: string | null | undefined): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

function durationStr(from: string, to: string | null): string {
  if (!to) return 'ongoing (unresolved)';
  const ms = new Date(to).getTime() - new Date(from).getTime();
  if (Number.isNaN(ms) || ms < 0) return '—';
  const m = Math.round(ms / 60000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

const FMT_TITLE: Record<SireExportFormat, string> = {
  TELANGANA_FF3: 'Telangana Fire Service — Form FF-3 (Drill / Incident Record)',
  NABH_EM: 'NABH §EM Emergency-Management Evidence Pack',
};

/**
 * Fetch the SIRE record and render the requested authority format.
 * Returns null if the incident is not in the caller's venue (→ 404).
 */
export async function buildSireComplianceExportPdf(
  incidentId: string,
  venueId: string,
  format: SireExportFormat,
): Promise<BuildResult | null> {
  const db = getServiceClient();

  const { data: incRow, error: incErr } = await db
    .from('incidents')
    .select(
      'id, incident_type, incident_subtype, severity, status, description, ' +
        'declared_at, resolved_at, has_sire_data, is_drill, declared_by_staff_id, ' +
        'zones(name), venues(name, type, venue_code), declarer:declared_by_staff_id(name, role)',
    )
    .eq('id', incidentId)
    .eq('venue_id', venueId)
    .single();
  if (incErr || !incRow) return null;
  const inc = incRow as unknown as IncidentRow;

  const { data: staffRows } = await db
    .from('staff')
    .select('id, name, role')
    .eq('venue_id', venueId);
  const staffMap = new Map<string, StaffLite>();
  for (const s of (staffRows ?? []) as Array<{ id: string; name: string; role: string }>) {
    staffMap.set(s.id, { name: s.name, role: s.role });
  }
  const who = (id: string | null | undefined): string => {
    if (!id) return 'System';
    const s = staffMap.get(id);
    return s ? `${s.name} (${s.role})` : id.slice(0, 8);
  };

  const [zlRes, asgRes, trgRes, tlRes] = await Promise.all([
    db.from('incident_zone_state_log')
      .select('zone_id, previous_state, new_state, changed_by, changed_by_role, reason_note, changed_at, zones(name)')
      .eq('incident_id', incidentId).eq('venue_id', venueId)
      .order('changed_at', { ascending: true }),
    db.from('incident_action_assignments')
      .select('staff_id, role, action_order, instruction, status, completed_at, blocked_reason, is_mandatory, is_life_critical, staff(name)')
      .eq('incident_id', incidentId).eq('venue_id', venueId)
      .order('staff_id', { ascending: true }).order('action_order', { ascending: true }),
    db.from('incident_evacuation_triggers')
      .select('trigger_type, triggered_by, triggered_by_role, zones_affected, reason_note, pa_text_generated, pa_text_broadcast, triggered_at')
      .eq('incident_id', incidentId).eq('venue_id', venueId)
      .order('triggered_at', { ascending: true }),
    db.from('incident_timeline')
      .select('event_type, actor_staff_id, metadata, occurred_at')
      .eq('incident_id', incidentId).eq('venue_id', venueId)
      .order('occurred_at', { ascending: true }),
  ]);
  const zoneLog = (zlRes.data ?? []) as unknown as Array<{
    zone_id: string; previous_state: string | null; new_state: string;
    changed_by: string | null; changed_by_role: string | null;
    reason_note: string | null; changed_at: string; zones: { name: string } | null;
  }>;
  const assignments = (asgRes.data ?? []) as unknown as Array<{
    staff_id: string; role: string; action_order: number; instruction: string;
    status: string; completed_at: string | null; blocked_reason: string | null;
    is_mandatory: boolean | null; is_life_critical: boolean | null;
    staff: { name: string } | null;
  }>;
  const triggers = (trgRes.data ?? []) as unknown as Array<{
    trigger_type: string; triggered_by: string | null; triggered_by_role: string | null;
    zones_affected: unknown; reason_note: string | null;
    pa_text_generated: string | null; pa_text_broadcast: string | null; triggered_at: string;
  }>;
  const timeline = (tlRes.data ?? []) as unknown as Array<{
    event_type: string; actor_staff_id: string | null;
    metadata: Record<string, unknown> | null; occurred_at: string;
  }>;

  const venueName = inc.venues?.name ?? 'Venue';
  const venueCode = inc.venues?.venue_code ?? '—';
  const venueType = inc.venues?.type ?? '—';
  const zoneName = inc.zones?.name ?? 'Venue-wide';
  const incidentRef = `${inc.incident_type}-${String(inc.id).slice(0, 8).toUpperCase()}`;
  const ref = `${format}-${venueCode}-${String(inc.id).slice(0, 8).toUpperCase()}`;

  // ── Derived metrics ──
  const distinctStaff = new Set(assignments.map((a) => a.staff_id)).size;
  const doneCount = assignments.filter((a) => a.status === 'DONE').length;
  const completionPct =
    assignments.length > 0 ? Math.round((doneCount / assignments.length) * 100) : null;
  const zonesTouched = new Set(zoneLog.map((z) => z.zone_id)).size;
  const inaccessible = zoneLog.filter((z) => z.new_state === 'INACCESSIBLE');
  const incompleteActions = assignments.filter(
    (a) => a.status !== 'DONE' && a.status !== 'SKIPPED',
  );

  // ── Render ──
  const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });

  const H1 = (t: string) =>
    doc.moveDown(0.6).fontSize(14).fillColor('#0f172a').text(t).moveDown(0.2);
  const rowKV = (k: string, v: string) =>
    doc.fontSize(10).fillColor('#475569').text(`${k}: `, { continued: true })
      .fillColor('#0f172a').text(v);
  const body = (t: string) => doc.fontSize(10).fillColor('#334155').text(t);
  const line = (t: string, color = '#334155') => doc.fontSize(9).fillColor(color).text(t);

  doc.fontSize(18).fillColor('#b91c1c').text(FMT_TITLE[format]);
  doc.fontSize(11).fillColor('#64748b').text(`${venueName}  ·  ${venueCode}  ·  ${incidentRef}`);
  if (inc.is_drill) doc.fontSize(10).fillColor('#92400e').text('⚠ DRILL — not a live incident');
  if (inc.has_sire_data !== true) {
    doc.fontSize(9).fillColor('#92400e').text(
      'Note: this incident predates / opted out of SIRE — zone-state & per-role ' +
        'action records may be empty; summary fields still apply.',
    );
  }
  doc.moveDown(0.5);

  if (format === 'TELANGANA_FF3') {
    // ── Telangana FF-3 generated fields (v9.1 §20.13) ──
    H1('Form FF-3 — generated fields');
    rowKV('Venue registration no.', venueCode);
    rowKV('Venue', `${venueName} (${venueType})`);
    rowKV('Date & time', fmt(inc.declared_at));
    rowKV('Type of drill / incident',
      `${inc.incident_type}${inc.incident_subtype ? ` / ${inc.incident_subtype}` : ''}` +
        `${inc.is_drill ? ' (DRILL)' : ''}`);
    rowKV('Staff participating', String(distinctStaff));
    rowKV('Duration', durationStr(inc.declared_at, inc.resolved_at));
    rowKV('Officer in charge',
      inc.declarer ? `${inc.declarer.name} (${inc.declarer.role})` : who(inc.declared_by_staff_id));
    rowKV('Scope', zoneName);

    H1('Per-role actions documented');
    if (assignments.length === 0) body('No per-role action assignments recorded.');
    let cur = '';
    for (const a of assignments) {
      const sn = a.staff?.name ?? String(a.staff_id).slice(0, 8);
      const head = `${sn} (${a.role})`;
      if (head !== cur) {
        cur = head;
        doc.moveDown(0.2).fontSize(10).fillColor('#0f172a').text(head);
      }
      const mark = a.status === 'DONE' ? '✓' : a.status === 'BLOCKED' ? '⊘' : a.status === 'SKIPPED' ? '↦' : '○';
      line(
        `   ${mark} #${a.action_order} [${a.status}] ${String(a.instruction).slice(0, 130)}` +
          `${a.is_life_critical ? '  ⚡life-critical' : ''}` +
          `${a.completed_at ? `  · ${fmt(a.completed_at)}` : ''}`,
        a.status === 'DONE' ? '#166534' : '#475569',
      );
    }

    H1('Zone validation records');
    if (zoneLog.length === 0) body('No zone-state transitions recorded.');
    for (const z of zoneLog) {
      const zn = z.zones?.name ?? String(z.zone_id).slice(0, 8);
      line(
        `   ${fmt(z.changed_at)} — ${zn}: ${z.previous_state ?? '—'} → ${z.new_state}` +
          ` · ${who(z.changed_by)}${z.reason_note ? ` · ${z.reason_note}` : ''}`,
        z.new_state === 'INACCESSIBLE' ? '#b91c1c' : '#334155',
      );
    }

    H1('Deficiencies noted');
    if (inaccessible.length === 0 && incompleteActions.length === 0) {
      body('None — all zones reached a clear state and all assigned actions resolved.');
    } else {
      for (const z of inaccessible) {
        const zn = z.zones?.name ?? String(z.zone_id).slice(0, 8);
        line(`   ⚠ Zone INACCESSIBLE: ${zn} (at ${fmt(z.changed_at)})`, '#b91c1c');
      }
      for (const a of incompleteActions) {
        const sn = a.staff?.name ?? String(a.staff_id).slice(0, 8);
        line(
          `   ⚠ Action incomplete [${a.status}]: ${sn} (${a.role}) #${a.action_order}` +
            `${a.blocked_reason ? ` — ${a.blocked_reason}` : ''}`,
          '#b91c1c',
        );
      }
    }
  } else {
    // ── NABH §EM 5-section evidence pack (v9.1 §20.13) ──
    H1('Section 1 — Incident summary');
    rowKV('Incident code', incidentRef);
    rowKV('Sub-type', inc.incident_subtype ?? inc.incident_type);
    rowKV('Declared', fmt(inc.declared_at));
    rowKV('Status / resolved', `${inc.status}${inc.resolved_at ? ` · ${fmt(inc.resolved_at)}` : ''}`);
    rowKV('Duration', durationStr(inc.declared_at, inc.resolved_at));
    rowKV('Declared by',
      inc.declarer ? `${inc.declarer.name} (${inc.declarer.role})` : who(inc.declared_by_staff_id));

    H1('Section 2 — Zone validation record');
    rowKV('Zones with state activity', String(zonesTouched));
    rowKV('Inaccessible zones', String(inaccessible.length));
    doc.moveDown(0.2);
    if (zoneLog.length === 0) body('No zone-state transitions recorded.');
    for (const z of zoneLog) {
      const zn = z.zones?.name ?? String(z.zone_id).slice(0, 8);
      line(
        `   ${zn}: ${z.previous_state ?? '—'} → ${z.new_state} · ${who(z.changed_by)}` +
          ` · ${fmt(z.changed_at)}`,
        z.new_state === 'INACCESSIBLE' ? '#b91c1c' : '#334155',
      );
    }

    H1('Section 3 — Per-role action completion record');
    rowKV('Staff engaged', String(distinctStaff));
    rowKV('Actions', `${doneCount}/${assignments.length} done${completionPct != null ? ` (${completionPct}%)` : ''}`);
    doc.moveDown(0.2);
    let cur = '';
    for (const a of assignments) {
      const sn = a.staff?.name ?? String(a.staff_id).slice(0, 8);
      const head = `${sn} (${a.role})`;
      if (head !== cur) {
        cur = head;
        doc.moveDown(0.2).fontSize(10).fillColor('#0f172a').text(head);
      }
      const mark = a.status === 'DONE' ? '✓' : a.status === 'BLOCKED' ? '⊘' : a.status === 'SKIPPED' ? '↦' : '○';
      line(`   ${mark} #${a.action_order} [${a.status}] ${String(a.instruction).slice(0, 130)}`,
        a.status === 'DONE' ? '#166534' : '#475569');
    }
    if (assignments.length === 0) body('No action assignments recorded.');

    H1('Section 4 — Evacuation decision audit trail');
    if (triggers.length === 0) body('No evacuation triggered.');
    for (const t of triggers) {
      const zc = Array.isArray(t.zones_affected) ? (t.zones_affected as unknown[]).length : 0;
      line(
        `   ${fmt(t.triggered_at)} — ${String(t.trigger_type).replace(/_/g, ' ')} · ${zc} zone(s)` +
          ` · by ${who(t.triggered_by)} (${t.triggered_by_role ?? '—'})`,
        '#b91c1c',
      );
      if (t.reason_note) line(`      reason: ${t.reason_note}`, '#64748b');
      if (t.pa_text_broadcast || t.pa_text_generated) {
        line(`      PA: ${t.pa_text_broadcast ?? t.pa_text_generated}`, '#64748b');
      }
    }
    doc.moveDown(0.2);
    line(`Timeline events on record: ${timeline.length}`, '#94a3b8');

    H1('Section 5 — Regulatory compliance statement');
    body(
      'This report is generated by SafeCommand in compliance with NABH §EM ' +
        '6th Edition (2025). It is derived from immutable, append-only operational ' +
        'records (incident timeline, zone-state log, evacuation triggers — Hard Rule 4) ' +
        'and is suitable as an NABH §EM evidence-pack artefact. It is not a substitute ' +
        'for statutory inspection or accreditation assessment.',
    );
    doc.moveDown(0.4);
    rowKV('Incident record', incidentRef);
    rowKV('Venue', `${venueName} (${venueCode})`);
    rowKV('Report generated', fmt(new Date().toISOString()));
  }

  // ── Footer every page: 'Powered by SafeCommand' (EC-18/Rule 20) ──
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const y = doc.page.height - 40;
    doc.fontSize(8).fillColor('#94a3b8').text(
      `${POWERED_BY}   ·   ${ref}   ·   Page ${i + 1} of ${range.count}`,
      50,
      y,
      { align: 'center', width: doc.page.width - 100, lineBreak: false },
    );
  }

  doc.end();
  const buffer = await done;
  logger.info(
    { incidentId, venueId, format, bytes: buffer.length },
    'SIRE compliance export rendered (v9.1 §20.13)',
  );
  return { buffer, ref };
}
