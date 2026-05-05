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
import type { Venue, Floor, Zone, ScheduleTemplate, StaffRole, FrequencyType, EvidenceType } from '@safecommand/types';

type Tab = 'floors' | 'templates' | 'staff';

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

async function getData(id: string) {
  const client = getAdminClient();
  const [venueRes, floorsRes, zonesRes, templatesRes, staffRes] = await Promise.all([
    client.from('venues').select('*').eq('id', id).single(),
    client.from('floors').select('*').eq('venue_id', id).order('floor_number'),
    client.from('zones').select('*').eq('venue_id', id).order('name'),
    client.from('schedule_templates').select('*').eq('venue_id', id).order('title'),
    client.from('staff').select('id,name,phone,role,is_active,firebase_auth_id').eq('venue_id', id).order('name'),
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
    templates: (templatesRes.data ?? []) as ScheduleTemplate[],
    staff: (staffRes.data ?? []) as Staff[],
  };
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
  }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const activeTab = ((sp.tab ?? 'floors') as Tab);
  const data = await getData(id);
  if (!data) notFound();

  const { venue, floors, templates, staff } = data;
  const totalZones = floors.reduce((acc, f) => acc + f.zones.length, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
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
          <nav className="flex gap-6">
            {(['floors', 'Schedule Templates', 'Staff'] as const).map((_, i) => {
              const tabs: [Tab, string][] = [['floors', 'Floors & Zones'], ['templates', 'Schedule Templates'], ['staff', 'Staff']];
              const [t, label] = tabs[i]!;
              return (
                <Link key={t} href={`/venues/${id}?tab=${t}`}
                  className={`py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-900'}`}>
                  {label}
                </Link>
              );
            })}
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
