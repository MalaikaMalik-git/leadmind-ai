import { Request, Response, NextFunction } from 'express';
const { LEAD_STATUS } = require('../models/Lead');

// ─────────────────────────────────────────────────────────────────────────────
//  LeadMind AI — Lead Update Validation Middleware
//  Day 13 · Session 1
//
//  Runs BEFORE updateLead controller (PATCH /api/leads/:id).
//  UC-07 spec: "Give admins space to change lead statuses and add their own
//  notes." This is a manual admin override — separate from the AI's own
//  UC-12 qualification write path — so we deliberately only allow the two
//  fields UC-07 actually calls for: status and adminNotes.
//
//  Only fields present in the request body are validated (partial update),
//  same pattern as validateUpdateCampaign.
// ─────────────────────────────────────────────────────────────────────────────

export const validateUpdateLead = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const errors: { field: string; message: string }[] = [];
  const { status, adminNotes } = req.body;

  // Reject requests that don't touch either allowed field
  if (status === undefined && adminNotes === undefined) {
    res.status(422).json({
      success: false,
      message: 'Nothing to update. Provide "status" and/or "adminNotes".',
    });
    return;
  }

  if (status !== undefined) {
    if (typeof status !== 'string' || !LEAD_STATUS.includes(status)) {
      errors.push({
        field: 'status',
        message: `Status must be one of: ${LEAD_STATUS.join(', ')}.`,
      });
    }
  }

  if (adminNotes !== undefined) {
    if (adminNotes !== null && typeof adminNotes !== 'string') {
      errors.push({ field: 'adminNotes', message: 'Notes must be text.' });
    } else if (typeof adminNotes === 'string' && adminNotes.length > 1000) {
      errors.push({ field: 'adminNotes', message: 'Notes cannot exceed 1000 characters.' });
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