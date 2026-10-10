import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
const Admin = require('../models/Admin');
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  TokenPayload,
} from '../utils/jwt';
import { logAction } from '../utils/auditLog'; // ← Day 26, Session 1

// ─── POST /api/auth/login ─────────────────────────────────────────────────────

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ success: false, message: 'Email and password are required.' });
      return;
    }

    const admin = await Admin.findOne({ email: email.toLowerCase().trim() }).select('+password');

    if (!admin) {
      res.status(401).json({ success: false, message: 'Invalid email or password.' });
      return;
    }

    if (!admin.isActive) {
      res.status(403).json({ success: false, message: 'Account is disabled. Contact support.' });
      return;
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      res.status(401).json({ success: false, message: 'Invalid email or password.' });
      return;
    }

    const payload: TokenPayload = {
      adminId: (admin._id as string).toString(),
      email: admin.email,
    };

    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    // Store refresh token in DB
    admin.refreshToken = refreshToken;
    // Day 26, Session 1: surfaced on the Profile page ("last login").
    // Not part of the payload/session identity — just a display field —
    // so it's set here rather than threaded through TokenPayload.
    admin.lastLoginAt = new Date();
    await admin.save();

    // Day 26, Session 1: audit log entry. Fire-and-forget in spirit —
    // logAction() never throws (see utils/auditLog.ts) — so this can't
    // fail a real login even if the DB write itself fails.
    await logAction('admin.login', String(admin._id), admin.email, `${admin.email} logged in.`, {
      ip: req.ip,
    });

    // DEBUG ─────────────────────────────────────
    console.log('[DEBUG LOGIN] Token written to DB:', refreshToken.substring(0, 40));
    console.log('[DEBUG LOGIN] Token being set in cookie:', refreshToken.substring(0, 40));
    // ────────────────────────────────────────────

    // Set httpOnly cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    res.status(200).json({
      success: true,
      message: 'Login successful.',
      accessToken,
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    console.error('[AUTH] Login error:', error);
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
};

// ─── POST /api/auth/refresh ───────────────────────────────────────────────────

export const refreshAccessToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.cookies?.refreshToken;

    // DEBUG ─────────────────────────────────────
    console.log('[DEBUG REFRESH] Cookie received:', token?.substring(0, 40) ?? 'NO COOKIE');
    const anyAdmin = await Admin.findOne({ email: 'admin@leadmind.ai' }).select('+refreshToken');
    console.log('[DEBUG REFRESH] DB token stored:', anyAdmin?.refreshToken?.substring(0, 40) ?? 'NO TOKEN IN DB');
    console.log('[DEBUG REFRESH] Tokens match:', token === anyAdmin?.refreshToken);
    // ────────────────────────────────────────────

    if (!token) {
      res.status(401).json({ success: false, message: 'No refresh token provided.' });
      return;
    }

    let decoded;
    try {
      decoded = verifyRefreshToken(token);
    } catch {
      res.status(401).json({ success: false, message: 'Invalid or expired refresh token.' });
      return;
    }

    const admin = await Admin.findById(decoded.adminId).select('+refreshToken');

    if (!admin || admin.refreshToken !== token) {
      res.status(401).json({ success: false, message: 'Refresh token is no longer valid.' });
      return;
    }

    if (!admin.isActive) {
      res.status(403).json({ success: false, message: 'Account is disabled.' });
      return;
    }

    const payload: TokenPayload = {
      adminId: (admin._id as string).toString(),
      email: admin.email,
    };

    const newAccessToken = signAccessToken(payload);

    res.status(200).json({
      success: true,
      accessToken: newAccessToken,
    });
  } catch (error) {
    console.error('[AUTH] Refresh error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── POST /api/auth/logout ────────────────────────────────────────────────────

export const logout = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.cookies?.refreshToken;

    if (token) {
      const admin = await Admin.findOne({ refreshToken: token }).select('+refreshToken');
      if (admin) {
        admin.refreshToken = undefined;
        await admin.save();
      }
    } else {
      // No cookie sent — clear all tokens (safe for single-admin FYP)
      await Admin.updateMany({}, { $unset: { refreshToken: 1 } });
    }

    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
    });

    res.status(200).json({ success: true, message: 'Logged out successfully.' });
  } catch (error) {
    console.error('[AUTH] Logout error:', error);
    res.status(500).json({ success: false, message: 'Server error during logout.' });
  }
};

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
//  Day 26, Session 1: switched to admin.toPublicProfile() (Admin.js) so this
//  doubles as the Profile page's data source — avatar/timezone/notifications/
//  lastLoginAt included — instead of adding a second near-duplicate endpoint.

