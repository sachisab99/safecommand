/**
 * Shifts service — Phase 5.16b mobile companion to BR-04 / BR-12 / BR-13 /
 * BR-19 / BR-61.
 *
 * Backed by api routes /v1/shifts + /v1/shift-instances (Phase 5.16a).
 * Server enforces requireRole('SH','DSH','SHIFT_COMMANDER') on writes;
 * UI hides controls for ineligible roles to avoid the 403 round-trip.
 *
 * The roster loop (mobile + dashboard) closes end-to-end:
 *   shift_instance ACTIVATED → assignments saved → /v1/zones/accountability
 *   reflects new owners → MyShiftScreen + Zone Accountability auto-populate.
 */

import { apiFetch } from '../config/api';
import { getStoredSession } from './auth';

export type ShiftInstanceStatus = 'PENDING' | 'ACTIVE' | 'CLOSED';
export type AssignmentType = 'PRIMARY' | 'SECONDARY' | 'BACKUP';

export interface ShiftTemplate {
  id: string;
  venue_id: string;
  name: string;
  start_time: string; // HH:MM:SS
  end_time: string;
  building_id: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ShiftInstance {
  id: string;
  venue_id: string;
  shift_id: string;
  shift_date: string; // YYYY-MM-DD
  status: ShiftInstanceStatus;
  commander_staff_id: string | null;
  activated_at: string | null;
  shift: { id: string; name: string; start_time: string; end_time: string } | null;
  commander: { id: string; name: string; role: string } | null;
}

export interface ZoneAssignment {
  id: string;
  staff_id: string;
  zone_id: string;
  assignment_type: AssignmentType;
  created_at: string;
}

// ─── Reads ─────────────────────────────────────────────────────────────────

export async function fetchShiftTemplates(): Promise<{
  templates: ShiftTemplate[];
  error: string | null;
}> {
  const session = await getStoredSession();
  if (!session) return { templates: [], error: 'Not authenticated' };
  const { data, error } = await apiFetch<ShiftTemplate[]>('/shifts', {
    token: session.access_token,
  });
  return { templates: data ?? [], error };
}

export async function fetchShiftInstances(date: string): Promise<{
  instances: ShiftInstance[];
  error: string | null;
}> {
  const session = await getStoredSession();
  if (!session) return { instances: [], error: 'Not authenticated' };
  const { data, error } = await apiFetch<ShiftInstance[]>(
    `/shift-instances?date=${encodeURIComponent(date)}`,
    { token: session.access_token },
  );
  return { instances: data ?? [], error };
}

export async function fetchZoneAssignments(instanceId: string): Promise<{
  assignments: ZoneAssignment[];
  error: string | null;
}> {
  const session = await getStoredSession();
  if (!session) return { assignments: [], error: 'Not authenticated' };
  const { data, error } = await apiFetch<ZoneAssignment[]>(
    `/shift-instances/${instanceId}/zone-assignments`,
    { token: session.access_token },
  );
  return { assignments: data ?? [], error };
}

// ─── Writes (BR-04 / BR-12 / BR-13 — SH/DSH/SHIFT_COMMANDER) ───────────────

export async function createShiftInstance(
  shift_id: string,
  shift_date: string,
): Promise<{ instance: ShiftInstance | null; error: string | null }> {
  const session = await getStoredSession();
  if (!session) return { instance: null, error: 'Not authenticated' };
  const { data, error } = await apiFetch<ShiftInstance>('/shift-instances', {
    method: 'POST',
    token: session.access_token,
    body: JSON.stringify({ shift_id, shift_date }),
  });
  return { instance: data, error };
}

export async function activateShiftInstance(
  id: string,
  commander_staff_id: string,
): Promise<{ instance: ShiftInstance | null; error: string | null }> {
  const session = await getStoredSession();
  if (!session) return { instance: null, error: 'Not authenticated' };
  const { data, error } = await apiFetch<ShiftInstance>(
    `/shift-instances/${id}/activate`,
    {
      method: 'PUT',
      token: session.access_token,
      body: JSON.stringify({ commander_staff_id }),
    },
  );
  return { instance: data, error };
}

export async function closeShiftInstance(
  id: string,
): Promise<{ instance: ShiftInstance | null; error: string | null }> {
  const session = await getStoredSession();
  if (!session) return { instance: null, error: 'Not authenticated' };
  const { data, error } = await apiFetch<ShiftInstance>(
    `/shift-instances/${id}/close`,
    { method: 'PUT', token: session.access_token },
  );
  return { instance: data, error };
}

export interface AssignmentInput {
  staff_id: string;
  zone_id: string;
  assignment_type: AssignmentType;
}

export async function replaceZoneAssignments(
  instanceId: string,
  assignments: AssignmentInput[],
): Promise<{ ok: boolean; error: string | null }> {
  const session = await getStoredSession();
  if (!session) return { ok: false, error: 'Not authenticated' };
  const { error } = await apiFetch(
    `/shift-instances/${instanceId}/zone-assignments`,
    {
      method: 'PUT',
      token: session.access_token,
      body: JSON.stringify({ assignments }),
    },
  );
  return { ok: !error, error };
}

/** Roles allowed to manage shifts (must match api requireRole exactly) */
export function canManageShifts(role: string): boolean {
  return ['SH', 'DSH', 'SHIFT_COMMANDER'].includes(role);
}

/** Today as YYYY-MM-DD in local time (matches api default behaviour) */
export function todayDate(): string {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
