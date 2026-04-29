import { z } from 'zod';

// ─── Auth Schemas ─────────────────────────────────────────────────────────────

export const SendOtpSchema = z.object({
  phone: z
    .string()
    .regex(/^\+91[6-9]\d{9}$/, 'Phone must be +91 followed by 10-digit Indian mobile number'),
});

export const VerifyOtpSchema = z.object({
  phone: z.string().regex(/^\+91[6-9]\d{9}$/),
  otp: z.string().length(6).regex(/^\d{6}$/),
});

export const RegisterDeviceTokenSchema = z.object({
  token: z.string().min(1),
  platform: z.enum(['ANDROID', 'IOS']),
});

// ─── Venue Schemas ────────────────────────────────────────────────────────────

export const CreateVenueSchema = z.object({
  name: z.string().min(2).max(200),
  type: z.enum(['HOSPITAL', 'MALL', 'HOTEL', 'CORPORATE']),
  city: z.string().min(2).max(100),
  address: z.string().max(500).optional(),
  subscription_tier: z.enum(['ESSENTIAL', 'PROFESSIONAL', 'ENTERPRISE', 'CHAIN']),
});

export const FestivalModeSchema = z.object({
  active: z.boolean(),
});

// ─── Floor + Zone Schemas ─────────────────────────────────────────────────────

export const CreateFloorSchema = z.object({
  name: z.string().min(1).max(100),
  floor_number: z.number().int(),
});

export const CreateZoneSchema = z.object({
  floor_id: z.string().uuid(),
  name: z.string().min(1).max(100),
  zone_type: z.string().min(1).max(50),
  two_person_required: z.boolean().default(false),
});

export const UpdateZoneStatusSchema = z.object({
  status: z.enum(['ALL_CLEAR', 'ATTENTION', 'INCIDENT_ACTIVE']),
});

// ─── Staff Schemas ────────────────────────────────────────────────────────────

export const CreateStaffSchema = z.object({
  phone: z.string().regex(/^\+91[6-9]\d{9}$/),
  name: z.string().min(2).max(200),
  role: z.enum([
    'SH',
    'DSH',
    'SHIFT_COMMANDER',
    'GM',
    'AUDITOR',
    'FM',
    'FLOOR_SUPERVISOR',
    'GROUND_STAFF',
  ]),
});

export const UpdateStaffSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  role: z
    .enum([
      'SH',
      'DSH',
      'SHIFT_COMMANDER',
      'GM',
      'AUDITOR',
      'FM',
      'FLOOR_SUPERVISOR',
      'GROUND_STAFF',
    ])
    .optional(),
  is_active: z.boolean().optional(),
});

// ─── Schedule Template Schemas ────────────────────────────────────────────────

export const CreateScheduleTemplateSchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(1000).optional(),
  frequency: z.enum([
    'HOURLY',
    'EVERY_2H',
    'EVERY_4H',
    'EVERY_6H',
    'EVERY_8H',
    'DAILY',
    'WEEKLY',
    'MONTHLY',
    'QUARTERLY',
    'ANNUAL',
    'CUSTOM',
  ]),
  assigned_role: z.enum([
    'SH',
    'DSH',
    'SHIFT_COMMANDER',
    'GM',
    'AUDITOR',
    'FM',
    'FLOOR_SUPERVISOR',
    'GROUND_STAFF',
  ]),
  evidence_type: z.enum(['NONE', 'PHOTO', 'TEXT', 'NUMERIC', 'CHECKLIST']),
  escalation_chain: z
    .array(
      z.enum([
        'SH',
        'DSH',
        'SHIFT_COMMANDER',
        'GM',
        'AUDITOR',
        'FM',
        'FLOOR_SUPERVISOR',
        'GROUND_STAFF',
      ]),
    )
    .min(1),
  escalation_interval_minutes: z.number().int().min(5).max(1440).default(30),
});

// ─── Task Schemas ─────────────────────────────────────────────────────────────

