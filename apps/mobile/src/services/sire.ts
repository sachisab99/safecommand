/**
 * SIRE service helpers — mobile client for Phase 5.21 Day 2 endpoints.
 *
 * Covers:
 *   - GET /v1/sire/state/:incidentId — live zone grid + assignments
 *   - GET /v1/sire/templates/resolve — preview action template
 *   - PATCH /v1/sire/incidents/:id/zones/:zoneId/state — drive state machine
 *   - PATCH /v1/sire/action-assignments/:id — drive status machine
 *   - POST /v1/sire/incidents/:id/evacuation-triggers — selective + full evac
 *
 * Mirrors the existing apps/mobile/src/services/incidents.ts pattern:
 * `apiFetch` wrapper + getStoredSession() for auth.
 */

import { apiFetch } from '../config/api';
import { getStoredSession } from './auth';
import type { IncidentZoneState } from '@safecommand/types';

// ─── Types (mirror api response shapes) ─────────────────────────────────────

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

// ─── GET /v1/sire/state/:incidentId ─────────────────────────────────────────

export async function fetchSireState(incidentId: string): Promise<SireState | null> {
  const session = await getStoredSession();
  if (!session) return null;
  const { data } = await apiFetch<SireState>(`/sire/state/${incidentId}`, {
    token: session.access_token,
  });
  return data;
}

// ─── PATCH /v1/sire/incidents/:incidentId/zones/:zoneId/state ──────────────

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
): Promise<{ ok: boolean; error: string | null; valid_transitions?: IncidentZoneState[] }> {
  const session = await getStoredSession();
  if (!session) return { ok: false, error: 'Not authenticated' };
  const { error } = await apiFetch<{ id: string }>(
    `/sire/incidents/${incidentId}/zones/${zoneId}/state`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
      token: session.access_token,
    },
  );
  return { ok: !error, error };
}

// ─── PATCH /v1/sire/action-assignments/:id ──────────────────────────────────

export interface PatchAssignmentPayload {
  status: Exclude<SireAssignmentStatus, 'ASSIGNED'>;
  blocked_reason?: string;
  evidence?: {
    evidence_url?: string;
    evidence_note?: string;
    signature_data?: string;
    gps_latitude?: number;
    gps_longitude?: number;
  };
}

export async function patchAssignmentStatus(
  assignmentId: string,
  payload: PatchAssignmentPayload,
): Promise<{ ok: boolean; error: string | null }> {
  const session = await getStoredSession();
  if (!session) return { ok: false, error: 'Not authenticated' };
  const { error } = await apiFetch<{ id: string }>(`/sire/action-assignments/${assignmentId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
    token: session.access_token,
  });
  return { ok: !error, error };
}

// ─── POST /v1/sire/incidents/:incidentId/evacuation-triggers ───────────────

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
): Promise<{ ok: boolean; error: string | null; trigger?: SireEvacuationTrigger }> {
  const session = await getStoredSession();
  if (!session) return { ok: false, error: 'Not authenticated' };
  const { data, error } = await apiFetch<SireEvacuationTrigger>(
    `/sire/incidents/${incidentId}/evacuation-triggers`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
      token: session.access_token,
    },
  );
  return { ok: !error, error, trigger: data ?? undefined };
}

// ─── Helpers for UI ─────────────────────────────────────────────────────────

/**
 * Filter assignments to those owned by the given staff member.
 * Used by mobile to render "your actions for this incident".
 */
export function assignmentsForStaff(
  assignments: SireAssignment[],
  staffId: string,
): SireAssignment[] {
  return assignments
    .filter((a) => a.staff_id === staffId)
    .sort((a, b) => a.action_order - b.action_order);
}

/**
 * Filter zone states to those assigned to a specific GS.
 * Used by mobile to render "your zones for this incident".
 */
export function zoneStatesAssignedToGs(
  zoneStates: SireZoneState[],
  staffId: string,
): SireZoneState[] {
  return zoneStates.filter((zs) => zs.assigned_gs_id === staffId);
}

/**
 * Compute progress summary across assignments — used in checklist header.
 */
export function summariseAssignments(assignments: SireAssignment[]): {
  total: number;
  done: number;
  in_progress: number;
  skipped: number;
  blocked: number;
} {
  const summary = { total: assignments.length, done: 0, in_progress: 0, skipped: 0, blocked: 0 };
  for (const a of assignments) {
    if (a.status === 'DONE') summary.done++;
    else if (a.status === 'IN_PROGRESS') summary.in_progress++;
    else if (a.status === 'SKIPPED') summary.skipped++;
    else if (a.status === 'BLOCKED') summary.blocked++;
  }
  return summary;
}
