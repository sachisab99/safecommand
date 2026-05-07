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
