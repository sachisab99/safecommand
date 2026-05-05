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
