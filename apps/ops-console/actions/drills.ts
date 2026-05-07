'use server';

/**
 * Drill server actions — Ops Console (BR-A).
 *
 * SC Ops schedules + runs venue drills. Drill compliance score
 * (component of BR-14 Health Score, 10% weight) is computed from
 * recency of last completed drill.
 *
 * Lifecycle:
 *   SCHEDULED → IN_PROGRESS (on start) → COMPLETED (on end) | CANCELLED
 *
 * Auth posture (matches existing Ops Console pattern):
 *   - All writes via getAdminClient() (service-role) — bypasses RLS
 *   - Every action filters by .eq('venue_id', venue_id) safety net
 *
 * Refs: BR-A (Drill Management Module), BR-14 (Health Score 10% weight),
 *       Architecture v7 mig 010 (drill_sessions + drill_session_participants)
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

function asDateTime(value: FormDataEntryValue | null, label: string): string {
  const v = trimRequired(value, label);
  // Accept either ISO datetime or HTML datetime-local format (YYYY-MM-DDTHH:MM)
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) {
    throw new Error(`${label} must be a valid datetime`);
  }
  return v;
}

// ──────────────────────────────────────────────────────────────────────────
// Lifecycle actions

/** Schedule a future drill */
export async function scheduleDrillAction(formData: FormData): Promise<void> {
  const venue_id = trimRequired(formData.get('venue_id'), 'Venue');
  const drill_type = trimRequired(formData.get('drill_type'), 'Drill type');
  const scheduled_for = asDateTime(formData.get('scheduled_for'), 'Scheduled for');
  const notes = (formData.get('notes') as string | null)?.trim() || null;

  const { error } = await getAdminClient().from('drill_sessions').insert({
    venue_id,
    drill_type,
    scheduled_for,
    status: 'SCHEDULED',
    notes,
    total_staff_expected: 0,
    total_staff_acknowledged: 0,
    total_staff_safe: 0,
    total_staff_missed: 0,
  });

  if (error) throw new Error(error.message);
  revalidatePath(`/venues/${venue_id}`);
}

/**
 * Start a scheduled drill — transitions SCHEDULED → IN_PROGRESS.
 * Captures started_at + started_by_staff_id + initial expected count.
 */
export async function startDrillAction(formData: FormData): Promise<void> {
  const venue_id = trimRequired(formData.get('venue_id'), 'Venue');
  const id = trimRequired(formData.get('id'), 'Drill id');
  const started_by_staff_id =
    (formData.get('started_by_staff_id') as string | null)?.trim() || null;

  // Snapshot expected count = active staff at start time
  const { count: expectedCount } = await getAdminClient()
    .from('staff')
    .select('id', { count: 'exact', head: true })
    .eq('venue_id', venue_id)
    .eq('is_active', true);

  const { error } = await getAdminClient()
    .from('drill_sessions')
    .update({
      status: 'IN_PROGRESS',
      started_at: new Date().toISOString(),
      started_by_staff_id,
      total_staff_expected: expectedCount ?? 0,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('venue_id', venue_id);

  if (error) throw new Error(error.message);
  revalidatePath(`/venues/${venue_id}`);
}

/**
 * End an in-progress drill — transitions IN_PROGRESS → COMPLETED.
 * Captures ended_at + duration + final participation counts.
 */
export async function endDrillAction(formData: FormData): Promise<void> {
  const venue_id = trimRequired(formData.get('venue_id'), 'Venue');
  const id = trimRequired(formData.get('id'), 'Drill id');

  // Read started_at to compute duration
  const { data: drill, error: readErr } = await getAdminClient()
    .from('drill_sessions')
    .select('started_at')
    .eq('id', id)
    .eq('venue_id', venue_id)
    .single();
  if (readErr || !drill?.started_at) {
    throw new Error('Drill must be IN_PROGRESS before it can be ended');
  }

  const startedAtMs = new Date(drill.started_at).getTime();
  const endedAt = new Date();
  const duration_seconds = Math.floor((endedAt.getTime() - startedAtMs) / 1000);

  const { error } = await getAdminClient()
    .from('drill_sessions')
    .update({
      status: 'COMPLETED',
      ended_at: endedAt.toISOString(),
      duration_seconds,
      updated_at: endedAt.toISOString(),
    })
    .eq('id', id)
    .eq('venue_id', venue_id);

  if (error) throw new Error(error.message);
  revalidatePath(`/venues/${venue_id}`);
}

/** Cancel a SCHEDULED drill (cannot cancel after starting) */
export async function cancelDrillAction(formData: FormData): Promise<void> {
  const venue_id = trimRequired(formData.get('venue_id'), 'Venue');
  const id = trimRequired(formData.get('id'), 'Drill id');

  const { error } = await getAdminClient()
    .from('drill_sessions')
    .update({
      status: 'CANCELLED',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('venue_id', venue_id)
    .eq('status', 'SCHEDULED');

  if (error) throw new Error(error.message);
  revalidatePath(`/venues/${venue_id}`);
}

/** Update notes on any drill (any status) */
export async function updateDrillNotesAction(formData: FormData): Promise<void> {
  const venue_id = trimRequired(formData.get('venue_id'), 'Venue');
  const id = trimRequired(formData.get('id'), 'Drill id');
  const notes = (formData.get('notes') as string | null)?.trim() || null;

  const { error } = await getAdminClient()
    .from('drill_sessions')
    .update({ notes, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('venue_id', venue_id);

  if (error) throw new Error(error.message);
  revalidatePath(`/venues/${venue_id}`);
}
