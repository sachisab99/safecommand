/**
 * /v1/shift-swaps — BR-AP Staff Shift-Swap Workflow
 * (Pattern Engine Pass 2 — Phase 5.24 wave 2).
 *
 * Spec source: SafeCommand Shift Roster Architecture v1.0 §6.7. Three
 * swap types (SWAP / COVER / DROP) gated by an in-row state machine:
 *
 *   SWAP : staff A ↔ staff B for two existing assignments
 *   COVER: staff B picks up staff A's assignment (one row reassigned)
 *   DROP : staff A drops their assignment with no replacement
 *          (skips COUNTERPART_ACCEPTED; goes directly to SH for approve)
 *
 * STATE MACHINE (★ Refinement #4 — in-row state + audit_logs precedent
 * from drill_session_participants):
 *
 *   REQUESTED ─┬─(counterpart accept)─→ COUNTERPART_ACCEPTED ─┬─(SH approve)─→ APPROVED + assignments mutated
 *              │                                              └─(SH reject )─→ REJECTED
 *              ├─(counterpart decline)──────────────────────────────────────→ DECLINED
 *              ├─(requester withdraw)───────────────────────────────────────→ WITHDRAWN
 *              └─(DROP: SH approve directly)────────────────────────────────→ APPROVED + assignment deleted
 *
 *   GET    /v1/shift-swaps                  list — self sees own; SH/DSH/GM/AUD see venue-wide
 *   GET    /v1/shift-swaps/queue            REQUESTED + COUNTERPART_ACCEPTED queue (SH/DSH/SHIFT_COMMANDER)
 *   POST   /v1/shift-swaps                  create (any auth role; requester = req.auth.staff_id)
 *   POST   /v1/shift-swaps/:id/accept       counterpart only (REQUESTED → COUNTERPART_ACCEPTED)
 *   POST   /v1/shift-swaps/:id/decline      counterpart only (REQUESTED → DECLINED)
 *   POST   /v1/shift-swaps/:id/approve      SH/DSH (→ APPROVED + atomic staff_zone_assignments mutation)
 *   POST   /v1/shift-swaps/:id/reject       SH/DSH (→ REJECTED)
 *   POST   /v1/shift-swaps/:id/withdraw     requester only (REQUESTED → WITHDRAWN)
 *
 * Database protections (mig 022 §5.7):
 *   • RLS venue_isolation (EC-03 / Rule 2)
 *   • CHECK chk_swap_counterpart enforces swap_type / counterpart_staff_id /
 *     counterpart_assignment_id integrity at the DB level.
 *   • UNIQUE partial idx idx_swap_active_per_assignment prevents the
 *     same original_assignment_id appearing in two simultaneously-active
 *     swaps (★ Refinement #5). Surfaced as 409 DUPLICATE on create.
 *
 * Atomic mutation on approve (★ Pass 3c-iii closure, mig 025):
 *   The approve action calls the Postgres function `approve_shift_swap`
 *   which runs (state validation + assignment mutation + swap-row
 *   APPROVED stamp) inside a SINGLE TRANSACTION. PostgREST RPC wraps
 *   the call in a transaction; any RAISE inside aborts the whole unit.
 *   Closes the narrow PARTIAL_FAILURE window of the previous two-step
 *   pattern. SECURITY INVOKER means venue_isolation RLS applies the
 *   same as direct table access.
 *
 * Audit log: auditLog middleware writes one audit row per successful
 * mutation — one row per state transition (matching the Refinement #4
 * design intent).
 */

import { Router, Request, Response } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { setTenantContext } from '../middleware/tenant.js';
import { auditLog } from '../middleware/audit.js';
import { getServiceClient } from '@safecommand/db';

export const shiftSwapsRouter = Router();
shiftSwapsRouter.use(requireAuth, setTenantContext);

const SWAP_TYPES = ['SWAP', 'COVER', 'DROP'] as const;
type SwapType = typeof SWAP_TYPES[number];

