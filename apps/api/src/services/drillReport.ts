/**
 * BR-A — Per-drill Fire NOC / mock-evacuation report (server-rendered PDF).
 *
 * The drill-level sibling of BR-29 (incident) and BR-20 (venue-wide):
 * a timed, authority-oriented record of a single drill — schedule vs
 * actual, participation matrix with the ADR-0004 non-acknowledgement
 * reason taxonomy, and the append-only audit timeline. Fire-NOC framed
 * (NBC 2016 Part 4 · Telangana Fire Service FF-3 · NFPA 1620 · NABH §EM).
 *
 * On-demand only. The auto-generate-on-completion hook is a separate,
 * worker-gated concern (June) and is explicitly NOT this. `drill_sessions`
 * already carries a `report_pdf_url` column (mig 010) — the route upserts
 * the generated key there; no migration.
 *
 * 'Powered by SafeCommand' is stamped on every page footer — non-removable
 * per EC-18 / Hard Rule 20 (literal string in code). No worker dependency.
 * venue-scoped on every query (Rule 2).
 */

import PDFDocument from 'pdfkit';
import { getServiceClient } from '@safecommand/db';
import { logger } from './logger.js';

const POWERED_BY = 'Powered by SafeCommand'; // EC-18 / Rule 20 — literal, non-removable

// Mirrors the ADR-0004 taxonomy in routes/drills.ts (single source of the
// labels for the human-readable PDF; codes themselves stay the contract).
const REASON_LABEL: Record<string, string> = {
  OFF_DUTY: 'Off duty',
  ON_LEAVE: 'On leave',
  ON_BREAK: 'On break',
  ON_DUTY_ELSEWHERE: 'On duty elsewhere',
  DEVICE_OR_NETWORK_ISSUE: 'Device / network issue',
  OTHER: 'Other',
};

interface BuildResult {
  buffer: Buffer;
  /** Short human ref for filenames / audit log. */
  drillRef: string;
}

type StaffLite = { id?: string; name: string; role: string };

interface DrillRow {
  id: string;
  drill_type: string;
  status: string;
  scheduled_for: string;
  started_at: string | null;
  ended_at: string | null;
  started_by_staff_id: string | null;
  duration_seconds: number | null;
  total_staff_expected: number;
  total_staff_acknowledged: number;
  total_staff_safe: number;
  total_staff_missed: number;
  notes: string | null;
}

interface ParticipantRow {
  staff_id: string;
  status: string;
  notified_at: string | null;
  acknowledged_at: string | null;
  safe_confirmed_at: string | null;
  ack_latency_seconds: number | null;
  reason_code: string | null;
  reason_notes: string | null;
  staff: StaffLite | null;
  reason_setter: StaffLite | null;
}

interface AuditRow {
  action: string;
  actor_role: string | null;
  actor_staff_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  actor: StaffLite | null;
}

function fmt(ts: string | null | undefined): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

