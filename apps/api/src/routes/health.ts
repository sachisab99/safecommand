import { Router } from 'express';
import { getServiceClient } from '@safecommand/db';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  let dbStatus: 'ok' | 'error' = 'ok';
  try {
    const { error } = await getServiceClient().from('venues').select('id').limit(1);
    if (error) dbStatus = 'error';
  } catch {
    dbStatus = 'error';
  }

  const status = dbStatus === 'ok' ? 200 : 503;
  res.status(status).json({
    status: status === 200 ? 'ok' : 'degraded',
    service: 'safecommand-api',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
    checks: { database: dbStatus },
  });
});
