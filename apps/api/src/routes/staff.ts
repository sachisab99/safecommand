import { Router, Request, Response } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { setTenantContext } from '../middleware/tenant.js';
import { validate } from '../middleware/validate.js';
import { auditLog } from '../middleware/audit.js';
import { getServiceClient } from '@safecommand/db';
import { CreateStaffSchema, UpdateStaffSchema } from '@safecommand/schemas';

export const staffRouter = Router();
staffRouter.use(requireAuth, setTenantContext);

staffRouter.get('/', requireRole('SH', 'DSH', 'GM', 'AUDITOR'), async (req: Request, res: Response): Promise<void> => {
  const { data, error } = await getServiceClient()
    .from('staff')
    .select('id, name, phone, role, is_active, created_at')
    .eq('venue_id', req.auth.venue_id)
    .order('name');

  if (error) {
    res.status(500).json({ error: { code: 'QUERY_FAILED', message: 'Could not fetch staff' } });
    return;
  }
  res.json(data);
});

staffRouter.get('/on-duty', async (req: Request, res: Response): Promise<void> => {
  const { data, error } = await getServiceClient()
    .from('staff')
    .select('id, name, role, staff_zone_assignments(zone_id, assignment_type)')
    .eq('venue_id', req.auth.venue_id)
    .eq('is_active', true);

  if (error) {
    res.status(500).json({ error: { code: 'QUERY_FAILED', message: 'Could not fetch on-duty staff' } });
    return;
  }
  res.json(data);
});

staffRouter.post(
  '/',
  requireRole('SH'),
  validate(CreateStaffSchema),
  auditLog('STAFF_CREATE'),
  async (req: Request, res: Response): Promise<void> => {
    const { phone, name, role } = req.body as { phone: string; name: string; role: string };

    const { data, error } = await getServiceClient()
      .from('staff')
      .insert({ venue_id: req.auth.venue_id, phone, name, role })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        res.status(409).json({ error: { code: 'DUPLICATE_PHONE', message: 'A staff member with this phone number already exists' } });
        return;
      }
      res.status(500).json({ error: { code: 'CREATE_FAILED', message: 'Could not create staff member' } });
      return;
    }
    res.status(201).json(data);
  },
);

staffRouter.patch(
  '/:id',
  requireRole('SH'),
  validate(UpdateStaffSchema),
  auditLog('STAFF_UPDATE'),
  async (req: Request, res: Response): Promise<void> => {
    const { data, error } = await getServiceClient()
      .from('staff')
      .update({ ...req.body, updated_at: new Date().toISOString() })
      .eq('id', req.params['id'])
      .eq('venue_id', req.auth.venue_id)
      .select()
      .single();

    if (error || !data) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Staff member not found' } });
      return;
    }
    res.json(data);
  },
);
