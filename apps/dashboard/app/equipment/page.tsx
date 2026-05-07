'use client';

/**
 * /equipment — venue-wide compliance view (BR-21).
 *
 * Mirrors mobile EquipmentScreen + Ops Console Equipment tab on dashboard.
 * Reads /v1/equipment which returns the active items list. Compliance
 * stats computed client-side from the list (matches api /analytics/dashboard
 * formula exactly: ok_count / total * 100).
 *
 * Refs: BR-21 (Equipment & Maintenance Tracker), BR-14 (Health Score 10%
 * weight). The dashboard `/dashboard` Health Score Breakdown also displays
 * a single equipment row pulling from /v1/analytics/dashboard; this page
 * is the drill-down detail view.
 */

import { useEffect, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { apiFetch } from '../../lib/api';
import { getSession } from '../../lib/auth';

/* ─── Write helpers (Phase 5.13 — SH/DSH/FM only) ───────────────────────── */

const WRITE_ROLES = ['SH', 'DSH', 'FM'];

interface EquipmentWritePayload {
  name: string;
  category: string;
  location_description: string | null;
  last_serviced_at: string | null;
  next_service_due: string;
}

async function postEquipment(payload: EquipmentWritePayload) {
  return apiFetch('/equipment', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

async function patchEquipment(id: string, payload: Partial<EquipmentWritePayload>) {
  return apiFetch(`/equipment/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

async function setEquipmentActive(id: string, is_active: boolean) {
  return apiFetch(`/equipment/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ is_active }),
  });
}

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface EquipmentItem {
  id: string;
  venue_id: string;
  building_id: string | null;
  name: string;
  category: string;
  location_description: string | null;
  last_serviced_at: string | null;
  next_service_due: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

type ExpiryBucket = 'OK' | 'DUE_90' | 'DUE_30' | 'DUE_7' | 'OVERDUE';

/* ─── Visual config ──────────────────────────────────────────────────────── */

const CATEGORY_LABEL: Record<string, string> = {
  FIRE_EXTINGUISHER: 'Fire Extinguisher',
  AED: 'AED (Defibrillator)',
  SMOKE_DETECTOR: 'Smoke Detector',
  EMERGENCY_LIGHT: 'Emergency Light',
  FIRST_AID_KIT: 'First Aid Kit',
  ALARM_PANEL: 'Alarm Panel',
  EVACUATION_SIGN: 'Evacuation Sign',
  OTHER: 'Other',
};

const CATEGORY_ICON: Record<string, string> = {
  FIRE_EXTINGUISHER: '🧯',
  AED: '❤️‍🩹',
  SMOKE_DETECTOR: '🚨',
  EMERGENCY_LIGHT: '💡',
  FIRST_AID_KIT: '🩹',
  ALARM_PANEL: '🔔',
  EVACUATION_SIGN: '🚪',
  OTHER: '🛠️',
};

const BUCKET_CONFIG: Record<
  ExpiryBucket,
  { label: (d: number) => string; cls: string; rank: number }
> = {
  OVERDUE: {
    label: (d) => `OVERDUE ${Math.abs(d)}d`,
    cls: 'bg-red-700 text-white',
    rank: 5,
  },
  DUE_7: {
    label: (d) => `Due in ${d}d`,
    cls: 'bg-red-100 text-red-700 border border-red-200',
    rank: 4,
  },
  DUE_30: {
    label: (d) => `Due in ${d}d`,
    cls: 'bg-orange-100 text-orange-700 border border-orange-200',
    rank: 3,
  },
  DUE_90: {
    label: (d) => `Due in ${d}d`,
    cls: 'bg-amber-100 text-amber-700 border border-amber-200',
    rank: 2,
  },
  OK: {
    label: () => 'OK',
    cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    rank: 1,
  },
};

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function daysUntilDue(dueDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + 'T00:00:00+05:30');
  return Math.floor((due.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

function expiryBucket(days: number): ExpiryBucket {
  if (days < 0) return 'OVERDUE';
  if (days <= 7) return 'DUE_7';
  if (days <= 30) return 'DUE_30';
  if (days <= 90) return 'DUE_90';
  return 'OK';
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function EquipmentPage() {
  const [items, setItems] = useState<EquipmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Phase 5.13 — write surface state. canWrite drives all write-control
  // visibility; api requireRole returns 403 if a non-SH/DSH/FM tries to
  // bypass the UI hide.
  const [staffRole, setStaffRole] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<EquipmentItem | null>(null);
  const canWrite = staffRole !== null && WRITE_ROLES.includes(staffRole);

  // Read session ROLE post-mount (avoids SSR/CSR hydration mismatch like
  // we hit on the dashboard Drawer before — same pattern resolution).
  useEffect(() => {
    const session = getSession();
    if (session) setStaffRole(session.staff.role);
  }, []);

  // Refetch list — used after a write succeeds, and on the polling tick
  const refetch = async () => {
    const { data, error: e } = await apiFetch<EquipmentItem[]>('/equipment');
    if (e) setError(e);
    else {
      setError(null);
      setItems(data ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    void refetch();
    const id = setInterval(refetch, 60_000); // refresh every minute
    return () => clearInterval(id);
  }, []);

  // Compliance stats (matches api /analytics/dashboard formula)
  const buckets = { ok: 0, due_90: 0, due_30: 0, due_7: 0, overdue: 0 };
  for (const item of items) {
    const b = expiryBucket(daysUntilDue(item.next_service_due));
    if (b === 'OK') buckets.ok++;
    else if (b === 'DUE_90') buckets.due_90++;
    else if (b === 'DUE_30') buckets.due_30++;
    else if (b === 'DUE_7') buckets.due_7++;
    else buckets.overdue++;
  }
  const total = items.length;
  const score = total === 0 ? 100 : Math.round((buckets.ok / total) * 100);
  const scoreColour =
    score >= 80 ? 'text-emerald-700' : score >= 60 ? 'text-amber-700' : 'text-red-700';

  // Sort: most urgent first; then by next_service_due ascending
  const sorted = [...items].sort((a, b) => {
    const ra = BUCKET_CONFIG[expiryBucket(daysUntilDue(a.next_service_due))].rank;
    const rb = BUCKET_CONFIG[expiryBucket(daysUntilDue(b.next_service_due))].rank;
    if (ra !== rb) return rb - ra;
    return a.next_service_due.localeCompare(b.next_service_due);
  });

  return (
    <AppShell>
      <div
        className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <PageHeader
          canWrite={canWrite}
          onAdd={() => {
            setEditingItem(null);
            setEditorOpen(true);
          }}
        />

        {loading && <div className="text-slate-400 text-sm">Loading equipment…</div>}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
            {error}
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">🛠️</div>
            <div className="font-semibold text-slate-700">No equipment registered</div>
            <p className="text-slate-500 text-sm mt-2 max-w-md mx-auto">
              Your venue's safety equipment hasn't been registered yet. Ask
              Operations to add fire extinguishers, AEDs, smoke detectors, etc.
              via the Operations Console.
            </p>
          </div>
        )}

        {!loading && !error && items.length > 0 && (
          <>
            <ComplianceCard
              score={score}
              scoreColour={scoreColour}
              buckets={buckets}
              total={total}
            />
            <EquipmentList
              items={sorted}
              canWrite={canWrite}
              onEdit={(item) => {
                setEditingItem(item);
                setEditorOpen(true);
              }}
              onDeactivate={async (item) => {
                const cleanName = item.name.replace(/^\[DEMO\]\s*/, '');
                if (!window.confirm(`Deactivate "${cleanName}"?`)) return;
                const { error: e } = await setEquipmentActive(item.id, false);
                if (e) {
                  window.alert(`Could not deactivate: ${e}`);
                  return;
                }
                await refetch();
              }}
            />
          </>
        )}
      </div>

      {/* Edit / Add modal — top-level so it overlays the page */}
      <EquipmentEditorModal
        open={editorOpen}
        editing={editingItem}
        onClose={() => setEditorOpen(false)}
        onSaved={async () => {
          setEditorOpen(false);
          setEditingItem(null);
          await refetch();
        }}
      />
    </AppShell>
  );
}

/* ─── Sub-components ─────────────────────────────────────────────────────── */

function PageHeader({ canWrite, onAdd }: { canWrite: boolean; onAdd: () => void }) {
  return (
    <div className="mb-4 sm:mb-6 flex items-start justify-between gap-3 flex-wrap">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Equipment</h1>
        <p className="text-slate-500 text-sm mt-1">
          Safety equipment compliance · 90 / 30 / 7-day expiry windows
        </p>
      </div>
      {canWrite && (
        <button
          onClick={onAdd}
          className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors min-h-[40px]"
        >
          <span aria-hidden="true">+</span> Add Equipment
        </button>
      )}
    </div>
  );
}

function ComplianceCard({
  score,
  scoreColour,
  buckets,
  total,
}: {
  score: number;
  scoreColour: string;
  buckets: { ok: number; due_90: number; due_30: number; due_7: number; overdue: number };
  total: number;
}) {
  return (
    <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 sm:p-6 mb-4 sm:mb-6">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Compliance Score
          </h2>
          <p className="text-slate-400 text-xs mt-0.5">
            % of items ≥ 90 days to next service
          </p>
        </div>
        <div className={`text-4xl font-black ${scoreColour}`}>{score}</div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3">
        <BucketTile label="Total" value={total} tone="neutral" />
        <BucketTile label="OK (>90d)" value={buckets.ok} tone={buckets.ok > 0 ? 'good' : 'neutral'} />
        <BucketTile
          label="Due 30-90d"
          value={buckets.due_90}
          tone={buckets.due_90 > 0 ? 'warn' : 'neutral'}
        />
        <BucketTile
          label="Due 7-30d"
          value={buckets.due_30}
          tone={buckets.due_30 > 0 ? 'warn' : 'neutral'}
        />
        <BucketTile
          label="Due ≤7d / overdue"
          value={buckets.due_7 + buckets.overdue}
          tone={buckets.due_7 + buckets.overdue > 0 ? 'bad' : 'neutral'}
        />
      </div>
    </section>
  );
}

function BucketTile({
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
    neutral: 'text-slate-900',
  }[tone];
  return (
    <div className="bg-slate-50 rounded-lg px-3 py-2">
      <div className={`text-2xl font-bold ${toneClass}`}>{value}</div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mt-0.5">
        {label}
      </div>
    </div>
  );
}

function EquipmentList({
  items,
  canWrite,
  onEdit,
  onDeactivate,
}: {
  items: EquipmentItem[];
  canWrite: boolean;
  onEdit: (item: EquipmentItem) => void;
  onDeactivate: (item: EquipmentItem) => Promise<void>;
}) {
  return (
    <section className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <h2 className="font-bold text-slate-900">Equipment Items</h2>
        <span className="text-xs text-slate-500">
          {items.length} active · sorted by urgency
        </span>
      </div>

      <div className="divide-y divide-slate-50">
        {items.map((item) => {
          const days = daysUntilDue(item.next_service_due);
          const bucket = expiryBucket(days);
          const cfg = BUCKET_CONFIG[bucket];
          const icon = CATEGORY_ICON[item.category] ?? '🛠️';
          const cleanName = item.name.replace(/^\[DEMO\]\s*/, '');

          return (
            <div
              key={item.id}
              className="px-5 sm:px-6 py-4 flex items-center gap-3 sm:gap-4"
            >
              <span className="text-2xl shrink-0" aria-hidden="true">
                {icon}
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-slate-900 truncate">{cleanName}</div>
                <div className="text-slate-500 text-xs sm:text-sm truncate">
                  {CATEGORY_LABEL[item.category] ?? item.category}
                  {item.location_description ? ` · ${item.location_description}` : ''}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${cfg.cls}`}
                >
                  {cfg.label(days)}
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  Due {item.next_service_due}
                </span>
              </div>
              {canWrite && (
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => onEdit(item)}
                    className="px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
                    aria-label={`Edit ${cleanName}`}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => void onDeactivate(item)}
                    className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
                    aria-label={`Deactivate ${cleanName}`}
                  >
                    Deactivate
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ─── Editor modal — Add (when editing===null) or Edit (with item) ───────── */

function EquipmentEditorModal({
  open,
  editing,
  onClose,
  onSaved,
}: {
  open: boolean;
  editing: EquipmentItem | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const isEdit = editing !== null;
  const [name, setName] = useState('');
  const [category, setCategory] = useState('FIRE_EXTINGUISHER');
  const [location, setLocation] = useState('');
  const [lastServiced, setLastServiced] = useState('');
  const [nextDue, setNextDue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Reset form whenever modal opens or editing target changes
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name.replace(/^\[DEMO\]\s*/, ''));
      setCategory(editing.category);
      setLocation(editing.location_description ?? '');
      setLastServiced(editing.last_serviced_at ?? '');
      setNextDue(editing.next_service_due);
    } else {
      setName('');
      setCategory('FIRE_EXTINGUISHER');
      setLocation('');
      setLastServiced('');
      setNextDue('');
    }
    setErr(null);
    setSubmitting(false);
  }, [open, editing]);

  // Esc key to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const validate = (): string | null => {
    if (name.trim().length === 0) return 'Name is required';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDue)) return 'Next service due is required (YYYY-MM-DD)';
    if (lastServiced.length > 0 && !/^\d{4}-\d{2}-\d{2}$/.test(lastServiced)) {
      return 'Last serviced must be YYYY-MM-DD or empty';
    }
    if (lastServiced && lastServiced > nextDue) {
      return 'Last serviced cannot be after next service due';
    }
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
    const payload = {
      name: name.trim(),
      category,
      location_description: location.trim() || null,
      last_serviced_at: lastServiced || null,
      next_service_due: nextDue,
    };
    const result = isEdit
      ? await patchEquipment(editing!.id, payload)
      : await postEquipment(payload);
    if (result.error) {
      setErr(result.error);
      setSubmitting(false);
      return;
    }
    await onSaved();
    setSubmitting(false);
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? 'Edit equipment' : 'Add equipment'}
      >
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
          <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold text-slate-900 text-lg">
              {isEdit ? 'Edit equipment' : 'Add equipment'}
            </h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl px-2" aria-label="Close">
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
                placeholder="e.g. FE-001 (5kg ABC)"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Category *</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="FIRE_EXTINGUISHER">Fire Extinguisher</option>
                <option value="AED">AED (Defibrillator)</option>
                <option value="SMOKE_DETECTOR">Smoke Detector</option>
                <option value="EMERGENCY_LIGHT">Emergency Light</option>
                <option value="FIRST_AID_KIT">First Aid Kit</option>
                <option value="ALARM_PANEL">Alarm Panel</option>
                <option value="EVACUATION_SIGN">Evacuation Sign</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Location</label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. T1 Reception, beside lift"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Last serviced</label>
                <input
                  type="date"
                  value={lastServiced}
                  onChange={(e) => setLastServiced(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Next service due *</label>
                <input
                  type="date"
                  value={nextDue}
                  onChange={(e) => setNextDue(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            {err && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">{err}</div>
            )}
            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
              >
                {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Add equipment'}
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
