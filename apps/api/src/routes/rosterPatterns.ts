/**
 * /v1/roster-patterns — BR-AK Pattern Engine (Phase 5.24 wave 2 Pass 1).
 *
 * Spec source: Architecture Roster v1 §6.2. Schema: mig 022 (applied
 * 2026-05-21). The first user-facing surface of the recurring-pattern
 * roster engine; the materialisation worker (BR-AO, Pass 3) consumes
 * PUBLISHED patterns to generate `shift_instances` + zone assignments.
 *
 * Endpoints:
 *   GET    /v1/roster-patterns                 list (any auth; filterable)
 *   GET    /v1/roster-patterns/:id             detail + cycle_positions + staff_assignments
 *   POST   /v1/roster-patterns                 create DRAFT (SH/DSH/SHIFT_COMMANDER)
 *   PATCH  /v1/roster-patterns/:id             edit DRAFT header fields (SH/DSH/SHIFT_COMMANDER)
 *   PUT    /v1/roster-patterns/:id/staff-assignments
 *                                              bulk-replace staff (DRAFT only)           [Pass 4a-0]
 *   PUT    /v1/roster-patterns/:id/cycle-positions
 *                                              bulk-replace cycle positions (DRAFT only) [Pass 4a-0]
 *   POST   /v1/roster-patterns/:id/validate    dry-run validation (any auth)             [Pass 3a]
 *   POST   /v1/roster-patterns/:id/publish     DRAFT → PUBLISHED (SH/DSH/SHIFT_COMMANDER)
 *                                              auto-enqueues 30-day materialisation     [Pass 3b]
 *   POST   /v1/roster-patterns/:id/materialise manual materialisation (SH/DSH/SHIFT_COMMANDER)
 *                                              body: { from_date?, to_date? }            [Pass 3b]
 *   POST   /v1/roster-patterns/:id/sign-off    second-signature (SH/DSH/GM)
 *   POST   /v1/roster-patterns/:id/suspend     PUBLISHED → SUSPENDED (SH/DSH)
 *   POST   /v1/roster-patterns/:id/archive     → ARCHIVED (SH/DSH)
 *
 * Scope discipline:
 *   - publish endpoint enforces the FULL validation gate (Pass 3a):
 *     Factories Act §51/§54 hours + coverage_rules (mig 023) scan +
 *     pattern-overlap with other PUBLISHED patterns sharing staff.
 *     MANDATORY violations → 422 VALIDATION_FAILED; WARNINGs publish
 *     but are echoed in the response for SH visibility.
 *   - materialisation worker (Pass 3b): BR-AO BullMQ worker in apps/scheduler
 *     writes shift_instances + staff_zone_assignments idempotently across
 *     the [from_date, to_date] horizon. Worker-paused until June 1 per
 *     ADR 0005 — jobs accumulate in Redis and drain when WORKERS_PAUSED=false.
 *     Enqueue failure NEVER fails publish (Rule 7).
 *
 * venue-scoped on every query (Rule 2 / EC-03); RLS `venue_isolation` is
 * the second layer. created_by stamping from req.auth.staff_id.
 */

import { Router, Request, Response } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { setTenantContext } from '../middleware/tenant.js';
import { auditLog } from '../middleware/audit.js';
import { getServiceClient } from '@safecommand/db';
import { rosterMaterialisationQueue } from '@safecommand/queue';
import type { RosterMaterialisationJob } from '@safecommand/types';
import { validateRosterPattern } from '../services/rosterValidation.js';
import { logger } from '../services/logger.js';

export const rosterPatternsRouter = Router();
rosterPatternsRouter.use(requireAuth, setTenantContext);

const CYCLE_TYPES = ['WEEKLY', 'BIWEEKLY', 'N_WEEK_ROTATION', 'CUSTOM_DAYS'] as const;
const STATUSES = ['DRAFT', 'PUBLISHED', 'SUSPENDED', 'ARCHIVED'] as const;
const COMMAND_ROLES = ['SH', 'DSH', 'SHIFT_COMMANDER'] as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface StaffAssignmentInput {
  staff_id?: string;
  weekly_off_pattern?: string;
  weekly_off_day?: number | null;
  weekly_max_hours?: number;
  daily_max_hours?: number;
  default_zone_assignments?: unknown;
}

interface CyclePositionInput {
  staff_id?: string;
  cycle_position?: number;
  shift_id?: string | null;
}

