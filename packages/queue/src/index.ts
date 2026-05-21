import { Queue, QueueOptions } from 'bullmq';
import Redis from 'ioredis';
import type {
  ScheduleGenerationJob,
  EscalationJob,
  NotificationJob,
  IncidentEscalationJob,
  RosterMaterialisationJob,
} from '@safecommand/types';

export const QUEUE_NAMES = {
  SCHEDULE_GENERATION: 'schedule-generation',
  ESCALATIONS: 'escalations',
  NOTIFICATIONS: 'notifications',
  INCIDENT_ESCALATIONS: 'incident-escalations',
  ROSTER_MATERIALISATION: 'roster-materialisation',
} as const;

let _redis: Redis | null = null;

export function getRedisConnection(): Redis {
  if (!_redis) {
    const url = process.env['SC_REDIS_URL'] ?? process.env['REDIS_URL'];
    if (!url) throw new Error('SC_REDIS_URL must be set');
    _redis = new Redis(url, {
      maxRetriesPerRequest: null,
      tls: url.startsWith('rediss://') ? {} : undefined,
    });
  }
  return _redis;
}

function makeQueueOptions(priority?: number): QueueOptions {
  return {
    connection: getRedisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { age: 3600, count: 1000 },
      removeOnFail: { age: 86400 },
      ...(priority !== undefined && { priority }),
    },
  };
}

export const scheduleGenerationQueue = new Queue<ScheduleGenerationJob>(
  QUEUE_NAMES.SCHEDULE_GENERATION,
  makeQueueOptions(),
);

export const escalationsQueue = new Queue<EscalationJob>(
  QUEUE_NAMES.ESCALATIONS,
  makeQueueOptions(1),
);

export const notificationsQueue = new Queue<NotificationJob>(
  QUEUE_NAMES.NOTIFICATIONS,
  makeQueueOptions(),
);

export const incidentEscalationsQueue = new Queue<IncidentEscalationJob>(
  QUEUE_NAMES.INCIDENT_ESCALATIONS,
  makeQueueOptions(0),
);

// BR-AO Roster Materialisation queue — Pattern Engine Pass 3b.
// Consumer: apps/scheduler/src/roster-materialisation.ts.
// Lower priority (2) than escalations / incidents — these are not life-safety jobs.
// Worker-paused per ADR 0005 until 2026-06-01 — jobs accumulate in Redis and
// drain when WORKERS_PAUSED=false. removeOnComplete kept to limit Redis growth
// during the paused window.
export const rosterMaterialisationQueue = new Queue<RosterMaterialisationJob>(
  QUEUE_NAMES.ROSTER_MATERIALISATION,
  makeQueueOptions(2),
);

export { Queue, Redis };
export type {
  ScheduleGenerationJob,
  EscalationJob,
  NotificationJob,
  IncidentEscalationJob,
  RosterMaterialisationJob,
};
