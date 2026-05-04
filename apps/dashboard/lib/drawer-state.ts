// Persists drawer pin state across page reloads on desktop.
// Mobile is always closed-by-default; this only matters at lg:+ breakpoint.

const STORAGE_KEY = 'sc_drawer_pinned';

export function getPinned(): boolean {
  if (typeof window === 'undefined') return true; // SSR default = pinned
  const v = localStorage.getItem(STORAGE_KEY);
  return v === null ? true : v === 'true'; // default = pinned
}

export function setPinned(value: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, String(value));
}
