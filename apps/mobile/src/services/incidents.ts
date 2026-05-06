import { apiFetch } from '../config/api';
import { getStoredSession } from './auth';

export interface Zone {
  id: string;
  name: string;
  zone_type: string;
}

export type IncidentType = 'FIRE' | 'MEDICAL' | 'SECURITY' | 'EVACUATION' | 'STRUCTURAL' | 'OTHER';
export type Severity = 'SEV1' | 'SEV2' | 'SEV3';

export interface DeclarePayload {
  incident_type: IncidentType;
  severity: Severity;
  zone_id?: string;
  description?: string;
}

export interface ActiveIncident {
  id: string;
  zone_id: string | null;
  incident_type: IncidentType;
  severity: Severity;
  status: 'ACTIVE' | 'CONTAINED';
  declared_at: string;
  zones: { name: string } | null;
}

export async function fetchActiveIncidents(): Promise<ActiveIncident[]> {
  const session = await getStoredSession();
  if (!session) return [];
  const { data } = await apiFetch<ActiveIncident[]>('/incidents', { token: session.access_token });
  return data ?? [];
}

export async function markSafe(incidentId: string): Promise<boolean> {
  const session = await getStoredSession();
  if (!session) return false;
  const { error } = await apiFetch(`/incidents/${incidentId}/staff-safe`, {
    method: 'POST',
    token: session.access_token,
  });
  return !error;
}

export async function resolveIncident(incidentId: string): Promise<boolean> {
  const session = await getStoredSession();
  if (!session) return false;
  const { error } = await apiFetch(`/incidents/${incidentId}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status: 'RESOLVED' }),
    token: session.access_token,
  });
  return !error;
}

export async function fetchZones(): Promise<Zone[]> {
  const session = await getStoredSession();
  if (!session) return [];
  const { data } = await apiFetch<Zone[]>('/zones', { token: session.access_token });
  return data ?? [];
}

// ─── Incident detail (Phase 5.8 — mobile timeline view) ──────────────────────

export interface TimelineEvent {
  id: string;
  incident_id: string;
  event_type: string;
  actor_staff_id: string | null;
  metadata: Record<string, unknown> | null;
  occurred_at: string;
}

export interface IncidentDetail {
  id: string;
  incident_type: IncidentType;
  severity: Severity;
  status: 'ACTIVE' | 'CONTAINED' | 'RESOLVED' | 'CLOSED';
  declared_at: string;
  resolved_at: string | null;
  description: string | null;
  zone_id: string | null;
  declared_by_staff_id: string | null;
  zones: { name: string; floor_id: string | null } | null;
  staff: { name: string; role: string } | null;
  incident_timeline: TimelineEvent[];
}

export interface StaffRef {
  id: string;
  name: string;
  role: string;
}

/**
 * fetchIncidentDetail — full incident lifecycle.
 *
 * Backed by GET /v1/incidents/:id which already returns the full join
 * shape (zones, staff, incident_timeline). No api change required.
 */
export async function fetchIncidentDetail(
  incidentId: string,
): Promise<{ incident: IncidentDetail | null; error: string | null }> {
  const session = await getStoredSession();
  if (!session) return { incident: null, error: 'Not authenticated' };
  const { data, error } = await apiFetch<IncidentDetail>(`/incidents/${incidentId}`, {
    token: session.access_token,
  });
  return { incident: data ?? null, error };
}

/**
 * fetchStaffList — used to resolve timeline actor names client-side.
 *
 * The /v1/incidents/:id endpoint returns timeline events with
 * actor_staff_id but no joined staff name. Phase B api enhancement
 * will nest staff into the timeline; until then we resolve via this
 * lookup.
 *
 * The /v1/staff endpoint requires role SH/DSH/GM/AUDITOR — for
 * GROUND_STAFF callers it returns 403. We degrade gracefully: empty
 * map → UI shows actor IDs instead of names.
 */
export async function fetchStaffList(): Promise<StaffRef[]> {
  const session = await getStoredSession();
  if (!session) return [];
  const { data } = await apiFetch<StaffRef[]>('/staff', { token: session.access_token });
  return data ?? [];
}

export async function declareIncident(
  payload: DeclarePayload,
): Promise<{ success: boolean; incident_id?: string; error?: string }> {
  const session = await getStoredSession();
  if (!session) return { success: false, error: 'Not authenticated' };

  const { data, error } = await apiFetch<{ id: string }>('/incidents', {
    method: 'POST',
    body: JSON.stringify(payload),
    token: session.access_token,
  });

  if (error || !data) return { success: false, error: error ?? 'Failed to declare incident' };
  return { success: true, incident_id: data.id };
}
