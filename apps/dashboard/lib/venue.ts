/**
 * Dashboard venue client — BR-23 Festival/Event Mode.
 * Reuses the SHIPPED api: GET /v1/venue (returns festival_mode) +
 * PUT /v1/venue/festival-mode (role-gated SH/DSH/GM, validated, audited).
 * No new api/schema/worker.
 */
import { apiFetch } from './api';

export interface Venue {
  id: string;
  name: string;
  festival_mode: boolean;
  [k: string]: unknown;
}

export async function fetchVenue() {
  return apiFetch<Venue>('/venue');
}

export async function setFestivalMode(
  active: boolean,
): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await apiFetch<{ festival_mode: boolean }>('/venue/festival-mode', {
    method: 'PUT',
    body: JSON.stringify({ active }),
  });
  return { ok: !error, error };
}

// Must match api requireRole on PUT /venue/festival-mode.
const TOGGLE_ROLES = ['SH', 'DSH', 'GM'];
export function canToggleFestival(role: string | undefined | null): boolean {
  return !!role && TOGGLE_ROLES.includes(role);
}
