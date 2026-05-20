/**
 * /v1/rotation-library — BR-AM Rotation Cycle Library (read-only).
 *
 * Spec source: Architecture Roster v1 §6.4. Library is global (mig 022
 * seeded 7 built-ins — `4_ON_2_OFF`, `2_2_3` Pitman, `WEEKLY_DAY_NIGHT`,
 * `CONTINENTAL`, `4_DAY_NIGHT_4_OFF`, `STANDARD_OFFICE`, `STANDARD_6_DAY`).
 * Any authenticated user can read. SC-Ops CUSTOM rotation create/edit
 * deferred to Pass 2 (rarely used; not pilot-critical).
 *
 *   GET /v1/rotation-library?factories_act_compliant=true
 *     → array of rotation cycles. Auth: any authenticated user.
 *
 * RLS: `auth_read_all` policy on `rotation_cycle_library` (mig 024)
 * permits SELECT for the authenticated role; anon REVOKE'd.
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { setTenantContext } from '../middleware/tenant.js';
import { getServiceClient } from '@safecommand/db';

export const rotationLibraryRouter = Router();
rotationLibraryRouter.use(requireAuth, setTenantContext);

rotationLibraryRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  const factOnly = String(req.query['factories_act_compliant'] ?? '').toLowerCase() === 'true';

  let query = getServiceClient()
    .from('rotation_cycle_library')
    .select('code, name, description, cycle_length_days, day_pattern, is_built_in, factories_act_compliant, standards_basis')
    .order('cycle_length_days', { ascending: true })
    .order('code', { ascending: true });

  if (factOnly) query = query.eq('factories_act_compliant', true);

  const { data, error } = await query;
  if (error) {
    res.status(500).json({
      error: { code: 'QUERY_FAILED', message: 'Could not fetch rotation library' },
    });
    return;
  }
  res.json(data ?? []);
});
