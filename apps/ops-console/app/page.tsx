/**
 * Ops Console home dashboard — single landing surface for the SC Ops team.
 *
 * Shows platform-wide rollups (venues / staff / zones / today's incidents)
 * + recent venues + quick actions. Replaces the prior `redirect('/venues')`
 * which left users with no way to navigate back to a home view.
 *
 * Server component, single getAdminClient() round-trip. Stats are
 * platform-wide (across all venues) — Ops team is venue-agnostic by role
 * (EC-14 — never cross-mounted with venue auth domain).
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getAdminClient } from '@/lib/supabase';

interface VenueRow {
  id: string;
  name: string;
  venue_code: string;
  type: string;
  city: string;
  subscription_tier: string;
  created_at: string;
}

async function getStats() {
  const client = getAdminClient();
  // Today's date in IST for incidents-today count
  const istNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const todayIST = istNow.toISOString().slice(0, 10);

  const [venuesRes, staffRes, zonesRes, incidentsRes, recentRes] = await Promise.all([
    client.from('venues').select('id', { count: 'exact', head: true }),
    client.from('staff').select('is_active', { count: 'exact' }),
    client.from('zones').select('id', { count: 'exact', head: true }),
    client
      .from('incidents')
      .select('id', { count: 'exact', head: true })
      .gte('declared_at', `${todayIST}T00:00:00+05:30`),
    client
      .from('venues')
      .select('id, name, venue_code, type, city, subscription_tier, created_at')
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  // Active staff count derived from rows
  const activeStaff = (staffRes.data ?? []).filter((s) => s.is_active).length;

  return {
    totalVenues: venuesRes.count ?? 0,
    totalStaff: staffRes.count ?? 0,
    activeStaff,
    totalZones: zonesRes.count ?? 0,
    incidentsToday: incidentsRes.count ?? 0,
    recentVenues: (recentRes.data ?? []) as VenueRow[],
  };
}

export default async function HomePage() {
  // Auth gate — bounce to /login if not authenticated. Pre-existing pages
  // didn't enforce this consistently; we close the gap on the home route.
  const cookieStore = await cookies();
  if (!cookieStore.has('ops_auth')) redirect('/login');

  const stats = await getStats();

  return (
    <main className="max-w-6xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Operations overview</h1>
        <p className="text-sm text-gray-500 mt-1">
          Platform-wide rollups across all SafeCommand venues.
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        <StatCard
          label="Venues"
          value={stats.totalVenues}
          tone="primary"
          href="/venues"
        />
        <StatCard
          label="Staff"
          value={stats.totalStaff}
          subtext={`${stats.activeStaff} active`}
          tone="neutral"
        />
        <StatCard label="Zones" value={stats.totalZones} tone="neutral" />
        <StatCard
          label="Incidents today"
          value={stats.incidentsToday}
          tone={stats.incidentsToday > 0 ? 'warn' : 'good'}
        />
      </div>

      {/* Quick actions + recent venues */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-1">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
            Quick actions
          </h2>
          <div className="space-y-2">
            <ActionLink
              href="/venues"
              title="Manage venues"
              description="Create, edit, configure floors / zones / staff / shifts"
            />
            <ActionLink
              href="/venues"
              title="View all venues"
              description="Browse the venue list and drill into details"
            />
          </div>
        </section>

        <section className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
              Recently added venues
            </h2>
            <Link
              href="/venues"
              className="text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              View all →
            </Link>
          </div>

          {stats.recentVenues.length === 0 ? (
            <div className="bg-white border border-dashed border-gray-200 rounded-2xl p-8 text-center text-gray-400 text-sm">
              No venues yet. Create one from the Venues page.
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <ul className="divide-y divide-gray-100">
                {stats.recentVenues.map((v) => (
                  <li key={v.id}>
                    <Link
                      href={`/venues/${v.id}`}
                      className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-gray-50 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-gray-900 truncate">
                            {v.name}
                          </span>
                          <span className="font-mono text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                            {v.venue_code}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {v.type} · {v.city} · {v.subscription_tier}
                        </div>
                      </div>
                      <span className="text-xs text-gray-400 shrink-0">
                        {new Date(v.created_at).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

/* ─── Subcomponents ──────────────────────────────────────────────────────── */

function StatCard({
  label,
  value,
  subtext,
  tone,
  href,
}: {
  label: string;
  value: number;
  subtext?: string;
  tone: 'primary' | 'good' | 'warn' | 'neutral';
  href?: string;
}) {
  const toneClass = {
    primary: 'text-blue-700',
    good: 'text-emerald-700',
    warn: 'text-amber-700',
    neutral: 'text-gray-900',
  }[tone];

  const inner = (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 hover:border-gray-300 transition-colors h-full">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-1">
        {label}
      </div>
      <div className={`text-3xl font-bold ${toneClass}`}>{value}</div>
      {subtext && <div className="text-xs text-gray-500 mt-1">{subtext}</div>}
    </div>
  );

  return href ? <Link href={href}>{inner}</Link> : inner;
}

function ActionLink({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="block bg-white border border-gray-200 rounded-2xl p-4 hover:border-blue-300 hover:bg-blue-50 transition-colors"
    >
      <div className="font-medium text-gray-900 text-sm">{title}</div>
      <div className="text-xs text-gray-500 mt-0.5">{description}</div>
    </Link>
  );
}
