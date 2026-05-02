import 'dotenv/config';
import pino from 'pino';
import { Worker, Job } from 'bullmq';
import { getRedisConnection, QUEUE_NAMES, notificationsQueue } from '@safecommand/queue';
import { getServiceClient } from '@safecommand/db';
import type { EscalationJob, IncidentEscalationJob } from '@safecommand/types';

const logger = pino({ level: process.env['LOG_LEVEL'] ?? 'info' });

async function processEscalation(job: Job<EscalationJob>): Promise<void> {
  const { task_instance_id, venue_id, level, escalation_chain } = job.data;
  const db = getServiceClient();

  const { data: task } = await db
    .from('task_instances')
    .select('status, template_id')
    .eq('id', task_instance_id)
    .single();

  if (!task || ['COMPLETE', 'LATE_COMPLETE'].includes(task.status)) {
    logger.info({ task_instance_id }, 'Task already completed — skip escalation');
    return;
  }

  const escalateToRole = escalation_chain[level];
  if (!escalateToRole) {
    logger.warn({ task_instance_id, level }, 'Escalation chain exhausted');
    return;
  }

  await db.from('task_instances').update({ status: 'ESCALATED', updated_at: new Date().toISOString() }).eq('id', task_instance_id);
  await db.from('escalation_events').insert({
    venue_id,
    task_instance_id,
    level,
    escalated_to_role: escalateToRole,
    escalated_at: new Date().toISOString(),
  });

  const { data: staffList } = await db
    .from('staff')
    .select('id')
    .eq('venue_id', venue_id)
    .eq('role', escalateToRole)
    .eq('is_active', true);

  for (const staff of staffList ?? []) {
    const { data: delivery, error: deliveryErr } = await db
      .from('comm_deliveries')
      .insert({
        venue_id,
        source_type: 'ESCALATION',
        source_id: task_instance_id,
        recipient_staff_id: staff.id,
        channel: 'APP_PUSH',
        status: 'PENDING',
      })
      .select('id')
      .single();
    if (deliveryErr) {
      logger.warn({ staff_id: staff.id, task_id: task_instance_id, err: deliveryErr.message }, 'comm_deliveries insert failed — notification still fires');
    }

    await notificationsQueue.add(`notify-${task_instance_id}-l${level}`, {
      venue_id,
      staff_id: staff.id,
      channel: 'APP_PUSH',
      template_key: 'escalation_alert',
      variables: { task_id: task_instance_id, level: String(level), role: escalateToRole },
      comm_delivery_id: delivery?.id,
    });
  }

  logger.info({ task_instance_id, level, role: escalateToRole }, 'Escalation processed');
}

async function processIncidentEscalation(job: Job<IncidentEscalationJob>): Promise<void> {
  const { incident_id, venue_id } = job.data;
  const db = getServiceClient();

  const { data: onDutyStaff } = await db
    .from('staff')
    .select('id, role, fcm_token')
    .eq('venue_id', venue_id)
    .eq('is_active', true);

  for (const staff of onDutyStaff ?? []) {
    const { data: delivery, error: deliveryErr } = await db
      .from('comm_deliveries')
      .insert({
        venue_id,
        source_type: 'INCIDENT',
        source_id: incident_id,
        recipient_staff_id: staff.id,
        channel: 'APP_PUSH',
        status: 'PENDING',
      })
      .select('id')
      .single();
    if (deliveryErr) {
      logger.warn({ staff_id: staff.id, incident_id, err: deliveryErr.message }, 'comm_deliveries insert failed — notification still fires');
    }

    await notificationsQueue.add(`incident-notify-${incident_id}-${staff.id}`, {
      venue_id,
      staff_id: staff.id,
      channel: 'APP_PUSH',
      template_key: 'incident_alert',
      variables: { incident_id },
      comm_delivery_id: delivery?.id,
      fallback_after_ms: 90_000,
    }, { priority: 0 });
  }

  logger.info({ incident_id, venue_id, staff_count: onDutyStaff?.length ?? 0 }, 'Incident notifications enqueued');
}

const taskEscalationWorker = new Worker<EscalationJob>(
  QUEUE_NAMES.ESCALATIONS,
  processEscalation,
  {
    connection: getRedisConnection(),
    concurrency: 10,
    drainDelay: 300,           // block 5 min on empty queue — see upstash_redis.md
    stalledInterval: 300_000,  // 5 min stalled check
  },
);

const incidentWorker = new Worker<IncidentEscalationJob>(
  QUEUE_NAMES.INCIDENT_ESCALATIONS,
  processIncidentEscalation,
  {
    connection: getRedisConnection(),
    concurrency: 5,
    drainDelay: 300,
    stalledInterval: 300_000,
  },
);

taskEscalationWorker.on('failed', (job, err) => {
  logger.error({ job: job?.id, err }, 'Escalation job failed');
});

incidentWorker.on('failed', (job, err) => {
  logger.error({ job: job?.id, err }, 'Incident escalation job failed');
});

logger.info('Escalation worker started');
