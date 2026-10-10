import { Request, Response, NextFunction } from 'express';

// ─────────────────────────────────────────────────────────────────────────────
//  LeadMind AI — Campaign Validation Middleware
//
//  Runs BEFORE createCampaign and updateCampaign controllers.
//  Returns 422 Unprocessable Entity with a field-level errors array so the
//  frontend can highlight exactly which field failed — matching UC-02 A1 and
//  UC-03 A1 alternative flows from the FYP spec.
//
//  Validation rules:
//   • Required fields (create only): name, goal, tone, instructions, dailyCallLimit
//   • Tone: must be one of 6 allowed values
//   • dailyCallLimit: integer 1–500
//   • quietHours: if enabled, startTime and endTime must be different
//     (overnight windows that wrap past midnight, e.g. 22:00 -> 08:00, are valid)
//   • startDate / endDate: if both provided, endDate must be after startDate
//   • name: max 150 chars
//   • goal: max 500 chars
//   • instructions: max 2000 chars
// ─────────────────────────────────────────────────────────────────────────────

const VALID_TONES = [
  'Professional',
  'Friendly',
  'Direct',
  'Consultative',
  'Persuasive',
  'Soft Warm',
];

// ── Validate for CREATE — all required fields must be present ─────────────────

export const validateCreateCampaign = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const errors: { field: string; message: string }[] = [];

  const {
    name,
    goal,
    tone,
    instructions,
    dailyCallLimit,
    quietHours,
    startDate,
    endDate,
  } = req.body;

  // ── Required field checks ──────────────────────────────────────────────────
  if (!name || typeof name !== 'string' || name.trim() === '') {
    errors.push({ field: 'name', message: 'Campaign name is required.' });
  } else if (name.trim().length > 150) {
    errors.push({ field: 'name', message: 'Campaign name cannot exceed 150 characters.' });
  }

  if (!goal || typeof goal !== 'string' || goal.trim() === '') {
    errors.push({ field: 'goal', message: 'Campaign goal is required.' });
  } else if (goal.trim().length > 500) {
    errors.push({ field: 'goal', message: 'Goal cannot exceed 500 characters.' });
  }

  if (!tone || typeof tone !== 'string' || tone.trim() === '') {
    errors.push({ field: 'tone', message: 'Tone is required.' });
  } else if (!VALID_TONES.includes(tone)) {
    errors.push({
      field: 'tone',
      message: `Tone must be one of: ${VALID_TONES.join(', ')}.`,
    });
  }

  if (!instructions || typeof instructions !== 'string' || instructions.trim() === '') {
    errors.push({ field: 'instructions', message: 'AI instructions are required.' });
  } else if (instructions.trim().length > 2000) {
    errors.push({ field: 'instructions', message: 'Instructions cannot exceed 2000 characters.' });
  }

  if (dailyCallLimit === undefined || dailyCallLimit === null) {
    errors.push({ field: 'dailyCallLimit', message: 'Daily call limit is required.' });
  } else if (
    typeof dailyCallLimit !== 'number' ||
    !Number.isInteger(dailyCallLimit) ||
    dailyCallLimit < 1 ||
    dailyCallLimit > 500
  ) {
    errors.push({
      field: 'dailyCallLimit',
      message: 'Daily call limit must be an integer between 1 and 500.',
    });
  }

  // ── Quiet hours: UC-03 A1 ──────────────────────────────────────────────────
  // Quiet hours are only invalid when start === end (zero-length window).
  // Any other pair is valid, including overnight windows that cross midnight
  // (e.g. 22:00 -> 08:00, which is also this form's own default value) — an
  // end time "before" the start time numerically just means it wraps to the
  // next day, not that the range is malformed.
  if (quietHours !== undefined) {
    if (quietHours.enabled === true) {
      if (!quietHours.startTime || !quietHours.endTime) {
        errors.push({
          field: 'quietHours',
          message: 'Quiet hours start and end time are required when enabled.',
        });
      } else if (quietHours.startTime === quietHours.endTime) {
        errors.push({
          field: 'quietHours',
          message: 'Quiet hours start and end time must be different.',
        });
      }
    }
  }

  // ── Date range ─────────────────────────────────────────────────────────────
  if (startDate && endDate) {
    if (new Date(endDate) <= new Date(startDate)) {
      errors.push({
        field: 'endDate',
        message: 'End date must be after start date.',
      });
    }
  }

  if (errors.length > 0) {
    res.status(422).json({
      success: false,
      message: 'Validation failed.',
      errors,
    });
    return;
  }

  next();
};

// ── Validate for UPDATE — only validate fields that are actually sent ─────────

export const validateUpdateCampaign = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const errors: { field: string; message: string }[] = [];

  const {
    name,
    goal,
    tone,
    instructions,
    dailyCallLimit,
    quietHours,
    startDate,
    endDate,
  } = req.body;

  // ── Only validate fields present in the request body ──────────────────────
  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim() === '') {
      errors.push({ field: 'name', message: 'Campaign name cannot be empty.' });
    } else if (name.trim().length > 150) {
      errors.push({ field: 'name', message: 'Campaign name cannot exceed 150 characters.' });
    }
  }

  if (goal !== undefined) {
    if (typeof goal !== 'string' || goal.trim() === '') {
      errors.push({ field: 'goal', message: 'Campaign goal cannot be empty.' });
    } else if (goal.trim().length > 500) {
      errors.push({ field: 'goal', message: 'Goal cannot exceed 500 characters.' });
    }
  }

  if (tone !== undefined) {
    if (!VALID_TONES.includes(tone)) {
      errors.push({
        field: 'tone',
        message: `Tone must be one of: ${VALID_TONES.join(', ')}.`,
      });
    }
  }

  if (instructions !== undefined) {
    if (typeof instructions !== 'string' || instructions.trim() === '') {
      errors.push({ field: 'instructions', message: 'Instructions cannot be empty.' });
    } else if (instructions.trim().length > 2000) {
      errors.push({ field: 'instructions', message: 'Instructions cannot exceed 2000 characters.' });
    }
  }

  if (dailyCallLimit !== undefined) {
    if (
      typeof dailyCallLimit !== 'number' ||
      !Number.isInteger(dailyCallLimit) ||
      dailyCallLimit < 1 ||
      dailyCallLimit > 500
    ) {
      errors.push({
        field: 'dailyCallLimit',
        message: 'Daily call limit must be an integer between 1 and 500.',
      });
    }
  }

  // ── Quiet hours: UC-03 A1 ──────────────────────────────────────────────────
  // Same rule as validateCreateCampaign: only invalid when start === end.
  // Overnight windows (e.g. 22:00 -> 08:00) are valid.
  if (quietHours !== undefined) {
    if (quietHours.enabled === true) {
      if (!quietHours.startTime || !quietHours.endTime) {
        errors.push({
          field: 'quietHours',
          message: 'Quiet hours start and end time are required when enabled.',
        });
      } else if (quietHours.startTime === quietHours.endTime) {
        errors.push({
          field: 'quietHours',
          message: 'Quiet hours start and end time must be different.',
        });
      }
    }
  }

  // ── Date range ─────────────────────────────────────────────────────────────
  if (startDate !== undefined && endDate !== undefined) {
    if (new Date(endDate) <= new Date(startDate)) {
      errors.push({
        field: 'endDate',
        message: 'End date must be after start date.',
      });
    }
  }

  if (errors.length > 0) {
    res.status(422).json({
      success: false,
      message: 'Validation failed.',
      errors,
    });
    return;
  }

  next();
};