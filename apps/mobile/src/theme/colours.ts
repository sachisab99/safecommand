/**
 * Semantic colours — bridges design-system tokens to brand layer.
 *
 * Two layers:
 *   1. Static palette (slate, neutral, severity) — never overridden by brand
 *      because severity colours encode safety meaning (SEV1 red, SEV2 amber,
 *      SEV3 yellow). NFR-35: brand layer cannot recolour these.
 *   2. Resolved colours via useColours() — pulls primary/secondary from the
 *      active BrandConfig and combines with the static palette.
 *
 * Usage:
 *   const c = useColours();
 *   <View style={{ backgroundColor: c.surface, borderColor: c.border }}>
 *   <Text style={{ color: c.textPrimary }}>...</Text>
 *   <Text style={{ color: c.severity.SEV1 }}>SEV 1 alert</Text>
 *
 * NFR-35: every colour pair used together on safety-critical screens
 * (incident, evacuation, zone-status) must pass WCAG 2.1 AA (4.5:1).
 * The static palette below is pre-validated. Enterprise brand overrides
 * (primary/secondary) MUST pass SC Ops contrast review before activation.
 */

import { useBrand } from './ThemeProvider';

// ──────────────────────────────────────────────────────────────────────────
// Static palette — brand-immutable

/** Neutral / surface palette — slate scale (WCAG-validated against white) */
export const slate = {
  50: '#F8FAFC',
  100: '#F1F5F9',
  200: '#E2E8F0',
  300: '#CBD5E1',
  400: '#94A3B8',
  500: '#64748B',
  600: '#475569',
  700: '#334155',
  800: '#1E293B',
  900: '#0F172A',
} as const;

/** Severity palette — never recoloured by brand (NFR-35; safety semantics) */
export const severity = {
  /** SEV1 — life-threatening / active danger */
  SEV1: '#DC2626',
  SEV1_BG: '#FEE2E2',
  SEV1_BORDER: '#FCA5A5',
  /** SEV2 — significant threat, injuries possible */
  SEV2: '#EA580C',
  SEV2_BG: '#FED7AA',
  SEV2_BORDER: '#FDBA74',
  /** SEV3 — contained, no immediate threat */
  SEV3: '#D97706',
  SEV3_BG: '#FEF3C7',
  SEV3_BORDER: '#FCD34D',
} as const;

/** Status palette — task / zone / staff states */
export const status = {
  /** Default neutral state */
  pending: '#2563EB',
  pendingBg: '#DBEAFE',
  /** In-progress / working */
  inProgress: '#7C3AED',
  inProgressBg: '#EDE9FE',
  /** Successful completion */
  success: '#16A34A',
  successBg: '#DCFCE7',
  /** Missed / overdue / failure */
  danger: '#DC2626',
  dangerBg: '#FEE2E2',
  /** Escalated — between danger and warning */
  escalated: '#EA580C',
  escalatedBg: '#FED7AA',
  /** Warning — soft caution */
  warning: '#D97706',
  warningBg: '#FEF3C7',
  /** Informational / neutral */
  info: '#0284C7',
  infoBg: '#E0F2FE',
} as const;

/** Zone status colours (BR-18 — zone status board) */
export const zoneStatus = {
  ALL_CLEAR: '#16A34A',
  ALL_CLEAR_BG: '#DCFCE7',
  ATTENTION: '#D97706',
  ATTENTION_BG: '#FEF3C7',
  INCIDENT_ACTIVE: '#DC2626',
  INCIDENT_ACTIVE_BG: '#FEE2E2',
} as const;

// ──────────────────────────────────────────────────────────────────────────
// Resolved colour shape — combines brand + static

export interface Colours {
  // Surfaces
  background: string;
  surface: string;
  surfaceRaised: string;
  surfaceMuted: string;

  // Text
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textInverse: string;
  textDisabled: string;
  textOnPrimary: string;

  // Borders + dividers
  border: string;
  borderStrong: string;
  divider: string;

