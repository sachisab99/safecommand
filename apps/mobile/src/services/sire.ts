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
import { uploadToS3 } from './tasks';
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

export interface SireEvidenceItem {
  id: string;
  incident_id: string;
  posted_by: string | null;
  posted_by_role: string | null;
  evidence_url: string;
  content_type: string | null;
  caption: string | null;
  gps_latitude: number | null;
  gps_longitude: number | null;
  created_at: string;
  staff?: { name: string } | null;
}

export interface SireDashboardPrompt {
  id: string;
  prompt_type: string;
  message: string;
  trigger_metadata: {
    zones_in_attention?: string[];
    window_minutes?: number;
    threshold_zones?: number;
  } | null;
  created_at: string;
  dismissed_at: string | null;
  dismissed_by: string | null;
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
  /** Shared incident photo wall (mig 018, Rec 2b) — every incident */
  evidence_wall: SireEvidenceItem[];
  /** BR-L soft suggestions — command roles only (Hard Rule 23: never auto-trigger) */
  active_prompts: SireDashboardPrompt[];
}

// ─── GET /v1/sire/state/:incidentId ─────────────────────────────────────────

/**
 * The API response is a TRUST BOUNDARY. An older deployed api (or a partial
 * response) may omit newer arrays (evidence_wall, active_prompts). Coerce
 * every array to [] here, ONCE, so no consumer can ever `.map` undefined.
 * This is the single chokepoint that prevents the version-skew render crash.
 */
function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

export function normalizeSireState(
  raw: Partial<SireState> | null | undefined,
): SireState | null {
  if (!raw || typeof raw !== 'object') return null;
  return {
    incident_id: raw.incident_id ?? '',
    has_sire_data: raw.has_sire_data ?? false,
    incident_type: raw.incident_type,
    incident_subtype: raw.incident_subtype ?? null,
    status: raw.status,
    declared_at: raw.declared_at,
    zone_states: asArray<SireZoneState>(raw.zone_states),
    assignments: asArray<SireAssignment>(raw.assignments),
    evacuation_triggers: asArray<SireEvacuationTrigger>(raw.evacuation_triggers),
    evidence_wall: asArray<SireEvidenceItem>(raw.evidence_wall),
    active_prompts: asArray<SireDashboardPrompt>(raw.active_prompts),
  };
}

export async function fetchSireState(incidentId: string): Promise<SireState | null> {
  const session = await getStoredSession();
  if (!session) return null;
  const { data } = await apiFetch<Partial<SireState>>(`/sire/state/${incidentId}`, {
    token: session.access_token,
  });
  return normalizeSireState(data);
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

// ─── Incident photo wall (mig 018, Rec 2b) ─────────────────────────────────

/**
 * Capture→S3 helper: presign for purpose=incident_evidence, PUT the local
 * file to S3, return the public URL. Reuses uploadToS3 from services/tasks
 * (same pattern as task photo evidence — BR-07).
 */
export async function uploadIncidentPhoto(
  incidentId: string,
  localUri: string,
  contentType = 'image/jpeg',
): Promise<{ ok: boolean; publicUrl?: string; error?: string }> {
  const session = await getStoredSession();
  if (!session) return { ok: false, error: 'Not authenticated' };

  const { data, error } = await apiFetch<{
    upload_url: string;
    file_key: string;
    public_url: string;
  }>(
    `/upload/presign?purpose=incident_evidence&ref_id=${incidentId}&content_type=${encodeURIComponent(contentType)}`,
    { token: session.access_token },
  );
  if (error || !data) return { ok: false, error: error ?? 'Could not get upload URL' };

  const uploaded = await uploadToS3(data.upload_url, localUri, contentType);
  if (!uploaded.ok) {
    return {
      ok: false,
      error: uploaded.detail ? `Upload failed: ${uploaded.detail}` : 'Photo upload failed',
    };
  }

  return { ok: true, publicUrl: data.public_url };
}

export interface PostIncidentEvidencePayload {
  evidence_url: string;
  content_type?: string;
  caption?: string;
  gps_latitude?: number;
  gps_longitude?: number;
}

export async function postIncidentEvidence(
  incidentId: string,
  payload: PostIncidentEvidencePayload,
): Promise<{ ok: boolean; error: string | null }> {
  const session = await getStoredSession();
  if (!session) return { ok: false, error: 'Not authenticated' };
  const { error } = await apiFetch<{ id: string }>(`/sire/incidents/${incidentId}/evidence`, {
    method: 'POST',
    body: JSON.stringify(payload),
    token: session.access_token,
  });
  return { ok: !error, error };
}

// ─── BR-L soft prompt dismiss (command roles only) ─────────────────────────

export async function dismissPrompt(
  promptId: string,
): Promise<{ ok: boolean; error: string | null }> {
  const session = await getStoredSession();
  if (!session) return { ok: false, error: 'Not authenticated' };
  const { error } = await apiFetch<{ id: string }>(`/sire/prompts/${promptId}/dismiss`, {
    method: 'POST',
    body: JSON.stringify({}),
    token: session.access_token,
  });
  return { ok: !error, error };
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
