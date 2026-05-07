'use client';

/**
 * Drill detail (deep-dive) — `/drills/[id]`.
 *
 * Phase 5.18 — audit-grade per-drill timeline + participation matrix.
 * Mirrors the mobile DrillDetailScreen on desktop. Designed for Fire NOC
 * and NABH compliance review: any auditor opens this URL and sees a
 * complete record of what happened, who participated, and why anyone
 * who didn't acknowledge was excused (or not).
 *
 * Sections:
 *   - Header card (drill type / status / scheduled / duration / score)
 *   - Notes
 *   - Compliance metrics tiles
 *   - Two-column body: Timeline (left) + Participation matrix (right, filterable)
 *   - Reason editor modal (SH/DSH/FM/SHIFT_COMMANDER only)
 *
 * Live-poll every 10s while drill.status='IN_PROGRESS'.
 *
 * Refs: BR-A, BR-14, ADR 0004, repo mig 013,
 *       docs/research/drill-participant-reason-taxonomy.md.
 */

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '../../../components/AppShell';
import { apiFetch } from '../../../lib/api';
import { getSession } from '../../../lib/auth';

/* ─── Types ──────────────────────────────────────────────────────────────── */

type ParticipantStatus = 'NOTIFIED' | 'ACKNOWLEDGED' | 'SAFE_CONFIRMED' | 'MISSED';

type ReasonCode =
  | 'OFF_DUTY'
  | 'ON_LEAVE'
  | 'ON_BREAK'
  | 'ON_DUTY_ELSEWHERE'
  | 'DEVICE_OR_NETWORK_ISSUE'
  | 'OTHER';

interface StaffRef {
  id: string;
  name: string;
  role: string;
}

interface DrillSession {
  id: string;
  venue_id: string;
  building_id: string | null;
  drill_type: string;
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  scheduled_for: string;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  notes: string | null;
}

interface Participant {
  id: string;
  drill_session_id: string;
  staff_id: string;
  status: ParticipantStatus;
  notified_at: string;
  acknowledged_at: string | null;
  safe_confirmed_at: string | null;
  ack_latency_seconds: number | null;
  reason_code: ReasonCode | null;
  reason_notes: string | null;
  reason_set_by: string | null;
  reason_set_at: string | null;
  staff: StaffRef | null;
  reason_setter: StaffRef | null;
  is_excused: boolean;
}

interface TimelineEvent {
  id: string;
  action: string;
  actor_staff_id: string | null;
  actor_role: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  ip_address: string | null;
  actor: StaffRef | null;
}

interface Aggregates {
  total_participants: number;
  notified_count: number;
  acknowledged_count: number;
  safe_count: number;
  missed_count: number;
  excused_count: number;
  unexcused_count: number;
  legacy_total_expected: number;
  legacy_total_acknowledged: number;
  legacy_total_safe: number;
  legacy_total_missed: number;
}

