import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAdminClient } from '@/lib/supabase';
import {
  createFloorAction,
  deleteFloorAction,
  updateFloorAction,
  createZoneAction,
  deleteZoneAction,
  updateZoneAction,
  createTemplateAction,
  deleteTemplateAction,
  updateTemplateAction,
  createStaffAction,
  deactivateStaffAction,
  reactivateStaffAction,
  updateStaffAction,
} from '@/actions/venues';
import {
  createShiftAction,
  updateShiftAction,
  deactivateShiftAction,
  reactivateShiftAction,
  createShiftInstanceAction,
  activateShiftInstanceAction,
  closeShiftInstanceAction,
  replaceZoneAssignmentsAction,
} from '@/actions/shifts';
import {
  createEquipmentAction,
  updateEquipmentAction,
  deactivateEquipmentAction,
  reactivateEquipmentAction,
} from '@/actions/equipment';
import {
  scheduleDrillAction,
  startDrillAction,
  endDrillAction,
  cancelDrillAction,
} from '@/actions/drills';
import {
  createCertificationAction,
  updateCertificationAction,
  deleteCertificationAction,
} from '@/actions/certifications';
import { ZoneAssignmentGrid } from '@/components/ZoneAssignmentGrid';
import type {
  Venue,
  Floor,
  Zone,
  ScheduleTemplate,
  StaffRole,
  FrequencyType,
  EvidenceType,
  Shift,
  ShiftInstance,
  StaffZoneAssignment,
  EquipmentItem,
  DrillSession,
  StaffCertification,
} from '@safecommand/types';

type Tab = 'floors' | 'templates' | 'staff' | 'shifts' | 'equipment' | 'drills' | 'certifications';

interface Staff {
  id: string;
  name: string;
  phone: string;
  role: StaffRole;
  is_active: boolean;
  firebase_auth_id: string | null;
}

interface FloorWithZones extends Floor {
  zones: Zone[];
}

async function getData(id: string, rosterDate: string) {
  const client = getAdminClient();
  const [
    venueRes, floorsRes, zonesRes, templatesRes, staffRes,
    shiftsRes, shiftInstancesRes, assignmentsRes,
    equipmentRes, drillsRes, certsRes,
  ] = await Promise.all([
    client.from('venues').select('*').eq('id', id).single(),
    client.from('floors').select('*').eq('venue_id', id).order('floor_number'),
    client.from('zones').select('*').eq('venue_id', id).order('name'),
    client.from('schedule_templates').select('*').eq('venue_id', id).order('title'),
    client.from('staff').select('id,name,phone,role,is_active,firebase_auth_id').eq('venue_id', id).order('name'),
    client.from('shifts').select('*').eq('venue_id', id).order('start_time'),
    client.from('shift_instances').select('*').eq('venue_id', id).eq('shift_date', rosterDate),
    // Pull all assignments for shift_instances on this date — small set, single round-trip
    client.from('staff_zone_assignments').select('*').eq('venue_id', id),
    client.from('equipment_items').select('*').eq('venue_id', id).order('next_service_due'),
    client.from('drill_sessions').select('*').eq('venue_id', id).order('scheduled_for', { ascending: false }),
    client.from('staff_certifications').select('*').eq('venue_id', id).order('expires_at'),
  ]);

  if (venueRes.error || !venueRes.data) return null;

  const floors = (floorsRes.data ?? []) as Floor[];
  const zones = (zonesRes.data ?? []) as Zone[];
  const floorsWithZones: FloorWithZones[] = floors.map((f) => ({
    ...f,
    zones: zones.filter((z) => z.floor_id === f.id),
  }));

  return {
    venue: venueRes.data as Venue,
    floors: floorsWithZones,
    zones,
    templates: (templatesRes.data ?? []) as ScheduleTemplate[],
    staff: (staffRes.data ?? []) as Staff[],
    shifts: (shiftsRes.data ?? []) as Shift[],
    shiftInstances: (shiftInstancesRes.data ?? []) as ShiftInstance[],
    assignments: (assignmentsRes.data ?? []) as StaffZoneAssignment[],
    equipment: (equipmentRes.data ?? []) as EquipmentItem[],
    drills: (drillsRes.data ?? []) as DrillSession[],
    certifications: (certsRes.data ?? []) as StaffCertification[],
  };
}

/** Today's date in venue timezone. For May freeze we use server time + IST. */
function todayIST(): string {
  const now = new Date();
  // Asia/Kolkata is +5:30, no DST. Format as YYYY-MM-DD in that zone.
  const istMs = now.getTime() + (5.5 * 60 * 60 * 1000);
  return new Date(istMs).toISOString().slice(0, 10);
}

/* ─── Reference data ─────────────────────────────────────────────────────── */

const ROLES: StaffRole[] = ['SH', 'DSH', 'SHIFT_COMMANDER', 'GM', 'AUDITOR', 'FM', 'FLOOR_SUPERVISOR', 'GROUND_STAFF'];

const ROLE_LABELS: Record<StaffRole, string> = {
  SH: 'Security Head',
  DSH: 'Deputy Security Head',
  SHIFT_COMMANDER: 'Shift Commander',
  GM: 'General Manager',
  AUDITOR: 'Auditor',
  FM: 'Facility Manager',
  FLOOR_SUPERVISOR: 'Floor Supervisor',
  GROUND_STAFF: 'Ground Staff',
};

const FREQUENCIES: FrequencyType[] = ['HOURLY', 'EVERY_2H', 'EVERY_4H', 'EVERY_6H', 'EVERY_8H', 'DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL'];

const FREQUENCY_LABELS: Record<string, string> = {
  HOURLY: 'Hourly', EVERY_2H: 'Every 2 Hours', EVERY_4H: 'Every 4 Hours',
  EVERY_6H: 'Every 6 Hours', EVERY_8H: 'Every 8 Hours', DAILY: 'Daily',
  WEEKLY: 'Weekly', MONTHLY: 'Monthly', QUARTERLY: 'Quarterly', ANNUAL: 'Annual',
};

const EVIDENCE_TYPES: EvidenceType[] = ['NONE', 'PHOTO', 'TEXT', 'NUMERIC', 'CHECKLIST'];

const EVIDENCE_LABELS: Record<string, string> = {
  NONE: 'None', PHOTO: 'Photo', TEXT: 'Text Note', NUMERIC: 'Numeric Value', CHECKLIST: 'Checklist',
};

const ZONE_TYPES = ['ENTRANCE', 'LOBBY', 'PARKING', 'CORRIDOR', 'STAIRWELL', 'FIRE_EXIT', 'SERVER_ROOM', 'CAFETERIA', 'RESTROOM', 'OFFICE', 'STORE', 'WARD', 'ICU', 'EMERGENCY', 'OTHER'];

const ZONE_TYPE_LABELS: Record<string, string> = {
  ENTRANCE: 'Entrance', LOBBY: 'Lobby', PARKING: 'Parking', CORRIDOR: 'Corridor',
  STAIRWELL: 'Stairwell', FIRE_EXIT: 'Fire Exit', SERVER_ROOM: 'Server Room',
  CAFETERIA: 'Cafeteria', RESTROOM: 'Restroom', OFFICE: 'Office', STORE: 'Store',
  WARD: 'Ward', ICU: 'ICU', EMERGENCY: 'Emergency', OTHER: 'Other',
};

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

const TIMEZONES = [
  { value: 'Asia/Kolkata', label: 'IST — India Standard Time' },
  { value: 'UTC', label: 'GMT — Greenwich Mean Time' },
  { value: 'America/New_York', label: 'EST — Eastern Standard Time' },
  { value: 'America/Los_Angeles', label: 'PST — Pacific Standard Time' },
  { value: 'America/Chicago', label: 'CST — Central Standard Time' },
  { value: 'Asia/Singapore', label: 'SGT — Singapore Time' },
  { value: 'Asia/Dubai', label: 'GST — Gulf Standard Time' },
  { value: 'Europe/London', label: 'BST/GMT — British Time' },
];

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function parseTime24(time24: string | null): { hour: string; minute: string; ampm: 'AM' | 'PM' } | null {
  if (!time24) return null;
  const [hStr, mStr] = time24.split(':');
  let h = parseInt(hStr ?? '0', 10);
  const m = mStr ?? '00';
  const ampm: 'AM' | 'PM' = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return { hour: String(h).padStart(2, '0'), minute: m, ampm };
}

