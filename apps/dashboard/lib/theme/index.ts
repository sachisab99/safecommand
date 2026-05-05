/**
 * Dashboard theme barrel — single import surface.
 *
 * Usage in any client component:
 *   import { useBrand, useLabel, useRoleLabel } from '@/lib/theme';
 *
 * Tailwind utility classes (bg-brand-primary, text-brand-primary, etc.)
 * resolve to the active brand at runtime via CSS custom properties set by
 * <ThemeProvider> in app/layout.tsx. See globals.css `@theme` block for the
 * token registration.
 */

export {
  ThemeProvider,
  useBrand,
  useLabel,
  useRoleLabel,
  useIsEnterpriseBrand,
  type ThemeProviderProps,
} from './ThemeProvider';

export {
  SAFECOMMAND_DEFAULT,
  type BrandConfig,
  type RoleOverrides,
} from './types';

export {
  luminance,
  contrastRatio,
  pickContrast,
  passesWcagAA,
  passesWcagAALarge,
  lighten,
  darken,
} from './wcag';
