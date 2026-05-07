/**
 * /v1/certifications routes — BR-22 Staff Certification Tracker.
 *
 * Per-staff professional credentials with expiry tracking. Drives the
 * Certifications component (15% weight) of BR-14 Health Score plus the
 * BR-B soft warning on shift activation.
 *
 * Endpoints:
 *   GET  /v1/certifications        — venue-wide list (any authenticated user)
 *   GET  /v1/certifications/me     — caller's own certs (per-staff focus)
 *   POST /v1/certifications        — add (SH/DSH/FM)
 *   PATCH /v1/certifications/:id   — update (SH/DSH/FM)
 *   DELETE /v1/certifications/:id  — remove (SH/DSH)
 */

import { Router, Request, Response } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { setTenantContext } from '../middleware/tenant.js';
import { getServiceClient } from '@safecommand/db';

export const certificationsRouter = Router();
certificationsRouter.use(requireAuth, setTenantContext);

interface CertRow {
  staff_id: string;
  certification_name: string;
  issued_at: string;
  expires_at: string;
  document_url: string | null;
}

certificationsRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  const { data, error } = await getServiceClient()
    .from('staff_certifications')
    .select('*, staff(name, role)')
    .eq('venue_id', req.auth.venue_id)
    .order('expires_at', { ascending: true });

  if (error) {
    res.status(500).json({
      error: { code: 'QUERY_FAILED', message: 'Could not fetch certifications' },
    });
    return;
  }
  res.json(data ?? []);
});

/** Caller's own certs only — staff-personal */
certificationsRouter.get('/me', async (req: Request, res: Response): Promise<void> => {
  const { data, error } = await getServiceClient()
    .from('staff_certifications')
    .select('*')
    .eq('venue_id', req.auth.venue_id)
    .eq('staff_id', req.auth.staff_id)
    .order('expires_at', { ascending: true });

  if (error) {
    res.status(500).json({
      error: { code: 'QUERY_FAILED', message: 'Could not fetch your certifications' },
    });
    return;
  }
  res.json(data ?? []);
});

certificationsRouter.post(
  '/',
  requireRole('SH', 'DSH', 'FM'),
  async (req: Request, res: Response): Promise<void> => {
    const body = req.body as Partial<CertRow>;
    if (!body.staff_id || !body.certification_name || !body.issued_at || !body.expires_at) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'staff_id, certification_name, issued_at, expires_at required',
        },
      });
      return;
    }
    if (body.issued_at > body.expires_at) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'issued_at cannot be after expires_at',
        },
      });
      return;
    }

    const { data, error } = await getServiceClient()
      .from('staff_certifications')
      .insert({
        venue_id: req.auth.venue_id,
        staff_id: body.staff_id,
        certification_name: body.certification_name,
        issued_at: body.issued_at,
        expires_at: body.expires_at,
        document_url: body.document_url ?? null,
      })
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

certificationsRouter.patch(
  '/:id',
  requireRole('SH', 'DSH', 'FM'),
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'];
    const body = req.body as Partial<CertRow>;
    const update: Record<string, unknown> = {};
    if (body.certification_name !== undefined) update['certification_name'] = body.certification_name;
    if (body.issued_at !== undefined) update['issued_at'] = body.issued_at;
    if (body.expires_at !== undefined) update['expires_at'] = body.expires_at;
    if (body.document_url !== undefined) update['document_url'] = body.document_url;

    const { data, error } = await getServiceClient()
      .from('staff_certifications')
      .update(update)
      .eq('id', id)
      .eq('venue_id', req.auth.venue_id)
      .select()
      .single();

    if (error || !data) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Certification not found' } });
      return;
    }
    res.json(data);
  },
);

certificationsRouter.delete(
  '/:id',
  requireRole('SH', 'DSH'),
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'];
    const { error } = await getServiceClient()
      .from('staff_certifications')
      .delete()
      .eq('id', id)
      .eq('venue_id', req.auth.venue_id);

    if (error) {
      res.status(500).json({
        error: { code: 'DELETE_FAILED', message: error.message },
      });
      return;
    }
    res.status(204).send();
  },
);