const STATES = [
  'REQUESTED',
  'COUNTERPART_ACCEPTED',
  'APPROVED',
  'REJECTED',
  'DECLINED',
  'WITHDRAWN',
] as const;

const COMMAND_ROLES = new Set(['SH', 'DSH', 'GM', 'AUDITOR', 'SHIFT_COMMANDER']);
function isCommandRole(role: string): boolean {
  return COMMAND_ROLES.has(role);
}

interface SwapRow {
  id: string;
  venue_id: string;
  requester_staff_id: string;
  counterpart_staff_id: string | null;
  original_assignment_id: string;
  counterpart_assignment_id: string | null;
  swap_type: SwapType;
  reason_text: string | null;
  state: typeof STATES[number];
  requested_at: string;
  counterpart_responded_at: string | null;
  supervisor_decided_at: string | null;
  supervisor_staff_id: string | null;
}

// =================================================================
// GET /v1/shift-swaps — list (filterable)
// Query: ?state=&staff_id=  Self sees own (requester or counterpart);
// command roles see venue-wide.
// =================================================================
shiftSwapsRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  const qState = typeof req.query['state'] === 'string' ? req.query['state'] : undefined;
  const qStaffId = typeof req.query['staff_id'] === 'string' ? req.query['staff_id'] : undefined;

  let q = getServiceClient()
    .from('shift_swap_requests')
    .select('*')
    .eq('venue_id', req.auth.venue_id)
    .order('requested_at', { ascending: false });

  if (qState && (STATES as readonly string[]).includes(qState)) q = q.eq('state', qState);

  if (isCommandRole(req.auth.role)) {
    if (qStaffId) {
      // Filter: requester OR counterpart matches the given staff
      q = q.or(`requester_staff_id.eq.${qStaffId},counterpart_staff_id.eq.${qStaffId}`);
    }
  } else {
    // Non-command users: only their own (as requester or counterpart)
    q = q.or(`requester_staff_id.eq.${req.auth.staff_id},counterpart_staff_id.eq.${req.auth.staff_id}`);
  }

  const { data, error } = await q;
  if (error) {
    res.status(500).json({ error: { code: 'QUERY_FAILED', message: 'Could not fetch swaps' } });
    return;
  }
  res.json(data ?? []);
});

// =================================================================
// GET /v1/shift-swaps/queue — REQUESTED + COUNTERPART_ACCEPTED queue
// =================================================================
shiftSwapsRouter.get(
  '/queue',
  requireRole('SH', 'DSH', 'GM', 'SHIFT_COMMANDER'),
  async (req: Request, res: Response): Promise<void> => {
    const { data, error } = await getServiceClient()
      .from('shift_swap_requests')
      .select('*')
      .eq('venue_id', req.auth.venue_id)
      .in('state', ['REQUESTED', 'COUNTERPART_ACCEPTED'])
      .order('requested_at', { ascending: true });
    if (error) {
      res.status(500).json({ error: { code: 'QUERY_FAILED', message: 'Could not fetch swap queue' } });
      return;
    }
    res.json(data ?? []);
  },
);

// Helper: load row scoped to venue. Returns null and sends 404 on miss.
async function loadSwap(req: Request, res: Response): Promise<SwapRow | null> {
  const { data, error } = await getServiceClient()
    .from('shift_swap_requests')
    .select('*')
    .eq('id', req.params['id'])
    .eq('venue_id', req.auth.venue_id)
    .single();
  if (error || !data) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Swap request not found' } });
    return null;
  }
  return data as SwapRow;
}

interface CreateBody {
  swap_type?: string;
  counterpart_staff_id?: string | null;
  original_assignment_id?: string;
  counterpart_assignment_id?: string | null;
  reason_text?: string | null;
}

