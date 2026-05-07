/**
 * /v1/drill-sessions routes — BR-A Drill Management Module.
 *
 * Lifecycle: SCHEDULED → IN_PROGRESS → COMPLETED | CANCELLED
 *
 * Phase 5.11 (read+lifecycle):
 *   GET  /v1/drill-sessions              list (default ordering: scheduled DESC)
 *   GET  /v1/drill-sessions/:id          single with participant details + timeline
 *   POST /v1/drill-sessions              schedule new (SH/DSH/FM/SC)
 *   PUT  /v1/drill-sessions/:id/start    SCHEDULED → IN_PROGRESS (+ enqueue participants)
 *   PUT  /v1/drill-sessions/:id/end      IN_PROGRESS → COMPLETED + duration (+ MISSED transitions)
 *   PUT  /v1/drill-sessions/:id/cancel   SCHEDULED → CANCELLED
 *
 * Phase 5.18 (participant tracking + reason taxonomy per ADR 0004):
 *   GET   /v1/drill-sessions/active-for-me                  drawer-banner data feed (any auth role)
 *   POST  /v1/drill-sessions/:id/acknowledge                staff acknowledges drill (any auth role)
 *   POST  /v1/drill-sessions/:id/staff-safe                 staff marks self safe (any auth role)
 *   PATCH /v1/drill-sessions/:id/participants/:staffId      SH/DSH/FM/SHIFT_COMMANDER set/clear reason
 *
 * Refs: BR-A (Drill Management Module), BR-14 (Health Score 10% weight),
 *       Architecture v7 mig 010 (drill_sessions + drill_session_participants),
 *       repo mig 013 (reason taxonomy columns + RLS role-gate),
 *       ADR 0004 (taxonomy decision), docs/research/drill-participant-reason-taxonomy.md.
 */

import { Router, Request, Response } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { setTenantContext } from '../middleware/tenant.js';
import { auditLog } from '../middleware/audit.js';
import { getServiceClient } from '@safecommand/db';

export const drillsRouter = Router();
drillsRouter.use(requireAuth, setTenantContext);

// ──────────────────────────────────────────────────────────────────────────
// Phase 5.18 — taxonomy + helpers

const REASON_CODES = [
  'OFF_DUTY',
  'ON_LEAVE',
  'ON_BREAK',
  'ON_DUTY_ELSEWHERE',
  'DEVICE_OR_NETWORK_ISSUE',
  'OTHER',
] as const;
type ReasonCode = typeof REASON_CODES[number];

const COMMAND_ROLES_FOR_REASON = ['SH', 'DSH', 'FM', 'SHIFT_COMMANDER'] as const;
const FULL_VENUE_READ_ROLES = ['SH', 'DSH', 'FM', 'SHIFT_COMMANDER', 'AUDITOR', 'GM'] as const;

interface ParticipantRow {
  id: string;
  drill_session_id: string;
  staff_id: string;
  status: 'NOTIFIED' | 'ACKNOWLEDGED' | 'SAFE_CONFIRMED' | 'MISSED';
  notified_at: string;
  acknowledged_at: string | null;
  safe_confirmed_at: string | null;
  ack_latency_seconds: number | null;
  reason_code: ReasonCode | null;
  reason_notes: string | null;
  reason_set_by: string | null;
  reason_set_at: string | null;
}

/**
 * Computes whether a participant counts as "excused" for compliance scoring.
 * Single source of truth — UI / PDF / Health Score Breakdown all read this.
 * Per ADR 0004 §"is_excused derived in api response, not stored".
 */
function isExcused(p: ParticipantRow): boolean {
  if (p.status === 'SAFE_CONFIRMED' || p.status === 'ACKNOWLEDGED') return true;
  if (p.reason_code === null) return false;
  if (p.reason_code === 'OTHER') {
    return (p.reason_notes ?? '').trim().length >= 10;
  }
  return true; // OFF_DUTY / ON_LEAVE / ON_BREAK / ON_DUTY_ELSEWHERE / DEVICE_OR_NETWORK_ISSUE
}

