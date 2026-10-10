import multer, { FileFilterCallback } from 'multer';
import { Request } from 'express';

// ─────────────────────────────────────────────────────────────────────────────
//  LeadMind AI — CSV Upload Middleware
//  UC-04  Upload Lead List (CSV)
//
//  Runs BEFORE the importLeads controller (added in Session 2). Rejects
//  anything that isn't a .csv file before it ever reaches our parsing logic —
//  this is the file-type half of UC-04's "System validates file type and
//  required columns" step; the required-columns half happens in
//  leadValidation.ts once the file is actually parsed.
//
//  Memory storage is used (not disk) because we only need the buffer for one
//  parse pass — nothing about this file needs to persist on disk afterward.
// ─────────────────────────────────────────────────────────────────────────────

const storage = multer.memoryStorage();

const ALLOWED_MIME_TYPES = [
  'text/csv',
  'application/vnd.ms-excel', // Excel sometimes labels .csv exports this way
  'application/csv',
  'text/x-csv',
  'text/plain', // some OSes/browsers send plain CSVs as text/plain
];

const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
): void => {
  const hasCsvExtension = file.originalname.toLowerCase().endsWith('.csv');
  const hasAllowedMime = ALLOWED_MIME_TYPES.includes(file.mimetype);

  if (hasCsvExtension || hasAllowedMime) {
    cb(null, true);
  } else {
    // Custom error — caught and turned into a 422 in the controller (Session 2)
    cb(new Error('INVALID_FILE_TYPE'));
  }
};

export const uploadCsv = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB — generous for a lead-list CSV
    files: 1,
  },
}).single('file'); // form field name the frontend must use: "file"