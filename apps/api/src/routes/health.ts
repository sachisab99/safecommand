import { Router } from 'express';
import { getServiceClient } from '@safecommand/db';
import { getFirebaseApp } from '../services/firebase.js';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  let dbStatus: 'ok' | 'error' = 'ok';
  try {
    const { error } = await getServiceClient().from('venues').select('id').limit(1);
    if (error) dbStatus = 'error';
  } catch {
    dbStatus = 'error';
  }

  let firebaseStatus: 'ok' | 'error' = 'ok';
  try {
    getFirebaseApp(); // throws if not initialised
  } catch {
    firebaseStatus = 'error';
  }

  const allOk = dbStatus === 'ok' && firebaseStatus === 'ok';
  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ok' : 'degraded',
    service: 'safecommand-api',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
    checks: { database: dbStatus, firebase: firebaseStatus },
  });
});
