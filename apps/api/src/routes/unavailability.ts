/**
 * /v1/unavailability — BR-AN Staff Leave / Unavailability Calendar
 * (Pattern Engine Pass 2 — Phase 5.24 wave 2).
 *
 * Spec source: SafeCommand Shift Roster Architecture v1.0 §6.5. Backs
 * the leave-request workflow used by the materialisation worker (BR-AO,
 * Pass 3) to skip-over a staff member on dates where APPROVED
 * unavailability covers the working day.
 *
 *   GET    /v1/unavailability                  list (filterable; self by default; SH/DSH/AUD/GM see venue-wide)
 *   GET    /v1/unavailability/queue            REQUESTED queue (SH/DSH/GM/SHIFT_COMMANDER)
 *   POST   /v1/unavailability                  submit request (self OR SH/DSH-on-behalf)
 *   POST   /v1/unavailability/:id/approve      REQUESTED → APPROVED (SH/DSH/GM)
 *   POST   /v1/unavailability/:id/reject       REQUESTED → REJECTED (SH/DSH/GM)
 *   POST   /v1/unavailability/:id/withdraw     REQUESTED → WITHDRAWN (self only)
 *
 * Database protections (mig 022 §5.6):
 *   • RLS venue_isolation (EC-03 / Rule 2)
 *   • EXCLUDE USING gist (staff_id WITH =, daterange WITH &&) WHERE
 *     status = 'APPROVED' — two APPROVED rows overlapping for the same
 *     staff fail at write with Postgres error 23P01 (★ Refinement #6).
 *     Surfaced to the client as 422 OVERLAP so the SH can resolve before
 *     re-approving (e.g. cancel/withdraw the overlapping APPROVED row first).
 *
 * Audit log (mig 002 audit_logs): the auditLog middleware writes one row
 * per successful mutation — naturally aligned with the in-row state
 * machine (one transition = one endpoint hit = one audit row), matching
 * the Refinement #4 precedent (drill_session_participants).
 */

import { Router, Request, Response } from 'express';
import { requireAuth, requireRole, requireMinRole } from '../middleware/auth.js';
import { setTenantContext } from '../middleware/tenant.js';
import { auditLog } from '../middleware/audit.js';
import { getServiceClient } from '@safecommand/db';

export const unavailabilityRouter = Router();
unavailabilityRouter.use(requireAuth, setTenantContext);

const UNAVAILABILITY_TYPES = [
  'LEAVE_ANNUAL',
  'LEAVE_SICK',
  'LEAVE_TRAINING',
  'LEAVE_PERSONAL',
  'OFF_DUTY',
  'SUSPENDED',
] as const;
type UnavailabilityType = typeof UNAVAILABILITY_TYPES[number];

const STATUSES = ['REQUESTED', 'APPROVED', 'REJECTED', 'WITHDRAWN'] as const;
type Status = typeof STATUSES[number];

// Command roles that can read venue-wide + act on any staff's row
const COMMAND_ROLES = new Set(['SH', 'DSH', 'GM', 'AUDITOR', 'SHIFT_COMMANDER']);
function isCommandRole(role: string): boolean {
  return COMMAND_ROLES.has(role);
}

function isValidISODate(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
}

interface CreateBody {
  staff_id?: string;
  unavailable_from?: string;
  unavailable_to?: string;
  unavailability_type?: string;
  reason_text?: string | null;
}

// =================================================================
// GET /v1/unavailability — list, filterable
// Self sees only own rows by default; command roles see venue-wide.
// Query params: staff_id, status, from (>=), to (<=).
// =================================================================
unavailabilityRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  const qStaffId = typeof req.query['staff_id'] === 'string' ? req.query['staff_id'] : undefined;
  const qStatus = typeof req.query['status'] === 'string' ? req.query['status'] : undefined;
  const qFrom = typeof req.query['from'] === 'string' ? req.query['from'] : undefined;
  const qTo = typeof req.query['to'] === 'string' ? req.query['to'] : undefined;

  // Non-command users can only read their own rows; ignore any staff_id query.
  const effectiveStaffId = isCommandRole(req.auth.role) ? qStaffId : req.auth.staff_id;

  let q = getServiceClient()
    .from('staff_unavailability')
    .select('*')
    .eq('venue_id', req.auth.venue_id)
    .order('unavailable_from', { ascending: false });

  if (effectiveStaffId) q = q.eq('staff_id', effectiveStaffId);
  if (qStatus && (STATUSES as readonly string[]).includes(qStatus)) q = q.eq('status', qStatus);
  if (qFrom && isValidISODate(qFrom)) q = q.gte('unavailable_to', qFrom);
  if (qTo && isValidISODate(qTo)) q = q.lte('unavailable_from', qTo);

  const { data, error } = await q;
  if (error) {
    res.status(500).json({ error: { code: 'QUERY_FAILED', message: 'Could not fetch unavailability records' } });
    return;
  }
  res.json(data ?? []);
});

