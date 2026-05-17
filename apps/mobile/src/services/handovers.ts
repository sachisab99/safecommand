/**
 * Mobile Shift Handover service (BR-12) — talks to the shipped
 * /v1/handovers api (submit/list/accept). Reuses ShiftInstance +
 * fetchShiftInstances + canManageShifts + todayDate from services/shifts
 * (DRY — same roster substrate).
 *
 * Runtime note: /v1/handovers ships with PR #9 — until that api deploys,
 * fetchHandovers returns an error, which the screen renders gracefully
 * (no crash) per the hardening discipline.
 */

import { apiFetch } from '../config/api';
import { getStoredSession } from './auth';
export {
  fetchShiftInstances,
  canManageShifts,
  todayDate,
  type ShiftInstance,
} from './shifts';

export interface InstanceLabel {
  id: string;
  shift_date: string;
  status: string;
  shift_name: string | null;
  commander_name: string | null;
}

export interface HandoverSnapshot {
  captured_at?: string;
  zones?: { name: string; status: string }[];
  open_incidents?: { type: string; severity: string; status: string; zone: string | null }[];
}

export interface Handover {
  id: string;
  outgoing_instance_id: string;
  incoming_instance_id: string;
  notes: string | null;
  snapshots: HandoverSnapshot | null;
  outgoing_submitted_at: string | null;
  incoming_accepted_at: string | null;
  created_at: string;
  outgoing: InstanceLabel | null;
  incoming: InstanceLabel | null;
  state: 'SUBMITTED' | 'ACCEPTED';
}

export async function fetchHandovers(): Promise<{ data: Handover[] | null; error: string | null }> {
  const session = await getStoredSession();
  if (!session) return { data: null, error: 'Not authenticated' };
  return apiFetch<Handover[]>('/handovers', { token: session.access_token });
}

export async function createHandover(payload: {
  outgoing_instance_id: string;
  incoming_instance_id: string;
  notes?: string;
}): Promise<{ ok: boolean; error: string | null }> {
  const session = await getStoredSession();
  if (!session) return { ok: false, error: 'Not authenticated' };
  const { error } = await apiFetch<{ id: string }>('/handovers', {
    method: 'POST',
    body: JSON.stringify(payload),
    token: session.access_token,
  });
  return { ok: !error, error };
}

export async function acceptHandover(
  id: string,
): Promise<{ ok: boolean; error: string | null }> {
  const session = await getStoredSession();
  if (!session) return { ok: false, error: 'Not authenticated' };
  const { error } = await apiFetch<{ id: string }>(`/handovers/${id}/accept`, {
    method: 'PUT',
    body: JSON.stringify({}),
    token: session.access_token,
  });
  return { ok: !error, error };
}