interface CreateBody {
  name?: string;
  cycle_type?: string;
  cycle_length_days?: number;
  rotation_pattern_code?: string | null;
  effective_from?: string;
  effective_to?: string | null;
  staff_assignments?: StaffAssignmentInput[];
  cycle_positions?: CyclePositionInput[];
}

interface PatchBody {
  name?: string;
  cycle_type?: string;
  cycle_length_days?: number;
  rotation_pattern_code?: string | null;
  effective_from?: string;
  effective_to?: string | null;
}

// ──────────────────────────────────────────────────────────────────────────
// GET / — list patterns (any authenticated; filterable)

rosterPatternsRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  const status = req.query['status'] as string | undefined;
  const effectiveAt = req.query['effective_at'] as string | undefined;

  let query = getServiceClient()
    .from('roster_patterns')
    .select('*')
    .eq('venue_id', req.auth.venue_id)
    .order('effective_from', { ascending: false });

  if (status) {
    if (!STATUSES.includes(status as typeof STATUSES[number])) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: `status must be one of ${STATUSES.join(', ')}` },
      });
      return;
    }
    query = query.eq('status', status);
  }
  if (effectiveAt) {
    if (!DATE_RE.test(effectiveAt)) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'effective_at must be YYYY-MM-DD' },
      });
      return;
    }
    query = query.lte('effective_from', effectiveAt);
    // effective_to either NULL (open-ended) or >= effective_at
    query = query.or(`effective_to.is.null,effective_to.gte.${effectiveAt}`);
  }

  const { data, error } = await query;
  if (error) {
    res.status(500).json({ error: { code: 'QUERY_FAILED', message: 'Could not fetch patterns' } });
    return;
  }
  res.json(data ?? []);
});

// ──────────────────────────────────────────────────────────────────────────
// GET /:id — detail with cycle_positions + staff_assignments

rosterPatternsRouter.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const id = req.params['id'];
  const venueId = req.auth.venue_id;
  const db = getServiceClient();

  const { data: pattern, error: pErr } = await db
    .from('roster_patterns')
    .select('*')
    .eq('id', id)
    .eq('venue_id', venueId)
    .single();
  if (pErr || !pattern) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Pattern not found' } });
    return;
  }

  // Children are venue-scoped via RLS but we add the filter for defence-in-depth
  const [{ data: positions }, { data: assignments }] = await Promise.all([
    db.from('roster_cycle_positions')
      .select('*')
      .eq('pattern_id', id)
      .eq('venue_id', venueId)
      .order('cycle_position', { ascending: true }),
    db.from('staff_roster_assignments')
      .select('*, staff(name, role)')
      .eq('pattern_id', id)
      .eq('venue_id', venueId),
  ]);

  res.json({
    ...(pattern as Record<string, unknown>),
    cycle_positions: positions ?? [],
    staff_assignments: assignments ?? [],
  });
});

// ──────────────────────────────────────────────────────────────────────────
// POST / — create DRAFT pattern with nested staff_assignments + cycle_positions
// Multi-step insert with best-effort cleanup (Supabase JS lacks transactions).
// If staff/positions inserts fail after the pattern insert, the pattern is
// deleted (ON DELETE CASCADE clears any partial children).

