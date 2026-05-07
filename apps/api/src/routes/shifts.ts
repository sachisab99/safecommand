/**
 * /v1/shifts + /v1/shift-instances routes — BR-04 / BR-12 / BR-13 / BR-19 / BR-61.
 *
 * Phase 5.16 — exposes shift-instance lifecycle and zone-assignment writes
 * to the venue dashboard + mobile, parallel to the Ops Console server
 * actions. Together with the existing /v1/zones/accountability read path,
 * this closes the roster loop end-to-end without service-role bypass.
 *
 * Auth posture:
 *   - All endpoints require Bearer JWT (requireAuth)
 *   - Tenant context applied via setTenantContext (writes scoped to venue_id)
 *   - Writes gated by requireRole('SH','DSH','SHIFT_COMMANDER') — matches
 *     the RLS gates already in place on shift_instances + staff_zone_assignments
 *
 * Endpoints:
 *   GET  /v1/shifts                                shift templates (active only)
 *   GET  /v1/shift-instances?date=YYYY-MM-DD       instances for a date (default today)
 *   POST /v1/shift-instances                       create-or-noop instance for date
 *   PUT  /v1/shift-instances/:id/activate          set ACTIVE + commander (validated)
 *   PUT  /v1/shift-instances/:id/close             set CLOSED
 *   GET  /v1/shift-instances/:id/zone-assignments  current assignments
 *   PUT  /v1/shift-instances/:id/zone-assignments  bulk-replace assignments
 *
 * Bulk-replace pattern (matches Ops Console replaceZoneAssignmentsAction):
 *   - Operator submits the full grid state once
 *   - Server validates 2-person rule + venue scope, then DELETE+INSERT
 *   - Idempotent — re-submitting the same payload is a no-op
 *
 * Refs: docs/api/conventions.md §19 entity lifecycle pattern.
 */

import { Router, Request, Response } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { setTenantContext } from '../middleware/tenant.js';
import { getServiceClient } from '@safecommand/db';

export const shiftsRouter = Router();
shiftsRouter.use(requireAuth, setTenantContext);

export const shiftInstancesRouter = Router();
shiftInstancesRouter.use(requireAuth, setTenantContext);

const COMMAND_ROLES = ['SH', 'DSH', 'SHIFT_COMMANDER'] as const;
const ASSIGNMENT_TYPES = ['PRIMARY', 'SECONDARY', 'BACKUP'] as const;

// ──────────────────────────────────────────────────────────────────────────
// Shift templates — read-only here (Ops Console owns CRUD via server actions)

shiftsRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  const { data, error } = await getServiceClient()
    .from('shifts')
    .select('id, venue_id, name, start_time, end_time, is_active, building_id, created_at')
    .eq('venue_id', req.auth.venue_id)
    .eq('is_active', true)
    .order('start_time', { ascending: true });

  if (error) {
    res.status(500).json({
      error: { code: 'QUERY_FAILED', message: 'Could not fetch shifts' },
    });
    return;
  }
  res.json(data ?? []);
});

// ──────────────────────────────────────────────────────────────────────────
// Shift instances

/** GET /v1/shift-instances?date=YYYY-MM-DD — instances for a date (default today) */
shiftInstancesRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  const date = (req.query['date'] as string | undefined) ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'date must be YYYY-MM-DD' } });
    return;
  }

  const { data, error } = await getServiceClient()
    .from('shift_instances')
    .select('*, shift:shifts(id, name, start_time, end_time), commander:staff!commander_staff_id(id, name, role)')
    .eq('venue_id', req.auth.venue_id)
    .eq('shift_date', date)
    .order('created_at', { ascending: true });

  if (error) {
    res.status(500).json({
      error: { code: 'QUERY_FAILED', message: 'Could not fetch shift instances' },
    });
    return;
  }
  res.json(data ?? []);
});

/**
 * POST /v1/shift-instances — create-or-noop instance for (shift_id, shift_date).
 * Idempotent via UNIQUE (venue_id, shift_id, shift_date).
 */
