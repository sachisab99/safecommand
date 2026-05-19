/**
 * BR-20 — Venue-wide compliance export (server-rendered PDF).
 *
 * The procurement / audit closer: a single, date-ranged, authority-oriented
 * PDF of a venue's regulatory posture, assembled from the same immutable
 * sources the live product runs on (drills + participants, fire-equipment
 * register, staff certifications, incident + SIRE evacuation audit, safety
 * health score). Three framings:
 *
 *   FIRE_NOC   — NBC 2016 Part 4 · Telangana Fire Service (FF-3) · NFPA
 *                101/1620 · NDMA. Mock-drill register + fire-equipment
 *                register + fire-safety certs + FIRE/EVACUATION incident
 *                log with the immutable evacuation-trigger audit.
 *   NABH       — NABH 6th Edition §FMS + §EM. Emergency-preparedness
 *                drills + equipment posture + staff competence + incident
 *                response + safety health score.
 *   FULL_AUDIT — composite (NBC / NABH / NFPA / OSHA / insurance): health
 *                score breakdown + every register + all incidents.
 *
 * Capstone of the report family: BR-29 = one incident; BR-31 = analytics
 * screen; BR-20 = the downloadable venue-wide posture document.
 *
 * 'Powered by SafeCommand' is stamped on every page footer — non-removable
 * per EC-18 / Hard Rule 20 (literal string in code).
 *
 * No worker dependency — invoked synchronously from the route. No schema
 * change — reads existing tables only. Venue-scoped on every query (Rule 2).
 */

import PDFDocument from 'pdfkit';
import { getServiceClient } from '@safecommand/db';
import { logger } from './logger.js';

const POWERED_BY = 'Powered by SafeCommand'; // EC-18 / Rule 20 — literal, non-removable

export type ComplianceReportType = 'FIRE_NOC' | 'NABH' | 'FULL_AUDIT';

interface BuildResult {
  buffer: Buffer;
  /** Short human ref for filenames / audit log. */
  reportRef: string;
}

const TITLE: Record<ComplianceReportType, string> = {
  FIRE_NOC: 'Fire Safety Compliance Report',
  NABH: 'NABH Emergency Preparedness Report',
  FULL_AUDIT: 'Full Safety & Compliance Audit',
};

const STANDARDS_BASIS: Record<ComplianceReportType, string> = {
  FIRE_NOC:
    'NBC 2016 Part 4 · Telangana Fire Service Form FF-3 · NFPA 101 / NFPA 1620 · NDMA Fire Safety Guidelines',
  NABH: 'NABH 6th Edition — §FMS (Facility Management & Safety) + §EM (Emergency Management)',
  FULL_AUDIT:
    'Composite — NBC 2016 · NABH 6th · NFPA 101/1620 · OSHA 1910.38 · insurance schedule',
};

type StatusBucket = 'OK' | 'DUE_90' | 'DUE_30' | 'DUE_7' | 'EXPIRED';

function fmt(ts: string | null | undefined): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}
function fmtDate(ts: string | null | undefined): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
}

/** Days from today (IST midnight) to a DATE string; negative = past. */
function daysUntil(dateStr: string | null | undefined, todayMs: number): number | null {
  if (!dateStr) return null;
  const t = new Date(`${dateStr}T00:00:00.000Z`).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((t - todayMs) / 86_400_000);
}
function bucketOf(days: number | null): StatusBucket {
  if (days === null) return 'OK';
  if (days < 0) return 'EXPIRED';
  if (days <= 7) return 'DUE_7';
  if (days <= 30) return 'DUE_30';
  if (days <= 90) return 'DUE_90';
  return 'OK';
}
const BUCKET_LABEL: Record<StatusBucket, string> = {
  OK: 'OK',
  DUE_90: 'Due ≤90d',
  DUE_30: 'Due ≤30d',
  DUE_7: 'Due ≤7d',
  EXPIRED: 'EXPIRED / OVERDUE',
};

interface VenueRow {
  id: string;
  venue_code: string;
  name: string;
  type: string;
  city: string;
  address: string | null;
  subscription_tier: string;
}

