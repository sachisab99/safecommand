import { Router, Request, Response } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { setTenantContext } from '../middleware/tenant.js';
import { validate } from '../middleware/validate.js';
import { auditLog } from '../middleware/audit.js';
import { getServiceClient } from '@safecommand/db';
import { FestivalModeSchema } from '@safecommand/schemas';

export const venueRouter = Router();
venueRouter.use(requireAuth, setTenantContext);

venueRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  const { data, error } = await getServiceClient()
    .from('venues')
    .select('*')
    .eq('id', req.auth.venue_id)
    .single();

  if (error || !data) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Venue not found' } });
    return;
  }
  res.json(data);
});

venueRouter.get('/health-score', async (req: Request, res: Response): Promise<void> => {
  const { data, error } = await getServiceClient()
    .rpc('compute_venue_health_score', { p_venue_id: req.auth.venue_id });

  if (error) {
    res.status(500).json({ error: { code: 'COMPUTE_FAILED', message: 'Could not compute health score' } });
    return;
  }
  res.json(data);
});

venueRouter.put(
  '/festival-mode',
  requireRole('SH', 'DSH', 'GM'),
  validate(FestivalModeSchema),
  auditLog('FESTIVAL_MODE_TOGGLE'),
  async (req: Request, res: Response): Promise<void> => {
    const { active } = req.body as { active: boolean };
    const { error } = await getServiceClient()
      .from('venues')
      .update({ festival_mode: active, updated_at: new Date().toISOString() })
      .eq('id', req.auth.venue_id);

    if (error) {
      res.status(500).json({ error: { code: 'UPDATE_FAILED', message: 'Could not update festival mode' } });
      return;
    }
    res.json({ festival_mode: active });
  },
);
