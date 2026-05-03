import 'dotenv/config';
import pino from 'pino';
import { Worker, Job } from 'bullmq';
import admin from 'firebase-admin';
import { getRedisConnection, QUEUE_NAMES } from '@safecommand/queue';
import { getServiceClient } from '@safecommand/db';
import type { NotificationJob } from '@safecommand/types';

const logger = pino({ level: process.env['LOG_LEVEL'] ?? 'info' });

/* ─── Firebase Admin init ────────────────────────────────────────────────── */

let _firebaseReady = false;

function initFirebase(): void {
  const projectId   = process.env['FIREBASE_PROJECT_ID'];
  const clientEmail = process.env['FIREBASE_CLIENT_EMAIL'];
  const privateKey  = process.env['FIREBASE_PRIVATE_KEY'];
  if (!projectId || !clientEmail || !privateKey) {
    logger.warn('Firebase env vars not set — FCM push will be skipped');
    return;
  }
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, '\n'),
      }),
    });
    _firebaseReady = true;
    logger.info('Firebase Admin initialised');
  } catch (err) {
    logger.error({ err }, 'Firebase Admin init failed — FCM push will be skipped');
  }
}

initFirebase();

/* ─── Push message templates ─────────────────────────────────────────────── */

interface PushMessage { title: string; body: string }

function buildPushMessage(templateKey: string, variables: Record<string, string>): PushMessage {
  switch (templateKey) {
    case 'task_assigned':
      return { title: 'New safety task', body: 'You have a pending safety task. Tap to complete.' };
    case 'escalation_alert':
      return {
        title: 'Escalation: missed task',
        body: `A task has been escalated to you (Level ${variables['level'] ?? '?'}). Tap to view.`,
      };
    case 'incident_alert':
      return { title: '⚠ Incident declared', body: 'An incident has been declared at your venue. Open the app immediately.' };
    case 'shift_briefing':
      return { title: 'Shift briefing', body: 'Your shift briefing is ready. Tap to acknowledge.' };
    case 'cert_expiry':
      return { title: 'Certification expiring', body: 'A staff certification is expiring soon. Action required.' };
    default:
      return { title: 'SafeCommand', body: 'You have a new notification.' };
  }
}

/* ─── Channel senders ───────────────────────────────────────────────────── */

async function sendFcmPush(
  staffId: string,
  fcmToken: string,
  templateKey: string,
  variables: Record<string, string>,
): Promise<boolean> {
  if (!_firebaseReady) return false;
  try {
    const { title, body } = buildPushMessage(templateKey, variables);
    await admin.messaging().send({
      token: fcmToken,
      notification: { title, body },
      data: variables,
      android: { priority: 'high' },
      apns: { payload: { aps: { sound: 'default', badge: 1 } } },
    });
    logger.info({ staff_id: staffId, template: templateKey }, 'FCM push sent');
    return true;
  } catch (err: unknown) {
    // Unregistered / invalid token — log and move on, don't retry
    const code = (err as { errorInfo?: { code?: string } }).errorInfo?.code ?? '';
    if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-argument') {
      logger.warn({ staff_id: staffId, code }, 'FCM token invalid — clearing');
      await getServiceClient()
        .from('staff')
        .update({ fcm_token: null, updated_at: new Date().toISOString() })
        .eq('id', staffId);
    } else {
      logger.error({ err, staff_id: staffId }, 'FCM send failed');
    }
    return false;
  }
}

async function sendWhatsApp(_staffId: string, _templateKey: string, _variables: Record<string, string>): Promise<boolean> {
  // Week 4 deliverable — requires Meta WABA approval
  logger.debug({ staff_id: _staffId, template: _templateKey }, '[WA] stub');
  return false;
}

async function sendSms(_staffId: string, _templateKey: string, _variables: Record<string, string>): Promise<boolean> {
  // Week 4 deliverable — requires Airtel DLT approval
  logger.debug({ staff_id: _staffId, template: _templateKey }, '[SMS] stub');
  return false;
}

/* ─── Processor ─────────────────────────────────────────────────────────── */

async function processNotification(job: Job<NotificationJob>): Promise<void> {
  const { venue_id, staff_id, channel, template_key, variables, comm_delivery_id } = job.data;
  const db = getServiceClient();

  // Fetch current FCM token — it may have been updated since job was enqueued
  const { data: staff } = await db
    .from('staff')
    .select('fcm_token, name')
    .eq('id', staff_id)
    .single();

  let success = false;

  if (channel === 'APP_PUSH') {
    if (staff?.fcm_token) {
      success = await sendFcmPush(staff_id, staff.fcm_token, template_key, variables);
    } else {
      logger.info({ staff_id }, 'No FCM token — skipping push');
    }
  } else if (channel === 'WHATSAPP') {
    success = await sendWhatsApp(staff_id, template_key, variables);
  } else if (channel === 'SMS') {
    success = await sendSms(staff_id, template_key, variables);
  }

  if (comm_delivery_id) {
    await db
      .from('comm_deliveries')
      .update({
        status: success ? 'SENT' : 'FAILED',
        sent_at: success ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', comm_delivery_id);
  }

  logger.info({ staff_id, channel, template_key, success, venue_id }, 'Notification processed');
}

/* ─── Pause control ──────────────────────────────────────────────────────── */
// Set WORKERS_PAUSED=true in Railway env to idle this service. See AWS-process-doc-IMP.md §11.4.
const WORKERS_PAUSED = process.env['WORKERS_PAUSED'] === 'true';

if (WORKERS_PAUSED) {
  logger.warn('WORKERS_PAUSED=true — notifier idle. Set to false (or unset) and redeploy to resume.');
  setInterval(() => logger.info('notifier paused'), 3_600_000);
} else {
  /* ─── Worker ───────────────────────────────────────────────────────────── */

  const worker = new Worker<NotificationJob>(
    QUEUE_NAMES.NOTIFICATIONS,
    processNotification,
    {
      connection: getRedisConnection(),
      concurrency: 30,
      drainDelay: 300,           // block 5 min on empty queue — see upstash_redis.md
      stalledInterval: 300_000,  // 5 min stalled check
    },
  );

  worker.on('failed', (job, err) => {
    logger.error({ job: job?.id, err }, 'Notification job failed');
  });

  logger.info('Notifier worker started');
}
