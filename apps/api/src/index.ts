import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import pinoHttp from 'pino-http';
import { logger } from './services/logger.js';
import { getFirebaseApp } from './services/firebase.js';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { venueRouter } from './routes/venues.js';
import { staffRouter } from './routes/staff.js';
import { zonesRouter } from './routes/zones.js';
import { tasksRouter } from './routes/tasks.js';
import { incidentsRouter } from './routes/incidents.js';
import { uploadRouter } from './routes/upload.js';
import { analyticsRouter } from './routes/analytics.js';
import { equipmentRouter } from './routes/equipment.js';
import { drillsRouter } from './routes/drills.js';
import { certificationsRouter } from './routes/certifications.js';
import { shiftsRouter, shiftInstancesRouter } from './routes/shifts.js';
import { handoversRouter } from './routes/handovers.js';
import { complianceRouter } from './routes/compliance.js';
import { safetyCommitteeRouter } from './routes/safetyCommittee.js';
import { amcContractsRouter } from './routes/amcContracts.js';
import { msdsRouter } from './routes/msds.js';
import { rotationLibraryRouter } from './routes/rotationLibrary.js';
import { coverageRulesRouter } from './routes/coverageRules.js';
import { rosterPatternsRouter } from './routes/rosterPatterns.js';
import { sireRouter } from './routes/sire.js';
import { errorHandler } from './middleware/error-handler.js';

const app = express();
const PORT = parseInt(process.env['PORT'] ?? '4000', 10);

app.use(helmet());
app.use(cors({ origin: process.env['CORS_ORIGIN'] ?? '*' }));
app.use(express.json({ limit: '1mb' }));
app.use(pinoHttp({ logger }));

app.use('/health', healthRouter);
app.use('/v1/auth', authRouter);
app.use('/v1/venue', venueRouter);
app.use('/v1/staff', staffRouter);
app.use('/v1/zones', zonesRouter);
app.use('/v1/tasks', tasksRouter);
app.use('/v1/incidents', incidentsRouter);
app.use('/v1/upload', uploadRouter);
app.use('/v1/analytics', analyticsRouter);
app.use('/v1/equipment', equipmentRouter);
app.use('/v1/drill-sessions', drillsRouter);
app.use('/v1/certifications', certificationsRouter);
app.use('/v1/shifts', shiftsRouter);
app.use('/v1/shift-instances', shiftInstancesRouter);
app.use('/v1/handovers', handoversRouter);
app.use('/v1/compliance', complianceRouter);
app.use('/v1/safety-committee', safetyCommitteeRouter);
app.use('/v1/amc-contracts', amcContractsRouter);
app.use('/v1/msds', msdsRouter);
app.use('/v1/rotation-library', rotationLibraryRouter);
app.use('/v1/coverage-rules', coverageRulesRouter);
app.use('/v1/roster-patterns', rosterPatternsRouter);
app.use('/v1/sire', sireRouter);

app.use(errorHandler);

// Initialise Firebase Admin SDK at startup — fail fast if credentials are missing/invalid
try {
  getFirebaseApp();
  logger.info({ project: process.env['FIREBASE_PROJECT_ID'] }, 'Firebase Admin SDK initialised');
} catch (err) {
  logger.warn({ err }, 'Firebase Admin SDK not initialised — push notifications unavailable');
}

app.listen(PORT, () => {
  logger.info({ port: PORT, env: process.env['NODE_ENV'] }, 'SafeCommand API started');
});

export default app;
