import { Router, Request, Response } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { setTenantContext } from '../middleware/tenant.js';
import { validate } from '../middleware/validate.js';
import { auditLog } from '../middleware/audit.js';
import { getServiceClient } from '@safecommand/db';
import { incidentEscalationsQueue } from '@safecommand/queue';
import { CreateIncidentSchema, UpdateIncidentStatusSchema } from '@safecommand/schemas';
import { resolveTemplate, EC23ViolationError } from '../services/sire/templateResolver.js';
import { bootstrapSireIncident } from '../services/sire/bootstrapIncident.js';
import { logger } from '../services/logger.js';

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
    const {
      incident_type,
      severity,
      zone_id,
      description,
      incident_subtype,
      enable_sire,
      is_drill,
      affected_zone_ids,
    } = req.body as {
      incident_type: string;
      severity: string;
      zone_id?: string;
      description?: string;
      incident_subtype?: string;
      enable_sire?: boolean;
      is_drill?: boolean;
      affected_zone_ids?: string[];
    };

    const useSire = enable_sire === true;
    const declaredAt = new Date().toISOString();
    const venueId = req.auth.venue_id;
    const declaringRole = req.auth.role;

    // ─── SIRE path: pre-compute resolved_templates BEFORE incident insert ───
    // Snapshotting templates at declaration time is an immutable audit record
    // (architect Q3) — once written, the actions cannot drift if SC Ops edits
    // the source templates later. We resolve for the declaring staff's role
    // here; per-role expansion to GS/FS/SC happens in Day 2 alongside the
    // assignment-creation pass (requires shift roster — BR-O Phase 5.22).
    let resolvedTemplatesSnapshot: Record<string, unknown> | null = null;
    if (useSire) {
      // The snapshot is an immutable audit convenience for the *declaring*
      // role. The real per-responder fan-out (GS/FS/SC/SH/DSH) happens in
      // bootstrapSireIncident — those roles are guaranteed templates by
      // mig 019 (EC-23 gap-free). But the route also allows GM/FM/AUDITOR to
      // declare, and those roles have NO action templates BY DESIGN. With
      // SIRE now default-on, resolving the snapshot for the declarer must
      // never fail the declaration. So: snapshot against the declaring role
      // only if it is itself a SIRE-template role; otherwise against the
      // canonical command role (SH — guaranteed by the mig 015 global
      // floor). EC23 only ever surfaces if even the SH floor is missing
      // (impossible post mig 015/019) — kept as a defensive last resort.
      const SIRE_TEMPLATE_ROLES = [
        'SH',
        'DSH',
        'SHIFT_COMMANDER',
        'FLOOR_SUPERVISOR',
        'GROUND_STAFF',
      ];
      const snapshotRole = SIRE_TEMPLATE_ROLES.includes(declaringRole)
        ? declaringRole
        : 'SH';
      try {
        const { data: venueRow, error: vErr } = await getServiceClient()
          .from('venues')
          .select('type')
          .eq('id', venueId)
          .single();
        if (vErr || !venueRow) {
          res.status(500).json({
            error: { code: 'VENUE_LOOKUP_FAILED', message: 'Could not determine venue type for SIRE chain' },
          });
          return;
        }

        const resolveFor = (role: string) =>
          resolveTemplate(getServiceClient(), {
            venue_id: venueId,
            venue_type: venueRow.type,
            incident_type,
            incident_subtype: incident_subtype ?? null,
            staff_role: role,
          });

        const resolveSnapshot = async (): Promise<{
          resolved: Awaited<ReturnType<typeof resolveFor>>;
          role: string;
        }> => {
          try {
            return { resolved: await resolveFor(snapshotRole), role: snapshotRole };
          } catch (inner) {
            if (inner instanceof EC23ViolationError && snapshotRole !== 'SH') {
              return { resolved: await resolveFor('SH'), role: 'SH' };
            }
            throw inner;
          }
        };

        const { resolved, role: snapRole } = await resolveSnapshot();

        resolvedTemplatesSnapshot = {
          [snapRole]: {
            template_id: resolved.id,
            template_version: resolved.template_version,
            tier: resolved.tier,
            actions: resolved.actions,
            resolved_at: declaredAt,
          },
        };
      } catch (err) {
        if (err instanceof EC23ViolationError) {
          res.status(500).json({
            error: {
              code: 'EC23_VIOLATION',
              message: `No SIRE template seeded for ${incident_type} (SH global floor missing). Contact SC Ops.`,
            },
          });
          return;
        }
        logger.error({ err }, 'SIRE template resolution failed');
        res.status(500).json({
          error: { code: 'SIRE_RESOLVE_FAILED', message: 'Could not resolve action templates' },
        });
        return;
      }
    }

    // ─── Insert the incident row ───
    const { data, error } = await getServiceClient()
      .from('incidents')
      .insert({
        venue_id: venueId,
        incident_type,
        severity,
        zone_id: zone_id ?? null,
        description: description ?? null,
        status: 'ACTIVE',
        declared_by_staff_id: req.auth.staff_id,
        declared_at: declaredAt,
        // Phase 5.21 SIRE columns — populated only on enable_sire=true path
        incident_subtype: incident_subtype ?? null,
        is_drill: is_drill ?? false,
        has_sire_data: useSire,
        resolved_templates: resolvedTemplatesSnapshot,
      })
      .select()
      .single();

    if (error || !data) {
      logger.error({ error }, 'Failed to insert incident');
      res.status(500).json({ error: { code: 'CREATE_FAILED', message: 'Could not declare incident' } });
      return;
    }

    // Mark the primary zone as INCIDENT_ACTIVE so Zone Board reflects it (BR-18)
    if (zone_id) {
      await getServiceClient()
        .from('zones')
        .update({ current_status: 'INCIDENT_ACTIVE', updated_at: declaredAt })
        .eq('id', zone_id)
        .eq('venue_id', venueId);
    }

    // Return 201 immediately — bootstrap continues async below (NFR-02: ≤5 seconds)
    res.status(201).json(data);

    // ─── SIRE: multi-role bootstrap (best-effort; logs errors) ───
    // Day 2 fans assignments out to all roles with seeded templates:
    //   - 1 GS per affected zone (round-robin from active GS)
    //   - 1 FS per affected zone (round-robin from active FS)
    //   - declaring SH/DSH (or first active if declaring is GM/FM)
    //   - 1 active DSH (if not declaring)
    //   - 1 active SHIFT_COMMANDER
    // Each picked staff gets one assignment row per action_step in their
    // role's resolved template. Real shift-roster integration: BR-O / Phase 5.22.
    if (useSire) {
      const zonesToBootstrap = affected_zone_ids && affected_zone_ids.length > 0
        ? affected_zone_ids
        : (zone_id ? [zone_id] : []);

      if (zonesToBootstrap.length > 0) {
        // Need venue_type for the EC-23 chain inside bootstrap; re-fetch
        // (cheap; cached at Postgres level — Day 1 already paid the round-trip
        // for the declaring role's resolution; bootstrap re-uses).
        const { data: venueRow2 } = await getServiceClient()
          .from('venues')
          .select('type')
          .eq('id', venueId)
          .single();

        if (venueRow2) {
          const result = await bootstrapSireIncident({
            client: getServiceClient(),
            incidentId: data.id,
            venueId,
            venueType: venueRow2.type,
            incidentType: incident_type,
            incidentSubtype: incident_subtype ?? null,
            declaringStaffId: req.auth.staff_id,
            declaringRole,
            affectedZoneIds: zonesToBootstrap,
            declaredAt,
          });

          if (result.errors.length > 0) {
            logger.error(
              { incidentId: data.id, errors: result.errors },
              'SIRE bootstrap had errors',
            );
          } else {
            logger.info(
              {
                incidentId: data.id,
                zone_states: result.zone_states_created,
                assignments: result.assignments_created,
                roles_resolved: Object.keys(result.resolved_templates),
              },
              'SIRE bootstrap completed',
            );
          }

          // Update the incident's resolved_templates with the multi-role snapshot.
          // (Day 1 only stored the declaring role; bootstrap may have resolved more.)
          if (Object.keys(result.resolved_templates).length > 0) {
            await getServiceClient()
              .from('incidents')
              .update({ resolved_templates: result.resolved_templates })
              .eq('id', data.id)
              .eq('venue_id', venueId);
          }
        }
      }
    }

    // Async: enqueue incident escalation at highest priority (0)
    await incidentEscalationsQueue.add(
      `incident-${data.id}`,
      { incident_id: data.id, venue_id: venueId, priority: 0 },
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
