/**
 * /v1/drill-sessions routes — BR-A Drill Management Module.
 *
 * Lifecycle: SCHEDULED → IN_PROGRESS → COMPLETED | CANCELLED
 *
 * Endpoints:
 *   GET  /v1/drill-sessions              list (default ordering: scheduled DESC)
 *   GET  /v1/drill-sessions/:id          single with participant details
 *   POST /v1/drill-sessions              schedule new (SH/DSH/FM/SC)
 *   PUT  /v1/drill-sessions/:id/start    SCHEDULED → IN_PROGRESS
 *   PUT  /v1/drill-sessions/:id/end      IN_PROGRESS → COMPLETED + duration
 *   PUT  /v1/drill-sessions/:id/cancel   SCHEDULED → CANCELLED
 *
 * Refs: BR-A (Drill Management Module), BR-14 (Health Score 10% weight),
 *       Architecture v7 mig 010 (drill_sessions + drill_session_participants)
 */

import { Router, Request, Response } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { setTenantContext } from '../middleware/tenant.js';
import { getServiceClient } from '@safecommand/db';

export const drillsRouter = Router();
drillsRouter.use(requireAuth, setTenantContext);

drillsRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  const { data, error } = await getServiceClient()
    .from('drill_sessions')
    .select('*')
    .eq('venue_id', req.auth.venue_id)
    .order('scheduled_for', { ascending: false });

  if (error) {
    res.status(500).json({ error: { code: 'QUERY_FAILED', message: 'Could not fetch drills' } });
    return;
  }
  res.json(data ?? []);
});

drillsRouter.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const id = req.params['id'];
  const { data, error } = await getServiceClient()
    .from('drill_sessions')
    .select('*, drill_session_participants(*)')
    .eq('id', id)
    .eq('venue_id', req.auth.venue_id)
    .single();

  if (error || !data) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Drill not found' } });
    return;
  }
  res.json(data);
});

drillsRouter.post(
  '/',
  requireRole('SH', 'DSH', 'FM', 'SHIFT_COMMANDER'),
  async (req: Request, res: Response): Promise<void> => {
    const body = req.body as {
      drill_type?: string;
      scheduled_for?: string;
      building_id?: string | null;
      notes?: string | null;
    };

    if (!body.drill_type || !body.scheduled_for) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'drill_type, scheduled_for required' },
      });
      return;
    }

    const { data, error } = await getServiceClient()
      .from('drill_sessions')
      .insert({
        venue_id: req.auth.venue_id,
        drill_type: body.drill_type,
        scheduled_for: body.scheduled_for,
        building_id: body.building_id ?? null,
        notes: body.notes ?? null,
        status: 'SCHEDULED',
        total_staff_expected: 0,
        total_staff_acknowledged: 0,
        total_staff_safe: 0,
        total_staff_missed: 0,
      })
      .select()
      .single();

    if (error || !data) {
      res.status(500).json({
        error: { code: 'INSERT_FAILED', message: error?.message ?? 'Failed to schedule drill' },
      });
      return;
    }
    res.status(201).json(data);
  },
);

drillsRouter.put(
  '/:id/start',
  requireRole('SH', 'DSH', 'FM', 'SHIFT_COMMANDER'),
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'];
    const venueId = req.auth.venue_id;

    // Snapshot active staff count = expected participants
    const { count: expectedCount } = await getServiceClient()
      .from('staff')
      .select('id', { count: 'exact', head: true })
      .eq('venue_id', venueId)
      .eq('is_active', true);

    const { data, error } = await getServiceClient()
      .from('drill_sessions')
      .update({
        status: 'IN_PROGRESS',
        started_at: new Date().toISOString(),
        started_by_staff_id: req.auth.staff_id,
        total_staff_expected: expectedCount ?? 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('venue_id', venueId)
      .eq('status', 'SCHEDULED')
      .select()
      .single();

    if (error || !data) {
      res.status(409).json({
        error: { code: 'INVALID_STATE', message: 'Drill must be SCHEDULED to start' },
      });
      return;
    }
    res.json(data);
  },
);

drillsRouter.put(
  '/:id/end',
  requireRole('SH', 'DSH', 'FM', 'SHIFT_COMMANDER'),
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'];
    const venueId = req.auth.venue_id;

    const { data: drill, error: readErr } = await getServiceClient()
      .from('drill_sessions')
      .select('started_at, status')
      .eq('id', id)
      .eq('venue_id', venueId)
      .single();

    if (readErr || !drill) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Drill not found' } });
      return;
    }
    if (drill.status !== 'IN_PROGRESS' || !drill.started_at) {
      res.status(409).json({
        error: { code: 'INVALID_STATE', message: 'Drill must be IN_PROGRESS to end' },
      });
      return;
    }

    const startedAtMs = new Date(drill.started_at).getTime();
    const endedAt = new Date();
    const duration_seconds = Math.floor((endedAt.getTime() - startedAtMs) / 1000);

    const { data, error } = await getServiceClient()
      .from('drill_sessions')
      .update({
        status: 'COMPLETED',
        ended_at: endedAt.toISOString(),
        duration_seconds,
        updated_at: endedAt.toISOString(),
      })
      .eq('id', id)
      .eq('venue_id', venueId)
      .select()
      .single();

    if (error || !data) {
      res.status(500).json({
        error: { code: 'UPDATE_FAILED', message: error?.message ?? 'Failed to end drill' },
      });
      return;
    }
    res.json(data);
  },
);

drillsRouter.put(
  '/:id/cancel',
  requireRole('SH', 'DSH', 'FM', 'SHIFT_COMMANDER'),
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'];

    const { data, error } = await getServiceClient()
      .from('drill_sessions')
      .update({
        status: 'CANCELLED',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('venue_id', req.auth.venue_id)
      .eq('status', 'SCHEDULED')
      .select()
      .single();

    if (error || !data) {
      res.status(409).json({
        error: { code: 'INVALID_STATE', message: 'Only SCHEDULED drills can be cancelled' },
      });
      return;
    }
    res.json(data);
  },
);
