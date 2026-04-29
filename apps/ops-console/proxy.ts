import { NextRequest, NextResponse } from 'next/server';

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith('/login')) return NextResponse.next();

  const sessionToken = process.env['OPS_SESSION_TOKEN'];
  const cookie = req.cookies.get('ops_auth')?.value;

  if (!sessionToken || cookie !== sessionToken) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.svg).*)'],
};