rosterPatternsRouter.post(
  '/',
  requireRole(...COMMAND_ROLES),
  auditLog('PATTERN_CREATE'),
  async (req: Request, res: Response): Promise<void> => {
    const b = req.body as CreateBody;
    if (!b.name || !b.cycle_type || !b.cycle_length_days || !b.effective_from) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'name, cycle_type, cycle_length_days, effective_from required',
        },
      });
      return;
    }
    if (!CYCLE_TYPES.includes(b.cycle_type as typeof CYCLE_TYPES[number])) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: `cycle_type must be one of ${CYCLE_TYPES.join(', ')}` },
      });
      return;
    }
    if (b.cycle_length_days < 1 || b.cycle_length_days > 60) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'cycle_length_days must be 1-60' },
      });
      return;
    }
    if (!DATE_RE.test(b.effective_from)) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'effective_from must be YYYY-MM-DD' },
      });
      return;
    }
    if (b.effective_to !== null && b.effective_to !== undefined) {
      if (!DATE_RE.test(b.effective_to)) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'effective_to must be YYYY-MM-DD' },
        });
        return;
      }
      if (b.effective_to < b.effective_from) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'effective_to must be on or after effective_from' },
        });
        return;
      }
    }

    const venueId = req.auth.venue_id;
    const db = getServiceClient();

    // Step 1: create the DRAFT pattern
    const { data: pattern, error: pErr } = await db
      .from('roster_patterns')
      .insert({
        venue_id: venueId,
        name: b.name,
        cycle_type: b.cycle_type,
        cycle_length_days: b.cycle_length_days,
        rotation_pattern_code: b.rotation_pattern_code ?? null,
        effective_from: b.effective_from,
        effective_to: b.effective_to ?? null,
        status: 'DRAFT',
        created_by: req.auth.staff_id,
      })
      .select()
      .single();
    if (pErr || !pattern) {
      res.status(500).json({ error: { code: 'INSERT_FAILED', message: pErr?.message ?? 'Failed' } });
      return;
    }

    // Best-effort cleanup helper for failure paths in steps 2/3.
    // ON DELETE CASCADE on the children clears partial state automatically.
    const rollback = async (): Promise<void> => {
      await db.from('roster_patterns').delete().eq('id', pattern.id).eq('venue_id', venueId);
    };

    // Step 2: staff_roster_assignments (per-staff weekly-off + hour limits)
    if (Array.isArray(b.staff_assignments) && b.staff_assignments.length > 0) {
      for (const [idx, sa] of b.staff_assignments.entries()) {
        if (!sa.staff_id) {
          await rollback();
          res.status(400).json({
            error: { code: 'VALIDATION_ERROR', message: `staff_assignments[${idx}].staff_id required` },
          });
          return;
        }
      }
      const { error: saErr } = await db.from('staff_roster_assignments').insert(
        b.staff_assignments.map((sa) => ({
          venue_id: venueId,
          pattern_id: pattern.id,
          staff_id: sa.staff_id,
          default_zone_assignments: sa.default_zone_assignments ?? null,
          weekly_off_pattern: sa.weekly_off_pattern ?? 'FIXED',
          weekly_off_day: sa.weekly_off_day ?? null,
          weekly_max_hours: sa.weekly_max_hours ?? 48,
          daily_max_hours: sa.daily_max_hours ?? 9,
        })),
      );
      if (saErr) {
        await rollback();
        res.status(500).json({
          error: { code: 'INSERT_FAILED', message: `staff_assignments failed: ${saErr.message}` },
        });
        return;
      }
    }

    // Step 3: roster_cycle_positions (per-staff per-cycle-position shift)
    if (Array.isArray(b.cycle_positions) && b.cycle_positions.length > 0) {
      for (const [idx, cp] of b.cycle_positions.entries()) {
        if (!cp.staff_id || typeof cp.cycle_position !== 'number' || cp.cycle_position < 0) {
          await rollback();
          res.status(400).json({
            error: {
              code: 'VALIDATION_ERROR',
              message: `cycle_positions[${idx}] must have staff_id + non-negative cycle_position`,
            },
          });
          return;
        }
        if (cp.cycle_position >= b.cycle_length_days) {
          await rollback();
          res.status(400).json({
            error: {
              code: 'VALIDATION_ERROR',
              message: `cycle_positions[${idx}].cycle_position must be < cycle_length_days (${b.cycle_length_days})`,
            },
          });
          return;
        }
      }
      const { error: cpErr } = await db.from('roster_cycle_positions').insert(
        b.cycle_positions.map((cp) => ({
          venue_id: venueId,
          pattern_id: pattern.id,
          staff_id: cp.staff_id,
          cycle_position: cp.cycle_position,
          shift_id: cp.shift_id ?? null,
        })),
      );
      if (cpErr) {
        await rollback();
        res.status(500).json({
          error: { code: 'INSERT_FAILED', message: `cycle_positions failed: ${cpErr.message}` },
        });
        return;
      }
    }

    res.status(201).json({
      ...(pattern as Record<string, unknown>),
      staff_assignments_count: b.staff_assignments?.length ?? 0,
      cycle_positions_count: b.cycle_positions?.length ?? 0,
    });
  },
);

// ──────────────────────────────────────────────────────────────────────────
// PATCH /:id — edit DRAFT pattern (reject if not DRAFT)