// ──────────────────────────────────────────────────────────────────────────
// Existing endpoints — preserved verbatim from Phase 5.11 except where
// extended (annotated inline)

drillsRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  const { data, error } = await getServiceClient()
    .from('drill_sessions')
    .select('*')
    .eq('venue_id', req.auth.venue_id)
    .order('scheduled_for', { ascending: false });

  if (error) {
    res.status(500).json({ error: { code: 'QUERY_FAILED', message: 'Could not fetch drills' } });
    return;
  }
  res.json(data ?? []);
});

/**
 * GET /v1/drill-sessions/active-for-me — drawer-banner data feed.
 *
 * Returns IN_PROGRESS drills where the requester is a participant in NOTIFIED
 * or ACKNOWLEDGED status (i.e. action is still expected from them). Empty
 * array when nothing relevant — banner hidden client-side.
 *
 * Defined BEFORE GET /:id to avoid the path conflict (':id' would otherwise
 * match 'active-for-me').
 */
drillsRouter.get('/active-for-me', async (req: Request, res: Response): Promise<void> => {
  const { venue_id, staff_id } = req.auth;

  const { data: rows, error } = await getServiceClient()
    .from('drill_session_participants')
    .select(
      'id, status, notified_at, acknowledged_at, safe_confirmed_at, ' +
        'drill_session:drill_sessions!inner(id, drill_type, status, scheduled_for, started_at, building_id, venue_id)',
    )
    .eq('staff_id', staff_id)
    .in('status', ['NOTIFIED', 'ACKNOWLEDGED']);

  if (error) {
    res.status(500).json({
      error: { code: 'QUERY_FAILED', message: 'Could not fetch active drills' },
    });
    return;
  }

  // Filter: drill must be IN_PROGRESS + same venue
  // (Supabase nested filter on join would also work; client-side is simpler
  // and matches volume — typical staff has 0-1 active drill at a time.)
  type RowWithDrill = {
    id: string;
    status: ParticipantRow['status'];
    notified_at: string;
    acknowledged_at: string | null;
    safe_confirmed_at: string | null;
    drill_session:
      | {
          id: string;
          drill_type: string;
          status: string;
          scheduled_for: string;
          started_at: string | null;
          building_id: string | null;
          venue_id: string;
        }
      | Array<{
          id: string;
          drill_type: string;
          status: string;
          scheduled_for: string;
          started_at: string | null;
          building_id: string | null;
          venue_id: string;
        }>;
  };

  const active = ((rows ?? []) as unknown as RowWithDrill[])
    .map((r) => {
      const drill = Array.isArray(r.drill_session) ? r.drill_session[0] : r.drill_session;
      if (!drill) return null;
      if (drill.venue_id !== venue_id) return null;
      if (drill.status !== 'IN_PROGRESS') return null;
      return {
        participant_id: r.id,
        participant_status: r.status,
        notified_at: r.notified_at,
        acknowledged_at: r.acknowledged_at,
        safe_confirmed_at: r.safe_confirmed_at,
        drill: {
          id: drill.id,
          drill_type: drill.drill_type,
          status: drill.status,
          scheduled_for: drill.scheduled_for,
          started_at: drill.started_at,
          building_id: drill.building_id,
        },
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  res.json(active);
});

/**
 * GET /v1/drill-sessions/:id — full detail with participants + timeline.
 *
 * Phase 5.18 extension:
 *   - participants[] joined with staff (name, role) + computed `is_excused`
 *   - timeline[] from audit_logs where entity_id matches the drill (lifecycle
 *     events) plus `staff_zone_assignments`-derived zone snapshot is OUT of
 *     scope here (separate `zone_status_log` query if needed)
 *   - aggregate counts from drill_session_participants (live recompute,
 *     authoritative; the denormalised `total_*` columns may lag by milliseconds
 *     during state transitions but are a fallback for legacy clients)
 *   - role-based participant filter: command roles + AUDITOR + GM see all;
 *     other roles see only their own row (defence-in-depth alongside RLS).
 */
drillsRouter.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const id = req.params['id'];
  const { venue_id, staff_id, role } = req.auth;
  const isFullView = (FULL_VENUE_READ_ROLES as readonly string[]).includes(role);

  // Drill row
  const { data: drill, error: drillErr } = await getServiceClient()
    .from('drill_sessions')
    .select('*')
    .eq('id', id)
    .eq('venue_id', venue_id)
    .single();

  if (drillErr || !drill) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Drill not found' } });
    return;
  }

  // Participants — joined with staff. Filter applied in application code
  // matching the RLS RESTRICTIVE policy (defence-in-depth).
  const participantsQuery = getServiceClient()
    .from('drill_session_participants')
    .select(
      'id, drill_session_id, staff_id, status, notified_at, acknowledged_at, safe_confirmed_at, ' +
        'ack_latency_seconds, reason_code, reason_notes, reason_set_by, reason_set_at, ' +
        'staff:staff!staff_id(id, name, role), ' +
        'reason_setter:staff!reason_set_by(id, name, role)',
    )
    .eq('drill_session_id', id)
    .order('notified_at', { ascending: true });

  const { data: pRowsRaw, error: pErr } = isFullView
    ? await participantsQuery
    : await participantsQuery.eq('staff_id', staff_id);

  if (pErr) {
    res.status(500).json({
      error: { code: 'QUERY_FAILED', message: 'Could not fetch participants' },
    });
    return;
  }

  // Decorate with is_excused
  const participants = (pRowsRaw ?? []).map((p) => ({
    ...(p as unknown as ParticipantRow),
    staff: (p as unknown as Record<string, unknown>)['staff'],
    reason_setter: (p as unknown as Record<string, unknown>)['reason_setter'],
    is_excused: isExcused(p as unknown as ParticipantRow),
  }));

  // Timeline — audit_logs entries where entity_id = drill.id, ordered by created_at
  const { data: timeline } = await getServiceClient()
    .from('audit_logs')
    .select('id, action, actor_staff_id, actor_role, metadata, created_at, ip_address, ' +
            'actor:staff(id, name, role)')
    .eq('venue_id', venue_id)
    .eq('entity_id', id)
    .order('created_at', { ascending: true });

  // Aggregate live counts (authoritative)
  const liveCounts = participants.reduce(
    (acc, p) => {
      acc.total++;
      if (p.status === 'NOTIFIED') acc.notified++;
      else if (p.status === 'ACKNOWLEDGED') acc.acknowledged++;
      else if (p.status === 'SAFE_CONFIRMED') acc.safe++;
      else if (p.status === 'MISSED') acc.missed++;
      if (p.is_excused) acc.excused++;
      return acc;
    },
    { total: 0, notified: 0, acknowledged: 0, safe: 0, missed: 0, excused: 0 },
  );

  res.json({
    drill,
    participants,
    timeline: timeline ?? [],
    aggregates: {
      // Live counts from participant rows (authoritative when participants exist)
      total_participants: liveCounts.total,
      notified_count: liveCounts.notified,
      acknowledged_count: liveCounts.acknowledged,
      safe_count: liveCounts.safe,
      missed_count: liveCounts.missed,
      excused_count: liveCounts.excused,
      unexcused_count: liveCounts.total - liveCounts.excused,
      // Denormalised counts on drill_sessions (legacy / fallback for drills
      // that predate Phase 5.18 participant tracking)
      legacy_total_expected: drill.total_staff_expected,
      legacy_total_acknowledged: drill.total_staff_acknowledged,
      legacy_total_safe: drill.total_staff_safe,
      legacy_total_missed: drill.total_staff_missed,
    },
    requester_view: isFullView ? 'full' : 'self',
  });
});

