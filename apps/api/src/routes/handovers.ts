/**
 * /v1/handovers — Shift Handover protocol (BR-12).
 *
 * Outgoing commander submits a handover (immutable snapshot of zone status
 * + open incidents, server-assembled at submit time so it can't be
 * client-forged), incoming commander accepts (authority-transfer record).
 *
 * Scope notes:
 *   - Reuses the existing `shift_handovers` table (mig 002) — NO migration.
 *   - The snapshot is server-assembled (zones + open incidents) → an
 *     auditable, tamper-resistant record (Hard Rule 4 spirit).
 *   - Accept records `incoming_accepted_at` + audits the transfer. It does
 *     NOT mutate shift_instances.status — shift activation/closure stays
 *     owned by the existing /v1/shift-instances lifecycle endpoints
 *     (Phase 5.16), so this is purely additive and non-breaking.
 *   - The briefing/notification fan-out on handover is worker-dependent
 *     and explicitly OUT of scope (June; workers paused).
 */

import { Router, Request, Response } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { setTenantContext } from '../middleware/tenant.js';
import { auditLog } from '../middleware/audit.js';
import { getServiceClient } from '@safecommand/db';

export const handoversRouter = Router();
handoversRouter.use(requireAuth, setTenantContext);

const COMMAND_ROLES = ['SH', 'DSH', 'SHIFT_COMMANDER'] as const;
const READ_ROLES = ['SH', 'DSH', 'SHIFT_COMMANDER', 'GM', 'AUDITOR', 'FM'] as const;

interface InstanceLabel {
  id: string;
  shift_date: string;
  status: string;
  shift_name: string | null;
  commander_name: string | null;
}

// Resolve outgoing/incoming instance display labels in one query.
async function labelMap(
  venueId: string,
  ids: string[],
): Promise<Map<string, InstanceLabel>> {
  const map = new Map<string, InstanceLabel>();
  if (ids.length === 0) return map;
  const { data } = await getServiceClient()
    .from('shift_instances')
    .select('id, shift_date, status, shifts(name), commander:commander_staff_id(name)')
    .eq('venue_id', venueId)
    .in('id', ids);
  for (const r of (data ?? []) as unknown as Array<{
    id: string; shift_date: string; status: string;
    shifts: { name: string } | null; commander: { name: string } | null;
  }>) {
    map.set(r.id, {
      id: r.id,
      shift_date: r.shift_date,
      status: r.status,
      shift_name: r.shifts?.name ?? null,
      commander_name: r.commander?.name ?? null,
    });
  }
  return map;
}

type HandoverRow = {
  id: string;
  outgoing_instance_id: string;
  incoming_instance_id: string;
  notes: string | null;
  snapshots: unknown;
  outgoing_submitted_at: string | null;
  incoming_accepted_at: string | null;
  created_at: string;
};

function enrich(h: HandoverRow, m: Map<string, InstanceLabel>) {
  return {
    ...h,
    outgoing: m.get(h.outgoing_instance_id) ?? null,
    incoming: m.get(h.incoming_instance_id) ?? null,
    state: h.incoming_accepted_at ? 'ACCEPTED' : 'SUBMITTED',
  };
}

// ── GET /v1/handovers ──────────────────────────────────────────────────────
handoversRouter.get(
  '/',
  requireRole(...READ_ROLES),
  async (req: Request, res: Response): Promise<void> => {
    const venueId = req.auth.venue_id;
    const { data, error } = await getServiceClient()
      .from('shift_handovers')
      .select(
        'id, outgoing_instance_id, incoming_instance_id, notes, snapshots, ' +
          'outgoing_submitted_at, incoming_accepted_at, created_at',
      )
      .eq('venue_id', venueId)
      .order('created_at', { ascending: false });
    if (error) {
      res.status(500).json({ error: { code: 'QUERY_FAILED', message: 'Could not fetch handovers' } });
      return;
    }
    const rows = (data ?? []) as unknown as HandoverRow[];
    const m = await labelMap(venueId, [
      ...new Set(rows.flatMap((r) => [r.outgoing_instance_id, r.incoming_instance_id])),
    ]);
    res.json(rows.map((r) => enrich(r, m)));
  },
);

// ── GET /v1/handovers/:id ──────────────────────────────────────────────────
handoversRouter.get(
  '/:id',
  requireRole(...READ_ROLES),
  async (req: Request, res: Response): Promise<void> => {
    const venueId = req.auth.venue_id;
    const { data, error } = await getServiceClient()
      .from('shift_handovers')
      .select(
        'id, outgoing_instance_id, incoming_instance_id, notes, snapshots, ' +
          'outgoing_submitted_at, incoming_accepted_at, created_at',
      )
      .eq('id', req.params['id']!)
      .eq('venue_id', venueId)
      .single();
    if (error || !data) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Handover not found' } });
      return;
    }
    const h = data as unknown as HandoverRow;
    const m = await labelMap(venueId, [h.outgoing_instance_id, h.incoming_instance_id]);
    res.json(enrich(h, m));
  },
);

