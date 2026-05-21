/**
 * /venues/[id]/patterns/[patternId] — Roster Pattern editor (Ops Console, Pass 4a).
 *
 * Three sections, each its own form (independent saves):
 *   1) Header — name, cycle_type, cycle_length_days, rotation_pattern_code,
 *      effective_from, effective_to. PATCHable on DRAFT only.
 *   2) Staff assignments — bulk-replace; rows render with weekly_off_*
 *      + max-hours config. Adding a row is client-side (this server-rendered
 *      page submits up to N=20 rows; "more staff" expansion is Pass 4a-ii).
 *   3) Cycle positions grid — staff × position_in_cycle matrix; each cell
 *      is a <select> of (OFF | venue shifts). Single "Save Cycle" button
 *      submits all cells as one bulk-replace.
 *
 * Non-DRAFT patterns render the same data read-only with a note pointing
 * to the dashboard for lifecycle moves.
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAdminClient } from '@/lib/supabase';
import {
  patchPatternAction,
  replaceStaffAssignmentsAction,
  replaceCyclePositionsAction,
} from '@/actions/rosterPatterns';
import type { StaffRole } from '@safecommand/types';

interface PageProps {
  params: Promise<{ id: string; patternId: string }>;
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
  status: 'DRAFT' | 'PUBLISHED' | 'SUSPENDED' | 'ARCHIVED';
  published_at: string | null;
  signed_off_at: string | null;
}

interface StaffAssignRow {
  staff_id: string;
  weekly_off_pattern: 'FIXED' | 'ROTATING_WEEKLY' | 'ROTATING_WITH_CYCLE';
  weekly_off_day: number | null;
  weekly_max_hours: number;
  daily_max_hours: number;
  default_zone_assignments: unknown;
}

interface CyclePosRow {
  staff_id: string;
  cycle_position: number;
  shift_id: string | null;
}

interface StaffMeta {
  id: string;
  name: string;
  role: StaffRole;
  is_active: boolean;
}

interface ShiftMeta {
  id: string;
  name: string | null;
  start_time: string;
  end_time: string;
}

interface RotationMeta {
  code: string;
  name: string;
  cycle_length_days: number;
}

const STATUS_BADGE: Record<PatternRow['status'], string> = {
  DRAFT:     'bg-gray-100 text-gray-800 border-gray-300',
  PUBLISHED: 'bg-green-100 text-green-800 border-green-300',
  SUSPENDED: 'bg-amber-100 text-amber-800 border-amber-300',
  ARCHIVED:  'bg-slate-100 text-slate-600 border-slate-300',
};

// Hard cap on how many staff rows the form pre-renders (server-rendered
// table — adding rows beyond this is a Pass 4a-ii client-component task).
const MAX_STAFF_ROWS = 20;

export default async function PatternDetailPage({ params }: PageProps) {
  const { id: venueId, patternId } = await params;
  const db = getAdminClient();

  const [venueRes, patternRes, rotationsRes, staffListRes, shiftListRes, staffAssignRes, cyclePosRes] = await Promise.all([
    db.from('venues').select('id, code, name').eq('id', venueId).single(),
    db.from('roster_patterns').select('*').eq('id', patternId).eq('venue_id', venueId).single(),
    db.from('rotation_cycle_library').select('code, name, cycle_length_days').order('cycle_length_days', { ascending: true }),
    db.from('staff').select('id, name, role, is_active').eq('venue_id', venueId).eq('is_active', true).order('name'),
    db.from('shifts').select('id, name, start_time, end_time').eq('venue_id', venueId).order('start_time'),
    db.from('staff_roster_assignments')
      .select('staff_id, weekly_off_pattern, weekly_off_day, weekly_max_hours, daily_max_hours, default_zone_assignments')
      .eq('pattern_id', patternId).eq('venue_id', venueId),
    db.from('roster_cycle_positions')
      .select('staff_id, cycle_position, shift_id')
      .eq('pattern_id', patternId).eq('venue_id', venueId),
  ]);

  if (venueRes.error || !venueRes.data) notFound();
  if (patternRes.error || !patternRes.data) notFound();

  const venue = venueRes.data as { id: string; code: string; name: string };
  const pattern = patternRes.data as PatternRow;
  const rotations = (rotationsRes.data ?? []) as RotationMeta[];
  const staffList = (staffListRes.data ?? []) as StaffMeta[];
  const shiftList = (shiftListRes.data ?? []) as ShiftMeta[];
  const staffAssigns = (staffAssignRes.data ?? []) as StaffAssignRow[];
  const cyclePositions = (cyclePosRes.data ?? []) as CyclePosRow[];

  const isDraft = pattern.status === 'DRAFT';

  // Index cycle positions for grid rendering: positionsByStaff[staffId][dayIdx] = shift_id | 'OFF' | undefined
  const positionsByStaff = new Map<string, Map<number, string | 'OFF'>>();
  for (const cp of cyclePositions) {
    let m = positionsByStaff.get(cp.staff_id);
    if (!m) { m = new Map(); positionsByStaff.set(cp.staff_id, m); }
    m.set(cp.cycle_position, cp.shift_id === null ? 'OFF' : cp.shift_id);
  }

  // Pad staff assignments up to MAX_STAFF_ROWS so the form always has a few empty rows for adding staff.
  const paddedStaffRows: StaffAssignRow[] = [...staffAssigns];
  while (paddedStaffRows.length < Math.min(staffAssigns.length + 3, MAX_STAFF_ROWS)) {
    paddedStaffRows.push({
      staff_id: '',
      weekly_off_pattern: 'FIXED',
      weekly_off_day: null,
      weekly_max_hours: 48,
      daily_max_hours: 9,
      default_zone_assignments: null,
    });
  }

  // Staff with rotations in the cycle grid = the assigned set (so the SH only places
  // shifts on staff they've already added).
  const assignedStaffIds = new Set(staffAssigns.map((s) => s.staff_id));
  const assignedStaff = staffList.filter((s) => assignedStaffIds.has(s.id));

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
        <Link href="/venues" className="hover:underline">Venues</Link>
        <span>/</span>
        <Link href={`/venues/${venueId}`} className="hover:underline">{venue.code}</Link>
        <span>/</span>
        <Link href={`/venues/${venueId}/patterns`} className="hover:underline">Roster patterns</Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">{pattern.name}</span>
      </div>

      <header className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-gray-900">{pattern.name}</h1>
            <span className={`inline-block px-2 py-0.5 rounded text-xs border ${STATUS_BADGE[pattern.status]}`}>
              {pattern.status}
            </span>
          </div>
          <p className="text-sm text-gray-600 mt-1">
            {pattern.cycle_type} · {pattern.cycle_length_days}-day cycle ·
            {' '}{pattern.effective_from}{pattern.effective_to ? ` → ${pattern.effective_to}` : ' (open)'}
          </p>
        </div>
      </header>

      {/* Non-DRAFT notice */}
      {!isDraft && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded text-sm text-amber-900">
          <strong>Read-only here.</strong> This pattern is <em>{pattern.status}</em>. Edits happen via the venue dashboard
          (Suspend → Archive → create a successor DRAFT). Lifecycle actions (Validate / Publish / Sign-off / Suspend /
          Archive / Materialise) are available to SH/DSH on the dashboard, not in the Ops Console.
        </div>
      )}

      {/* Section 1 — Header fields */}
      <section className="mb-8 border border-gray-200 rounded-lg p-5 bg-white">
        <h2 className="font-medium text-gray-900 mb-3">Pattern header</h2>
        <form action={patchPatternAction} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input type="hidden" name="venue_id" value={venueId} />
          <input type="hidden" name="id" value={patternId} />

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Name</span>
            <input
              type="text"
              name="name"
              defaultValue={pattern.name}
              disabled={!isDraft}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded text-sm disabled:bg-gray-50"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Cycle type</span>
            <select
              name="cycle_type"
              defaultValue={pattern.cycle_type}
              disabled={!isDraft}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded text-sm bg-white disabled:bg-gray-50"
            >
              <option value="WEEKLY">WEEKLY</option>
              <option value="BIWEEKLY">BIWEEKLY</option>
              <option value="N_WEEK_ROTATION">N_WEEK_ROTATION</option>
              <option value="CUSTOM_DAYS">CUSTOM_DAYS</option>
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Cycle length (days)</span>
            <input
              type="number"
              name="cycle_length_days"
              defaultValue={pattern.cycle_length_days}
              min={1}
              max={60}
              disabled={!isDraft}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded text-sm disabled:bg-gray-50"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Rotation library</span>
            <select
              name="rotation_pattern_code"
              defaultValue={pattern.rotation_pattern_code ?? ''}
              disabled={!isDraft}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded text-sm bg-white disabled:bg-gray-50"
            >
              <option value="">— none —</option>
              {rotations.map((r) => (
                <option key={r.code} value={r.code}>{r.name} ({r.cycle_length_days}d)</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Effective from</span>
            <input
              type="date"
              name="effective_from"
              defaultValue={pattern.effective_from}
              disabled={!isDraft}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded text-sm disabled:bg-gray-50"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Effective to</span>
            <input
              type="date"
              name="effective_to"
              defaultValue={pattern.effective_to ?? ''}
              disabled={!isDraft}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded text-sm disabled:bg-gray-50"
            />
          </label>

          {isDraft && (
            <div className="md:col-span-2 flex justify-end">
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700"
              >
                Save header
              </button>
            </div>
          )}
        </form>
      </section>

      {/* Section 2 — Staff assignments */}
      <section className="mb-8 border border-gray-200 rounded-lg p-5 bg-white">
        <h2 className="font-medium text-gray-900 mb-1">Staff assignments</h2>
        <p className="text-xs text-gray-500 mb-3">
          Adds a staff member to this pattern with their weekly-off + max-hours config.
          Default {paddedStaffRows.length} rows; clear a row's staff to remove it on save.
        </p>
        <form action={replaceStaffAssignmentsAction}>
          <input type="hidden" name="venue_id" value={venueId} />
          <input type="hidden" name="pattern_id" value={patternId} />

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-600 text-xs">
                <tr>
                  <th className="px-3 py-2 font-medium">Staff</th>
                  <th className="px-3 py-2 font-medium">Weekly off pattern</th>
                  <th className="px-3 py-2 font-medium">Weekly off day</th>
                  <th className="px-3 py-2 font-medium">Weekly max h</th>
                  <th className="px-3 py-2 font-medium">Daily max h</th>
                  <th className="px-3 py-2 font-medium">Default zones (JSON)</th>
                </tr>
              </thead>
              <tbody>
                {paddedStaffRows.map((row, idx) => (
                  <tr key={idx} className="border-t border-gray-100">
                    <td className="px-3 py-2">
                      <select
                        name={`staff[${idx}].staff_id`}
                        defaultValue={row.staff_id}
                        disabled={!isDraft}
                        className="block w-full px-2 py-1 border border-gray-300 rounded text-sm bg-white disabled:bg-gray-50"
                      >
                        <option value="">— remove row —</option>
                        {staffList.map((s) => (
                          <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <select
                        name={`staff[${idx}].weekly_off_pattern`}
                        defaultValue={row.weekly_off_pattern}
                        disabled={!isDraft}
                        className="block w-full px-2 py-1 border border-gray-300 rounded text-sm bg-white disabled:bg-gray-50"
                      >
                        <option value="FIXED">FIXED</option>
                        <option value="ROTATING_WEEKLY">ROTATING_WEEKLY</option>
                        <option value="ROTATING_WITH_CYCLE">ROTATING_WITH_CYCLE</option>
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        name={`staff[${idx}].weekly_off_day`}
                        defaultValue={row.weekly_off_day ?? ''}
                        min={0}
                        max={6}
                        placeholder="0-6"
                        disabled={!isDraft}
                        className="block w-20 px-2 py-1 border border-gray-300 rounded text-sm disabled:bg-gray-50"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        name={`staff[${idx}].weekly_max_hours`}
                        defaultValue={row.weekly_max_hours}
                        min={1}
                        max={84}
                        disabled={!isDraft}
                        className="block w-20 px-2 py-1 border border-gray-300 rounded text-sm disabled:bg-gray-50"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        name={`staff[${idx}].daily_max_hours`}
                        defaultValue={row.daily_max_hours}
                        min={1}
                        max={16}
                        disabled={!isDraft}
                        className="block w-20 px-2 py-1 border border-gray-300 rounded text-sm disabled:bg-gray-50"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        name={`staff[${idx}].default_zone_assignments`}
                        defaultValue={row.default_zone_assignments ? JSON.stringify(row.default_zone_assignments) : ''}
                        placeholder='[{"zone_id":"uuid","assignment_type":"PRIMARY"}]'
                        disabled={!isDraft}
                        className="block w-full px-2 py-1 border border-gray-300 rounded text-xs font-mono disabled:bg-gray-50"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {isDraft && (
            <div className="mt-3 flex justify-end">
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700"
              >
                Save staff assignments
              </button>
            </div>
          )}
        </form>
      </section>

      {/* Section 3 — Cycle positions grid */}
      <section className="mb-8 border border-gray-200 rounded-lg p-5 bg-white">
        <h2 className="font-medium text-gray-900 mb-1">Cycle positions</h2>
        <p className="text-xs text-gray-500 mb-3">
          {assignedStaff.length === 0
            ? 'Add staff assignments above first — the cycle grid renders for assigned staff only.'
            : `${assignedStaff.length} staff × ${pattern.cycle_length_days} positions. Each cell: select a shift or OFF. Leave blank = unspecified (defaults to OFF).`}
        </p>
        {assignedStaff.length > 0 && (
          <form action={replaceCyclePositionsAction}>
            <input type="hidden" name="venue_id" value={venueId} />
            <input type="hidden" name="pattern_id" value={patternId} />

            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="sticky left-0 z-10 bg-gray-50 px-2 py-2 border border-gray-200 text-left font-medium text-gray-700">
                      Staff \ Day
                    </th>
                    {Array.from({ length: pattern.cycle_length_days }, (_, i) => (
                      <th key={i} className="px-2 py-2 border border-gray-200 font-medium text-gray-700 text-center">
                        D{i + 1}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {assignedStaff.map((s) => (
                    <tr key={s.id}>
                      <td className="sticky left-0 bg-white px-2 py-1 border border-gray-200 font-medium text-gray-900">
                        {s.name}
                        <div className="text-gray-500 font-normal text-xs">{s.role}</div>
                      </td>
                      {Array.from({ length: pattern.cycle_length_days }, (_, dayIdx) => {
                        const current = positionsByStaff.get(s.id)?.get(dayIdx);
                        return (
                          <td key={dayIdx} className="px-1 py-1 border border-gray-200">
                            <select
                              name={`position__${s.id}__${dayIdx}`}
                              defaultValue={current ?? ''}
                              disabled={!isDraft}
                              className="block w-full px-1 py-0.5 border border-gray-200 rounded text-xs bg-white disabled:bg-gray-50"
                            >
                              <option value="">—</option>
                              <option value="OFF">OFF</option>
                              {shiftList.map((sh) => (
                                <option key={sh.id} value={sh.id}>
                                  {sh.name ?? `${sh.start_time}-${sh.end_time}`}
                                </option>
                              ))}
                            </select>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {isDraft && (
              <div className="mt-3 flex justify-end">
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700"
                >
                  Save cycle positions
                </button>
              </div>
            )}
          </form>
        )}
      </section>

      <div className="mt-6 text-xs text-gray-500">
        Pattern id: <code className="bg-gray-100 px-1 py-0.5 rounded">{patternId}</code>
        {pattern.published_at && <span className="ml-3">Published: {new Date(pattern.published_at).toLocaleString('en-IN')}</span>}
        {pattern.signed_off_at && <span className="ml-3">Signed off: {new Date(pattern.signed_off_at).toLocaleString('en-IN')}</span>}
      </div>
    </div>
  );
}
