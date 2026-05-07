/**
 * Drill compliance service — Phase 5.11 mobile companion to BR-A.
 *
 * Reads /v1/drill-sessions for venue-wide drill tracking. Compliance
 * score uses recency-of-last-completed-drill formula (best-practice
 * quarterly cadence).
 */

import { apiFetch } from '../config/api';
import { getStoredSession } from './auth';

export type DrillType =
  | 'FIRE_EVACUATION'
  | 'EARTHQUAKE'
  | 'BOMB_THREAT'
  | 'MEDICAL_EMERGENCY'
  | 'PARTIAL_EVACUATION'
  | 'FULL_EVACUATION'
  | 'OTHER';

export type DrillStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface DrillSession {
  id: string;
  venue_id: string;
  building_id: string | null;
  drill_type: DrillType;
  status: DrillStatus;
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

export const DRILL_TYPE_LABEL: Record<string, string> = {
  FIRE_EVACUATION: 'Fire Evacuation',
  EARTHQUAKE: 'Earthquake',
  BOMB_THREAT: 'Bomb Threat',
  MEDICAL_EMERGENCY: 'Medical Emergency',
  PARTIAL_EVACUATION: 'Partial Evacuation',
  FULL_EVACUATION: 'Full Evacuation',
  OTHER: 'Other',
};

export const DRILL_TYPE_ICON: Record<string, string> = {
  FIRE_EVACUATION: '🔥',
  EARTHQUAKE: '🌍',
  BOMB_THREAT: '💣',
  MEDICAL_EMERGENCY: '🏥',
  PARTIAL_EVACUATION: '🚪',
  FULL_EVACUATION: '🚨',
  OTHER: '⚠️',
};

export async function fetchDrills(): Promise<{
  drills: DrillSession[];
  error: string | null;
}> {
  const session = await getStoredSession();
  if (!session) return { drills: [], error: 'Not authenticated' };
  const { data, error } = await apiFetch<DrillSession[]>('/drill-sessions', {
    token: session.access_token,
  });
  return { drills: data ?? [], error };
}

export function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
}

export function computeDrillScore(drills: DrillSession[]): number {
  const completed = drills
    .filter((d) => d.status === 'COMPLETED' && d.ended_at !== null)
    .sort((a, b) => (b.ended_at ?? '').localeCompare(a.ended_at ?? ''));
  if (completed.length === 0) return 0;
  const days = daysSince(completed[0]!.ended_at!);
  if (days <= 90) return 100;
  if (days <= 180) return 75;
  if (days <= 270) return 50;
  if (days <= 365) return 25;
  return 0;
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds < 0) return '—';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

// ─── Write helpers (BR-A — SH/DSH/FM/SHIFT_COMMANDER) ──────────────────────
// api enforces same role-gate via requireRole. UI hides controls for
// ineligible roles to avoid 403 round-trip.

export interface ScheduleDrillPayload {
  drill_type: DrillType;
  scheduled_for: string; // ISO datetime
  notes?: string | null;
  building_id?: string | null;
}

export async function scheduleDrill(
  payload: ScheduleDrillPayload,
): Promise<{ drill: DrillSession | null; error: string | null }> {
  const session = await getStoredSession();
  if (!session) return { drill: null, error: 'Not authenticated' };
  const { data, error } = await apiFetch<DrillSession>('/drill-sessions', {
    method: 'POST',
    token: session.access_token,
    body: JSON.stringify(payload),
  });
  return { drill: data, error };
}

export async function startDrill(
  id: string,
): Promise<{ drill: DrillSession | null; error: string | null }> {
  const session = await getStoredSession();
  if (!session) return { drill: null, error: 'Not authenticated' };
  const { data, error } = await apiFetch<DrillSession>(`/drill-sessions/${id}/start`, {
    method: 'PUT',
    token: session.access_token,
  });
  return { drill: data, error };
}

export async function endDrill(
  id: string,
): Promise<{ drill: DrillSession | null; error: string | null }> {
  const session = await getStoredSession();
  if (!session) return { drill: null, error: 'Not authenticated' };
  const { data, error } = await apiFetch<DrillSession>(`/drill-sessions/${id}/end`, {
    method: 'PUT',
    token: session.access_token,
  });
  return { drill: data, error };
}

export async function cancelDrill(
  id: string,
): Promise<{ drill: DrillSession | null; error: string | null }> {
  const session = await getStoredSession();
  if (!session) return { drill: null, error: 'Not authenticated' };
  const { data, error } = await apiFetch<DrillSession>(`/drill-sessions/${id}/cancel`, {
    method: 'PUT',
    token: session.access_token,
  });
  return { drill: data, error };
}

/** Roles allowed to write drills — must match api requireRole exactly */
export function canWriteDrills(role: string): boolean {
  return ['SH', 'DSH', 'FM', 'SHIFT_COMMANDER'].includes(role);
}

// ─── Phase 5.18 — Detail / participants / reason taxonomy ──────────────────
// Backed by ADR 0004 + docs/research/drill-participant-reason-taxonomy.md.

export type ParticipantStatus = 'NOTIFIED' | 'ACKNOWLEDGED' | 'SAFE_CONFIRMED' | 'MISSED';