// ── POST /v1/handovers — outgoing submits ──────────────────────────────────
handoversRouter.post(
  '/',
  requireRole(...COMMAND_ROLES),
  auditLog('SHIFT_HANDOVER_SUBMIT'),
  async (req: Request, res: Response): Promise<void> => {
    const venueId = req.auth.venue_id;
    const { outgoing_instance_id, incoming_instance_id, notes } = (req.body ?? {}) as {
      outgoing_instance_id?: string;
      incoming_instance_id?: string;
      notes?: string;
    };

    if (!outgoing_instance_id || !incoming_instance_id) {
      res.status(400).json({
        error: { code: 'MISSING_FIELDS', message: 'outgoing_instance_id and incoming_instance_id are required' },
      });
      return;
    }
    if (outgoing_instance_id === incoming_instance_id) {
      res.status(400).json({
        error: { code: 'SAME_INSTANCE', message: 'Outgoing and incoming shift instances must differ' },
      });
      return;
    }

    // Both instances must exist in the caller's venue.
    const { data: insts } = await getServiceClient()
      .from('shift_instances')
      .select('id')
      .eq('venue_id', venueId)
      .in('id', [outgoing_instance_id, incoming_instance_id]);
    if (!insts || insts.length !== 2) {
      res.status(404).json({
        error: { code: 'INSTANCE_NOT_FOUND', message: 'Shift instance(s) not found in this venue' },
      });
      return;
    }

    // Dup guard: an un-accepted handover already pending for this outgoing.
    const { data: dup } = await getServiceClient()
      .from('shift_handovers')
      .select('id')
      .eq('venue_id', venueId)
      .eq('outgoing_instance_id', outgoing_instance_id)
      .is('incoming_accepted_at', null)
      .limit(1);
    if (dup && dup.length > 0) {
      res.status(409).json({
        error: { code: 'HANDOVER_PENDING', message: 'A pending handover already exists for this outgoing shift', handover_id: dup[0]!.id },
      });
      return;
    }

    // Server-assembled immutable snapshot (zones + open incidents).
    const [zonesRes, incRes] = await Promise.all([
      getServiceClient().from('zones').select('name, current_status').eq('venue_id', venueId),
      getServiceClient()
        .from('incidents')
        .select('id, incident_type, severity, status, zones(name)')
        .eq('venue_id', venueId)
        .in('status', ['ACTIVE', 'CONTAINED']),
    ]);
    const snapshot = {
      captured_at: new Date().toISOString(),
      zones: (zonesRes.data ?? []).map((z) => ({
        name: (z as { name: string }).name,
        status: (z as { current_status: string }).current_status,
      })),
      open_incidents: ((incRes.data ?? []) as unknown as Array<{
        incident_type: string; severity: string; status: string; zones: { name: string } | null;
      }>).map((i) => ({
        type: i.incident_type,
        severity: i.severity,
        status: i.status,
        zone: i.zones?.name ?? null,
      })),
    };

    const { data: row, error: insErr } = await getServiceClient()
      .from('shift_handovers')
      .insert({
        venue_id: venueId,
        outgoing_instance_id,
        incoming_instance_id,
        notes: notes?.trim() || null,
        snapshots: snapshot,
        outgoing_submitted_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (insErr || !row) {
      res.status(500).json({ error: { code: 'CREATE_FAILED', message: 'Could not submit handover' } });
      return;
    }
    res.status(201).json(row);
  },
);

// ── PUT /v1/handovers/:id/accept — incoming accepts (authority transfer) ────
handoversRouter.put(
  '/:id/accept',
  requireRole(...COMMAND_ROLES),
  auditLog('SHIFT_HANDOVER_ACCEPT'),
  async (req: Request, res: Response): Promise<void> => {
    const venueId = req.auth.venue_id;
    const id = req.params['id']!;

    const { data: h, error: readErr } = await getServiceClient()
      .from('shift_handovers')
      .select('id, incoming_accepted_at')
      .eq('id', id)
      .eq('venue_id', venueId)
      .single();
    if (readErr || !h) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Handover not found' } });
      return;
    }
    if (h.incoming_accepted_at) {
      res.status(409).json({ error: { code: 'ALREADY_ACCEPTED', message: 'Handover already accepted' } });
      return;
    }

    const { data: updated, error: upErr } = await getServiceClient()
      .from('shift_handovers')
      .update({ incoming_accepted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('venue_id', venueId)
      .select()
      .single();
    if (upErr || !updated) {
      res.status(500).json({ error: { code: 'UPDATE_FAILED', message: 'Could not accept handover' } });
      return;
    }
    res.json(updated);
  },
);
