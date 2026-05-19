/**
 * /v1/amc-contracts — BR-AF AMC Contract Registry (Arch v9.1 §23.1).
 * DCD UAE / NFPA 25 evidence. Schema: mig 020 (applied 2026-05-19).
 *
 *   GET    /v1/amc-contracts      — venue-wide, soonest-expiring first
 *   POST   /v1/amc-contracts      — add  (SH/DSH/FM)
 *   PATCH  /v1/amc-contracts/:id  — edit (SH/DSH/FM)
 *   DELETE /v1/amc-contracts/:id  — remove (SH/DSH)
 *
 * The 90/30/7-day renewal-alert fan-out is worker-gated (June). This
 * registry + client-computed expiry buckets (like Equipment) is the
 * now-buildable surface. venue-scoped (Rule 2); RLS second layer.
 */

import { Router, Request, Response } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { setTenantContext } from '../middleware/tenant.js';
import { getServiceClient } from '@safecommand/db';

export const amcContractsRouter = Router();
amcContractsRouter.use(requireAuth, setTenantContext);

const CATEGORIES = [
  'FIRE_EXTINGUISHER', 'FIRE_HOSE', 'SPRINKLER', 'FIRE_ALARM', 'FIRE_PUMP',
  'AED', 'EMERGENCY_LIGHTING', 'EXIT_SIGN', 'PA_SYSTEM', 'HVAC', 'GENERATOR',
  'ELEVATOR', 'CCTV', 'ACCESS_CONTROL', 'PEST_CONTROL', 'OTHER',
];
const STATUSES = ['ACTIVE', 'EXPIRED', 'RENEWING', 'TERMINATED'];

interface Body {
  contract_number?: string;
  vendor_name?: string;
  vendor_contact_phone?: string | null;
  vendor_contact_email?: string | null;
  equipment_category?: string;
  equipment_count?: number | null;
  linked_equipment_ids?: string[] | null;
  start_date?: string;
  end_date?: string;
  renewal_value_inr?: number | null;
  status?: string;
  contract_s3_key?: string | null;
}

amcContractsRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  const { data, error } = await getServiceClient()
    .from('amc_contracts')
    .select('*')
    .eq('venue_id', req.auth.venue_id)
    .order('end_date', { ascending: true });
  if (error) {
    res.status(500).json({ error: { code: 'QUERY_FAILED', message: 'Could not fetch contracts' } });
    return;
  }
  res.json(data ?? []);
});

amcContractsRouter.post(
  '/',
  requireRole('SH', 'DSH', 'FM'),
  async (req: Request, res: Response): Promise<void> => {
    const b = req.body as Body;
    if (!b.contract_number || !b.vendor_name || !b.equipment_category || !b.start_date || !b.end_date) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'contract_number, vendor_name, equipment_category, start_date, end_date required',
        },
      });
      return;
    }
    if (!CATEGORIES.includes(b.equipment_category)) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'invalid equipment_category' },
      });
      return;
    }
    if (b.end_date <= b.start_date) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'end_date must be after start_date' },
      });
      return;
    }
    if (b.status !== undefined && !STATUSES.includes(b.status)) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: `status must be one of ${STATUSES.join(', ')}` },
      });
      return;
    }
    const { data, error } = await getServiceClient()
      .from('amc_contracts')
      .insert({
        venue_id: req.auth.venue_id,
        contract_number: b.contract_number,
        vendor_name: b.vendor_name,
        vendor_contact_phone: b.vendor_contact_phone ?? null,
        vendor_contact_email: b.vendor_contact_email ?? null,
        equipment_category: b.equipment_category,
        equipment_count: b.equipment_count ?? null,
        linked_equipment_ids: b.linked_equipment_ids ?? null,
        start_date: b.start_date,
        end_date: b.end_date,
        renewal_value_inr: b.renewal_value_inr ?? null,
        status: b.status ?? 'ACTIVE',
        contract_s3_key: b.contract_s3_key ?? null,
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

amcContractsRouter.patch(
  '/:id',
  requireRole('SH', 'DSH', 'FM'),
  async (req: Request, res: Response): Promise<void> => {
    const b = req.body as Body;
    if (b.equipment_category !== undefined && !CATEGORIES.includes(b.equipment_category)) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'invalid equipment_category' } });
      return;
    }
    if (b.status !== undefined && !STATUSES.includes(b.status)) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: `status must be one of ${STATUSES.join(', ')}` },
      });
      return;
    }
    if (b.start_date !== undefined && b.end_date !== undefined && b.end_date <= b.start_date) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'end_date must be after start_date' },
      });
      return;
    }
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const k of [
      'contract_number', 'vendor_name', 'vendor_contact_phone', 'vendor_contact_email',
      'equipment_category', 'equipment_count', 'linked_equipment_ids', 'start_date',
      'end_date', 'renewal_value_inr', 'status', 'contract_s3_key',
    ] as const) {
      if (b[k] !== undefined) update[k] = b[k];
    }
    const { data, error } = await getServiceClient()
      .from('amc_contracts')
      .update(update)
      .eq('id', req.params['id'])
      .eq('venue_id', req.auth.venue_id)
      .select()
      .single();
    if (error || !data) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Contract not found' } });
      return;
    }
    res.json(data);
  },
);

amcContractsRouter.delete(
  '/:id',
  requireRole('SH', 'DSH'),
  async (req: Request, res: Response): Promise<void> => {
    const { error } = await getServiceClient()
      .from('amc_contracts')
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