shiftInstancesRouter.post(
  '/',
  requireRole(...COMMAND_ROLES),
  async (req: Request, res: Response): Promise<void> => {
    const body = req.body as { shift_id?: string; shift_date?: string };
    if (!body.shift_id || !body.shift_date) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'shift_id and shift_date required' },
      });
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.shift_date)) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'shift_date must be YYYY-MM-DD' },
      });
      return;
    }

    // Validate shift template belongs to venue + grab building_id for denormalisation
    const { data: shift, error: shiftErr } = await getServiceClient()
      .from('shifts')
      .select('id, building_id, is_active')
      .eq('id', body.shift_id)
      .eq('venue_id', req.auth.venue_id)
      .single();
    if (shiftErr || !shift) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Shift template not found' } });
      return;
    }
    if (!shift.is_active) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Cannot create instance for inactive shift template' },
      });
      return;
    }

    const { data, error } = await getServiceClient()
      .from('shift_instances')
      .upsert(
        {
          venue_id: req.auth.venue_id,
          shift_id: body.shift_id,
          shift_date: body.shift_date,
          building_id: shift.building_id,
          status: 'PENDING',
        },
        { onConflict: 'venue_id,shift_id,shift_date', ignoreDuplicates: false },
      )
      .select()
      .single();

    if (error || !data) {
      res.status(500).json({
        error: { code: 'INSERT_FAILED', message: error?.message ?? 'Failed' },
      });
      return;
    }
    res.status(201).json(data);
  },
);

/** PUT /v1/shift-instances/:id/activate — sets ACTIVE + commander + activated_at */
shiftInstancesRouter.put(
  '/:id/activate',
  requireRole(...COMMAND_ROLES),
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'];
    const body = req.body as { commander_staff_id?: string };
    if (!body.commander_staff_id) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'commander_staff_id required' },
      });
      return;
    }

    // Validate commander has command authority + is active in this venue
    const { data: commander, error: commErr } = await getServiceClient()
      .from('staff')
      .select('role, is_active')
      .eq('id', body.commander_staff_id)
      .eq('venue_id', req.auth.venue_id)
      .single();
    if (commErr || !commander) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Commander staff not found in this venue' },
      });
      return;
    }
    if (!commander.is_active) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Commander staff must be ACTIVE' },
      });
      return;
    }
    if (!COMMAND_ROLES.includes(commander.role as typeof COMMAND_ROLES[number])) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Commander must be Security Head, Deputy Security Head, or Shift Commander',
        },
      });
      return;
    }

    const now = new Date().toISOString();
    const { data, error } = await getServiceClient()
      .from('shift_instances')
      .update({
        status: 'ACTIVE',
        commander_staff_id: body.commander_staff_id,
        activated_at: now,
        updated_at: now,
      })
      .eq('id', id)
      .eq('venue_id', req.auth.venue_id)
      .select()
      .single();

    if (error || !data) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Shift instance not found' },
      });
      return;
    }
    res.json(data);
  },
);

/** PUT /v1/shift-instances/:id/close — sets CLOSED */
shiftInstancesRouter.put(
  '/:id/close',
  requireRole(...COMMAND_ROLES),
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'];
    const { data, error } = await getServiceClient()
      .from('shift_instances')
      .update({
        status: 'CLOSED',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('venue_id', req.auth.venue_id)
      .select()
      .single();

    if (error || !data) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Shift instance not found' },
      });
      return;
    }
    res.json(data);
  },
);

// ──────────────────────────────────────────────────────────────────────────
// Zone assignments

/** GET /v1/shift-instances/:id/zone-assignments — current assignments for instance */
shiftInstancesRouter.get(
  '/:id/zone-assignments',
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'];

    // Sanity check instance belongs to venue
    const { data: instance } = await getServiceClient()
      .from('shift_instances')
      .select('id')
      .eq('id', id)
      .eq('venue_id', req.auth.venue_id)
      .single();
    if (!instance) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Shift instance not found' },
      });
      return;
    }

    const { data, error } = await getServiceClient()
      .from('staff_zone_assignments')
      .select('id, staff_id, zone_id, assignment_type, created_at')
      .eq('shift_instance_id', id)
      .eq('venue_id', req.auth.venue_id);

    if (error) {
      res.status(500).json({
        error: { code: 'QUERY_FAILED', message: 'Could not fetch assignments' },
      });
      return;
    }
    res.json(data ?? []);
  },
);

interface AssignmentInput {
  staff_id: string;
  zone_id: string;
  assignment_type: typeof ASSIGNMENT_TYPES[number];
}

