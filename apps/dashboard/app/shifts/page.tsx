'use client';

/**
 * /shifts — venue Shifts & Roster (BR-04 / BR-12 / BR-13 / BR-19 / BR-61).
 *
 * Phase 5.16 — venue-dashboard write surface for shift instance lifecycle
 * + zone assignment, parallel to the Ops Console roster module. Read API:
 * the existing Zone Accountability surface auto-populates once these rows
 * exist, closing the loop end-to-end.
 *
 * Workflow (industry pattern: Quinyx / Deputy / When I Work):
 *   1. Pick date (default today)
 *   2. For each active shift template, see today's instance state:
 *        none yet      → [Create instance]
 *        PENDING       → [Activate] (commander selector)
 *        ACTIVE        → expand row to manage zone assignments + [Close shift]
 *        CLOSED        → read-only chip
 *   3. Zone assignment grid is bulk-replace: full grid state submitted once
 *      with server-side 2-person validation
 *
 * Refs: docs/api/conventions.md §19 entity lifecycle.
 */

import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { apiFetch } from '../../lib/api';
import { getSession } from '../../lib/auth';

/* ─── Write helpers (Phase 5.16 — SH/DSH/SHIFT_COMMANDER) ───────────────── */

const COMMAND_ROLES = ['SH', 'DSH', 'SHIFT_COMMANDER'];

