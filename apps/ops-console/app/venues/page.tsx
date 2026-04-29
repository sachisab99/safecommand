import Link from 'next/link';
import { logoutAction } from '@/actions/auth';
import { getAdminClient } from '@/lib/supabase';
import type { Venue } from '@safecommand/types';

async function getVenues(): Promise<Venue[]> {
  const { data, error } = await getAdminClient()
    .from('venues')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Venue[];
}

const TIER_BADGE: Record<string, string> = {
  ESSENTIAL: 'bg-gray-100 text-gray-700',
  PROFESSIONAL: 'bg-blue-100 text-blue-700',
  ENTERPRISE: 'bg-purple-100 text-purple-700',
  CHAIN: 'bg-amber-100 text-amber-700',
};

export default async function VenuesPage() {
  const venues = await getVenues();

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">SC</span>
            </div>
            <span className="font-semibold text-gray-900">Ops Console</span>
          </div>
          <form action={logoutAction}>
            <button className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Venues</h1>
            <p className="text-sm text-gray-500 mt-0.5">{venues.length} venue{venues.length !== 1 ? 's' : ''} on the platform</p>
          </div>
          <Link
            href="/venues/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <span>+</span> New venue
          </Link>
        </div>

        {venues.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
            <p className="text-gray-400 text-sm">No venues yet. Create your first venue to get started.</p>
            <Link href="/venues/new" className="mt-4 inline-block text-sm text-blue-600 hover:underline">
              Create venue →
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Venue</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Code</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Tier</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {venues.map((v) => (
                  <tr key={v.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{v.name}</div>
                      <div className="text-gray-400 text-xs">{v.city}</div>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-gray-600">{v.venue_code}</td>
                    <td className="px-6 py-4 text-gray-600">{v.type}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${TIER_BADGE[v.subscription_tier] ?? 'bg-gray-100 text-gray-600'}`}>
                        {v.subscription_tier}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${v.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                        {v.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link href={`/venues/${v.id}`} className="text-blue-600 hover:underline text-xs font-medium">
                        Manage →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