// =================================================================
// POST /v1/shift-swaps — create REQUESTED row
// requester is always req.auth.staff_id (no on-behalf-of pattern; SH
// can directly reassign via the shifts router for top-down changes).
// =================================================================
shiftSwapsRouter.post(
  '/',
  auditLog('SWAP_CREATE'),
  async (req: Request, res: Response): Promise<void> => {
    const b = req.body as CreateBody;

    if (!b.swap_type || !(SWAP_TYPES as readonly string[]).includes(b.swap_type)) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: `swap_type must be one of ${SWAP_TYPES.join(', ')}` } });
      return;
    }
    if (!b.original_assignment_id || typeof b.original_assignment_id !== 'string') {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'original_assignment_id required' } });
      return;
    }

    const swapType = b.swap_type as SwapType;
    // chk_swap_counterpart enforces these at the DB; we surface as 400 client-side too for friendly errors.
    if (swapType === 'SWAP' && (!b.counterpart_staff_id || !b.counterpart_assignment_id)) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'SWAP requires both counterpart_staff_id and counterpart_assignment_id' } });
      return;
    }
    if (swapType === 'COVER' && (!b.counterpart_staff_id || b.counterpart_assignment_id)) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'COVER requires counterpart_staff_id only (no counterpart_assignment_id)' } });
      return;
    }
    if (swapType === 'DROP' && (b.counterpart_staff_id || b.counterpart_assignment_id)) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'DROP requires neither counterpart_staff_id nor counterpart_assignment_id' } });
      return;
    }

    // Verify original_assignment_id belongs to the requester (self-only swap-out).
    const db = getServiceClient();
    const { data: origAssign, error: origErr } = await db
      .from('staff_zone_assignments')
      .select('id, staff_id, shift_instance_id')
      .eq('id', b.original_assignment_id)
      .single();
    if (origErr || !origAssign) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'original_assignment_id not found' } });
      return;
    }
    if ((origAssign as { staff_id: string }).staff_id !== req.auth.staff_id) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'You can only swap your own assignment' } });
      return;
    }

    // For SWAP, verify counterpart_assignment_id belongs to counterpart_staff_id.
    if (swapType === 'SWAP' && b.counterpart_assignment_id && b.counterpart_staff_id) {
      const { data: cpAssign, error: cpErr } = await db
        .from('staff_zone_assignments')
        .select('id, staff_id')
        .eq('id', b.counterpart_assignment_id)
        .single();
      if (cpErr || !cpAssign) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'counterpart_assignment_id not found' } });
        return;
      }
      if ((cpAssign as { staff_id: string }).staff_id !== b.counterpart_staff_id) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'counterpart_assignment_id does not belong to counterpart_staff_id' } });
        return;
      }
    }

    const { data, error } = await db
      .from('shift_swap_requests')
      .insert({
        venue_id: req.auth.venue_id,
        requester_staff_id: req.auth.staff_id,
        counterpart_staff_id: b.counterpart_staff_id ?? null,
        original_assignment_id: b.original_assignment_id,
        counterpart_assignment_id: b.counterpart_assignment_id ?? null,
        swap_type: swapType,
        reason_text: b.reason_text ?? null,
        state: 'REQUESTED',
      })
      .select()
      .single();

    if (error || !data) {
      // 23505 = unique_violation on idx_swap_active_per_assignment (one active swap per assignment).
      const dup = (error as { code?: string } | null)?.code === '23505';
      res.status(dup ? 409 : 500).json({
        error: {
          code: dup ? 'DUPLICATE' : 'INSERT_FAILED',
          message: dup
            ? 'An active swap already exists for this assignment'
            : error?.message ?? 'Could not create swap',
        },
      });
      return;
    }
    res.status(201).json(data);
  },
);

