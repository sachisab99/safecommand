/**
 * /v1/equipment routes — BR-21 Equipment & Maintenance Tracker
 *
 * Pre-written 2026-05-06 (Phase 5.9). NOT yet deployed to Railway — ships
 * with the rest of Phase B June work per JUNE-2026-REVIEW-REQUIRED.md.
 * Mount in `src/index.ts` at June deploy: `app.use('/v1/equipment', equipmentRouter)`.
 *
 * Status: COMPLETE; awaiting deploy.
 *
 * Why pre-write: the dashboard's Health Score Breakdown (Phase 5.6) has
 * an Equipment row currently rendering as "Phase B" placeholder. Once
 * this endpoint deploys, the breakdown can fetch live compliance score.
 *
 * Endpoints:
 *   GET  /v1/equipment            list active items, sorted by next_service_due
 *   GET  /v1/equipment/expiring   items due in ≤30 days (compliance focus)
 *   POST /v1/equipment            create (SH/DSH/FM only — RLS enforces)
 *   PATCH /v1/equipment/:id       update
 *   PUT  /v1/equipment/:id/status soft-deactivate / reactivate (FM/SH/DSH)
 *
 * Compliance score formula (matches Ops Console UI exactly):
 *   score = round(items_with_>90d_until_due / total_active_items * 100)
 *   total = 0 → score = 100 (no equipment registered = no compliance penalty)
 *
 * The /analytics/dashboard endpoint will be extended at the same time to
 * include equipment_score in its response. See companion edit in
 * apps/api/src/routes/analytics.ts (also pre-written, gated by deploy).
 */

import { Router, Request, Response } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { setTenantContext } from '../middleware/tenant.js';
import { getServiceClient } from '@safecommand/db';

export const equipmentRouter = Router();
equipmentRouter.use(requireAuth, setTenantContext);

interface EquipmentItemRow {
  id: string;
  venue_id: string;
  name: string;
  category: string;
  location_description: string | null;
  last_serviced_at: string | null;
  next_service_due: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  building_id: string | null;
}

equipmentRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  const { data, error } = await getServiceClient()
    .from('equipment_items')
    .select('*')
    .eq('venue_id', req.auth.venue_id)
    .eq('is_active', true)
    .order('next_service_due', { ascending: true });

  if (error) {
    res.status(500).json({ error: { code: 'QUERY_FAILED', message: 'Could not fetch equipment' } });
    return;
  }
  res.json(data ?? []);
});

/** Items due in ≤30 days — focus list for compliance dashboards */
equipmentRouter.get('/expiring', async (req: Request, res: Response): Promise<void> => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + 30);
  const cutoffDate = cutoff.toISOString().slice(0, 10);

  const { data, error } = await getServiceClient()
    .from('equipment_items')
    .select('*')
    .eq('venue_id', req.auth.venue_id)
    .eq('is_active', true)
    .lte('next_service_due', cutoffDate)
    .order('next_service_due', { ascending: true });

  if (error) {
    res.status(500).json({
      error: { code: 'QUERY_FAILED', message: 'Could not fetch expiring equipment' },
    });
    return;
  }
  res.json(data ?? []);
});

equipmentRouter.post(
  '/',
  requireRole('SH', 'DSH', 'FM'),
  async (req: Request, res: Response): Promise<void> => {
    const body = req.body as Partial<EquipmentItemRow>;
    if (!body.name || !body.category || !body.next_service_due) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'name, category, next_service_due required',
        },
      });
      return;
    }

    const { data, error } = await getServiceClient()
      .from('equipment_items')
      .insert({
        venue_id: req.auth.venue_id,
        name: body.name,
        category: body.category,
        location_description: body.location_description ?? null,
        last_serviced_at: body.last_serviced_at ?? null,
        next_service_due: body.next_service_due,
        building_id: body.building_id ?? null,
        is_active: true,
      })
      .select()
      .single();

    if (error || !data) {
      res.status(500).json({ error: { code: 'INSERT_FAILED', message: error?.message ?? 'Failed' } });
      return;
    }
    res.status(201).json(data);
  },
);

equipmentRouter.patch(
  '/:id',
  requireRole('SH', 'DSH', 'FM'),
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'];
    if (!id) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'id required' } });
      return;
    }

    const body = req.body as Partial<EquipmentItemRow>;
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) update['name'] = body.name;
    if (body.category !== undefined) update['category'] = body.category;
    if (body.location_description !== undefined)
      update['location_description'] = body.location_description;
    if (body.last_serviced_at !== undefined) update['last_serviced_at'] = body.last_serviced_at;
    if (body.next_service_due !== undefined) update['next_service_due'] = body.next_service_due;

    const { data, error } = await getServiceClient()
      .from('equipment_items')
      .update(update)
      .eq('id', id)
      .eq('venue_id', req.auth.venue_id)
      .select()
      .single();

    if (error || !data) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Equipment not found' } });
      return;
    }
    res.json(data);
  },
);

equipmentRouter.put(
  '/:id/status',
  requireRole('SH', 'DSH', 'FM'),
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'];
    const { is_active } = req.body as { is_active?: boolean };
    if (typeof is_active !== 'boolean' || !id) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'is_active boolean required' },
      });
      return;
    }

    const { data, error } = await getServiceClient()
      .from('equipment_items')
      .update({ is_active, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('venue_id', req.auth.venue_id)
      .select()
      .single();

    if (error || !data) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Equipment not found' } });
      return;
    }
    res.json(data);
  },
);
