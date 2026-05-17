/**
 * Mobile venue service — BR-23 Festival/Event Mode. Reuses the shipped api
 * (GET /v1/venue, PUT /v1/venue/festival-mode). No new api/schema/worker.
 */
import { apiFetch } from '../config/api';
import { getStoredSession } from './auth';

export interface Venue {
  id: string;
  name: string;
  festival_mode: boolean;
}

export async function fetchVenue(): Promise<{ data: Venue | null; error: string | null }> {
  const session = await getStoredSession();
  if (!session) return { data: null, error: 'Not authenticated' };
  return apiFetch<Venue>('/venue', { token: session.access_token });
}

export async function setFestivalMode(
  active: boolean,
): Promise<{ ok: boolean; error: string | null }> {
  const session = await getStoredSession();
  if (!session) return { ok: false, error: 'Not authenticated' };
  const { error } = await apiFetch<{ festival_mode: boolean }>('/venue/festival-mode', {
    method: 'PUT',
    body: JSON.stringify({ active }),
    token: session.access_token,
  });
  return { ok: !error, error };
}

/** Must match api requireRole on PUT /venue/festival-mode. */
export function canToggleFestival(role: string): boolean {
  return ['SH', 'DSH', 'GM'].includes(role);
}
