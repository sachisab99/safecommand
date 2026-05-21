/**
 * BR-AU Roster Compliance PDF Renderer
 * (Pattern Engine Pass 6 — Phase 5.24).
 *
 * Generates the published-duty-roster compliance artifact from a
 * PUBLISHED roster_pattern. Four authority formats — same underlying
 * data, format-specific framing block:
 *
 *   NABH_HRM             — NABH 6th HRM.4.a (published duty roster
 *                          accessible to staff). Hospital-leaning but
 *                          venue-type-agnostic.
 *   FIRE_NOC_DUTY_ROSTER — Telangana Fire Service duty-roster
 *                          requirement; cites the Fire NOC inspection
 *                          context.
 *   INSURANCE_PACK       — Workers'-comp / liability insurance evidence
 *                          pack; emphasises Factories Act §51 (weekly
 *                          hours) compliance + signing-off chain.
 *   GENERIC              — Clean printable, no authority framing.
 *
 * Architecture mirrors sireComplianceExport.ts (mig 014 SIRE PDF):
 *   • PDFKit on the server
 *   • Per-page footer with 'Powered by SafeCommand' literal (EC-18 /
 *     Rule 20 — non-removable)
 *   • Returns Buffer + short ref for filename / audit trail
 *
 * Data source: roster_patterns + staff_roster_assignments +
 * roster_cycle_positions + shifts (mig 022). venue-scoped on every
 * query (Rule 2 / EC-03). Only PUBLISHED + SUSPENDED + ARCHIVED
 * patterns are eligible (DRAFT can be exported with a watermark).
 *
 * No new schema, no worker — on-demand only (parallels SIRE-EXPORT
 * + BR-A drill PDF + BR-20 venue compliance PDF in scoping discipline).
 */

import PDFDocument from 'pdfkit';
import { getServiceClient } from '@safecommand/db';
import { logger } from './logger.js';

const POWERED_BY = 'Powered by SafeCommand'; // EC-18 / Rule 20

export const ROSTER_COMPLIANCE_FORMATS = [
  'NABH_HRM',
  'FIRE_NOC_DUTY_ROSTER',
  'INSURANCE_PACK',
  'GENERIC',
] as const;
export type RosterComplianceFormat = typeof ROSTER_COMPLIANCE_FORMATS[number];

interface BuildResult {
  buffer: Buffer;
  ref: string;
}

interface PatternRow {
  id: string;
  venue_id: string;
  name: string;
  cycle_type: string;
  cycle_length_days: number;
  rotation_pattern_code: string | null;
  effective_from: string;
  effective_to: string | null;
  status: string;
  published_at: string | null;
  published_by_staff_id: string | null;
  signed_off_at: string | null;
  signed_off_by_staff_id: string | null;
  created_at: string;
}

interface StaffAssignRow {
  staff_id: string;
  weekly_off_pattern: string;
  weekly_off_day: number | null;
  weekly_max_hours: number;
  daily_max_hours: number;
}

interface CyclePositionRow {
  staff_id: string;
  cycle_position: number;
  shift_id: string | null;
}

interface ShiftRow {
  id: string;
  name: string | null;
  start_time: string;
  end_time: string;
  is_overnight: boolean | null;
}

interface StaffMetaRow {
  id: string;
  name: string;
  role: string;
}

// ─── UX text helpers ────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return iso.slice(0, 10);
}

