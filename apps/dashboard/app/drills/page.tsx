'use client';

/**
 * /drills — venue drill compliance view (BR-A).
 *
 * Reads /v1/drill-sessions which returns the full drill list.
 * Compliance score = recency of last completed drill (best-practice
 * quarterly cadence).
 *
 * Phase 5.14 — write surfaces for SH/DSH/FM/SHIFT_COMMANDER:
 *   "+ Schedule drill" button (gated)
 *   per-row Start / Cancel (when SCHEDULED) and End (when IN_PROGRESS)
 *   ScheduleDrillModal
 *
 * Refs: BR-A (Drill Management Module), BR-14 (Health Score 10% weight).
 */

import { useEffect, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { apiFetch } from '../../lib/api';
import { getSession } from '../../lib/auth';

/* ─── Write helpers (Phase 5.14 — SH/DSH/FM/SHIFT_COMMANDER) ────────────── */

const WRITE_ROLES = ['SH', 'DSH', 'FM', 'SHIFT_COMMANDER'];

interface ScheduleDrillPayload {
  drill_type: string;
  scheduled_for: string;
  notes?: string | null;
  building_id?: string | null;
}

async function postDrill(payload: ScheduleDrillPayload) {
  return apiFetch('/drill-sessions', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

async function putDrillStart(id: string) {
  return apiFetch(`/drill-sessions/${id}/start`, { method: 'PUT' });
}

async function putDrillEnd(id: string) {
  return apiFetch(`/drill-sessions/${id}/end`, { method: 'PUT' });
}

async function putDrillCancel(id: string) {
  return apiFetch(`/drill-sessions/${id}/cancel`, { method: 'PUT' });
}

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface DrillSession {
  id: string;
  venue_id: string;
  building_id: string | null;
  drill_type: string;
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  scheduled_for: string;
  started_at: string | null;
  ended_at: string | null;
  total_staff_expected: number;
  total_staff_acknowledged: number;
  total_staff_safe: number;
  total_staff_missed: number;
  duration_seconds: number | null;
  notes: string | null;
}

/* ─── Visual config ──────────────────────────────────────────────────────── */

const DRILL_TYPE_LABEL: Record<string, string> = {
  FIRE_EVACUATION: 'Fire Evacuation',
  EARTHQUAKE: 'Earthquake',
  BOMB_THREAT: 'Bomb Threat',
  MEDICAL_EMERGENCY: 'Medical Emergency',
  PARTIAL_EVACUATION: 'Partial Evacuation',
  FULL_EVACUATION: 'Full Evacuation',
  OTHER: 'Other',
};

const DRILL_TYPE_ICON: Record<string, string> = {
  FIRE_EVACUATION: '🔥',
  EARTHQUAKE: '🌍',
  BOMB_THREAT: '💣',
  MEDICAL_EMERGENCY: '🏥',
  PARTIAL_EVACUATION: '🚪',
  FULL_EVACUATION: '🚨',
  OTHER: '⚠️',
};

const DRILL_TYPE_OPTIONS: string[] = [
  'FIRE_EVACUATION',
  'EARTHQUAKE',
  'BOMB_THREAT',
  'MEDICAL_EMERGENCY',
  'PARTIAL_EVACUATION',
  'FULL_EVACUATION',
  'OTHER',
];

const STATUS_CLS: Record<string, string> = {
  SCHEDULED: 'bg-blue-100 text-blue-700 border border-blue-200',
  IN_PROGRESS: 'bg-amber-100 text-amber-700 border border-amber-200',
  COMPLETED: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
  CANCELLED: 'bg-slate-100 text-slate-500 border border-slate-200',
};

/* ─── Helpers ────────────────────────────────────────────────────────────── */

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

function computeScore(drills: DrillSession[]): number {
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

/** Default scheduled_for for the modal: tomorrow at 10:00 local, datetime-local format */
function defaultScheduledFor(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  // Convert to YYYY-MM-DDTHH:mm (local) for <input type="datetime-local">
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function DrillsPage() {
  const [drills, setDrills] = useState<DrillSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Phase 5.14 write-surface state. Hydration-safe role read.
  const [staffRole, setStaffRole] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [actionInFlight, setActionInFlight] = useState<string | null>(null);
  const canWrite = staffRole !== null && WRITE_ROLES.includes(staffRole);

  useEffect(() => {
    const session = getSession();
    if (session) setStaffRole(session.staff.role);
  }, []);

  const refetch = async () => {
    const { data, error: e } = await apiFetch<DrillSession[]>('/drill-sessions');
    setLoading(false);
    if (e) setError(e);
    else {
      setError(null);
      setDrills(data ?? []);
    }
  };

  useEffect(() => {
    void refetch();
    const id = setInterval(refetch, 60_000);
    return () => clearInterval(id);
  }, []);

  const runAction = async (
    label: string,
    drill: DrillSession,
    fn: (id: string) => Promise<{ error: string | null }>,
    confirmMsg?: string,
  ) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setActionInFlight(drill.id);
    const { error: e } = await fn(drill.id);
    setActionInFlight(null);
    if (e) {
      window.alert(`${label} failed: ${e}`);
      return;
    }
    await refetch();
  };

  const upcoming = drills.filter((d) => d.status === 'SCHEDULED');
  const inProgress = drills.filter((d) => d.status === 'IN_PROGRESS');
  const completed = drills
    .filter((d) => d.status === 'COMPLETED' && d.ended_at !== null)
    .sort((a, b) => (b.ended_at ?? '').localeCompare(a.ended_at ?? ''));
  const score = computeScore(drills);
  const daysSinceLast = completed[0]?.ended_at ? daysSince(completed[0].ended_at) : null;
  const scoreColour =
    score >= 80 ? 'text-emerald-700' : score >= 60 ? 'text-amber-700' : 'text-red-700';

  return (
    <AppShell>
      <div
        className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <PageHeader
          canWrite={canWrite}
          onSchedule={() => setScheduleOpen(true)}
        />

        {loading && <div className="text-slate-400 text-sm">Loading drills…</div>}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
            {error}
          </div>
        )}

        {!loading && !error && drills.length === 0 && (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">🔥</div>
            <div className="font-semibold text-slate-700">No drills scheduled yet</div>
            <p className="text-slate-500 text-sm mt-2 max-w-md mx-auto">
              {canWrite
                ? 'Click "+ Schedule drill" above to create your first drill and start tracking compliance for Fire NOC / NABH audits.'
                : 'Schedule your first drill via Operations Console to start tracking compliance for Fire NOC / NABH audits.'}
            </p>
          </div>
        )}

        {!loading && !error && drills.length > 0 && (
          <>
            {/* Compliance summary */}
            <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 sm:p-6 mb-4 sm:mb-6">
              <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
                <div>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Drill Compliance Score
                  </h2>
                  <p className="text-slate-400 text-xs mt-0.5">
                    Score by recency of last completed drill
                  </p>
                </div>
                <div className={`text-4xl font-black ${scoreColour}`}>{score}</div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                <Tile
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
                <Tile
                  label="Upcoming"
                  value={upcoming.length}
                  tone={upcoming.length > 0 ? 'good' : 'neutral'}
                />
                <Tile label="Completed" value={completed.length} tone="neutral" />
                <Tile label="Total" value={drills.length} tone="neutral" />
              </div>
            </section>

            {inProgress.length > 0 && (
              <Section
                title="In Progress"
                badge="🔴"
                rows={inProgress}
                canWrite={canWrite}
                actionInFlight={actionInFlight}
                onStart={(d) =>
                  runAction('Start', d, putDrillStart, 'Start this drill now? This broadcasts to all on-duty staff.')
                }
                onEnd={(d) =>
                  runAction('End', d, putDrillEnd, 'End this drill? Final timing and participation will be recorded.')
                }
                onCancel={(d) =>
                  runAction('Cancel', d, putDrillCancel, 'Cancel this drill?')
                }
              />
            )}
            {upcoming.length > 0 && (
              <Section
                title="Upcoming"
                rows={upcoming}
                canWrite={canWrite}
                actionInFlight={actionInFlight}
                onStart={(d) =>
                  runAction('Start', d, putDrillStart, 'Start this drill now? This broadcasts to all on-duty staff.')
                }
                onEnd={(d) =>
                  runAction('End', d, putDrillEnd, 'End this drill?')
                }
                onCancel={(d) =>
                  runAction('Cancel', d, putDrillCancel, 'Cancel this scheduled drill?')
                }
              />
            )}
            {completed.length > 0 && (
              <Section
                title="Completed"
                rows={completed.slice(0, 20)}
                canWrite={canWrite}
                actionInFlight={actionInFlight}
              />
            )}
          </>
        )}
      </div>

      {/* Schedule modal — top-level overlay */}
      <ScheduleDrillModal
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        onSaved={async () => {
          setScheduleOpen(false);
          await refetch();
        }}
      />
    </AppShell>
  );
}

/* ─── Sub-components ─────────────────────────────────────────────────────── */

function PageHeader({ canWrite, onSchedule }: { canWrite: boolean; onSchedule: () => void }) {
  return (
    <div className="mb-4 sm:mb-6 flex items-start justify-between gap-3 flex-wrap">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Drills</h1>
        <p className="text-slate-500 text-sm mt-1">
          Drill compliance · best-practice quarterly cadence (90-day windows)
        </p>
      </div>
      {canWrite && (
        <button
          onClick={onSchedule}
          className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors min-h-[40px]"
        >
          <span aria-hidden="true">+</span> Schedule drill
        </button>
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: 'good' | 'warn' | 'bad' | 'neutral';
}) {
  const cls = {
    good: 'text-emerald-700',
    warn: 'text-amber-700',
    bad: 'text-red-700',
    neutral: 'text-slate-900',
  }[tone];
  return (
    <div className="bg-slate-50 rounded-lg px-3 py-2">
      <div className={`text-2xl font-bold ${cls}`}>{value}</div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mt-0.5">
        {label}
      </div>
    </div>
  );
}

function Section({
  title,
  badge,
  rows,
  canWrite,
  actionInFlight,
  onStart,
  onEnd,
  onCancel,
}: {
  title: string;
  badge?: string;
  rows: DrillSession[];
  canWrite: boolean;
  actionInFlight: string | null;
  onStart?: (d: DrillSession) => void;
  onEnd?: (d: DrillSession) => void;
  onCancel?: (d: DrillSession) => void;
}) {
  return (
    <section className="mb-4 sm:mb-6">
      <h2 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
        {badge && <span>{badge}</span>}
        {title} <span className="text-slate-400 font-normal">({rows.length})</span>
      </h2>
      <div className="space-y-2">
        {rows.map((d) => (
          <DrillRow
            key={d.id}
            drill={d}
            canWrite={canWrite}
            inFlight={actionInFlight === d.id}
            onStart={onStart}
            onEnd={onEnd}
            onCancel={onCancel}
          />
        ))}
      </div>
    </section>
  );
}

function DrillRow({
  drill,
  canWrite,
  inFlight,
  onStart,
  onEnd,
  onCancel,
}: {
  drill: DrillSession;
  canWrite: boolean;
  inFlight: boolean;
  onStart?: (d: DrillSession) => void;
  onEnd?: (d: DrillSession) => void;
  onCancel?: (d: DrillSession) => void;
}) {
  const icon = DRILL_TYPE_ICON[drill.drill_type] ?? '⚠️';
  const ackPercent =
    drill.total_staff_expected > 0
      ? Math.round((drill.total_staff_safe / drill.total_staff_expected) * 100)
      : 0;
  const cleanNotes = drill.notes?.replace(/^\[DEMO\]\s*/, '');
  const showActions =
    canWrite && (drill.status === 'SCHEDULED' || drill.status === 'IN_PROGRESS');

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="text-2xl shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-bold text-slate-900">
              {DRILL_TYPE_LABEL[drill.drill_type] ?? drill.drill_type}
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_CLS[drill.status]}`}
            >
              {drill.status}
            </span>
          </div>
          <div className="text-xs text-slate-500 flex flex-wrap gap-x-4 gap-y-1">
            <span>📅 {formatDateTime(drill.scheduled_for)}</span>
            {drill.duration_seconds !== null && (
              <span>⏱ {formatDuration(drill.duration_seconds)}</span>
            )}
          </div>
          {drill.status === 'COMPLETED' && drill.total_staff_expected > 0 && (
            <div className="text-xs mt-1.5 flex flex-wrap gap-x-3">
              <span className="text-slate-700 font-medium">
                Participation {ackPercent}% ({drill.total_staff_safe}/
                {drill.total_staff_expected})
              </span>
              {drill.total_staff_missed > 0 && (
                <span className="text-red-600 font-medium">
                  · {drill.total_staff_missed} missed
                </span>
              )}
            </div>
          )}
          {cleanNotes && (
            <p className="text-xs text-slate-600 mt-1.5 italic">"{cleanNotes}"</p>
          )}

          {showActions && (
            <div className="flex flex-wrap gap-2 mt-3">
              {drill.status === 'SCHEDULED' && (
                <>
                  <button
                    onClick={() => onStart?.(drill)}
                    disabled={inFlight}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors"
                  >
                    {inFlight ? '…' : '▶ Start'}
                  </button>
                  <button
                    onClick={() => onCancel?.(drill)}
                    disabled={inFlight}
                    className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </>
              )}
              {drill.status === 'IN_PROGRESS' && (
                <button
                  onClick={() => onEnd?.(drill)}
                  disabled={inFlight}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg transition-colors"
                >
                  {inFlight ? '…' : '■ End drill'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── ScheduleDrillModal ─────────────────────────────────────────────────── */

function ScheduleDrillModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [drillType, setDrillType] = useState('FIRE_EVACUATION');
  const [scheduledFor, setScheduledFor] = useState(defaultScheduledFor());
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDrillType('FIRE_EVACUATION');
    setScheduledFor(defaultScheduledFor());
    setNotes('');
    setErr(null);
    setSubmitting(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = new Date(scheduledFor);
    if (isNaN(parsed.getTime())) {
      setErr('Invalid date/time.');
      return;
    }
    if (parsed.getTime() < Date.now() - 60_000) {
      setErr('Drill must be scheduled in the future.');
      return;
    }
    setSubmitting(true);
    setErr(null);
    const { error: e2 } = await postDrill({
      drill_type: drillType,
      scheduled_for: parsed.toISOString(),
      notes: notes.trim() === '' ? null : notes.trim(),
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
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-label="Schedule drill"
      >
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
          <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold text-slate-900 text-lg">Schedule drill</h2>
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
                Drill type *
              </label>
              <select
                value={drillType}
                onChange={(e) => setDrillType(e.target.value)}
                required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              >
                {DRILL_TYPE_OPTIONS.map((dt) => (
                  <option key={dt} value={dt}>
                    {DRILL_TYPE_ICON[dt]} {DRILL_TYPE_LABEL[dt]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Scheduled for *
              </label>
              <input
                type="datetime-local"
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
                required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-[11px] text-slate-500 mt-1">Local time.</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Notes (optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Briefing instructions, scope, attendees…"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
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
                {submitting ? 'Scheduling…' : 'Schedule drill'}
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
