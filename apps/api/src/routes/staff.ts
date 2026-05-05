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

// Roles that an SH/DSH can add to their venue. Excludes peer/higher roles
// (SH, GM, AUDITOR) to prevent privilege escalation. SC Ops Console retains
// full role-creation authority via service-role key (which bypasses this
// route entirely).
//
// Per Plan §11 Role × Permission Matrix — "Add / remove staff" = FULL for
// SH and DSH only. The allow-list below scopes WHICH roles they can add.
//
// BR-13 — DSH activation (manual / auto-emergency / pre-scheduled) is an
// SH-only privilege; SH adds the DSH record here, but the activation flow
// is a separate endpoint.
const SH_DSH_CREATABLE_ROLES = new Set([
  'DSH',
  'SHIFT_COMMANDER',
  'FLOOR_SUPERVISOR',
  'GROUND_STAFF',
  'FM',
]);

staffRouter.post(
  '/',
  // SH OR DSH can add staff. DSH per BR-13 has full SH authority when activated.
  requireRole('SH', 'DSH'),
  validate(CreateStaffSchema),
  auditLog('STAFF_CREATE'),
  async (req: Request, res: Response): Promise<void> => {
    const { phone, name, role } = req.body as { phone: string; name: string; role: string };

    // Role allow-list — server-side enforcement (NFR-01 / EC-03 — never trust client).
    // Even if Zod accepts the role enum value, the route restricts which subset
    // SH/DSH may create. SC Ops Console uses service-role and skips this route.
    if (!SH_DSH_CREATABLE_ROLES.has(role)) {
      res.status(403).json({
        error: {
          code: 'ROLE_NOT_ALLOWED',
          message: `Cannot create staff with role "${role}". Allowed roles: ${[...SH_DSH_CREATABLE_ROLES].join(', ')}.`,
        },
      });
      return;
    }

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
