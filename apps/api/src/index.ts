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
