// ─────────────────────────────────────────────
//  LeadMind AI — Base API Client
//  Axios instance shared by all API modules.
//  httpOnly cookie strategy:
//    • accessToken  → stored in memory (this module)
//    • refreshToken → httpOnly cookie (browser manages it)
//    • credentials: 'include' ensures cookies are sent
// ─────────────────────────────────────────────

import axios, {
  AxiosError,
  AxiosInstance,
  InternalAxiosRequestConfig,
  AxiosResponse,
} from 'axios';
import { AuthError, ApiErrorResponse } from '@/src/types/auth';

// ── In-memory access token store ──────────────
// Never written to localStorage / sessionStorage.
// Survives SPA navigation but clears on hard refresh
// (the refresh-token cookie re-issues it on next load).

let _accessToken: string | null = null;

export const tokenStore = {
  get: (): string | null => _accessToken,
  set: (token: string): void => { _accessToken = token; },
  clear: (): void => { _accessToken = null; },
};

// ── Axios instance ────────────────────────────

const apiClient: AxiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000',
  timeout: 15_000,
  withCredentials: true,   // sends httpOnly cookies on every request
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

// ── Request interceptor ───────────────────────
// Attaches the in-memory access token as Bearer header
// if one exists. Protected routes require this.

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = tokenStore.get();
    if (token && config.headers) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error: unknown) => Promise.reject(error),
);

// ── Response interceptor ──────────────────────
// Normalises error responses into AuthError instances.
// On 401 from a protected route → clears token and
// lets the auth context / middleware handle redirect.

apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: AxiosError<ApiErrorResponse>) => {
    // No response at all — network failure, CORS, timeout
    if (!error.response) {
      return Promise.reject(
        new AuthError(
          'Unable to reach the server. Please check your connection.',
          'NETWORK_ERROR',
        ),
      );
    }

    const { status, data } = error.response;
    const serverMessage = data?.message ?? 'An unexpected error occurred.';
    const serverCode = data?.code;

    // Map HTTP status → AuthErrorCode
    if (status === 401) {
      // If we had a token and got 401, it's expired/invalid
      if (tokenStore.get()) {
        tokenStore.clear();
        // Dispatch a custom event so AuthContext can redirect to /login
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('auth:unauthorized'));
        }
      }
      return Promise.reject(
        new AuthError(
          serverMessage ?? 'Session expired. Please log in again.',
          serverCode === 'ACCOUNT_DISABLED' ? 'ACCOUNT_DISABLED' : 'UNAUTHORIZED',
          undefined,
          status,
        ),
      );
    }

    if (status === 400) {
      return Promise.reject(
        new AuthError(serverMessage, serverCode ?? 'VALIDATION_ERROR', undefined, status),
      );
    }

    if (status === 403) {
      return Promise.reject(
        new AuthError(serverMessage, 'ACCOUNT_DISABLED', undefined, status),
      );
    }

    // 422 — field-level validation errors (campaigns create/update).
    // Keep data.errors[] on the AuthError instead of dropping it, so the
    // UI can show *which* field failed instead of the generic message.
    if (status === 422) {
      return Promise.reject(
        new AuthError(serverMessage, 'VALIDATION_ERROR', data?.errors, status),
      );
    }

    if (status >= 500) {
      return Promise.reject(
        new AuthError(
          'Server error. Please try again in a moment.',
          'SERVER_ERROR',
          undefined,
          status,
        ),
      );
    }

    // Fallback for any other 4xx (e.g. 404 Not Found)
    return Promise.reject(
      new AuthError(serverMessage, serverCode ?? 'SERVER_ERROR', undefined, status),
    );
  },
);

export default apiClient;