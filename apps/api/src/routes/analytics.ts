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

    const [incidents, tasks, staff, zones, equipment, drills] = await Promise.all([
      db.from('incidents').select('id, severity, incident_type, status, declared_at, zones(name)')
        .eq('venue_id', venueId).in('status', ['ACTIVE', 'CONTAINED']).order('declared_at', { ascending: false }),
      db.from('task_instances').select('id, status')
        .eq('venue_id', venueId)
        .gte('due_at', `${today}T00:00:00.000Z`)
        .lte('due_at', `${today}T23:59:59.999Z`),
      db.from('staff').select('id, is_active').eq('venue_id', venueId),
      db.from('zones').select('id, current_status').eq('venue_id', venueId),
      // BR-21 equipment rollup — drives Dashboard Health Score Breakdown
      // Equipment row (Phase 5.10). Compliance score formula matches the
      // Ops Console Equipment tab: ok_count / total_active * 100.
      // Empty (no equipment registered) → 100 (no compliance penalty).
      db.from('equipment_items').select('id, next_service_due, is_active')
        .eq('venue_id', venueId).eq('is_active', true),
      // BR-A drills rollup — drives Health Score Breakdown Drills row
      // (Phase 5.11). Recency-of-last-completed-drill formula.
      db.from('drill_sessions').select('id, status, ended_at, scheduled_for')
        .eq('venue_id', venueId)
        .order('scheduled_for', { ascending: false }),
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

    // ─── Equipment compliance rollup ────────────────────────────────────────
    // Buckets: OK (>90d) / DUE_90 (30-90d) / DUE_30 (7-30d) / DUE_7 (≤7d) /
    // OVERDUE (past due). Compliance score = ok / total * 100, or 100 if
    // total = 0 (no equipment registered = no penalty). Date math uses
    // day-of-year deltas; CURRENT_DATE in IST timezone is implicit.
    const equipData = equipment.data ?? [];
    const equipBuckets = { ok: 0, due_90: 0, due_30: 0, due_7: 0, overdue: 0 };
    const todayMs = new Date(`${today}T00:00:00.000Z`).getTime();
    for (const item of equipData) {
      const dueMs = new Date(`${item.next_service_due}T00:00:00.000Z`).getTime();
      const days = Math.floor((dueMs - todayMs) / 86_400_000);
      if (days < 0) equipBuckets.overdue++;
      else if (days <= 7) equipBuckets.due_7++;
      else if (days <= 30) equipBuckets.due_30++;
      else if (days <= 90) equipBuckets.due_90++;
      else equipBuckets.ok++;
    }
    const equipTotal = equipData.length;
    const equipScore = equipTotal === 0 ? 100 : Math.round((equipBuckets.ok / equipTotal) * 100);

    // ─── Drill compliance rollup (BR-A) ─────────────────────────────────────
    // Score = recency of last COMPLETED drill (best-practice quarterly).
    // Empty (never had a drill) = 0 — drills missing IS a compliance penalty.
    const drillData = drills.data ?? [];
    const completedDrills = drillData
      .filter((d) => d.status === 'COMPLETED' && d.ended_at !== null)
      .sort((a, b) => (b.ended_at ?? '').localeCompare(a.ended_at ?? ''));
    const lastCompleted = completedDrills[0];
    let drillScore = 0;
    let daysSinceLastDrill: number | null = null;
    if (lastCompleted?.ended_at) {
      const days = Math.floor(
        (todayMs - new Date(lastCompleted.ended_at).getTime()) / 86_400_000,
      );
      daysSinceLastDrill = days;
      if (days <= 90) drillScore = 100;
      else if (days <= 180) drillScore = 75;
      else if (days <= 270) drillScore = 50;
      else if (days <= 365) drillScore = 25;
      else drillScore = 0;
    }
    const upcomingDrills = drillData.filter((d) => d.status === 'SCHEDULED').length;

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
      equipment: {
        total: equipTotal,
        ok: equipBuckets.ok,
        due_90: equipBuckets.due_90,
        due_30: equipBuckets.due_30,
        due_7: equipBuckets.due_7,
        overdue: equipBuckets.overdue,
        compliance_score: equipScore,
      },
      drills: {
        total: drillData.length,
        completed: completedDrills.length,
        upcoming: upcomingDrills,
        days_since_last: daysSinceLastDrill,
        compliance_score: drillScore,
      },
    });
  },
);