async function postShiftInstance(payload: { shift_id: string; shift_date: string }) {
  return apiFetch('/shift-instances', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

async function activateInstance(id: string, commander_staff_id: string) {
  return apiFetch(`/shift-instances/${id}/activate`, {
    method: 'PUT',
    body: JSON.stringify({ commander_staff_id }),
  });
}

async function closeInstance(id: string) {
  return apiFetch(`/shift-instances/${id}/close`, { method: 'PUT' });
}

async function putAssignments(
  id: string,
  assignments: { staff_id: string; zone_id: string; assignment_type: 'PRIMARY' | 'SECONDARY' | 'BACKUP' }[],
) {
  return apiFetch(`/shift-instances/${id}/zone-assignments`, {
    method: 'PUT',
    body: JSON.stringify({ assignments }),
  });
}

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface ShiftTemplate {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  building_id: string | null;
}

interface ShiftInstance {
  id: string;
  venue_id: string;
  shift_id: string;
  shift_date: string;
  status: 'PENDING' | 'ACTIVE' | 'CLOSED';
  commander_staff_id: string | null;
  activated_at: string | null;
  shift: { id: string; name: string; start_time: string; end_time: string } | null;
  commander: { id: string; name: string; role: string } | null;
}

interface StaffRef {
  id: string;
  name: string;
  role: string;
  is_active: boolean;
}

interface ZoneRow {
  id: string;
  name: string;
  zone_type: string;
  two_person_required: boolean;
  floor_id: string;
  floors: { id: string; name: string; floor_number: number } | null;
}

interface AssignmentRow {
  id: string;
  staff_id: string;
  zone_id: string;
  assignment_type: 'PRIMARY' | 'SECONDARY' | 'BACKUP';
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function todayDate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const STATUS_CLS: Record<ShiftInstance['status'], string> = {
  PENDING: 'bg-slate-100 text-slate-700 border border-slate-200',
  ACTIVE: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
  CLOSED: 'bg-slate-100 text-slate-500 border border-slate-200',
};

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function ShiftsPage() {
  const [date, setDate] = useState<string>(todayDate());
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [instances, setInstances] = useState<ShiftInstance[]>([]);
  const [staff, setStaff] = useState<StaffRef[]>([]);
  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [staffRole, setStaffRole] = useState<string | null>(null);
  const [activateTarget, setActivateTarget] = useState<ShiftInstance | null>(null);
  const [expandedInstanceId, setExpandedInstanceId] = useState<string | null>(null);

  const canWrite = staffRole !== null && COMMAND_ROLES.includes(staffRole);

  useEffect(() => {
    const session = getSession();
    if (session) setStaffRole(session.staff.role);
  }, []);

  const refetch = async () => {
    setLoading(true);
    const [
      { data: tplData, error: tplErr },
      { data: instData, error: instErr },
      { data: staffData },
      { data: zoneData },
    ] = await Promise.all([
      apiFetch<ShiftTemplate[]>('/shifts'),
      apiFetch<ShiftInstance[]>(`/shift-instances?date=${date}`),
      apiFetch<StaffRef[]>('/staff'),
      apiFetch<ZoneRow[]>('/zones/accountability'),
    ]);
    setLoading(false);
    if (tplErr || instErr) {
      setError(tplErr ?? instErr);
      return;
    }
    setError(null);
    setTemplates(tplData ?? []);
    setInstances(instData ?? []);
    setStaff((staffData ?? []).filter((s) => s.is_active));
    setZones(zoneData ?? []);
  };

  useEffect(() => {
    void refetch();
    // refetch when date changes
  }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = async (template: ShiftTemplate) => {
    const { error: e } = await postShiftInstance({ shift_id: template.id, shift_date: date });
    if (e) {
      window.alert(`Could not create instance: ${e}`);
      return;
    }
    await refetch();
  };

  const handleClose = async (instance: ShiftInstance) => {
    if (!window.confirm(`Close "${instance.shift?.name ?? 'shift'}"? This cannot be undone.`)) return;
    const { error: e } = await closeInstance(instance.id);
    if (e) {
      window.alert(`Could not close shift: ${e}`);
      return;
    }
    if (expandedInstanceId === instance.id) setExpandedInstanceId(null);
    await refetch();
  };

  // Index: shift_id → instance (for current date)
  const instanceByShift = useMemo(() => {
    const m = new Map<string, ShiftInstance>();
    for (const i of instances) m.set(i.shift_id, i);
    return m;
  }, [instances]);

  return (
    <AppShell>
      <div
        className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <div className="mb-4 sm:mb-6 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Shifts &amp; Roster</h1>
            <p className="text-slate-500 text-sm mt-1">
              Activate today&rsquo;s shifts and assign staff to zones · drives Zone Accountability
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-700">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {date !== todayDate() && (
              <button
                onClick={() => setDate(todayDate())}
                className="px-2 py-1 text-xs text-blue-600 hover:underline"
              >
                Today
              </button>
            )}
          </div>
        </div>

        {!canWrite && staffRole !== null && (
          <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-3 text-amber-800 text-sm">
            Read-only view. Only Security Head, Deputy Security Head, and Shift Commander can
            activate shifts and assign zones.
          </div>
        )}

        {loading && <div className="text-slate-400 text-sm">Loading shifts…</div>}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
            {error}
          </div>
        )}

        {!loading && !error && templates.length === 0 && (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">🛡</div>
            <div className="font-semibold text-slate-700">No shift templates configured</div>
            <p className="text-slate-500 text-sm mt-2 max-w-md mx-auto">
              Shift templates are configured by SafeCommand Operations during venue onboarding.
              Contact your account manager to add shifts (e.g. Day 09:00–18:00, Night 22:00–06:00).
            </p>
          </div>
        )}

        {!loading && !error && templates.length > 0 && (
          <section className="space-y-3">
            {templates.map((template) => {
              const inst = instanceByShift.get(template.id) ?? null;
              const expanded = inst !== null && inst.id === expandedInstanceId;
              return (
                <ShiftCard
                  key={template.id}
                  template={template}
                  instance={inst}
                  date={date}
                  canWrite={canWrite}
                  expanded={expanded}
                  onCreate={() => handleCreate(template)}
                  onActivate={() => inst && setActivateTarget(inst)}
                  onClose={() => inst && handleClose(inst)}
                  onToggleExpand={() => {
                    if (!inst) return;
                    setExpandedInstanceId(expanded ? null : inst.id);
                  }}
                  zones={zones}
                  staff={staff}
                  onAssignmentsSaved={() => void refetch()}
                />
              );
            })}
          </section>
        )}
      </div>

      <ActivateModal
        instance={activateTarget}
        staff={staff.filter((s) => COMMAND_ROLES.includes(s.role))}
        onClose={() => setActivateTarget(null)}
        onActivated={async () => {
          setActivateTarget(null);
          await refetch();
        }}
      />
    </AppShell>
  );
}

/* ─── Sub-components ─────────────────────────────────────────────────────── */

