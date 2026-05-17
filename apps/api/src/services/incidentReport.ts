/**
 * BR-29 — Post-incident report (server-rendered PDF).
 *
 * Assembles the full auditable record of an incident and renders it via
 * PDFKit to a Buffer. Designed to be Fire-NOC / NABH / insurance-grade:
 * deterministic, complete, immutable-source-derived. Works for legacy
 * (non-SIRE) incidents (summary + timeline only) and SIRE incidents
 * (adds zone-state history, per-role action completion, evacuation-trigger
 * audit, and the photo-evidence ledger).
 *
 * 'Powered by SafeCommand' is stamped on every page footer — non-removable
 * per EC-18 / Hard Rule 20 (literal string in code).
 *
 * No worker dependency — invoked synchronously from the route.
 */

import PDFDocument from 'pdfkit';
import { getServiceClient } from '@safecommand/db';
import { logger } from './logger.js';

const POWERED_BY = 'Powered by SafeCommand'; // EC-18 / Rule 20 — literal, non-removable

interface BuildResult {
  buffer: Buffer;
  /** Short human ref for filenames / audit log. */
  incidentRef: string;
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
  venues: { name: string; type?: string } | null;
  declarer: StaffLite | null;
}

function fmt(ts: string | null | undefined): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

function durationStr(from: string, to: string | null): string {
  if (!to) return 'ongoing';
  const ms = new Date(to).getTime() - new Date(from).getTime();
  if (Number.isNaN(ms) || ms < 0) return '—';
  const m = Math.round(ms / 60000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

/**
 * Fetch everything and render. Returns null if the incident is not found
 * in the caller's venue (caller maps to 404).
 */
export async function buildIncidentReportPdf(
  incidentId: string,
  venueId: string,
): Promise<BuildResult | null> {
  const db = getServiceClient();

  // ── Incident (+ zone, venue, declarer) ──
  const { data: incRow, error: incErr } = await db
    .from('incidents')
    .select(
      'id, incident_type, incident_subtype, severity, status, description, ' +
        'declared_at, resolved_at, has_sire_data, is_drill, declared_by_staff_id, ' +
        'zones(name), venues(name, type), declarer:declared_by_staff_id(name, role)',
    )
    .eq('id', incidentId)
    .eq('venue_id', venueId)
    .single();

  if (incErr || !incRow) return null;
  const inc = incRow as unknown as IncidentRow;

  // ── Staff map for actor-name resolution (one fetch, venue-scoped) ──
  const { data: staffRows } = await db
    .from('staff')
    .select('id, name, role')
    .eq('venue_id', venueId);
  const staffMap = new Map<string, StaffLite>();
  for (const s of staffRows ?? []) staffMap.set(s.id, { name: s.name, role: s.role });
  const who = (id: string | null | undefined): string => {
    if (!id) return 'System';
    const s = staffMap.get(id);
    return s ? `${s.name} (${s.role})` : id.slice(0, 8);
  };

  // ── Timeline (append-only) ──
  const { data: timeline } = await db
    .from('incident_timeline')
    .select('event_type, actor_staff_id, metadata, occurred_at')
    .eq('incident_id', incidentId)
    .eq('venue_id', venueId)
    .order('occurred_at', { ascending: true });

  // ── SIRE sections (only if has_sire_data) ──
  const isSire = inc.has_sire_data === true;
  let zoneLog: Array<Record<string, unknown>> = [];
  let assignments: Array<Record<string, unknown>> = [];
  let triggers: Array<Record<string, unknown>> = [];
  let evidence: Array<Record<string, unknown>> = [];
  if (isSire) {
    const [zl, asg, trg, evd] = await Promise.all([
      db.from('incident_zone_state_log')
        .select('zone_id, previous_state, new_state, changed_by, changed_by_role, reason_note, changed_at, zones(name)')
        .eq('incident_id', incidentId).eq('venue_id', venueId)
        .order('changed_at', { ascending: true }),
      db.from('incident_action_assignments')
        .select('staff_id, role, action_order, instruction, status, started_at, completed_at, blocked_reason, is_mandatory, is_life_critical, staff(name)')
        .eq('incident_id', incidentId).eq('venue_id', venueId)
        .order('staff_id', { ascending: true }).order('action_order', { ascending: true }),
      db.from('incident_evacuation_triggers')
        .select('trigger_type, triggered_by, triggered_by_role, zones_affected, reason_note, pa_text_generated, pa_text_broadcast, triggered_at')
        .eq('incident_id', incidentId).eq('venue_id', venueId)
        .order('triggered_at', { ascending: true }),
      db.from('incident_evidence')
        .select('posted_by, posted_by_role, evidence_url, caption, created_at, staff:posted_by(name)')
        .eq('incident_id', incidentId).eq('venue_id', venueId)
        .order('created_at', { ascending: true }),
    ]);
    zoneLog = (zl.data as typeof zoneLog) ?? [];
    assignments = (asg.data as typeof assignments) ?? [];
    triggers = (trg.data as typeof triggers) ?? [];
    evidence = (evd.data as typeof evidence) ?? [];
  }

  // ── Render ──
  const venueName = (inc as { venues?: { name?: string } }).venues?.name ?? 'Venue';
  const zoneName = (inc as { zones?: { name?: string } }).zones?.name ?? 'Venue-wide';
  const declarer = (inc as { declarer?: StaffLite }).declarer;
  const incidentRef = `${inc.incident_type}-${String(inc.id).slice(0, 8).toUpperCase()}`;

  const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });

  const H1 = (t: string) => doc.moveDown(0.6).fontSize(15).fillColor('#0f172a').text(t).moveDown(0.2);
  const row = (k: string, v: string) =>
    doc.fontSize(10).fillColor('#475569').text(`${k}: `, { continued: true }).fillColor('#0f172a').text(v);
  const body = (t: string) => doc.fontSize(10).fillColor('#334155').text(t);

  // Title block
  doc.fontSize(20).fillColor('#b91c1c').text('Post-Incident Report', { align: 'left' });
  doc.fontSize(11).fillColor('#64748b').text(`${venueName}  ·  ${incidentRef}`);
  if (inc.is_drill) doc.fontSize(10).fillColor('#92400e').text('⚠ DRILL — not a live incident');
  doc.moveDown(0.5);

  H1('1. Summary');
  row('Type', `${inc.incident_type}${inc.incident_subtype ? ` / ${inc.incident_subtype}` : ''}`);
  row('Severity', String(inc.severity));
  row('Status', String(inc.status));
  row('Scope', zoneName);
  row('Declared by', declarer ? `${declarer.name} (${declarer.role})` : who(inc.declared_by_staff_id));
  row('Declared at', fmt(inc.declared_at));
  row('Resolved at', fmt(inc.resolved_at));
  row('Duration', durationStr(inc.declared_at as string, (inc.resolved_at as string) ?? null));
  row('Response model', isSire ? 'SIRE (structured per-role)' : 'Legacy (binary safe-check)');
  if (inc.description) {
    doc.moveDown(0.3);
    body(String(inc.description));
  }

  H1('2. Timeline');
  if ((timeline ?? []).length === 0) body('No timeline events recorded.');
  for (const e of timeline ?? []) {
    doc
      .fontSize(9).fillColor('#94a3b8').text(fmt(e.occurred_at as string), { continued: true })
      .fillColor('#0f172a').text(`   ${String(e.event_type).replace(/_/g, ' ')}`, { continued: true })
      .fillColor('#64748b').text(`   — ${who(e.actor_staff_id as string)}`);
  }

  if (isSire) {
    H1('3. Zone state history');
    if (zoneLog.length === 0) body('No zone state transitions recorded.');
    for (const z of zoneLog) {
      const zn = (z as { zones?: { name?: string } }).zones?.name ?? String(z.zone_id).slice(0, 8);
      doc.fontSize(9).fillColor('#94a3b8').text(fmt(z.changed_at as string), { continued: true })
        .fillColor('#0f172a')
        .text(`   ${zn}: ${z.previous_state ?? '—'} → ${z.new_state}`, { continued: true })
        .fillColor('#64748b').text(`   ${who(z.changed_by as string)}${z.reason_note ? ` · ${z.reason_note}` : ''}`);
    }

    H1('4. Per-role action completion');
    if (assignments.length === 0) body('No action assignments.');
    let curStaff = '';
    for (const a of assignments) {
      const sn = (a as { staff?: { name?: string } }).staff?.name ?? String(a.staff_id).slice(0, 8);
      const head = `${sn} (${a.role})`;
      if (head !== curStaff) {
        curStaff = head;
        doc.moveDown(0.3).fontSize(11).fillColor('#0f172a').text(head);
      }
      const mark =
        a.status === 'DONE'
          ? '✓'
          : a.status === 'SKIPPED'
            ? '↦'
            : a.status === 'BLOCKED'
              ? '⊘'
              : a.status === 'IN_PROGRESS'
                ? '▶'
                : '○';
      doc.fontSize(9).fillColor('#475569').text(
        `   ${mark} #${a.action_order} [${a.status}] ${String(a.instruction).slice(0, 140)}` +
          `${a.is_life_critical ? '  ⚡life-critical' : ''}` +
          `${a.completed_at ? `  · done ${fmt(a.completed_at as string)}` : ''}` +
          `${a.blocked_reason ? `  · blocked: ${a.blocked_reason}` : ''}`,
      );
    }

    H1('5. Evacuation decisions (immutable audit)');
    if (triggers.length === 0) body('No evacuation triggered.');
    for (const t of triggers) {
      const zc = Array.isArray(t.zones_affected) ? (t.zones_affected as unknown[]).length : 0;
      doc.fontSize(9).fillColor('#94a3b8').text(fmt(t.triggered_at as string), { continued: true })
        .fillColor('#b91c1c')
        .text(`   ${String(t.trigger_type).replace(/_/g, ' ')} · ${zc} zone(s)`, { continued: true })
        .fillColor('#64748b').text(`   by ${who(t.triggered_by as string)} (${t.triggered_by_role ?? '—'})`);
      doc.fontSize(9).fillColor('#334155').text(`      reason: ${t.reason_note}`);
      if (t.pa_text_broadcast || t.pa_text_generated) {
        doc.fontSize(8).fillColor('#64748b').text(`      PA: ${t.pa_text_broadcast ?? t.pa_text_generated}`);
      }
    }

    H1('6. Photo evidence ledger');
    if (evidence.length === 0) body('No photo evidence posted.');
    for (const ev of evidence) {
      const pn = (ev as { staff?: { name?: string } }).staff?.name ?? ev.posted_by_role ?? 'Staff';
      doc.fontSize(9).fillColor('#94a3b8').text(fmt(ev.created_at as string), { continued: true })
        .fillColor('#0f172a').text(`   ${pn}`, { continued: true })
        .fillColor('#64748b').text(`${ev.caption ? ` · ${ev.caption}` : ''}`);
      doc.fontSize(7).fillColor('#3b82f6').text(`      ${ev.evidence_url}`, {
        link: String(ev.evidence_url),
        underline: true,
      });
    }
  }

  // ── Footer on every page: 'Powered by SafeCommand' (EC-18/Rule 20) ──
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const y = doc.page.height - 40;
    doc.fontSize(8).fillColor('#94a3b8').text(
      `${POWERED_BY}   ·   Generated ${fmt(new Date().toISOString())}   ·   Page ${i + 1} of ${range.count}`,
      50,
      y,
      { align: 'center', width: doc.page.width - 100, lineBreak: false },
    );
  }

  doc.end();
  const buffer = await done;
  logger.info({ incidentId, bytes: buffer.length, isSire }, 'BR-29 incident report rendered');
  return { buffer, incidentRef };
}
