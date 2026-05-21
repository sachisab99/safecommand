/**
 * Roster Pattern API client — Dashboard (Pass 4b, Phase 5.24).
 *
 * Talks to the api as the SH/DSH JWT holder. Mirrors the apiFetch idiom
 * used by incidents.ts / handovers.ts / sire.ts. Surfaces:
 *
 *   • List + detail reads
 *   • Validate (dry-run)
 *   • Publish (validation-gated server-side)
 *   • Sign-off / Suspend / Archive
 *   • Materialise (manual horizon extension)
 *
 * Editing (create / patch / staff / cycle positions) lives in Ops Console
 * (Pass 4a) — this surface is read + governance only.
 */

import { apiFetch } from './api';

// ─── Types matching the api responses ───────────────────────────────────

export type RosterPatternStatus = 'DRAFT' | 'PUBLISHED' | 'SUSPENDED' | 'ARCHIVED';
export type CycleType = 'WEEKLY' | 'BIWEEKLY' | 'N_WEEK_ROTATION' | 'CUSTOM_DAYS';
export type ViolationPriority = 'MANDATORY' | 'WARNING';

export interface RosterPattern {
  id: string;
  venue_id: string;
  name: string;
  cycle_type: CycleType;
  cycle_length_days: number;
  rotation_pattern_code: string | null;
  effective_from: string;
  effective_to: string | null;
  status: RosterPatternStatus;
  published_at: string | null;
  published_by_staff_id: string | null;
  signed_off_at: string | null;
  signed_off_by_staff_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RosterPatternDetail extends RosterPattern {
  cycle_positions?: Array<{ staff_id: string; cycle_position: number; shift_id: string | null }>;
  staff_assignments?: Array<{
    staff_id: string;
    weekly_off_pattern: 'FIXED' | 'ROTATING_WEEKLY' | 'ROTATING_WITH_CYCLE';
    weekly_off_day: number | null;
    weekly_max_hours: number;
    daily_max_hours: number;
    default_zone_assignments: unknown;
  }>;
}

export interface Violation {
  code:
    | 'FACTORIES_ACT_WEEKLY_OVER_CAP'
    | 'FACTORIES_ACT_DAILY_OVER_CAP'
    | 'COVERAGE_SHORTFALL'
    | 'PATTERN_OVERLAP_WITH_PUBLISHED';
  priority: ViolationPriority;
  message: string;
  staff_id?: string;
  staff_name?: string;
  day_index?: number;
  weekly_hours?: number;
  daily_hours?: number;
  weekly_cap?: number;
  daily_cap?: number;
  zone_id?: string | null;
  role_code?: string | null;
  shift_id?: string | null;
  observed_staff_count?: number;
  required_staff_count?: number;
  conflicting_pattern_id?: string;
  conflicting_pattern_name?: string;
  shared_staff_ids?: string[];
}

export interface ValidationResult {
  ok: boolean;
  mandatory_violations: Violation[];
  warnings: Violation[];
  summary: {
    mandatory_count: number;
    warning_count: number;
    cycle_length_days: number;
    staff_count: number;
    coverage_rules_checked: number;
  };
}

export interface MaterialisationResponse {
  job_id: string;
  pattern_id: string;
  from_date: string;
  to_date: string;
  worker_paused_note: string;
}

// BR-AU compliance PDF — Pass 6
export type RosterComplianceFormat =
  | 'NABH_HRM'
  | 'FIRE_NOC_DUTY_ROSTER'
  | 'INSURANCE_PACK'
  | 'GENERIC';

export const COMPLIANCE_FORMAT_LABEL: Record<RosterComplianceFormat, string> = {
  NABH_HRM:             'NABH 6th HRM.4.a',
  FIRE_NOC_DUTY_ROSTER: 'Fire NOC duty roster',
  INSURANCE_PACK:       'Insurance pack (§51 / §54)',
  GENERIC:              'Generic printable',
};

export interface CompliancePdfResponse {
  url: string;
  format: RosterComplianceFormat;
  report_ref: string;
  generated_at: string;
}

// ─── API calls ──────────────────────────────────────────────────────────

export async function listPatterns(filter?: { status?: RosterPatternStatus }) {
  const q = filter?.status ? `?status=${encodeURIComponent(filter.status)}` : '';
  return apiFetch<RosterPattern[]>(`/roster-patterns${q}`);
}

export async function getPattern(id: string) {
  return apiFetch<RosterPatternDetail>(`/roster-patterns/${id}`);
}

export async function validatePattern(id: string) {
  return apiFetch<ValidationResult>(`/roster-patterns/${id}/validate`, { method: 'POST', body: '{}' });
}

export interface PublishResponse extends RosterPattern {
  validation?: ValidationResult;
  materialisation?: { job_id?: string; from_date?: string; to_date?: string; worker_paused_note?: string; error?: string; note?: string };
}

export async function publishPattern(id: string) {
  return apiFetch<PublishResponse>(`/roster-patterns/${id}/publish`, { method: 'POST', body: '{}' });
}

export async function signOffPattern(id: string) {
  return apiFetch<RosterPattern>(`/roster-patterns/${id}/sign-off`, { method: 'POST', body: '{}' });
}

export async function suspendPattern(id: string, reason?: string) {
  return apiFetch<RosterPattern>(`/roster-patterns/${id}/suspend`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export async function archivePattern(
  id: string,
  body: { successor_pattern_id?: string; no_replacement_sign_off?: boolean },
) {
  return apiFetch<RosterPattern>(`/roster-patterns/${id}/archive`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function materialisePattern(
  id: string,
  body: { from_date?: string; to_date?: string },
) {
  return apiFetch<MaterialisationResponse>(`/roster-patterns/${id}/materialise`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function generateCompliancePdf(id: string, format: RosterComplianceFormat) {
  return apiFetch<CompliancePdfResponse>(`/roster-patterns/${id}/compliance-pdf`, {
    method: 'POST',
    body: JSON.stringify({ format }),
  });
}

// ─── UX helpers ─────────────────────────────────────────────────────────

export const COMMAND_ROLES = ['SH', 'DSH', 'SHIFT_COMMANDER'];

export function canManagePatternsRole(role: string | undefined): boolean {
  return !!role && COMMAND_ROLES.includes(role);
}

export const STATUS_TONE: Record<RosterPatternStatus, { bg: string; text: string; border: string; label: string }> = {
  DRAFT:     { bg: 'bg-gray-100',   text: 'text-gray-800',   border: 'border-gray-300',   label: 'DRAFT' },
  PUBLISHED: { bg: 'bg-green-100',  text: 'text-green-800',  border: 'border-green-300',  label: 'PUBLISHED' },
  SUSPENDED: { bg: 'bg-amber-100',  text: 'text-amber-800',  border: 'border-amber-300',  label: 'SUSPENDED' },
  ARCHIVED:  { bg: 'bg-slate-100',  text: 'text-slate-600',  border: 'border-slate-300',  label: 'ARCHIVED' },
};

export const VIOLATION_TONE: Record<ViolationPriority, { bg: string; text: string; border: string }> = {
  MANDATORY: { bg: 'bg-red-50',    text: 'text-red-900',    border: 'border-red-300' },
  WARNING:   { bg: 'bg-amber-50',  text: 'text-amber-900',  border: 'border-amber-300' },
};

export const VIOLATION_CODE_LABEL: Record<Violation['code'], string> = {
  FACTORIES_ACT_WEEKLY_OVER_CAP: 'Factories Act §51 — weekly cap',
  FACTORIES_ACT_DAILY_OVER_CAP:  'Factories Act §54 — daily cap',
  COVERAGE_SHORTFALL:            'Coverage shortfall',
  PATTERN_OVERLAP_WITH_PUBLISHED: 'Pattern overlap',
};
