'use server';

/**
 * Equipment server actions — Ops Console (BR-21 partial).
 *
 * SC Ops registers safety equipment per venue with `next_service_due` dates.
 * The Health Score Breakdown's Equipment row (10% weight per BR-14) consumes
 * this data once the api endpoint ships in Phase B (June). Today the data
 * exists in the DB; the dashboard surface activates June.
 *
 * Auth posture (matches Shifts pattern in `actions/shifts.ts`):
 *   - All writes via getAdminClient() (service-role) — bypasses RLS
 *   - Every action filters by .eq('venue_id', venue_id) safety net
 *   - RLS on equipment_items requires SH/DSH/FM for INSERT/UPDATE; service-
 *     role bypasses, so Ops Console actions are unaffected
 *
 * Refs: BR-21 (Equipment & Maintenance Tracker), BR-14 (Health Score),
 *       Architecture v7 mig 009 (`equipment_items.next_service_due` field)
 */

import { revalidatePath } from 'next/cache';
import { getAdminClient } from '@/lib/supabase';

// ──────────────────────────────────────────────────────────────────────────
// Helpers

function trimRequired(value: FormDataEntryValue | null, label: string): string {
  const v = (value as string | null)?.trim() ?? '';
  if (v.length === 0) throw new Error(`${label} is required`);
  return v;
}

function asDate(value: FormDataEntryValue | null, label: string, optional = false): string | null {
  const raw = (value as string | null)?.trim() ?? '';
  if (raw.length === 0) {
    if (optional) return null;
    throw new Error(`${label} is required`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new Error(`${label} must be YYYY-MM-DD`);
  }
  return raw;
}

// ──────────────────────────────────────────────────────────────────────────
// CRUD

export async function createEquipmentAction(formData: FormData): Promise<void> {
  const venue_id = trimRequired(formData.get('venue_id'), 'Venue');
  const name = trimRequired(formData.get('name'), 'Name');
  const category = trimRequired(formData.get('category'), 'Category');
  const location_description =
    (formData.get('location_description') as string | null)?.trim() || null;
  const last_serviced_at = asDate(formData.get('last_serviced_at'), 'Last serviced', true);
  const next_service_due = asDate(formData.get('next_service_due'), 'Next service due');

  if (!next_service_due) throw new Error('Next service due is required');

  // Optional sanity: last_serviced should not be after next_service_due
  if (last_serviced_at && last_serviced_at > next_service_due) {
    throw new Error('Last serviced date cannot be after next service due');
  }

  const { error } = await getAdminClient().from('equipment_items').insert({
    venue_id,
    name,
    category,
    location_description,
    last_serviced_at,
    next_service_due,
    is_active: true,
  });

  if (error) throw new Error(error.message);
  revalidatePath(`/venues/${venue_id}`);
}

export async function updateEquipmentAction(formData: FormData): Promise<void> {
  const venue_id = trimRequired(formData.get('venue_id'), 'Venue');
  const id = trimRequired(formData.get('id'), 'Equipment id');
  const name = trimRequired(formData.get('name'), 'Name');
  const category = trimRequired(formData.get('category'), 'Category');
  const location_description =
    (formData.get('location_description') as string | null)?.trim() || null;
  const last_serviced_at = asDate(formData.get('last_serviced_at'), 'Last serviced', true);
  const next_service_due = asDate(formData.get('next_service_due'), 'Next service due');

  if (!next_service_due) throw new Error('Next service due is required');
  if (last_serviced_at && last_serviced_at > next_service_due) {
    throw new Error('Last serviced date cannot be after next service due');
  }

  const { error } = await getAdminClient()
    .from('equipment_items')
    .update({
      name,
      category,
      location_description,
      last_serviced_at,
      next_service_due,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('venue_id', venue_id);

  if (error) throw new Error(error.message);
  revalidatePath(`/venues/${venue_id}`);
}

/** Soft deactivate — preserves history; equipment_items still queryable */
export async function deactivateEquipmentAction(formData: FormData): Promise<void> {
  const venue_id = trimRequired(formData.get('venue_id'), 'Venue');
  const id = trimRequired(formData.get('id'), 'Equipment id');

  const { error } = await getAdminClient()
    .from('equipment_items')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('venue_id', venue_id);

  if (error) throw new Error(error.message);
  revalidatePath(`/venues/${venue_id}`);
}

export async function reactivateEquipmentAction(formData: FormData): Promise<void> {
  const venue_id = trimRequired(formData.get('venue_id'), 'Venue');
  const id = trimRequired(formData.get('id'), 'Equipment id');

  const { error } = await getAdminClient()
    .from('equipment_items')
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('venue_id', venue_id);

  if (error) throw new Error(error.message);
  revalidatePath(`/venues/${venue_id}`);
}
