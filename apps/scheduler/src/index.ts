import 'dotenv/config';
import pino from 'pino';
import { Worker, Queue, Job } from 'bullmq';
import {
  getRedisConnection,
  QUEUE_NAMES,
  scheduleGenerationQueue,
  escalationsQueue,
  notificationsQueue,
} from '@safecommand/queue';
import { getServiceClient } from '@safecommand/db';
import type { ScheduleGenerationJob, EscalationJob, StaffRole } from '@safecommand/types';
import { computeCurrentSlot, FREQUENCY_WINDOW_MS } from './compute.js';

const logger = pino({ level: process.env['LOG_LEVEL'] ?? 'info' });

/* ─── Master tick ─────────────────────────────────────────────────────────────
   Runs every 60s as a Bull repeatable singleton job.
   Scans all active templates across all venues, computes the current slot for
   each, and enqueues an individual ScheduleGenerationJob if the slot is due.
   The individual worker below creates the task_instance with idempotency.
────────────────────────────────────────────────────────────────────────────── */
async function processMasterTick(): Promise<void> {
  const db = getServiceClient();
  const now = new Date();

  const { data: templates, error } = await db
    .from('schedule_templates')
    .select('id, venue_id, frequency, start_time, timezone, escalation_interval_minutes, assigned_role, escalation_chain')
    .eq('is_active', true);

  if (error) {
    logger.error({ error }, 'Failed to fetch active templates');
    return;
  }

  if (!templates || templates.length === 0) {
    logger.debug('No active templates found');
    return;
  }

  let enqueued = 0;
  for (const tpl of templates) {
    const slot = computeCurrentSlot(tpl.frequency, tpl.start_time ?? null, tpl.timezone ?? 'Asia/Kolkata', now);
    if (!slot) continue;

    // Skip stale slots: if the slot is older than 2× the window, don't backfill.
    const windowMs = FREQUENCY_WINDOW_MS[tpl.frequency] ?? 60 * 60_000;
    if (now.getTime() - slot.getTime() > 2 * windowMs) continue;

    // Skip future slots: slot hasn't started yet.
    if (slot.getTime() > now.getTime()) continue;

    const jobId = `tpl-tick__${tpl.id}__${slot.toISOString().replace(/[:.]/g, '-')}`;
    await scheduleGenerationQueue.add(
      'schedule-template-tick',
      { venue_id: tpl.venue_id, template_id: tpl.id, tick_at: slot.toISOString() } satisfies ScheduleGenerationJob,
      { jobId, deduplication: { id: jobId } },
    );
    enqueued++;
  }

  logger.info({ templates: templates.length, enqueued, tick: now.toISOString() }, 'Master tick complete');
}

/* ─── Template tick: create task_instance ────────────────────────────────────
   Processes individual ScheduleGenerationJob items.
   Creates the task_instance, skips on idempotency conflict (23505),
   then enqueues a delayed escalation job and push notifications.
────────────────────────────────────────────────────────────────────────────── */
async function processTemplateTick(job: Job<ScheduleGenerationJob>): Promise<void> {
  const { venue_id, template_id, tick_at } = job.data;
  const db = getServiceClient();

  const { data: template, error: tError } = await db
    .from('schedule_templates')
    .select('id, frequency, assigned_role, escalation_chain, escalation_interval_minutes')
    .eq('id', template_id)
    .eq('venue_id', venue_id)
    .eq('is_active', true)
    .single();

  if (tError || !template) {
    logger.warn({ template_id, venue_id }, 'Template not found or inactive — skipping');
    return;
  }

  const dueAt = new Date(tick_at);
  const windowMs = FREQUENCY_WINDOW_MS[template.frequency] ?? 60 * 60_000;
  const expiresAt = new Date(dueAt.getTime() + windowMs);
  const idempotencyKey = `${template_id}::${tick_at}`;

  const { data: inserted, error: insertError } = await db
    .from('task_instances')
    .insert({
      venue_id,
      template_id,
      status: 'PENDING',
      due_at: dueAt.toISOString(),
      window_expires_at: expiresAt.toISOString(),
      idempotency_key: idempotencyKey,
    })
    .select('id')
    .single();

  if (insertError) {
    if (insertError.code === '23505') {
      logger.debug({ idempotencyKey }, 'Task already exists — idempotent skip');
      return;
    }
    throw new Error(`Failed to insert task_instance: ${insertError.message}`);
  }

  const taskId = inserted.id;
  logger.info({ venue_id, template_id, task_id: taskId, due_at: dueAt }, 'Task instance created');

  // Enqueue escalation delayed job — fires if task is still PENDING/IN_PROGRESS
  // at window_expires_at. Delay = time until window expires.
  const escalationChain = (template.escalation_chain ?? []) as StaffRole[];
  if (escalationChain.length > 0) {
    const delayMs = Math.max(0, expiresAt.getTime() - Date.now());
    await escalationsQueue.add(
      'task-escalation',
      {
        task_instance_id: taskId,
        venue_id,
        level: 0,
        escalation_chain: escalationChain,
      } satisfies EscalationJob,
      {
        delay: delayMs,
        jobId: `esc__${taskId}__0`,
      },
    );
  }

  // Push notification to all active staff with the assigned role
  const { data: staffList } = await db
    .from('staff')
    .select('id, fcm_token, name')
    .eq('venue_id', venue_id)
    .eq('role', template.assigned_role)
    .eq('is_active', true);

  for (const staff of staffList ?? []) {
    if (!staff.fcm_token) continue;

    const { data: delivery, error: deliveryErr } = await db
      .from('comm_deliveries')
      .insert({
        venue_id,
        source_type: 'TASK_INSTANCE',
        source_id: taskId,
        recipient_staff_id: staff.id,
        channel: 'APP_PUSH',
        status: 'PENDING',
      })
      .select('id')
      .single();
    if (deliveryErr) {
      logger.warn({ staff_id: staff.id, task_id: taskId, err: deliveryErr.message }, 'comm_deliveries insert failed — notification still fires');
    }

    await notificationsQueue.add(
      `task-assigned-${taskId}-${staff.id}`,
      {
        venue_id,
        staff_id: staff.id,
        channel: 'APP_PUSH',
        template_key: 'task_assigned',
        variables: { task_id: taskId, role: template.assigned_role },
        comm_delivery_id: delivery?.id,
      },
      { jobId: `notify-assign__${taskId}__${staff.id}` },
    );
  }
}

