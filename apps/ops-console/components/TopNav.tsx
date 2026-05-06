/**
 * TopNav — persistent global navigation for the Ops Console.
 *
 * Server component. Reads the `ops_auth` cookie to detect login state:
 *   - Authed   → render full nav (brand → /, Venues → /venues, Sign out)
 *   - No cookie → render nothing (lets the login page stay chrome-free)
 *
 * Pattern reference: AWS Console / Stripe Dashboard / Vercel — top bar with
 * brand-as-home-link, primary section nav, and trailing user/sign-out.
 *
 * Why server component (not client): Ops Console is a thin admin tool, no
 * tabs need realtime updates; cookie read is server-side anyway. Keeps the
 * bundle minimal.
 */

import Link from 'next/link';
import { cookies } from 'next/headers';
import { logoutAction } from '@/actions/auth';

export async function TopNav() {
  const cookieStore = await cookies();
  const authed = cookieStore.has('ops_auth');

  if (!authed) return null;

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
        {/* Brand → home */}
        <Link
          href="/"
          className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          aria-label="Ops Console home"
        >
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <span className="text-white font-bold text-sm">SC</span>
          </div>
          <span className="font-semibold text-gray-900">Ops Console</span>
        </Link>

        {/* Section links */}
        <nav className="flex items-center gap-6">
          <Link
            href="/"
            className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
          >
            Home
          </Link>
          <Link
            href="/venues"
            className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
          >
            Venues
          </Link>
          <form action={logoutAction} className="inline">
            <button
              type="submit"
              className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
            >
              Sign out
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}
