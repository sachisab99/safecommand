/**
 * Mobile Leave / Unavailability service (BR-AN) — Pattern Engine Pass 5a.
 *
 * Thin wrapper over /v1/unavailability for the staff self-service surface.
 * The api defaults non-command-role reads to req.auth.staff_id, so a GS /
 * FS / GROUND_STAFF caller sees their own rows only without explicit filter.
 *
 * Spec source: SafeCommand Shift Roster Architecture v1.0 §6.5.
 * DB protection (mig 022 §5.6): EXCLUDE-gist on (staff_id, daterange)
 * WHERE status='APPROVED' — overlapping APPROVED rows for same staff fail
 * at the DB; the api surfaces this as 422 OVERLAP. Submitting a REQUESTED
 * row that overlaps an existing APPROVED is fine — the gist constraint is
 * predicated on APPROVED.
 */

import { apiFetch } from '../config/api';
import { getStoredSession } from './auth';

export type UnavailabilityType =
  | 'LEAVE_ANNUAL'
  | 'LEAVE_SICK'
  | 'LEAVE_TRAINING'
  | 'LEAVE_PERSONAL'
  | 'OFF_DUTY'
  | 'SUSPENDED';

export type UnavailabilityStatus = 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN';

export interface UnavailabilityRow {
  id: string;
  venue_id: string;
  staff_id: string;
  unavailable_from: string;
  unavailable_to: string;
  unavailability_type: UnavailabilityType;
  reason_text: string | null;
  requested_by_staff_id: string | null;
  approved_by_staff_id: string | null;
  approved_at: string | null;
  status: UnavailabilityStatus;
  created_at: string;
}

// ─── UX helpers ─────────────────────────────────────────────────────────

export const UNAVAILABILITY_TYPE_LABEL: Record<UnavailabilityType, string> = {
  LEAVE_ANNUAL:   'Annual leave',
  LEAVE_SICK:     'Sick leave',
  LEAVE_TRAINING: 'Training',
  LEAVE_PERSONAL: 'Personal',
  OFF_DUTY:       'Off duty',
  SUSPENDED:      'Suspended',
};

/** Submittable subset — SUSPENDED is HR-managed; staff cannot self-submit. */
export const SUBMITTABLE_TYPES: UnavailabilityType[] = [
  'LEAVE_ANNUAL',
  'LEAVE_SICK',
  'LEAVE_TRAINING',
  'LEAVE_PERSONAL',
];

export const STATUS_TONE: Record<UnavailabilityStatus, { label: string; emoji: string }> = {
  REQUESTED: { label: 'Pending review', emoji: '⏳' },
  APPROVED:  { label: 'Approved',        emoji: '✓' },
  REJECTED:  { label: 'Rejected',        emoji: '✗' },
  WITHDRAWN: { label: 'Withdrawn',       emoji: '↺' },
};

/** Sort newest start-date first; tie-break by created_at descending. */
export function sortByRecency(rows: UnavailabilityRow[]): UnavailabilityRow[] {
  return [...rows].sort((a, b) => {
    if (a.unavailable_from !== b.unavailable_from) {
      return a.unavailable_from < b.unavailable_from ? 1 : -1;
    }
    return a.created_at < b.created_at ? 1 : -1;
  });
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysISO(isoDate: string, days: number): string {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ─── API calls ──────────────────────────────────────────────────────────

export async function fetchMyUnavailability(): Promise<{
  rows: UnavailabilityRow[];
  error: string | null;
}> {
  const session = await getStoredSession();
  if (!session) return { rows: [], error: 'Not authenticated' };
  const { data, error } = await apiFetch<UnavailabilityRow[]>('/unavailability', {
    token: session.access_token,
  });
  if (error) return { rows: [], error };
  return { rows: sortByRecency(data ?? []), error: null };
}

export interface SubmitLeaveInput {
  unavailable_from: string;
  unavailable_to: string;
  unavailability_type: UnavailabilityType;
  reason_text?: string;
}

export async function submitLeaveRequest(input: SubmitLeaveInput): Promise<{
  row: UnavailabilityRow | null;
  error: string | null;
}> {
  const session = await getStoredSession();
  if (!session) return { row: null, error: 'Not authenticated' };
  const { data, error } = await apiFetch<UnavailabilityRow>('/unavailability', {
    method: 'POST',
    token: session.access_token,
    body: JSON.stringify({
      staff_id: session.staff.id,
      unavailable_from: input.unavailable_from,
      unavailable_to: input.unavailable_to,
      unavailability_type: input.unavailability_type,
      reason_text: input.reason_text ?? null,
    }),
  });
  return { row: data, error };
}

export async function withdrawUnavailability(id: string): Promise<{ error: string | null }> {
  const session = await getStoredSession();
  if (!session) return { error: 'Not authenticated' };
  const { error } = await apiFetch<UnavailabilityRow>(`/unavailability/${id}/withdraw`, {
    method: 'POST',
    token: session.access_token,
    body: '{}',
  });
  return { error };
}
