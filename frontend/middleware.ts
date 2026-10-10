// ─────────────────────────────────────────────
//  LeadMind AI — Next.js Middleware (Session 3)
//
//  Runs on the Edge before every matched request.
//  Uses the refreshToken cookie as the auth signal
//  (the cookie is HttpOnly, set by the backend).
//
//  Rules:
//   /             → always redirect to /login
//   /dashboard/*  → protected; unauthenticated → /login
//   /login        → always shown (never auto-skipped)
// ─────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token      = request.cookies.get('refreshToken')?.value;
  const isLoggedIn = Boolean(token);

  // Root redirect — always land on the login page
  if (pathname === '/') {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Protect all dashboard routes (including sub-routes)
  if (pathname.startsWith('/dashboard')) {
    if (!isLoggedIn) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('from', pathname); // preserve intended destination
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/',
    '/login',
    '/dashboard',
    '/dashboard/:path*',
  ],
};