export const CompleteTaskSchema = z
  .object({
    evidence_type: z.enum(['NONE', 'PHOTO', 'TEXT', 'NUMERIC', 'CHECKLIST']),
    evidence_url: z.string().url().optional(),
    evidence_text: z.string().max(2000).optional(),
    evidence_numeric: z.number().optional(),
    evidence_checklist: z.array(z.object({ item: z.string(), checked: z.boolean() })).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.evidence_type === 'PHOTO' && !data.evidence_url) {
      ctx.addIssue({ code: 'custom', message: 'evidence_url required for PHOTO type' });
    }
    if (data.evidence_type === 'TEXT' && !data.evidence_text) {
      ctx.addIssue({ code: 'custom', message: 'evidence_text required for TEXT type' });
    }
    if (data.evidence_type === 'NUMERIC' && data.evidence_numeric === undefined) {
      ctx.addIssue({ code: 'custom', message: 'evidence_numeric required for NUMERIC type' });
    }
    if (data.evidence_type === 'CHECKLIST' && !data.evidence_checklist?.length) {
      ctx.addIssue({ code: 'custom', message: 'evidence_checklist required for CHECKLIST type' });
    }
  });

// ─── Incident Schemas ─────────────────────────────────────────────────────────

export const CreateIncidentSchema = z.object({
  incident_type: z.enum(['FIRE', 'MEDICAL', 'SECURITY', 'EVACUATION', 'STRUCTURAL', 'OTHER']),
  severity: z.enum(['SEV1', 'SEV2', 'SEV3']),
  zone_id: z.string().uuid().optional(),
  description: z.string().max(2000).optional(),
});

export const UpdateIncidentStatusSchema = z.object({
  status: z.enum(['CONTAINED', 'RESOLVED', 'CLOSED']),
});

// ─── VMS Schemas ──────────────────────────────────────────────────────────────

export const VmsCheckinSchema = z.object({
  mode: z.enum(['MANUAL', 'ID_PHOTO', 'AADHAAR_QR', 'PRE_REGISTERED', 'SELF_SERVICE_QR']),
  entry_point_id: z.string().uuid(),
  visitor_data: z.object({
    name: z.string().min(1).max(200),
    phone: z.string().regex(/^\+91[6-9]\d{9}$/),
    purpose: z.string().max(500).optional(),
    host_name: z.string().max(200).optional(),
    expected_duration_minutes: z.number().int().min(1).max(1440).optional(),
  }),
  id_photo_url: z.string().url().optional(),
});

export const VmsCheckoutSchema = z.object({
  visit_record_id: z.string().uuid(),
});

// ─── Communication Schemas ────────────────────────────────────────────────────

export const CreateCommunicationSchema = z.object({
  scope_type: z.enum(['VENUE_WIDE', 'FLOOR', 'ZONE', 'ROLE', 'INDIVIDUAL', 'SHIFT', 'COMMAND_CHAIN']),
  scope_id: z.string().optional(),
  purpose_type: z.enum(['BROADCAST', 'BRIEFING', 'ALERT', 'CUSTOM_TASK']),
  message: z.string().min(1).max(2000),
  scheduled_at: z.string().datetime().optional(),
});

// ─── Type exports from Zod ────────────────────────────────────────────────────

export type SendOtpInput = z.infer<typeof SendOtpSchema>;
export type VerifyOtpInput = z.infer<typeof VerifyOtpSchema>;
export type CreateVenueInput = z.infer<typeof CreateVenueSchema>;
export type CreateFloorInput = z.infer<typeof CreateFloorSchema>;
export type CreateZoneInput = z.infer<typeof CreateZoneSchema>;
export type CreateStaffInput = z.infer<typeof CreateStaffSchema>;
export type CreateScheduleTemplateInput = z.infer<typeof CreateScheduleTemplateSchema>;
export type CompleteTaskInput = z.infer<typeof CompleteTaskSchema>;
export type CreateIncidentInput = z.infer<typeof CreateIncidentSchema>;
export type VmsCheckinInput = z.infer<typeof VmsCheckinSchema>;