drillsRouter.post(
  '/',
  requireRole('SH', 'DSH', 'FM', 'SHIFT_COMMANDER'),
  auditLog('DRILL_SCHEDULE'),
  async (req: Request, res: Response): Promise<void> => {
    const body = req.body as {
      drill_type?: string;
      scheduled_for?: string;
      building_id?: string | null;
      notes?: string | null;
    };

    if (!body.drill_type || !body.scheduled_for) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'drill_type, scheduled_for required' },
      });
      return;
    }

    const { data, error } = await getServiceClient()
      .from('drill_sessions')
      .insert({
        venue_id: req.auth.venue_id,
        drill_type: body.drill_type,
        scheduled_for: body.scheduled_for,
        building_id: body.building_id ?? null,
        notes: body.notes ?? null,
        status: 'SCHEDULED',
        total_staff_expected: 0,
        total_staff_acknowledged: 0,
        total_staff_safe: 0,
        total_staff_missed: 0,
      })
      .select()
      .single();

    if (error || !data) {
      res.status(500).json({
        error: { code: 'INSERT_FAILED', message: error?.message ?? 'Failed to schedule drill' },
      });
      return;
    }
    res.status(201).json(data);
  },
);

/**
 * PUT /v1/drill-sessions/:id/start — flip SCHEDULED → IN_PROGRESS + enqueue participants.
 *
 * Phase 5.18 enhancement: enqueues `drill_session_participants` rows using
 * the hybrid on-duty determination (per ADR 0004 §"On-duty determination"):
 *   1. First try: staff with active shift assignments at drill start time
 *   2. Fallback (0 results): all is_active staff in venue (filtered by
 *      building_id if drill is building-scoped)
 *   - Logs source path in audit_logs metadata for auditor visibility
 *   - ON CONFLICT (drill_session_id, staff_id) DO NOTHING — idempotent
 *
 * Order of operations (failure-safe):
 *   1. Determine participant set
 *   2. INSERT participants (idempotent)
 *   3. Flip status (the gate — only succeeds if drill is still SCHEDULED)
 *   4. If status flip fails (race), participants already in place; safe.
 */