/**
 * Fetch everything in [fromISO, toISO] and render. Returns null if the
 * venue is not found (caller maps to 404).
 */
export async function buildComplianceReportPdf(
  type: ComplianceReportType,
  venueId: string,
  fromISO: string,
  toISO: string,
): Promise<BuildResult | null> {
  const db = getServiceClient();
  const todayMs = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z').getTime();

  // ── Venue identity ──
  const { data: vRow, error: vErr } = await db
    .from('venues')
    .select('id, venue_code, name, type, city, address, subscription_tier')
    .eq('id', venueId)
    .single();
  if (vErr || !vRow) return null;
  const venue = vRow as unknown as VenueRow;

  // ── Drills in period (+ participants for non-ack reason breakdown) ──
  const { data: drillRows } = await db
    .from('drill_sessions')
    .select(
      'id, drill_type, status, scheduled_for, started_at, ended_at, duration_seconds, ' +
        'total_staff_expected, total_staff_acknowledged, total_staff_safe, total_staff_missed, notes',
    )
    .eq('venue_id', venueId)
    .gte('scheduled_for', fromISO)
    .lte('scheduled_for', toISO)
    .order('scheduled_for', { ascending: false });
  const drills = (drillRows ?? []) as unknown as Array<{
    id: string;
    drill_type: string;
    status: string;
    scheduled_for: string;
    started_at: string | null;
    ended_at: string | null;
    duration_seconds: number | null;
    total_staff_expected: number;
    total_staff_acknowledged: number;
    total_staff_safe: number;
    total_staff_missed: number;
    notes: string | null;
  }>;

  const reasonBreakdown: Record<string, number> = {};
  if (drills.length > 0) {
    const { data: parts } = await db
      .from('drill_session_participants')
      .select('status, reason_code')
      .in('drill_session_id', drills.map((d) => d.id));
    for (const p of (parts ?? []) as unknown as Array<{
      status: string;
      reason_code: string | null;
    }>) {
      if (p.status === 'MISSED') {
        const k = p.reason_code ?? 'UNEXCUSED';
        reasonBreakdown[k] = (reasonBreakdown[k] ?? 0) + 1;
      }
    }
  }

  // ── Fire-equipment register (current posture — point in time) ──
  const { data: equipRows } = await db
    .from('equipment_items')
    .select('name, category, location_description, last_serviced_at, next_service_due')
    .eq('venue_id', venueId)
    .eq('is_active', true)
    .order('next_service_due', { ascending: true });
  const equipment = (equipRows ?? []) as unknown as Array<{
    name: string;
    category: string;
    location_description: string | null;
    last_serviced_at: string | null;
    next_service_due: string;
  }>;

  // ── Staff certifications (current posture) ──
  const { data: certRows } = await db
    .from('staff_certifications')
    .select('certification_name, issued_at, expires_at, staff(name, role)')
    .eq('venue_id', venueId)
    .order('expires_at', { ascending: true });
  const certs = (certRows ?? []) as unknown as Array<{
    certification_name: string;
    issued_at: string;
    expires_at: string;
    staff: { name: string; role: string } | null;
  }>;

  // ── Incidents in period ──
  const { data: incRows } = await db
    .from('incidents')
    .select(
      'id, incident_type, incident_subtype, severity, status, declared_at, resolved_at, ' +
        'has_sire_data, is_drill, zones(name)',
    )
    .eq('venue_id', venueId)
    .gte('declared_at', fromISO)
    .lte('declared_at', toISO)
    .order('declared_at', { ascending: false });
  const incidents = (incRows ?? []) as unknown as Array<{
    id: string;
    incident_type: string;
    incident_subtype: string | null;
    severity: string;
    status: string;
    declared_at: string;
    resolved_at: string | null;
    has_sire_data: boolean | null;
    is_drill: boolean | null;
    zones: { name: string } | null;
  }>;

  // ── Evacuation-trigger audit in period (immutable; Hard Rule 4) ──
  const { data: trigRows } = await db
    .from('incident_evacuation_triggers')
    .select('trigger_type, triggered_by_role, zones_affected, reason_note, triggered_at')
    .eq('venue_id', venueId)
    .gte('triggered_at', fromISO)
    .lte('triggered_at', toISO)
    .order('triggered_at', { ascending: true });
  const triggers = (trigRows ?? []) as unknown as Array<{
    trigger_type: string;
    triggered_by_role: string | null;
    zones_affected: unknown;
    reason_note: string | null;
    triggered_at: string;
  }>;

  // ── Derived posture ──
  const tally = <T,>(arr: T[], pick: (x: T) => string): Record<string, number> => {
    const o: Record<string, number> = {};
    for (const r of arr) {
      const k = pick(r);
      o[k] = (o[k] ?? 0) + 1;
    }
    return o;
  };

  const equipByBucket: Record<StatusBucket, number> = {
    OK: 0, DUE_90: 0, DUE_30: 0, DUE_7: 0, EXPIRED: 0,
  };
  for (const e of equipment) equipByBucket[bucketOf(daysUntil(e.next_service_due, todayMs))]++;
  const equipScore =
    equipment.length === 0 ? 100 : Math.round((equipByBucket.OK / equipment.length) * 100);

  const certByBucket: Record<StatusBucket, number> = {
    OK: 0, DUE_90: 0, DUE_30: 0, DUE_7: 0, EXPIRED: 0,
  };
  for (const c of certs) certByBucket[bucketOf(daysUntil(c.expires_at, todayMs))]++;
  const certScore = certs.length === 0 ? 100 : Math.round((certByBucket.OK / certs.length) * 100);

  const completedDrills = drills
    .filter((d) => d.status === 'COMPLETED' && d.ended_at)
    .sort((a, b) => (b.ended_at ?? '').localeCompare(a.ended_at ?? ''));
  const lastDrillDays =
    completedDrills[0]?.ended_at != null
      ? Math.floor((todayMs - new Date(completedDrills[0].ended_at).getTime()) / 86_400_000)
      : null;
  const drillScore =
    lastDrillDays === null
      ? 0
      : lastDrillDays <= 90 ? 100
      : lastDrillDays <= 180 ? 75
      : lastDrillDays <= 270 ? 50
      : lastDrillDays <= 365 ? 25
      : 0;

  const sev1 = incidents.filter((i) => i.severity === 'SEV1').length;
  const sev2 = incidents.filter((i) => i.severity === 'SEV2').length;
  const openIncidents = incidents.filter(
    (i) => i.status === 'ACTIVE' || i.status === 'CONTAINED',
  ).length;
  const healthScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        equipScore * 0.1 + certScore * 0.15 + drillScore * 0.1 + (40 + 25) - (sev1 * 20 + sev2 * 10),
      ),
    ),
  );

  // ── Render ──
  const ref = `${type}-${venue.venue_code}-${fromISO.slice(0, 10)}_${toISO.slice(0, 10)}`;
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
  const muted = (t: string) => doc.fontSize(9).fillColor('#94a3b8').text(t);
  const line = (t: string, color = '#334155') => doc.fontSize(9).fillColor(color).text(t);

  // Cover
  doc.fontSize(20).fillColor('#b91c1c').text(TITLE[type]);
  doc.fontSize(11).fillColor('#64748b').text(`${venue.name}  ·  ${venue.venue_code}`);
  doc.moveDown(0.5);
  H1('Venue & report');
  row('Venue', `${venue.name} (${venue.type})`);
  row('Venue code', venue.venue_code);
  row('Location', `${venue.city}${venue.address ? ` · ${venue.address}` : ''}`);
  row('Subscription', venue.subscription_tier);
  row('Reporting period', `${fmtDate(fromISO)} → ${fmtDate(toISO)}`);
  row('Generated', fmt(new Date().toISOString()));
  row('Standards basis', STANDARDS_BASIS[type]);
  doc.moveDown(0.3);
  muted(
    'System-generated from immutable operational records (drills, equipment, ' +
      'certifications, incident & evacuation audit). Source-derived and ' +
      'tamper-evident; not a substitute for statutory inspection.',
  );

  const showHealth = type === 'NABH' || type === 'FULL_AUDIT';
  // FIRE_NOC is a fire document → FIRE/EVACUATION only. NABH §EM + the full
  // audit cover every emergency type.
  const showAllIncidents = type !== 'FIRE_NOC';

  if (showHealth) {
    H1('A. Safety health score');
    row('Composite score', `${healthScore} / 100`);
    line(
      `Equipment ${equipScore} · Certifications ${certScore} · Drill recency ${drillScore} · ` +
        `Open incidents ${openIncidents} (SEV1 ${sev1} / SEV2 ${sev2})`,
      '#475569',
    );
  }

  // Section letters shift if health section present
  const L = (i: number) => String.fromCharCode((showHealth ? 66 : 65) + i); // B.. or A..

  H1(`${L(0)}. Emergency / mock-drill register (${drills.length})`);
  if (drills.length === 0) body('No drills recorded in this period.');
  for (const d of drills) {
    const pct =
      d.total_staff_expected > 0
        ? Math.round(
            ((d.total_staff_acknowledged + d.total_staff_safe) / d.total_staff_expected) * 100,
          )
        : null;
    doc.fontSize(10).fillColor('#0f172a').text(
      `${d.drill_type.replace(/_/g, ' ')} — ${d.status}`,
    );
    line(
      `   scheduled ${fmt(d.scheduled_for)} · started ${fmt(d.started_at)} · ended ${fmt(d.ended_at)}` +
        `${d.duration_seconds != null ? ` · ${Math.round(d.duration_seconds / 60)} min` : ''}`,
      '#64748b',
    );
    line(
      `   participation: ${d.total_staff_acknowledged + d.total_staff_safe}/${d.total_staff_expected}` +
        `${pct != null ? ` (${pct}%)` : ''} · missed ${d.total_staff_missed}`,
      '#475569',
    );
    if (d.notes) line(`   notes: ${d.notes}`, '#64748b');
  }
  if (Object.keys(reasonBreakdown).length > 0) {
    doc.moveDown(0.2);
    line(
      'Non-acknowledgement reasons: ' +
        Object.entries(reasonBreakdown)
          .sort((a, b) => b[1] - a[1])
          .map(([k, v]) => `${k.replace(/_/g, ' ')} ×${v}`)
          .join('  ·  '),
      '#92400e',
    );
  }

  H1(`${L(1)}. Fire-equipment register (${equipment.length} active)`);
  line(
    `Posture: OK ${equipByBucket.OK} · ≤90d ${equipByBucket.DUE_90} · ≤30d ${equipByBucket.DUE_30}` +
      ` · ≤7d ${equipByBucket.DUE_7} · overdue ${equipByBucket.EXPIRED}  →  score ${equipScore}/100`,
    '#475569',
  );
  doc.moveDown(0.2);
  if (equipment.length === 0) body('No active equipment registered.');
  for (const e of equipment) {
    const b = bucketOf(daysUntil(e.next_service_due, todayMs));
    const color = b === 'EXPIRED' ? '#b91c1c' : b === 'DUE_7' || b === 'DUE_30' ? '#92400e' : '#334155';
    line(
      `   ${e.name} [${e.category}]${e.location_description ? ` · ${e.location_description}` : ''}` +
        ` — serviced ${fmtDate(e.last_serviced_at)}, due ${fmtDate(e.next_service_due)} · ${BUCKET_LABEL[b]}`,
      color,
    );
  }

  H1(`${L(2)}. Staff safety certifications (${certs.length})`);
  line(
    `Posture: OK ${certByBucket.OK} · ≤90d ${certByBucket.DUE_90} · ≤30d ${certByBucket.DUE_30}` +
      ` · ≤7d ${certByBucket.DUE_7} · expired ${certByBucket.EXPIRED}  →  score ${certScore}/100`,
    '#475569',
  );
  doc.moveDown(0.2);
  if (certs.length === 0) body('No certifications recorded.');
  for (const c of certs) {
    const b = bucketOf(daysUntil(c.expires_at, todayMs));
    const color = b === 'EXPIRED' ? '#b91c1c' : b === 'DUE_7' || b === 'DUE_30' ? '#92400e' : '#334155';
    const sn = c.staff ? `${c.staff.name} (${c.staff.role})` : 'Unassigned';
    line(
      `   ${sn} — ${c.certification_name}: issued ${fmtDate(c.issued_at)}, ` +
        `expires ${fmtDate(c.expires_at)} · ${BUCKET_LABEL[b]}`,
      color,
    );
  }

  const incForReport = showAllIncidents
    ? incidents
    : incidents.filter(
        (i) => i.incident_type === 'FIRE' || i.incident_type === 'EVACUATION',
      );
  H1(
    `${L(3)}. ${showAllIncidents ? 'Incident' : 'Fire / evacuation incident'} log ` +
      `(${incForReport.length}${showAllIncidents ? '' : ` of ${incidents.length} total`})`,
  );
  if (incidents.length > 0) {
    line(
      `By type: ${Object.entries(tally(incidents, (i) => i.incident_type))
        .map(([k, v]) => `${k} ${v}`)
        .join(' · ')}  |  by severity: SEV1 ${sev1} · SEV2 ${sev2} · ` +
        `SEV3 ${incidents.length - sev1 - sev2}`,
      '#475569',
    );
    doc.moveDown(0.2);
  }
  if (incForReport.length === 0) body('No qualifying incidents in this period.');
  for (const i of incForReport) {
    const zn = i.zones?.name ?? 'Venue-wide';
    line(
      `   ${fmt(i.declared_at)} — ${i.incident_type}` +
        `${i.incident_subtype ? `/${i.incident_subtype}` : ''} · ${i.severity} · ${i.status}` +
        ` · ${zn}${i.is_drill ? ' · DRILL' : ''}` +
        `${i.has_sire_data ? ' · SIRE' : ''}` +
        `${i.resolved_at ? ` · resolved ${fmt(i.resolved_at)}` : ''}`,
      i.severity === 'SEV1' ? '#b91c1c' : '#334155',
    );
  }

  H1(`${L(4)}. Evacuation decisions — immutable audit (${triggers.length})`);
  if (triggers.length === 0) body('No evacuations triggered in this period.');
  for (const t of triggers) {
    const zc = Array.isArray(t.zones_affected) ? (t.zones_affected as unknown[]).length : 0;
    line(
      `   ${fmt(t.triggered_at)} — ${t.trigger_type.replace(/_/g, ' ')} · ${zc} zone(s)` +
        ` · by ${t.triggered_by_role ?? '—'}`,
      '#b91c1c',
    );
    if (t.reason_note) line(`      reason: ${t.reason_note}`, '#64748b');
  }

  H1(`${L(5)}. Attestation`);
  body(
    `This report covers ${venue.name} (${venue.venue_code}) for the period ` +
      `${fmtDate(fromISO)} to ${fmtDate(toISO)}. Records are derived from the ` +
      `SafeCommand operational system and reflect the data captured at generation time. ` +
      `Append-only audit tables (incident timeline, zone-state log, evacuation triggers) ` +
      `are tamper-evident by design (Hard Rule 4).`,
  );
  doc.moveDown(1.2);
  doc.fontSize(9).fillColor('#475569').text('Reviewed by (Safety Officer): ____________________________     Date: ____________');
  doc.moveDown(0.8);
  doc.fontSize(9).fillColor('#475569').text(
    type === 'FIRE_NOC'
      ? 'Verified by (Fire Officer): ____________________________     Date: ____________'
      : type === 'NABH'
        ? 'Verified by (NABH Coordinator): ________________________     Date: ____________'
        : 'Verified by (Auditor): _________________________________     Date: ____________',
  );

  // ── Footer on every page: 'Powered by SafeCommand' (EC-18/Rule 20) ──
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
    { venueId, type, bytes: buffer.length, drills: drills.length, incidents: incidents.length },
    'BR-20 compliance report rendered',
  );
  return { buffer, reportRef: ref };
}
