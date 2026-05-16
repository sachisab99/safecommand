'use client';

/**
 * Dashboard SireSection — web v2 SIRE-aware UI block on /incidents/[id].
 *
 * Mirror of apps/mobile/src/components/sire/SireSection.tsx for desktop.
 * Renders:
 *   1. Zone state grid (Tailwind-styled cards, 10 colour-coded states)
 *   2. Per-staff completion view (table grouped by role, with action
 *      progress bars)
 *   3. Evacuation triggers audit list
 *   4. SH/DSH/SC selective-evacuation modal
 *
 * Polls GET /v1/sire/state/:incidentId every 3 seconds.
 *
 * Authorisation gating mirrors the api:
 *   - Zone state: assigned_gs_id OR command role (SH/DSH/SC/FM)
 *   - Action status: only assigned staff_id (read-only on dashboard for now;
 *     the dashboard is primarily a SH/SC overview surface — staff complete
 *     actions on their mobile)
 *   - Selective evac: SH/DSH/SHIFT_COMMANDER only
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchSireState,
  patchZoneState,
  postEvacuationTrigger,
  dismissPrompt,
  uploadIncidentPhotoWeb,
  summariseAssignments,
  zoneStateClasses,
  statusClasses,
  type SireState,
  type SireZoneState,
  type SireAssignment,
} from '../../lib/sire';
import {
  getValidTransitions,
  requiresReasonNote,
  requiresEvidence,
  draftPaAnnouncement,
  ZONE_STATE_LABEL,
  type IncidentZoneState,
} from '@safecommand/types';

const COMMAND_ROLES = new Set(['SH', 'DSH', 'SHIFT_COMMANDER', 'FM']);
const EVAC_TRIGGER_ROLES = new Set(['SH', 'DSH', 'SHIFT_COMMANDER']);

export interface SireSectionProps {
  incidentId: string;
  staffId: string;
  staffRole: string;
  pollIntervalMs?: number;
}

export function SireSection({
  incidentId,
  staffId,
  staffRole,
  pollIntervalMs = 3000,
}: SireSectionProps) {
  const [state, setState] = useState<SireState | null>(null);
  const [loading, setLoading] = useState(true);
  const [zoneTarget, setZoneTarget] = useState<SireZoneState | null>(null);
  const [evacOpen, setEvacOpen] = useState(false);
  const [busyPrompt, setBusyPrompt] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    const fresh = await fetchSireState(incidentId);
    if (fresh) setState(fresh);
    setLoading(false);
  }, [incidentId]);

  const handleDismissPrompt = useCallback(
    async (promptId: string) => {
      setBusyPrompt(promptId);
      const res = await dismissPrompt(promptId);
      setBusyPrompt(null);
      if (res.ok) refresh();
    },
    [refresh],
  );

  const handlePhotoUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = ''; // reset so the same file can be re-picked
      if (!file) return;
      setUploadingPhoto(true);
      setPhotoError(null);
      const res = await uploadIncidentPhotoWeb(incidentId, file);
      setUploadingPhoto(false);
      if (res.ok) refresh();
      else setPhotoError(res.error ?? 'Upload failed');
    },
    [incidentId, refresh],
  );

  useEffect(() => {
    refresh();
    pollRef.current = setInterval(refresh, pollIntervalMs);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [refresh, pollIntervalMs]);

  if (loading) {
    return <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading SIRE state…</div>;
  }
  if (!state || !state.has_sire_data) return null;

  const isCommand = COMMAND_ROLES.has(staffRole);
  const canTriggerEvac = EVAC_TRIGGER_ROLES.has(staffRole);
  const summary = summariseAssignments(state.assignments);

  // Group assignments by role for the per-staff completion view
  const assignmentsByRole: Record<string, SireAssignment[]> = {};
  for (const a of state.assignments) {
    if (!assignmentsByRole[a.role]) assignmentsByRole[a.role] = [];
    assignmentsByRole[a.role]!.push(a);
  }

  return (
    <section className="space-y-6">
      {/* ─── BR-L soft suggestion banner (Hard Rule 23: NEVER auto-trigger) ───
          Command-only (server-gated data). A SUGGESTION surface only — the SH
          must still explicitly use the evacuation trigger. No code path here
          fires an evacuation. */}
      {state.active_prompts.map((p) => (
        <div
          key={p.id}
          className="rounded-lg border border-amber-400 bg-amber-50 p-4"
          role="status"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-amber-900">
                ⚠ Suggestion — not automatic
              </p>
              <p className="mt-1 text-sm text-amber-900">{p.message}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              {canTriggerEvac && (
                <button
                  type="button"
                  onClick={() => setEvacOpen(true)}
                  className="rounded-md bg-amber-200 px-3 py-1.5 text-sm font-semibold text-amber-900 transition hover:bg-amber-300"
                >
                  Review evacuation →
                </button>
              )}
              <button
                type="button"
                onClick={() => handleDismissPrompt(p.id)}
                disabled={busyPrompt === p.id}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                {busyPrompt === p.id ? 'Dismissing…' : 'Dismiss'}
              </button>
            </div>
          </div>
        </div>
      ))}

      {/* ─── Zone state grid ─── */}
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Zone state grid</h2>
            <p className="text-xs text-slate-500">
              {state.zone_states.length} zone{state.zone_states.length !== 1 ? 's' : ''} · auto-refreshing every {pollIntervalMs / 1000}s
            </p>
          </div>
          {canTriggerEvac && (
            <button
              type="button"
              onClick={() => setEvacOpen(true)}
              className="rounded-md border border-red-400 bg-red-50 px-3 py-2 text-sm font-medium text-red-800 transition hover:bg-red-100"
            >
              ⚠ Trigger selective evacuation
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {state.zone_states.map((zs) => {
            const isAssignedToMe = zs.assigned_gs_id === staffId;
            const canTap = isAssignedToMe || isCommand;
            return (
              <button
                key={zs.id}
                type="button"
                onClick={canTap ? () => setZoneTarget(zs) : undefined}
                disabled={!canTap}
                className={`rounded-lg border-2 p-3 text-left transition ${zoneStateClasses(zs.state)} ${canTap ? 'hover:shadow-md cursor-pointer' : 'cursor-default opacity-90'}`}
              >
                <div className="text-sm font-semibold">{zs.zones?.name ?? zs.zone_id.slice(0, 8)}</div>
                <div className="mt-1 text-xs">{ZONE_STATE_LABEL[zs.state]}</div>
                <div className="mt-1 text-xs opacity-70">
                  {zs.assigned_gs_id ? (isAssignedToMe ? '★ You' : 'GS assigned') : 'Unassigned'}
                </div>
                {zs.reason_note && (
                  <div className="mt-1 text-xs italic line-clamp-2">{zs.reason_note}</div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Per-staff completion view ─── */}
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Per-staff action completion</h2>
          <p className="text-xs text-slate-500">
            {summary.done}/{summary.total} actions done · {summary.in_progress} in progress
            {summary.skipped > 0 ? ` · ${summary.skipped} skipped` : ''}
            {summary.blocked > 0 ? ` · ${summary.blocked} blocked` : ''}
          </p>
        </div>
        {Object.keys(assignmentsByRole).length === 0 ? (
          <p className="text-sm italic text-slate-500">No assignments yet.</p>
        ) : (
          <div className="space-y-4">
            {Object.entries(assignmentsByRole).map(([role, assignments]) => {
              // Group by staff within role
              const byStaff: Record<string, SireAssignment[]> = {};
              for (const a of assignments) {
                if (!byStaff[a.staff_id]) byStaff[a.staff_id] = [];
                byStaff[a.staff_id]!.push(a);
              }
              return (
                <div key={role}>
                  <h3 className="mb-2 text-sm font-semibold text-slate-800">{role}</h3>
                  <div className="overflow-hidden rounded-md border border-slate-200">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-slate-700">Staff</th>
                          <th className="px-3 py-2 text-left font-medium text-slate-700">Progress</th>
                          <th className="px-3 py-2 text-left font-medium text-slate-700">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 bg-white">
                        {Object.entries(byStaff).map(([sId, sAssignments]) => {
                          const sSummary = summariseAssignments(sAssignments);
                          const staffName = sAssignments[0]?.staff?.name ?? sId.slice(0, 8);
                          const pct = sSummary.total > 0 ? (sSummary.done / sSummary.total) * 100 : 0;
                          return (
                            <tr key={sId}>
                              <td className="px-3 py-2 text-slate-900">{staffName}</td>
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-2">
                                  <div className="h-2 w-32 overflow-hidden rounded-full bg-slate-200">
                                    <div
                                      className="h-full bg-emerald-500 transition-all"
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                  <span className="text-xs text-slate-600">
                                    {sSummary.done}/{sSummary.total}
                                  </span>
                                </div>
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex flex-wrap gap-1">
                                  {sAssignments.map((a) => (
                                    <span
                                      key={a.id}
                                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusClasses(a.status)}`}
                                      title={a.instruction.slice(0, 80)}
                                    >
                                      #{a.action_order}
                                    </span>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Evacuation triggers audit list ─── */}
      {state.evacuation_triggers.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-5">
          <h2 className="mb-3 text-lg font-semibold text-red-900">Evacuation triggers</h2>
          <div className="space-y-2">
            {state.evacuation_triggers.map((t) => (
              <div key={t.id} className="rounded-md border border-red-300 bg-white p-3">
                <div className="text-sm font-medium text-red-900">
                  {t.trigger_type.replace('_', ' ')} · {t.zones_affected.length} zone{t.zones_affected.length !== 1 ? 's' : ''}
                </div>
                <div className="mt-1 text-sm text-slate-800">{t.reason_note}</div>
                {t.pa_text_broadcast && (
                  <div className="mt-1 text-xs italic text-slate-600">PA: {t.pa_text_broadcast}</div>
                )}
                <div className="mt-1 text-xs text-slate-500">
                  {new Date(t.triggered_at).toLocaleString('en-IN')} · by {t.triggered_by_role ?? 'unknown'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Shared incident photo wall (Rec 2b) — any staff posts, all see ─── */}
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Incident photos</h2>
            <p className="text-xs text-slate-500">
              {state.evidence_wall.length} photo{state.evidence_wall.length !== 1 ? 's' : ''} ·
              {' '}visible to everyone on this incident
            </p>
          </div>
          <label className="cursor-pointer rounded-md border border-blue-400 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-800 transition hover:bg-blue-100">
            {uploadingPhoto ? 'Uploading…' : '📷 Add a photo'}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoUpload}
              disabled={uploadingPhoto}
            />
          </label>
        </div>
        {photoError && <p className="mb-2 text-sm text-red-600">{photoError}</p>}
        {state.evidence_wall.length === 0 ? (
          <p className="text-sm italic text-slate-500">No photos posted yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {state.evidence_wall.map((ev) => (
              <a
                key={ev.id}
                href={ev.evidence_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block overflow-hidden rounded-md border border-slate-200 transition hover:shadow-md"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={ev.evidence_url}
                  alt={ev.caption ?? 'Incident photo'}
                  className="h-32 w-full bg-slate-100 object-cover"
                />
                <div className="p-2">
                  <p className="truncate text-xs text-slate-600">
                    {ev.staff?.name ?? ev.posted_by_role ?? 'Staff'} ·{' '}
                    {new Date(ev.created_at).toLocaleTimeString('en-IN')}
                  </p>
                  {ev.caption && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-slate-800">{ev.caption}</p>
                  )}
                </div>
              </a>
            ))}
          </div>
        )}
      </div>

      {/* ─── Zone state action modal ─── */}
      {zoneTarget && (
        <ZoneStateModal
          zoneState={zoneTarget}
          incidentId={incidentId}
          staffRole={staffRole}
          onClose={() => setZoneTarget(null)}
          onSuccess={() => {
            setZoneTarget(null);
            refresh();
          }}
        />
      )}

      {/* ─── Evacuation trigger modal ─── */}
      {evacOpen && (
        <EvacuationModal
          incidentId={incidentId}
          zoneStates={state.zone_states}
          onClose={() => setEvacOpen(false)}
          onSuccess={() => {
            setEvacOpen(false);
            refresh();
          }}
        />
      )}
    </section>
  );
}

// ─── Zone state action modal ────────────────────────────────────────────────

function ZoneStateModal(props: {
  zoneState: SireZoneState;
  incidentId: string;
  staffRole: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [reasonNote, setReasonNote] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validNextStates = getValidTransitions(props.zoneState.state, props.staffRole);

  const submit = async (target: IncidentZoneState) => {
    if (requiresReasonNote(target) && reasonNote.trim().length === 0) {
      setError('This state requires a reason note');
      return;
    }
    if (requiresEvidence(target) && evidenceUrl.trim().length === 0) {
      setError('This state requires photo evidence (paste any URL for demo)');
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await patchZoneState(props.incidentId, props.zoneState.zone_id, {
      to_state: target,
      prev_state_changed_at: props.zoneState.state_changed_at,
      reason_note: reasonNote.trim() || undefined,
      evidence_url: evidenceUrl.trim() || undefined,
    });
    setSubmitting(false);
    if (result.ok) props.onSuccess();
    else setError(result.error ?? 'Update failed');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-slate-900">Update zone state</h3>
        <p className="mt-1 text-sm text-slate-600">
          {props.zoneState.zones?.name ?? 'Zone'} · current: {ZONE_STATE_LABEL[props.zoneState.state]}
        </p>

        <div className="mt-4 space-y-3">
          <textarea
            value={reasonNote}
            onChange={(e) => setReasonNote(e.target.value)}
            placeholder="Reason note (required for NEEDS_ATTENTION / INACCESSIBLE / LOCKED_DOWN)"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            rows={2}
          />
          <input
            type="text"
            value={evidenceUrl}
            onChange={(e) => setEvidenceUrl(e.target.value)}
            placeholder="Evidence URL (required for EVACUATION_COMPLETE)"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {validNextStates.length === 0 ? (
            <p className="text-sm italic text-slate-500">No state transitions available for your role.</p>
          ) : (
            validNextStates.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => submit(s)}
                disabled={submitting}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-50"
              >
                → {ZONE_STATE_LABEL[s]}
              </button>
            ))
          )}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={props.onClose}
            className="rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Evacuation trigger modal ───────────────────────────────────────────────

function EvacuationModal(props: {
  incidentId: string;
  zoneStates: SireZoneState[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reasonNote, setReasonNote] = useState('');
  const [paText, setPaText] = useState('');
  const [paEdited, setPaEdited] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (zoneId: string) => {
    const next = new Set(selected);
    if (next.has(zoneId)) next.delete(zoneId);
    else next.add(zoneId);
    setSelected(next);
  };

  // BR-N: auto-draft PA text from current selection (selective if zones
  // picked, else full-venue). Does not clobber SH manual edits.
  useEffect(() => {
    if (paEdited) return;
    const names = props.zoneStates
      .filter((z) => selected.has(z.zone_id))
      .map((z) => z.zones?.name ?? z.zone_id.slice(0, 8));
    setPaText(
      draftPaAnnouncement({
        triggerType: selected.size > 0 ? 'ZONE_SELECTIVE' : 'FULL_VENUE',
        zoneNames: names,
      }).en,
    );
  }, [selected, paEdited, props.zoneStates]);

  const submit = async (triggerType: 'ZONE_SELECTIVE' | 'FULL_VENUE') => {
    if (reasonNote.trim().length === 0) {
      setError('Reason note is required');
      return;
    }
    if (triggerType === 'ZONE_SELECTIVE' && selected.size === 0) {
      setError('Select at least one zone');
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await postEvacuationTrigger(props.incidentId, {
      trigger_type: triggerType,
      zones_affected:
        triggerType === 'ZONE_SELECTIVE'
          ? Array.from(selected)
          : props.zoneStates.map((z) => z.zone_id),
      reason_note: reasonNote.trim(),
      pa_text_broadcast: paText.trim() || undefined,
      pa_language: 'en-IN',
    });
    setSubmitting(false);
    if (result.ok) props.onSuccess();
    else setError(result.error ?? 'Trigger failed');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-red-900">⚠ Trigger evacuation</h3>
        <p className="mt-1 text-sm text-slate-600">
          Select zones for selective, or click Full Venue to evacuate everywhere.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3">
          {props.zoneStates.map((z) => {
            const isSel = selected.has(z.zone_id);
            return (
              <button
                key={z.id}
                type="button"
                onClick={() => toggle(z.zone_id)}
                className={`rounded-md border p-2 text-left text-sm ${
                  isSel
                    ? 'border-red-500 bg-red-50 text-red-900'
                    : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
                }`}
              >
                {isSel ? '☑ ' : '☐ '}
                {z.zones?.name ?? z.zone_id.slice(0, 8)}
                <div className="text-xs opacity-70">{ZONE_STATE_LABEL[z.state]}</div>
              </button>
            );
          })}
        </div>

        <div className="mt-4 space-y-3">
          <textarea
            value={reasonNote}
            onChange={(e) => setReasonNote(e.target.value)}
            placeholder="Reason note (required)"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            rows={2}
          />
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs text-slate-500">
                PA announcement (auto-drafted — edit before broadcast)
              </label>
              {paEdited && (
                <button
                  type="button"
                  onClick={() => setPaEdited(false)}
                  className="text-xs font-semibold text-blue-700 hover:underline"
                >
                  ↻ Reset to suggested
                </button>
              )}
            </div>
            <textarea
              value={paText}
              onChange={(e) => {
                setPaEdited(true);
                setPaText(e.target.value);
              }}
              placeholder="PA broadcast text"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              rows={4}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => submit('ZONE_SELECTIVE')}
            disabled={submitting}
            className="rounded-md border border-red-400 bg-red-50 px-4 py-2 text-sm font-medium text-red-800 transition hover:bg-red-100 disabled:opacity-50"
          >
            ⚠ Trigger selective ({selected.size} zone{selected.size !== 1 ? 's' : ''})
          </button>
          <button
            type="button"
            onClick={() => submit('FULL_VENUE')}
            disabled={submitting}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-50"
          >
            ⚠⚠ Full venue evacuation
          </button>
          <button
            type="button"
            onClick={props.onClose}
            className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