drillsRouter.put(
  '/:id/start',
  requireRole('SH', 'DSH', 'FM', 'SHIFT_COMMANDER'),
  auditLog('DRILL_START'),
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'];
    const venueId = req.auth.venue_id;

    // Read drill to know building_id scope
    const { data: drill, error: drillErr } = await getServiceClient()
      .from('drill_sessions')
      .select('building_id, status')
      .eq('id', id)
      .eq('venue_id', venueId)
      .single();
    if (drillErr || !drill) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Drill not found' } });
      return;
    }
    if (drill.status !== 'SCHEDULED') {
      res.status(409).json({
        error: { code: 'INVALID_STATE', message: 'Drill must be SCHEDULED to start' },
      });
      return;
    }

    // Hybrid on-duty determination
    let participantStaffIds: string[] = [];
    let sourcePath: 'SHIFT_ROSTER' | 'VENUE_ALL' = 'SHIFT_ROSTER';

    // Path 1: staff with active shift assignments
    const { data: rosterStaff } = await getServiceClient()
      .from('staff_zone_assignments')
      .select(
        'staff_id, shift_instance:shift_instances!inner(status, building_id), staff:staff!inner(id, is_active, primary_building_id)',
      )
      .eq('venue_id', venueId);

    type RosterRow = {
      staff_id: string;
      shift_instance:
        | { status: string; building_id: string | null }
        | Array<{ status: string; building_id: string | null }>;
      staff:
        | { id: string; is_active: boolean; primary_building_id: string | null }
        | Array<{ id: string; is_active: boolean; primary_building_id: string | null }>;
    };

    const rosterIds = new Set<string>();
    for (const row of (rosterStaff ?? []) as RosterRow[]) {
      const si = Array.isArray(row.shift_instance) ? row.shift_instance[0] : row.shift_instance;
      const st = Array.isArray(row.staff) ? row.staff[0] : row.staff;
      if (!si || !st) continue;
      if (si.status !== 'ACTIVE') continue;
      if (!st.is_active) continue;
      // Building scope: if drill is building-scoped, only include staff
      // whose shift instance is in same building OR is venue-wide (NULL)
      if (drill.building_id && si.building_id && si.building_id !== drill.building_id) continue;
      rosterIds.add(row.staff_id);
    }
    participantStaffIds = [...rosterIds];

    // Path 2 (fallback): if no roster matches, use all active staff in venue
    if (participantStaffIds.length === 0) {
      sourcePath = 'VENUE_ALL';
      const { data: allStaff } = await getServiceClient()
        .from('staff')
        .select('id, primary_building_id')
        .eq('venue_id', venueId)
        .eq('is_active', true);

      const filtered = (allStaff ?? []).filter((s: { primary_building_id: string | null }) => {
        // If drill is building-scoped, only include staff with matching primary_building_id
        // (or NULL primary_building_id = venue-wide staff like SH/DSH).
        if (!drill.building_id) return true;
        return s.primary_building_id === drill.building_id || s.primary_building_id === null;
      });
      participantStaffIds = filtered.map((s: { id: string }) => s.id);
    }

    // INSERT participants (idempotent via ON CONFLICT)
    if (participantStaffIds.length > 0) {
      const rows = participantStaffIds.map((sid) => ({
        drill_session_id: id,
        staff_id: sid,
        status: 'NOTIFIED' as const,
      }));
      const { error: insertErr } = await getServiceClient()
        .from('drill_session_participants')
        .upsert(rows, { onConflict: 'drill_session_id,staff_id', ignoreDuplicates: true });
      if (insertErr) {
        res.status(500).json({
          error: { code: 'PARTICIPANTS_INSERT_FAILED', message: insertErr.message },
        });
        return;
      }
    }

    // Now flip status. Only succeeds if drill is still SCHEDULED (idempotent guard).
    const startedAt = new Date().toISOString();
    const { data, error } = await getServiceClient()
      .from('drill_sessions')
      .update({
        status: 'IN_PROGRESS',
        started_at: startedAt,
        started_by_staff_id: req.auth.staff_id,
        total_staff_expected: participantStaffIds.length,
        updated_at: startedAt,
      })
      .eq('id', id)
      .eq('venue_id', venueId)
      .eq('status', 'SCHEDULED')
      .select()
      .single();

    if (error || !data) {
      // Race condition: another caller flipped it; participants safely in place.
      res.status(409).json({
        error: { code: 'INVALID_STATE', message: 'Drill must be SCHEDULED to start' },
      });
      return;
    }

    // Audit metadata: enrich with source path for auditor traceability
    // (the auditLog middleware also writes a generic entry; this is the
    // domain-specific extension)
    void getServiceClient()
      .from('audit_logs')
      .insert({
        venue_id: venueId,
        actor_staff_id: req.auth.staff_id,
        actor_role: req.auth.role,
        action:
          sourcePath === 'SHIFT_ROSTER'
            ? 'DRILL_STARTED_FROM_SHIFT_ROSTER'
            : 'DRILL_STARTED_FROM_VENUE_ALL',
        entity_type: 'drill-sessions',
        entity_id: id,
        metadata: {
          participant_count: participantStaffIds.length,
          source_path: sourcePath,
          building_id: drill.building_id,
        },
      });

    res.json(data);
  },
);

