// ─────────────────────────────────────────────
//  LeadMind AI — Auth Types
//  Matches ACTUAL backend response shapes
// ─────────────────────────────────────────────

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

// Day 26, Session 3: full shape returned by GET /api/auth/me via
// Admin.toPublicProfile() (Admin.js) — a superset of AdminUser, so
// anywhere AdminUser is expected (e.g. AuthContext's `admin` state) an
// AdminProfile still satisfies it.
export interface AdminProfile extends AdminUser {
  avatar: string | null;
  isActive: boolean;
  timezone: string;
  googleCalendar: {
    isConnected: boolean;
    calendarEmail: string | null;
  };
  notifications: NotificationPreferences;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface NotificationPreferences {
  qualifiedLeadAlert: boolean;
  meetingBookedAlert: boolean;
  campaignCompletedAlert: boolean;
}

export interface LoginRequest {
  email: string;
  password: string;
}

// POST /api/auth/login → { success, message, accessToken, admin }
export interface LoginResponse {
  success: true;
  message: string;
  accessToken: string;
  admin: AdminUser;
}

// POST /api/auth/refresh → { success, accessToken }
export interface RefreshResponse {
  success: true;
  accessToken: string;
}

// GET /api/auth/me → { success, admin }
// Day 26, Session 3: admin is now the full AdminProfile shape.
export interface MeResponse {
  success: true;
  admin: AdminProfile;
}

export interface LogoutResponse {
  success: true;
  message: string;
}

// ─── Day 26, Session 1/3: Profile, Settings, Integrations ────────────────────

export interface UpdateProfileRequest {
  name?: string;
  avatar?: string | null;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

// GET/PATCH /api/auth/settings → { success, data: { timezone, notifications } }
export interface SettingsData {
  timezone: string;
  notifications: NotificationPreferences;
}

export interface UpdateSettingsRequest {
  timezone?: string;
  notifications?: Partial<NotificationPreferences>;
}

// GET /api/auth/integrations → { success, data: { vapiApiKey, googleClientId } }
export interface IntegrationStatus {
  configured: boolean;
  masked: string | null;
}

export interface IntegrationsData {
  vapiApiKey: IntegrationStatus;
  googleClientId: IntegrationStatus;
}

// GET /api/calendar/status → { success, data: { isConnected, calendarEmail, tokenExpiry } }
export interface CalendarStatus {
  isConnected: boolean;
  calendarEmail: string | null;
  tokenExpiry: string | null;
}

export interface FieldError {
  field: string;
  message: string;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  code?: AuthErrorCode;
  errors?: FieldError[];
}

export type AuthErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_DISABLED'
  | 'VALIDATION_ERROR'
  | 'SERVER_ERROR'
  | 'NETWORK_ERROR'
  | 'UNAUTHORIZED';

export class AuthError extends Error {
  public readonly code: AuthErrorCode;
  public readonly errors?: FieldError[];
  public readonly status?: number;

  constructor(message: string, code: AuthErrorCode, errors?: FieldError[], status?: number) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.errors = errors;
    this.status = status;
  }
}