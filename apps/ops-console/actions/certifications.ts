'use server';

/**
 * Staff certification server actions — Ops Console (BR-22 + BR-B).
 *
 * Per-staff professional credentials with expiry tracking. Drives the
 * Certifications component (15% weight) of the BR-14 health score.
 *
 * BR-B: cert expiry warning on shift activation — soft warning to
 * SC + SH when activating a shift instance whose commander has an
 * expiring cert. Future api enhancement; data foundation here.
 *
 * Auth posture (matches existing Ops Console pattern):
 *   - All writes via getAdminClient() (service-role) — bypasses RLS
 *   - Every action filters by .eq('venue_id', venue_id) safety net
 *   - RLS on staff_certifications requires SH/DSH for INSERT;
 *     service-role bypasses, so Ops Console actions are unaffected
 *
 * Refs: BR-22 (Staff Certification Tracker), BR-B (Cert Expiry Warning),
 *       BR-14 (Health Score 15% weight), Architecture v7 mig 002
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

function asDate(value: FormDataEntryValue | null, label: string): string {
  const v = trimRequired(value, label);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    throw new Error(`${label} must be YYYY-MM-DD`);
  }
  return v;
}

function asUrl(value: FormDataEntryValue | null): string | null {
  const v = (value as string | null)?.trim() ?? '';
  if (v.length === 0) return null;
  // Loose validation — full URL or path
  return v;
}

// ──────────────────────────────────────────────────────────────────────────
// CRUD

export async function createCertificationAction(formData: FormData): Promise<void> {
  const venue_id = trimRequired(formData.get('venue_id'), 'Venue');
  const staff_id = trimRequired(formData.get('staff_id'), 'Staff member');
  const certification_name = trimRequired(formData.get('certification_name'), 'Certification name');
  const issued_at = asDate(formData.get('issued_at'), 'Issued date');
  const expires_at = asDate(formData.get('expires_at'), 'Expiry date');
  const document_url = asUrl(formData.get('document_url'));

  if (issued_at > expires_at) {
    throw new Error('Issued date cannot be after expiry date');
  }

  const { error } = await getAdminClient().from('staff_certifications').insert({
    venue_id,
    staff_id,
    certification_name,
    issued_at,
    expires_at,
    document_url,
  });

  if (error) throw new Error(error.message);
  revalidatePath(`/venues/${venue_id}`);
}

export async function updateCertificationAction(formData: FormData): Promise<void> {
  const venue_id = trimRequired(formData.get('venue_id'), 'Venue');
  const id = trimRequired(formData.get('id'), 'Certification id');
  const certification_name = trimRequired(formData.get('certification_name'), 'Certification name');
  const issued_at = asDate(formData.get('issued_at'), 'Issued date');
  const expires_at = asDate(formData.get('expires_at'), 'Expiry date');
  const document_url = asUrl(formData.get('document_url'));

  if (issued_at > expires_at) {
    throw new Error('Issued date cannot be after expiry date');
  }

  const { error } = await getAdminClient()
    .from('staff_certifications')
    .update({ certification_name, issued_at, expires_at, document_url })
    .eq('id', id)
    .eq('venue_id', venue_id);

  if (error) throw new Error(error.message);
  revalidatePath(`/venues/${venue_id}`);
}

/** Hard delete — certs are not lifecycle-tracked; deletion is removal */
export async function deleteCertificationAction(formData: FormData): Promise<void> {
  const venue_id = trimRequired(formData.get('venue_id'), 'Venue');
  const id = trimRequired(formData.get('id'), 'Certification id');

  const { error } = await getAdminClient()
    .from('staff_certifications')
    .delete()
    .eq('id', id)
    .eq('venue_id', venue_id);

  if (error) throw new Error(error.message);
  revalidatePath(`/venues/${venue_id}`);
}