rosterPatternsRouter.patch(
  '/:id',
  requireRole(...COMMAND_ROLES),
  auditLog('PATTERN_PATCH'),
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'];
    const venueId = req.auth.venue_id;
    const b = req.body as PatchBody;

    if (b.cycle_type !== undefined && !CYCLE_TYPES.includes(b.cycle_type as typeof CYCLE_TYPES[number])) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'invalid cycle_type' } });
      return;
    }
    if (b.cycle_length_days !== undefined && (b.cycle_length_days < 1 || b.cycle_length_days > 60)) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'cycle_length_days must be 1-60' } });
      return;
    }
    if (b.effective_from !== undefined && !DATE_RE.test(b.effective_from)) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'effective_from must be YYYY-MM-DD' } });
      return;
    }
    if (b.effective_to !== undefined && b.effective_to !== null && !DATE_RE.test(b.effective_to)) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'effective_to must be YYYY-MM-DD' } });
      return;
    }

    const db = getServiceClient();
    const { data: existing, error: gErr } = await db
      .from('roster_patterns')
      .select('status')
      .eq('id', id)
      .eq('venue_id', venueId)
      .single();
    if (gErr || !existing) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Pattern not found' } });
      return;
    }
    if (existing.status !== 'DRAFT') {
      res.status(409).json({
        error: {
          code: 'NOT_DRAFT',
          message: `Pattern is ${existing.status}; only DRAFT patterns are editable. Use suspend → revise via successor pattern.`,
        },
      });
      return;
    }

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const k of ['name', 'cycle_type', 'cycle_length_days', 'rotation_pattern_code', 'effective_from', 'effective_to'] as const) {
      if (b[k] !== undefined) update[k] = b[k];
    }

    const { data, error } = await db
      .from('roster_patterns')
      .update(update)
      .eq('id', id)
      .eq('venue_id', venueId)
      .select()
      .single();
    if (error || !data) {
      res.status(500).json({ error: { code: 'UPDATE_FAILED', message: error?.message ?? 'Failed' } });
      return;
    }
    res.json(data);
  },
);

// ──────────────────────────────────────────────────────────────────────────
// PUT /:id/staff-assignments — bulk-replace staff assignments (DRAFT only)
// Pass 4a-0 (Phase 5.24). Mirrors the bulk-replace contract used by
// /v1/shift-instances/:id/zone-assignments (Phase 5.16a). Body:
//   { staff_assignments: [{ staff_id, weekly_off_pattern?, weekly_off_day?,
//                           weekly_max_hours?, daily_max_hours?,
//                           default_zone_assignments? }] }
// Idempotent: DELETE-then-INSERT inside the DRAFT-only gate. Concurrent
// SH-editing is not a contemplated risk (DRAFT patterns are owned by their
// creator until published).

rosterPatternsRouter.put(
  '/:id/staff-assignments',
  requireRole(...COMMAND_ROLES),
  auditLog('PATTERN_STAFF_ASSIGNMENTS_REPLACE'),
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'];
    if (!id) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'pattern id required' } });
      return;
    }
    const venueId = req.auth.venue_id;
    const body = req.body as { staff_assignments?: StaffAssignmentInput[] };
    const rows = body.staff_assignments;
    if (!Array.isArray(rows)) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'staff_assignments array required' } });
      return;
    }

    const db = getServiceClient();
    const { data: existing, error: gErr } = await db
      .from('roster_patterns')
      .select('status')
      .eq('id', id).eq('venue_id', venueId).single();
    if (gErr || !existing) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Pattern not found' } });
      return;
    }
    if (existing.status !== 'DRAFT') {
      res.status(409).json({
        error: { code: 'NOT_DRAFT', message: `Cannot edit staff assignments on a ${existing.status} pattern` },
      });
      return;
    }

    // Validate each row
    for (const r of rows) {
      if (typeof r.staff_id !== 'string' || !r.staff_id) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'staff_id required on every assignment' } });
        return;
      }
      if (r.weekly_off_pattern !== undefined &&
          !['FIXED', 'ROTATING_WEEKLY', 'ROTATING_WITH_CYCLE'].includes(r.weekly_off_pattern)) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: `invalid weekly_off_pattern: ${r.weekly_off_pattern}` } });
        return;
      }
      if (r.weekly_max_hours !== undefined && (r.weekly_max_hours < 1 || r.weekly_max_hours > 84)) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'weekly_max_hours must be 1-84' } });
        return;
      }
      if (r.daily_max_hours !== undefined && (r.daily_max_hours < 1 || r.daily_max_hours > 16)) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'daily_max_hours must be 1-16' } });
        return;
      }
    }

    // Dedup: UNIQUE(pattern_id, staff_id) enforces this at DB; pre-check for friendlier 400.
    const ids = new Set<string>();
    for (const r of rows) {
      if (ids.has(r.staff_id!)) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: `duplicate staff_id ${r.staff_id} in payload` } });
        return;
      }
      ids.add(r.staff_id!);
    }

    // DELETE existing
    const { error: delErr } = await db
      .from('staff_roster_assignments')
      .delete()
      .eq('pattern_id', id)
      .eq('venue_id', venueId);
    if (delErr) {
      res.status(500).json({ error: { code: 'DELETE_FAILED', message: delErr.message } });
      return;
    }

    // INSERT new (skip if empty)
    if (rows.length === 0) {
      res.json({ pattern_id: id, count: 0 });
      return;
    }
    const inserts = rows.map((r) => ({
      venue_id: venueId,
      pattern_id: id,
      staff_id: r.staff_id,
      weekly_off_pattern: r.weekly_off_pattern ?? 'FIXED',
      weekly_off_day: r.weekly_off_day ?? null,
      weekly_max_hours: r.weekly_max_hours ?? 48,
      daily_max_hours: r.daily_max_hours ?? 9,
      default_zone_assignments: r.default_zone_assignments ?? null,
    }));
    const { error: insErr } = await db.from('staff_roster_assignments').insert(inserts);
    if (insErr) {
      res.status(500).json({ error: { code: 'INSERT_FAILED', message: insErr.message } });
      return;
    }
    res.json({ pattern_id: id, count: rows.length });
  },
);

