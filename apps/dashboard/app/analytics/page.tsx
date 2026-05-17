'use client';

/**
 * Safety Analytics — Phase 5.19 / BR-31. Single-venue BI over incidents +
 * SIRE + drills. Read-only; plain Tailwind bars (no chart lib, matches the
 * Health Score Breakdown). Cross-venue (BR-32) is SC-Ops/P2 — not here.
 */

import { useEffect, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { fetchSafetyAnalytics, type SafetyAnalytics } from '../../lib/analytics';

const REASON_LABEL: Record<string, string> = {
  OFF_DUTY: 'Off duty',
  ON_LEAVE: 'On leave',
  ON_BREAK: 'On break',
  ON_DUTY_ELSEWHERE: 'On duty elsewhere',
  DEVICE_OR_NETWORK_ISSUE: 'Device / network issue',
  OTHER: 'Other',
};

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-2xl font-bold text-slate-900">{value}</div>
      <div className="text-xs font-medium text-slate-500 mt-0.5">{label}</div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
    </div>
  );
}

function BarList({
  entries,
  color = 'bg-blue-500',
  highlight,
}: {
  entries: [string, number][];
  color?: string;
  highlight?: string;
}) {
  if (entries.length === 0) return <p className="text-sm italic text-slate-400">No data.</p>;
  const max = Math.max(...entries.map(([, v]) => v), 1);
  return (
    <div className="space-y-2">
      {entries.map(([label, v]) => (
        <div key={label} className="flex items-center gap-3">
          <div className="w-44 shrink-0 truncate text-xs text-slate-600" title={label}>{label}</div>
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full ${label === highlight ? 'bg-red-500' : color} transition-all`}
              style={{ width: `${Math.round((v / max) * 100)}%` }}
            />
          </div>
          <div className="w-10 shrink-0 text-right text-xs font-semibold text-slate-700">{v}</div>
        </div>
      ))}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="mb-4 text-sm font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}

const sortedEntries = (o: Record<string, number>): [string, number][] =>
  Object.entries(o).sort((a, b) => b[1] - a[1]);

export default function AnalyticsPage() {
  const [data, setData] = useState<SafetyAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      const { data: d, error: e } = await fetchSafetyAnalytics();
      setLoading(false);
      if (e || !d) { setError(e ?? 'Load failed'); return; }
      setData(d);
    };
    load();
    const iv = setInterval(load, 60_000);
    return () => clearInterval(iv);
  }, []);

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Safety Analytics</h1>
          <p className="mt-1 text-sm text-slate-500">
            Incident, SIRE response & drill performance for this venue · refreshes every 60s
          </p>
        </div>

        {loading && <div className="flex h-64 items-center justify-center text-slate-400">Loading…</div>}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        )}

        {data && (
          <div className="space-y-5">
            {/* KPI row */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              <Kpi label="Incidents (total)" value={String(data.incidents.total)} sub={`${data.incidents.open} open`} />
              <Kpi label="Resolved" value={String(data.incidents.resolved)} />
              <Kpi
                label="Avg resolution"
                value={data.incidents.avg_resolution_minutes != null ? `${data.incidents.avg_resolution_minutes}m` : '—'}
              />
              <Kpi
                label="SIRE action completion"
                value={data.sire_actions.completion_pct != null ? `${data.sire_actions.completion_pct}%` : '—'}
                sub={`${data.sire_actions.done}/${data.sire_actions.total}`}
              />
              <Kpi
                label="Drill ack rate"
                value={data.drills.participants.ack_rate_pct != null ? `${data.drills.participants.ack_rate_pct}%` : '—'}
                sub={`${data.drills.participants.responded}/${data.drills.participants.total}`}
              />
              <Kpi
                label="Last drill"
                value={data.drills.last_completed_days != null ? `${data.drills.last_completed_days}d ago` : 'never'}
                sub={`${data.drills.completed} completed`}
              />
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <Card title="Incidents by type">
                <BarList entries={sortedEntries(data.incidents.by_type)} color="bg-indigo-500" />
              </Card>
              <Card title="Incidents by severity">
                <BarList entries={sortedEntries(data.incidents.by_severity)} color="bg-orange-500" highlight="SEV1" />
              </Card>
              <Card title="Zone hotspots (top 5)">
                <BarList
                  entries={data.zone_hotspots.map((z) => [z.zone, z.count] as [string, number])}
                  color="bg-rose-500"
                />
              </Card>
              <Card title={`Evacuations (${data.evacuations.total})`}>
                <BarList entries={sortedEntries(data.evacuations.by_type)} color="bg-red-500" />
              </Card>
            </div>

            <Card title="Drill non-response — systemic-gap view">
              <p className="mb-3 text-xs text-slate-500">
                {data.drills.participants.missed} missed of {data.drills.participants.total}.
                A high <strong>Device / network issue</strong> bar concentrated by area indicates
                dead-zone clusters worth investigating.
                {data.drills.participants.avg_ack_latency_seconds != null &&
                  ` · avg ack latency ${data.drills.participants.avg_ack_latency_seconds}s`}
              </p>
              <BarList
                entries={sortedEntries(data.drills.participants.reason_breakdown).map(
                  ([k, v]) => [REASON_LABEL[k] ?? k, v] as [string, number],
                )}
                color="bg-slate-400"
                highlight={REASON_LABEL['DEVICE_OR_NETWORK_ISSUE']}
              />
            </Card>

            <Card title="Incident trend — last 8 weeks">
              <div className="flex items-end gap-2" style={{ height: 96 }}>
                {data.trend_8w.map((w) => {
                  const max = Math.max(...data.trend_8w.map((x) => x.count), 1);
                  return (
                    <div key={w.week_ending} className="flex flex-1 flex-col items-center gap-1">
                      <div className="text-xs font-semibold text-slate-700">{w.count}</div>
                      <div
                        className="w-full rounded-t bg-blue-500"
                        style={{ height: `${Math.max((w.count / max) * 70, 2)}px` }}
                      />
                      <div className="text-[10px] text-slate-400">{w.week_ending.slice(5)}</div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        )}
      </div>
    </AppShell>
  );
}
