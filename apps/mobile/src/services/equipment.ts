/**
 * Equipment service — Phase 5.10 mobile companion to BR-21.
 *
 * Backed by GET /v1/equipment — venue-wide list of active equipment items
 * with next_service_due dates. Returns full list; client filters by bucket
 * for the compliance dashboard view.
 *
 * api endpoint deploys with Phase 5.10 (May, post-merge to main); until
 * then mobile screen renders an empty/error state.
 */

import { apiFetch } from '../config/api';
import { getStoredSession } from './auth';

export type EquipmentCategory =
  | 'FIRE_EXTINGUISHER'
  | 'AED'
  | 'SMOKE_DETECTOR'
  | 'EMERGENCY_LIGHT'
  | 'FIRST_AID_KIT'
  | 'ALARM_PANEL'
  | 'EVACUATION_SIGN'
  | 'OTHER';

export interface EquipmentItem {
  id: string;
  venue_id: string;
  building_id: string | null;
  name: string;
  category: string;
  location_description: string | null;
  last_serviced_at: string | null;
  next_service_due: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type ExpiryBucket = 'OK' | 'DUE_90' | 'DUE_30' | 'DUE_7' | 'OVERDUE';

/** Days from today to next_service_due. Negative = overdue. */
export function daysUntilDue(dueDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + 'T00:00:00+05:30');
  return Math.floor((due.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

export function expiryBucket(daysUntil: number): ExpiryBucket {
  if (daysUntil < 0) return 'OVERDUE';
  if (daysUntil <= 7) return 'DUE_7';
  if (daysUntil <= 30) return 'DUE_30';
  if (daysUntil <= 90) return 'DUE_90';
  return 'OK';
}

/** Fetch active equipment for the staff's venue */
export async function fetchEquipment(): Promise<{
  items: EquipmentItem[];
  error: string | null;
}> {
  const session = await getStoredSession();
  if (!session) return { items: [], error: 'Not authenticated' };
  const { data, error } = await apiFetch<EquipmentItem[]>('/equipment', {
    token: session.access_token,
  });
  return { items: data ?? [], error };
}

export interface ComplianceStats {
  total: number;
  ok: number;
  due_90: number;
  due_30: number;
  due_7: number;
  overdue: number;
  compliance_score: number;
}

/** Compute compliance stats from a list — matches api/Ops Console formula */
export function computeStats(items: EquipmentItem[]): ComplianceStats {
  const buckets = { ok: 0, due_90: 0, due_30: 0, due_7: 0, overdue: 0 };
  for (const item of items) {
    const bucket = expiryBucket(daysUntilDue(item.next_service_due));
    if (bucket === 'OK') buckets.ok++;
    else if (bucket === 'DUE_90') buckets.due_90++;
    else if (bucket === 'DUE_30') buckets.due_30++;
    else if (bucket === 'DUE_7') buckets.due_7++;
    else buckets.overdue++;
  }
  const total = items.length;
  const compliance_score = total === 0 ? 100 : Math.round((buckets.ok / total) * 100);
  return { total, ...buckets, compliance_score };
}

export const CATEGORY_LABEL: Record<string, string> = {
  FIRE_EXTINGUISHER: 'Fire Extinguisher',
  AED: 'AED (Defibrillator)',
  SMOKE_DETECTOR: 'Smoke Detector',
  EMERGENCY_LIGHT: 'Emergency Light',
  FIRST_AID_KIT: 'First Aid Kit',
  ALARM_PANEL: 'Alarm Panel',
  EVACUATION_SIGN: 'Evacuation Sign',
  OTHER: 'Other',
};

export const CATEGORY_ICON: Record<string, string> = {
  FIRE_EXTINGUISHER: '🧯',
  AED: '❤️‍🩹',
  SMOKE_DETECTOR: '🚨',
  EMERGENCY_LIGHT: '💡',
  FIRST_AID_KIT: '🩹',
  ALARM_PANEL: '🔔',
  EVACUATION_SIGN: '🚪',
  OTHER: '🛠️',
};
