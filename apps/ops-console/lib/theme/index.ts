/**
 * Ops Console theme barrel.
 *
 * Always SafeCommand brand (per EC-14). Tailwind utilities like
 * `bg-brand-primary` resolve via globals.css `@theme` registration to the
 * default values in :root.
 */

export {
  ThemeProvider,
  useBrand,
  useLabel,
  type ThemeProviderProps,
} from './ThemeProvider';

export {
  SAFECOMMAND_DEFAULT,
  type BrandConfig,
} from './types';
