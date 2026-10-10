'use client';

// ─────────────────────────────────────────────
//  LeadMind AI — Dashboard Layout (Session 3)
//
//  Final version with auth guard:
//   • Reads isInitialized + isAuthenticated from AuthContext
//   • While restoring session → shows full-screen skeleton
//   • If not authenticated after restore → redirect to /login
//   • If authenticated → render shell normally
//
//  Structure:
//   ┌─────────────────────────────────────────┐
//   │ Sidebar (240px) │ Topbar (h-16)         │
//   │                 ├───────────────────────│
//   │                 │ <children>            │
//   │                 │  (scrollable)         │
//   └─────────────────────────────────────────┘
// ─────────────────────────────────────────────

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Topbar  from '@/src/components/layout/Topbar';
import { useAuthContext } from '@/src/context/AuthContext';
import { PageLoader } from '@/src/components/ui/Spinner';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { isAuthenticated, isInitialized } = useAuthContext();

  // ── Auth guard ──────────────────────────────
  // Wait for the session-restore attempt to finish.
  // If still not authenticated → go to /login.
  useEffect(() => {
    if (isInitialized && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isInitialized, isAuthenticated, router]);

  // ── Session-restore loading state ───────────
  // Show a skeleton shell while the refresh token
  // is being verified (avoids white flash).
  if (!isInitialized) {
    return <DashboardSkeleton />;
  }

  // ── Not authenticated (redirect in flight) ──
  if (!isAuthenticated) {
    return <DashboardSkeleton />;
  }

  // ── Authenticated — render shell ─────────────
  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ backgroundColor: '#0F172A' }}
    >
      {/* Sidebar */}
      <Sidebar />

      {/* Right side */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Topbar />
        <main
          className="flex-1 overflow-y-auto overflow-x-hidden"
          style={{ backgroundColor: '#0F172A' }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}

// ── Loading shell shown during session restore ─

function DashboardSkeleton() {
  return (
    <div
      className="flex h-screen items-center justify-center"
      style={{ backgroundColor: '#0F172A' }}
    >
      <PageLoader label="Loading…" />
    </div>
  );
}
