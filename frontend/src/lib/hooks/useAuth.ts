'use client';

// ─────────────────────────────────────────────
//  LeadMind AI — useAuth Hook
//
//  The single public interface for auth state
//  across the entire frontend. Every component
//  that needs auth data imports THIS, never
//  AuthContext directly.
//
//  Usage:
//    const { admin, isAuthenticated, login, logout } = useAuth();
//    const { isLoading } = useAuth();
//
//  Available everywhere inside <AuthProvider>.
// ─────────────────────────────────────────────

import { useAuthContext } from '@/src/context/AuthContext';
import { AdminUser, LoginRequest } from '@/src/types/auth';

// ── Return type (explicit for IDE autocomplete) ──

interface UseAuthReturn {
  /** Authenticated admin — null if not logged in */
  admin: AdminUser | null;
  /** True while login / logout / session-restore is in flight */
  isLoading: boolean;
  /** True once the initial session-restore attempt has finished.
   *  Use this to avoid flashing the login page on refresh. */
  isInitialized: boolean;
  /** Convenience boolean — admin !== null */
  isAuthenticated: boolean;
  /** Log in with email + password. Throws AuthError on failure. */
  login: (credentials: LoginRequest) => Promise<void>;
  /** Log out — clears tokens + redirects to /login */
  logout: () => Promise<void>;
}

export function useAuth(): UseAuthReturn {
  return useAuthContext();
}