export type ReasonCode =
  | 'OFF_DUTY'
  | 'ON_LEAVE'
  | 'ON_BREAK'
  | 'ON_DUTY_ELSEWHERE'
  | 'DEVICE_OR_NETWORK_ISSUE'
  | 'OTHER';

export const REASON_CODES: ReasonCode[] = [
  'OFF_DUTY',
  'ON_LEAVE',
  'ON_BREAK',
  'ON_DUTY_ELSEWHERE',
  'DEVICE_OR_NETWORK_ISSUE',
  'OTHER',
];

/** Display labels — keep in sync with dashboard + Ops Console */
export const REASON_LABEL: Record<ReasonCode, string> = {
  OFF_DUTY: 'Off-duty',
  ON_LEAVE: 'On leave',
  ON_BREAK: 'On break',
  ON_DUTY_ELSEWHERE: 'On duty elsewhere',
  DEVICE_OR_NETWORK_ISSUE: 'Device or network issue',
  OTHER: 'Other (specify)',
};

/** Optional helper text shown next to chip in editor */
export const REASON_HINT: Record<ReasonCode, string> = {
  OFF_DUTY: 'Not on shift at drill time',
  ON_LEAVE: 'Approved leave (any type)',
  ON_BREAK: 'Statutory meal/rest break',
  ON_DUTY_ELSEWHERE: 'Patient care / restricted area / other zone',
  DEVICE_OR_NETWORK_ISSUE: 'Phone offline / no signal / app crash',
  OTHER: 'Required: at least 10 characters of context',
};

export interface DrillStaffRef {
  id: string;
  name: string;
  role: string;
}

export interface DrillParticipant {
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
  staff: DrillStaffRef | null;
  reason_setter: DrillStaffRef | null;
  is_excused: boolean;
}

export interface DrillTimelineEvent {
  id: string;
  action: string;
  actor_staff_id: string | null;
  actor_role: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  ip_address: string | null;
  actor: DrillStaffRef | null;
}

export interface DrillAggregates {
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

export interface DrillDetail {
  drill: DrillSession;
  participants: DrillParticipant[];
  timeline: DrillTimelineEvent[];
  aggregates: DrillAggregates;
  requester_view: 'full' | 'self';
}

export async function fetchDrillDetail(
  drillId: string,
): Promise<{ detail: DrillDetail | null; error: string | null }> {
  const session = await getStoredSession();
  if (!session) return { detail: null, error: 'Not authenticated' };
  const { data, error } = await apiFetch<DrillDetail>(`/drill-sessions/${drillId}`, {
    token: session.access_token,
  });
  return { detail: data, error };
}

export async function acknowledgeDrill(
  drillId: string,
): Promise<{ ok: boolean; error: string | null }> {
  const session = await getStoredSession();
  if (!session) return { ok: false, error: 'Not authenticated' };
  const { error } = await apiFetch(`/drill-sessions/${drillId}/acknowledge`, {
    method: 'POST',
    token: session.access_token,
  });
  return { ok: !error, error };
}

export async function markDrillSafe(
  drillId: string,
): Promise<{ ok: boolean; error: string | null }> {
  const session = await getStoredSession();
  if (!session) return { ok: false, error: 'Not authenticated' };
  const { error } = await apiFetch(`/drill-sessions/${drillId}/staff-safe`, {
    method: 'POST',
    token: session.access_token,
  });
  return { ok: !error, error };
}

export interface SetParticipantReasonPayload {
  reason_code: ReasonCode | null;
  reason_notes?: string | null;
}

export async function setParticipantReason(
  drillId: string,
  staffId: string,
  payload: SetParticipantReasonPayload,
): Promise<{ ok: boolean; error: string | null }> {
  const session = await getStoredSession();
  if (!session) return { ok: false, error: 'Not authenticated' };
  const { error } = await apiFetch(
    `/drill-sessions/${drillId}/participants/${staffId}`,
    {
      method: 'PATCH',
      token: session.access_token,
      body: JSON.stringify(payload),
    },
  );
  return { ok: !error, error };
}

export interface ActiveDrillForMe {
  participant_id: string;
  participant_status: ParticipantStatus;
  notified_at: string;
  acknowledged_at: string | null;
  safe_confirmed_at: string | null;
  drill: {
    id: string;
    drill_type: DrillType;
    status: 'IN_PROGRESS';
    scheduled_for: string;
    started_at: string | null;
    building_id: string | null;
  };
}

export async function fetchActiveDrillsForMe(): Promise<{
  drills: ActiveDrillForMe[];
  error: string | null;
}> {
  const session = await getStoredSession();
  if (!session) return { drills: [], error: 'Not authenticated' };
  const { data, error } = await apiFetch<ActiveDrillForMe[]>('/drill-sessions/active-for-me', {
    token: session.access_token,
  });
  return { drills: data ?? [], error };
}

/** Roles allowed to set/clear participant reason — matches api requireRole */
export function canSetParticipantReason(role: string): boolean {
  return ['SH', 'DSH', 'FM', 'SHIFT_COMMANDER'].includes(role);
}

/** Roles allowed full venue read of participants — matches RLS RESTRICTIVE policy */
export function canSeeAllParticipants(role: string): boolean {
  return ['SH', 'DSH', 'FM', 'SHIFT_COMMANDER', 'AUDITOR', 'GM'].includes(role);
}
