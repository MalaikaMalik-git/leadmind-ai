import { Request, Response, NextFunction } from 'express';

// ─────────────────────────────────────────────────────────────────────────────
//  LeadMind AI — Profile & Settings Validation Middleware
//  Day 26, Session 1 (merged with Session 2's audit-log scope)
//
//  Mirrors validateCampaign.ts / validateMeetingSlot.ts's conventions
//  exactly: 422 Unprocessable Entity with a field-level errors array, so
//  the frontend (Day 26, Session 3) can highlight exactly which field
//  failed. All three of these are UPDATE-only, partial-update endpoints —
//  every field is optional, but if present, must be valid.
// ─────────────────────────────────────────────────────────────────────────────

function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// ── PATCH /api/auth/me ─────────────────────────────────────────────────────

export const validateUpdateProfile = (req: Request, res: Response, next: NextFunction): void => {
  const errors: { field: string; message: string }[] = [];
  const { name, avatar } = req.body;

  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) {
      errors.push({ field: 'name', message: 'Name cannot be empty.' });
    } else if (name.trim().length > 100) {
      errors.push({ field: 'name', message: 'Name cannot exceed 100 characters.' });
    }
  }

  // avatar is a URL string, or null to clear it back to no avatar.
  if (avatar !== undefined && avatar !== null) {
    if (typeof avatar !== 'string' || avatar.trim().length === 0) {
      errors.push({ field: 'avatar', message: 'Avatar must be a valid URL, or null to remove it.' });
    } else if (avatar.length > 2048) {
      errors.push({ field: 'avatar', message: 'Avatar URL is too long.' });
    }
  }

  if (name === undefined && avatar === undefined) {
    errors.push({ field: 'body', message: 'Provide at least one of: name, avatar.' });
  }

  if (errors.length > 0) {
    res.status(422).json({ success: false, message: 'Validation failed.', errors });
    return;
  }
  next();
};

// ── PATCH /api/auth/change-password ────────────────────────────────────────

export const validateChangePassword = (req: Request, res: Response, next: NextFunction): void => {
  const errors: { field: string; message: string }[] = [];
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || typeof currentPassword !== 'string') {
    errors.push({ field: 'currentPassword', message: 'Current password is required.' });
  }

  if (!newPassword || typeof newPassword !== 'string') {
    errors.push({ field: 'newPassword', message: 'New password is required.' });
  } else if (newPassword.length < 8) {
    // Matches Admin.js schema's own minlength: 8 — fail fast here with a
    // field-level message instead of surfacing a raw Mongoose error.
    errors.push({ field: 'newPassword', message: 'New password must be at least 8 characters.' });
  }

  if (
    typeof currentPassword === 'string' &&
    typeof newPassword === 'string' &&
    currentPassword === newPassword
  ) {
    errors.push({ field: 'newPassword', message: 'New password must be different from the current password.' });
  }

  if (errors.length > 0) {
    res.status(422).json({ success: false, message: 'Validation failed.', errors });
    return;
  }
  next();
};

// ── PATCH /api/auth/settings ───────────────────────────────────────────────

const NOTIFICATION_KEYS = ['qualifiedLeadAlert', 'meetingBookedAlert', 'campaignCompletedAlert'];

export const validateUpdateSettings = (req: Request, res: Response, next: NextFunction): void => {
  const errors: { field: string; message: string }[] = [];
  const { timezone, notifications } = req.body;

  if (timezone !== undefined) {
    if (typeof timezone !== 'string' || !isValidTimezone(timezone)) {
      errors.push({ field: 'timezone', message: 'Must be a valid IANA timezone (e.g. "Asia/Karachi").' });
    }
  }

  if (notifications !== undefined) {
    if (typeof notifications !== 'object' || notifications === null || Array.isArray(notifications)) {
      errors.push({ field: 'notifications', message: 'notifications must be an object.' });
    } else {
      for (const [key, value] of Object.entries(notifications)) {
        if (!NOTIFICATION_KEYS.includes(key)) {
          errors.push({ field: `notifications.${key}`, message: `Unknown notification preference "${key}".` });
        } else if (typeof value !== 'boolean') {
          errors.push({ field: `notifications.${key}`, message: 'Must be true or false.' });
        }
      }
    }
  }

  if (timezone === undefined && notifications === undefined) {
    errors.push({ field: 'body', message: 'Provide at least one of: timezone, notifications.' });
  }

  if (errors.length > 0) {
    res.status(422).json({ success: false, message: 'Validation failed.', errors });
    return;
  }
  next();
};