function formatDisplayTime(time24: string, timezone: string): string {
  const parsed = parseTime24(time24);
  if (!parsed) return '—';
  const tzLabel = TIMEZONES.find((tz) => tz.value === timezone)?.label.split(' — ')[0] ?? timezone;
  return `${parsed.hour}:${parsed.minute} ${parsed.ampm} ${tzLabel}`;
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default async function VenueDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    tab?: string;
    view_floor?: string; edit_floor?: string;
    view_zone?: string;  edit_zone?: string;
    view_tpl?: string;   edit_tpl?: string;
    view_staff?: string; edit_staff?: string;
    edit_shift?: string;
    /** YYYY-MM-DD — date to view roster for. Defaults to today (IST). */
    roster_date?: string;
    edit_eq?: string;
    edit_cert?: string;
  }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const activeTab = ((sp.tab ?? 'floors') as Tab);
  const rosterDate = sp.roster_date ?? todayIST();
  const data = await getData(id, rosterDate);
  if (!data) notFound();

  const { venue, floors, zones, templates, staff, shifts, shiftInstances, assignments, equipment, drills, certifications } = data;
  const totalZones = floors.reduce((acc, f) => acc + f.zones.length, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
            <Link href="/" className="hover:text-gray-900">Home</Link>
            <span>/</span>
            <Link href="/venues" className="hover:text-gray-900">Venues</Link>
            <span>/</span>
            <span className="text-gray-900 font-medium">{venue.name}</span>
          </div>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-semibold text-gray-900">{venue.name}</h1>
                <span className="font-mono text-sm text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{venue.venue_code}</span>
              </div>
              <p className="text-sm text-gray-500 mt-0.5">{venue.type} · {venue.city} · {venue.subscription_tier}</p>
            </div>
            <div className="flex gap-4 text-sm text-gray-500">
              <span><strong className="text-gray-900">{floors.length}</strong> floors</span>
              <span><strong className="text-gray-900">{totalZones}</strong> zones</span>
              <span><strong className="text-gray-900">{templates.length}</strong> templates</span>
              <span><strong className="text-gray-900">{staff.length}</strong> staff</span>
            </div>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6">
          <nav className="flex gap-6 overflow-x-auto">
            {([
              ['floors', 'Floors & Zones'],
              ['templates', 'Schedule Templates'],
              ['staff', 'Staff'],
              ['shifts', 'Shifts & Roster'],
              ['equipment', 'Equipment'],
              ['drills', 'Drills'],
              ['certifications', 'Certifications'],
            ] as [Tab, string][]).map(([t, label]) => (
              <Link key={t} href={`/venues/${id}?tab=${t}`}
                className={`py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-900'}`}>
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {activeTab === 'floors' && (
          <FloorsTab
            venue={venue} floors={floors}
            viewFloor={sp.view_floor} editFloor={sp.edit_floor}
            viewZone={sp.view_zone} editZone={sp.edit_zone}
          />
        )}
        {activeTab === 'templates' && (
          <TemplatesTab
            venue={venue} templates={templates}
            viewTpl={sp.view_tpl} editTpl={sp.edit_tpl}
          />
        )}
        {activeTab === 'staff' && (
          <StaffTab
            venue={venue} staff={staff}
            viewStaff={sp.view_staff} editStaff={sp.edit_staff}
          />
        )}
        {activeTab === 'shifts' && (
          <ShiftsTab
            venue={venue}
            shifts={shifts}
            shiftInstances={shiftInstances}
            assignments={assignments}
            staff={staff}
            floors={floors}
            zones={zones}
            rosterDate={rosterDate}
            editShift={sp.edit_shift}
          />
        )}
        {activeTab === 'equipment' && (
          <EquipmentTab venue={venue} equipment={equipment} editEq={sp.edit_eq} />
        )}
        {activeTab === 'drills' && (
          <DrillsTab venue={venue} drills={drills} staff={staff} />
        )}
        {activeTab === 'certifications' && (
          <CertificationsTab
            venue={venue}
            certifications={certifications}
            staff={staff}
            editCert={sp.edit_cert}
          />
        )}
      </main>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   FLOORS & ZONES TAB
═══════════════════════════════════════════════════════════════════════════ */

function FloorsTab({
  venue, floors, viewFloor, editFloor, viewZone, editZone,
}: {
  venue: Venue; floors: FloorWithZones[];
  viewFloor?: string; editFloor?: string;
  viewZone?: string; editZone?: string;
}) {
  const allZones = floors.flatMap((f) => f.zones);
  const selectedFloor = floors.find((f) => f.id === (viewFloor ?? editFloor));
  const selectedZone  = allZones.find((z) => z.id === (viewZone ?? editZone));
  const selectedZoneFloor = selectedZone ? floors.find((f) => f.id === selectedZone.floor_id) : null;

  const closeUrl = `/venues/${venue.id}?tab=floors`;

  return (
    <div className="space-y-6">
      {/* ── Floor view panel ── */}
      {viewFloor && selectedFloor && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-3 bg-blue-50 border-b border-blue-100">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Viewing Floor</span>
              <span className="text-gray-400">·</span>
              <span className="font-medium text-gray-900">{selectedFloor.name}</span>
            </div>
            <Link href={closeUrl} className="text-sm text-gray-400 hover:text-gray-700">✕ Close</Link>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-3 gap-6 mb-6">
              <Field label="Floor name" value={selectedFloor.name} />
              <Field label="Floor number" value={String(selectedFloor.floor_number)} />
              <Field label="Zones" value={`${selectedFloor.zones.length} zone${selectedFloor.zones.length !== 1 ? 's' : ''}`} />
            </div>
            {selectedFloor.zones.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">Zones on this floor</p>
                <div className="grid grid-cols-2 gap-2">
                  {selectedFloor.zones.map((z) => (
                    <div key={z.id} className="flex items-center gap-2 text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2">
                      <span className="font-medium">{z.name}</span>
                      <span className="text-gray-400">·</span>
                      <span className="text-xs text-gray-500">{ZONE_TYPE_LABELS[z.zone_type] ?? z.zone_type}</span>
                      {z.two_person_required && <span className="text-xs text-amber-600 ml-auto">2-person</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
            <Link href={`/venues/${venue.id}?tab=floors&edit_floor=${selectedFloor.id}`} className={editLinkCls}>Edit floor</Link>
            <form action={deleteFloorAction} className="inline">
              <input type="hidden" name="venue_id" value={venue.id} />
              <input type="hidden" name="id" value={selectedFloor.id} />
              <button type="submit" className={removeBtnCls}>Remove</button>
            </form>
          </div>
        </div>
      )}

      {/* ── Floor edit panel ── */}
      {editFloor && selectedFloor && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-3 bg-amber-50 border-b border-amber-100">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">Editing Floor</span>
              <span className="text-gray-400">·</span>
              <span className="font-medium text-gray-900">{selectedFloor.name}</span>
            </div>
            <Link href={closeUrl} className="text-sm text-gray-400 hover:text-gray-700">✕ Cancel</Link>
          </div>
          <form action={updateFloorAction} className="p-6">
            <input type="hidden" name="id" value={selectedFloor.id} />
            <input type="hidden" name="venue_id" value={venue.id} />
            <div className="flex gap-4 items-end">
              <div className="w-32">
                <label className="block text-xs font-medium text-gray-700 mb-1">Floor number</label>
                <input name="floor_number" type="number" required min={-5} max={100} defaultValue={selectedFloor.floor_number} className={inputCls} />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-700 mb-1">Floor name</label>
                <input name="name" required defaultValue={selectedFloor.name} className={inputCls} />
              </div>
              <button type="submit" className={saveBtnCls}>Save changes</button>
            </div>
          </form>
        </div>
      )}

      {/* ── Zone view panel ── */}
      {viewZone && selectedZone && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-3 bg-blue-50 border-b border-blue-100">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Viewing Zone</span>
              <span className="text-gray-400">·</span>
              <span className="font-medium text-gray-900">{selectedZone.name}</span>
            </div>
            <Link href={closeUrl} className="text-sm text-gray-400 hover:text-gray-700">✕ Close</Link>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-4 gap-6">
              <Field label="Zone name" value={selectedZone.name} />
              <Field label="Zone type" value={ZONE_TYPE_LABELS[selectedZone.zone_type] ?? selectedZone.zone_type} />
              <Field label="2-person required" value={selectedZone.two_person_required ? 'Yes' : 'No'} />
              <Field label="Parent floor" value={selectedZoneFloor ? `${selectedZoneFloor.name} (Floor ${selectedZoneFloor.floor_number})` : '—'} />
            </div>
          </div>
          <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
            <Link href={`/venues/${venue.id}?tab=floors&edit_zone=${selectedZone.id}`} className={editLinkCls}>Edit zone</Link>
            <form action={deleteZoneAction} className="inline">
              <input type="hidden" name="venue_id" value={venue.id} />
              <input type="hidden" name="id" value={selectedZone.id} />
              <button type="submit" className={removeBtnCls}>Remove</button>
            </form>
          </div>
        </div>
      )}

      {/* ── Zone edit panel ── */}
      {editZone && selectedZone && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-3 bg-amber-50 border-b border-amber-100">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">Editing Zone</span>
              <span className="text-gray-400">·</span>
              <span className="font-medium text-gray-900">{selectedZone.name}</span>
            </div>
            <Link href={closeUrl} className="text-sm text-gray-400 hover:text-gray-700">✕ Cancel</Link>
          </div>
          <form action={updateZoneAction} className="p-6">
            <input type="hidden" name="id" value={selectedZone.id} />
            <input type="hidden" name="venue_id" value={venue.id} />
            <div className="flex gap-4 items-end flex-wrap">
              <div className="flex-[2] min-w-36">
                <label className="block text-xs font-medium text-gray-700 mb-1">Zone name</label>
                <input name="name" required defaultValue={selectedZone.name} className={inputCls} />
              </div>
              <div className="flex-1 min-w-40">
                <label className="block text-xs font-medium text-gray-700 mb-1">Zone type</label>
                <select name="zone_type" required defaultValue={selectedZone.zone_type} className={selectCls}>
                  {ZONE_TYPES.map((t) => <option key={t} value={t}>{ZONE_TYPE_LABELS[t] ?? t}</option>)}
                </select>
              </div>
              <div className="flex items-end gap-2 pb-0.5">
                <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
                  <input name="two_person_required" type="checkbox" className="rounded" defaultChecked={selectedZone.two_person_required} />
                  2-person req.
                </label>
              </div>
              <button type="submit" className={saveBtnCls}>Save changes</button>
            </div>
          </form>
        </div>
      )}

      {/* ── Add floor card ── */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Add floor</h2>
        <form action={createFloorAction} className="flex gap-3 items-end">
          <input type="hidden" name="venue_id" value={venue.id} />
          <div className="w-32">
            <label className="block text-xs font-medium text-gray-700 mb-1">Floor number</label>
            <input name="floor_number" type="number" required min={-5} max={100} className={inputCls} placeholder="1" />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-700 mb-1">Floor name</label>
            <input name="name" required className={inputCls} placeholder="e.g. Ground Floor" />
          </div>
          <button type="submit" className={btnCls}>Add floor</button>
        </form>
      </div>

      {/* ── Floors list ── */}
      {floors.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No floors yet — add one above.</p>
      ) : (
        floors.map((floor) => (
          <div key={floor.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            {/* Floor header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50">
              <div>
                <span className="font-medium text-gray-900">{floor.name}</span>
                <span className="ml-2 text-xs text-gray-400">Floor {floor.floor_number}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400">{floor.zones.length} zone{floor.zones.length !== 1 ? 's' : ''}</span>
                <RowActions
                  viewHref={`/venues/${venue.id}?tab=floors&view_floor=${floor.id}`}
                  editHref={`/venues/${venue.id}?tab=floors&edit_floor=${floor.id}`}
                  removeForm={
                    <>
                      <input type="hidden" name="venue_id" value={venue.id} />
                      <input type="hidden" name="id" value={floor.id} />
                    </>
                  }
                  removeAction={deleteFloorAction}
                />
              </div>
            </div>

            {/* Zones list */}
            {floor.zones.length > 0 && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className={thCls}>Zone name</th>
                    <th className={thCls}>Type</th>
                    <th className={thCls}>2-person req.</th>
                    <th className="px-6 py-2 bg-gray-50" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {floor.zones.map((z) => (
                    <tr key={z.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 font-medium text-gray-900">{z.name}</td>
                      <td className="px-6 py-3 text-gray-700 text-xs">{ZONE_TYPE_LABELS[z.zone_type] ?? z.zone_type}</td>
                      <td className="px-6 py-3 text-gray-700 text-xs">{z.two_person_required ? '✓ Yes' : '—'}</td>
                      <td className="px-6 py-3">
                        <RowActions
                          viewHref={`/venues/${venue.id}?tab=floors&view_zone=${z.id}`}
                          editHref={`/venues/${venue.id}?tab=floors&edit_zone=${z.id}`}
                          removeForm={
                            <>
                              <input type="hidden" name="venue_id" value={venue.id} />
                              <input type="hidden" name="id" value={z.id} />
                            </>
                          }
                          removeAction={deleteZoneAction}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Add zone form */}
            <div className="px-6 py-4 border-t border-dashed border-gray-200 bg-gray-50/50">
              <form action={createZoneAction} className="flex gap-3 items-end flex-wrap">
                <input type="hidden" name="venue_id" value={venue.id} />
                <input type="hidden" name="floor_id" value={floor.id} />
                <div className="flex-[2] min-w-32">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Zone name</label>
                  <input name="name" required className={inputCls} placeholder="e.g. North Entrance" />
                </div>
                <div className="flex-1 min-w-36">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Zone type</label>
                  <select name="zone_type" required className={selectCls}>
                    <option value="">Select type</option>
                    {ZONE_TYPES.map((t) => <option key={t} value={t}>{ZONE_TYPE_LABELS[t] ?? t}</option>)}
                  </select>
                </div>
                <div className="flex items-end gap-2 pb-0.5">
                  <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
                    <input name="two_person_required" type="checkbox" className="rounded" />
                    2-person req.
                  </label>
                </div>
                <button type="submit" className={btnCls}>Add zone</button>
              </form>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TEMPLATES TAB
═══════════════════════════════════════════════════════════════════════════ */

function TemplatesTab({
  venue, templates, viewTpl, editTpl,
}: {
  venue: Venue; templates: ScheduleTemplate[];
  viewTpl?: string; editTpl?: string;
}) {
  const selected = templates.find((t) => t.id === (viewTpl ?? editTpl));
  const closeUrl = `/venues/${venue.id}?tab=templates`;

  return (
    <div className="space-y-6">
      {/* ── Template view panel ── */}
      {viewTpl && selected && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-3 bg-blue-50 border-b border-blue-100">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Viewing Template</span>
              <span className="text-gray-400">·</span>
              <span className="font-medium text-gray-900">{selected.title}</span>
            </div>
            <Link href={closeUrl} className="text-sm text-gray-400 hover:text-gray-700">✕ Close</Link>
          </div>
          <div className="p-6 space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Title" value={selected.title} span={2} />
              {selected.description && <Field label="Description" value={selected.description} span={2} />}
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Frequency" value={FREQUENCY_LABELS[selected.frequency] ?? selected.frequency} />
              <Field label="Assigned role" value={ROLE_LABELS[selected.assigned_role] ?? selected.assigned_role} />
              <Field label="Evidence type" value={EVIDENCE_LABELS[selected.evidence_type] ?? selected.evidence_type} />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Start time" value={selected.start_time ? formatDisplayTime(selected.start_time, selected.timezone) : 'Continuous'} />
              <Field label="Timezone" value={TIMEZONES.find((tz) => tz.value === selected.timezone)?.label ?? selected.timezone} />
              <Field label="Escalation interval" value={`${selected.escalation_interval_minutes} minutes`} />
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">Primary escalation chain</p>
                {selected.escalation_chain.length === 0 ? (
                  <p className="text-sm text-gray-400">Not configured</p>
                ) : (
                  <ol className="space-y-1">
                    {selected.escalation_chain.map((r, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-gray-700">
                        <span className="text-xs text-gray-400 w-14 shrink-0">Level {i + 1}</span>
                        <span>{ROLE_LABELS[r as StaffRole] ?? r}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">Secondary escalation chain</p>
                {selected.secondary_escalation_chain.length === 0 ? (
                  <p className="text-sm text-gray-400">Not configured</p>
                ) : (
                  <ol className="space-y-1">
                    {selected.secondary_escalation_chain.map((r, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-gray-700">
                        <span className="text-xs text-gray-400 w-14 shrink-0">Level {i + 1}</span>
                        <span>{ROLE_LABELS[r as StaffRole] ?? r}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          </div>
          <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
            <Link href={`/venues/${venue.id}?tab=templates&edit_tpl=${selected.id}`} className={editLinkCls}>Edit template</Link>
            <form action={deleteTemplateAction} className="inline">
              <input type="hidden" name="venue_id" value={venue.id} />
              <input type="hidden" name="id" value={selected.id} />
              <button type="submit" className={removeBtnCls}>Remove</button>
            </form>
          </div>
        </div>
      )}

      {/* ── Template edit panel ── */}
      {editTpl && selected && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-3 bg-amber-50 border-b border-amber-100">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">Editing Template</span>
              <span className="text-gray-400">·</span>
              <span className="font-medium text-gray-900">{selected.title}</span>
            </div>
            <Link href={closeUrl} className="text-sm text-gray-400 hover:text-gray-700">✕ Cancel</Link>
          </div>
          <form action={updateTemplateAction} className="p-6 space-y-6">
            <input type="hidden" name="id" value={selected.id} />
            <input type="hidden" name="venue_id" value={venue.id} />
            <TemplateFormFields template={selected} />
            <div className="flex justify-end pt-2">
              <button type="submit" className={saveBtnCls}>Save changes</button>
            </div>
          </form>
        </div>
      )}

      {/* ── Add template card ── */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-1">Add schedule template</h2>
        <p className="text-xs text-gray-400 mb-5">Define a recurring safety task — frequency, who does it, and what happens if it&apos;s missed.</p>
        <form action={createTemplateAction} className="space-y-6">
          <input type="hidden" name="venue_id" value={venue.id} />
          <TemplateFormFields />
          <div className="flex justify-end pt-2">
            <button type="submit" className={btnCls}>Add template</button>
          </div>
        </form>
      </div>

      {/* ── Templates list ── */}
      {templates.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No templates yet.</p>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className={thCls}>Title</th>
                <th className={thCls}>Frequency</th>
                <th className={thCls}>Assigned role</th>
                <th className={thCls}>Start time</th>
                <th className={thCls}>Evidence</th>
                <th className={thCls}>Primary chain</th>
                <th className="px-4 py-2 bg-gray-50" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {templates.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium text-gray-900">{t.title}</td>
                  <td className="px-6 py-3 text-gray-700 text-xs">{FREQUENCY_LABELS[t.frequency] ?? t.frequency}</td>
                  <td className="px-6 py-3 text-gray-700 text-xs">{ROLE_LABELS[t.assigned_role] ?? t.assigned_role}</td>
                  <td className="px-6 py-3 text-gray-700 text-xs font-mono">
                    {t.start_time ? formatDisplayTime(t.start_time, t.timezone) : '—'}
                  </td>
                  <td className="px-6 py-3 text-gray-700 text-xs">{EVIDENCE_LABELS[t.evidence_type] ?? t.evidence_type}</td>
                  <td className="px-6 py-3 text-gray-600 text-xs">
                    {t.escalation_chain.length > 0
                      ? t.escalation_chain.map((r) => ROLE_LABELS[r as StaffRole] ?? r).join(' → ')
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <RowActions
                      viewHref={`/venues/${venue.id}?tab=templates&view_tpl=${t.id}`}
                      editHref={`/venues/${venue.id}?tab=templates&edit_tpl=${t.id}`}
                      removeForm={
                        <>
                          <input type="hidden" name="venue_id" value={venue.id} />
                          <input type="hidden" name="id" value={t.id} />
                        </>
                      }
                      removeAction={deleteTemplateAction}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   STAFF TAB
═══════════════════════════════════════════════════════════════════════════ */

function StaffTab({
  venue, staff, viewStaff, editStaff,
}: {
  venue: Venue; staff: Staff[];
  viewStaff?: string; editStaff?: string;
}) {
  const selected = staff.find((s) => s.id === (viewStaff ?? editStaff));
  const closeUrl = `/venues/${venue.id}?tab=staff`;

  return (
    <div className="space-y-6">
      {/* ── Staff view panel ── */}
      {viewStaff && selected && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-3 bg-blue-50 border-b border-blue-100">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Viewing Staff</span>
              <span className="text-gray-400">·</span>
              <span className="font-medium text-gray-900">{selected.name}</span>
            </div>
            <Link href={closeUrl} className="text-sm text-gray-400 hover:text-gray-700">✕ Close</Link>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-4 gap-6">
              <Field label="Full name" value={selected.name} />
              <Field label="Phone" value={selected.phone} mono />
              <Field label="Role" value={ROLE_LABELS[selected.role] ?? selected.role} />
              <Field label="Status" value={selected.is_active ? 'Active' : 'Inactive'} />
              <Field label="Auth link" value={selected.firebase_auth_id ? `Linked (${selected.firebase_auth_id.slice(0, 8)}…)` : 'Not yet — links on first login'} />
            </div>
          </div>
          <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
            <Link href={`/venues/${venue.id}?tab=staff&edit_staff=${selected.id}`} className={editLinkCls}>Edit staff</Link>
            {/*
             * Polymorphic action button — same slot, different intent.
             * Active staff: red "Deactivate" (destructive). Inactive
             * staff: green "Enable" (constructive). Mirrors the
             * row-level RowActions; provides single-click reactivation
             * from the detail panel without going back to the list.
             */}
            {selected.is_active ? (
              <form action={deactivateStaffAction} className="inline">
                <input type="hidden" name="venue_id" value={venue.id} />
                <input type="hidden" name="id" value={selected.id} />
                <button type="submit" className={removeBtnCls}>Deactivate</button>
              </form>
            ) : (
              <form action={reactivateStaffAction} className="inline">
                <input type="hidden" name="venue_id" value={venue.id} />
                <input type="hidden" name="id" value={selected.id} />
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded hover:bg-green-700"
                >
                  Enable
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ── Staff edit panel ── */}
      {editStaff && selected && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-3 bg-amber-50 border-b border-amber-100">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">Editing Staff</span>
              <span className="text-gray-400">·</span>
              <span className="font-medium text-gray-900">{selected.name}</span>
            </div>
            <Link href={closeUrl} className="text-sm text-gray-400 hover:text-gray-700">✕ Cancel</Link>
          </div>
          <form action={updateStaffAction} className="p-6">
            <input type="hidden" name="id" value={selected.id} />
            <input type="hidden" name="venue_id" value={venue.id} />
            <div className="flex gap-4 items-end flex-wrap">
              <div className="flex-[2] min-w-36">
                <label className="block text-xs font-medium text-gray-700 mb-1">Full name *</label>
                <input name="name" required defaultValue={selected.name} className={inputCls} />
              </div>
              <div className="flex-[2] min-w-36">
                <label className="block text-xs font-medium text-gray-700 mb-1">Phone (E.164) *</label>
                <input name="phone" required defaultValue={selected.phone} pattern="^\+[1-9]\d{6,14}$" className={inputCls} />
              </div>
              <div className="flex-1 min-w-44">
                <label className="block text-xs font-medium text-gray-700 mb-1">Role *</label>
                <select name="role" required defaultValue={selected.role} className={selectCls}>
                  {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
              </div>
              <button type="submit" className={saveBtnCls}>Save changes</button>
            </div>
          </form>
        </div>
      )}

      {/* ── Add staff card ── */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-1">Add staff member</h2>
        <p className="text-xs text-gray-400 mb-4">
          Create the initial Security Head account here. The Security Head can then add remaining staff via the mobile app.
        </p>
        <form action={createStaffAction} className="flex gap-3 items-end flex-wrap">
          <input type="hidden" name="venue_id" value={venue.id} />
          <div className="flex-[2] min-w-36">
            <label className="block text-xs font-medium text-gray-700 mb-1">Full name *</label>
            <input name="name" required className={inputCls} placeholder="e.g. Rajesh Kumar" />
          </div>
          <div className="flex-[2] min-w-36">
            <label className="block text-xs font-medium text-gray-700 mb-1">Phone (E.164) *</label>
            <input name="phone" required className={inputCls} placeholder="+919876543210" pattern="^\+[1-9]\d{6,14}$" />
          </div>
          <div className="flex-1 min-w-44">
            <label className="block text-xs font-medium text-gray-700 mb-1">Role *</label>
            <select name="role" required defaultValue="SH" className={selectCls}>
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </div>
          <button type="submit" className={btnCls}>Add staff</button>
        </form>
      </div>

      {/* ── Staff list ── */}
      {staff.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No staff yet — add the Security Head above.</p>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className={thCls}>Name</th>
                <th className={thCls}>Phone</th>
                <th className={thCls}>Role</th>
                <th className={thCls}>Auth</th>
                <th className={thCls}>Status</th>
                <th className="px-4 py-2 bg-gray-50" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {staff.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium text-gray-900">{s.name}</td>
                  <td className="px-6 py-3 text-gray-700 font-mono text-xs">{s.phone}</td>
                  <td className="px-6 py-3 text-gray-700 text-xs">{ROLE_LABELS[s.role] ?? s.role}</td>
                  <td className="px-6 py-3 text-xs">
                    {s.firebase_auth_id
                      ? <span className="text-green-600">✓ Linked</span>
                      : <span className="text-gray-400">Not yet</span>}
                  </td>
                  <td className="px-6 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${s.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {s.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {/*
                     * Polymorphic action slot:
                     *   active   → "Deactivate" (red, danger tone)
                     *   inactive → "Enable"     (green, success tone)
                     * The schema is a binary toggle today; lifecycle
                     * states (ACTIVE/SUSPENDED/ON_LEAVE/TERMINATED) land
                     * in Phase B per migration 011_staff_lifecycle.sql.
                     */}
                    <RowActions
                      viewHref={`/venues/${venue.id}?tab=staff&view_staff=${s.id}`}
                      editHref={`/venues/${venue.id}?tab=staff&edit_staff=${s.id}`}
                      removeLabel={s.is_active ? 'Deactivate' : 'Enable'}
                      removeForm={
                        <>
                          <input type="hidden" name="venue_id" value={venue.id} />
                          <input type="hidden" name="id" value={s.id} />
                        </>
                      }
                      removeAction={s.is_active ? deactivateStaffAction : reactivateStaffAction}
                      removeTone={s.is_active ? 'danger' : 'success'}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SHARED COMPONENTS
═══════════════════════════════════════════════════════════════════════════ */

function Field({
  label, value, span, mono,
}: {
  label: string; value: string; span?: number; mono?: boolean;
}) {
  return (
    <div className={span === 2 ? 'col-span-2' : ''}>
      <p className="text-xs font-medium text-gray-500 mb-0.5">{label}</p>
      <p className={`text-sm text-gray-900 ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}

function RowActions({
  viewHref, editHref, removeForm, removeAction, removeLabel = 'Remove',
  // Tone signals semantic meaning: 'danger' (default — destructive deactivate)
  // vs 'success' (constructive re-enable). Different colour palettes; same
  // structural slot. Used for staff lifecycle: deactivate=red, enable=green.
  removeTone = 'danger',
}: {
  viewHref: string;
  editHref: string;
  removeForm?: React.ReactNode;
  removeAction?: (formData: FormData) => Promise<void>;
  removeLabel?: string;
  removeTone?: 'danger' | 'success';
}) {
  const removeBtnCls = removeTone === 'success'
    ? 'text-xs text-green-600 hover:text-green-800 font-medium'
    : 'text-xs text-red-500 hover:text-red-700 font-medium';
  return (
    <div className="flex items-center justify-end gap-2.5">
      <Link href={viewHref} className="text-xs text-blue-600 hover:text-blue-800 font-medium">View</Link>
      <span className="text-gray-300 text-xs select-none">·</span>
      <Link href={editHref} className="text-xs text-amber-600 hover:text-amber-800 font-medium">Edit</Link>
      {removeAction && removeForm && (
        <>
          <span className="text-gray-300 text-xs select-none">·</span>
          <form action={removeAction} className="inline">
            {removeForm}
            <button type="submit" className={removeBtnCls}>{removeLabel}</button>
          </form>
        </>
      )}
    </div>
  );
}

function ChainSelects({
  prefix, label, values = [], requiredFirst = false,
}: {
  prefix: string; label: string; values?: string[]; requiredFirst?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700 mb-2">{label}</label>
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((level) => (
          <div key={level} className="flex items-center gap-2">
            <span className="text-xs text-gray-400 w-14 shrink-0">
              Level {level}{level === 1 && requiredFirst ? ' *' : ''}
            </span>
            <select
              name={`${prefix}_${level}`}
              className={selectCls}
              required={level === 1 && requiredFirst}
              defaultValue={values[level - 1] ?? ''}
            >
              <option value="">— not set —</option>
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}

function TemplateFormFields({ template }: { template?: ScheduleTemplate }) {
  const parsed = parseTime24(template?.start_time ?? null);
  return (
    <>
      {/* Title + Description */}
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2 sm:col-span-1">
          <label className="block text-xs font-medium text-gray-700 mb-1">Title *</label>
          <input name="title" required defaultValue={template?.title} className={inputCls} placeholder="e.g. Fire Exit Check — Ground Floor" />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
          <input name="description" defaultValue={template?.description ?? ''} className={inputCls} placeholder="Optional details" />
        </div>
      </div>

      {/* Frequency + Role + Evidence */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Frequency *</label>
          <select name="frequency" required defaultValue={template?.frequency ?? ''} className={selectCls}>
            <option value="">Select frequency</option>
            {FREQUENCIES.map((f) => <option key={f} value={f}>{FREQUENCY_LABELS[f] ?? f}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Assigned role *</label>
          <select name="assigned_role" required defaultValue={template?.assigned_role ?? ''} className={selectCls}>
            <option value="">Select role</option>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Evidence type *</label>
          <select name="evidence_type" required defaultValue={template?.evidence_type ?? 'NONE'} className={selectCls}>
            {EVIDENCE_TYPES.map((e) => <option key={e} value={e}>{EVIDENCE_LABELS[e] ?? e}</option>)}
          </select>
        </div>
      </div>

      {/* Start time picker */}
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">
          Start time <span className="font-normal text-gray-400">(leave blank for continuous scheduling)</span>
        </label>
        <p className="text-xs text-gray-400 mb-2">For daily/weekly templates this is when the task runs. For hourly templates this is the anchor start time.</p>
        <div className="flex gap-3 items-end flex-wrap">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Hour</label>
            <select name="start_hour" defaultValue={parsed?.hour ?? ''} className={`${selectCls} w-24`}>
              <option value="">—</option>
              {HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Minute</label>
            <select name="start_minute" defaultValue={parsed?.minute ?? ''} className={`${selectCls} w-24`}>
              <option value="">—</option>
              {MINUTES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">AM / PM</label>
            <select name="start_ampm" defaultValue={parsed?.ampm ?? ''} className={`${selectCls} w-24`}>
              <option value="">—</option>
              <option value="AM">AM</option>
              <option value="PM">PM</option>
            </select>
          </div>
          <div className="flex-1 min-w-52">
            <label className="block text-xs text-gray-600 mb-1">Timezone</label>
            <select name="start_timezone" defaultValue={template?.timezone ?? 'Asia/Kolkata'} className={selectCls}>
              {TIMEZONES.map((tz) => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Escalation interval */}
      <div className="w-56">
        <label className="block text-xs font-medium text-gray-700 mb-1">Escalation interval (minutes)</label>
        <input name="escalation_interval_minutes" type="number" defaultValue={template?.escalation_interval_minutes ?? 30} min={5} className={inputCls} />
      </div>

      {/* Primary + Secondary chains */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 pt-2 border-t border-gray-100">
        <ChainSelects
          prefix="escalation_chain"
          label="Primary escalation chain *"
          values={template?.escalation_chain ?? []}
          requiredFirst
        />
        <div>
          <ChainSelects
            prefix="secondary_chain"
            label="Secondary escalation chain"
            values={template?.secondary_escalation_chain ?? []}
          />
          <p className="text-xs text-gray-400 mt-2">Optional — use for alternate coverage or custom escalation scenarios.</p>
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SHIFTS & ROSTER TAB
   Shift templates (recurring CRUD) + Today's Roster (instance + assignments)
═══════════════════════════════════════════════════════════════════════════ */

function ShiftsTab({
  venue,
  shifts,
  shiftInstances,
  assignments,
  staff,
  floors,
  zones,
  rosterDate,
  editShift,
}: {
  venue: Venue;
  shifts: Shift[];
  shiftInstances: ShiftInstance[];
  assignments: StaffZoneAssignment[];
  staff: Staff[];
  floors: FloorWithZones[];
  zones: Zone[];
  rosterDate: string;
  editShift?: string;
}) {
  const closeUrl = `/venues/${venue.id}?tab=shifts`;
  const editingShift = shifts.find((s) => s.id === editShift);
  const activeStaff = staff.filter((s) => s.is_active);

  // Format date as readable
  const dateLabel = new Date(rosterDate + 'T00:00:00+05:30').toLocaleDateString(
    'en-IN',
    { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
  );

  return (
    <div className="space-y-8">
      {/* ── Section 1: Shift templates ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Shift Templates</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Recurring shift definitions. Each becomes a daily instance you assign staff to.
            </p>
          </div>
        </div>

        {/* Edit panel */}
        {editingShift && (
          <div className="bg-white rounded-2xl border border-amber-200 overflow-hidden mb-4">
            <div className="flex items-center justify-between px-6 py-3 bg-amber-50 border-b border-amber-100">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">
                  Editing Shift
                </span>
                <span className="text-gray-400">·</span>
                <span className="font-medium text-gray-900">{editingShift.name}</span>
              </div>
              <Link href={closeUrl} className="text-sm text-gray-400 hover:text-gray-700">
                ✕ Cancel
              </Link>
            </div>
            <form action={updateShiftAction} className="p-6">
              <input type="hidden" name="id" value={editingShift.id} />
              <input type="hidden" name="venue_id" value={venue.id} />
              <div className="flex gap-4 items-end flex-wrap">
                <div className="flex-[2] min-w-36">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Shift name *
                  </label>
                  <input
                    name="name"
                    required
                    defaultValue={editingShift.name}
                    className={inputCls}
                  />
                </div>
                <div className="flex-1 min-w-24">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Start *
                  </label>
                  <input
                    name="start_time"
                    type="time"
                    required
                    defaultValue={editingShift.start_time.slice(0, 5)}
                    className={inputCls}
                  />
                </div>
                <div className="flex-1 min-w-24">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    End *
                  </label>
                  <input
                    name="end_time"
                    type="time"
                    required
                    defaultValue={editingShift.end_time.slice(0, 5)}
                    className={inputCls}
                  />
                </div>
                <button type="submit" className={saveBtnCls}>Save</button>
              </div>
            </form>
          </div>
        )}

        {/* Add shift form */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Add shift template</h3>
          <form action={createShiftAction} className="flex gap-4 items-end flex-wrap">
            <input type="hidden" name="venue_id" value={venue.id} />
            <div className="flex-[2] min-w-36">
              <label className="block text-xs font-medium text-gray-700 mb-1">Name *</label>
              <input
                name="name"
                required
                placeholder="e.g. Day Shift"
                className={inputCls}
              />
            </div>
            <div className="flex-1 min-w-24">
              <label className="block text-xs font-medium text-gray-700 mb-1">Start *</label>
              <input name="start_time" type="time" required className={inputCls} />
            </div>
            <div className="flex-1 min-w-24">
              <label className="block text-xs font-medium text-gray-700 mb-1">End *</label>
              <input name="end_time" type="time" required className={inputCls} />
            </div>
            <button type="submit" className={btnCls}>Add</button>
          </form>
          <p className="text-xs text-gray-500 mt-2">
            End time before start time = wraps midnight (e.g. 22:00–06:00 night shift).
          </p>
        </div>

        {/* Templates list */}
        {shifts.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm bg-white border border-dashed border-gray-200 rounded-2xl">
            No shift templates yet. Add one above to define a recurring shift.
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={thCls}>Name</th>
                  <th className={thCls}>Time</th>
                  <th className={thCls}>Status</th>
                  <th className={`${thCls} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {shifts.map((shift) => (
                  <tr key={shift.id} className="border-t border-gray-100">
                    <td className="px-6 py-3 text-sm text-gray-900 font-medium">
                      {shift.name}
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-600 font-mono">
                      {shift.start_time.slice(0, 5)} → {shift.end_time.slice(0, 5)}
                      {shift.end_time < shift.start_time && (
                        <span className="ml-2 text-xs text-amber-600">↺ wraps</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-sm">
                      {shift.is_active ? (
                        <span className="text-emerald-700 text-xs font-medium px-2 py-0.5 rounded bg-emerald-50">
                          Active
                        </span>
                      ) : (
                        <span className="text-gray-500 text-xs font-medium px-2 py-0.5 rounded bg-gray-100">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/venues/${venue.id}?tab=shifts&edit_shift=${shift.id}`}
                          className={editLinkCls}
                        >
                          Edit
                        </Link>
                        {shift.is_active ? (
                          <form action={deactivateShiftAction} className="inline">
                            <input type="hidden" name="venue_id" value={venue.id} />
                            <input type="hidden" name="id" value={shift.id} />
                            <button type="submit" className={removeBtnCls}>
                              Deactivate
                            </button>
                          </form>
                        ) : (
                          <form action={reactivateShiftAction} className="inline">
                            <input type="hidden" name="venue_id" value={venue.id} />
                            <input type="hidden" name="id" value={shift.id} />
                            <button
                              type="submit"
                              className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded hover:bg-green-700"
                            >
                              Enable
                            </button>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Section 2: Today's Roster ── */}
      <section>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Today's Roster</h2>
            <p className="text-xs text-gray-500 mt-0.5">{dateLabel}</p>
          </div>
          <form className="flex items-center gap-2">
            <input type="hidden" name="tab" value="shifts" />
            <label className="text-xs font-medium text-gray-700">Roster date</label>
            <input
              type="date"
              name="roster_date"
              defaultValue={rosterDate}
              className={`${inputCls} w-40`}
            />
            <button type="submit" className={btnCls}>View</button>
          </form>
        </div>

        {shifts.filter((s) => s.is_active).length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm bg-white border border-dashed border-gray-200 rounded-2xl">
            No active shift templates. Add one above to start rostering.
          </div>
        ) : (
          <div className="space-y-4">
            {shifts
              .filter((s) => s.is_active)
              .map((shift) => {
                const instance = shiftInstances.find((si) => si.shift_id === shift.id);
                const instanceAssignments = instance
                  ? assignments.filter((a) => a.shift_instance_id === instance.id)
                  : [];
                const commander = instance?.commander_staff_id
                  ? staff.find((s) => s.id === instance.commander_staff_id)
                  : null;
                return (
                  <ShiftRosterCard
                    key={shift.id}
                    venueId={venue.id}
                    shift={shift}
                    rosterDate={rosterDate}
                    instance={instance ?? null}
                    commander={commander ?? null}
                    instanceAssignments={instanceAssignments}
                    staff={staff}
                    activeStaff={activeStaff}
                    floors={floors}
                    zones={zones}
                  />
                );
              })}
          </div>
        )}
      </section>
    </div>
  );
}

/* ─── ShiftRosterCard — one card per shift_template + its today instance ─── */

function ShiftRosterCard({
  venueId,
  shift,
  rosterDate,
  instance,
  commander,
  instanceAssignments,
  staff,
  activeStaff,
  floors,
  zones,
}: {
  venueId: string;
  shift: Shift;
  rosterDate: string;
  instance: ShiftInstance | null;
  commander: Staff | null;
  instanceAssignments: StaffZoneAssignment[];
  staff: Staff[];
  activeStaff: Staff[];
  floors: FloorWithZones[];
  zones: Zone[];
}) {
  const commanderEligible = activeStaff.filter((s) =>
    ['SH', 'DSH', 'SHIFT_COMMANDER'].includes(s.role),
  );

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      {/* Card header */}
      <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <div className="font-semibold text-gray-900">{shift.name}</div>
            <div className="text-xs text-gray-500 font-mono">
              {shift.start_time.slice(0, 5)} → {shift.end_time.slice(0, 5)}
            </div>
          </div>
          {instance && (
            <span
              className={`text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded ${
                instance.status === 'ACTIVE'
                  ? 'bg-emerald-100 text-emerald-700'
                  : instance.status === 'CLOSED'
                    ? 'bg-gray-200 text-gray-600'
                    : 'bg-amber-100 text-amber-700'
              }`}
            >
              {instance.status}
            </span>
          )}
          {commander && (
            <span className="text-xs text-gray-600">
              Commander: <span className="font-semibold text-gray-900">{commander.name}</span>
            </span>
          )}
        </div>

        {/* Action buttons depend on instance state */}
        {!instance && (
          <form action={createShiftInstanceAction} className="inline">
            <input type="hidden" name="venue_id" value={venueId} />
            <input type="hidden" name="shift_id" value={shift.id} />
            <input type="hidden" name="shift_date" value={rosterDate} />
            <button type="submit" className={btnCls}>
              Create instance for {rosterDate}
            </button>
          </form>
        )}

        {instance && instance.status === 'PENDING' && (
          <form action={activateShiftInstanceAction} className="inline flex items-center gap-2">
            <input type="hidden" name="venue_id" value={venueId} />
            <input type="hidden" name="id" value={instance.id} />
            <select name="commander_staff_id" required className={`${selectCls} w-44`}>
              <option value="">Select commander…</option>
              {commanderEligible.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.role})
                </option>
              ))}
            </select>
            <button type="submit" className={btnCls}>
              Activate
            </button>
          </form>
        )}

        {instance && instance.status === 'ACTIVE' && (
          <form action={closeShiftInstanceAction} className="inline">
            <input type="hidden" name="venue_id" value={venueId} />
            <input type="hidden" name="id" value={instance.id} />
            <button type="submit" className={removeBtnCls}>
              Close shift
            </button>
          </form>
        )}
      </div>

      {/* Card body — assignment grid (only when ACTIVE) */}
      {instance && instance.status === 'ACTIVE' && (
        <div className="p-6">
          <ZoneAssignmentGrid
            venueId={venueId}
            shiftInstanceId={instance.id}
            staff={activeStaff.filter((s) => !['GM', 'AUDITOR'].includes(s.role))}
            floors={floors}
            zones={zones}
            existingAssignments={instanceAssignments.map((a) => ({
              staff_id: a.staff_id,
              zone_id: a.zone_id,
              assignment_type: a.assignment_type,
            }))}
            onSubmit={replaceZoneAssignmentsAction}
          />
        </div>
      )}

      {instance && instance.status === 'PENDING' && (
        <div className="px-6 py-4 text-sm text-gray-500">
          Activate this shift to assign staff to zones.
        </div>
      )}

      {instance && instance.status === 'CLOSED' && (
        <div className="px-6 py-4 text-sm text-gray-500">
          Shift closed. {instanceAssignments.length} historical assignment
          {instanceAssignments.length === 1 ? '' : 's'} preserved.
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   EQUIPMENT TAB (BR-21 partial)
   Safety equipment with next-service-due tracking. 90/30/7-day expiry alerts
   computed at render time. Dashboard Health Score Breakdown's Equipment row
   activates with this data once the api endpoint ships in Phase B (June).
═══════════════════════════════════════════════════════════════════════════ */

const EQUIPMENT_CATEGORIES: Array<[string, string]> = [
  ['FIRE_EXTINGUISHER', 'Fire Extinguisher'],
  ['AED', 'AED (Defibrillator)'],
  ['SMOKE_DETECTOR', 'Smoke Detector'],
  ['EMERGENCY_LIGHT', 'Emergency Light'],
  ['FIRST_AID_KIT', 'First Aid Kit'],
  ['ALARM_PANEL', 'Alarm Panel'],
  ['EVACUATION_SIGN', 'Evacuation Sign'],
  ['OTHER', 'Other'],
];

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(EQUIPMENT_CATEGORIES);

/** Days until next_service_due (negative = past due) */
function daysUntilDue(dueDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + 'T00:00:00+05:30');
  return Math.floor((due.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

interface ExpiryStatus {
  label: string;
  cls: string; // tailwind classes
  rank: number; // sort order (higher = more urgent)
}

function expiryStatus(daysUntil: number): ExpiryStatus {
  if (daysUntil < 0) return { label: `OVERDUE ${Math.abs(daysUntil)}d`, cls: 'bg-red-700 text-white', rank: 5 };
  if (daysUntil <= 7) return { label: `Due in ${daysUntil}d`, cls: 'bg-red-100 text-red-700 border border-red-200', rank: 4 };
  if (daysUntil <= 30) return { label: `Due in ${daysUntil}d`, cls: 'bg-orange-100 text-orange-700 border border-orange-200', rank: 3 };
  if (daysUntil <= 90) return { label: `Due in ${daysUntil}d`, cls: 'bg-amber-100 text-amber-700 border border-amber-200', rank: 2 };
  return { label: 'OK', cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200', rank: 1 };
}

function EquipmentTab({
  venue,
  equipment,
  editEq,
}: {
  venue: Venue;
  equipment: EquipmentItem[];
  editEq?: string;
}) {
  const closeUrl = `/venues/${venue.id}?tab=equipment`;
  const editing = equipment.find((e) => e.id === editEq);

  // Compliance summary — what the future api endpoint will compute
  const active = equipment.filter((e) => e.is_active);
  const stats = {
    total: active.length,
    overdue: active.filter((e) => daysUntilDue(e.next_service_due) < 0).length,
    due7: active.filter((e) => {
      const d = daysUntilDue(e.next_service_due);
      return d >= 0 && d <= 7;
    }).length,
    due30: active.filter((e) => {
      const d = daysUntilDue(e.next_service_due);
      return d > 7 && d <= 30;
    }).length,
    due90: active.filter((e) => {
      const d = daysUntilDue(e.next_service_due);
      return d > 30 && d <= 90;
    }).length,
    ok: active.filter((e) => daysUntilDue(e.next_service_due) > 90).length,
  };
  const complianceScore = active.length === 0
    ? 100
    : Math.round((stats.ok / active.length) * 100);

  // Sort: most urgent first, then by next_service_due ascending
  const sorted = [...active].sort((a, b) => {
    const ra = expiryStatus(daysUntilDue(a.next_service_due)).rank;
    const rb = expiryStatus(daysUntilDue(b.next_service_due)).rank;
    if (ra !== rb) return rb - ra;
    return a.next_service_due.localeCompare(b.next_service_due);
  });

  return (
    <div className="space-y-6">
      {/* Compliance summary strip */}
      <section className="bg-white rounded-2xl border border-gray-200 p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Equipment Compliance</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Tracks safety equipment with next-service-due dates · 90 / 30 / 7-day expiry windows
            </p>
          </div>
          <div className="text-right">
            <div
              className={`text-3xl font-black ${
                complianceScore >= 80
                  ? 'text-emerald-700'
                  : complianceScore >= 60
                    ? 'text-amber-700'
                    : 'text-red-700'
              }`}
            >
              {complianceScore}
            </div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
              compliance score
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <StatTile label="Total" value={stats.total} tone="neutral" />
          <StatTile label="OK (>90d)" value={stats.ok} tone={stats.ok > 0 ? 'good' : 'neutral'} />
          <StatTile label="Due 30-90d" value={stats.due90} tone={stats.due90 > 0 ? 'warn' : 'neutral'} />
          <StatTile label="Due 7-30d" value={stats.due30} tone={stats.due30 > 0 ? 'warn' : 'neutral'} />
          <StatTile
            label="Due ≤7d / overdue"
            value={stats.due7 + stats.overdue}
            tone={stats.due7 + stats.overdue > 0 ? 'bad' : 'neutral'}
          />
        </div>

        <p className="text-xs text-gray-400 mt-3">
          Activates the Equipment row (10% weight) of the venue Health Score in Phase B (June 2026).
        </p>
      </section>

      {/* Edit panel */}
      {editing && (
        <div className="bg-white rounded-2xl border border-amber-200 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-3 bg-amber-50 border-b border-amber-100">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">
                Editing Equipment
              </span>
              <span className="text-gray-400">·</span>
              <span className="font-medium text-gray-900">{editing.name}</span>
            </div>
            <Link href={closeUrl} className="text-sm text-gray-400 hover:text-gray-700">
              ✕ Cancel
            </Link>
          </div>
          <form action={updateEquipmentAction} className="p-6">
            <input type="hidden" name="id" value={editing.id} />
            <input type="hidden" name="venue_id" value={venue.id} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Name *</label>
                <input
                  name="name"
                  required
                  defaultValue={editing.name}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Category *</label>
                <select name="category" required defaultValue={editing.category} className={selectCls}>
                  {EQUIPMENT_CATEGORIES.map(([v, label]) => (
                    <option key={v} value={v}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Location</label>
                <input
                  name="location_description"
                  defaultValue={editing.location_description ?? ''}
                  placeholder="e.g. T1 Reception, beside lift"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Last serviced</label>
                <input
                  name="last_serviced_at"
                  type="date"
                  defaultValue={editing.last_serviced_at ?? ''}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Next service due *</label>
                <input
                  name="next_service_due"
                  type="date"
                  required
                  defaultValue={editing.next_service_due}
                  className={inputCls}
                />
              </div>
            </div>
            <button type="submit" className={saveBtnCls}>Save changes</button>
          </form>
        </div>
      )}

      {/* Add form */}
      <section className="bg-white rounded-2xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Add equipment</h3>
        <form action={createEquipmentAction} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
          <input type="hidden" name="venue_id" value={venue.id} />
          <div className="sm:col-span-3">
            <label className="block text-xs font-medium text-gray-700 mb-1">Name *</label>
            <input
              name="name"
              required
              placeholder="e.g. FE-001 (5kg ABC)"
              className={inputCls}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">Category *</label>
            <select name="category" required className={selectCls}>
              {EQUIPMENT_CATEGORIES.map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-3">
            <label className="block text-xs font-medium text-gray-700 mb-1">Location</label>
            <input name="location_description" placeholder="T1 Reception" className={inputCls} />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">Last serviced</label>
            <input name="last_serviced_at" type="date" className={inputCls} />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">Next due *</label>
            <input name="next_service_due" type="date" required className={inputCls} />
          </div>
          <div className="sm:col-span-12">
            <button type="submit" className={btnCls}>Add equipment</button>
          </div>
        </form>
      </section>

      {/* List */}
      {equipment.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm bg-white border border-dashed border-gray-200 rounded-2xl">
          No equipment registered yet. Add fire extinguishers, AEDs, smoke detectors,
          emergency lights, etc above.
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr>
                <th className={thCls}>Name</th>
                <th className={thCls}>Category</th>
                <th className={thCls}>Location</th>
                <th className={thCls}>Next Due</th>
                <th className={thCls}>Status</th>
                <th className={`${thCls} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((eq) => {
                const days = daysUntilDue(eq.next_service_due);
                const status = expiryStatus(days);
                return (
                  <tr key={eq.id} className="border-t border-gray-100">
                    <td className="px-6 py-3 text-sm text-gray-900 font-medium">{eq.name}</td>
                    <td className="px-6 py-3 text-sm text-gray-600">
                      {CATEGORY_LABEL[eq.category] ?? eq.category}
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-500">
                      {eq.location_description ?? '—'}
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-700 font-mono">
                      {eq.next_service_due}
                    </td>
                    <td className="px-6 py-3 text-sm">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${status.cls}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/venues/${venue.id}?tab=equipment&edit_eq=${eq.id}`}
                          className={editLinkCls}
                        >
                          Edit
                        </Link>
                        <form action={deactivateEquipmentAction} className="inline">
                          <input type="hidden" name="venue_id" value={venue.id} />
                          <input type="hidden" name="id" value={eq.id} />
                          <button type="submit" className={removeBtnCls}>
                            Deactivate
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {/* Inactive (deactivated) equipment shown muted at the bottom */}
              {equipment
                .filter((e) => !e.is_active)
                .map((eq) => (
                  <tr key={eq.id} className="border-t border-gray-100 opacity-50">
                    <td className="px-6 py-3 text-sm text-gray-500 font-medium">{eq.name}</td>
                    <td className="px-6 py-3 text-sm text-gray-500">
                      {CATEGORY_LABEL[eq.category] ?? eq.category}
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-400">
                      {eq.location_description ?? '—'}
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-400 font-mono">
                      {eq.next_service_due}
                    </td>
                    <td className="px-6 py-3 text-sm">
                      <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                        Deactivated
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <form action={reactivateEquipmentAction} className="inline">
                        <input type="hidden" name="venue_id" value={venue.id} />
                        <input type="hidden" name="id" value={eq.id} />
                        <button
                          type="submit"
                          className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded hover:bg-green-700"
                        >
                          Reactivate
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'good' | 'warn' | 'bad' | 'neutral';
}) {
  const toneClass = {
    good: 'text-emerald-700',
    warn: 'text-amber-700',
    bad: 'text-red-700',
    neutral: 'text-gray-900',
  }[tone];
  return (
    <div className="bg-gray-50 rounded-lg px-3 py-2">
      <div className={`text-2xl font-bold ${toneClass}`}>{value}</div>
      <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
        {label}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   DRILLS TAB (BR-A)
   Schedule + run + document drills. Compliance score (10% of BR-14 Health
   Score) computed from recency of last completed drill.
═══════════════════════════════════════════════════════════════════════════ */

const DRILL_TYPES: Array<[string, string]> = [
  ['FIRE_EVACUATION', 'Fire Evacuation'],
  ['EARTHQUAKE', 'Earthquake'],
  ['BOMB_THREAT', 'Bomb Threat'],
  ['MEDICAL_EMERGENCY', 'Medical Emergency'],
  ['PARTIAL_EVACUATION', 'Partial Evacuation'],
  ['FULL_EVACUATION', 'Full Evacuation'],
  ['OTHER', 'Other'],
];

const DRILL_TYPE_LABEL: Record<string, string> = Object.fromEntries(DRILL_TYPES);

const DRILL_TYPE_ICON: Record<string, string> = {
  FIRE_EVACUATION: '🔥',
  EARTHQUAKE: '🌍',
  BOMB_THREAT: '💣',
  MEDICAL_EMERGENCY: '🏥',
  PARTIAL_EVACUATION: '🚪',
  FULL_EVACUATION: '🚨',
  OTHER: '⚠️',
};

const DRILL_STATUS_PILL: Record<string, string> = {
  SCHEDULED: 'bg-blue-100 text-blue-700 border border-blue-200',
  IN_PROGRESS: 'bg-amber-100 text-amber-700 border border-amber-200',
  COMPLETED: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
  CANCELLED: 'bg-gray-100 text-gray-500 border border-gray-200',
};

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds < 0) return '—';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

/** Drill compliance score formula — recency of last COMPLETED drill */
function computeDrillScore(drills: DrillSession[]): number {
  const completed = drills
    .filter((d) => d.status === 'COMPLETED' && d.ended_at !== null)
    .sort((a, b) => (b.ended_at ?? '').localeCompare(a.ended_at ?? ''));
  if (completed.length === 0) return 0;
  const days = daysSince(completed[0].ended_at!);
  if (days <= 90) return 100;
  if (days <= 180) return 75;
  if (days <= 270) return 50;
  if (days <= 365) return 25;
  return 0;
}

function DrillsTab({
  venue,
  drills,
  staff,
}: {
  venue: Venue;
  drills: DrillSession[];
  staff: Staff[];
}) {
  // Default scheduled_for to 7 days from now at 10am IST
  const defaultScheduled = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    d.setHours(10, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  })();

  // Categorise drills
  const upcoming = drills.filter((d) => d.status === 'SCHEDULED');
  const inProgress = drills.filter((d) => d.status === 'IN_PROGRESS');
  const completed = drills.filter((d) => d.status === 'COMPLETED');
  const cancelled = drills.filter((d) => d.status === 'CANCELLED');

  const score = computeDrillScore(drills);
  const lastCompleted = completed.sort((a, b) =>
    (b.ended_at ?? '').localeCompare(a.ended_at ?? ''),
  )[0];
  const daysSinceLast = lastCompleted?.ended_at ? daysSince(lastCompleted.ended_at) : null;

  const commanderEligible = staff.filter(
    (s) => s.is_active && ['SH', 'DSH', 'SHIFT_COMMANDER'].includes(s.role),
  );

  return (
    <div className="space-y-6">
      {/* Compliance summary */}
      <section className="bg-white rounded-2xl border border-gray-200 p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Drill Compliance</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Schedule + run + document. Score = recency of last completed drill (best-practice quarterly cadence).
            </p>
          </div>
          <div className="text-right">
            <div
              className={`text-3xl font-black ${
                score >= 80
                  ? 'text-emerald-700'
                  : score >= 60
                    ? 'text-amber-700'
                    : 'text-red-700'
              }`}
            >
              {score}
            </div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
              compliance score
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <DrillStatTile
            label="Last drill"
            value={daysSinceLast === null ? '—' : `${daysSinceLast}d ago`}
            tone={
              daysSinceLast === null || daysSinceLast > 180
                ? 'bad'
                : daysSinceLast > 90
                  ? 'warn'
                  : 'good'
            }
          />
          <StatTile label="Upcoming" value={upcoming.length} tone={upcoming.length > 0 ? 'good' : 'neutral'} />
          <StatTile label="Completed" value={completed.length} tone="neutral" />
          <StatTile label="Total" value={drills.length} tone="neutral" />
        </div>

        <p className="text-xs text-gray-400 mt-3">
          Activates the Drills row (10% weight) of the venue Health Score.
        </p>
      </section>

      {/* Schedule new drill */}
      <section className="bg-white rounded-2xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Schedule a new drill</h3>
        <form action={scheduleDrillAction} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
          <input type="hidden" name="venue_id" value={venue.id} />
          <div className="sm:col-span-3">
            <label className="block text-xs font-medium text-gray-700 mb-1">Drill type *</label>
            <select name="drill_type" required defaultValue="FIRE_EVACUATION" className={selectCls}>
              {DRILL_TYPES.map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-3">
            <label className="block text-xs font-medium text-gray-700 mb-1">Scheduled for *</label>
            <input
              name="scheduled_for"
              type="datetime-local"
              required
              defaultValue={defaultScheduled}
              className={inputCls}
            />
          </div>
          <div className="sm:col-span-4">
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
            <input
              name="notes"
              placeholder="Optional — internal notes / drill scenario"
              className={inputCls}
            />
          </div>
          <div className="sm:col-span-2">
            <button type="submit" className={btnCls}>Schedule</button>
          </div>
        </form>
      </section>

      {/* In progress (rare — at most 1) */}
      {inProgress.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            In progress
          </h3>
          <div className="space-y-2">
            {inProgress.map((d) => (
              <DrillCard key={d.id} drill={d} venue={venue} commanderEligible={commanderEligible} />
            ))}
          </div>
        </section>
      )}

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">
            Upcoming ({upcoming.length})
          </h3>
          <div className="space-y-2">
            {upcoming.map((d) => (
              <DrillCard key={d.id} drill={d} venue={venue} commanderEligible={commanderEligible} />
            ))}
          </div>
        </section>
      )}

      {/* Completed */}
      {completed.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">
            Completed ({completed.length})
          </h3>
          <div className="space-y-2">
            {completed.slice(0, 10).map((d) => (
              <DrillCard key={d.id} drill={d} venue={venue} commanderEligible={commanderEligible} />
            ))}
          </div>
        </section>
      )}

      {/* Cancelled — collapsed by default to reduce noise */}
      {cancelled.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-gray-500 hover:text-gray-700">
            Cancelled ({cancelled.length})
          </summary>
          <div className="space-y-2 mt-3">
            {cancelled.map((d) => (
              <DrillCard key={d.id} drill={d} venue={venue} commanderEligible={commanderEligible} />
            ))}
          </div>
        </details>
      )}

      {drills.length === 0 && (
        <div className="text-center py-12 text-gray-400 text-sm bg-white border border-dashed border-gray-200 rounded-2xl">
          No drills yet. Schedule your first drill above to start tracking compliance.
        </div>
      )}
    </div>
  );
}

function DrillStatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'good' | 'warn' | 'bad' | 'neutral';
}) {
  const toneClass = {
    good: 'text-emerald-700',
    warn: 'text-amber-700',
    bad: 'text-red-700',
    neutral: 'text-gray-900',
  }[tone];
  return (
    <div className="bg-gray-50 rounded-lg px-3 py-2">
      <div className={`text-lg font-bold ${toneClass}`}>{value}</div>
      <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
        {label}
      </div>
    </div>
  );
}

function DrillCard({
  drill,
  venue,
  commanderEligible,
}: {
  drill: DrillSession;
  venue: Venue;
  commanderEligible: Staff[];
}) {
  const icon = DRILL_TYPE_ICON[drill.drill_type] ?? '⚠️';
  const ackPercent =
    drill.total_staff_expected > 0
      ? Math.round((drill.total_staff_safe / drill.total_staff_expected) * 100)
      : 0;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4">
      <div className="flex items-start gap-3 flex-wrap">
        <span className="text-2xl shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-semibold text-gray-900">
              {DRILL_TYPE_LABEL[drill.drill_type] ?? drill.drill_type}
            </span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${DRILL_STATUS_PILL[drill.status]}`}>
              {drill.status}
            </span>
          </div>
          <div className="text-xs text-gray-500 flex flex-wrap gap-x-4 gap-y-1">
            <span>📅 Scheduled: {formatDateTime(drill.scheduled_for)}</span>
            {drill.started_at && <span>▶ Started: {formatDateTime(drill.started_at)}</span>}
            {drill.ended_at && <span>⏹ Ended: {formatDateTime(drill.ended_at)}</span>}
            {drill.duration_seconds !== null && (
              <span>⏱ {formatDuration(drill.duration_seconds)}</span>
            )}
          </div>
          {drill.status === 'COMPLETED' && drill.total_staff_expected > 0 && (
            <div className="text-xs mt-1.5 flex flex-wrap gap-x-3">
              <span className="text-gray-700 font-medium">
                Participation: {ackPercent}% ({drill.total_staff_safe}/{drill.total_staff_expected})
              </span>
              {drill.total_staff_missed > 0 && (
                <span className="text-red-600 font-medium">
                  {drill.total_staff_missed} missed
                </span>
              )}
            </div>
          )}
          {drill.notes && (
            <p className="text-xs text-gray-600 mt-1.5 italic">"{drill.notes.replace(/^\[DEMO\]\s*/, '')}"</p>
          )}
        </div>

        {/* Action buttons by status */}
        <div className="flex flex-col gap-2 shrink-0">
          {drill.status === 'SCHEDULED' && (
            <>
              <form action={startDrillAction} className="inline">
                <input type="hidden" name="venue_id" value={venue.id} />
                <input type="hidden" name="id" value={drill.id} />
                {commanderEligible[0] && (
                  <input
                    type="hidden"
                    name="started_by_staff_id"
                    value={commanderEligible[0].id}
                  />
                )}
                <button type="submit" className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium rounded">
                  ▶ Start drill
                </button>
              </form>
              <form action={cancelDrillAction} className="inline">
                <input type="hidden" name="venue_id" value={venue.id} />
                <input type="hidden" name="id" value={drill.id} />
                <button type="submit" className={removeBtnCls}>Cancel</button>
              </form>
            </>
          )}
          {drill.status === 'IN_PROGRESS' && (
            <form action={endDrillAction} className="inline">
              <input type="hidden" name="venue_id" value={venue.id} />
              <input type="hidden" name="id" value={drill.id} />
              <button type="submit" className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded">
                ⏹ End drill
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   CERTIFICATIONS TAB (BR-22 + BR-B)
   Per-staff professional credentials with expiry tracking. Compliance score
   = % of certs OK (>30d to expiry). 15% weight in BR-14 Health Score.
═══════════════════════════════════════════════════════════════════════════ */

/** Common certification names — drives the suggestions datalist */
const COMMON_CERT_NAMES = [
  'First Aid / CPR',
  'Fire Safety / Marshall',
  'Security Guard License',
  'AED Operation',
  'Hazmat / Hazardous Materials',
  'Bomb Threat Response',
  'NABH Compliance Training',
  'Occupational Health & Safety',
];

function daysUntilCertExpiry(date: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(date + 'T00:00:00+05:30');
  return Math.floor((exp.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

interface CertExpiryStyle {
  label: (d: number) => string;
  cls: string;
  rank: number;
}

const CERT_EXPIRY_STYLE: Record<string, CertExpiryStyle> = {
  EXPIRED: { label: (d) => `EXPIRED ${Math.abs(d)}d`, cls: 'bg-red-700 text-white', rank: 5 },
  DUE_7: { label: (d) => `Expires in ${d}d`, cls: 'bg-red-100 text-red-700 border border-red-200', rank: 4 },
  DUE_30: { label: (d) => `Expires in ${d}d`, cls: 'bg-orange-100 text-orange-700 border border-orange-200', rank: 3 },
  DUE_90: { label: (d) => `Expires in ${d}d`, cls: 'bg-amber-100 text-amber-700 border border-amber-200', rank: 2 },
  OK: { label: () => 'OK', cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200', rank: 1 },
};

function certBucket(daysUntil: number): keyof typeof CERT_EXPIRY_STYLE {
  if (daysUntil < 0) return 'EXPIRED';
  if (daysUntil <= 7) return 'DUE_7';
  if (daysUntil <= 30) return 'DUE_30';
  if (daysUntil <= 90) return 'DUE_90';
  return 'OK';
}

function CertificationsTab({
  venue,
  certifications,
  staff,
  editCert,
}: {
  venue: Venue;
  certifications: StaffCertification[];
  staff: Staff[];
  editCert?: string;
}) {
  const closeUrl = `/venues/${venue.id}?tab=certifications`;
  const editing = certifications.find((c) => c.id === editCert);
  const editingStaffName =
    editing && staff.find((s) => s.id === editing.staff_id)?.name;

  // Compliance: % of certs that are OK (>30d). Empty = 100 (no penalty).
  const total = certifications.length;
  const buckets = { ok: 0, due_90: 0, due_30: 0, due_7: 0, expired: 0 };
  for (const c of certifications) {
    const b = certBucket(daysUntilCertExpiry(c.expires_at));
    if (b === 'OK') buckets.ok++;
    else if (b === 'DUE_90') buckets.due_90++;
    else if (b === 'DUE_30') buckets.due_30++;
    else if (b === 'DUE_7') buckets.due_7++;
    else buckets.expired++;
  }
  const score = total === 0 ? 100 : Math.round((buckets.ok / total) * 100);

  // Sort by urgency
  const sorted = [...certifications].sort((a, b) => {
    const ra = CERT_EXPIRY_STYLE[certBucket(daysUntilCertExpiry(a.expires_at))].rank;
    const rb = CERT_EXPIRY_STYLE[certBucket(daysUntilCertExpiry(b.expires_at))].rank;
    if (ra !== rb) return rb - ra;
    return a.expires_at.localeCompare(b.expires_at);
  });

  // Staff lookup for name display
  const staffMap = new Map(staff.map((s) => [s.id, s]));

  // Active staff dropdown options (excludes deactivated)
  const activeStaff = staff.filter((s) => s.is_active);

  return (
    <div className="space-y-6">
      {/* Compliance summary */}
      <section className="bg-white rounded-2xl border border-gray-200 p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Certification Compliance</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Per-staff professional credentials · 90 / 30 / 7-day expiry windows
            </p>
          </div>
          <div className="text-right">
            <div
              className={`text-3xl font-black ${
                score >= 80
                  ? 'text-emerald-700'
                  : score >= 60
                    ? 'text-amber-700'
                    : 'text-red-700'
              }`}
            >
              {score}
            </div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
              compliance score
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <StatTile label="Total" value={total} tone="neutral" />
          <StatTile label="OK (>90d)" value={buckets.ok} tone={buckets.ok > 0 ? 'good' : 'neutral'} />
          <StatTile label="Due 30-90d" value={buckets.due_90} tone={buckets.due_90 > 0 ? 'warn' : 'neutral'} />
          <StatTile label="Due 7-30d" value={buckets.due_30} tone={buckets.due_30 > 0 ? 'warn' : 'neutral'} />
          <StatTile
            label="Due ≤7d / expired"
            value={buckets.due_7 + buckets.expired}
            tone={buckets.due_7 + buckets.expired > 0 ? 'bad' : 'neutral'}
          />
        </div>

        <p className="text-xs text-gray-400 mt-3">
          Activates the Certifications row (15% weight) of the venue Health Score.
        </p>
      </section>

      {/* Edit panel */}
      {editing && editingStaffName && (
        <div className="bg-white rounded-2xl border border-amber-200 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-3 bg-amber-50 border-b border-amber-100">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">
                Editing
              </span>
              <span className="text-gray-400">·</span>
              <span className="font-medium text-gray-900">
                {editingStaffName} — {editing.certification_name}
              </span>
            </div>
            <Link href={closeUrl} className="text-sm text-gray-400 hover:text-gray-700">
              ✕ Cancel
            </Link>
          </div>
          <form action={updateCertificationAction} className="p-6">
            <input type="hidden" name="id" value={editing.id} />
            <input type="hidden" name="venue_id" value={venue.id} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Certification name *
                </label>
                <input
                  name="certification_name"
                  required
                  defaultValue={editing.certification_name}
                  list="cert-name-suggestions"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Issued *</label>
                <input
                  name="issued_at"
                  type="date"
                  required
                  defaultValue={editing.issued_at}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Expires *</label>
                <input
                  name="expires_at"
                  type="date"
                  required
                  defaultValue={editing.expires_at}
                  className={inputCls}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Document URL
                </label>
                <input
                  name="document_url"
                  defaultValue={editing.document_url ?? ''}
                  placeholder="Optional — link to scanned certificate"
                  className={inputCls}
                />
              </div>
            </div>
            <button type="submit" className={saveBtnCls}>Save</button>
          </form>
        </div>
      )}

      {/* Add form */}
      <section className="bg-white rounded-2xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Add certification</h3>
        <form action={createCertificationAction} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
          <input type="hidden" name="venue_id" value={venue.id} />
          <div className="sm:col-span-3">
            <label className="block text-xs font-medium text-gray-700 mb-1">Staff *</label>
            <select name="staff_id" required className={selectCls}>
              <option value="">Select staff…</option>
              {activeStaff.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-3">
            <label className="block text-xs font-medium text-gray-700 mb-1">Cert name *</label>
            <input
              name="certification_name"
              required
              list="cert-name-suggestions"
              placeholder="e.g. First Aid / CPR"
              className={inputCls}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">Issued *</label>
            <input name="issued_at" type="date" required className={inputCls} />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">Expires *</label>
            <input name="expires_at" type="date" required className={inputCls} />
          </div>
          <div className="sm:col-span-2">
            <button type="submit" className={btnCls}>Add</button>
          </div>
          <datalist id="cert-name-suggestions">
            {COMMON_CERT_NAMES.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </form>
      </section>

      {/* List */}
      {certifications.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm bg-white border border-dashed border-gray-200 rounded-2xl">
          No certifications registered yet. Add the first one above.
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr>
                <th className={thCls}>Staff</th>
                <th className={thCls}>Certification</th>
                <th className={thCls}>Issued</th>
                <th className={thCls}>Expires</th>
                <th className={thCls}>Status</th>
                <th className={`${thCls} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((cert) => {
                const days = daysUntilCertExpiry(cert.expires_at);
                const bucket = certBucket(days);
                const style = CERT_EXPIRY_STYLE[bucket];
                const staffName = staffMap.get(cert.staff_id)?.name ?? '<unknown>';
                const staffRole = staffMap.get(cert.staff_id)?.role ?? '';
                return (
                  <tr key={cert.id} className="border-t border-gray-100">
                    <td className="px-6 py-3 text-sm text-gray-900 font-medium">
                      {staffName}
                      {staffRole && (
                        <span className="text-gray-500 text-xs ml-1.5">({staffRole})</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-900">{cert.certification_name}</td>
                    <td className="px-6 py-3 text-sm text-gray-500 font-mono">{cert.issued_at}</td>
                    <td className="px-6 py-3 text-sm text-gray-700 font-mono">{cert.expires_at}</td>
                    <td className="px-6 py-3 text-sm">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${style.cls}`}>
                        {style.label(days)}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/venues/${venue.id}?tab=certifications&edit_cert=${cert.id}`}
                          className={editLinkCls}
                        >
                          Edit
                        </Link>
                        <form action={deleteCertificationAction} className="inline">
                          <input type="hidden" name="venue_id" value={venue.id} />
                          <input type="hidden" name="id" value={cert.id} />
                          <button type="submit" className={removeBtnCls}>Delete</button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─── Shared styles ─────────────────────────────────────────────────────── */

const inputCls =
  'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white';

const selectCls =
  'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white';

const btnCls =
  'px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap';

const saveBtnCls =
  'px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap';

const editLinkCls =
  'px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors';

const removeBtnCls =
  'px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors';

const thCls =
  'text-left px-6 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50';