/**
 * PUT /v1/drill-sessions/:id/end — flip IN_PROGRESS → COMPLETED + transition
 * unattested participants to MISSED + recompute aggregate counts.
 *
 * Per ADR 0004: NOTIFIED→MISSED at end-time. ACKNOWLEDGED stays terminal
 * (partial response — they got the alert but didn't complete evacuation).
 * The detail page renders the per-staff timeline showing the difference.
 */
drillsRouter.put(
  '/:id/end',
  requireRole('SH', 'DSH', 'FM', 'SHIFT_COMMANDER'),
  auditLog('DRILL_END'),
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'];
    const venueId = req.auth.venue_id;

    const { data: drill, error: readErr } = await getServiceClient()
      .from('drill_sessions')
      .select('started_at, status')
      .eq('id', id)
      .eq('venue_id', venueId)
      .single();

    if (readErr || !drill) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Drill not found' } });
      return;
    }
    if (drill.status !== 'IN_PROGRESS' || !drill.started_at) {
      res.status(409).json({
        error: { code: 'INVALID_STATE', message: 'Drill must be IN_PROGRESS to end' },
      });
      return;
    }

    const startedAtMs = new Date(drill.started_at).getTime();
    const endedAt = new Date();
    const duration_seconds = Math.floor((endedAt.getTime() - startedAtMs) / 1000);

    // Transition NOTIFIED → MISSED
    await getServiceClient()
      .from('drill_session_participants')
      .update({ status: 'MISSED' })
      .eq('drill_session_id', id)
      .eq('status', 'NOTIFIED');

    // Recompute aggregate counts
    const { data: participantCounts } = await getServiceClient()
      .from('drill_session_participants')
      .select('status')
      .eq('drill_session_id', id);

    const counts = ((participantCounts ?? []) as { status: ParticipantRow['status'] }[]).reduce(
      (acc, p) => {
        acc.total++;
        if (p.status === 'ACKNOWLEDGED' || p.status === 'SAFE_CONFIRMED') acc.acknowledged++;
        if (p.status === 'SAFE_CONFIRMED') acc.safe++;
        if (p.status === 'MISSED') acc.missed++;
        return acc;
      },
      { total: 0, acknowledged: 0, safe: 0, missed: 0 },
    );

    const { data, error } = await getServiceClient()
      .from('drill_sessions')
      .update({
        status: 'COMPLETED',
        ended_at: endedAt.toISOString(),
        duration_seconds,
        total_staff_expected: counts.total,
        total_staff_acknowledged: counts.acknowledged,
        total_staff_safe: counts.safe,
        total_staff_missed: counts.missed,
        updated_at: endedAt.toISOString(),
      })
      .eq('id', id)
      .eq('venue_id', venueId)
      .select()
      .single();

    if (error || !data) {
      res.status(500).json({
        error: { code: 'UPDATE_FAILED', message: error?.message ?? 'Failed to end drill' },
      });
      return;
    }
    res.json(data);
  },
);

