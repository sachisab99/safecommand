import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { AuthContext, StaffRole } from '@safecommand/types';

declare global {
  namespace Express {
    interface Request {
      auth: AuthContext;
    }
  }
}

const ROLE_HIERARCHY: Record<StaffRole, number> = {
  SH: 8,
  DSH: 7,
  GM: 6,
  AUDITOR: 5,
  SHIFT_COMMANDER: 4,
  FM: 3,
  FLOOR_SUPERVISOR: 2,
  GROUND_STAFF: 1,
};

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Missing bearer token' } });
    return;
  }

  const token = header.slice(7);
  const secret = process.env['JWT_SECRET'];
  if (!secret) throw new Error('JWT_SECRET not configured');

  try {
    const payload = jwt.verify(token, secret) as AuthContext & { sub: string };
    req.auth = {
      firebase_uid: payload.sub,
      venue_id: payload.venue_id,
      staff_id: payload.staff_id,
      role: payload.role,
    };
    next();
  } catch {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } });
  }
}

export function requireRole(...roles: StaffRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!roles.includes(req.auth.role)) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Insufficient permissions for this action' },
      });
      return;
    }
    next();
  };
}

export function requireMinRole(minRole: StaffRole) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const userLevel = ROLE_HIERARCHY[req.auth.role] ?? 0;
    const minLevel = ROLE_HIERARCHY[minRole] ?? 0;
    if (userLevel < minLevel) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Insufficient role level for this action' },
      });
      return;
    }
    next();
  };
}
