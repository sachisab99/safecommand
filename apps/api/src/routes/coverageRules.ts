/**
 * /v1/coverage-rules — BR-AQ Coverage Rules (mig 023, applied 2026-05-21).
 *
 * Spec source: Architecture Roster v1 §6.8. Per-(venue / zone / role /
 * shift) minimum-staffing rules with priority MANDATORY|WARNING. Used by
 * the publish pre-flight validation engine (Pass 3) + post-publish gap
 * alert engine. Pre-deploy adaptation: `building_id` omitted pre-MBV.
 *
 *   GET    /v1/coverage-rules                 list (any authenticated)
 *   POST   /v1/coverage-rules                 create (SH/DSH)
 *   PATCH  /v1/coverage-rules/:id             update (SH/DSH)
 *   DELETE /v1/coverage-rules/:id             remove (SH/DSH)
 *   POST   /v1/coverage-rules/scan            DEFERRED to Pass 3 (validation engine)
 *
 * venue-scoped (Rule 2 / EC-03); RLS `venue_isolation` second layer.
 * UNIQUE NULLS NOT DISTINCT (venue_id, zone_id, role_code, shift_id)
 * enforced at DB; client may receive 409 on duplicate scope.
 */

import { Router, Request, Response } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { setTenantContext } from '../middleware/tenant.js';
import { getServiceClient } from '@safecommand/db';

export const coverageRulesRouter = Router();
coverageRulesRouter.use(requireAuth, setTenantContext);

const PRIORITIES = ['MANDATORY', 'WARNING'] as const;
// Mirrors mig 001 staff_role_enum (validated client-side for friendlier 400s;
// the DB enum is the ultimate enforcement).
const ROLE_CODES = [
  'SH', 'DSH', 'GM', 'AUDITOR', 'SHIFT_COMMANDER', 'FM',
  'FLOOR_SUPERVISOR', 'GROUND_STAFF',
] as const;

interface Body {
  zone_id?: string | null;
  role_code?: string | null;
  shift_id?: string | null;
  min_staff?: number;
  priority?: string;
  standards_basis?: string[];
}

coverageRulesRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  const { data, error } = await getServiceClient()
    .from('coverage_rules')
    .select('*')
    .eq('venue_id', req.auth.venue_id)
    .order('priority', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) {
    res.status(500).json({ error: { code: 'QUERY_FAILED', message: 'Could not fetch coverage rules' } });
    return;
  }
  res.json(data ?? []);
});

coverageRulesRouter.post(
  '/',
  requireRole('SH', 'DSH'),
  async (req: Request, res: Response): Promise<void> => {
    const b = req.body as Body;
    if (typeof b.min_staff !== 'number' || b.min_staff < 1) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'min_staff must be a positive integer' },
      });
      return;
    }
    if (b.priority !== undefined && !PRIORITIES.includes(b.priority as typeof PRIORITIES[number])) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: `priority must be one of ${PRIORITIES.join(', ')}` },
      });
      return;
    }
    if (b.role_code !== undefined && b.role_code !== null && !ROLE_CODES.includes(b.role_code as typeof ROLE_CODES[number])) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'invalid role_code (see staff_role_enum)' },
      });
      return;
    }

    const { data, error } = await getServiceClient()
      .from('coverage_rules')
      .insert({
        venue_id: req.auth.venue_id,
        zone_id: b.zone_id ?? null,
        role_code: b.role_code ?? null,
        shift_id: b.shift_id ?? null,
        min_staff: b.min_staff,
        priority: b.priority ?? 'MANDATORY',
        standards_basis: b.standards_basis ?? null,
        created_by: req.auth.staff_id,
      })
      .select()
      .single();

    if (error || !data) {
      // 23505 = unique_violation on (venue_id, zone_id, role_code, shift_id)
      const dup = (error as { code?: string } | null)?.code === '23505';
      res.status(dup ? 409 : 500).json({
        error: {
          code: dup ? 'DUPLICATE' : 'INSERT_FAILED',
          message: dup ? 'A rule with the same scope already exists' : error?.message ?? 'Failed',
        },
      });
      return;
    }
    res.status(201).json(data);
  },
);

coverageRulesRouter.patch(
  '/:id',
  requireRole('SH', 'DSH'),
  async (req: Request, res: Response): Promise<void> => {
    const b = req.body as Body;
    if (b.min_staff !== undefined && (typeof b.min_staff !== 'number' || b.min_staff < 1)) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'min_staff must be a positive integer' },
      });
      return;
    }
    if (b.priority !== undefined && !PRIORITIES.includes(b.priority as typeof PRIORITIES[number])) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: `priority must be one of ${PRIORITIES.join(', ')}` },
      });
      return;
    }
    if (b.role_code !== undefined && b.role_code !== null && !ROLE_CODES.includes(b.role_code as typeof ROLE_CODES[number])) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'invalid role_code' },
      });
      return;
    }

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const k of ['zone_id', 'role_code', 'shift_id', 'min_staff', 'priority', 'standards_basis'] as const) {
      if (b[k] !== undefined) update[k] = b[k];
    }

    const { data, error } = await getServiceClient()
      .from('coverage_rules')
      .update(update)
      .eq('id', req.params['id'])
      .eq('venue_id', req.auth.venue_id)
      .select()
      .single();
    if (error || !data) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Coverage rule not found' } });
      return;
    }
    res.json(data);
  },
);

coverageRulesRouter.delete(
  '/:id',
  requireRole('SH', 'DSH'),
  async (req: Request, res: Response): Promise<void> => {
    const { error } = await getServiceClient()
      .from('coverage_rules')
      .delete()
      .eq('id', req.params['id'])
      .eq('venue_id', req.auth.venue_id);
    if (error) {
      res.status(500).json({ error: { code: 'DELETE_FAILED', message: error.message } });
      return;
    }
    res.status(204).send();
  },
);