function ShiftCard({
  template,
  instance,
  date,
  canWrite,
  expanded,
  onCreate,
  onActivate,
  onClose,
  onToggleExpand,
  zones,
  staff,
  onAssignmentsSaved,
}: {
  template: ShiftTemplate;
  instance: ShiftInstance | null;
  date: string;
  canWrite: boolean;
  expanded: boolean;
  onCreate: () => void;
  onActivate: () => void;
  onClose: () => void;
  onToggleExpand: () => void;
  zones: ZoneRow[];
  staff: StaffRef[];
  onAssignmentsSaved: () => void;
}) {
  const status = instance?.status;
  const isPast = date < todayDate();

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
      <div className="p-5 sm:p-6 flex items-start gap-3 sm:gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-slate-900 text-lg">{template.name}</span>
            <span className="text-slate-500 text-sm">
              {template.start_time.slice(0, 5)} – {template.end_time.slice(0, 5)}
            </span>
            {status && (
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${STATUS_CLS[status]}`}
              >
                {status}
              </span>
            )}
          </div>
          {instance?.commander && (
            <div className="text-xs text-slate-500 mt-1">
              Commander: <span className="font-medium text-slate-700">{instance.commander.name}</span>{' '}
              · {instance.commander.role}
              {instance.activated_at && (
                <>
                  {' '}· activated{' '}
                  {new Date(instance.activated_at).toLocaleString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 shrink-0">
          {!instance && canWrite && !isPast && (
            <button
              onClick={onCreate}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              Create instance
            </button>
          )}
          {instance?.status === 'PENDING' && canWrite && (
            <button
              onClick={onActivate}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
            >
              ▶ Activate
            </button>
          )}
          {instance?.status === 'ACTIVE' && (
            <>
              <button
                onClick={onToggleExpand}
                className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                {expanded ? 'Collapse' : 'Manage assignments'}
              </button>
              {canWrite && (
                <button
                  onClick={onClose}
                  className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 rounded-lg transition-colors"
                >
                  ■ Close
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {expanded && instance && (
        <div className="border-t border-slate-100 p-5 sm:p-6 bg-slate-50">
          <ZoneAssignmentEditor
            instance={instance}
            zones={zones}
            staff={staff}
            canWrite={canWrite}
            onSaved={onAssignmentsSaved}
          />
        </div>
      )}
    </div>
  );
}

function ActivateModal({
  instance,
  staff,
  onClose,
  onActivated,
}: {
  instance: ShiftInstance | null;
  staff: StaffRef[];
  onClose: () => void;
  onActivated: () => Promise<void>;
}) {
  const [commanderId, setCommanderId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!instance) return;
    setCommanderId('');
    setErr(null);
    setSubmitting(false);
  }, [instance]);

  useEffect(() => {
    if (!instance) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [instance, onClose]);

  if (!instance) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commanderId) {
      setErr('Select a commander');
      return;
    }
    setSubmitting(true);
    setErr(null);
    const { error: e2 } = await activateInstance(instance.id, commanderId);
    if (e2) {
      setErr(e2);
      setSubmitting(false);
      return;
    }
    await onActivated();
    setSubmitting(false);
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} aria-hidden="true" />
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-label="Activate shift"
      >
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
          <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold text-slate-900 text-lg">
              Activate {instance.shift?.name ?? 'shift'}
            </h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 text-xl px-2"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Shift Commander *
              </label>
              <select
                value={commanderId}
                onChange={(e) => setCommanderId(e.target.value)}
                required
                autoFocus
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— Select commander —</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.role}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                Only Security Head, Deputy Security Head, and Shift Commander can lead a shift.
              </p>
            </div>
            {err && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
                {err}
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
              >
                {submitting ? 'Activating…' : 'Activate shift'}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2.5 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

/* ─── Zone Assignment editor — bulk-replace grid ─────────────────────────── */

function ZoneAssignmentEditor({
  instance,
  zones,
  staff,
  canWrite,
  onSaved,
}: {
  instance: ShiftInstance;
  zones: ZoneRow[];
  staff: StaffRef[];
  canWrite: boolean;
  onSaved: () => void;
}) {
  // Local desired state — Map<zone_id, Set<staff_id>>
  // assignment_type defaults to PRIMARY for now (matches Ops Console default;
  // SECONDARY/BACKUP UI is a follow-up).
  const [coverage, setCoverage] = useState<Map<string, Set<string>>>(new Map());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const { data, error: e } = await apiFetch<AssignmentRow[]>(
        `/shift-instances/${instance.id}/zone-assignments`,
      );
      if (cancelled) return;
      setLoading(false);
      if (e) {
        setErr(e);
        return;
      }
      const m = new Map<string, Set<string>>();
      for (const a of data ?? []) {
        const set = m.get(a.zone_id) ?? new Set<string>();
        set.add(a.staff_id);
        m.set(a.zone_id, set);
      }
      setCoverage(m);
      setErr(null);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [instance.id]);

  const toggle = (zoneId: string, staffId: string) => {
    setCoverage((prev) => {
      const next = new Map(prev);
      const set = new Set(next.get(zoneId) ?? new Set<string>());
      if (set.has(staffId)) set.delete(staffId);
      else set.add(staffId);
      if (set.size === 0) next.delete(zoneId);
      else next.set(zoneId, set);
      return next;
    });
  };

  // Floor-grouped zones
  const zonesByFloor = useMemo(() => {
    const m = new Map<string, { floor: ZoneRow['floors']; zones: ZoneRow[] }>();
    for (const z of zones) {
      const key = z.floor_id;
      const existing = m.get(key) ?? { floor: z.floors, zones: [] };
      existing.zones.push(z);
      m.set(key, existing);
    }
    return [...m.values()].sort(
      (a, b) => (a.floor?.floor_number ?? 0) - (b.floor?.floor_number ?? 0),
    );
  }, [zones]);

  // Client-side 2-person validation preview
  const violations = useMemo(() => {
    const v: string[] = [];
    for (const z of zones) {
      if (!z.two_person_required) continue;
      const count = coverage.get(z.id)?.size ?? 0;
      if (count > 0 && count < 2) v.push(z.name);
    }
    return v;
  }, [zones, coverage]);

  const handleSave = async () => {
    if (violations.length > 0) {
      setErr(
        `Two-person zones with only one staff: ${violations.join(', ')}. Add another staff or unassign.`,
      );
      return;
    }
    setSubmitting(true);
    setErr(null);
    const assignments: { staff_id: string; zone_id: string; assignment_type: 'PRIMARY' }[] = [];
    for (const [zoneId, staffSet] of coverage.entries()) {
      for (const staffId of staffSet) {
        assignments.push({ staff_id: staffId, zone_id: zoneId, assignment_type: 'PRIMARY' });
      }
    }
    const { error: e } = await putAssignments(instance.id, assignments);
    setSubmitting(false);
    if (e) {
      setErr(e);
      return;
    }
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
    onSaved();
  };

  if (loading) {
    return <div className="text-slate-400 text-sm">Loading current assignments…</div>;
  }

  if (zones.length === 0) {
    return (
      <div className="text-slate-500 text-sm">
        No zones configured for this venue. Zones are added via Operations Console.
      </div>
    );
  }

  const totalAssignments = [...coverage.values()].reduce((sum, set) => sum + set.size, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-bold text-slate-900 text-sm">Zone Assignments</h3>
          <p className="text-slate-500 text-xs mt-0.5">
            Toggle staff per zone. {totalAssignments} assignments staged ·{' '}
            {coverage.size} of {zones.length} zones covered.
          </p>
        </div>
        {canWrite && (
          <div className="flex items-center gap-2">
            {savedFlash && <span className="text-emerald-600 text-xs">✓ Saved</span>}
            <button
              onClick={handleSave}
              disabled={submitting || violations.length > 0}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors"
            >
              {submitting ? 'Saving…' : 'Save assignments'}
            </button>
          </div>
        )}
      </div>

      {err && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
          {err}
        </div>
      )}
      {violations.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-800 text-xs">
          ⚠ Two-person zones with only one staff: <strong>{violations.join(', ')}</strong>. Save
          will fail until resolved.
        </div>
      )}

      <div className="space-y-4">
        {zonesByFloor.map(({ floor, zones: floorZones }) => (
          <div
            key={floor?.id ?? 'unknown'}
            className="bg-white rounded-xl border border-slate-200 overflow-hidden"
          >
            <div className="px-4 py-2 bg-slate-100 border-b border-slate-200">
              <span className="text-xs font-bold text-slate-700">
                {floor?.name ?? 'Unassigned'} {floor && `(F${floor.floor_number})`}
              </span>
            </div>
            <div className="divide-y divide-slate-100">
              {floorZones.map((z) => {
                const assigned = coverage.get(z.id) ?? new Set<string>();
                const count = assigned.size;
                const violation = z.two_person_required && count > 0 && count < 2;
                return (
                  <div key={z.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-slate-900 text-sm">{z.name}</span>
                        <span className="text-[10px] font-mono text-slate-400">
                          {z.zone_type}
                        </span>
                        {z.two_person_required && (
                          <span className="px-1.5 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-700 text-[10px] font-bold">
                            2-PERSON
                          </span>
                        )}
                        {violation && (
                          <span className="text-amber-700 text-[10px] font-semibold">
                            ⚠ Needs +1 staff
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-500">
                        {count} assigned
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {staff.map((s) => {
                        const on = assigned.has(s.id);
                        return (
                          <button
                            key={s.id}
                            type="button"
                            disabled={!canWrite}
                            onClick={() => toggle(z.id, s.id)}
                            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                              on
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                            } ${!canWrite ? 'opacity-60 cursor-not-allowed' : ''}`}
                            title={`${s.name} · ${s.role}`}
                          >
                            {s.name.split(' ')[0]} · {s.role}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