// ──────────────────────────────────────────────────────────────────────────
// PUT /:id/cycle-positions — bulk-replace cycle positions (DRAFT only)
// Body: { cycle_positions: [{ staff_id, cycle_position, shift_id? }] }
// shift_id NULL = staff is OFF on this position (rather than omitting the row;
// keeping the row preserves the SH's intent — "explicit OFF" vs "not entered").

rosterPatternsRouter.put(
  '/:id/cycle-positions',
  requireRole(...COMMAND_ROLES),
  auditLog('PATTERN_CYCLE_POSITIONS_REPLACE'),
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'];
    if (!id) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'pattern id required' } });
      return;
    }
    const venueId = req.auth.venue_id;
    const body = req.body as { cycle_positions?: CyclePositionInput[] };
    const rows = body.cycle_positions;
    if (!Array.isArray(rows)) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'cycle_positions array required' } });
      return;
    }

    const db = getServiceClient();
    const { data: existing, error: gErr } = await db
      .from('roster_patterns')
      .select('status, cycle_length_days')
      .eq('id', id).eq('venue_id', venueId).single();
    if (gErr || !existing) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Pattern not found' } });
      return;
    }
    if (existing.status !== 'DRAFT') {
      res.status(409).json({
        error: { code: 'NOT_DRAFT', message: `Cannot edit cycle positions on a ${existing.status} pattern` },
      });
      return;
    }
    const cycleLen = (existing as { cycle_length_days: number }).cycle_length_days;

    // Validate each row + dedupe (UNIQUE(pattern_id, staff_id, cycle_position))
    const seen = new Set<string>();
    for (const r of rows) {
      if (typeof r.staff_id !== 'string' || !r.staff_id) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'staff_id required on every position' } });
        return;
      }
      if (typeof r.cycle_position !== 'number' || r.cycle_position < 0 || r.cycle_position >= cycleLen) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: `cycle_position must be 0..${cycleLen - 1} (got ${r.cycle_position})` },
        });
        return;
      }
      const key = `${r.staff_id}::${r.cycle_position}`;
      if (seen.has(key)) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: `duplicate (staff_id, cycle_position): ${r.staff_id} @ ${r.cycle_position}` },
        });
        return;
      }
      seen.add(key);
    }

    // DELETE existing
    const { error: delErr } = await db
      .from('roster_cycle_positions')
      .delete()
      .eq('pattern_id', id)
      .eq('venue_id', venueId);
    if (delErr) {
      res.status(500).json({ error: { code: 'DELETE_FAILED', message: delErr.message } });
      return;
    }

    if (rows.length === 0) {
      res.json({ pattern_id: id, count: 0 });
      return;
    }
    const inserts = rows.map((r) => ({
      venue_id: venueId,
      pattern_id: id,
      staff_id: r.staff_id,
      cycle_position: r.cycle_position,
      shift_id: r.shift_id ?? null,
    }));
    const { error: insErr } = await db.from('roster_cycle_positions').insert(inserts);
    if (insErr) {
      res.status(500).json({ error: { code: 'INSERT_FAILED', message: insErr.message } });
      return;
    }
    res.json({ pattern_id: id, count: rows.length });
  },
);

