/**
 * /venues/[id]/patterns — Roster Pattern list (Ops Console, Pass 4a).
 *
 * Lists all roster_patterns for a venue with status filter + a slim
 * "+ New Pattern" inline form (creates a DRAFT with header fields only;
 * detailed staff + cycle editing happens on the /patterns/[patternId] page).
 *
 * Lifecycle moves (validate / publish / sign-off / suspend / archive /
 * materialise) live on the dashboard — see Pass 4b. The Delete button
 * here is for DRAFT cleanup only.
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAdminClient } from '@/lib/supabase';
import {
  createPatternDraftAction,
  deletePatternAction,
} from '@/actions/rosterPatterns';

type SearchParams = { status?: string };

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}

interface RosterPatternRow {
  id: string;
  venue_id: string;
  name: string;
  cycle_type: string;
  cycle_length_days: number;
  rotation_pattern_code: string | null;
  effective_from: string;
  effective_to: string | null;
  status: 'DRAFT' | 'PUBLISHED' | 'SUSPENDED' | 'ARCHIVED';
  published_at: string | null;
  signed_off_at: string | null;
  created_at: string;
}

interface RotationRow {
  code: string;
  name: string;
  cycle_length_days: number;
}

const STATUS_FILTERS = ['ALL', 'DRAFT', 'PUBLISHED', 'SUSPENDED', 'ARCHIVED'] as const;

const STATUS_BADGE: Record<RosterPatternRow['status'], string> = {
  DRAFT:     'bg-gray-100 text-gray-800 border-gray-300',
  PUBLISHED: 'bg-green-100 text-green-800 border-green-300',
  SUSPENDED: 'bg-amber-100 text-amber-800 border-amber-300',
  ARCHIVED:  'bg-slate-100 text-slate-600 border-slate-300',
};

export default async function PatternsPage({ params, searchParams }: PageProps) {
  const { id: venueId } = await params;
  const sp = (await searchParams) ?? {};
  const filter = (STATUS_FILTERS as readonly string[]).includes(sp.status ?? 'ALL') ? (sp.status ?? 'ALL') : 'ALL';

  const db = getAdminClient();
  const [venueRes, rotationsRes, patternsAllRes] = await Promise.all([
    db.from('venues').select('id, code, name, type').eq('id', venueId).single(),
    db.from('rotation_cycle_library')
      .select('code, name, cycle_length_days')
      .order('cycle_length_days', { ascending: true })
      .order('code', { ascending: true }),
    db.from('roster_patterns')
      .select('*')
      .eq('venue_id', venueId)
      .order('created_at', { ascending: false }),
  ]);

  if (venueRes.error || !venueRes.data) notFound();

  const venue = venueRes.data as { id: string; code: string; name: string; type: string };
  const rotations = (rotationsRes.data ?? []) as RotationRow[];
  const patterns = (patternsAllRes.data ?? []) as RosterPatternRow[];
  const filtered = filter === 'ALL' ? patterns : patterns.filter((p) => p.status === filter);

  const counts = {
    ALL: patterns.length,
    DRAFT: patterns.filter((p) => p.status === 'DRAFT').length,
    PUBLISHED: patterns.filter((p) => p.status === 'PUBLISHED').length,
    SUSPENDED: patterns.filter((p) => p.status === 'SUSPENDED').length,
    ARCHIVED: patterns.filter((p) => p.status === 'ARCHIVED').length,
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
        <Link href="/venues" className="hover:underline">Venues</Link>
        <span>/</span>
        <Link href={`/venues/${venueId}`} className="hover:underline">{venue.code}</Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">Roster patterns</span>
      </div>

      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Roster patterns</h1>
        <p className="text-sm text-gray-600 mt-1">
          {venue.name} · BR-AK / BR-AL / BR-AM (Phase 5.24). DRAFT patterns are edited here;
          lifecycle actions (Validate · Publish · Sign-off · Suspend · Archive · Materialise)
          happen from the venue dashboard.
        </p>
      </header>

      {/* Status filter */}
      <div className="mb-6 flex gap-2 flex-wrap">
        {STATUS_FILTERS.map((s) => (
          <Link
            key={s}
            href={`/venues/${venueId}/patterns${s === 'ALL' ? '' : `?status=${s}`}`}
            className={`px-3 py-1 rounded text-sm border ${filter === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
          >
            {s} <span className="opacity-70">({counts[s as keyof typeof counts]})</span>
          </Link>
        ))}
      </div>

      {/* Create-draft form */}
      <section className="mb-8 border border-gray-200 rounded-lg p-5 bg-white">
        <h2 className="font-medium text-gray-900 mb-3">+ New roster pattern (DRAFT)</h2>
        <form action={createPatternDraftAction} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input type="hidden" name="venue_id" value={venueId} />

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Name *</span>
            <input
              required
              type="text"
              name="name"
              placeholder="e.g. 24×7 Security — 4-on-2-off"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded text-sm"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Cycle type *</span>
            <select
              required
              name="cycle_type"
              defaultValue="WEEKLY"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded text-sm bg-white"
            >
              <option value="WEEKLY">WEEKLY</option>
              <option value="BIWEEKLY">BIWEEKLY</option>
              <option value="N_WEEK_ROTATION">N_WEEK_ROTATION</option>
              <option value="CUSTOM_DAYS">CUSTOM_DAYS</option>
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Cycle length (days) *</span>
            <input
              required
              type="number"
              name="cycle_length_days"
              min={1}
              max={60}
              defaultValue={7}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded text-sm"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">
              Rotation library (optional)
              <span className="text-gray-400 font-normal ml-1">{rotations.length} built-in</span>
            </span>
            <select
              name="rotation_pattern_code"
              defaultValue=""
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded text-sm bg-white"
            >
              <option value="">— none —</option>
              {rotations.map((r) => (
                <option key={r.code} value={r.code}>{r.name} ({r.cycle_length_days}d)</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Effective from *</span>
            <input
              required
              type="date"
              name="effective_from"
              defaultValue={today}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded text-sm"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Effective to <span className="text-gray-400 font-normal">(optional)</span></span>
            <input
              type="date"
              name="effective_to"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded text-sm"
            />
          </label>

          <div className="md:col-span-2 flex justify-end">
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700"
            >
              Create draft
            </button>
          </div>
        </form>
      </section>

      {/* Pattern list */}
      <section>
        {filtered.length === 0 ? (
          <div className="text-center py-10 text-sm text-gray-500 border border-dashed border-gray-300 rounded">
            No patterns {filter !== 'ALL' && `in ${filter} state `}yet.
          </div>
        ) : (
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Cycle</th>
                  <th className="px-4 py-2 font-medium">Effective</th>
                  <th className="px-4 py-2 font-medium">Created</th>
                  <th className="px-4 py-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-t border-gray-100">
                    <td className="px-4 py-3">
                      <Link href={`/venues/${venueId}/patterns/${p.id}`} className="text-blue-600 hover:underline font-medium">
                        {p.name}
                      </Link>
                      {p.rotation_pattern_code && (
                        <div className="text-xs text-gray-500 mt-0.5">rotation: {p.rotation_pattern_code}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs border ${STATUS_BADGE[p.status]}`}>
                        {p.status}
                      </span>
                      {p.signed_off_at && <div className="text-xs text-gray-500 mt-0.5">signed off</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {p.cycle_type} · {p.cycle_length_days}d
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {p.effective_from}{p.effective_to ? ` → ${p.effective_to}` : ' (open)'}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {new Date(p.created_at).toLocaleDateString('en-IN')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/venues/${venueId}/patterns/${p.id}`}
                        className="text-blue-600 hover:underline text-sm"
                      >
                        {p.status === 'DRAFT' ? 'Edit →' : 'View →'}
                      </Link>
                      {p.status === 'DRAFT' && (
                        <form action={deletePatternAction} className="inline ml-3">
                          <input type="hidden" name="venue_id" value={venueId} />
                          <input type="hidden" name="id" value={p.id} />
                          <button
                            type="submit"
                            className="text-red-600 hover:underline text-sm"
                            title="Delete this DRAFT pattern"
                          >
                            Delete
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
