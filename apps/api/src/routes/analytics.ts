import { Router, Request, Response } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { setTenantContext } from '../middleware/tenant.js';
import { getServiceClient } from '@safecommand/db';

export const analyticsRouter = Router();
analyticsRouter.use(requireAuth, setTenantContext);

analyticsRouter.get(
  '/dashboard',
  requireRole('SH', 'DSH', 'GM', 'AUDITOR', 'SHIFT_COMMANDER', 'FM'),
  async (req: Request, res: Response): Promise<void> => {
    const db = getServiceClient();
    const venueId = req.auth.venue_id;
    const today = new Date().toISOString().slice(0, 10);

    const [incidents, tasks, staff, zones] = await Promise.all([
      db.from('incidents').select('id, severity, incident_type, status, declared_at, zones(name)')
        .eq('venue_id', venueId).in('status', ['ACTIVE', 'CONTAINED']).order('declared_at', { ascending: false }),
      db.from('task_instances').select('id, status')
        .eq('venue_id', venueId)
        .gte('due_at', `${today}T00:00:00.000Z`)
        .lte('due_at', `${today}T23:59:59.999Z`),
      db.from('staff').select('id, is_active').eq('venue_id', venueId),
      db.from('zones').select('id, current_status').eq('venue_id', venueId),
    ]);

    const taskData = tasks.data ?? [];
    const complete = taskData.filter(t => ['COMPLETE', 'LATE_COMPLETE'].includes(t.status)).length;
    const missed = taskData.filter(t => ['MISSED', 'ESCALATED'].includes(t.status)).length;
    const pending = taskData.filter(t => ['PENDING', 'IN_PROGRESS'].includes(t.status)).length;
    const total = taskData.length;
    const complianceRate = total > 0 ? Math.round((complete / total) * 100) : 100;

    const zoneData = zones.data ?? [];
    const staffData = staff.data ?? [];
    const incidentData = incidents.data ?? [];

    const sev1Count = incidentData.filter(i => i.severity === 'SEV1').length;
    const sev2Count = incidentData.filter(i => i.severity === 'SEV2').length;
    const incidentPenalty = sev1Count * 20 + sev2Count * 10;
    const healthScore = Math.max(0, Math.min(100, Math.round(complianceRate * 0.6 + 40 - incidentPenalty)));

    res.json({
      health_score: healthScore,
      active_incidents: incidentData.length,
      active_incident_list: incidentData.slice(0, 5),
      tasks_today: {
        total,
        complete,
        missed,
        pending,
        compliance_rate: complianceRate,
      },
      staff: {
        total: staffData.length,
        active: staffData.filter(s => s.is_active).length,
      },
      zones: {
        total: zoneData.length,
        all_clear: zoneData.filter(z => z.current_status === 'ALL_CLEAR').length,
        attention: zoneData.filter(z => z.current_status === 'ATTENTION').length,
        incident_active: zoneData.filter(z => z.current_status === 'INCIDENT_ACTIVE').length,
      },
    });
  },
);