// =================================================================
// GET /v1/unavailability/queue — REQUESTED queue for SH/DSH/GM/SHIFT_COMMANDER
// =================================================================
unavailabilityRouter.get(
  '/queue',
  requireRole('SH', 'DSH', 'GM', 'SHIFT_COMMANDER'),
  async (req: Request, res: Response): Promise<void> => {
    const { data, error } = await getServiceClient()
      .from('staff_unavailability')
      .select('*')
      .eq('venue_id', req.auth.venue_id)
      .eq('status', 'REQUESTED')
      .order('created_at', { ascending: true });
    if (error) {
      res.status(500).json({ error: { code: 'QUERY_FAILED', message: 'Could not fetch queue' } });
      return;
    }
    res.json(data ?? []);
  },
);

// =================================================================
// POST /v1/unavailability — submit a leave / unavailability request
// Self-service: req.auth.staff_id submits for self → status REQUESTED.
// On-behalf-of: SH/DSH/GM submits for another staff_id → status REQUESTED
// (still needs an approve step; never auto-APPROVED on create).
// =================================================================
unavailabilityRouter.post(
  '/',
  auditLog('UNAVAILABILITY_CREATE'),
  async (req: Request, res: Response): Promise<void> => {
    const b = req.body as CreateBody;

    if (!isValidISODate(b.unavailable_from) || !isValidISODate(b.unavailable_to)) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'unavailable_from and unavailable_to must be YYYY-MM-DD' } });
      return;
    }
    if (new Date(b.unavailable_to) < new Date(b.unavailable_from)) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'unavailable_to must be on or after unavailable_from' } });
      return;
    }
    if (!b.unavailability_type || !(UNAVAILABILITY_TYPES as readonly string[]).includes(b.unavailability_type)) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: `unavailability_type must be one of ${UNAVAILABILITY_TYPES.join(', ')}` } });
      return;
    }

    const targetStaffId = b.staff_id ?? req.auth.staff_id;
    if (targetStaffId !== req.auth.staff_id && !['SH', 'DSH', 'GM'].includes(req.auth.role)) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only SH/DSH/GM can submit on behalf of another staff' } });
      return;
    }

    const { data, error } = await getServiceClient()
      .from('staff_unavailability')
      .insert({
        venue_id: req.auth.venue_id,
        staff_id: targetStaffId,
        unavailable_from: b.unavailable_from,
        unavailable_to: b.unavailable_to,
        unavailability_type: b.unavailability_type as UnavailabilityType,
        reason_text: b.reason_text ?? null,
        requested_by_staff_id: req.auth.staff_id,
        status: 'REQUESTED' as Status,
      })
      .select()
      .single();

    if (error || !data) {
      res.status(500).json({ error: { code: 'INSERT_FAILED', message: error?.message ?? 'Could not create unavailability' } });
      return;
    }
    res.status(201).json(data);
  },
);

// Helper: enforce target row exists + is in REQUESTED state + same venue
async function loadRequestedRow(req: Request, res: Response) {
  const { data, error } = await getServiceClient()
    .from('staff_unavailability')
    .select('*')
    .eq('id', req.params['id'])
    .eq('venue_id', req.auth.venue_id)
    .single();

  if (error || !data) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unavailability not found' } });
    return null;
  }
  return data;
}

