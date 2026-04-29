import { Router, Request, Response } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { setTenantContext } from '../middleware/tenant.js';
import { validate } from '../middleware/validate.js';
import { auditLog } from '../middleware/audit.js';
import { getServiceClient } from '@safecommand/db';
import { UpdateZoneStatusSchema } from '@safecommand/schemas';

export const zonesRouter = Router();
zonesRouter.use(requireAuth, setTenantContext);

zonesRouter.get('/accountability', async (req: Request, res: Response): Promise<void> => {
  const { data, error } = await getServiceClient()
    .from('zones')
    .select('id, name, zone_type, current_status, two_person_required, staff_zone_assignments(staff(id, name, role))')
    .eq('venue_id', req.auth.venue_id)
    .order('name');

  if (error) {
    res.status(500).json({ error: { code: 'QUERY_FAILED', message: 'Could not fetch zone accountability' } });
    return;
  }
  res.json(data);
});

zonesRouter.put(
  '/:id/status',
  requireRole('SH', 'DSH', 'SHIFT_COMMANDER', 'GM'),
  validate(UpdateZoneStatusSchema),
  auditLog('ZONE_STATUS_UPDATE'),
  async (req: Request, res: Response): Promise<void> => {
    const { status } = req.body as { status: string };
    const zoneId = req.params['id'];

    const { data, error } = await getServiceClient()
      .from('zones')
      .update({ current_status: status, updated_at: new Date().toISOString() })
      .eq('id', zoneId)
      .eq('venue_id', req.auth.venue_id)
      .select()
      .single();

    if (error || !data) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Zone not found' } });
      return;
    }

    await getServiceClient().from('zone_status_log').insert({
      venue_id: req.auth.venue_id,
      zone_id: zoneId,
      status,
      changed_by_staff_id: req.auth.staff_id,
    });

    res.json(data);
  },
);
