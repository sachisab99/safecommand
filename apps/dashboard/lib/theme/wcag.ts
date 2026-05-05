/**
 * WCAG 2.1 AA contrast helpers — mirror of mobile colours.ts.
 *
 * Used by:
 *   - ThemeProvider to derive textOnPrimary / textOnSecondary at runtime
 *   - SC Ops brand-config tooling (Phase B) to gate enterprise activation
 *     before any brand override goes live (NFR-35).
 *
 * Keep in sync with apps/mobile/src/theme/colours.ts.
 */

/** Calculate relative luminance per WCAG 2.x. Input: hex string (#RRGGBB or #RGB). */
export function luminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two hex colours. Returns 1..21. */
export function contrastRatio(hex1: string, hex2: string): number {
  const l1 = luminance(hex1);
  const l2 = luminance(hex2);
  const [light, dark] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (light + 0.05) / (dark + 0.05);
}

/** Pick black or white text for best contrast against a background. */
export function pickContrast(bgHex: string): string {
  return contrastRatio(bgHex, '#FFFFFF') >= contrastRatio(bgHex, '#0F172A')
    ? '#FFFFFF'
    : '#0F172A';
}

/** WCAG AA normal text — ≥ 4.5:1. */
export function passesWcagAA(fg: string, bg: string): boolean {
  return contrastRatio(fg, bg) >= 4.5;
}

/** WCAG AA large text (≥18pt or 14pt bold) — ≥ 3:1. */
export function passesWcagAALarge(fg: string, bg: string): boolean {
  return contrastRatio(fg, bg) >= 3;
}

/** Lighten a hex colour by `amount` (0..1) towards white. */
export function lighten(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return rgbToHex(
    rgb.r + (255 - rgb.r) * amount,
    rgb.g + (255 - rgb.g) * amount,
    rgb.b + (255 - rgb.b) * amount,
  );
}

/** Darken a hex colour by `amount` (0..1) towards black. */
export function darken(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return rgbToHex(rgb.r * (1 - amount), rgb.g * (1 - amount), rgb.b * (1 - amount));
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
  const c = (n: number): string =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
