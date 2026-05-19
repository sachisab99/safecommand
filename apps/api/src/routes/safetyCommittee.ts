/**
 * /v1/safety-committee — BR-AB Safety Committee Quarterly Log (Arch v9.1
 * §23.1). NABH 6th §FMS evidence. Schema: mig 020 (applied 2026-05-19).
 *
 *   GET    /v1/safety-committee      — venue-wide list (any authenticated)
 *   POST   /v1/safety-committee      — add  (SH/DSH/FM)
 *   PATCH  /v1/safety-committee/:id  — edit (SH/DSH/FM)
 *   DELETE /v1/safety-committee/:id  — remove (SH/DSH)
 *
 * venue-scoped on every query (Rule 2 / EC-03); RLS venue_isolation is
 * the second layer. Mirrors the certifications.ts CRUD pattern.
 */

import { Router, Request, Response } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { setTenantContext } from '../middleware/tenant.js';
import { getServiceClient } from '@safecommand/db';

export const safetyCommitteeRouter = Router();
safetyCommitteeRouter.use(requireAuth, setTenantContext);

const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];

interface Body {
  meeting_date?: string;
  quarter?: string;
  year?: number;
  chairperson_staff_id?: string;
  attendees?: unknown;
  topics_discussed?: unknown;
  action_items?: unknown;
  minutes_s3_key?: string | null;
}

safetyCommitteeRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  const { data, error } = await getServiceClient()
    .from('safety_committee_meetings')
    .select('*, chair:chairperson_staff_id(name, role)')
    .eq('venue_id', req.auth.venue_id)
    .order('meeting_date', { ascending: false });
  if (error) {
    res.status(500).json({ error: { code: 'QUERY_FAILED', message: 'Could not fetch meetings' } });
    return;
  }
  res.json(data ?? []);
});

safetyCommitteeRouter.post(
  '/',
  requireRole('SH', 'DSH', 'FM'),
  async (req: Request, res: Response): Promise<void> => {
    const b = req.body as Body;
    if (!b.meeting_date || !b.quarter || !b.year || !b.chairperson_staff_id) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'meeting_date, quarter, year, chairperson_staff_id required',
        },
      });
      return;
    }
    if (!QUARTERS.includes(b.quarter)) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: `quarter must be one of ${QUARTERS.join(', ')}` },
      });
      return;
    }
    const { data, error } = await getServiceClient()
      .from('safety_committee_meetings')
      .insert({
        venue_id: req.auth.venue_id,
        meeting_date: b.meeting_date,
        quarter: b.quarter,
        year: b.year,
        chairperson_staff_id: b.chairperson_staff_id,
        attendees: b.attendees ?? [],
        topics_discussed: b.topics_discussed ?? [],
        action_items: b.action_items ?? [],
        minutes_s3_key: b.minutes_s3_key ?? null,
        created_by: req.auth.staff_id,
      })
      .select()
      .single();
    if (error || !data) {
      // 23505 = unique_violation on (venue_id, year, quarter)
      const dup = (error as { code?: string } | null)?.code === '23505';
      res.status(dup ? 409 : 500).json({
        error: {
          code: dup ? 'DUPLICATE' : 'INSERT_FAILED',
          message: dup
            ? `A meeting already exists for ${b.quarter} ${b.year}`
            : error?.message ?? 'Failed',
        },
      });
      return;
    }
    res.status(201).json(data);
  },
);

safetyCommitteeRouter.patch(
  '/:id',
  requireRole('SH', 'DSH', 'FM'),
  async (req: Request, res: Response): Promise<void> => {
    const b = req.body as Body;
    if (b.quarter !== undefined && !QUARTERS.includes(b.quarter)) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: `quarter must be one of ${QUARTERS.join(', ')}` },
      });
      return;
    }
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const k of [
      'meeting_date',
      'quarter',
      'year',
      'chairperson_staff_id',
      'attendees',
      'topics_discussed',
      'action_items',
      'minutes_s3_key',
    ] as const) {
      if (b[k] !== undefined) update[k] = b[k];
    }
    const { data, error } = await getServiceClient()
      .from('safety_committee_meetings')
      .update(update)
      .eq('id', req.params['id'])
      .eq('venue_id', req.auth.venue_id)
      .select()
      .single();
    if (error || !data) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Meeting not found' } });
      return;
    }
    res.json(data);
  },
);

safetyCommitteeRouter.delete(
  '/:id',
  requireRole('SH', 'DSH'),
  async (req: Request, res: Response): Promise<void> => {
    const { error } = await getServiceClient()
      .from('safety_committee_meetings')
      .delete()
      .eq('id', req.params['id'])
      .eq('venue_id', req.auth.venue_id);
    if (error) {
      res.status(500).json({ error: { code: 'DELETE_FAILED', message: error.message } });
      return;
    }
    res.status(204).send();
  },
);
