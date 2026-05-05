/**
 * Zones service — Zone Accountability Map data feed.
 *
 * Backed by api `apps/api/src/routes/zones.ts` GET /v1/zones/accountability.
 * That endpoint returns zones with joined floor + active staff_zone_assignments
 * (with staff name + role).
 *
 * Used by ZonesScreen.tsx for the THE hero demo (Plan §22 Rec #1):
 * "Who owns Zone B right now?" — answered in under 1 second.
 *
 * Last check-in time is NOT included in the current api response shape;
 * Phase B enhancement to read latest zone_status_log timestamp per zone
 * is a future improvement (would require LATERAL JOIN or a SQL view).
 * For Demo 1 the assigned-staff name is sufficient.
 */

import { apiFetch } from '../config/api';
import { getStoredSession } from './auth';

/** Zone status enum from supabase migrations/001_enums.sql */
export type ZoneStatus = 'ALL_CLEAR' | 'ATTENTION' | 'INCIDENT_ACTIVE';

/** Display labels for zone status */
export const ZONE_STATUS_LABELS: Record<ZoneStatus, string> = {
  ALL_CLEAR: 'All Clear',
  ATTENTION: 'Attention',
  INCIDENT_ACTIVE: 'Incident Active',
};

export interface AssignedStaff {
  id: string;
  name: string;
  role: string;
}

export interface FloorRef {
  id: string;
  name: string;
  floor_number: number;
}

export interface AccountableZone {
  id: string;
  name: string;
  zone_type: string;
  current_status: ZoneStatus;
  two_person_required: boolean;
  floor_id: string;
  floors: FloorRef | null;
  staff_zone_assignments: { staff: AssignedStaff | null }[];
}

export async function fetchZoneAccountability(): Promise<{
  zones: AccountableZone[];
  error: string | null;
}> {
  const session = await getStoredSession();
  if (!session) return { zones: [], error: 'Not authenticated' };

  const { data, error } = await apiFetch<AccountableZone[]>('/zones/accountability', {
    method: 'GET',
    token: session.access_token,
  });
  return { zones: data ?? [], error };
}

/**
 * Reduce the staff_zone_assignments array to a single primary owner string.
 *
 * Each zone has 0..N assignments (staff × shift × zone). We surface the
 * first non-null staff name for the hero demo. Multiple-assignment zones
 * (covered by 2 guards) get a "+ N more" suffix.
 */
export function primaryOwnerOf(zone: AccountableZone): {
  ownerName: string | null;
  additionalCount: number;
} {
  const owners = zone.staff_zone_assignments
    .map((a) => a.staff)
    .filter((s): s is AssignedStaff => s !== null);

  if (owners.length === 0) return { ownerName: null, additionalCount: 0 };
  return {
    ownerName: owners[0]!.name,
    additionalCount: owners.length - 1,
  };
}

/** Group zones by floor for the screen layout */
export interface FloorGroup {
  floor: FloorRef;
  zones: AccountableZone[];
}

export function groupZonesByFloor(zones: AccountableZone[]): FloorGroup[] {
  const map = new Map<string, FloorGroup>();
  for (const z of zones) {
    if (!z.floors) continue;
    const existing = map.get(z.floors.id);
    if (existing) {
      existing.zones.push(z);
    } else {
      map.set(z.floors.id, { floor: z.floors, zones: [z] });
    }
  }
  // Sort by floor_number ascending; zones within each floor by name
  return [...map.values()]
    .sort((a, b) => a.floor.floor_number - b.floor.floor_number)
    .map((g) => ({
      floor: g.floor,
      zones: g.zones.sort((a, b) => a.name.localeCompare(b.name)),
    }));
}
