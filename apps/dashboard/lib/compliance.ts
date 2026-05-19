/**
 * Dashboard compliance-export client — BR-20.
 * Single GET against the api; the api generates the PDF, stores it, and
 * returns a short-lived presigned GET URL the browser opens directly.
 */
import { apiFetch } from './api';

export type ComplianceReportType = 'FIRE_NOC' | 'NABH' | 'FULL_AUDIT';

export interface ComplianceExportResult {
  url: string;
  type: ComplianceReportType;
  period: { from: string; to: string };
  report_ref: string;
  generated_at: string;
}

export const COMPLIANCE_WRITE_ROLES = ['SH', 'DSH', 'GM', 'AUDITOR'];

export function canExportCompliance(role: string | undefined): boolean {
  return !!role && COMPLIANCE_WRITE_ROLES.includes(role);
}

/**
 * @param from ISO date YYYY-MM-DD (optional — api defaults to trailing 90d)
 * @param to   ISO date YYYY-MM-DD (optional — api defaults to today)
 */
export async function requestComplianceExport(
  type: ComplianceReportType,
  from?: string,
  to?: string,
) {
  const p = new URLSearchParams({ type });
  if (from) p.set('from', from);
  if (to) p.set('to', to);
  return apiFetch<ComplianceExportResult>(`/compliance/export?${p.toString()}`);
}