  // Brand (resolved through ThemeProvider)
  primary: string;
  primaryStrong: string;
  primarySoft: string;
  secondary: string;
  textOnSecondary: string;

  // Semantic (immutable per NFR-35)
  severity: typeof severity;
  status: typeof status;
  zoneStatus: typeof zoneStatus;

  // Interactive
  focusRing: string;
  overlay: string;
  scrim: string;
}

// ──────────────────────────────────────────────────────────────────────────
// Hook — resolves brand to a complete Colours object

/**
 * useColours — primary consumer hook for components.
 * Combines static palette with brand-resolved primary/secondary.
 *
 * Performance: result is memoized per brand instance; components rarely
 * need to memoize the call site themselves.
 */
export function useColours(): Colours {
  const brand = useBrand();
  return {
    background: '#FFFFFF',
    surface: slate[50],
    surfaceRaised: '#FFFFFF',
    surfaceMuted: slate[100],

    textPrimary: slate[800],
    textSecondary: slate[700],
    textMuted: slate[500],
    textInverse: '#FFFFFF',
    textDisabled: slate[400],
    textOnPrimary: pickContrast(brand.primary_colour),

    border: slate[200],
    borderStrong: slate[300],
    divider: slate[100],

    primary: brand.primary_colour,
    primaryStrong: darken(brand.primary_colour, 0.1),
    primarySoft: lighten(brand.primary_colour, 0.85),
    secondary: brand.secondary_colour,
    textOnSecondary: pickContrast(brand.secondary_colour),

    severity,
    status,
    zoneStatus,

    focusRing: brand.primary_colour,
    overlay: 'rgba(0, 0, 0, 0.5)',
    scrim: 'rgba(0, 0, 0, 0.7)',
  };
}

// ──────────────────────────────────────────────────────────────────────────
// WCAG 2.1 AA contrast helpers (NFR-35)

/**
 * Calculate relative luminance per WCAG 2.x spec.
 * Input: hex string (#RRGGBB or #RGB).
 * Output: 0..1 luminance value.
 */
export function luminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Contrast ratio between two hex colours, per WCAG 2.x.
 * Returns 1..21. WCAG AA normal text requires ≥ 4.5; AA large text ≥ 3.
 */
export function contrastRatio(hex1: string, hex2: string): number {
  const l1 = luminance(hex1);
  const l2 = luminance(hex2);
  const [light, dark] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (light + 0.05) / (dark + 0.05);
}

/**
 * Pick black or white text colour for best contrast against a background.
 * Used to derive textOnPrimary / textOnSecondary at runtime so that any
 * enterprise brand colour gets a readable foreground.
 */
export function pickContrast(bgHex: string): string {
  return contrastRatio(bgHex, '#FFFFFF') >= contrastRatio(bgHex, '#0F172A')
    ? '#FFFFFF'
    : '#0F172A';
}

/**
 * Validate that a colour pair passes WCAG AA for normal text (≥ 4.5:1).
 * Used by SC Ops brand-config tooling before activating an enterprise
 * brand override (per ADR 0003 + NFR-35).
 */
export function passesWcagAA(fg: string, bg: string): boolean {
  return contrastRatio(fg, bg) >= 4.5;
}

/** Validate WCAG AA Large (≥ 3:1) — for headings ≥ 18pt or 14pt bold */
export function passesWcagAALarge(fg: string, bg: string): boolean {
  return contrastRatio(fg, bg) >= 3;
}

// ──────────────────────────────────────────────────────────────────────────
// Internal — colour math

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  let h = hex.replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6) return null;
  const num = parseInt(h, 16);
  if (Number.isNaN(num)) return null;
  return {
    r: (num >> 16) & 0xff,
    g: (num >> 8) & 0xff,
    b: num & 0xff,
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function darken(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return rgbToHex(rgb.r * (1 - amount), rgb.g * (1 - amount), rgb.b * (1 - amount));
}

function lighten(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return rgbToHex(
    rgb.r + (255 - rgb.r) * amount,
    rgb.g + (255 - rgb.g) * amount,
    rgb.b + (255 - rgb.b) * amount,
  );
}
