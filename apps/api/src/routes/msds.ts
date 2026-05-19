/**
 * /v1/msds — BR-AG MSDS Document Repository (Arch v9.1 §23.1).
 * OSHA 1910.1200 / NDMA HAZMAT evidence. Schema: mig 020 (2026-05-19).
 *
 *   GET    /v1/msds      — venue-wide list (any authenticated)
 *   POST   /v1/msds      — add  (SH/DSH/FM)
 *   PATCH  /v1/msds/:id  — edit (SH/DSH/FM)
 *   DELETE /v1/msds/:id  — remove (SH/DSH)
 *
 * Incident-subtype linkage (STRUCTURAL_HAZMAT etc.) is the BR-AG core —
 * surfaced for responders. venue-scoped (Rule 2); RLS second layer.
 */

import { Router, Request, Response } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { setTenantContext } from '../middleware/tenant.js';
import { getServiceClient } from '@safecommand/db';

export const msdsRouter = Router();
msdsRouter.use(requireAuth, setTenantContext);

interface Body {
  chemical_name?: string;
  cas_number?: string | null;
  hazard_class?: string[] | null;
  msds_s3_key?: string;
  msds_version?: string | null;
  issuing_vendor?: string | null;
  issue_date?: string | null;
  expiry_date?: string | null;
  linked_incident_subtypes?: string[] | null;
  storage_zone_ids?: string[] | null;
  storage_quantity?: string | null;
}

msdsRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  const { data, error } = await getServiceClient()
    .from('msds_documents')
    .select('*')
    .eq('venue_id', req.auth.venue_id)
    .order('chemical_name', { ascending: true });
  if (error) {
    res.status(500).json({ error: { code: 'QUERY_FAILED', message: 'Could not fetch MSDS records' } });
    return;
  }
  res.json(data ?? []);
});

msdsRouter.post(
  '/',
  requireRole('SH', 'DSH', 'FM'),
  async (req: Request, res: Response): Promise<void> => {
    const b = req.body as Body;
    if (!b.chemical_name || !b.chemical_name.trim() || !b.msds_s3_key) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'chemical_name and msds_s3_key required' },
      });
      return;
    }
    const { data, error } = await getServiceClient()
      .from('msds_documents')
      .insert({
        venue_id: req.auth.venue_id,
        chemical_name: b.chemical_name.trim(),
        cas_number: b.cas_number ?? null,
        hazard_class: b.hazard_class ?? null,
        msds_s3_key: b.msds_s3_key,
        msds_version: b.msds_version ?? null,
        issuing_vendor: b.issuing_vendor ?? null,
        issue_date: b.issue_date ?? null,
        expiry_date: b.expiry_date ?? null,
        linked_incident_subtypes: b.linked_incident_subtypes ?? null,
        storage_zone_ids: b.storage_zone_ids ?? null,
        storage_quantity: b.storage_quantity ?? null,
        created_by: req.auth.staff_id,
      })
      .select()
      .single();
    if (error || !data) {
      res.status(500).json({ error: { code: 'INSERT_FAILED', message: error?.message ?? 'Failed' } });
      return;
    }
    res.status(201).json(data);
  },
);

msdsRouter.patch(
  '/:id',
  requireRole('SH', 'DSH', 'FM'),
  async (req: Request, res: Response): Promise<void> => {
    const b = req.body as Body;
    if (b.chemical_name !== undefined && !b.chemical_name.trim()) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'chemical_name cannot be empty' },
      });
      return;
    }
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const k of [
      'chemical_name', 'cas_number', 'hazard_class', 'msds_s3_key', 'msds_version',
      'issuing_vendor', 'issue_date', 'expiry_date', 'linked_incident_subtypes',
      'storage_zone_ids', 'storage_quantity',
    ] as const) {
      if (b[k] !== undefined) update[k] = k === 'chemical_name' ? String(b[k]).trim() : b[k];
    }
    const { data, error } = await getServiceClient()
      .from('msds_documents')
      .update(update)
      .eq('id', req.params['id'])
      .eq('venue_id', req.auth.venue_id)
      .select()
      .single();
    if (error || !data) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'MSDS record not found' } });
      return;
    }
    res.json(data);
  },
);

msdsRouter.delete(
  '/:id',
  requireRole('SH', 'DSH'),
  async (req: Request, res: Response): Promise<void> => {
    const { error } = await getServiceClient()
      .from('msds_documents')
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