// ──────────────────────────────────────────────────────────────────────────
// POST /:id/validate — dry-run validation (any authenticated user)
// Returns the full ValidationResult without mutating state. UI uses this to
// surface violations before the user clicks Publish.

rosterPatternsRouter.post(
  '/:id/validate',
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'];
    if (!id) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'pattern id required' } });
      return;
    }
    const result = await validateRosterPattern(id, req.auth.venue_id);
    res.json(result);
  },
);

// ──────────────────────────────────────────────────────────────────────────
// POST /:id/publish — DRAFT → PUBLISHED (validation-gated as of Pass 3a)
// Runs the full validation engine: Factories Act §51/§54 hours + coverage
// rule scan (mig 023 coverage_rules) + pattern overlap with other PUBLISHED
// patterns sharing staff. Blocks on any MANDATORY violation; WARNINGs
// publish but are echoed back to the client for SH visibility.

rosterPatternsRouter.post(
  '/:id/publish',
  requireRole(...COMMAND_ROLES),
  auditLog('PATTERN_PUBLISH'),
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'];
    if (!id) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'pattern id required' } });
      return;
    }
    const venueId = req.auth.venue_id;
    const db = getServiceClient();

    const { data: existing, error: gErr } = await db
      .from('roster_patterns')
      .select('status')
      .eq('id', id)
      .eq('venue_id', venueId)
      .single();
    if (gErr || !existing) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Pattern not found' } });
      return;
    }
    if (existing.status !== 'DRAFT') {
      res.status(409).json({
        error: { code: 'NOT_DRAFT', message: `Cannot publish a ${existing.status} pattern` },
      });
      return;
    }

    // Sanity gate — at least one staff + one cycle position before validation runs.
    const [{ count: saCount }, { count: cpCount }] = await Promise.all([
      db.from('staff_roster_assignments').select('id', { count: 'exact', head: true })
        .eq('pattern_id', id).eq('venue_id', venueId),
      db.from('roster_cycle_positions').select('id', { count: 'exact', head: true })
        .eq('pattern_id', id).eq('venue_id', venueId),
    ]);
    if ((saCount ?? 0) < 1 || (cpCount ?? 0) < 1) {
      res.status(422).json({
        error: {
          code: 'EMPTY_PATTERN',
          message: 'Pattern must have at least one staff assignment and one cycle position before publish',
        },
      });
      return;
    }

    // ── Full validation gate (Pass 3a)
    const validation = await validateRosterPattern(id, venueId);
    if (!validation.ok) {
      res.status(422).json({
        error: {
          code: 'VALIDATION_FAILED',
          message: `Cannot publish: ${validation.mandatory_violations.length} mandatory violation${validation.mandatory_violations.length === 1 ? '' : 's'} detected (Factories Act / coverage / overlap)`,
        },
        validation,
      });
      return;
    }

    const publishedAt = new Date().toISOString();
    const { data, error } = await db
      .from('roster_patterns')
      .update({
        status: 'PUBLISHED',
        published_at: publishedAt,
        published_by_staff_id: req.auth.staff_id,
        updated_at: publishedAt,
      })
      .eq('id', id)
      .eq('venue_id', venueId)
      .select()
      .single();
    if (error || !data) {
      res.status(500).json({ error: { code: 'PUBLISH_FAILED', message: error?.message ?? 'Failed' } });
      return;
    }

    // ── BR-AO materialisation: enqueue 30-day initial horizon
    // Per ADR 0005 the worker processes when WORKERS_PAUSED=false (from June 1);
    // until then the job sits in Redis safely. enqueue failure must NEVER fail
    // the primary operation (Rule 7) — log + continue.
    const today = new Date().toISOString().slice(0, 10);
    const horizonEnd = (() => {
      const d = new Date(today + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + 30);
      return d.toISOString().slice(0, 10);
    })();
    let materialisation_enqueued: { job_id: string | undefined; from_date: string; to_date: string } | undefined;
    let materialisation_enqueue_error: string | undefined;
    try {
      const job = await rosterMaterialisationQueue.add(
        'pattern-publish',
        {
          venue_id: venueId,
          pattern_id: id,
          from_date: today,
          to_date: horizonEnd,
          trigger: 'PUBLISH',
        } satisfies RosterMaterialisationJob,
        { jobId: `materialise__${id}__${today}__${horizonEnd}__publish` },
      );
      materialisation_enqueued = { job_id: job.id, from_date: today, to_date: horizonEnd };
    } catch (err) {
      materialisation_enqueue_error = err instanceof Error ? err.message : String(err);
      logger.warn({ err, pattern_id: id }, 'Failed to enqueue materialisation — pattern still PUBLISHED');
    }

    res.status(200).json({
      ...(data as Record<string, unknown>),
      validation,  // echoes warnings (mandatory_violations is empty by gate)
      materialisation: materialisation_enqueued
        ? { ...materialisation_enqueued, worker_paused_note: 'Job sits in queue until WORKERS_PAUSED=false (ADR 0005; June 1 unfreeze).' }
        : { error: materialisation_enqueue_error ?? 'unknown', note: 'Publish succeeded; SH can manually re-enqueue via POST /:id/materialise.' },
    });
  },
);

