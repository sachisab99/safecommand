/**
 * Dashboard SIRE service — web client for Phase 5.21 Day 2 endpoints.
 *
 * Mirrors apps/mobile/src/services/sire.ts API surface but uses the
 * dashboard's apiFetch helper (localStorage-token-based).
 */

import type { IncidentZoneState } from '@safecommand/types';
import { apiFetch } from './api';

// ─── Types — identical shape to mobile services/sire.ts ────────────────────

export interface SireZoneState {
  id: string;
  zone_id: string;
  state: IncidentZoneState;
  assigned_gs_id: string | null;
  reason_note: string | null;
  evidence_url: string | null;
  last_updated_by: string | null;
  last_updated_by_role: string | null;
  state_changed_at: string;
  zones?: { name: string; floor_id: string | null } | null;
}

export type SireAssignmentStatus = 'ASSIGNED' | 'IN_PROGRESS' | 'DONE' | 'SKIPPED' | 'BLOCKED';

export interface SireAssignment {
  id: string;
  staff_id: string;
  role: string;
  action_order: number;
  instruction: string;
  instruction_i18n_key: string;
  evidence_type: string | null;
  time_target_seconds: number | null;
  is_mandatory: boolean;
  is_life_critical: boolean;
  status: SireAssignmentStatus;
  started_at: string | null;
  completed_at: string | null;
  blocked_reason: string | null;
  staff?: { name: string } | null;
}

export interface SireEvacuationTrigger {
  id: string;
  trigger_type: 'ZONE_SELECTIVE' | 'FLOOR_SELECTIVE' | 'FULL_VENUE' | 'STAFF_TRIGGERED';
  triggered_by: string | null;
  triggered_by_role: string | null;
  zones_affected: string[];
  building_id: string | null;
  reason_note: string;
  pa_text_generated: string | null;
  pa_text_broadcast: string | null;
  pa_language: string | null;
  triggered_at: string;
}

export interface SireState {
  incident_id: string;
  has_sire_data: boolean;
  incident_type?: string;
  incident_subtype?: string | null;
  status?: string;
  declared_at?: string;
  zone_states: SireZoneState[];
  assignments: SireAssignment[];
  evacuation_triggers: SireEvacuationTrigger[];
}

// ─── API calls ──────────────────────────────────────────────────────────────

export async function fetchSireState(incidentId: string): Promise<SireState | null> {
  const { data } = await apiFetch<SireState>(`/sire/state/${incidentId}`);
  return data;
}

export interface PatchZoneStatePayload {
  to_state: IncidentZoneState;
  prev_state_changed_at: string;
  reason_note?: string;
  evidence_url?: string;
}

export async function patchZoneState(
  incidentId: string,
  zoneId: string,
  payload: PatchZoneStatePayload,
): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await apiFetch<{ id: string }>(
    `/sire/incidents/${incidentId}/zones/${zoneId}/state`,
    { method: 'PATCH', body: JSON.stringify(payload) },
  );
  return { ok: !error, error };
}

export interface PatchAssignmentPayload {
  status: Exclude<SireAssignmentStatus, 'ASSIGNED'>;
  blocked_reason?: string;
  evidence?: { evidence_url?: string; evidence_note?: string };
}

export async function patchAssignmentStatus(
  assignmentId: string,
  payload: PatchAssignmentPayload,
): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await apiFetch<{ id: string }>(`/sire/action-assignments/${assignmentId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return { ok: !error, error };
}

export interface PostEvacuationTriggerPayload {
  trigger_type: 'ZONE_SELECTIVE' | 'FLOOR_SELECTIVE' | 'FULL_VENUE' | 'STAFF_TRIGGERED';
  zones_affected: string[];
  building_id?: string;
  reason_note: string;
  pa_text_broadcast?: string;
  pa_language?: string;
}

export async function postEvacuationTrigger(
  incidentId: string,
  payload: PostEvacuationTriggerPayload,
): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await apiFetch<SireEvacuationTrigger>(
    `/sire/incidents/${incidentId}/evacuation-triggers`,
    { method: 'POST', body: JSON.stringify(payload) },
  );
  return { ok: !error, error };
}

// ─── UI helpers ─────────────────────────────────────────────────────────────

export function summariseAssignments(assignments: SireAssignment[]) {
  const summary = { total: assignments.length, done: 0, in_progress: 0, skipped: 0, blocked: 0 };
  for (const a of assignments) {
    if (a.status === 'DONE') summary.done++;
    else if (a.status === 'IN_PROGRESS') summary.in_progress++;
    else if (a.status === 'SKIPPED') summary.skipped++;
    else if (a.status === 'BLOCKED') summary.blocked++;
  }
  return summary;
}

/** Tailwind class for the zone-state coloured pill on the dashboard. */
export function zoneStateClasses(state: IncidentZoneState): string {
  switch (state) {
    case 'UNVALIDATED': return 'bg-slate-100 text-slate-700 border-slate-300';
    case 'SWEEP_IN_PROGRESS': return 'bg-blue-100 text-blue-800 border-blue-300';
    case 'ZONE_CLEAR': return 'bg-emerald-100 text-emerald-800 border-emerald-300';
    case 'NEEDS_ATTENTION': return 'bg-amber-100 text-amber-800 border-amber-400';
    case 'EVACUATION_TRIGGERED': return 'bg-red-100 text-red-800 border-red-500 animate-pulse';
    case 'EVACUATING': return 'bg-red-200 text-red-900 border-red-600';
    case 'EVACUATION_COMPLETE': return 'bg-emerald-100 text-emerald-800 border-emerald-300';
    case 'SH_CONFIRMED_CLEAR': return 'bg-emerald-200 text-emerald-900 border-emerald-700';
    case 'LOCKED_DOWN': return 'bg-purple-100 text-purple-800 border-purple-400';
    case 'INACCESSIBLE': return 'bg-slate-200 text-slate-800 border-slate-500';
  }
}

/** Tailwind class for assignment status pill. */
export function statusClasses(status: SireAssignmentStatus): string {
  switch (status) {
    case 'ASSIGNED': return 'bg-slate-100 text-slate-700';
    case 'IN_PROGRESS': return 'bg-blue-100 text-blue-800';
    case 'DONE': return 'bg-emerald-100 text-emerald-800';
    case 'SKIPPED': return 'bg-slate-200 text-slate-600';
    case 'BLOCKED': return 'bg-red-100 text-red-800';
  }
}
