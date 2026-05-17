/**
 * Dashboard Shift Handover client (BR-12). Talks to /v1/handovers (submit/
 * list/accept) + reuses /v1/shift-instances for the instance pickers.
 */
import { apiFetch } from './api';

export interface InstanceLabel {
  id: string;
  shift_date: string;
  status: string;
  shift_name: string | null;
  commander_name: string | null;
}

export interface Handover {
  id: string;
  outgoing_instance_id: string;
  incoming_instance_id: string;
  notes: string | null;
  snapshots: {
    captured_at?: string;
    zones?: { name: string; status: string }[];
    open_incidents?: { type: string; severity: string; status: string; zone: string | null }[];
  } | null;
  outgoing_submitted_at: string | null;
  incoming_accepted_at: string | null;
  created_at: string;
  outgoing: InstanceLabel | null;
  incoming: InstanceLabel | null;
  state: 'SUBMITTED' | 'ACCEPTED';
}

export interface ShiftInstanceLite {
  id: string;
  shift_date: string;
  status: string;
  shift: { name: string } | null;
  commander: { name: string } | null;
}

export async function fetchHandovers() {
  return apiFetch<Handover[]>('/handovers');
}

export async function fetchShiftInstances(date: string) {
  return apiFetch<ShiftInstanceLite[]>(`/shift-instances?date=${date}`);
}

export async function createHandover(payload: {
  outgoing_instance_id: string;
  incoming_instance_id: string;
  notes?: string;
}): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await apiFetch<{ id: string }>('/handovers', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return { ok: !error, error };
}

export async function acceptHandover(id: string): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await apiFetch<{ id: string }>(`/handovers/${id}/accept`, { method: 'PUT', body: '{}' });
  return { ok: !error, error };
}

// Write roles — MUST match api requireRole on POST/PUT /handovers.
const MANAGE_ROLES = ['SH', 'DSH', 'SHIFT_COMMANDER'];
export function canManageHandover(role: string | undefined | null): boolean {
  return !!role && MANAGE_ROLES.includes(role);
}

export function instanceLabel(i: ShiftInstanceLite): string {
  return `${i.shift?.name ?? 'Shift'} · ${i.shift_date} · ${i.status}${
    i.commander ? ` · ${i.commander.name}` : ''
  }`;
}
