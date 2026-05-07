'use client';

/**
 * /staff — venue staff directory + management (BR-04 / BR-13).
 *
 * Phase 5.17 — write surfaces parallel to mobile StaffScreen:
 *   "+ Add staff"     SH/DSH (api: POST /v1/staff requireRole SH/DSH;
 *                              role allow-list excludes SH to prevent
 *                              self-promotion bypass)
 *   Edit (per-row)    SH only  (api: PATCH /v1/staff/:id requireRole SH)
 *   Deactivate        SH only  (api: PATCH /v1/staff/:id { is_active: false })
 *   Reactivate        SH only
 *
 * Hydration-safe role read post-mount via useEffect (matches Drawer
 * pattern; avoids SSR/CSR HTML mismatch warning).
 */

import { useEffect, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { apiFetch } from '../../lib/api';
import { getSession } from '../../lib/auth';

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface Staff {
  id: string;
  name: string;
  phone: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

/* ─── Role allow-list (must match server SH_DSH_CREATABLE_ROLES exactly) ── */

const CREATABLE_ROLES: { value: string; label: string }[] = [
  { value: 'DSH', label: 'Deputy Security Head' },
  { value: 'SHIFT_COMMANDER', label: 'Shift Commander' },
  { value: 'GM', label: 'General Manager' },
  { value: 'AUDITOR', label: 'Auditor' },
  { value: 'FM', label: 'Facility Manager' },
  { value: 'FLOOR_SUPERVISOR', label: 'Floor Supervisor' },
  { value: 'GROUND_STAFF', label: 'Ground Staff' },
];

const ROLE_LABEL: Record<string, string> = {
  SH: 'Security Head',
  DSH: 'Deputy Security Head',
  SHIFT_COMMANDER: 'Shift Commander',
  GM: 'General Manager',
  AUDITOR: 'Auditor',
  FM: 'Facility Manager',
  FLOOR_SUPERVISOR: 'Floor Supervisor',
  GROUND_STAFF: 'Ground Staff',
};

const ROLE_COLOR: Record<string, string> = {
  SH:               'bg-red-100 text-red-700',
  DSH:              'bg-orange-100 text-orange-700',
  GM:               'bg-purple-100 text-purple-700',
  SHIFT_COMMANDER:  'bg-blue-100 text-blue-700',
  FLOOR_SUPERVISOR: 'bg-sky-100 text-sky-700',
  FM:               'bg-teal-100 text-teal-700',
  AUDITOR:          'bg-slate-100 text-slate-600',
  GROUND_STAFF:     'bg-slate-100 text-slate-600',
};

/* ─── Write helpers ──────────────────────────────────────────────────────── */

async function postStaff(payload: { phone: string; name: string; role: string }) {
  return apiFetch<Staff>('/staff', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

async function patchStaff(id: string, payload: Partial<{ name: string; role: string; is_active: boolean }>) {
  return apiFetch<Staff>(`/staff/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

/* ─── Phone helpers — display friendly, transmit canonical +91XXXXXXXXXX ─── */

function formatPhone(canonical: string): string {
  // +919876543210 → +91 98765 43210
  if (!canonical.startsWith('+91') || canonical.length !== 13) return canonical;
  const d = canonical.slice(3);
  return `+91 ${d.slice(0, 5)} ${d.slice(5)}`;
}

function normalizePhone(input: string): string {
  // Strip non-digits except leading + ; ensure +91 prefix; cap at +91 + 10 digits.
  let s = input.replace(/[^\d+]/g, '');
  if (!s.startsWith('+91')) {
    s = '+91' + s.replace(/^\+?91/, '');
  }
  const digits = s.slice(3).replace(/\D/g, '').slice(0, 10);
  return '+91' + digits;
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function StaffPage() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  // Phase 5.17 write-surface state
  const [staffRole, setStaffRole] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [actionInFlight, setActionInFlight] = useState<string | null>(null);
  const canAdd = staffRole === 'SH' || staffRole === 'DSH';
  const canEdit = staffRole === 'SH'; // PATCH gated to SH only by api

  useEffect(() => {
    const session = getSession();
    if (session) setStaffRole(session.staff.role);
  }, []);

  const refetch = async () => {
    const { data, error: e } = await apiFetch<Staff[]>('/staff');
    setLoading(false);
    if (e || !data) {
      setError(e ?? 'Load failed');
      return;
    }
    setError('');
    setStaff(data);
  };

  useEffect(() => {
    void refetch();
  }, []);

  const handleSetActive = async (s: Staff, next: boolean) => {
    const verb = next ? 'Reactivate' : 'Deactivate';
    if (!window.confirm(`${verb} ${s.name}?`)) return;
    setActionInFlight(s.id);
    const { error: e } = await patchStaff(s.id, { is_active: next });
    setActionInFlight(null);
    if (e) {
      window.alert(`Could not ${verb.toLowerCase()}: ${e}`);
      return;
    }
    await refetch();
  };

  const displayed = staff.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.role.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <AppShell>
      <div className="p-8 max-w-5xl mx-auto">
        <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Staff</h1>
            <p className="text-slate-500 text-sm mt-1">
              {staff.length} total · {staff.filter((s) => s.is_active).length} active
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or role…"
              className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 w-56"
            />
            {canAdd && (
              <button
                onClick={() => setAddOpen(true)}
                className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors min-h-[40px]"
              >
                <span aria-hidden="true">+</span> Add staff
              </button>
            )}
          </div>
        </div>

        {loading && <div className="text-slate-400 text-sm">Loading…</div>}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm mb-4">
            {error}
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="text-left px-5 py-3 text-slate-500 font-semibold text-xs uppercase tracking-wide">
                  Name
                </th>
                <th className="text-left px-5 py-3 text-slate-500 font-semibold text-xs uppercase tracking-wide">
                  Role
                </th>
                <th className="text-left px-5 py-3 text-slate-500 font-semibold text-xs uppercase tracking-wide">
                  Phone
                </th>
                <th className="text-left px-5 py-3 text-slate-500 font-semibold text-xs uppercase tracking-wide">
                  Status
                </th>
                {canEdit && (
                  <th className="text-right px-5 py-3 text-slate-500 font-semibold text-xs uppercase tracking-wide">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {displayed.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-700 font-bold text-xs shrink-0">
                        {s.name.slice(0, 2).toUpperCase()}
                      </div>
                      <span className="font-medium text-slate-900">{s.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                        ROLE_COLOR[s.role] ?? 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {s.role.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-slate-500 font-mono text-xs">
                    {formatPhone(s.phone)}
                  </td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        s.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {s.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  {canEdit && (
                    <td className="px-5 py-3.5 text-right">
                      <div className="inline-flex gap-1">
                        <button
                          onClick={() => setEditingStaff(s)}
                          disabled={actionInFlight === s.id}
                          className="px-2.5 py-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 disabled:opacity-50 transition-colors"
                          aria-label={`Edit ${s.name}`}
                        >
                          Edit
                        </button>
                        {s.is_active ? (
                          <button
                            onClick={() => void handleSetActive(s, false)}
                            disabled={actionInFlight === s.id}
                            className="px-2.5 py-1 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
                            aria-label={`Deactivate ${s.name}`}
                          >
                            Deactivate
                          </button>
                        ) : (
                          <button
                            onClick={() => void handleSetActive(s, true)}
                            disabled={actionInFlight === s.id}
                            className="px-2.5 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 disabled:opacity-50 transition-colors"
                            aria-label={`Reactivate ${s.name}`}
                          >
                            Reactivate
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && displayed.length === 0 && (
            <div className="text-center py-12 text-slate-400">No staff found</div>
          )}
        </div>
      </div>

      <AddStaffModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={async () => {
          setAddOpen(false);
          await refetch();
        }}
      />
      <EditStaffModal
        editing={editingStaff}
        onClose={() => setEditingStaff(null)}
        onSaved={async () => {
          setEditingStaff(null);
          await refetch();
        }}
      />
    </AppShell>
  );
}

/* ─── AddStaffModal ──────────────────────────────────────────────────────── */

function AddStaffModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+91');
  const [role, setRole] = useState('GROUND_STAFF');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName('');
    setPhone('+91');
    setRole('GROUND_STAFF');
    setErr(null);
    setSubmitting(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const validate = (): string | null => {
    if (name.trim().length < 2) return 'Name must be at least 2 characters';
    if (!/^\+91\d{10}$/.test(phone)) return 'Phone must be +91 followed by 10 digits';
    if (!CREATABLE_ROLES.find((r) => r.value === role)) return 'Invalid role';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = validate();
    if (v) {
      setErr(v);
      return;
    }
    setSubmitting(true);
    setErr(null);
    const { error: e2 } = await postStaff({
      name: name.trim(),
      phone,
      role,
    });
    if (e2) {
      setErr(e2);
      setSubmitting(false);
      return;
    }
    await onSaved();
    setSubmitting(false);
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} aria-hidden="true" />
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-label="Add staff"
      >
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
          <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold text-slate-900 text-lg">Add staff</h2>
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
              <label className="block text-xs font-medium text-slate-700 mb-1">Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Full name"
                autoFocus
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Phone (+91) *
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(normalizePhone(e.target.value))}
                required
                placeholder="+91 98765 43210"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 font-mono placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                E.164 format. The +91 prefix is enforced; enter the 10-digit number after.
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Role *</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {CREATABLE_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                Security Head cannot be created from this surface (server-enforced; created by SafeCommand Operations only).
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
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
              >
                {submitting ? 'Saving…' : 'Add staff'}
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

/* ─── EditStaffModal ─────────────────────────────────────────────────────── */

function EditStaffModal({
  editing,
  onClose,
  onSaved,
}: {
  editing: Staff | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) return;
    setName(editing.name);
    setRole(editing.role);
    setErr(null);
    setSubmitting(false);
  }, [editing]);

  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing, onClose]);

  if (!editing) return null;

  // For role editing, show the original role + creatable roles. SH role is
  // never user-selectable (server allow-list); so if the staff is currently
  // SH, role is locked.
  const roleLocked = editing.role === 'SH';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) {
      setErr('Name must be at least 2 characters');
      return;
    }
    setSubmitting(true);
    setErr(null);
    const payload: Partial<{ name: string; role: string }> = {};
    if (name.trim() !== editing.name) payload.name = name.trim();
    if (!roleLocked && role !== editing.role) payload.role = role;
    if (Object.keys(payload).length === 0) {
      // No changes — close as success.
      await onSaved();
      setSubmitting(false);
      return;
    }
    const { error: e2 } = await patchStaff(editing.id, payload);
    if (e2) {
      setErr(e2);
      setSubmitting(false);
      return;
    }
    await onSaved();
    setSubmitting(false);
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} aria-hidden="true" />
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-label="Edit staff"
      >
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
          <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold text-slate-900 text-lg">Edit staff</h2>
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
              <label className="block text-xs font-medium text-slate-700 mb-1">Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Phone</label>
              <input
                type="text"
                value={formatPhone(editing.phone)}
                disabled
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-500 bg-slate-50 font-mono"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Phone is the login identity and cannot be changed here.
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Role</label>
              {roleLocked ? (
                <input
                  type="text"
                  value={ROLE_LABEL[editing.role] ?? editing.role}
                  disabled
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-500 bg-slate-50"
                />
              ) : (
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {CREATABLE_ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              )}
              {roleLocked && (
                <p className="text-[11px] text-slate-500 mt-1">
                  Security Head role is managed by SafeCommand Operations only.
                </p>
              )}
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
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
              >
                {submitting ? 'Saving…' : 'Save changes'}
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