function durationStr(seconds: number | null, from: string | null, to: string | null): string {
  let s = seconds;
  if (s == null && from && to) {
    const ms = new Date(to).getTime() - new Date(from).getTime();
    if (!Number.isNaN(ms) && ms >= 0) s = Math.round(ms / 1000);
  }
  if (s == null || s < 0) return '—';
  const m = Math.floor(s / 60);
  return m < 60 ? `${m} min ${s % 60}s` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

/** Mirrors isExcused() in routes/drills.ts (ADR 0004). */
function isExcused(p: ParticipantRow): boolean {
  if (p.reason_code === null) return false;
  if (p.reason_code === 'OTHER') return !!(p.reason_notes && p.reason_notes.trim().length >= 10);
  return true;
}

/**
 * Fetch the drill, its participants (full view — this is an auditor
 * artefact; the route is role-gated) and the append-only audit timeline,
 * then render. Returns null if the drill is not in the caller's venue.
 */
export async function buildDrillReportPdf(
  drillId: string,
  venueId: string,
): Promise<BuildResult | null> {
  const db = getServiceClient();

  const { data: drillRaw, error: drillErr } = await db
    .from('drill_sessions')
    .select(
      'id, drill_type, status, scheduled_for, started_at, ended_at, started_by_staff_id, ' +
        'duration_seconds, total_staff_expected, total_staff_acknowledged, ' +
        'total_staff_safe, total_staff_missed, notes',
    )
    .eq('id', drillId)
    .eq('venue_id', venueId)
    .single();
  if (drillErr || !drillRaw) return null;
  const drill = drillRaw as unknown as DrillRow;

  const { data: vRow } = await db
    .from('venues')
    .select('name, venue_code, type')
    .eq('id', venueId)
    .single();
  const venue = (vRow as unknown as { name: string; venue_code: string; type: string } | null) ?? {
    name: 'Venue',
    venue_code: '—',
    type: '—',
  };

  const { data: partRaw } = await db
    .from('drill_session_participants')
    .select(
      'staff_id, status, notified_at, acknowledged_at, safe_confirmed_at, ' +
        'ack_latency_seconds, reason_code, reason_notes, ' +
        'staff:staff!staff_id(id, name, role), ' +
        'reason_setter:staff!reason_set_by(id, name, role)',
    )
    .eq('drill_session_id', drillId)
    .order('notified_at', { ascending: true });
  const participants = (partRaw ?? []) as unknown as ParticipantRow[];

  const { data: auditRaw } = await db
    .from('audit_logs')
    .select(
      'action, actor_role, actor_staff_id, metadata, created_at, actor:staff(id, name, role)',
    )
    .eq('venue_id', venueId)
    .eq('entity_id', drillId)
    .order('created_at', { ascending: true });
  const timeline = (auditRaw ?? []) as unknown as AuditRow[];

  let conductor = '—';
  if (drill.started_by_staff_id) {
    const { data: s } = await db
      .from('staff')
      .select('name, role')
      .eq('id', drill.started_by_staff_id)
      .eq('venue_id', venueId)
      .single();
    const sl = s as unknown as StaffLite | null;
    if (sl) conductor = `${sl.name} (${sl.role})`;
  }

  // ── Derived ──
  const counts = participants.reduce(
    (a, p) => {
      a.total++;
      if (p.status === 'ACKNOWLEDGED') a.ack++;
      else if (p.status === 'SAFE_CONFIRMED') a.safe++;
      else if (p.status === 'MISSED') a.missed++;
      else if (p.status === 'NOTIFIED') a.notified++;
      if (isExcused(p)) a.excused++;
      return a;
    },
    { total: 0, ack: 0, safe: 0, missed: 0, notified: 0, excused: 0 },
  );
  const usingLive = counts.total > 0;
  const expected = usingLive ? counts.total : drill.total_staff_expected;
  const responded = usingLive ? counts.ack + counts.safe : drill.total_staff_acknowledged + drill.total_staff_safe;
  const missed = usingLive ? counts.missed : drill.total_staff_missed;
  const participationPct = expected > 0 ? Math.round((responded / expected) * 100) : null;

  const drillRef = `DRILL-${drill.drill_type}-${String(drill.id).slice(0, 8).toUpperCase()}`;

  // ── Render ──
  const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });

  const H1 = (t: string) =>
    doc.moveDown(0.6).fontSize(14).fillColor('#0f172a').text(t).moveDown(0.2);
  const row = (k: string, v: string) =>
    doc.fontSize(10).fillColor('#475569').text(`${k}: `, { continued: true })
      .fillColor('#0f172a').text(v);
  const body = (t: string) => doc.fontSize(10).fillColor('#334155').text(t);
  const line = (t: string, color = '#334155') => doc.fontSize(9).fillColor(color).text(t);

  doc.fontSize(20).fillColor('#b91c1c').text('Fire Drill / Mock Evacuation Report');
  doc.fontSize(11).fillColor('#64748b').text(`${venue.name}  ·  ${venue.venue_code}  ·  ${drillRef}`);
  doc.moveDown(0.5);

  H1('1. Drill particulars');
  row('Venue', `${venue.name} (${venue.type})`);
  row('Drill type', drill.drill_type.replace(/_/g, ' '));
  row('Status', drill.status);
  row('Scheduled for', fmt(drill.scheduled_for));
  row('Started', fmt(drill.started_at));
  row('Ended', fmt(drill.ended_at));
  row('Duration', durationStr(drill.duration_seconds, drill.started_at, drill.ended_at));
  row('Conducted by', conductor);
  row('Standards basis',
    'NBC 2016 Part 4 · Telangana Fire Service FF-3 · NFPA 1620 · NABH §EM');
  if (drill.notes) {
    doc.moveDown(0.3);
    body(`Notes: ${drill.notes}`);
  }

  H1('2. Participation summary');
  row('Expected', String(expected));
  row('Responded (acknowledged + safe)', `${responded}${participationPct != null ? ` (${participationPct}%)` : ''}`);
  row('Did not acknowledge', String(missed));
  row('Excused (with logged reason)', String(counts.excused));
  row('Unexcused', String(Math.max(0, missed - counts.excused)));
  doc.moveDown(0.2);
  line(
    `Source: ${usingLive ? 'live participant rows (Phase 5.18 tracking)' : 'denormalised drill counters (pre-5.18 drill)'}`,
    '#94a3b8',
  );

  H1(`3. Participation matrix (${participants.length})`);
  if (participants.length === 0) body('No per-participant rows recorded for this drill.');
  for (const p of participants) {
    const sn = p.staff ? `${p.staff.name} (${p.staff.role})` : String(p.staff_id).slice(0, 8);
    const ex = p.status === 'MISSED' ? (isExcused(p) ? ' · EXCUSED' : ' · UNEXCUSED') : '';
    const color =
      p.status === 'MISSED' && !isExcused(p)
        ? '#b91c1c'
        : p.status === 'SAFE_CONFIRMED'
          ? '#166534'
          : '#334155';
    line(
      `   ${sn} — ${p.status.replace(/_/g, ' ')}${ex}` +
        `${p.ack_latency_seconds != null ? ` · ack ${p.ack_latency_seconds}s` : ''}` +
        `${p.acknowledged_at ? ` · ack ${fmt(p.acknowledged_at)}` : ''}` +
        `${p.safe_confirmed_at ? ` · safe ${fmt(p.safe_confirmed_at)}` : ''}`,
      color,
    );
    if (p.status === 'MISSED' && p.reason_code) {
      const setter = p.reason_setter ? ` (set by ${p.reason_setter.name})` : '';
      line(
        `      reason: ${REASON_LABEL[p.reason_code] ?? p.reason_code}` +
          `${p.reason_notes ? ` — ${p.reason_notes}` : ''}${setter}`,
        '#92400e',
      );
    }
  }

  H1('4. Audit timeline (append-only)');
  if (timeline.length === 0) body('No audit events recorded.');
  for (const e of timeline) {
    const actor = e.actor
      ? `${e.actor.name} (${e.actor.role})`
      : e.actor_role ?? (e.actor_staff_id ? String(e.actor_staff_id).slice(0, 8) : 'System');
    doc.fontSize(9).fillColor('#94a3b8').text(fmt(e.created_at), { continued: true })
      .fillColor('#0f172a').text(`   ${e.action.replace(/_/g, ' ')}`, { continued: true })
      .fillColor('#64748b').text(`   — ${actor}`);
  }

  H1('5. Attestation');
  body(
    `This is a system-generated record of the above drill for ${venue.name} ` +
      `(${venue.venue_code}), derived from immutable operational data captured at the ` +
      `time of the drill. The audit timeline is append-only and tamper-evident ` +
      `(Hard Rule 4). This report is suitable for Fire NOC renewal, NABH §EM ` +
      `evidence, and insurer submission; it is not a substitute for statutory inspection.`,
  );
  doc.moveDown(1.2);
  doc.fontSize(9).fillColor('#475569').text('Drill Conductor: ______________________________     Date: ____________');
  doc.moveDown(0.8);
  doc.fontSize(9).fillColor('#475569').text('Fire / Safety Officer: ___________________________     Date: ____________');
  doc.moveDown(0.8);
  doc.fontSize(9).fillColor('#475569').text('Security Head: ________________________________     Date: ____________');

  // ── Footer every page: 'Powered by SafeCommand' (EC-18/Rule 20) ──
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const y = doc.page.height - 40;
    doc.fontSize(8).fillColor('#94a3b8').text(
      `${POWERED_BY}   ·   ${drillRef}   ·   Page ${i + 1} of ${range.count}`,
      50,
      y,
      { align: 'center', width: doc.page.width - 100, lineBreak: false },
    );
  }

  doc.end();
  const buffer = await done;
  logger.info(
    { drillId, venueId, bytes: buffer.length, participants: participants.length },
    'BR-A drill Fire NOC report rendered',
  );
  return { buffer, drillRef };
}
