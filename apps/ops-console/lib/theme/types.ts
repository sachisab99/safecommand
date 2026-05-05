/**
 * Brand types — minimal duplicate of dashboard/mobile types.
 *
 * Ops Console is the platform-internal tool (EC-14: separate auth domain
 * from venues). It NEVER receives an enterprise brand override — every
 * SC Ops user always sees SafeCommand branding regardless of which
 * corporate account they're configuring. This file provides the type +
 * default for that fixed brand context.
 *
 * Kept minimal because no per-corporate brand resolution happens here;
 * useBrand() and useLabel() always return SafeCommand defaults.
 */

export interface BrandConfig {
  primary_colour: string;
  secondary_colour: string;
  brand_name: string;
  app_display_name: string;
  /** Hard-coded credit (EC-18 / Rule 20). Always 'Platform by SafeCommand'. */
  powered_by_text: 'Platform by SafeCommand';
}

export const SAFECOMMAND_DEFAULT: BrandConfig = {
  primary_colour: '#1E3A5F',
  secondary_colour: '#3B82F6',
  brand_name: 'SafeCommand Ops',
  app_display_name: 'SafeCommand Operations Console',
  powered_by_text: 'Platform by SafeCommand',
};
