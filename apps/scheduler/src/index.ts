import 'dotenv/config';
import pino from 'pino';
import { Worker, Job } from 'bullmq';
import { getRedisConnection, QUEUE_NAMES, notificationsQueue } from '@safecommand/queue';
import { getServiceClient } from '@safecommand/db';
import type { ScheduleGenerationJob } from '@safecommand/types';

const logger = pino({ level: process.env['LOG_LEVEL'] ?? 'info' });

const FREQUENCY_WINDOW_MINUTES: Record<string, number> = {
  HOURLY: 60,
  EVERY_2H: 120,
  EVERY_4H: 240,
  EVERY_6H: 360,
  EVERY_8H: 480,
  DAILY: 1440,
  WEEKLY: 10080,
  MONTHLY: 43200,
  QUARTERLY: 129600,
  ANNUAL: 525600,
};

async function processScheduleTick(job: Job<ScheduleGenerationJob>): Promise<void> {
  const { venue_id, template_id, tick_at } = job.data;
  const db = getServiceClient();

  const { data: template, error: tError } = await db
    .from('schedule_templates')
    .select('id, frequency, assigned_role, escalation_interval_minutes')
    .eq('id', template_id)
    .eq('venue_id', venue_id)
    .eq('is_active', true)
    .single();

  if (tError || !template) {
    logger.warn({ template_id, venue_id }, 'Template not found or inactive — skipping');
    return;
  }

  const dueAt = new Date(tick_at);
  const windowMinutes = FREQUENCY_WINDOW_MINUTES[template.frequency] ?? 60;
  const expiresAt = new Date(dueAt.getTime() + windowMinutes * 60 * 1000);
  const idempotencyKey = `${template_id}::${tick_at}`;

  const { error: insertError } = await db.from('task_instances').insert({
    venue_id,
    template_id,
    status: 'PENDING',
    due_at: dueAt.toISOString(),
    window_expires_at: expiresAt.toISOString(),
    idempotency_key: idempotencyKey,
  });

  if (insertError) {
    if (insertError.code === '23505') {
      logger.debug({ idempotencyKey }, 'Task already exists — idempotent skip');
      return;
    }
    throw new Error(`Failed to insert task_instance: ${insertError.message}`);
  }

  logger.info({ venue_id, template_id, due_at: dueAt }, 'Task instance created');
}

const worker = new Worker<ScheduleGenerationJob>(
  QUEUE_NAMES.SCHEDULE_GENERATION,
  processScheduleTick,
  {
    connection: getRedisConnection(),
    concurrency: 20,
  },
);

worker.on('failed', (job, err) => {
  logger.error({ job: job?.id, err }, 'Schedule job failed');
});

logger.info('Scheduler worker started');
