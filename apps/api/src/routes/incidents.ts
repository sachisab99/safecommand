import { Router, Request, Response } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { setTenantContext } from '../middleware/tenant.js';
import { validate } from '../middleware/validate.js';
import { auditLog } from '../middleware/audit.js';
import { getServiceClient } from '@safecommand/db';
import { incidentEscalationsQueue } from '@safecommand/queue';
import { CreateIncidentSchema, UpdateIncidentStatusSchema } from '@safecommand/schemas';

export const incidentsRouter = Router();
incidentsRouter.use(requireAuth, setTenantContext);

incidentsRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  const { data, error } = await getServiceClient()
    .from('incidents')
    .select('*, zones(name), staff(name)')
    .eq('venue_id', req.auth.venue_id)
    .in('status', ['ACTIVE', 'CONTAINED'])
    .order('declared_at', { ascending: false });

  if (error) {
    res.status(500).json({ error: { code: 'QUERY_FAILED', message: 'Could not fetch incidents' } });
    return;
  }
  res.json(data);
});

incidentsRouter.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const { data, error } = await getServiceClient()
    .from('incidents')
    .select('*, zones(name, floor_id), staff(name, role), incident_timeline(*)')
    .eq('id', req.params['id'])
    .eq('venue_id', req.auth.venue_id)
    .single();

  if (error || !data) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Incident not found' } });
    return;
  }
  res.json(data);
});

incidentsRouter.post(
  '/',
  requireRole('SH', 'DSH', 'SHIFT_COMMANDER', 'GM', 'FM'),
  validate(CreateIncidentSchema),
  auditLog('INCIDENT_DECLARE'),
  async (req: Request, res: Response): Promise<void> => {
    const { incident_type, severity, zone_id, description } = req.body as {
      incident_type: string;
      severity: string;
      zone_id?: string;
      description?: string;
    };

    const { data, error } = await getServiceClient()
      .from('incidents')
      .insert({
        venue_id: req.auth.venue_id,
        incident_type,
        severity,
        zone_id: zone_id ?? null,
        description: description ?? null,
        status: 'ACTIVE',
        declared_by_staff_id: req.auth.staff_id,
        declared_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error || !data) {
      res.status(500).json({ error: { code: 'CREATE_FAILED', message: 'Could not declare incident' } });
      return;
    }

    // Mark the zone as INCIDENT_ACTIVE so Zone Board reflects it (BR-18)
    if (zone_id) {
      await getServiceClient()
        .from('zones')
        .update({ current_status: 'INCIDENT_ACTIVE', updated_at: new Date().toISOString() })
        .eq('id', zone_id)
        .eq('venue_id', req.auth.venue_id);
    }

    // Return 201 immediately — notification fires async (NFR-02: ≤5 seconds)
    res.status(201).json(data);

    // Async: enqueue incident escalation at highest priority (0)
    await incidentEscalationsQueue.add(
      `incident-${data.id}`,
      { incident_id: data.id, venue_id: req.auth.venue_id, priority: 0 },
      { priority: 0 },
    );
  },
);

incidentsRouter.put(
  '/:id/status',
  requireRole('SH', 'DSH', 'SHIFT_COMMANDER', 'GM'),
  validate(UpdateIncidentStatusSchema),
  auditLog('INCIDENT_STATUS_UPDATE'),
  async (req: Request, res: Response): Promise<void> => {
    const { status } = req.body as { status: string };
    const now = new Date().toISOString();

    const { data, error } = await getServiceClient()
      .from('incidents')
      .update({
        status,
        ...(status === 'RESOLVED' || status === 'CLOSED' ? { resolved_at: now } : {}),
        updated_at: now,
      })
      .eq('id', req.params['id'])
      .eq('venue_id', req.auth.venue_id)
      .select()
      .single();

    if (error || !data) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Incident not found' } });
      return;
    }

    // If incident resolved/closed and had a zone, revert zone to ALL_CLEAR — but only
    // when no OTHER active incident still references this zone (avoid clearing a zone
    // that has multiple concurrent incidents).
    if ((status === 'RESOLVED' || status === 'CLOSED') && data.zone_id) {
      const { count } = await getServiceClient()
        .from('incidents')
        .select('id', { count: 'exact', head: true })
        .eq('zone_id', data.zone_id)
        .eq('venue_id', req.auth.venue_id)
        .in('status', ['ACTIVE', 'CONTAINED']);
      if ((count ?? 0) === 0) {
        await getServiceClient()
          .from('zones')
          .update({ current_status: 'ALL_CLEAR', updated_at: now })
          .eq('id', data.zone_id)
          .eq('venue_id', req.auth.venue_id);
      }
    }
    res.json(data);
  },
);

incidentsRouter.post('/:id/staff-safe', auditLog('STAFF_SAFE'), async (req: Request, res: Response): Promise<void> => {
  const { error } = await getServiceClient()
    .from('incident_timeline')
    .insert({
      incident_id: req.params['id'],
      venue_id: req.auth.venue_id,
      event_type: 'STAFF_SAFE',
      actor_staff_id: req.auth.staff_id,
      metadata: { confirmed_at: new Date().toISOString() },
    });

  if (error) {
    res.status(500).json({ error: { code: 'UPDATE_FAILED', message: 'Could not record safe confirmation' } });
    return;
  }
  res.status(200).json({ message: 'Safe confirmation recorded' });
});
