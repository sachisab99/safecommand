/**
 * Design-system tokens (brand-agnostic).
 *
 * These are the foundational design constants used by every screen, every
 * component, every layout primitive. They are intentionally separate from
 * brand tokens (colours, logo, terminology) — those live in colours.ts and
 * ThemeProvider.tsx and resolve at runtime via useBrand() / useLabel().
 *
 * Spacing scale follows a 4px grid (matches existing screen patterns:
 * 4/8/12/16/24/32/48). Touch targets enforced ≥48dp per NFR-08.
 *
 * EC-17 / Rule 19: every screen uses these tokens — no hardcoded numbers.
 */

// ──────────────────────────────────────────────────────────────────────────
// Spacing — 4px grid

export const spacing = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
  '4xl': 64,
  '5xl': 96,
} as const;

export type SpacingToken = keyof typeof spacing;

// ──────────────────────────────────────────────────────────────────────────
// Typography — type scale (font sizes + line heights)

export const fontSize = {
  caption: 12,
  small: 13,
  body: 14,
  bodyLarge: 16,
  h6: 18,
  h5: 20,
  h4: 22,
  h3: 26,
  h2: 30,
  h1: 36,
  display: 44,
} as const;

export type FontSizeToken = keyof typeof fontSize;

export const lineHeight = {
  tight: 1.15,
  snug: 1.3,
  normal: 1.5,
  relaxed: 1.7,
} as const;

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  heavy: '800',
} as const;

export type FontWeightToken = keyof typeof fontWeight;

export const letterSpacing = {
  tight: -0.4,
  normal: 0,
  wide: 0.5,
  wider: 1,
  widest: 1.5,
} as const;

// ──────────────────────────────────────────────────────────────────────────
// Border radii

export const radius = {
  none: 0,
  xs: 2,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 20,
  pill: 999,
  circle: 9999,
} as const;

export type RadiusToken = keyof typeof radius;

// ──────────────────────────────────────────────────────────────────────────
// Border widths

export const borderWidth = {
  none: 0,
  hairline: 0.5,
  thin: 1,
  medium: 2,
  thick: 3,
} as const;

// ──────────────────────────────────────────────────────────────────────────
// Shadows / elevation
// React Native: iOS uses shadow*, Android uses elevation. Both are emitted
// here so a Stylesheet picks up whichever the platform respects.

export const shadow = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.10,
    shadowRadius: 6,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 6,
  },
  xl: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
} as const;

export type ShadowToken = keyof typeof shadow;

// ──────────────────────────────────────────────────────────────────────────
// Touch targets — NFR-08 enforcement
// Minimum 48×48dp on every interactive element.

export const touch = {
  /** Absolute minimum hitslop edge — never below this */
  minTarget: 48,
  /** Comfortable target for primary actions */
  primary: 56,
  /** Recommended hitSlop padding around small icons */
  hitSlop: { top: 12, right: 12, bottom: 12, left: 12 },
} as const;

// ──────────────────────────────────────────────────────────────────────────
// Layout breakpoints
// Phone-first responsive Phase 1 per UX-DESIGN-DECISIONS.md.
// Tablet+ breakpoints are for the dashboard responsive work; mobile native
// app rarely crosses tablet width in practice.

export const breakpoint = {
  phone: 0,
  phoneLarge: 414,
  tablet: 768,
  tabletLarge: 1024,
  desktop: 1280,
  desktopLarge: 1536,
} as const;

export type BreakpointToken = keyof typeof breakpoint;

// ──────────────────────────────────────────────────────────────────────────
// Z-index layers
// Predeclared so overlapping UI never wars over numbers.

export const zIndex = {
  base: 0,
  raised: 10,
  sticky: 20,
  drawer: 100,
  overlay: 200,
  modal: 300,
  popover: 400,
  toast: 500,
  alert: 1000,
} as const;

export type ZIndexToken = keyof typeof zIndex;

// ──────────────────────────────────────────────────────────────────────────
// Motion / animation durations (ms)

export const duration = {
  instant: 0,
  fast: 150,
  normal: 250,
  slow: 350,
  slower: 500,
} as const;

export type DurationToken = keyof typeof duration;

// ──────────────────────────────────────────────────────────────────────────
// Opacity scale (semantic states)

export const opacity = {
  disabled: 0.4,
  hover: 0.85,
  pressed: 0.7,
  overlay: 0.5,
  scrim: 0.7,
} as const;

// ──────────────────────────────────────────────────────────────────────────
// Aggregate tokens export — convenient single import for consumers.

export const tokens = {
  spacing,
  fontSize,
  lineHeight,
  fontWeight,
  letterSpacing,
  radius,
  borderWidth,
  shadow,
  touch,
  breakpoint,
  zIndex,
  duration,
  opacity,
} as const;

export type Tokens = typeof tokens;
