'use client';

/**
 * ThemeProvider — Next.js 16 client component.
 *
 * EC-17 / Rule 19: every colour and label in the dashboard resolves through
 * this provider. Default brand = SafeCommand. Enterprise overrides merge
 * sparsely (per Q2 decision).
 *
 * EC-18 / Rule 20: `powered_by_text` is hard-coded; the provider strips
 * any caller attempt to override it.
 *
 * Strategy for Tailwind v4 + dynamic brand:
 *   - Provider sets CSS custom properties on a wrapper <div> (not :root,
 *     so that nested previews of different brands work in Phase B Apollo
 *     mockup tooling).
 *   - globals.css `@theme` registers `--color-brand-*` Tailwind colour
 *     tokens that read those CSS variables. Tailwind utilities like
 *     `bg-brand-primary`, `text-brand-primary` resolve at runtime.
 *   - Components that need direct access (SVG fills, inline style) use
 *     useBrand() / useColours() hooks.
 *
 * NFR-35: textOnPrimary / textOnSecondary auto-derived via pickContrast().
 */

import React, { createContext, useContext, useMemo, type ReactNode, type CSSProperties } from 'react';
import { type BrandConfig, type RoleOverrides, SAFECOMMAND_DEFAULT } from './types';
import { pickContrast, lighten, darken } from './wcag';

interface ThemeContextValue {
  brand: BrandConfig;
  isEnterpriseBrand: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  brand: SAFECOMMAND_DEFAULT,
  isEnterpriseBrand: false,
});

export interface ThemeProviderProps {
  /**
   * Optional sparse override. Null/undefined fields fall through to defaults.
   * `powered_by_text` is ignored (always forced to the hard-coded literal).
   */
  brand?: Partial<Omit<BrandConfig, 'powered_by_text'>>;
  /**
   * Force this brand for ops-console (always SafeCommand, never enterprise per EC-14).
   * When true, `brand` prop is ignored and SafeCommand defaults are used.
   */
  forceSafeCommand?: boolean;
  children: ReactNode;
}

export function ThemeProvider({
  brand,
  forceSafeCommand,
  children,
}: ThemeProviderProps): React.JSX.Element {
  const value = useMemo<ThemeContextValue>(() => {
    if (forceSafeCommand) {
      return { brand: SAFECOMMAND_DEFAULT, isEnterpriseBrand: false };
    }
    const merged: BrandConfig = brand
      ? {
          ...SAFECOMMAND_DEFAULT,
          ...stripNulls(brand),
          // Rule 20: never overridable
          powered_by_text: 'Platform by SafeCommand',
        }
      : SAFECOMMAND_DEFAULT;
    return {
      brand: merged,
      isEnterpriseBrand:
        brand !== undefined && brand.brand_name !== undefined && brand.brand_name !== 'SafeCommand',
    };
  }, [brand, forceSafeCommand]);

  // CSS custom properties — make brand colours available to Tailwind utilities
  // (bg-brand-primary etc.) without re-rendering on consumer changes.
  const cssVars = useMemo<CSSProperties & Record<`--${string}`, string>>(() => {
    const b = value.brand;
    return {
      '--brand-primary': b.primary_colour,
      '--brand-primary-strong': darken(b.primary_colour, 0.1),
      '--brand-primary-soft': lighten(b.primary_colour, 0.85),
      '--brand-secondary': b.secondary_colour,
      '--brand-text-on-primary': pickContrast(b.primary_colour),
      '--brand-text-on-secondary': pickContrast(b.secondary_colour),
    };
  }, [value.brand]);

  return (
    <ThemeContext.Provider value={value}>
      <div style={cssVars} className="contents">
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Hooks

export function useBrand(): BrandConfig {
  return useContext(ThemeContext).brand;
}

export function useLabel(key: string): string {
  const { brand } = useContext(ThemeContext);
  return brand.terminology_dictionary?.[key] ?? key;
}

export function useRoleLabel(roleCode: keyof RoleOverrides): string {
  const { brand } = useContext(ThemeContext);
  return brand.role_overrides?.[roleCode] ?? roleCode;
}

export function useIsEnterpriseBrand(): boolean {
  return useContext(ThemeContext).isEnterpriseBrand;
}

// ──────────────────────────────────────────────────────────────────────────
// Internal

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
