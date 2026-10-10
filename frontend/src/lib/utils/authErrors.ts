// ─────────────────────────────────────────────
//  LeadMind AI — Auth Error Utilities
//  Maps AuthError codes → user-facing UI messages.
//  Keeps error string logic OUT of components.
// ─────────────────────────────────────────────

import { AuthError, AuthErrorCode } from '@/src/types/auth';

// UC-01 alternative flow messages (exactly as specified)
const ERROR_MESSAGES: Record<AuthErrorCode, string> = {
  INVALID_CREDENTIALS: 'Invalid email or password. Please try again.',
  ACCOUNT_DISABLED: 'Your account has been disabled. Contact your administrator.',
  VALIDATION_ERROR: 'Please enter a valid email and password.',
  SERVER_ERROR: 'Server is unavailable. Please try again later.',
  NETWORK_ERROR: 'Unable to reach the server. Check your internet connection.',
  UNAUTHORIZED: 'Your session has expired. Please log in again.',
};

/**
 * Converts any caught error into a user-facing string.
 * Safe to call with unknown — will always return a string.
 */
export function getAuthErrorMessage(error: unknown): string {
  if (error instanceof AuthError) {
    // Prefer the server's message if it's specific enough,
    // otherwise fall back to our mapped message.
    return error.message || ERROR_MESSAGES[error.code];
  }

  if (error instanceof Error) {
    return error.message;
  }

  return ERROR_MESSAGES.SERVER_ERROR;
}

/**
 * Type guard — narrows unknown to AuthError.
 */
export function isAuthError(error: unknown): error is AuthError {
  return error instanceof AuthError;
}