/**
 * PUT /v1/shift-instances/:id/zone-assignments — bulk-replace.
 * Body: { assignments: AssignmentInput[] }
 *
 * Server-side validation:
 *   - All zones referenced exist in this venue
 *   - Two-person zones must have ≥2 staff (or 0 — entirely uncovered)
 *
 * Implementation: DELETE existing → INSERT new. Wrapped semantically as
 * "bulk-replace" — repeat submissions converge. Note: not a single SQL
 * transaction; failure between DELETE and INSERT leaves the instance with
 * 0 assignments. Acceptable given operator immediately re-submits if they
 * see the empty state.
 */
shiftInstancesRouter.put(
  '/:id/zone-assignments',
  requireRole(...COMMAND_ROLES),
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'];
    const body = req.body as { assignments?: AssignmentInput[] };
    const assignments = body.assignments;

    if (!Array.isArray(assignments)) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'assignments must be an array' },
      });
      return;
    }

    // Validate each entry shape
    for (const a of assignments) {
      if (!a.staff_id || !a.zone_id) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'each assignment requires staff_id and zone_id',
          },
        });
        return;
      }
      if (!ASSIGNMENT_TYPES.includes(a.assignment_type)) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: `assignment_type must be one of ${ASSIGNMENT_TYPES.join(', ')}`,
          },
        });
        return;
      }
    }

    // Validate instance exists in this venue
    const { data: instance, error: iErr } = await getServiceClient()
      .from('shift_instances')
      .select('id')
      .eq('id', id)
      .eq('venue_id', req.auth.venue_id)
      .single();
    if (iErr || !instance) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Shift instance not found' },
      });
      return;
    }

    // Two-person rule
    if (assignments.length > 0) {
      const zoneIds = [...new Set(assignments.map((a) => a.zone_id))];
      const { data: zones, error: zErr } = await getServiceClient()
        .from('zones')
        .select('id, name, two_person_required')
        .eq('venue_id', req.auth.venue_id)
        .in('id', zoneIds);
      if (zErr) {
        res.status(500).json({
          error: { code: 'QUERY_FAILED', message: `Failed to validate zones: ${zErr.message}` },
        });
        return;
      }
      // Reject any zone referenced that doesn't belong to this venue
      const validZoneIds = new Set((zones ?? []).map((z) => z.id));
      for (const a of assignments) {
        if (!validZoneIds.has(a.zone_id)) {
          res.status(400).json({
            error: {
              code: 'VALIDATION_ERROR',
              message: `Zone ${a.zone_id} does not belong to this venue`,
            },
          });
          return;
        }
      }
      // Group staff per zone
      const staffPerZone = new Map<string, Set<string>>();
      for (const a of assignments) {
        const set = staffPerZone.get(a.zone_id) ?? new Set<string>();
        set.add(a.staff_id);
        staffPerZone.set(a.zone_id, set);
      }
      for (const zone of zones ?? []) {
        if (!zone.two_person_required) continue;
        const count = staffPerZone.get(zone.id)?.size ?? 0;
        if (count > 0 && count < 2) {
          res.status(400).json({
            error: {
              code: 'VALIDATION_ERROR',
              message: `Zone "${zone.name}" requires 2-person coverage (currently ${count}). Either assign a second staff member or remove the existing assignment.`,
            },
          });
          return;
        }
      }
    }

    // Bulk replace
    const { error: delErr } = await getServiceClient()
      .from('staff_zone_assignments')
      .delete()
      .eq('shift_instance_id', id)
      .eq('venue_id', req.auth.venue_id);
    if (delErr) {
      res.status(500).json({
        error: { code: 'DELETE_FAILED', message: `Failed to clear assignments: ${delErr.message}` },
      });
      return;
    }

    if (assignments.length > 0) {
      const rows = assignments.map((a) => ({
        venue_id: req.auth.venue_id,
        shift_instance_id: id,
        staff_id: a.staff_id,
        zone_id: a.zone_id,
        assignment_type: a.assignment_type,
      }));
      const { error: insErr } = await getServiceClient()
        .from('staff_zone_assignments')
        .insert(rows);
      if (insErr) {
        res.status(500).json({
          error: { code: 'INSERT_FAILED', message: `Failed to save assignments: ${insErr.message}` },
        });
        return;
      }
    }

    res.json({ ok: true, count: assignments.length });
  },
);
