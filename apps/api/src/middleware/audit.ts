import { Request, Response, NextFunction } from 'express';
import { getServiceClient } from '@safecommand/db';
import { logger } from '../services/logger.js';

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function auditLog(action: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!MUTATION_METHODS.has(req.method)) {
      next();
      return;
    }

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode >= 200 && res.statusCode < 300 && req.auth) {
        const { venue_id, staff_id, role } = req.auth;
        getServiceClient()
          .from('audit_logs')
          .insert({
            venue_id,
            actor_staff_id: staff_id,
            actor_role: role,
            action,
            entity_type: req.path.split('/')[1] ?? 'unknown',
            entity_id: (body as Record<string, unknown>)?.['id'] as string | null,
            metadata: { method: req.method, path: req.path, status: res.statusCode },
            ip_address: req.ip,
          })
          .then(({ error }) => {
            if (error) logger.error({ error, action }, 'Audit log write failed');
          });
      }
      return originalJson(body);
    };

    next();
  };
}