// ──────────────────────────────────────────────────────────────────────────
// POST /:id/materialise — manual materialisation enqueue (Pass 3b)
// Body: { from_date?: 'YYYY-MM-DD', to_date?: 'YYYY-MM-DD' } — defaults
// to [today, today+30]. SH/DSH/SHIFT_COMMANDER. Pattern must be PUBLISHED.
// Enqueues a BR-AO job; the worker writes shift_instances + zone
// assignments idempotently. Use to extend the horizon beyond the
// 30-day initial slice enqueued at publish.

rosterPatternsRouter.post(
  '/:id/materialise',
  requireRole(...COMMAND_ROLES),
  auditLog('PATTERN_MATERIALISE'),
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'];
    if (!id) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'pattern id required' } });
      return;
    }
    const venueId = req.auth.venue_id;
    const db = getServiceClient();

    const { data: pattern, error: pErr } = await db
      .from('roster_patterns')
      .select('status')
      .eq('id', id)
      .eq('venue_id', venueId)
      .single();
    if (pErr || !pattern) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Pattern not found' } });
      return;
    }
    if (pattern.status !== 'PUBLISHED') {
      res.status(409).json({
        error: { code: 'NOT_PUBLISHED', message: `Only PUBLISHED patterns can be materialised (current: ${pattern.status})` },
      });
      return;
    }

    const body = (req.body as { from_date?: string; to_date?: string } | undefined) ?? {};
    const today = new Date().toISOString().slice(0, 10);
    const defaultEnd = (() => {
      const d = new Date(today + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + 30);
      return d.toISOString().slice(0, 10);
    })();
    const fromDate = body.from_date ?? today;
    const toDate = body.to_date ?? defaultEnd;

    if (!DATE_RE.test(fromDate) || !DATE_RE.test(toDate)) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'from_date / to_date must be YYYY-MM-DD' } });
      return;
    }
    if (toDate < fromDate) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'to_date must be on or after from_date' } });
      return;
    }
    // Cap horizon at 90 days per worker contract.
    const spanDays = Math.floor((Date.parse(toDate) - Date.parse(fromDate)) / 86_400_000) + 1;
    if (spanDays > 90) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Horizon capped at 90 days; enqueue multiple jobs to extend further.' } });
      return;
    }

    try {
      const job = await rosterMaterialisationQueue.add(
        'pattern-manual',
        {
          venue_id: venueId,
          pattern_id: id,
          from_date: fromDate,
          to_date: toDate,
          trigger: 'MANUAL',
        } satisfies RosterMaterialisationJob,
        { jobId: `materialise__${id}__${fromDate}__${toDate}__manual` },
      );
      res.status(202).json({
        job_id: job.id,
        pattern_id: id,
        from_date: fromDate,
        to_date: toDate,
        worker_paused_note: 'Job sits in queue until WORKERS_PAUSED=false (ADR 0005; June 1 unfreeze).',
      });
    } catch (err) {
      res.status(500).json({
        error: { code: 'ENQUEUE_FAILED', message: err instanceof Error ? err.message : 'Could not enqueue materialisation' },
      });
    }
  },
);

// ──────────────────────────────────────────────────────────────────────────
// POST /:id/sign-off — second-signature

