/**
 * Dashboard safety-analytics client — Phase 5.19 / BR-31.
 * Single GET against the api aggregation endpoint; render-only.
 */
import { apiFetch } from './api';

export interface SafetyAnalytics {
  incidents: {
    total: number;
    open: number;
    resolved: number;
    sire: number;
    legacy: number;
    avg_resolution_minutes: number | null;
    by_type: Record<string, number>;
    by_severity: Record<string, number>;
    by_status: Record<string, number>;
  };
  sire_actions: {
    total: number;
    done: number;
    in_progress: number;
    blocked: number;
    skipped: number;
    completion_pct: number | null;
  };
  evacuations: { total: number; by_type: Record<string, number> };
  zone_hotspots: { zone: string; count: number }[];
  drills: {
    total: number;
    completed: number;
    scheduled: number;
    last_completed_days: number | null;
    participants: {
      total: number;
      responded: number;
      missed: number;
      ack_rate_pct: number | null;
      avg_ack_latency_seconds: number | null;
      reason_breakdown: Record<string, number>;
    };
  };
  trend_8w: { week_ending: string; count: number }[];
}

export async function fetchSafetyAnalytics() {
  return apiFetch<SafetyAnalytics>('/analytics/safety');
}
