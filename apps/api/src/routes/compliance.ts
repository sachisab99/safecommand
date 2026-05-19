/**
 * /v1/compliance — Venue-wide compliance export (BR-20).
 *
 * GET /v1/compliance/export?type=FIRE_NOC|NABH|FULL_AUDIT&from=YYYY-MM-DD&to=YYYY-MM-DD
 *   → generates the PDF, stores it to S3, returns a time-limited
 *     presigned GET URL. Synchronous; no worker; no schema change.
 *
 * Scope notes:
 *   - Same store-then-presign mechanism as BR-29 post-incident report.
 *   - Role: SH / DSH / GM / AUDITOR — governance + audit roles. AUDITOR
 *     is the primary consumer (BR-17: full read + compliance-report
 *     generation, zero writes). Not command-execution roles.
 *   - Reads existing tables only (drills, equipment, certs, incidents,
 *     evacuation triggers, venue). venue_id scoped on every query (Rule 2).
 *   - Default period = trailing 90 days when from/to omitted.
 */

import { Router, Request, Response } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { setTenantContext } from '../middleware/tenant.js';
import { auditLog } from '../middleware/audit.js';
import {
  buildComplianceReportPdf,
  type ComplianceReportType,
} from '../services/complianceReport.js';
import { putComplianceReportObject, presignGetUrl } from '../services/storage.js';
import { logger } from '../services/logger.js';

export const complianceRouter = Router();
complianceRouter.use(requireAuth, setTenantContext);

const VALID_TYPES: ComplianceReportType[] = ['FIRE_NOC', 'NABH', 'FULL_AUDIT'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 730; // 2 years — keeps PDF size + query bounded

complianceRouter.get(
  '/export',
  requireRole('SH', 'DSH', 'GM', 'AUDITOR'),
  auditLog('COMPLIANCE_EXPORT'),
  async (req: Request, res: Response): Promise<void> => {
    const venueId = req.auth.venue_id;

    // ── Validate query (manual, route-local — matches codebase convention) ──
    const typeRaw = String(req.query['type'] ?? 'FULL_AUDIT').toUpperCase();
    if (!VALID_TYPES.includes(typeRaw as ComplianceReportType)) {
      res.status(400).json({
        error: {
          code: 'INVALID_TYPE',
          message: `type must be one of ${VALID_TYPES.join(', ')}`,
        },
      });
      return;
    }
    const type = typeRaw as ComplianceReportType;

    const fromRaw = req.query['from'] ? String(req.query['from']) : null;
    const toRaw = req.query['to'] ? String(req.query['to']) : null;
    if (fromRaw && !DATE_RE.test(fromRaw)) {
      res.status(400).json({
        error: { code: 'INVALID_FROM', message: 'from must be YYYY-MM-DD' },
      });
      return;
    }
    if (toRaw && !DATE_RE.test(toRaw)) {
      res.status(400).json({
        error: { code: 'INVALID_TO', message: 'to must be YYYY-MM-DD' },
      });
      return;
    }

    const now = new Date();
    const toDate = toRaw ? new Date(`${toRaw}T23:59:59.999Z`) : now;
    const fromDate = fromRaw
      ? new Date(`${fromRaw}T00:00:00.000Z`)
      : new Date(toDate.getTime() - 90 * 86_400_000);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      res.status(400).json({
        error: { code: 'INVALID_RANGE', message: 'from/to is not a valid date' },
      });
      return;
    }
    if (fromDate.getTime() > toDate.getTime()) {
      res.status(400).json({
        error: { code: 'INVALID_RANGE', message: 'from must be on or before to' },
      });
      return;
    }
    if ((toDate.getTime() - fromDate.getTime()) / 86_400_000 > MAX_RANGE_DAYS) {
      res.status(400).json({
        error: {
          code: 'RANGE_TOO_WIDE',
          message: `period must be ≤ ${MAX_RANGE_DAYS} days`,
        },
      });
      return;
    }

    const fromISO = fromDate.toISOString();
    const toISO = toDate.toISOString();

    try {
      const built = await buildComplianceReportPdf(type, venueId, fromISO, toISO);
      if (!built) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Venue not found' } });
        return;
      }
      const fileKey = await putComplianceReportObject(venueId, built.reportRef, built.buffer);
      const url = await presignGetUrl(fileKey);
      res.status(200).json({
        url,
        type,
        period: { from: fromISO, to: toISO },
        report_ref: built.reportRef,
        generated_at: new Date().toISOString(),
      });
    } catch (err) {
      logger.error({ err, venueId, type }, 'BR-20 compliance export failed');
      res.status(500).json({
        error: { code: 'EXPORT_FAILED', message: 'Could not generate the compliance report' },
      });
    }
  },
);
