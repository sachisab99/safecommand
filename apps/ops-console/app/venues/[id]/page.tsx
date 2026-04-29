import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAdminClient } from '@/lib/supabase';
import {
  createFloorAction,
  deleteFloorAction,
  createZoneAction,
  deleteZoneAction,
  createTemplateAction,
  deleteTemplateAction,
  createStaffAction,
  deactivateStaffAction,
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

const ROLES: StaffRole[] = ['SH', 'DSH', 'SHIFT_COMMANDER', 'GM', 'AUDITOR', 'FM', 'FLOOR_SUPERVISOR', 'GROUND_STAFF'];
const FREQUENCIES: FrequencyType[] = ['HOURLY', 'EVERY_2H', 'EVERY_4H', 'EVERY_6H', 'EVERY_8H', 'DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL'];
const EVIDENCE_TYPES: EvidenceType[] = ['NONE', 'PHOTO', 'TEXT', 'NUMERIC', 'CHECKLIST'];
const ZONE_TYPES = ['ENTRANCE', 'LOBBY', 'PARKING', 'CORRIDOR', 'STAIRWELL', 'FIRE_EXIT', 'SERVER_ROOM', 'CAFETERIA', 'RESTROOM', 'OFFICE', 'STORE', 'WARD', 'ICU', 'EMERGENCY', 'OTHER'];

export default async function VenueDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab = 'floors' } = await searchParams;
  const data = await getData(id);
  if (!data) notFound();

  const { venue, floors, templates, staff } = data;
  const activeTab = (tab as Tab) ?? 'floors';

  const totalZones = floors.reduce((acc, f) => acc + f.zones.length, 0);

  return (
    <div className="min-h-screen">
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
            {([['floors', 'Floors & Zones'], ['templates', 'Schedule Templates'], ['staff', 'Staff']] as [Tab, string][]).map(([t, label]) => (
              <Link
                key={t}
                href={`/venues/${id}?tab=${t}`}
                className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === t
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-900'
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {activeTab === 'floors' && (
          <FloorsTab venue={venue} floors={floors} />
        )}
        {activeTab === 'templates' && (
          <TemplatesTab venue={venue} templates={templates} />
        )}
        {activeTab === 'staff' && (
          <StaffTab venue={venue} staff={staff} />
        )}
      </main>
    </div>
  );
}

/* ─── Floors & Zones Tab ─────────────────────────────────────────────────── */

function FloorsTab({ venue, floors }: { venue: Venue; floors: FloorWithZones[] }) {
  return (
    <div className="space-y-8">
      {/* Add floor */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Add floor</h2>
        <form action={createFloorAction} className="flex gap-3 items-end">
          <input type="hidden" name="venue_id" value={venue.id} />
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-600 mb-1">Floor number</label>
            <input name="floor_number" type="number" required min={-5} max={100} className={inputCls} placeholder="1" />
          </div>
          <div className="flex-[3]">
            <label className="block text-xs font-medium text-gray-600 mb-1">Floor name</label>
            <input name="name" required className={inputCls} placeholder="e.g. Ground Floor" />
          </div>
          <button type="submit" className={btnCls}>Add floor</button>
        </form>
      </div>

      {/* Floors list */}
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
              <div className="flex items-center gap-4">
                <span className="text-xs text-gray-400">{floor.zones.length} zone{floor.zones.length !== 1 ? 's' : ''}</span>
                <form action={deleteFloorAction}>
                  <input type="hidden" name="venue_id" value={venue.id} />
                  <input type="hidden" name="id" value={floor.id} />
                  <button type="submit" className="text-xs text-red-500 hover:text-red-700">Remove</button>
                </form>
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
                    <th className="px-6 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {floor.zones.map((z) => (
                    <tr key={z.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 font-medium text-gray-900">{z.name}</td>
                      <td className="px-6 py-3 text-gray-500 text-xs">{z.zone_type}</td>
                      <td className="px-6 py-3 text-gray-500 text-xs">{z.two_person_required ? '✓ Yes' : '—'}</td>
                      <td className="px-6 py-3 text-right">
                        <form action={deleteZoneAction} className="inline">
                          <input type="hidden" name="venue_id" value={venue.id} />
                          <input type="hidden" name="id" value={z.id} />
                          <button type="submit" className="text-xs text-red-500 hover:text-red-700">Remove</button>
                        </form>
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
                  <label className="block text-xs font-medium text-gray-600 mb-1">Zone name</label>
                  <input name="name" required className={inputCls} placeholder="e.g. North Entrance" />
                </div>
                <div className="flex-1 min-w-28">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Zone type</label>
                  <select name="zone_type" required className={selectCls}>
                    <option value="">Select</option>
                    {ZONE_TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                  </select>
                </div>
                <div className="flex items-end gap-2 pb-0.5">
                  <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
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

/* ─── Templates Tab ─────────────────────────────────────────────────────── */

function TemplatesTab({ venue, templates }: { venue: Venue; templates: ScheduleTemplate[] }) {
  return (
    <div className="space-y-6">
      {/* Add template */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Add schedule template</h2>
        <form action={createTemplateAction} className="space-y-4">
          <input type="hidden" name="venue_id" value={venue.id} />

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Title *</label>
              <input name="title" required className={inputCls} placeholder="e.g. Fire Exit Check — Ground Floor" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
              <input name="description" className={inputCls} placeholder="Optional details" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Frequency *</label>
              <select name="frequency" required className={selectCls}>
                <option value="">Select</option>
                {FREQUENCIES.map((f) => <option key={f} value={f}>{f.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Assigned role *</label>
              <select name="assigned_role" required className={selectCls}>
                <option value="">Select</option>
                {ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Evidence type *</label>
              <select name="evidence_type" required className={selectCls}>
                {EVIDENCE_TYPES.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Escalation interval (min)</label>
              <input name="escalation_interval_minutes" type="number" defaultValue={30} min={5} className={inputCls} />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Escalation chain <span className="text-gray-400 font-normal">(comma-separated roles, e.g. FLOOR_SUPERVISOR,SHIFT_COMMANDER,SH)</span>
              </label>
              <input name="escalation_chain" className={inputCls} placeholder="FLOOR_SUPERVISOR,SHIFT_COMMANDER,SH" />
            </div>
          </div>

          <div className="flex justify-end">
            <button type="submit" className={btnCls}>Add template</button>
          </div>
        </form>
      </div>

      {/* Templates list */}
      {templates.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No templates yet.</p>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className={thCls}>Title</th>
                <th className={thCls}>Frequency</th>
                <th className={thCls}>Role</th>
                <th className={thCls}>Evidence</th>
                <th className={thCls}>Escalation chain</th>
                <th className="px-6 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {templates.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium text-gray-900">{t.title}</td>
                  <td className="px-6 py-3 text-gray-500 text-xs">{t.frequency.replace(/_/g, ' ')}</td>
                  <td className="px-6 py-3 text-gray-500 text-xs">{t.assigned_role.replace(/_/g, ' ')}</td>
                  <td className="px-6 py-3 text-gray-500 text-xs">{t.evidence_type}</td>
                  <td className="px-6 py-3 text-gray-400 text-xs font-mono">{t.escalation_chain.join(' → ') || '—'}</td>
                  <td className="px-6 py-3 text-right">
                    <form action={deleteTemplateAction} className="inline">
                      <input type="hidden" name="venue_id" value={venue.id} />
                      <input type="hidden" name="id" value={t.id} />
                      <button type="submit" className="text-xs text-red-500 hover:text-red-700">Remove</button>
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

/* ─── Staff Tab ─────────────────────────────────────────────────────────── */

function StaffTab({ venue, staff }: { venue: Venue; staff: Staff[] }) {
  return (
    <div className="space-y-6">
      {/* Add staff */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-1">Add staff member</h2>
        <p className="text-xs text-gray-400 mb-4">
          Create the initial Security Head (SH) account here. The SH can then add remaining staff via the mobile app.
        </p>
        <form action={createStaffAction} className="flex gap-3 items-end flex-wrap">
          <input type="hidden" name="venue_id" value={venue.id} />
          <div className="flex-[2] min-w-36">
            <label className="block text-xs font-medium text-gray-600 mb-1">Full name *</label>
            <input name="name" required className={inputCls} placeholder="e.g. Rajesh Kumar" />
          </div>
          <div className="flex-[2] min-w-36">
            <label className="block text-xs font-medium text-gray-600 mb-1">Phone (E.164) *</label>
            <input name="phone" required className={inputCls} placeholder="+919876543210" pattern="^\+[1-9]\d{6,14}$" />
          </div>
          <div className="flex-1 min-w-28">
            <label className="block text-xs font-medium text-gray-600 mb-1">Role *</label>
            <select name="role" required className={selectCls} defaultValue="SH">
              {ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <button type="submit" className={btnCls}>Add staff</button>
        </form>
      </div>

      {/* Staff list */}
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
                <th className={thCls}>Firebase Auth</th>
                <th className={thCls}>Status</th>
                <th className="px-6 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {staff.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium text-gray-900">{s.name}</td>
                  <td className="px-6 py-3 text-gray-500 font-mono text-xs">{s.phone}</td>
                  <td className="px-6 py-3 text-gray-500 text-xs">{s.role.replace(/_/g, ' ')}</td>
                  <td className="px-6 py-3 text-xs">
                    {s.firebase_auth_id ? (
                      <span className="text-green-600">✓ Linked</span>
                    ) : (
                      <span className="text-gray-400">Not yet — first login links it</span>
                    )}
                  </td>
                  <td className="px-6 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${s.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {s.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right">
                    {s.is_active && (
                      <form action={deactivateStaffAction} className="inline">
                        <input type="hidden" name="venue_id" value={venue.id} />
                        <input type="hidden" name="id" value={s.id} />
                        <button type="submit" className="text-xs text-red-500 hover:text-red-700">Deactivate</button>
                      </form>
                    )}
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

/* ─── Shared styles ─────────────────────────────────────────────────────── */

const inputCls =
  'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';

const selectCls =
  'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white';

const btnCls =
  'px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap';

const thCls =
  'text-left px-6 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider';