rosterPatternsRouter.post(
  '/:id/sign-off',
  requireRole('SH', 'DSH', 'GM'),
  auditLog('PATTERN_SIGN_OFF'),
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'];
    const venueId = req.auth.venue_id;
    const db = getServiceClient();

    const { data: existing } = await db
      .from('roster_patterns')
      .select('status, signed_off_at')
      .eq('id', id)
      .eq('venue_id', venueId)
      .single();
    if (!existing) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Pattern not found' } });
      return;
    }
    if (existing.status !== 'PUBLISHED') {
      res.status(409).json({
        error: { code: 'NOT_PUBLISHED', message: `Sign-off requires PUBLISHED; pattern is ${existing.status}` },
      });
      return;
    }
    if (existing.signed_off_at) {
      res.status(409).json({
        error: { code: 'ALREADY_SIGNED_OFF', message: 'Pattern is already signed off' },
      });
      return;
    }

    const now = new Date().toISOString();
    const { data, error } = await db
      .from('roster_patterns')
      .update({ signed_off_at: now, signed_off_by_staff_id: req.auth.staff_id, updated_at: now })
      .eq('id', id)
      .eq('venue_id', venueId)
      .select()
      .single();
    if (error || !data) {
      res.status(500).json({ error: { code: 'SIGN_OFF_FAILED', message: error?.message ?? 'Failed' } });
      return;
    }
    res.json(data);
  },
);

// ──────────────────────────────────────────────────────────────────────────
// POST /:id/suspend — PUBLISHED → SUSPENDED

rosterPatternsRouter.post(
  '/:id/suspend',
  requireRole('SH', 'DSH'),
  auditLog('PATTERN_SUSPEND'),
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'];
    const venueId = req.auth.venue_id;
    const db = getServiceClient();

    const { data: existing } = await db
      .from('roster_patterns')
      .select('status')
      .eq('id', id)
      .eq('venue_id', venueId)
      .single();
    if (!existing) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Pattern not found' } });
      return;
    }
    if (existing.status !== 'PUBLISHED') {
      res.status(409).json({
        error: { code: 'NOT_PUBLISHED', message: `Cannot suspend a ${existing.status} pattern` },
      });
      return;
    }

    const { data, error } = await db
      .from('roster_patterns')
      .update({ status: 'SUSPENDED', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('venue_id', venueId)
      .select()
      .single();
    if (error || !data) {
      res.status(500).json({ error: { code: 'SUSPEND_FAILED', message: error?.message ?? 'Failed' } });
      return;
    }
    res.json(data);
  },
);

// ──────────────────────────────────────────────────────────────────────────
// POST /:id/archive — → ARCHIVED (requires successor or no_replacement_sign_off)

rosterPatternsRouter.post(
  '/:id/archive',
  requireRole('SH', 'DSH'),
  auditLog('PATTERN_ARCHIVE'),
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'];
    const venueId = req.auth.venue_id;
    const b = req.body as { successor_pattern_id?: string; no_replacement_sign_off?: boolean };

    if (!b.successor_pattern_id && b.no_replacement_sign_off !== true) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'archive requires successor_pattern_id OR no_replacement_sign_off=true',
        },
      });
      return;
    }

    const db = getServiceClient();
    const { data: existing } = await db
      .from('roster_patterns')
      .select('status, effective_to')
      .eq('id', id)
      .eq('venue_id', venueId)
      .single();
    if (!existing) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Pattern not found' } });
      return;
    }
    if (existing.status !== 'PUBLISHED' && existing.status !== 'SUSPENDED' && existing.status !== 'DRAFT') {
      res.status(409).json({
        error: { code: 'BAD_STATE', message: `Cannot archive a ${existing.status} pattern` },
      });
      return;
    }

    // Verify successor exists in same venue (if provided)
    if (b.successor_pattern_id) {
      const { data: succ } = await db
        .from('roster_patterns')
        .select('id')
        .eq('id', b.successor_pattern_id)
        .eq('venue_id', venueId)
        .single();
      if (!succ) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'successor_pattern_id not found in this venue' },
        });
        return;
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    const update: Record<string, unknown> = {
      status: 'ARCHIVED',
      updated_at: new Date().toISOString(),
    };
    if (existing.effective_to === null || existing.effective_to === undefined) {
      update['effective_to'] = today;
    }

    const { data, error } = await db
      .from('roster_patterns')
      .update(update)
      .eq('id', id)
      .eq('venue_id', venueId)
      .select()
      .single();
    if (error || !data) {
      res.status(500).json({ error: { code: 'ARCHIVE_FAILED', message: error?.message ?? 'Failed' } });
      return;
    }
    res.json(data);
  },
);