// =================================================================
// POST /v1/shift-swaps/:id/accept — counterpart accepts
// REQUESTED → COUNTERPART_ACCEPTED. DROP type cannot be accepted (no counterpart).
// =================================================================
shiftSwapsRouter.post(
  '/:id/accept',
  auditLog('SWAP_ACCEPT'),
  async (req: Request, res: Response): Promise<void> => {
    const row = await loadSwap(req, res);
    if (!row) return;
    if (row.swap_type === 'DROP') {
      res.status(409).json({ error: { code: 'BAD_STATE', message: 'DROP swaps have no counterpart to accept' } });
      return;
    }
    if (row.counterpart_staff_id !== req.auth.staff_id) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only the counterpart can accept' } });
      return;
    }
    if (row.state !== 'REQUESTED') {
      res.status(409).json({ error: { code: 'BAD_STATE', message: `Only REQUESTED swaps can be accepted (current: ${row.state})` } });
      return;
    }

    const { data, error } = await getServiceClient()
      .from('shift_swap_requests')
      .update({
        state: 'COUNTERPART_ACCEPTED',
        counterpart_responded_at: new Date().toISOString(),
      })
      .eq('id', row.id)
      .eq('venue_id', req.auth.venue_id)
      .eq('state', 'REQUESTED')
      .select()
      .single();
    if (error || !data) {
      res.status(500).json({ error: { code: 'UPDATE_FAILED', message: error?.message ?? 'Could not accept' } });
      return;
    }
    res.json(data);
  },
);

// =================================================================
// POST /v1/shift-swaps/:id/decline — counterpart declines
// REQUESTED → DECLINED.
// =================================================================
shiftSwapsRouter.post(
  '/:id/decline',
  auditLog('SWAP_DECLINE'),
  async (req: Request, res: Response): Promise<void> => {
    const row = await loadSwap(req, res);
    if (!row) return;
    if (row.swap_type === 'DROP') {
      res.status(409).json({ error: { code: 'BAD_STATE', message: 'DROP swaps have no counterpart to decline' } });
      return;
    }
    if (row.counterpart_staff_id !== req.auth.staff_id) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only the counterpart can decline' } });
      return;
    }
    if (row.state !== 'REQUESTED') {
      res.status(409).json({ error: { code: 'BAD_STATE', message: `Only REQUESTED swaps can be declined (current: ${row.state})` } });
      return;
    }

    const { data, error } = await getServiceClient()
      .from('shift_swap_requests')
      .update({
        state: 'DECLINED',
        counterpart_responded_at: new Date().toISOString(),
      })
      .eq('id', row.id)
      .eq('venue_id', req.auth.venue_id)
      .eq('state', 'REQUESTED')
      .select()
      .single();
    if (error || !data) {
      res.status(500).json({ error: { code: 'UPDATE_FAILED', message: error?.message ?? 'Could not decline' } });
      return;
    }
    res.json(data);
  },
);

// =================================================================
// POST /v1/shift-swaps/:id/approve — SH/DSH
// SWAP/COVER: COUNTERPART_ACCEPTED → APPROVED + atomic assignment mutation.
// DROP:       REQUESTED            → APPROVED + assignment deletion.
//
// ★ Pass 3c-iii (mig 025): single-RPC call to approve_shift_swap() —
// the function body runs inside the caller's transaction, giving us
// TRUE server-side atomicity over (state validation + assignment
// mutation + swap-row APPROVED stamp). Replaces the prior two-step
// pattern (which had a narrow PARTIAL_FAILURE window between the
// assignment writes and the swap-row UPDATE).
//
// RPC error codes (raised inside approve_shift_swap):
//   P0002  SWAP_NOT_FOUND            → 404
//   P0001  BAD_STATE                 → 409 (state ≠ COUNTERPART_ACCEPTED / REQUESTED)
//   P0001  ASSIGNMENT_OWNER_MISMATCH → 409 (staff_id changed since swap created)
//   other  → 500
//
// Audit middleware fires on 2xx responses, same as before. Venue scope
// is enforced via the RPC's RLS context (set_tenant_context middleware
// sets app.current_venue_id; SECURITY INVOKER means the function reads/
// writes through the same venue_isolation policies).
// =================================================================
shiftSwapsRouter.post(
  '/:id/approve',
  requireRole('SH', 'DSH'),
  auditLog('SWAP_APPROVE'),
  async (req: Request, res: Response): Promise<void> => {
    const swapId = req.params['id'];
    if (!swapId) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'swap id required' } });
      return;
    }

    // Defence-in-depth: confirm row is in caller's venue before RPC.
    // Without this, a malicious caller could try to approve a swap in
    // another venue — the RPC's SECURITY INVOKER + RLS would block it,
    // but a fast 404 is friendlier than the RPC's RAISE.
    const existing = await loadSwap(req, res);
    if (!existing) return;

    const { data, error } = await getServiceClient().rpc('approve_shift_swap', {
      p_swap_id: swapId,
      p_supervisor_id: req.auth.staff_id,
    });

    if (error) {
      const pgCode = (error as { code?: string }).code;
      const pgMsg = (error as { message?: string }).message ?? '';
      // RPC RAISE EXCEPTIONs come through with the message embedded.
      // Match leading sentinels to map to friendly HTTP codes.
      if (pgCode === 'P0002' || pgMsg.startsWith('SWAP_NOT_FOUND')) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Swap request not found' } });
        return;
      }
      if (pgMsg.startsWith('BAD_STATE')) {
        res.status(409).json({ error: { code: 'BAD_STATE', message: pgMsg } });
        return;
      }
      if (pgMsg.startsWith('ASSIGNMENT_OWNER_MISMATCH')) {
        res.status(409).json({ error: { code: 'ASSIGNMENT_OWNER_MISMATCH', message: pgMsg } });
        return;
      }
      res.status(500).json({ error: { code: 'APPROVE_FAILED', message: pgMsg || 'Could not approve swap' } });
      return;
    }

    // RPC returns a single shift_swap_requests row (the updated APPROVED row).
    res.json(data);
  },
);

