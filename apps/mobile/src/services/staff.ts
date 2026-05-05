/**
 * Staff service — fetch + create + (future) update.
 *
 * Backed by api `apps/api/src/routes/staff.ts`. SH/DSH-only operations
 * enforced server-side; this service surfaces the api errors verbatim
 * (e.g., 403 ROLE_NOT_ALLOWED, 409 DUPLICATE_PHONE).
 *
 * Per Plan §11 Role × Permission Matrix:
 *   - SH/DSH: full add/remove
 *   - GM/AUDITOR: full READ
 *   - others: limited or no access
 *
 * Server allow-list of creatable roles (kept in sync with apps/api/src/
 * routes/staff.ts SH_DSH_CREATABLE_ROLES). When changing one, change
 * both — until L2 governance lands (Phase B), there's no shared registry.
 */

import { apiFetch } from '../config/api';
import { getStoredSession } from './auth';

/** Roles SH/DSH can create on this venue. Mirrors server allow-list. */
export const CREATABLE_ROLES = [
  'DSH',
  'SHIFT_COMMANDER',
  'FLOOR_SUPERVISOR',
  'GROUND_STAFF',
  'FM',
] as const;

export type CreatableRole = (typeof CREATABLE_ROLES)[number];

/** Display labels for roles in the picker UI. */
export const ROLE_LABELS: Record<string, string> = {
  SH:               'Security Head',
  DSH:              'Deputy Security Head',
  SHIFT_COMMANDER:  'Shift Commander',
  GM:               'General Manager',
  AUDITOR:          'Auditor',
  FM:               'Facility Manager',
  FLOOR_SUPERVISOR: 'Floor Supervisor',
  GROUND_STAFF:     'Ground Staff',
};

export interface StaffMember {
  id: string;
  name: string;
  phone: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

export interface CreateStaffPayload {
  phone: string;          // E.164 format: +91XXXXXXXXXX
  name: string;
  role: CreatableRole;
}

/** Fetch all staff for the authenticated user's venue. SH/DSH/GM/AUD only. */
export async function fetchStaff(): Promise<{ staff: StaffMember[]; error: string | null }> {
  const session = await getStoredSession();
  if (!session) return { staff: [], error: 'Not authenticated' };

  const { data, error } = await apiFetch<StaffMember[]>('/staff', {
    method: 'GET',
    token: session.access_token,
  });
  return { staff: data ?? [], error };
}

/** Create a staff member in the SH/DSH's own venue. */
export async function createStaff(
  payload: CreateStaffPayload,
): Promise<{ staff: StaffMember | null; error: string | null }> {
  const session = await getStoredSession();
  if (!session) return { staff: null, error: 'Not authenticated' };

  const { data, error } = await apiFetch<StaffMember>('/staff', {
    method: 'POST',
    token: session.access_token,
    body: JSON.stringify(payload),
  });
  return { staff: data, error };
}

/** Validate E.164 Indian mobile format — matches server CreateStaffSchema regex. */
export function isValidIndianPhone(phone: string): boolean {
  return /^\+91[6-9]\d{9}$/.test(phone.trim());
}
