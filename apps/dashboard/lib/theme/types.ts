/**
 * Brand types — mirrors mobile + corporate_brand_configs schema.
 *
 * Kept in sync with apps/mobile/src/theme/ThemeProvider.tsx. When updating
 * the BrandConfig shape here, update the mobile file too (or vice versa).
 * In Phase B these types will derive from a generated Supabase type for
 * the corporate_brand_configs table (Spec Migration 008 / repo 010).
 */

export interface RoleOverrides {
  SH?: string;
  DSH?: string;
  SHIFT_COMMANDER?: string;
  GM?: string;
  AUDITOR?: string;
  FM?: string;
  FLOOR_SUPERVISOR?: string;
  GROUND_STAFF?: string;
}

export interface BrandConfig {
  /** Logo URL (S3 presigned for enterprise; static asset path for SafeCommand default) */
  logo_url: string | null;
  primary_colour: string;
  secondary_colour: string;
  brand_name: string;
  app_display_name: string;
  notification_sender_name: string;
  role_overrides: RoleOverrides | null;
  terminology_dictionary: Record<string, string> | null;
  report_header_text: string | null;
  /** Hard-coded credit (EC-18 / Rule 20). Always 'Platform by SafeCommand'. */
  powered_by_text: 'Platform by SafeCommand';
}

/** SafeCommand default brand — applied at provider root before any enterprise override. */
export const SAFECOMMAND_DEFAULT: BrandConfig = {
  logo_url: null,
  primary_colour: '#1E3A5F',
  secondary_colour: '#3B82F6',
  brand_name: 'SafeCommand',
  app_display_name: 'SafeCommand',
  notification_sender_name: 'SafeCommand',
  role_overrides: null,
  terminology_dictionary: null,
  report_header_text: null,
  powered_by_text: 'Platform by SafeCommand',
};