function fmtTimestamp(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

function durationMinutes(shift: { start_time: string; end_time: string; is_overnight: boolean | null }): number {
  const [sh, sm] = shift.start_time.split(':').map(Number);
  const [eh, em] = shift.end_time.split(':').map(Number);
  const startMin = (sh ?? 0) * 60 + (sm ?? 0);
  let endMin = (eh ?? 0) * 60 + (em ?? 0);
  if (shift.is_overnight || endMin < startMin) endMin += 24 * 60;
  return Math.max(0, endMin - startMin);
}

function shiftCellLabel(shift: ShiftRow): string {
  if (shift.name) return shift.name.slice(0, 6);
  const sh = parseInt(shift.start_time.slice(0, 2), 10);
  if (sh >= 0 && sh < 12) return 'AM';
  if (sh >= 12 && sh < 18) return 'PM';
  return 'NIGHT';
}

const WEEKLY_OFF_LABEL = {
  FIXED: 'Fixed',
  ROTATING_WEEKLY: 'Rotating wk',
  ROTATING_WITH_CYCLE: 'Rotating cyc',
} as const;

const DAY_OF_WEEK_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const FORMAT_TITLE: Record<RosterComplianceFormat, string> = {
  NABH_HRM:             'NABH 6th — HRM.4.a Published Duty Roster',
  FIRE_NOC_DUTY_ROSTER: 'Fire NOC — Duty Roster Compliance Record',
  INSURANCE_PACK:       'Insurance Compliance — Duty Roster & Hours Evidence',
  GENERIC:              'Published Duty Roster',
};

const FORMAT_FRAMING: Record<RosterComplianceFormat, { title: string; body: string }> = {
  NABH_HRM: {
    title: 'NABH 6th Edition compliance statement',
    body:
      'This published duty roster satisfies NABH 6th Edition HRM.4.a — ' +
      '"There is a duty roster for each staff category that is communicated and ' +
      'made available to staff and supervisors." It is the immutable record of ' +
      'the publish action (audit_logs entry PATTERN_PUBLISH at the timestamp above) ' +
      'derived from the roster_patterns + staff_roster_assignments + ' +
      'roster_cycle_positions tables. Per-staff weekly-off configuration and ' +
      'hour limits are listed below to demonstrate active management of ' +
      'staffing pattern variation. Not a substitute for accreditation assessment.',
  },
  FIRE_NOC_DUTY_ROSTER: {
    title: 'Fire NOC duty-roster compliance',
    body:
      'This roster covers fire-safety personnel on duty per the venue\'s active ' +
      'shift pattern. The cycle grid below documents the rotation each staff ' +
      'member follows; the Effective-from date establishes when this pattern ' +
      'took effect. Suitable for Fire NOC inspection evidence (Telangana Fire ' +
      'Service Form FF-3 supporting documentation) and for matching staff ' +
      'present in evacuation drill records against the published pattern.',
  },
  INSURANCE_PACK: {
    title: 'Insurance evidence — Factories Act §51 / §54 compliance',
    body:
      'This published roster is generated under the Factories Act 1948 §51 ' +
      '(48-hour week) and §54 (9-hour day) constraints — the pre-publish ' +
      'validation engine blocks any pattern that would exceed each staff ' +
      'member\'s configured weekly_max_hours or daily_max_hours. The per-staff ' +
      'limits table below shows the active caps. Sign-off (when present) is a ' +
      'second-signature event by an SH/DSH/GM, recorded in audit_logs as ' +
      'PATTERN_SIGN_OFF. Suitable as workers\' compensation / liability ' +
      'insurance evidence of active duty-roster governance.',
  },
  GENERIC: {
    title: 'About this document',
    body:
      'This published duty roster is the canonical record of who is scheduled ' +
      'to work which shift across the venue\'s active rotation cycle. It is ' +
      'generated on-demand from immutable roster_patterns / staff_roster_assignments / ' +
      'roster_cycle_positions records and reflects the state at the time of ' +
      'generation (timestamp at the bottom of every page).',
  },
};

// ────────────────────────────────────────────────────────────────────────
// Renderer

export async function buildRosterCompliancePdf(
  patternId: string,
  venueId: string,
  format: RosterComplianceFormat,
): Promise<BuildResult | null> {
  const db = getServiceClient();

  // Pattern + venue
  const patternRes = await db
    .from('roster_patterns')
    .select(
      'id, venue_id, name, cycle_type, cycle_length_days, rotation_pattern_code, ' +
        'effective_from, effective_to, status, published_at, published_by_staff_id, ' +
        'signed_off_at, signed_off_by_staff_id, created_at, venues(name, type, venue_code)',
    )
    .eq('id', patternId)
    .eq('venue_id', venueId)
    .single();
  if (patternRes.error || !patternRes.data) return null;
  const pattern = patternRes.data as unknown as PatternRow & {
    venues: { name: string; type: string; venue_code: string } | null;
  };

  // Staff assignments + cycle positions + shifts
  const [assignRes, posRes, shiftRes] = await Promise.all([
    db.from('staff_roster_assignments')
      .select('staff_id, weekly_off_pattern, weekly_off_day, weekly_max_hours, daily_max_hours')
      .eq('pattern_id', patternId)
      .eq('venue_id', venueId),
    db.from('roster_cycle_positions')
      .select('staff_id, cycle_position, shift_id')
      .eq('pattern_id', patternId)
      .eq('venue_id', venueId),
    db.from('shifts')
      .select('id, name, start_time, end_time, is_overnight')
      .eq('venue_id', venueId),
  ]);
  const assigns = (assignRes.data ?? []) as StaffAssignRow[];
  const positions = (posRes.data ?? []) as CyclePositionRow[];
  const shifts = (shiftRes.data ?? []) as ShiftRow[];

  // Staff metadata for the names + roles
  const staffIds = Array.from(new Set(assigns.map((a) => a.staff_id)));
  const staffRes = staffIds.length > 0
    ? await db.from('staff').select('id, name, role').in('id', staffIds).eq('venue_id', venueId)
    : { data: [] as StaffMetaRow[] };
  const staffMap = new Map<string, StaffMetaRow>(
    ((staffRes.data ?? []) as StaffMetaRow[]).map((s) => [s.id, s]),
  );

  // Signed-off-by + published-by staff names for the audit-chain header
  const additionalIds: string[] = [];
  if (pattern.published_by_staff_id) additionalIds.push(pattern.published_by_staff_id);
  if (pattern.signed_off_by_staff_id) additionalIds.push(pattern.signed_off_by_staff_id);
  const extraStaff = additionalIds.length > 0
    ? await db.from('staff').select('id, name, role').in('id', additionalIds).eq('venue_id', venueId)
    : { data: [] as StaffMetaRow[] };
  const extraStaffMap = new Map<string, StaffMetaRow>(
    ((extraStaff.data ?? []) as StaffMetaRow[]).map((s) => [s.id, s]),
  );

  // Index shifts + cycle positions
  const shiftsById = new Map<string, ShiftRow>(shifts.map((s) => [s.id, s]));
  // positionsByStaff[staffId][cycle_position] = shift_id | null
  const positionsByStaff = new Map<string, Map<number, string | null>>();
  for (const p of positions) {
    let m = positionsByStaff.get(p.staff_id);
    if (!m) { m = new Map(); positionsByStaff.set(p.staff_id, m); }
    m.set(p.cycle_position, p.shift_id);
  }

  // Sort staff by name for stable rendering
  const orderedAssigns = [...assigns].sort((a, b) => {
    const an = staffMap.get(a.staff_id)?.name ?? a.staff_id;
    const bn = staffMap.get(b.staff_id)?.name ?? b.staff_id;
    return an.localeCompare(bn);
  });

  const venueName = pattern.venues?.name ?? 'Venue';
  const venueCode = pattern.venues?.venue_code ?? '—';
  const venueType = pattern.venues?.type ?? '—';
  const isDraft = pattern.status === 'DRAFT';
  const ref = `${format}-${venueCode}-${String(pattern.id).slice(0, 8).toUpperCase()}`;

  // Total scheduled hours per staff (over one cycle) — for INSURANCE_PACK + footer stat
  function staffCycleMinutes(staffId: string): number {
    const m = positionsByStaff.get(staffId);
    if (!m) return 0;
    let total = 0;
    for (const sid of m.values()) {
      if (!sid) continue;
      const sh = shiftsById.get(sid);
      if (sh) total += durationMinutes(sh);
    }
    return total;
  }

  // ── Document ────────────────────────────────────────────────────────────
  // Cycles longer than 9 days get landscape; otherwise portrait. Keeps the
  // grid readable without per-cycle bespoke tweaks. (PDFKit can't switch
  // orientation mid-document; pick once based on data shape.)
  const useLandscape = pattern.cycle_length_days >= 10;
  const doc = new PDFDocument({
    size: 'A4',
    layout: useLandscape ? 'landscape' : 'portrait',
    margin: 40,
    bufferPages: true,
  });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });

  // Style helpers
  const H1 = (t: string) =>
    doc.moveDown(0.6).fontSize(13).fillColor('#0f172a').text(t).moveDown(0.2);
  const rowKV = (k: string, v: string) =>
    doc.fontSize(10).fillColor('#475569').text(`${k}: `, { continued: true })
      .fillColor('#0f172a').text(v);
  const body = (t: string) => doc.fontSize(10).fillColor('#334155').text(t);

  // ── Header ────────
  doc.fontSize(18).fillColor('#1e3a8a').text(FORMAT_TITLE[format]);
  doc.fontSize(11).fillColor('#64748b').text(`${venueName}  ·  ${venueCode}  ·  ${pattern.name}`);
  if (isDraft) {
    doc.fontSize(10).fillColor('#b91c1c').text('⚠ DRAFT — pre-publish copy. Not a compliance record yet.');
  } else if (pattern.status === 'SUSPENDED' || pattern.status === 'ARCHIVED') {
    doc.fontSize(10).fillColor('#92400e').text(
      `⚠ ${pattern.status} — historical record. Compliance reference only.`,
    );
  }
  doc.moveDown(0.4);

  // ── Pattern meta ──
  H1('Pattern details');
  rowKV('Status', pattern.status);
  rowKV('Cycle', `${pattern.cycle_type} · ${pattern.cycle_length_days}-day rotation`);
  if (pattern.rotation_pattern_code) {
    rowKV('Rotation library', pattern.rotation_pattern_code);
  }
  rowKV(
    'Effective',
    `${fmtDate(pattern.effective_from)}${pattern.effective_to ? ` → ${fmtDate(pattern.effective_to)}` : ' (open-ended)'}`,
  );
  if (pattern.published_at) {
    const pubBy = pattern.published_by_staff_id
      ? extraStaffMap.get(pattern.published_by_staff_id)
      : null;
    rowKV(
      'Published',
      `${fmtTimestamp(pattern.published_at)}${pubBy ? ` · by ${pubBy.name} (${pubBy.role})` : ''}`,
    );
  }
  if (pattern.signed_off_at) {
    const sgnBy = pattern.signed_off_by_staff_id
      ? extraStaffMap.get(pattern.signed_off_by_staff_id)
      : null;
    rowKV(
      'Signed off',
      `${fmtTimestamp(pattern.signed_off_at)}${sgnBy ? ` · by ${sgnBy.name} (${sgnBy.role})` : ''}`,
    );
  } else if (pattern.status === 'PUBLISHED') {
    rowKV('Signed off', '— (pending second signature)');
  }
  rowKV('Venue type', venueType);
  rowKV('Staff in pattern', String(assigns.length));

  // ── Cycle grid ──
  H1(`Cycle grid — ${assigns.length} staff × ${pattern.cycle_length_days} positions`);
  if (assigns.length === 0) {
    body('No staff assignments on this pattern.');
  } else {
    // Manual table render via PDFKit's positioning. Compute column widths.
    const tableLeft = 40;
    const tableRight = doc.page.width - 40;
    const tableWidth = tableRight - tableLeft;
    const nameColWidth = useLandscape ? 140 : 110;
    const dayColWidth = (tableWidth - nameColWidth) / pattern.cycle_length_days;
    const rowHeight = 18;

    let y = doc.y;

    // Header row
    doc.fontSize(9).fillColor('#475569').rect(tableLeft, y, tableWidth, rowHeight).fill('#f1f5f9');
    doc.fillColor('#0f172a').text('Staff', tableLeft + 4, y + 4, { width: nameColWidth - 8 });
    for (let i = 0; i < pattern.cycle_length_days; i++) {
      const cellX = tableLeft + nameColWidth + i * dayColWidth;
      doc.text(`D${i + 1}`, cellX + 2, y + 4, { width: dayColWidth - 4, align: 'center' });
    }
    y += rowHeight;

    // Data rows
    doc.fontSize(8);
    for (const sra of orderedAssigns) {
      // Page break check
      if (y + rowHeight > doc.page.height - 60) {
        doc.addPage({ size: 'A4', layout: useLandscape ? 'landscape' : 'portrait', margin: 40 });
        y = 40;
        // Re-render header on new page
        doc.fontSize(9).fillColor('#475569').rect(tableLeft, y, tableWidth, rowHeight).fill('#f1f5f9');
        doc.fillColor('#0f172a').text('Staff', tableLeft + 4, y + 4, { width: nameColWidth - 8 });
        for (let i = 0; i < pattern.cycle_length_days; i++) {
          const cellX = tableLeft + nameColWidth + i * dayColWidth;
          doc.text(`D${i + 1}`, cellX + 2, y + 4, { width: dayColWidth - 4, align: 'center' });
        }
        y += rowHeight;
        doc.fontSize(8);
      }

      const meta = staffMap.get(sra.staff_id);
      const staffName = meta?.name ?? sra.staff_id.slice(0, 8);
      const staffRole = meta?.role ?? '';

      // Row strip
      doc.rect(tableLeft, y, tableWidth, rowHeight).stroke('#e2e8f0');
      doc.fillColor('#0f172a').text(
        staffName,
        tableLeft + 4,
        y + 3,
        { width: nameColWidth - 8, ellipsis: true },
      );
      doc.fillColor('#94a3b8').fontSize(7).text(
        staffRole,
        tableLeft + 4,
        y + 10,
        { width: nameColWidth - 8, ellipsis: true },
      );
      doc.fontSize(8);

      const posMap = positionsByStaff.get(sra.staff_id);
      for (let i = 0; i < pattern.cycle_length_days; i++) {
        const cellX = tableLeft + nameColWidth + i * dayColWidth;
        const shiftId = posMap?.get(i) ?? undefined;
        let label = '—';
        let colour = '#94a3b8';
        if (shiftId === null) {
          // Explicit OFF row written
          label = 'OFF';
          colour = '#64748b';
        } else if (shiftId) {
          const sh = shiftsById.get(shiftId);
          if (sh) {
            label = shiftCellLabel(sh);
            colour = '#1e40af';
          }
        }
        doc.fillColor(colour).text(label, cellX + 2, y + 6, {
          width: dayColWidth - 4,
          align: 'center',
        });
      }
      y += rowHeight;
    }

    // Advance the doc cursor past the table
    doc.y = y + 6;
  }

  // ── Per-staff configuration ──
  H1('Per-staff configuration');
  if (orderedAssigns.length === 0) {
    body('No assignments to display.');
  } else {
    doc.fontSize(9);
    for (const sra of orderedAssigns) {
      const meta = staffMap.get(sra.staff_id);
      const name = meta?.name ?? sra.staff_id.slice(0, 8);
      const role = meta?.role ?? '—';
      const woPattern = (WEEKLY_OFF_LABEL as Record<string, string>)[sra.weekly_off_pattern] ?? sra.weekly_off_pattern;
      const woDay =
        sra.weekly_off_pattern === 'FIXED' && sra.weekly_off_day !== null
          ? ` (${DAY_OF_WEEK_SHORT[sra.weekly_off_day] ?? sra.weekly_off_day})`
          : '';
      const totalMin = staffCycleMinutes(sra.staff_id);
      const cycleHours = (totalMin / 60).toFixed(1);
      // Avg weekly = total cycle minutes scaled to 7 days
      const avgWeeklyHours = ((totalMin / 60) * (7 / pattern.cycle_length_days)).toFixed(1);
      doc.fillColor('#0f172a').text(`${name} (${role})`, { continued: false });
      doc.fillColor('#475569').fontSize(8).text(
        `   weekly-off: ${woPattern}${woDay} · weekly cap ${sra.weekly_max_hours}h · daily cap ${sra.daily_max_hours}h · ` +
        `cycle ${cycleHours}h · avg/wk ${avgWeeklyHours}h`,
      );
      doc.fontSize(9);
    }
  }

  // ── Format-specific framing block ──
  const framing = FORMAT_FRAMING[format];
  H1(framing.title);
  body(framing.body);

  // ── Footer per page ──
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const footerY = doc.page.height - 30;
    doc.fontSize(8).fillColor('#94a3b8').text(
      `${POWERED_BY}   ·   ${ref}   ·   Generated ${fmtTimestamp(new Date().toISOString())}   ·   Page ${i + 1} of ${range.count}`,
      40,
      footerY,
      { align: 'center', width: doc.page.width - 80, lineBreak: false },
    );
  }

  doc.end();
  const buffer = await done;
  logger.info(
    { patternId, venueId, format, bytes: buffer.length, staffCount: assigns.length, cycleLen: pattern.cycle_length_days },
    'BR-AU roster compliance PDF rendered',
  );
  return { buffer, ref };
}
