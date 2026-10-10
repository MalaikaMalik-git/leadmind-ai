// backend/src/controllers/auditLogController.ts
//
// LeadMind AI — Audit Log Controller (Day 26, Session 1)
// Related: Day 26 "Audit log viewer" settings-page feature.
//
// GET /api/audit-log — Bearer-protected

import { Request, Response } from 'express';
const AuditLog = require('../models/AuditLog');
import { logError } from '../utils/errorLog';

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/audit-log
//  Query params:
//    page      (default 1)
//    limit     (default 20, max 50 — mirrors getCampaigns' cap)
//    action    partial match against the dotted action name, e.g.
//              "campaign" matches both "campaign.create" and
//              "campaign.start"/"campaign.pause"
//    startDate / endDate  ISO date strings, inclusive range on createdAt
//
//  Scoped to the current admin only (single-admin FYP today, but this keeps
//  the endpoint correct if a second admin/role is ever added — an admin
//  should see their own activity, not silently see everyone's).
// ─────────────────────────────────────────────────────────────────────────────

export const getAuditLog = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
    const { action, startDate, endDate } = req.query as Record<string, string | undefined>;

    const filter: Record<string, any> = { actor: req.admin!.adminId };

    if (action) {
      // Partial, case-insensitive match — lets the UI offer a coarse
      // filter like "campaign" without needing every exact action string.
      filter.action = { $regex: action, $options: 'i' };
    }

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate && !isNaN(Date.parse(startDate))) filter.createdAt.$gte = new Date(startDate);
      if (endDate && !isNaN(Date.parse(endDate))) filter.createdAt.$lte = new Date(endDate);
      if (Object.keys(filter.createdAt).length === 0) delete filter.createdAt;
    }

    const [entries, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      AuditLog.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: entries,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (err: any) {
    await logError('auditLog.getAuditLog', err, { adminId: req.admin?.adminId });
    res.status(500).json({ success: false, message: 'Failed to fetch audit log.' });
  }
};