drillsRouter.put(
  '/:id/cancel',
  requireRole('SH', 'DSH', 'FM', 'SHIFT_COMMANDER'),
  auditLog('DRILL_CANCEL'),
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'];

    const { data, error } = await getServiceClient()
      .from('drill_sessions')
      .update({
        status: 'CANCELLED',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('venue_id', req.auth.venue_id)
      .eq('status', 'SCHEDULED')
      .select()
      .single();

    if (error || !data) {
      res.status(409).json({
        error: { code: 'INVALID_STATE', message: 'Only SCHEDULED drills can be cancelled' },
      });
      return;
    }
    res.json(data);
  },
);

// ──────────────────────────────────────────────────────────────────────────
// Phase 5.18 — staff-level participant actions

/**
 * POST /v1/drill-sessions/:id/acknowledge — staff acknowledges drill.
 *
 * Idempotent: NOTIFIED → ACKNOWLEDGED; already ACKNOWLEDGED/SAFE_CONFIRMED → no-op.
 * MISSED → 409 (drill ended; can't backdate).
 *
 * Computes ack_latency_seconds = now - drill.started_at.
 */
drillsRouter.post(
  '/:id/acknowledge',
  auditLog('DRILL_PARTICIPANT_ACK'),
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'];
    const { venue_id, staff_id } = req.auth;

    // Read drill + participant
    const { data: drill } = await getServiceClient()
      .from('drill_sessions')
      .select('id, status, started_at')
      .eq('id', id)
      .eq('venue_id', venue_id)
      .single();
    if (!drill) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Drill not found' } });
      return;
    }
    if (drill.status !== 'IN_PROGRESS') {
      res.status(409).json({
        error: { code: 'INVALID_STATE', message: `Drill is ${drill.status}; acknowledgement only accepted while IN_PROGRESS` },
      });
      return;
    }

    const { data: participant } = await getServiceClient()
      .from('drill_session_participants')
      .select('id, status')
      .eq('drill_session_id', id)
      .eq('staff_id', staff_id)
      .single();
    if (!participant) {
      res.status(404).json({
        error: { code: 'NOT_PARTICIPANT', message: 'You are not a participant in this drill' },
      });
      return;
    }

    // Idempotency: terminal/already-acked states
    if (participant.status === 'ACKNOWLEDGED' || participant.status === 'SAFE_CONFIRMED') {
      res.json({ id: participant.id, status: participant.status, idempotent: true });
      return;
    }
    if (participant.status === 'MISSED') {
      res.status(409).json({
        error: { code: 'INVALID_STATE', message: 'Cannot acknowledge a missed participation' },
      });
      return;
    }

    const now = new Date();
    const startedAtMs = drill.started_at ? new Date(drill.started_at).getTime() : now.getTime();
    const ackLatencySeconds = Math.max(0, Math.floor((now.getTime() - startedAtMs) / 1000));

    const { data, error } = await getServiceClient()
      .from('drill_session_participants')
      .update({
        status: 'ACKNOWLEDGED',
        acknowledged_at: now.toISOString(),
        ack_latency_seconds: ackLatencySeconds,
      })
      .eq('id', participant.id)
      .eq('status', 'NOTIFIED') // idempotency guard
      .select()
      .single();

    if (error || !data) {
      res.status(409).json({
        error: { code: 'INVALID_STATE', message: 'Acknowledgement state changed concurrently' },
      });
      return;
    }
    res.json(data);
  },
);

