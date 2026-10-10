import { Router, Request, Response, NextFunction } from 'express';
import { protect } from '../middleware/auth';
import { uploadCsv } from '../middleware/uploadCsv';
import { validateUpdateLead } from '../middleware/validateLead';
import {
  importLeads,
  getLeads,
  getImportHistory,
  getLeadById,
  updateLead,
} from '../controllers/leadController';
import { getLeadTranscripts } from '../controllers/transcriptController';

// ─────────────────────────────────────────────────────────────────────────────
//  LeadMind AI — Lead Routes
//  Base: /api/leads
//
//  Middleware chain: protect → handleCsvUpload (multer, wrapped) → importLeads
//
//  multer's fileFilter/limits errors are passed to its own callback rather
//  than thrown, so we wrap it manually here to turn those into clean 422
//  JSON responses instead of an unhandled error reaching Express's default
//  handler (which would return an ugly HTML 500 page).
// ─────────────────────────────────────────────────────────────────────────────

const router = Router();

// Every lead route requires a valid JWT
router.use(protect);

const handleCsvUpload = (req: Request, res: Response, next: NextFunction): void => {
  uploadCsv(req, res, (err: any) => {
    if (err) {
      if (err.message === 'INVALID_FILE_TYPE') {
        res.status(422).json({
          success: false,
          message: 'Invalid file type. Please upload a .csv file.',
        });
        return;
      }
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(422).json({
          success: false,
          message: 'File too large. Maximum size is 5MB.',
        });
        return;
      }
      res.status(422).json({
        success: false,
        message: 'File upload failed.',
        error: err.message,
      });
      return;
    }
    next();
  });
};

// ── UC-04: Upload Lead List (CSV) ──────────────────────────────────────────
router.post('/import/:campaignId', handleCsvUpload, importLeads);

// ── UC-07: View Leads & Statuses (list + filter + search + sort + paginate) ─
router.get('/', getLeads);

// ── Day 12: Import History sidebar panel ────────────────────────────────────
router.get('/import-history/:campaignId', getImportHistory);

// ── Day 13: Lead Detail page & status management (UC-07) ────────────────────
router.get('/:id', getLeadById);
router.patch('/:id', validateUpdateLead, updateLead);

// ── Day 19: Transcript list for a lead (UC-08) ───────────────────────────────
router.get('/:id/transcripts', getLeadTranscripts);

export default router;