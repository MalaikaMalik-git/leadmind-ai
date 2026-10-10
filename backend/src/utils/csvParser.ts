import { parse } from 'csv-parse/sync';

// ─────────────────────────────────────────────────────────────────────────────
//  LeadMind AI — CSV Parser Utility
//  UC-04  Upload Lead List (CSV)
//
//  Wraps csv-parse to turn the raw multer buffer into:
//    - headers: the original column names exactly as they appear in the file
//    - rows:    an array of { header: value } objects, one per data row
//
//  This is intentionally "dumb" — it does NOT know about Full Name / Phone /
//  Email etc. That mapping + validation lives in leadValidation.ts. This file
//  only turns bytes into structured rows and fails loudly if the file itself
//  is not valid CSV.
// ─────────────────────────────────────────────────────────────────────────────

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

export class CsvParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CsvParseError';
  }
}

export const parseCsvBuffer = (buffer: Buffer): ParsedCsv => {
  let records: Record<string, string>[];

  try {
    records = parse(buffer, {
      columns: true,          // use first row as object keys
      skip_empty_lines: true, // ignore blank lines in the file
      trim: true,             // trim whitespace on every cell
      relax_column_count: true, // tolerate rows with extra/missing trailing commas
      bom: true,               // strip UTF-8 BOM (common from Excel exports)
    });
  } catch (err: any) {
    // csv-parse throws on malformed CSV (unclosed quotes, broken structure, etc.)
    throw new CsvParseError(`Could not parse CSV file: ${err.message}`);
  }

  if (!records || records.length === 0) {
    throw new CsvParseError('CSV file is empty or contains no data rows.');
  }

  // Headers are just the keys of the first parsed record (csv-parse guarantees
  // every record has the same keys when columns: true is used).
  const headers = Object.keys(records[0]);

  return { headers, rows: records };
};