/**
 * POST /v1/drill-sessions/:id/staff-safe — staff marks self safe.
 *
 * Allowed transitions:
 *   NOTIFIED      → SAFE_CONFIRMED  (auto-acknowledge first; sets both timestamps)
 *   ACKNOWLEDGED  → SAFE_CONFIRMED
 *   SAFE_CONFIRMED → no-op (idempotent)
 *   MISSED → 409
 */
drillsRouter.post(
  '/:id/staff-safe',
  auditLog('DRILL_PARTICIPANT_SAFE'),
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'];
    const { venue_id, staff_id } = req.auth;

    const { data: drill } = await getServiceClient()
      .from('drill_sessions')
      .select('id, status, started_at')
      .eq('id', id)
      .eq('venue_id', venue_id)
      .single();
    if (!drill) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Drill not found' } });
      return;
    }
    if (drill.status !== 'IN_PROGRESS') {
      res.status(409).json({
        error: { code: 'INVALID_STATE', message: `Drill is ${drill.status}; mark-safe only accepted while IN_PROGRESS` },
      });
      return;
    }

    const { data: participant } = await getServiceClient()
      .from('drill_session_participants')
      .select('id, status, acknowledged_at, ack_latency_seconds')
      .eq('drill_session_id', id)
      .eq('staff_id', staff_id)
      .single();
    if (!participant) {
      res.status(404).json({
        error: { code: 'NOT_PARTICIPANT', message: 'You are not a participant in this drill' },
      });
      return;
    }

    if (participant.status === 'SAFE_CONFIRMED') {
      res.json({ id: participant.id, status: participant.status, idempotent: true });
      return;
    }
    if (participant.status === 'MISSED') {
      res.status(409).json({
        error: { code: 'INVALID_STATE', message: 'Cannot mark safe on a missed participation' },
      });
      return;
    }

    const now = new Date();
    const update: Record<string, unknown> = {
      status: 'SAFE_CONFIRMED',
      safe_confirmed_at: now.toISOString(),
    };
    // If skipping ack step, backfill acknowledged_at + latency
    if (participant.status === 'NOTIFIED') {
      const startedAtMs = drill.started_at ? new Date(drill.started_at).getTime() : now.getTime();
      update['acknowledged_at'] = now.toISOString();
      update['ack_latency_seconds'] = Math.max(0, Math.floor((now.getTime() - startedAtMs) / 1000));
    }

    const { data, error } = await getServiceClient()
      .from('drill_session_participants')
      .update(update)
      .eq('id', participant.id)
      .select()
      .single();

    if (error || !data) {
      res.status(500).json({
        error: { code: 'UPDATE_FAILED', message: error?.message ?? 'Failed to mark safe' },
      });
      return;
    }
    res.json(data);
  },
);