// =================================================================
// POST /v1/shift-swaps/:id/reject — SH/DSH
// Allowed from REQUESTED (DROP only) or COUNTERPART_ACCEPTED (SWAP/COVER).
// No assignment mutation.
// =================================================================
shiftSwapsRouter.post(
  '/:id/reject',
  requireRole('SH', 'DSH'),
  auditLog('SWAP_REJECT'),
  async (req: Request, res: Response): Promise<void> => {
    const row = await loadSwap(req, res);
    if (!row) return;

    const validFromState = row.swap_type === 'DROP' ? 'REQUESTED' : 'COUNTERPART_ACCEPTED';
    if (row.state !== validFromState) {
      res.status(409).json({
        error: {
          code: 'BAD_STATE',
          message: `Reject requires state=${validFromState} for ${row.swap_type} (current: ${row.state})`,
        },
      });
      return;
    }

    const { data, error } = await getServiceClient()
      .from('shift_swap_requests')
      .update({
        state: 'REJECTED',
        supervisor_decided_at: new Date().toISOString(),
        supervisor_staff_id: req.auth.staff_id,
      })
      .eq('id', row.id)
      .eq('venue_id', req.auth.venue_id)
      .eq('state', validFromState)
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
// POST /v1/shift-swaps/:id/withdraw — requester withdraws
// REQUESTED only (cannot withdraw after counterpart has accepted; SH must reject).
// =================================================================
shiftSwapsRouter.post(
  '/:id/withdraw',
  auditLog('SWAP_WITHDRAW'),
  async (req: Request, res: Response): Promise<void> => {
    const row = await loadSwap(req, res);
    if (!row) return;
    if (row.requester_staff_id !== req.auth.staff_id) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only the requester can withdraw' } });
      return;
    }
    if (row.state !== 'REQUESTED') {
      res.status(409).json({
        error: {
          code: 'BAD_STATE',
          message: `Only REQUESTED swaps can be withdrawn (current: ${row.state}; ask SH to reject if already counterpart-accepted)`,
        },
      });
      return;
    }

    const { data, error } = await getServiceClient()
      .from('shift_swap_requests')
      .update({ state: 'WITHDRAWN' })
      .eq('id', row.id)
      .eq('venue_id', req.auth.venue_id)
      .eq('state', 'REQUESTED')
      .select()
      .single();
    if (error || !data) {
      res.status(500).json({ error: { code: 'UPDATE_FAILED', message: error?.message ?? 'Could not withdraw' } });
      return;
    }
    res.json(data);
  },
);
