import { Queue, QueueOptions } from 'bullmq';
import Redis from 'ioredis';
import type {
  ScheduleGenerationJob,
  EscalationJob,
  NotificationJob,
  IncidentEscalationJob,
} from '@safecommand/types';

export const QUEUE_NAMES = {
  SCHEDULE_GENERATION: 'schedule-generation',
  ESCALATIONS: 'escalations',
  NOTIFICATIONS: 'notifications',
  INCIDENT_ESCALATIONS: 'incident-escalations',
} as const;

let _redis: Redis | null = null;

export function getRedisConnection(): Redis {
  if (!_redis) {
    const url = process.env['REDIS_URL'];
    if (!url) throw new Error('REDIS_URL must be set');
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

export { Queue, Redis };
export type { ScheduleGenerationJob, EscalationJob, NotificationJob, IncidentEscalationJob };
