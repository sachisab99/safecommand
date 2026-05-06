/**
 * proxy.ts — Ops Console auth gate.
 *
 * NOTE: this file is Next.js 16's "proxy" — the renamed equivalent of
 * `middleware.ts` from earlier Next versions. The runtime contract is the
 * same: this function runs on every incoming request before any page or
 * server action handler. Looking for the auth gate? It's here.
 *
 * Behaviour:
 *   - /login is whitelisted (otherwise the login form itself bounces)
 *   - every other route requires the `ops_auth` cookie value to MATCH
 *     `OPS_SESSION_TOKEN` (not just exist — prevents cookie-injection)
 *   - static assets (`_next/static`, images, favicons, *.svg) are
 *     excluded via the matcher to avoid running on every asset fetch
 *
 * EC-14 (Ops Console separate auth domain) is enforced architecturally
 * because this app is a separate deployment from the venue dashboard,
 * not by anything in this file.
 */

import { NextRequest, NextResponse } from 'next/server';

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const sessionToken = process.env['OPS_SESSION_TOKEN'];
  const cookie = req.cookies.get('ops_auth')?.value;
  const isAuthed = !!sessionToken && cookie === sessionToken;

  // Login page: skip gate, but if user is already authed bounce them to /
  if (pathname.startsWith('/login')) {
    if (isAuthed) return NextResponse.redirect(new URL('/', req.url));
    return NextResponse.next();
  }

  if (!isAuthed) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.svg).*)'],
};