interface DrillDetail {
  drill: DrillSession;
  participants: Participant[];
  timeline: TimelineEvent[];
  aggregates: Aggregates;
  requester_view: 'full' | 'self';
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

const REASON_CODES: ReasonCode[] = [
  'OFF_DUTY',
  'ON_LEAVE',
  'ON_BREAK',
  'ON_DUTY_ELSEWHERE',
  'DEVICE_OR_NETWORK_ISSUE',
  'OTHER',
];

const REASON_LABEL: Record<ReasonCode, string> = {
  OFF_DUTY: 'Off-duty',
  ON_LEAVE: 'On leave',
  ON_BREAK: 'On break',
  ON_DUTY_ELSEWHERE: 'On duty elsewhere',
  DEVICE_OR_NETWORK_ISSUE: 'Device or network issue',
  OTHER: 'Other (specify)',
};

const REASON_HINT: Record<ReasonCode, string> = {
  OFF_DUTY: 'Not on shift at drill time',
  ON_LEAVE: 'Approved leave (any type)',
  ON_BREAK: 'Statutory meal/rest break',
  ON_DUTY_ELSEWHERE: 'Patient care / restricted area / other zone',
  DEVICE_OR_NETWORK_ISSUE: 'Phone offline / no signal / app crash',
  OTHER: 'Required: at least 10 characters of context',
};

const STATUS_CHIP_CLS: Record<ParticipantStatus, string> = {
  NOTIFIED: 'bg-amber-100 text-amber-700 border border-amber-200',
  ACKNOWLEDGED: 'bg-sky-100 text-sky-700 border border-sky-200',
  SAFE_CONFIRMED: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
  MISSED: 'bg-red-100 text-red-700 border border-red-200',
};

const STATUS_LABEL: Record<ParticipantStatus, string> = {
  NOTIFIED: 'Notified',
  ACKNOWLEDGED: 'Acknowledged',
  SAFE_CONFIRMED: 'Marked safe',
  MISSED: 'Did not acknowledge',
};

const COMMAND_ROLES = ['SH', 'DSH', 'FM', 'SHIFT_COMMANDER'];

type FilterKey = 'ALL' | 'NEEDS_REASON' | ParticipantStatus;

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'NEEDS_REASON', label: 'Needs reason' },
  { key: 'NOTIFIED', label: 'Notified' },
  { key: 'ACKNOWLEDGED', label: 'Acknowledged' },
  { key: 'SAFE_CONFIRMED', label: 'Marked safe' },
  { key: 'MISSED', label: 'Did not ack' },
];

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function fmt(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtDuration(seconds: number | null): string {
  if (seconds === null || seconds < 0) return '—';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function actionDotClass(action: string): string {
  if (action.includes('START')) return 'bg-emerald-500';
  if (action.includes('END') || action.includes('COMPLETED')) return 'bg-sky-500';
  if (action.includes('CANCEL')) return 'bg-slate-400';
  if (action.includes('SAFE')) return 'bg-emerald-500';
  if (action.includes('ACK')) return 'bg-sky-500';
  if (action.includes('REASON')) return 'bg-amber-500';
  return 'bg-blue-500';
}

function prettifyAction(action: string): string {
  return action
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/(^|\s)\w/g, (s) => s.toUpperCase());
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function DrillDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [detail, setDetail] = useState<DrillDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [staffRole, setStaffRole] = useState<string | null>(null);
  const [reasonTarget, setReasonTarget] = useState<Participant | null>(null);
  const [filter, setFilter] = useState<FilterKey>('ALL');

  const canSetReason = staffRole !== null && COMMAND_ROLES.includes(staffRole);

  useEffect(() => {
    const session = getSession();
    if (session) setStaffRole(session.staff.role);
  }, []);

  const load = useCallback(async () => {
    const { data, error: e } = await apiFetch<DrillDetail>(`/drill-sessions/${id}`);
    setLoading(false);
    if (e) setError(e);
    else if (data) {
      setError(null);
      setDetail(data);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Live poll while IN_PROGRESS
  useEffect(() => {
    if (!detail || detail.drill.status !== 'IN_PROGRESS') return;
    const intv = setInterval(() => void load(), 10_000);
    return () => clearInterval(intv);
  }, [detail, load]);

  const filtered = useMemo(() => {
    if (!detail) return [];
    if (filter === 'ALL') return detail.participants;
    if (filter === 'NEEDS_REASON') {
      return detail.participants.filter(
        (p) => p.status === 'MISSED' && p.reason_code === null,
      );
    }
    return detail.participants.filter((p) => p.status === filter);
  }, [detail, filter]);

  return (
    <AppShell>
      <div
        className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <div className="mb-4 flex items-center gap-2 text-sm">
          <Link href="/drills" className="text-blue-600 hover:underline">
            ← Drills
          </Link>
          <span className="text-slate-400">/</span>
          <span className="text-slate-700 font-medium truncate">Detail</span>
        </div>

        {loading && <div className="text-slate-400 text-sm">Loading drill detail…</div>}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
            {error}
          </div>
        )}

        {!loading && !error && detail && (
          <>
            <HeaderCard detail={detail} />
            {detail.drill.notes && (
              <NotesCard notes={detail.drill.notes} />
            )}
            <ComplianceCard aggregates={detail.aggregates} />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
              <section className="lg:col-span-5 bg-white rounded-2xl shadow-sm border border-slate-100 p-5 sm:p-6">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                  Timeline
                </h2>
                {detail.timeline.length === 0 ? (
                  <p className="text-sm text-slate-400 italic">
                    No audit-log events for this drill.
                  </p>
                ) : (
                  <ol className="relative border-l-2 border-slate-200 pl-4 space-y-4">
                    {detail.timeline.map((ev) => (
                      <li key={ev.id} className="relative">
                        <span
                          className={`absolute -left-[22px] top-0.5 w-3 h-3 rounded-full ${actionDotClass(
                            ev.action,
                          )} ring-2 ring-white`}
                        />
                        <div className="text-sm font-semibold text-slate-900">
                          {prettifyAction(ev.action)}
                        </div>
                        <div className="text-xs text-slate-500">
                          {fmt(ev.created_at)}
                          {ev.actor && (
                            <>
                              {' · '}
                              <span className="font-medium text-slate-700">{ev.actor.name}</span>
                              {' '}({ev.actor.role})
                            </>
                          )}
                        </div>
                        {ev.metadata && Object.keys(ev.metadata).length > 0 && (
                          <pre className="mt-1 text-[10px] font-mono text-slate-400 bg-slate-50 rounded px-2 py-1 overflow-x-auto">
                            {JSON.stringify(ev.metadata, null, 2)}
                          </pre>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              <section className="lg:col-span-7 bg-white rounded-2xl shadow-sm border border-slate-100 p-5 sm:p-6">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Participation ({detail.participants.length})
                    {detail.requester_view === 'self' && (
                      <span className="text-slate-400 font-normal ml-1">· your row only</span>
                    )}
                  </h2>
                  {canSetReason && (
                    <button
                      onClick={() => window.print()}
                      className="px-3 py-1 text-xs font-medium text-slate-600 bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                      Print
                    </button>
                  )}
                </div>

                {detail.requester_view === 'full' && (
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {FILTERS.map((f) => {
                      const active = filter === f.key;
                      return (
                        <button
                          key={f.key}
                          onClick={() => setFilter(f.key)}
                          className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${
                            active
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          {f.label}
                        </button>
                      );
                    })}
                  </div>
                )}

                {detail.participants.length === 0 ? (
                  <div className="text-sm text-slate-400 italic py-8 text-center">
                    Per-staff acknowledgement tracking begins with drills started after Phase 5.18 deploy.
                    This drill predates participant tracking — only aggregate counts are available.
                  </div>
                ) : filtered.length === 0 ? (
                  <p className="text-sm text-slate-400 italic">No participants match this filter.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {filtered.map((p) => (
                      <ParticipantRow
                        key={p.id}
                        p={p}
                        canSetReason={canSetReason}
                        onSetReason={() => setReasonTarget(p)}
                      />
                    ))}
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </div>

      <ReasonEditorModal
        target={reasonTarget}
        onClose={() => setReasonTarget(null)}
        onSaved={async () => {
          setReasonTarget(null);
          await load();
        }}
      />
    </AppShell>
  );
}

/* ─── Sub-components ─────────────────────────────────────────────────────── */

function HeaderCard({ detail }: { detail: DrillDetail }) {
  const { drill, aggregates } = detail;
  const score =
    aggregates.total_participants > 0
      ? Math.round((aggregates.safe_count / aggregates.total_participants) * 100)
      : null;
  const scoreColour =
    score === null
      ? 'text-slate-400'
      : score >= 80
        ? 'text-emerald-700'
        : score >= 60
          ? 'text-amber-700'
          : 'text-red-700';
  const statusCls =
    drill.status === 'IN_PROGRESS'
      ? 'bg-amber-100 text-amber-700 border border-amber-200 animate-pulse'
      : drill.status === 'COMPLETED'
        ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
        : drill.status === 'CANCELLED'
          ? 'bg-slate-100 text-slate-500 border border-slate-200'
          : 'bg-blue-100 text-blue-700 border border-blue-200';
  return (
    <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 sm:p-6 mb-4 sm:mb-6">
      <div className="flex items-start gap-3 sm:gap-4 flex-wrap">
        <span className="text-4xl shrink-0">
          {DRILL_TYPE_ICON[drill.drill_type] ?? '⚠️'}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center flex-wrap gap-2 mb-1">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
              {DRILL_TYPE_LABEL[drill.drill_type] ?? drill.drill_type}
            </h1>
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${statusCls}`}>
              {drill.status}
            </span>
          </div>
          <div className="text-sm text-slate-500 flex flex-wrap gap-x-4 gap-y-1">
            <span>📅 Scheduled {fmt(drill.scheduled_for)}</span>
            {drill.started_at && <span>▶ Started {fmt(drill.started_at)}</span>}
            {drill.ended_at && <span>■ Ended {fmt(drill.ended_at)}</span>}
            {drill.duration_seconds !== null && <span>⏱ {fmtDuration(drill.duration_seconds)}</span>}
          </div>
        </div>
        {score !== null && (
          <div className="flex flex-col items-center justify-center px-4 py-2 rounded-xl bg-slate-50 border border-slate-200 shrink-0">
            <div className={`text-3xl font-black ${scoreColour}`}>{score}</div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Safe %
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function NotesCard({ notes }: { notes: string }) {
  return (
    <section className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 sm:mb-6">
      <div className="text-xs font-bold uppercase tracking-wider text-amber-700 mb-1">Notes</div>
      <p className="text-sm text-slate-700 italic">"{notes.replace(/^\[DEMO\]\s*/, '')}"</p>
    </section>
  );
}

function ComplianceCard({ aggregates }: { aggregates: Aggregates }) {
  if (aggregates.total_participants === 0) {
    return (
      <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 sm:p-6 mb-4 sm:mb-6">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
          Compliance metrics
        </h2>
        <p className="text-sm text-slate-500">
          Per-staff acknowledgement tracking begins with drills started after Phase 5.18 deploy. Legacy
          aggregate: <span className="font-semibold">{aggregates.legacy_total_safe} safe</span>{' '}
          of <span className="font-semibold">{aggregates.legacy_total_expected} expected</span>{' '}
          (<span className="font-semibold">{aggregates.legacy_total_missed} missed</span>).
        </p>
      </section>
    );
  }
  return (
    <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 sm:p-6 mb-4 sm:mb-6">
      <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
        Compliance metrics
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 sm:gap-3">
        <Tile label="Total" value={aggregates.total_participants} tone="neutral" />
        <Tile label="Safe" value={aggregates.safe_count} tone="good" />
        <Tile label="Acknowledged" value={aggregates.acknowledged_count} tone="info" />
        <Tile
          label="Did not ack"
          value={aggregates.missed_count}
          tone={aggregates.missed_count > 0 ? 'bad' : 'neutral'}
        />
        <Tile
          label="Excused"
          value={aggregates.excused_count}
          tone={aggregates.excused_count > 0 ? 'good' : 'neutral'}
        />
        <Tile
          label="Unexcused"
          value={aggregates.unexcused_count}
          tone={aggregates.unexcused_count > 0 ? 'bad' : 'good'}
        />
      </div>
    </section>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'good' | 'bad' | 'info' | 'neutral';
}) {
  const cls = {
    good: 'text-emerald-700',
    bad: 'text-red-700',
    info: 'text-sky-700',
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

function ParticipantRow({
  p,
  canSetReason,
  onSetReason,
}: {
  p: Participant;
  canSetReason: boolean;
  onSetReason: () => void;
}) {
  const showReasonAffordance =
    canSetReason && (p.status === 'MISSED' || p.status === 'NOTIFIED' || p.status === 'ACKNOWLEDGED');
  return (
    <div className="py-3 flex items-start gap-3">
      <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center shrink-0">
        <span className="text-xs font-bold text-slate-700">
          {(p.staff?.name ?? '?').slice(0, 2).toUpperCase()}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-slate-900 truncate">
              {p.staff?.name ?? '(unknown)'}
            </div>
            <div className="text-xs text-slate-500">{p.staff?.role ?? '—'}</div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${STATUS_CHIP_CLS[p.status]}`}>
              {STATUS_LABEL[p.status]}
            </span>
            {p.is_excused && p.status === 'MISSED' && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
                EXCUSED
              </span>
            )}
          </div>
        </div>

        <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
          {p.acknowledged_at && (
            <span>Ack {fmt(p.acknowledged_at)} ({p.ack_latency_seconds}s)</span>
          )}
          {p.safe_confirmed_at && <span>Safe {fmt(p.safe_confirmed_at)}</span>}
        </div>

        {p.reason_code && (
          <div className="mt-2 pt-2 border-t border-slate-100">
            <div className="text-xs font-bold text-amber-700">
              ▸ {REASON_LABEL[p.reason_code]}
            </div>
            {p.reason_notes && (
              <div className="text-xs text-slate-600 italic mt-0.5">"{p.reason_notes}"</div>
            )}
            {p.reason_setter && p.reason_set_at && (
              <div className="text-[10px] text-slate-400 mt-0.5">
                Set by {p.reason_setter.name} · {fmt(p.reason_set_at)}
              </div>
            )}
          </div>
        )}

        {showReasonAffordance && (
          <div className="mt-2">
            <button
              onClick={onSetReason}
              className="px-3 py-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg transition-colors"
            >
              {p.reason_code ? 'Change reason' : 'Set reason'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── ReasonEditorModal ──────────────────────────────────────────────────── */

function ReasonEditorModal({
  target,
  onClose,
  onSaved,
}: {
  target: Participant | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [reasonCode, setReasonCode] = useState<ReasonCode | null>(null);
  const [reasonNotes, setReasonNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    setReasonCode(target.reason_code);
    setReasonNotes(target.reason_notes ?? '');
    setErr(null);
    setSubmitting(false);
  }, [target]);

  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [target, onClose]);

  if (!target) return null;

  const saveReason = async (codeToSet: ReasonCode | null, notesToSet: string | null) => {
    setSubmitting(true);
    setErr(null);
    const { error } = await apiFetch(
      `/drill-sessions/${target.drill_session_id}/participants/${target.staff_id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ reason_code: codeToSet, reason_notes: notesToSet }),
      },
    );
    if (error) {
      setErr(error);
      setSubmitting(false);
      return;
    }
    await onSaved();
    setSubmitting(false);
  };

  const handleSave = async () => {
    if (reasonCode === 'OTHER' && reasonNotes.trim().length < 10) {
      setErr('Notes must be at least 10 characters when "Other" is selected.');
      return;
    }
    await saveReason(reasonCode, reasonNotes.trim() === '' ? null : reasonNotes.trim());
  };

  const handleClear = async () => {
    if (!window.confirm(`Clear reason for ${target.staff?.name ?? 'this participant'}?`)) return;
    await saveReason(null, null);
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} aria-hidden="true" />
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-label="Set drill participant reason"
      >
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
          <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-slate-900 text-lg">
                Reason for {target.staff?.name ?? 'staff'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Per ADR 0004 taxonomy — saved with audit trail
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 text-xl px-2"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <div className="p-5 sm:p-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-2">Reason</label>
              <div className="flex flex-wrap gap-1.5">
                {REASON_CODES.map((code) => {
                  const active = reasonCode === code;
                  return (
                    <button
                      key={code}
                      type="button"
                      onClick={() => setReasonCode(code)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                        active
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {REASON_LABEL[code]}
                    </button>
                  );
                })}
              </div>
              {reasonCode && (
                <p className="text-[11px] italic text-slate-500 mt-2">{REASON_HINT[reasonCode]}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Notes {reasonCode === 'OTHER' ? '(required, ≥10 chars)' : '(optional)'}
              </label>
              <textarea
                value={reasonNotes}
                onChange={(e) => setReasonNotes(e.target.value)}
                rows={3}
                placeholder={
                  reasonCode === 'OTHER'
                    ? 'Required: e.g. "Off-prem training", "ER ambulance run"…'
                    : 'Add detail for the audit trail…'
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {err && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
                {err}
              </div>
            )}

            <div className="flex gap-2 pt-2 flex-wrap">
              <button
                onClick={handleSave}
                disabled={submitting || reasonCode === null}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
              >
                {submitting ? 'Saving…' : 'Save reason'}
              </button>
              {target.reason_code && (
                <button
                  onClick={handleClear}
                  disabled={submitting}
                  className="px-4 py-2.5 border border-red-300 text-red-700 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors"
                >
                  Clear
                </button>
              )}
              <button
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2.5 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