export const getMe = async (req: Request, res: Response): Promise<void> => {
  try {
    const admin = await Admin.findById((req as any).admin.adminId);

    if (!admin) {
      res.status(404).json({ success: false, message: 'Admin not found.' });
      return;
    }

    res.status(200).json({
      success: true,
      admin: admin.toPublicProfile(),
    });
  } catch (error) {
    console.error('[AUTH] GetMe error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  PATCH /api/auth/me  (Day 26, Session 1)
//  Updates the admin's own display name and/or avatar. Validation (field
//  presence, length, at-least-one-field) already ran in
//  validateProfile.ts's validateUpdateProfile — this handler's only job is
//  the actual partial update, matching updateMeetingSlotSettings's pattern.
// ─────────────────────────────────────────────────────────────────────────────

export const updateProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, avatar } = req.body;

    const update: Record<string, any> = {};
    if (name !== undefined) update.name = name.trim();
    if (avatar !== undefined) update.avatar = avatar; // null clears it

    const admin = await Admin.findByIdAndUpdate(
      req.admin!.adminId,
      { $set: update },
      { new: true, runValidators: true, context: 'query' }
    );

    if (!admin) {
      res.status(404).json({ success: false, message: 'Admin not found.' });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Profile updated.',
      admin: admin.toPublicProfile(),
    });
  } catch (error: any) {
    if (error.name === 'ValidationError') {
      res.status(422).json({ success: false, message: error.message });
      return;
    }
    console.error('[AUTH] UpdateProfile error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  PATCH /api/auth/change-password  (Day 26, Session 1)
//  Requires the CURRENT password (not just a valid session) before allowing
//  a change — a valid access token alone isn't proof the person at the
//  keyboard is the account owner (e.g. an unattended, still-logged-in tab).
// ─────────────────────────────────────────────────────────────────────────────

export const changePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { currentPassword, newPassword } = req.body;

    const admin = await Admin.findById(req.admin!.adminId).select('+password');
    if (!admin) {
      res.status(404).json({ success: false, message: 'Admin not found.' });
      return;
    }

    const isMatch = await admin.comparePassword(currentPassword);
    if (!isMatch) {
      res.status(401).json({ success: false, message: 'Current password is incorrect.' });
      return;
    }

    // Assignment (not findByIdAndUpdate) so the pre('save') hook that
    // hashes a modified password (Admin.js) actually fires.
    admin.password = newPassword;
    // Changing the password invalidates any existing session on other
    // devices — same reasoning as a forced re-login after a security event.
    admin.refreshToken = undefined;
    await admin.save();

    res.status(200).json({
      success: true,
      message: 'Password changed successfully. Please log in again.',
    });
  } catch (error: any) {
    if (error.name === 'ValidationError') {
      res.status(422).json({ success: false, message: error.message });
      return;
    }
    console.error('[AUTH] ChangePassword error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/auth/integrations  (Day 26, Session 3)
//  Related: Day 26 plan item — "API keys display (masked)". Read-only,
//  env-sourced — nothing here comes from the DB, and the real values never
//  leave the backend. maskSecret() only ever returns a shortened, mostly
//  asterisked string, never the original.
// ─────────────────────────────────────────────────────────────────────────────

function maskSecret(value: string | undefined): string | null {
  if (!value) return null;
  if (value.length <= 8) return '•'.repeat(8);
  return `${value.slice(0, 4)}${'•'.repeat(Math.max(4, value.length - 8))}${value.slice(-4)}`;
}

export const getIntegrations = async (req: Request, res: Response): Promise<void> => {
  try {
    res.status(200).json({
      success: true,
      data: {
        vapiApiKey: {
          configured: !!process.env.VAPI_API_KEY,
          masked: maskSecret(process.env.VAPI_API_KEY),
        },
        googleClientId: {
          configured: !!process.env.GOOGLE_CLIENT_ID,
          masked: maskSecret(process.env.GOOGLE_CLIENT_ID),
        },
      },
    });
  } catch (error) {
    console.error('[AUTH] GetIntegrations error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};
//  Distinct from GET /api/auth/me: this returns just the settings-page
//  fields (timezone, notifications) — same split reasoning as
//  calendar/slots vs calendar/settings (Day 23/24).
// ─────────────────────────────────────────────────────────────────────────────

export const getSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    const admin = await Admin.findById(req.admin!.adminId).select('timezone notifications');
    if (!admin) {
      res.status(404).json({ success: false, message: 'Admin not found.' });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        timezone: admin.timezone,
        notifications: admin.notifications,
      },
    });
  } catch (error) {
    console.error('[AUTH] GetSettings error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  PATCH /api/auth/settings  (Day 26, Session 1)
//  notifications MERGES, not replaces — identical reasoning to
//  updateMeetingSlotSettings's preferences handling (Day 24, Session 1):
//  toggling one alert shouldn't reset the other two back to defaults.
// ─────────────────────────────────────────────────────────────────────────────

export const updateSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    const { timezone, notifications } = req.body;

    const update: Record<string, any> = {};
    if (timezone !== undefined) update.timezone = timezone;
    if (notifications !== undefined) {
      for (const [key, value] of Object.entries(notifications)) {
        update[`notifications.${key}`] = value;
      }
    }

    const admin = await Admin.findByIdAndUpdate(
      req.admin!.adminId,
      { $set: update },
      { new: true, runValidators: true, context: 'query' }
    ).select('timezone notifications');

    if (!admin) {
      res.status(404).json({ success: false, message: 'Admin not found.' });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Settings updated.',
      data: {
        timezone: admin.timezone,
        notifications: admin.notifications,
      },
    });
  } catch (error: any) {
    if (error.name === 'ValidationError') {
      res.status(422).json({ success: false, message: error.message });
      return;
    }
    console.error('[AUTH] UpdateSettings error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};