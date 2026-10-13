const Lead = require('../models/Lead');

// ─────────────────────────────────────────────────────────────────────────────
//  LeadMind AI — Duplicate Lead Detection
//  UC-04 A2 — Duplicate Leads Detected
//
//  "Duplicate" is checked two ways during an import:
//   1. Against leads ALREADY in the database for this campaign (by phone or
//      email).
//   2. Against rows earlier in the SAME csv file (two rows in one upload with
//      the same phone number) — otherwise both would sail through since
//      neither exists in the DB yet at the start of the batch.
//
//  Phone numbers are normalized before comparison so "0300-1234567" and
//  "(0300) 1234567" are correctly treated as the same number.
// ─────────────────────────────────────────────────────────────────────────────

export interface ExistingContacts {
  phones: Set<string>;
  emails: Set<string>;
}

/** Strips spaces, dashes, dots and parentheses so phone formats compare equal. */
export const normalizePhone = (phone: string): string =>
  phone.replace(/[\s\-().]/g, '').trim();

/**
 * Forms of one caller number that should match a stored lead.
 * Covers +92, 92, and a leading 0 for Pakistan mobiles, plus the raw value.
 */
export function phoneLookupVariants(raw: string): string[] {
  const trimmed = raw.trim();
  const compact = normalizePhone(trimmed);
  const digits = compact.replace(/\D/g, '');
  const variants = new Set<string>();
  if (trimmed) variants.add(trimmed);
  if (compact) variants.add(compact);
  if (digits) {
    variants.add(digits);
    variants.add(`+${digits}`);
  }

  let national = digits;
  if (national.startsWith('92') && national.length > 10) national = national.slice(2);
  else if (national.startsWith('0') && national.length > 1) national = national.slice(1);
  if (national.length >= 10) {
    national = national.slice(-10);
    variants.add(national);
    variants.add(`0${national}`);
    variants.add(`92${national}`);
    variants.add(`+92${national}`);
  }
  return [...variants];
}

/**
 * Matches a stored Pakistan number that still contains spaces or dashes.
 * Other countries stay on exact variant lookup so a short suffix cannot collide.
 */
export function pakistanPhonePattern(raw: string): RegExp | null {
  const digits = raw.replace(/\D/g, '');
  if (!digits.startsWith('92') && !digits.startsWith('0')) return null;

  let national = digits;
  if (national.startsWith('92') && national.length > 10) national = national.slice(2);
  else if (national.startsWith('0')) national = national.slice(1);
  if (national.length < 10) return null;
  national = national.slice(-10);

  const body = national.split('').join('[\\s\\-().]*');
  return new RegExp(`^(?:\\+?92[\\s\\-().]*)?0?${body}$`);
}

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/**
 * Loads every existing phone/email already stored for this campaign, once,
 * before the import loop starts — so duplicate checks during the loop are
 * pure in-memory Set lookups instead of a DB query per row.
 */
export const getExistingContacts = async (campaignId: string): Promise<ExistingContacts> => {
  const records = await getExistingLeadRecords(campaignId);
  return toExistingContacts(records);
};

// ── Day 12 additions — needed for the "Update" duplicate strategy ──────────
// Skip just needs to know "does this exist?" (Sets are enough). Update needs
// to know "existing document's _id, so I can write to that lead specifically.

export interface ExistingLeadRecord {
  id: string;
  phone?: string;
  email?: string;
}

/** Same query as getExistingContacts, but keeps the _id so callers can update in place. */
export const getExistingLeadRecords = async (campaignId: string): Promise<ExistingLeadRecord[]> => {
  const existingLeads = await Lead.find(
    { campaign: campaignId },
    { phone: 1, email: 1 }
  ).lean();

  return existingLeads.map((lead: { _id: any; phone?: string; email?: string }) => ({
    id: lead._id.toString(),
    phone: lead.phone,
    email: lead.email,
  }));
};

/** Derives the plain Sets (for DuplicateChecker) from records already fetched — avoids a second query. */
export const toExistingContacts = (records: ExistingLeadRecord[]): ExistingContacts => {
  const phones = new Set<string>();
  const emails = new Set<string>();

  records.forEach((r) => {
    if (r.phone) phones.add(normalizePhone(r.phone));
    if (r.email) emails.add(normalizeEmail(r.email));
  });

  return { phones, emails };
};

/** Builds phone/email → lead _id lookup maps, used by the 'update' strategy to find which document to write to. */
export const buildContactIdMaps = (
  records: ExistingLeadRecord[]
): { phoneToId: Map<string, string>; emailToId: Map<string, string> } => {
  const phoneToId = new Map<string, string>();
  const emailToId = new Map<string, string>();

  records.forEach((r) => {
    if (r.phone) phoneToId.set(normalizePhone(r.phone), r.id);
    if (r.email) emailToId.set(normalizeEmail(r.email), r.id);
  });

  return { phoneToId, emailToId };
};

/**
 * Stateful checker used once per import: seed it with what's already in the
 * DB, then call isDuplicate() + markSeen() for every row in the file, in
 * order, so in-file duplicates get caught too (first occurrence wins).
 */
export class DuplicateChecker {
  private phones: Set<string>;
  private emails: Set<string>;

  constructor(existing: ExistingContacts) {
    this.phones = new Set(existing.phones);
    this.emails = new Set(existing.emails);
  }

  isDuplicate(phone?: string | null, email?: string | null): boolean {
    const normPhone = phone ? normalizePhone(phone) : null;
    const normEmail = email ? normalizeEmail(email) : null;

    if (normPhone && this.phones.has(normPhone)) return true;
    if (normEmail && this.emails.has(normEmail)) return true;
    return false;
  }

  /** Call after successfully accepting a row so later rows in the same file are checked against it too. */
  markSeen(phone?: string | null, email?: string | null): void {
    const normPhone = phone ? normalizePhone(phone) : null;
    const normEmail = email ? normalizeEmail(email) : null;

    if (normPhone) this.phones.add(normPhone);
    if (normEmail) this.emails.add(normEmail);
  }
}