'use client';

// ─────────────────────────────────────────────
//  LeadMind AI — Auth Context
//
//  Responsibilities:
//   1. Hold the authenticated admin + token state
//   2. On app mount → call refreshAccessToken() to
//      silently restore session from httpOnly cookie
//   3. Listen for the 'auth:unauthorized' event fired
//      by the axios interceptor → auto-logout + redirect
//   4. Expose login(), logout() to the whole app
//
//  Cookie strategy recap:
//   • refreshToken → httpOnly cookie (set/cleared by backend)
//   • accessToken  → in-memory via tokenStore (this context
//     restores it on mount via /api/auth/refresh)
// ─────────────────────────────────────────────

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  loginUser,
  logoutUser,
  refreshAccessToken,
   getCurrentAdmin,
} from '@/src/lib/api/auth';
import { AdminUser, LoginRequest } from '@/src/types/auth';
import { getAuthErrorMessage } from '@/src/lib/utils/authErrors';

// ── Context shape ─────────────────────────────

interface AuthContextValue {
  /** Authenticated admin object, null if not logged in */
  admin: AdminUser | null;
  /** True while session restore or login/logout is in flight */
  isLoading: boolean;
  /** True once the initial session-restore attempt has finished */
  isInitialized: boolean;
  /** Whether an admin is currently authenticated */
  isAuthenticated: boolean;
  /** Call to log in — throws on failure so the form can catch it */
  login: (credentials: LoginRequest) => Promise<void>;
  /** Call to log out — clears state + redirects to /login */
  logout: () => Promise<void>;
}

// ── Context creation ──────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ── Provider ──────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Prevent the unauthorized handler from firing during
  // the initial refresh attempt (avoid double-redirect)
  const isRestoringSession = useRef(false);

  // ── Session restore on mount ────────────────
  // Runs once when the app loads. Sends the httpOnly
  // refresh cookie to /api/auth/refresh. If valid,
  // the backend returns a new accessToken + admin object
  // and we restore state silently. If not, user sees /login.

useEffect(() => {
  async function restoreSession() {
    isRestoringSession.current = true;
    try {
      const result = await refreshAccessToken();
      if (result && result.accessToken) {
        const adminData = await getCurrentAdmin();
        setAdmin(adminData);
        // Note: we deliberately do NOT redirect away from /login here —
        // opening the site should always show the login page.
      }
    } catch {
      // No valid session — stay on current page
      // Middleware handles redirect to /login if needed
    } finally {
      isRestoringSession.current = false;
      setIsInitialized(true);
    }
  }
  restoreSession();
}, [router]);

  // ── Unauthorized event listener ─────────────
  // The axios interceptor in client.ts fires
  // 'auth:unauthorized' whenever any API call gets a 401
  // while a token was present (i.e. token expired mid-session).
  // We respond by clearing state and redirecting to /login.

  useEffect(() => {
    function handleUnauthorized() {
      if (isRestoringSession.current) return;
      setAdmin(null);
      router.replace('/login');
    }

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('auth:unauthorized', handleUnauthorized);
    };
  }, [router]);

  // ── Login ────────────────────────────────────
  // Called by LoginForm. Throws on failure so the form
  // can catch the AuthError and display the message.

  const login = useCallback(
    async (credentials: LoginRequest) => {
      setIsLoading(true);
      try {
        const result = await loginUser(credentials);
        setAdmin(result.admin);
        // UC-01 step 9 — redirect to Dashboard Home on success
        router.replace('/dashboard');
      } finally {
        setIsLoading(false);
      }
    },
    [router],
  );

  // ── Logout ───────────────────────────────────
  // Clears in-memory token, calls backend to clear
  // the httpOnly cookie, then redirects to /login.

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      await logoutUser();
    } catch {
      // Even if the backend call fails, clear local state
    } finally {
      setAdmin(null);
      setIsLoading(false);
      router.replace('/login');
    }
  }, [router]);

  // ── Context value ─────────────────────────────

  const value: AuthContextValue = {
    admin,
    isLoading,
    isInitialized,
    isAuthenticated: admin !== null,
    login,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────
// Internal hook — consumed only by useAuth (see hooks/useAuth.ts).
// Not exported directly to keep the public API surface clean.

export function useAuthContext(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error(
      'useAuthContext must be used inside <AuthProvider>. ' +
      'Wrap your app in AuthProvider in app/layout.tsx.',
    );
  }
  return context;
}

// Re-export getAuthErrorMessage so consumers don't need
// a separate import for the most common error-display case.
export { getAuthErrorMessage };