/**
 * ThemeProvider — runtime brand resolution.
 *
 * EC-17 / Rule 19 — non-deferrable: every colour and label in the codebase
 * passes through this provider. Default brand = SafeCommand (always available
 * even before any corporate_account_id is known). Enterprise brand layer
 * (Phase 2) overrides only the contractually agreed fields; everything else
 * falls through to defaults — sparse-by-design (per Q2 decision).
 *
 * EC-18 / Rule 20 — `powered_by_text` is HARD-CODED here (DB CHECK constraint
 * mirrors this). Cannot be NULL. Cannot be modified. Cannot be removed.
 *
 * NFR-34 — brand config fetched and applied within 1s of authentication.
 * Cache 24h in AsyncStorage (wired in Phase B when corporate_brand_configs
 * table is deployed; this scaffold renders SafeCommand defaults until then).
 *
 * NFR-35 — WCAG 2.1 AA enforcement on safety-critical screens. Default
 * SafeCommand colours are pre-validated; enterprise overrides MUST pass
 * SC Ops contrast check (4.5:1) before activation.
 */

import React, { createContext, useContext, useMemo, type ReactNode } from 'react';

// ──────────────────────────────────────────────────────────────────────────
// Types — mirrors corporate_brand_configs schema (Migration 010 / Spec Mig 008)

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

/**
 * BrandConfig — pluggable per corporate_account_id.
 *
 * Sparse-by-design: any nullable field that's null falls through to the
 * SafeCommand default. SC Ops only populates the fields contractually
 * agreed for that enterprise account.
 *
 * `powered_by_text` is non-nullable and hard-coded — see EC-18 / Rule 20.
 */
export interface BrandConfig {
  /** Logo URL (S3 presigned for enterprise; static asset for SafeCommand default) */
  logo_url: string | null;
  /** Primary brand colour — used for headers, primary buttons, focus states */
  primary_colour: string;
  /** Secondary brand colour — used for accents, secondary buttons */
  secondary_colour: string;
  /** Brand name (displayed in app chrome, splash, push sender) */
  brand_name: string;
  /** App display name (Android/iOS home-screen label) */
  app_display_name: string;
  /** Push + WhatsApp sender display name */
  notification_sender_name: string;
  /** Per-role display name overrides — JWT role codes unchanged (BR-84) */
  role_overrides: RoleOverrides | null;
  /** Up to 50 term substitutions (e.g. "Incident" → "Safety Event") (BR-83) */
  terminology_dictionary: Record<string, string> | null;
  /** Compliance/drill/incident report letterhead text */
  report_header_text: string | null;
  /** Hard-coded credit (EC-18 / Rule 20). Always 'Platform by SafeCommand'. */
  powered_by_text: 'Platform by SafeCommand';
}

// ──────────────────────────────────────────────────────────────────────────
// SafeCommand default brand
// Always loaded at provider root; enterprise overrides merge on top.

export const SAFECOMMAND_DEFAULT: BrandConfig = {
  logo_url: null,
  primary_colour: '#1E3A5F',     // Navy (matches existing PhoneScreen badge)
  secondary_colour: '#3B82F6',   // Blue accent
  brand_name: 'SafeCommand',
  app_display_name: 'SafeCommand',
  notification_sender_name: 'SafeCommand',
  role_overrides: null,
  terminology_dictionary: null,
  report_header_text: null,
  powered_by_text: 'Platform by SafeCommand',
};

// ──────────────────────────────────────────────────────────────────────────
// Context

interface ThemeContextValue {
  brand: BrandConfig;
  /** True when an enterprise brand override is active (vs SafeCommand default) */
  isEnterpriseBrand: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  brand: SAFECOMMAND_DEFAULT,
  isEnterpriseBrand: false,
});

// ──────────────────────────────────────────────────────────────────────────
// Provider

export interface ThemeProviderProps {
  /**
   * Optional partial brand override. Sparse — null/undefined fields fall
   * through to SafeCommand defaults. `powered_by_text` is ignored if passed
   * (always forced to the hard-coded literal — Rule 20).
   */
  brand?: Partial<Omit<BrandConfig, 'powered_by_text'>>;
  children: ReactNode;
}

export function ThemeProvider({ brand, children }: ThemeProviderProps): React.JSX.Element {
  const value = useMemo<ThemeContextValue>(() => {
    const merged: BrandConfig = brand
      ? {
          ...SAFECOMMAND_DEFAULT,
          ...stripNulls(brand),
          // Rule 20: powered_by_text is non-overridable
          powered_by_text: 'Platform by SafeCommand',
        }
      : SAFECOMMAND_DEFAULT;
    return {
      brand: merged,
      isEnterpriseBrand: brand !== undefined && brand.brand_name !== undefined && brand.brand_name !== 'SafeCommand',
    };
  }, [brand]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// ──────────────────────────────────────────────────────────────────────────
// Hooks

/**
 * useBrand — access the active brand configuration.
 * Default: SafeCommand. Enterprise: merged config from corporate_brand_configs.
 *
 * Usage:
 *   const brand = useBrand();
 *   <View style={{ backgroundColor: brand.primary_colour }}>
 *   <Image source={{ uri: brand.logo_url ?? defaultLogoAsset }} />
 *   <Text>{brand.powered_by_text}</Text>  // always 'Platform by SafeCommand'
 */
export function useBrand(): BrandConfig {
  return useContext(ThemeContext).brand;
}

/**
 * useLabel — resolve a UI label through the terminology dictionary.
 * Falls through to the input string if no override is configured (BR-83).
 *
 * Usage:
 *   const label = useLabel('Incident');  // returns 'Safety Event' for Apollo
 *   <Text>{label}</Text>
 *
 * Note: this is for in-app role/feature labels. User-visible STATIC strings
 * still use i18n keys via i18next (EC-15 / Rule 11). Use useLabel for terms
 * that may be rebranded per enterprise (Incident, Zone, Building, Shift,
 * Auditor, etc.) and i18next for everything else.
 */
export function useLabel(key: string): string {
  const { brand } = useContext(ThemeContext);
  return brand.terminology_dictionary?.[key] ?? key;
}

/**
 * useRoleLabel — resolve a role display name through role_overrides (BR-84).
 *
 * JWT role codes never change (RBAC integrity). This hook only affects what
 * the user sees in the UI. Returns the input role code if no override is set.
 *
 * Usage:
 *   const display = useRoleLabel('SH');  // 'Apollo Safety Head' or 'SH'
 */
export function useRoleLabel(roleCode: keyof RoleOverrides): string {
  const { brand } = useContext(ThemeContext);
  return brand.role_overrides?.[roleCode] ?? roleCode;
}

/**
 * useIsEnterpriseBrand — useful for conditional UI (e.g., hide
 * 'SafeCommand' marketing copy on enterprise-branded screens, but always
 * show the 'Powered by SafeCommand' credit per EC-18).
 */
export function useIsEnterpriseBrand(): boolean {
  return useContext(ThemeContext).isEnterpriseBrand;
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers

/** Strip null/undefined values from a partial — used for sparse override merge */
function stripNulls<T extends object>(obj: Partial<T>): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(obj) as Array<keyof T>) {
    const val = obj[key];
    if (val !== null && val !== undefined) {
      out[key] = val;
    }
  }
  return out;
}