// =================================================================
// POST /v1/unavailability/:id/approve — REQUESTED → APPROVED
// 422 OVERLAP if the EXCLUDE-gist constraint fires (overlapping APPROVED
// row for the same staff). The SH must withdraw/reject the conflicting
// approved row before re-approving this one.
// =================================================================
unavailabilityRouter.post(
  '/:id/approve',
  requireRole('SH', 'DSH', 'GM'),
  auditLog('UNAVAILABILITY_APPROVE'),
  async (req: Request, res: Response): Promise<void> => {
    const row = await loadRequestedRow(req, res);
    if (!row) return;
    if (row.status !== 'REQUESTED') {
      res.status(409).json({
        error: { code: 'BAD_STATE', message: `Only REQUESTED rows can be approved (current: ${row.status})` },
      });
      return;
    }

    const { data, error } = await getServiceClient()
      .from('staff_unavailability')
      .update({
        status: 'APPROVED' as Status,
        approved_by_staff_id: req.auth.staff_id,
        approved_at: new Date().toISOString(),
      })
      .eq('id', row.id)
      .eq('venue_id', req.auth.venue_id)
      .eq('status', 'REQUESTED')  // optimistic concurrency
      .select()
      .single();

    if (error || !data) {
      // 23P01 = exclusion_violation (EXCLUDE-gist firing on overlapping APPROVED row)
      const code = (error as { code?: string } | null)?.code;
      if (code === '23P01') {
        res.status(422).json({
          error: {
            code: 'OVERLAP',
            message: 'Another APPROVED unavailability for this staff overlaps these dates. Withdraw the conflicting row first.',
          },
        });
        return;
      }
      res.status(500).json({ error: { code: 'UPDATE_FAILED', message: error?.message ?? 'Could not approve' } });
      return;
    }
    res.json(data);
  },
);

// =================================================================
// POST /v1/unavailability/:id/reject — REQUESTED → REJECTED
// Body: { reason_text? } — overrides the original reason_text with the rejection note.
// =================================================================
unavailabilityRouter.post(
  '/:id/reject',
  requireRole('SH', 'DSH', 'GM'),
  auditLog('UNAVAILABILITY_REJECT'),
  async (req: Request, res: Response): Promise<void> => {
    const row = await loadRequestedRow(req, res);
    if (!row) return;
    if (row.status !== 'REQUESTED') {
      res.status(409).json({
        error: { code: 'BAD_STATE', message: `Only REQUESTED rows can be rejected (current: ${row.status})` },
      });
      return;
    }

    const reasonOverride = typeof (req.body as { reason_text?: string }).reason_text === 'string'
      ? (req.body as { reason_text?: string }).reason_text
      : null;

    const update: Record<string, unknown> = {
      status: 'REJECTED' as Status,
      approved_by_staff_id: req.auth.staff_id,  // (semantically "decided by"; column is approver/decision-maker)
      approved_at: new Date().toISOString(),
    };
    if (reasonOverride) update['reason_text'] = reasonOverride;

    const { data, error } = await getServiceClient()
      .from('staff_unavailability')
      .update(update)
      .eq('id', row.id)
      .eq('venue_id', req.auth.venue_id)
      .eq('status', 'REQUESTED')
      .select()
      .single();

    if (error || !data) {
      res.status(500).json({ error: { code: 'UPDATE_FAILED', message: error?.message ?? 'Could not reject' } });
      return;
    }
    res.json(data);
  },
);

// =================================================================
// POST /v1/unavailability/:id/withdraw — REQUESTED → WITHDRAWN (self only)
// =================================================================
unavailabilityRouter.post(
  '/:id/withdraw',
  auditLog('UNAVAILABILITY_WITHDRAW'),
  async (req: Request, res: Response): Promise<void> => {
    const row = await loadRequestedRow(req, res);
    if (!row) return;
    if (row.staff_id !== req.auth.staff_id) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only the requester can withdraw' } });
      return;
    }
    if (row.status !== 'REQUESTED') {
      res.status(409).json({
        error: { code: 'BAD_STATE', message: `Only REQUESTED rows can be withdrawn (current: ${row.status})` },
      });
      return;
    }

    const { data, error } = await getServiceClient()
      .from('staff_unavailability')
      .update({ status: 'WITHDRAWN' as Status })
      .eq('id', row.id)
      .eq('venue_id', req.auth.venue_id)
      .eq('status', 'REQUESTED')
      .select()
      .single();

    if (error || !data) {
      res.status(500).json({ error: { code: 'UPDATE_FAILED', message: error?.message ?? 'Could not withdraw' } });
      return;
    }
    res.json(data);
  },
);

// Reserved for future spec-shape parity (silence-the-lint hook).
void requireMinRole;
