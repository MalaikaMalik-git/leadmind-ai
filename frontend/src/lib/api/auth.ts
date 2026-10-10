// ─────────────────────────────────────────────
//  LeadMind AI — Auth API
//  Matches ACTUAL backend response shapes:
//    POST /api/auth/login        → { success, message, accessToken, admin }
//    POST /api/auth/refresh      → { success, accessToken }
//    POST /api/auth/logout       → { success, message }
//    GET  /api/auth/me           → { success, admin }              (Day 26 S3: full AdminProfile)
//    PATCH /api/auth/me          → { success, message, admin }     (Day 26, Session 3)
//    PATCH /api/auth/change-password → { success, message }        (Day 26, Session 3)
//    GET/PATCH /api/auth/settings    → { success, data }           (Day 26, Session 3)
//    GET  /api/auth/integrations     → { success, data }           (Day 26, Session 3)
// ─────────────────────────────────────────────

import apiClient, { tokenStore } from './client';
import {
  LoginRequest,
  LoginResponse,
  RefreshResponse,
  MeResponse,
  LogoutResponse,
  AdminUser,
  AdminProfile,
  UpdateProfileRequest,
  ChangePasswordRequest,
  SettingsData,
  UpdateSettingsRequest,
  IntegrationsData,
  AuthError,
} from '@/src/types/auth';

// ── Login ─────────────────────────────────────

export async function loginUser(
  credentials: LoginRequest,
): Promise<{ admin: AdminUser; accessToken: string }> {
  const response = await apiClient.post<LoginResponse>(
    '/api/auth/login',
    credentials,
  );

  // Backend returns: { success, message, accessToken, admin }
  // NO .data wrapper — directly on response.data
  const { admin, accessToken } = response.data;
  tokenStore.set(accessToken);
  return { admin, accessToken };
}

// ── Logout ────────────────────────────────────

export async function logoutUser(): Promise<void> {
  try {
    await apiClient.post<LogoutResponse>('/api/auth/logout');
  } finally {
    tokenStore.clear();
  }
}

// ── Refresh access token ──────────────────────
// Backend returns: { success, accessToken } — NO admin object
// AuthContext calls getCurrentAdmin() separately after this

export async function refreshAccessToken(): Promise<{
  accessToken: string;
} | null> {
  try {
    const response = await apiClient.post<RefreshResponse>(
      '/api/auth/refresh',
    );

    // Backend returns: { success, accessToken } — no admin
    const { accessToken } = response.data;
    tokenStore.set(accessToken);
    return { accessToken };
  } catch (error) {
    if (error instanceof AuthError && error.code === 'UNAUTHORIZED') {
      return null;
    }
    throw error;
  }
}

// ── Get current admin ─────────────────────────
// Backend returns: { success, admin } — NO .data wrapper

export async function getCurrentAdmin(): Promise<AdminUser> {
  const response = await apiClient.get<MeResponse>('/api/auth/me');
  // Backend returns: { success, admin } directly
  return response.data.admin;
}

// ─── Day 26, Session 3: Profile, Password, Settings, Integrations ────────────

// ── Get full profile (Settings page's data source — richer than
//    getCurrentAdmin() above, which AuthContext keeps typed as AdminUser) ──

export async function getMyProfile(): Promise<AdminProfile> {
  const response = await apiClient.get<MeResponse>('/api/auth/me');
  return response.data.admin;
}

// ── Update profile (name / avatar) ────────────

export async function updateProfile(data: UpdateProfileRequest): Promise<AdminProfile> {
  const response = await apiClient.patch<{ success: true; message: string; admin: AdminProfile }>(
    '/api/auth/me',
    data,
  );
  return response.data.admin;
}

// ── Change password ───────────────────────────
// Backend clears the stored refresh token on success (forces re-login on
// other devices) — this does NOT log the current session out, since the
// in-memory access token this tab is using stays valid until its own
// natural expiry.

export async function changePassword(data: ChangePasswordRequest): Promise<void> {
  await apiClient.patch<{ success: true; message: string }>('/api/auth/change-password', data);
}

// ── Get/update settings (timezone + notification preferences) ────────────

export async function getSettings(): Promise<SettingsData> {
  const response = await apiClient.get<{ success: true; data: SettingsData }>('/api/auth/settings');
  return response.data.data;
}

export async function updateSettings(data: UpdateSettingsRequest): Promise<SettingsData> {
  const response = await apiClient.patch<{ success: true; message: string; data: SettingsData }>(
    '/api/auth/settings',
    data,
  );
  return response.data.data;
}

// ── Get masked integration status (read-only, env-sourced on the backend) ──

export async function getIntegrations(): Promise<IntegrationsData> {
  const response = await apiClient.get<{ success: true; data: IntegrationsData }>('/api/auth/integrations');
  return response.data.data;
}