/* ─── Pause control ──────────────────────────────────────────────────────── */
// Set WORKERS_PAUSED=true in Railway env to idle this service without code changes.
// Default = unset/false = normal operation. See AWS-process-doc-IMP.md §11.4.
const WORKERS_PAUSED = process.env['WORKERS_PAUSED'] === 'true';

if (WORKERS_PAUSED) {
  logger.warn('WORKERS_PAUSED=true — scheduler idle. Set to false (or unset) and redeploy to resume.');
  // Keep process alive so Railway doesn't crash-loop. Heartbeat log every hour.
  setInterval(() => logger.info('scheduler paused'), 3_600_000);
} else {
  /* ─── Worker ───────────────────────────────────────────────────────────── */

  const connection = getRedisConnection();

  const worker = new Worker(
    QUEUE_NAMES.SCHEDULE_GENERATION,
    async (job) => {
      if (job.name === 'master-tick') return processMasterTick();
      return processTemplateTick(job as Job<ScheduleGenerationJob>);
    },
    {
      connection,
      concurrency: 20,
      drainDelay: 300,           // block 5 min on empty queue (was 5s default) — see upstash_redis.md
      stalledInterval: 300_000,  // check stalled jobs every 5 min (was 30s default)
    },
  );

  worker.on('failed', (job, err) => {
    logger.error({ job: job?.id, jobName: job?.name, err }, 'Schedule job failed');
  });

  worker.on('completed', (job) => {
    if (job.name !== 'master-tick') {
      logger.debug({ job: job.id }, 'Schedule job completed');
    }
  });

/* ─── Repeatable master tick registration ────────────────────────────────── */

async function registerMasterTick(): Promise<void> {
  // Remove any stale repeatable tick definitions first (handles redeploys)
  const repeatables = await scheduleGenerationQueue.getRepeatableJobs();
  for (const r of repeatables) {
    if (r.name === 'master-tick') {
      await scheduleGenerationQueue.removeRepeatableByKey(r.key);
      logger.info({ key: r.key }, 'Removed stale repeatable tick');
    }
  }

  // Hibernation-grade cadence — May 2026 budget freeze. Effectively dormant.
  // Production target: 60_000 ms. Bump back before any pilot, demo, or testing session.
  // Implication: scheduled tasks lag up to 4 hours — unfit for any user-facing testing.
  const TICK_MS = 14_400_000; // 4 hours (~0.025 cmd/min from master-tick — near-zero burn)
  await (scheduleGenerationQueue as Queue).add(
    'master-tick',
    {} as ScheduleGenerationJob,
    {
      repeat: { every: TICK_MS },
      jobId: 'master-tick-singleton',
    },
  );
  logger.info({ tick_ms: TICK_MS }, 'Master tick registered');
}

  registerMasterTick()
    .then(() => logger.info('Scheduler worker started'))
    .catch((err) => {
      logger.error({ err }, 'Failed to register master tick — exiting');
      process.exit(1);
    });
} // end of WORKERS_PAUSED else block
