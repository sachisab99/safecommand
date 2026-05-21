'use client';

/**
 * /patterns — Roster Pattern governance (Dashboard, Pass 4b, Phase 5.24).
 *
 * SH/DSH-facing list of all roster_patterns for the venue with status
 * filter + per-row lifecycle action affordances. Detailed actions live
 * on /patterns/[patternId]; this page is the entry point + browse.
 *
 * Editing (create / staff / cycle positions) is SC-Ops only — link out
 * to Ops Console URL not exposed here (separate auth domain per EC-14).
 */

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { getSession } from '../../lib/auth';
import {
  listPatterns,
  type RosterPattern,
  type RosterPatternStatus,
  STATUS_TONE,
  canManagePatternsRole,
} from '../../lib/rosterPatterns';

const FILTERS: ReadonlyArray<RosterPatternStatus | 'ALL'> = ['ALL', 'DRAFT', 'PUBLISHED', 'SUSPENDED', 'ARCHIVED'];

export default function PatternsListPage() {
  const [session, setSession] = useState<ReturnType<typeof getSession> | null>(null);
  const [patterns, setPatterns] = useState<RosterPattern[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<RosterPatternStatus | 'ALL'>('ALL');

  useEffect(() => {
    setSession(getSession());
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setErr(null);
      const { data, error } = await listPatterns();
      if (cancelled) return;
      if (error) { setErr(error); setLoading(false); return; }
      setPatterns(data ?? []);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    if (!patterns) return [];
    return filter === 'ALL' ? patterns : patterns.filter((p) => p.status === filter);
  }, [patterns, filter]);

  const counts = useMemo(() => {
    if (!patterns) return { ALL: 0, DRAFT: 0, PUBLISHED: 0, SUSPENDED: 0, ARCHIVED: 0 };
    return {
      ALL: patterns.length,
      DRAFT: patterns.filter((p) => p.status === 'DRAFT').length,
      PUBLISHED: patterns.filter((p) => p.status === 'PUBLISHED').length,
      SUSPENDED: patterns.filter((p) => p.status === 'SUSPENDED').length,
      ARCHIVED: patterns.filter((p) => p.status === 'ARCHIVED').length,
    };
  }, [patterns]);

  const canManage = canManagePatternsRole(session?.staff?.role);

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto px-4 py-6">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Roster patterns</h1>
          <p className="text-sm text-gray-600 mt-1">
            Recurring shift patterns for this venue. Validate, publish, sign off, suspend,
            archive, and trigger materialisation from here.
            {!canManage && (
              <span className="block mt-1 text-amber-700">
                Read-only — only SH / DSH / SHIFT_COMMANDER can change pattern state.
              </span>
            )}
          </p>
        </header>

        <div className="mb-6 flex gap-2 flex-wrap">
          {FILTERS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(s)}
              className={`px-3 py-1 rounded text-sm border ${filter === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
            >
              {s} <span className="opacity-70">({counts[s as keyof typeof counts]})</span>
            </button>
          ))}
        </div>

        {loading && (
          <div className="text-center py-10 text-sm text-gray-500">Loading patterns…</div>
        )}

        {err && (
          <div className="p-4 border border-red-200 bg-red-50 rounded text-sm text-red-900">
            Could not load patterns: {err}
          </div>
        )}

        {!loading && !err && filtered.length === 0 && (
          <div className="text-center py-10 text-sm text-gray-500 border border-dashed border-gray-300 rounded">
            No patterns {filter !== 'ALL' && `in ${filter} state `}yet.
            <div className="text-xs mt-2 text-gray-400">
              Patterns are created by SC-Ops in the internal Ops Console.
            </div>
          </div>
        )}

        {!loading && !err && filtered.length > 0 && (
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Cycle</th>
                  <th className="px-4 py-2 font-medium">Effective</th>
                  <th className="px-4 py-2 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const tone = STATUS_TONE[p.status];
                  return (
                    <tr key={p.id} className="border-t border-gray-100">
                      <td className="px-4 py-3">
                        <Link href={`/patterns/${p.id}`} className="text-blue-600 hover:underline font-medium">
                          {p.name}
                        </Link>
                        {p.rotation_pattern_code && (
                          <div className="text-xs text-gray-500 mt-0.5">rotation: {p.rotation_pattern_code}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs border ${tone.bg} ${tone.text} ${tone.border}`}>
                          {tone.label}
                        </span>
                        {p.signed_off_at && <div className="text-xs text-gray-500 mt-0.5">✔ signed off</div>}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {p.cycle_type} · {p.cycle_length_days}d
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {p.effective_from}{p.effective_to ? ` → ${p.effective_to}` : ' (open)'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/patterns/${p.id}`} className="text-blue-600 hover:underline text-sm">
                          Manage →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
