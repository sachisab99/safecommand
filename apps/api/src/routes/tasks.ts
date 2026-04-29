import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { setTenantContext } from '../middleware/tenant.js';
import { validate } from '../middleware/validate.js';
import { auditLog } from '../middleware/audit.js';
import { getServiceClient } from '@safecommand/db';
import { CompleteTaskSchema } from '@safecommand/schemas';

export const tasksRouter = Router();
tasksRouter.use(requireAuth, setTenantContext);

tasksRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  const date = (req.query['date'] as string) ?? new Date().toISOString().slice(0, 10);
  const startOfDay = `${date}T00:00:00.000Z`;
  const endOfDay = `${date}T23:59:59.999Z`;

  const { data, error } = await getServiceClient()
    .from('task_instances')
    .select('*, schedule_templates(title, evidence_type, frequency)')
    .eq('venue_id', req.auth.venue_id)
    .eq('assigned_staff_id', req.auth.staff_id)
    .gte('due_at', startOfDay)
    .lte('due_at', endOfDay)
    .order('due_at');

  if (error) {
    res.status(500).json({ error: { code: 'QUERY_FAILED', message: 'Could not fetch tasks' } });
    return;
  }
  res.json(data);
});

tasksRouter.get('/pending', async (req: Request, res: Response): Promise<void> => {
  const { data, error } = await getServiceClient()
    .from('task_instances')
    .select('*, schedule_templates(title), staff(name, role)')
    .eq('venue_id', req.auth.venue_id)
    .in('status', ['MISSED', 'ESCALATED'])
    .order('due_at');

  if (error) {
    res.status(500).json({ error: { code: 'QUERY_FAILED', message: 'Could not fetch pending tasks' } });
    return;
  }
  res.json(data);
});

tasksRouter.post(
  '/:id/complete',
  validate(CompleteTaskSchema),
  auditLog('TASK_COMPLETE'),
  async (req: Request, res: Response): Promise<void> => {
    const taskId = req.params['id'];
    const { evidence_type, evidence_url, evidence_text, evidence_numeric, evidence_checklist } =
      req.body as {
        evidence_type: string;
        evidence_url?: string;
        evidence_text?: string;
        evidence_numeric?: number;
        evidence_checklist?: { item: string; checked: boolean }[];
      };

    const { data: task, error: taskError } = await getServiceClient()
      .from('task_instances')
      .select('id, status, venue_id, assigned_staff_id')
      .eq('id', taskId)
      .eq('venue_id', req.auth.venue_id)
      .single();

    if (taskError || !task) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Task not found' } });
      return;
    }

    if (!['PENDING', 'IN_PROGRESS', 'MISSED', 'ESCALATED'].includes(task.status)) {
      res.status(409).json({ error: { code: 'ALREADY_COMPLETE', message: 'Task is already completed' } });
      return;
    }

    const now = new Date().toISOString();
    const isLate = task.status === 'MISSED' || task.status === 'ESCALATED';

    const { error: updateError } = await getServiceClient()
      .from('task_instances')
      .update({ status: isLate ? 'LATE_COMPLETE' : 'COMPLETE', updated_at: now })
      .eq('id', taskId);

    if (updateError) {
      res.status(500).json({ error: { code: 'UPDATE_FAILED', message: 'Could not complete task' } });
      return;
    }

    const { data: completion, error: completionError } = await getServiceClient()
      .from('task_completions')
      .insert({
        task_instance_id: taskId,
        venue_id: req.auth.venue_id,
        completed_by_staff_id: req.auth.staff_id,
        evidence_type,
        evidence_url: evidence_url ?? null,
        evidence_text: evidence_text ?? null,
        evidence_numeric: evidence_numeric ?? null,
        evidence_checklist: evidence_checklist ?? null,
        completed_at: now,
      })
      .select()
      .single();

    if (completionError) {
      res.status(500).json({ error: { code: 'COMPLETION_FAILED', message: 'Could not record completion' } });
      return;
    }

    res.status(201).json(completion);
  },
);
