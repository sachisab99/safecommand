/**
 * Dashboard incident-declaration client — command-desk parity with the
 * mobile 3-tap flow (BR-11). Mirrors apps/mobile/src/services/incidents.ts
 * (`declareIncident` / `fetchZones`) but uses the dashboard `apiFetch`
 * (localStorage-token). Hits the SAME `POST /v1/incidents` endpoint — no
 * new server surface; the api already enforces requireRole(SH/DSH/SC/GM/FM).
 *
 * Purely additive: declaration stays mobile-first by design; this is the
 * command-desk path for an SH/SC at the dashboard.
 */

import type { IncidentType, IncidentSeverity } from '@safecommand/types';
import { apiFetch } from './api';

export interface ZoneRef {
  id: string;
  name: string;
  zone_type: string;
}

export interface DeclarePayload {
  incident_type: IncidentType;
  severity: IncidentSeverity;
  zone_id?: string;
  description?: string;
  // Phase 5.21 SIRE — optional. enable_sire=true switches to the SIRE v2
  // path (10-state zone grid + per-role action templates + assignments).
  incident_subtype?: string;
  enable_sire?: boolean;
  affected_zone_ids?: string[];
}

export async function fetchZones(): Promise<ZoneRef[]> {
  const { data } = await apiFetch<ZoneRef[]>('/zones');
  return data ?? [];
}

export async function declareIncident(
  payload: DeclarePayload,
): Promise<{ ok: boolean; incidentId?: string; error: string | null }> {
  const { data, error } = await apiFetch<{ id: string }>('/incidents', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (error || !data) return { ok: false, error: error ?? 'Failed to declare incident' };
  return { ok: true, incidentId: data.id, error: null };
}

// Roles permitted to declare — MUST match api requireRole on POST /incidents
// (apps/api/src/routes/incidents.ts). UI gate is defence-in-depth only;
// the api + RLS are the real enforcement.
export const DECLARE_ROLES = ['SH', 'DSH', 'SHIFT_COMMANDER', 'GM', 'FM'] as const;

export function canDeclare(role: string | undefined | null): boolean {
  return !!role && (DECLARE_ROLES as readonly string[]).includes(role);
}

// Parity with mobile IncidentScreen: SIRE sub-type chips only for FIRE +
// EVACUATION (others declare with enable_sire and null sub-type → EC-23
// parent fallback, which mig 019 now covers for every type).
export const SIRE_SUBTYPES: Partial<Record<IncidentType, string[]>> = {
  FIRE: ['FIRE_CONTAINED', 'FIRE_SPREADING', 'FIRE_SUSPECTED', 'FIRE_DRILL'],
  EVACUATION: [
    'EVACUATION_FULL',
    'EVACUATION_PARTIAL_ZONE',
    'EVACUATION_SHELTER_IN_PLACE',
    'EVACUATION_DRILL',
  ],
};

export const INCIDENT_TYPES: { type: IncidentType; label: string; icon: string }[] = [
  { type: 'FIRE', label: 'Fire', icon: '🔥' },
  { type: 'MEDICAL', label: 'Medical', icon: '🏥' },
  { type: 'SECURITY', label: 'Security', icon: '🔒' },
  { type: 'EVACUATION', label: 'Evacuation', icon: '🚨' },
  { type: 'STRUCTURAL', label: 'Structural', icon: '🏗️' },
  { type: 'OTHER', label: 'Other', icon: '⚠️' },
];

export const SEVERITIES: { level: IncidentSeverity; label: string }[] = [
  { level: 'SEV1', label: 'SEV 1 — Critical' },
  { level: 'SEV2', label: 'SEV 2 — Serious' },
  { level: 'SEV3', label: 'SEV 3 — Minor' },
];