/**
 * PATCH /v1/drill-sessions/:id/participants/:staffId — set/clear reason.
 *
 * SH/DSH/FM/SHIFT_COMMANDER only. Sets `reason_code` + `reason_notes` +
 * `reason_set_by` + `reason_set_at` atomically.
 *
 * Body:
 *   { reason_code: <one of 6 codes> | null, reason_notes?: string }
 *
 * Validations:
 *   - reason_code = 'OTHER' requires reason_notes ≥10 chars (DB CHECK enforces;
 *     api also pre-validates for clearer error message)
 *   - reason_code = null clears all 4 audit fields (chk_reason_consistency)
 *
 * Idempotent: setting the same reason twice is fine — reason_set_at refreshes.
 */
drillsRouter.patch(
  '/:id/participants/:staffId',
  requireRole(...COMMAND_ROLES_FOR_REASON),
  auditLog('DRILL_PARTICIPANT_REASON_SET'),
  async (req: Request, res: Response): Promise<void> => {
    const drillId = req.params['id'];
    const targetStaffId = req.params['staffId'];
    const { venue_id, staff_id } = req.auth;

    const body = req.body as { reason_code?: ReasonCode | null; reason_notes?: string | null };
    const reasonCode = body.reason_code ?? null;
    const reasonNotes = body.reason_notes ?? null;

    // Validate
    if (reasonCode !== null && !REASON_CODES.includes(reasonCode)) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: `Invalid reason_code. Allowed: ${REASON_CODES.join(', ')} or null`,
        },
      });
      return;
    }
    if (reasonCode === 'OTHER') {
      const trimmed = (reasonNotes ?? '').trim();
      if (trimmed.length < 10) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'reason_notes must be at least 10 characters when reason_code is OTHER',
          },
        });
        return;
      }
    }

    // Verify drill ∈ venue
    const { data: drill } = await getServiceClient()
      .from('drill_sessions')
      .select('id')
      .eq('id', drillId)
      .eq('venue_id', venue_id)
      .single();
    if (!drill) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Drill not found' } });
      return;
    }

    // Locate participant row
    const { data: participant } = await getServiceClient()
      .from('drill_session_participants')
      .select('id, status')
      .eq('drill_session_id', drillId)
      .eq('staff_id', targetStaffId)
      .single();
    if (!participant) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Participant row not found for that staff' },
      });
      return;
    }

    // Build update
    const update: Record<string, unknown> =
      reasonCode === null
        ? {
            reason_code: null,
            reason_notes: null,
            reason_set_by: null,
            reason_set_at: null,
          }
        : {
            reason_code: reasonCode,
            reason_notes: reasonNotes,
            reason_set_by: staff_id,
            reason_set_at: new Date().toISOString(),
          };

    const { data, error } = await getServiceClient()
      .from('drill_session_participants')
      .update(update)
      .eq('id', participant.id)
      .select()
      .single();

    if (error || !data) {
      res.status(500).json({
        error: { code: 'UPDATE_FAILED', message: error?.message ?? 'Failed to set reason' },
      });
      return;
    }
    res.json({ ...data, is_excused: isExcused(data as ParticipantRow) });
  },
);
