// ─────────────────────────────────────────────────────────────────────────────
//  LeadMind AI — Lead Import Validation
//  UC-04  Upload Lead List (CSV)
//
//  Handles:
//   • Mapping messy real-world CSV headers ("Phone Number", "Mobile", etc.)
//     to the canonical Lead model fields.
//   • UC-04 A1 — Missing Required Columns (Full Name, Phone)
//   • UC-04 A3 — Invalid Phone Format flagging (per row, not the whole file)
//
//  Kept dependency-free (no DB, no express) so it's trivially unit-testable —
//  duplicate detection (which needs the DB) lives in duplicateDetection.ts.
// ─────────────────────────────────────────────────────────────────────────────

// ── Column aliases ─────────────────────────────────────────────────────────
// Real CSV exports rarely use our exact field names. We accept common
// variants and map them all to the same canonical key.
const COLUMN_ALIASES: Record<string, string[]> = {
  fullName: ['full name', 'fullname', 'name', 'lead name', 'contact name'],
  phone: ['phone', 'phone number', 'contact number', 'mobile', 'mobile number', 'cell', 'cell number'],
  email: ['email', 'email address', 'e-mail'],
  company: ['company', 'company name', 'organization', 'organisation'],
  jobTitle: ['job title', 'title', 'position', 'designation'],
};

// Required per UC-04 pre-condition: "Validate file type and required columns."
export const REQUIRED_CANONICAL_FIELDS = ['fullName', 'phone'] as const;

const normalizeHeader = (header: string): string =>
  header.trim().toLowerCase().replace(/\s+/g, ' ');

export interface HeaderMap {
  [originalHeader: string]: string; // canonical field name, or "extra:<original>" if unrecognized
}

/**
 * Builds a lookup from each original CSV header to its canonical Lead field
 * (fullName / phone / email / company / jobTitle), or "extra:<header>" if the
 * column doesn't match any known field — those get preserved in rawCsvData
 * instead of being silently dropped.
 */
export const buildHeaderMap = (headers: string[]): HeaderMap => {
  const map: HeaderMap = {};

  headers.forEach((header) => {
    const normalized = normalizeHeader(header);
    let matched: string | null = null;

    for (const [canonical, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (aliases.includes(normalized)) {
        matched = canonical;
        break;
      }
    }

    map[header] = matched ?? `extra:${header}`;
  });

  return map;
};

/**
 * UC-04 A1 — Missing Required Columns.
 * Checks the *mapped* headers, so "Phone Number" satisfies the "phone"
 * requirement just as well as a column literally named "Phone".
 */
export const validateRequiredColumns = (
  headers: string[]
): { valid: boolean; missing: string[] } => {
  const headerMap = buildHeaderMap(headers);
  const mappedCanonicals = new Set(Object.values(headerMap));

  const missing = REQUIRED_CANONICAL_FIELDS.filter(
    (field) => !mappedCanonicals.has(field)
  );

  // Report the missing fields using their friendly display names.
  const displayNames: Record<string, string> = { fullName: 'Full Name', phone: 'Phone' };

  return {
    valid: missing.length === 0,
    missing: missing.map((f) => displayNames[f]),
  };
};

// Kept identical to the regex in models/Lead.js — if you change one, change both.
export const PHONE_REGEX = /^\+?[\d\s\-().]{7,20}$/;
export const EMAIL_REGEX = /^$|^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;

export interface MappedLeadRow {
  fullName: string;
  phone: string;
  email: string | null;
  company: string | null;
  jobTitle: string | null;
  rawExtra: Record<string, string>; // unrecognized columns, kept for Lead.rawCsvData
}

/**
 * Converts one raw CSV row (original headers → values) into our canonical
 * shape using the header map built once per file.
 */
export const mapRowToLeadFields = (
  row: Record<string, string>,
  headerMap: HeaderMap
): MappedLeadRow => {
  const result: MappedLeadRow = {
    fullName: '',
    phone: '',
    email: null,
    company: null,
    jobTitle: null,
    rawExtra: {},
  };

  Object.entries(row).forEach(([originalHeader, value]) => {
    const canonical = headerMap[originalHeader];
    const trimmedValue = (value ?? '').trim();

    switch (canonical) {
      case 'fullName':
        result.fullName = trimmedValue;
        break;
      case 'phone':
        result.phone = trimmedValue;
        break;
      case 'email':
        result.email = trimmedValue || null;
        break;
      case 'company':
        result.company = trimmedValue || null;
        break;
      case 'jobTitle':
        result.jobTitle = trimmedValue || null;
        break;
      default:
        // "extra:<header>" columns — keep only if they actually have a value
        if (trimmedValue) result.rawExtra[originalHeader] = trimmedValue;
    }
  });

  return result;
};

export interface RowValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * UC-04 A3 — Invalid Phone Format flagging, plus required-field checks.
 * Runs per row so one bad row doesn't sink the whole import — it's reported
 * in the "failed" bucket of the import summary instead.
 */
export const validateLeadRow = (row: MappedLeadRow): RowValidationResult => {
  const errors: string[] = [];

  if (!row.fullName) {
    errors.push('Full Name is required.');
  }

  if (!row.phone) {
    errors.push('Phone is required.');
  } else if (!PHONE_REGEX.test(row.phone)) {
    errors.push('Invalid phone number format.');
  }

  if (row.email && !EMAIL_REGEX.test(row.email)) {
    errors.push('Invalid email address format.');
  }

  return { valid: errors.length === 0, errors };
};