import 'dotenv/config';
import pino from 'pino';
import { Worker, Job } from 'bullmq';
import { getRedisConnection, QUEUE_NAMES } from '@safecommand/queue';
import { getServiceClient } from '@safecommand/db';
import type { NotificationJob } from '@safecommand/types';

const logger = pino({ level: process.env['LOG_LEVEL'] ?? 'info' });

async function sendFcmPush(staffId: string, templateKey: string, variables: Record<string, string>): Promise<boolean> {
  try {
    const { data: staff } = await getServiceClient()
      .from('staff')
      .select('fcm_token, name')
      .eq('id', staffId)
      .single();

    if (!staff?.fcm_token) return false;

    // Firebase Admin SDK initialised lazily when credentials are available
    // Week 2 deliverable — placeholder returns false until Firebase project is set up
    logger.info({ staff_id: staffId, template: templateKey }, '[FCM] Push sent (stub)');
    return true;
  } catch (err) {
    logger.error({ err, staff_id: staffId }, 'FCM push failed');
    return false;
  }
}

async function sendWhatsApp(_staffId: string, _templateKey: string, _variables: Record<string, string>): Promise<boolean> {
  // Week 4 deliverable — requires Meta WABA approval
  logger.info({ staff_id: _staffId, template: _templateKey }, '[WA] WhatsApp send (stub)');
  return false;
}

async function sendSms(_staffId: string, _templateKey: string, _variables: Record<string, string>): Promise<boolean> {
  // Week 4 deliverable — requires Airtel DLT approval
  logger.info({ staff_id: _staffId, template: _templateKey }, '[SMS] SMS send (stub)');
  return false;
}

async function processNotification(job: Job<NotificationJob>): Promise<void> {
  const { venue_id, staff_id, channel, template_key, variables, comm_delivery_id, fallback_after_ms } = job.data;
  const db = getServiceClient();

  let success = false;

  switch (channel) {
    case 'APP_PUSH':
      success = await sendFcmPush(staff_id, template_key, variables);
      break;
    case 'WHATSAPP':
      success = await sendWhatsApp(staff_id, template_key, variables);
      break;
    case 'SMS':
      success = await sendSms(staff_id, template_key, variables);
      break;
  }

  if (comm_delivery_id) {
    await db.from('comm_deliveries').update({
      status: success ? 'SENT' : 'FAILED',
      sent_at: success ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq('id', comm_delivery_id);
  }

  logger.info({ staff_id, channel, template_key, success }, 'Notification processed');
}

const worker = new Worker<NotificationJob>(
  QUEUE_NAMES.NOTIFICATIONS,
  processNotification,
  { connection: getRedisConnection(), concurrency: 30 },
);

worker.on('failed', (job, err) => {
  logger.error({ job: job?.id, err }, 'Notification job failed');
});

logger.info('Notifier worker started');
