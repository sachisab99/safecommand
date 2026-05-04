// User's preferred Zone Board view mode, persisted in localStorage.
// 'list'     = Pattern C — floor list + zone drilldown (default)
// 'building' = Pattern D — building cross-section heatmap

export type ZoneViewMode = 'list' | 'building';

const STORAGE_KEY = 'sc_zone_view_mode';

export function getZoneViewMode(): ZoneViewMode {
  if (typeof window === 'undefined') return 'list';
  const v = localStorage.getItem(STORAGE_KEY);
  return v === 'building' ? 'building' : 'list';
}

export function setZoneViewMode(mode: ZoneViewMode): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, mode);
}
