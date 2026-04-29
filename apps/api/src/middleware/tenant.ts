import { Request, Response, NextFunction } from 'express';
import { getServiceClient } from '@safecommand/db';

export async function setTenantContext(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { venue_id, staff_id, role } = req.auth;
    const { error } = await getServiceClient().rpc('set_tenant_context', {
      p_venue_id: venue_id,
      p_staff_id: staff_id,
      p_role: role,
    });
    if (error) {
      res.status(500).json({ error: { code: 'TENANT_CTX_ERROR', message: 'Failed to set session context' } });
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
}
