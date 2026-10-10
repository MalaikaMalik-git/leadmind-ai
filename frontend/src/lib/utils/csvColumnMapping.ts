// ─────────────────────────────────────────────
//  LeadMind AI — CSV Column Mapping (preview only)
//  Day 12 · Session 2
//
//  Mirrors the alias list in backend/src/utils/leadValidation.ts so the
//  Upload Leads page can show the admin "Full Name ← 'Contact Name' column"
//  before they hit submit. This is COSMETIC ONLY — the backend re-runs its
//  own mapping independently and is the actual source of truth for what
//  gets imported. If you ever change the aliases on the backend, mirror
//  the change here too so the preview stays accurate.
// ─────────────────────────────────────────────

const COLUMN_ALIASES: Record<string, string[]> = {
  fullName: ['full name', 'fullname', 'name', 'lead name', 'contact name'],
  phone: ['phone', 'phone number', 'contact number', 'mobile', 'mobile number', 'cell', 'cell number'],
  email: ['email', 'email address', 'e-mail'],
  company: ['company', 'company name', 'organization', 'organisation'],
  jobTitle: ['job title', 'title', 'position', 'designation'],
};

const CANONICAL_LABELS: Record<string, string> = {
  fullName: 'Full Name',
  phone: 'Phone',
  email: 'Email',
  company: 'Company',
  jobTitle: 'Job Title',
};

const normalizeHeader = (header: string): string =>
  header.trim().toLowerCase().replace(/\s+/g, ' ');

export interface DetectedColumn {
  originalHeader: string;
  canonicalField: string | null; // null = unrecognized, will be stored as extra data
  canonicalLabel: string | null;
}

/** For each raw CSV header, figure out which canonical Lead field it maps to (if any). */
export const detectColumnMapping = (headers: string[]): DetectedColumn[] => {
  return headers.map((header) => {
    const normalized = normalizeHeader(header);

    for (const [canonical, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (aliases.includes(normalized)) {
        return { originalHeader: header, canonicalField: canonical, canonicalLabel: CANONICAL_LABELS[canonical] };
      }
    }

    return { originalHeader: header, canonicalField: null, canonicalLabel: null };
  });
};

/** Quick check used to warn the admin before they even see the full preview. */
export const hasRequiredColumns = (headers: string[]): boolean => {
  const mapping = detectColumnMapping(headers);
  const mapped = new Set(mapping.map((m) => m.canonicalField));
  return mapped.has('fullName') && mapped.has('phone');
};