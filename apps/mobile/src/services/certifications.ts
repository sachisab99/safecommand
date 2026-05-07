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
