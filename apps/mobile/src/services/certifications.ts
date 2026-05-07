/**
 * Cert service — Phase 5.12 mobile companion to BR-22.
 *
 * Two endpoints:
 *  - /v1/certifications     venue-wide (read-only command-role view, future)
 *  - /v1/certifications/me  caller's own certs (per-staff focus on mobile)
 *
 * Mobile screen "My Certifications" uses /me — staff personally tracks
 * their own credential expiry.
 */

import { apiFetch } from '../config/api';
import { getStoredSession } from './auth';

export interface StaffCertification {
  id: string;
  venue_id: string;
  staff_id: string;
  certification_name: string;
  issued_at: string;
  expires_at: string;
  document_url: string | null;
  created_at: string;
}

export type CertExpiryBucket = 'OK' | 'DUE_90' | 'DUE_30' | 'DUE_7' | 'EXPIRED';

export function daysUntilExpiry(date: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(date + 'T00:00:00+05:30');
  return Math.floor((exp.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

export function certBucket(daysUntil: number): CertExpiryBucket {
  if (daysUntil < 0) return 'EXPIRED';
  if (daysUntil <= 7) return 'DUE_7';
  if (daysUntil <= 30) return 'DUE_30';
  if (daysUntil <= 90) return 'DUE_90';
  return 'OK';
}

export async function fetchMyCertifications(): Promise<{
  certs: StaffCertification[];
  error: string | null;
}> {
  const session = await getStoredSession();
  if (!session) return { certs: [], error: 'Not authenticated' };
  const { data, error } = await apiFetch<StaffCertification[]>('/certifications/me', {
    token: session.access_token,
  });
  return { certs: data ?? [], error };
}

// ─── Write helpers (BR-22 — SH/DSH/FM; api enforces requireRole) ────────────
// Used by future venue-wide cert management surface; dashboard /certifications
// is the primary write surface in Phase 5.15.

/** Cert with embedded staff name+role (returned by GET /certifications) */
export interface CertWithStaff extends StaffCertification {
  staff: { name: string; role: string } | null;
}

export interface CreateCertificationPayload {
  staff_id: string;
  certification_name: string;
  issued_at: string; // YYYY-MM-DD
  expires_at: string; // YYYY-MM-DD
  document_url?: string | null;
}

export async function fetchVenueCertifications(): Promise<{
  certs: CertWithStaff[];
  error: string | null;
}> {
  const session = await getStoredSession();
  if (!session) return { certs: [], error: 'Not authenticated' };
  const { data, error } = await apiFetch<CertWithStaff[]>('/certifications', {
    token: session.access_token,
  });
  return { certs: data ?? [], error };
}

export async function createCertification(
  payload: CreateCertificationPayload,
): Promise<{ cert: StaffCertification | null; error: string | null }> {
  const session = await getStoredSession();
  if (!session) return { cert: null, error: 'Not authenticated' };
  const { data, error } = await apiFetch<StaffCertification>('/certifications', {
    method: 'POST',
    token: session.access_token,
    body: JSON.stringify(payload),
  });
  return { cert: data, error };
}

export async function updateCertification(
  id: string,
  payload: Partial<CreateCertificationPayload>,
): Promise<{ cert: StaffCertification | null; error: string | null }> {
  const session = await getStoredSession();
  if (!session) return { cert: null, error: 'Not authenticated' };
  const { data, error } = await apiFetch<StaffCertification>(`/certifications/${id}`, {
    method: 'PATCH',
    token: session.access_token,
    body: JSON.stringify(payload),
  });
  return { cert: data, error };
}

export async function deleteCertification(
  id: string,
): Promise<{ ok: boolean; error: string | null }> {
  const session = await getStoredSession();
  if (!session) return { ok: false, error: 'Not authenticated' };
  const { error } = await apiFetch(`/certifications/${id}`, {
    method: 'DELETE',
    token: session.access_token,
  });
  return { ok: !error, error };
}

/** Roles allowed to add/edit certs (must match api requireRole exactly) */
export function canWriteCertifications(role: string): boolean {
  return ['SH', 'DSH', 'FM'].includes(role);
}

/** Roles allowed to delete certs (api requireRole: SH/DSH only) */
export function canDeleteCertifications(role: string): boolean {
  return ['SH', 'DSH'].includes(role);
}
