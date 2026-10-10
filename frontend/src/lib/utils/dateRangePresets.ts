// ─────────────────────────────────────────────
//  LeadMind AI — Date range presets
//  Day 25, Session 2
//
//  Analytics filter bar only offers 7D / 30D / 90D / All
//  (custom range picker was cut from Day 25 scope to fit
//  the one-day deadline). This turns a preset into the
//  startDate/endDate ISO strings the backend expects.
// ─────────────────────────────────────────────

// Must match STATS_TIMEZONE on the backend (default Asia/Karachi).
export const STATS_TIMEZONE = 'Asia/Karachi';

export type DateRangePreset = '7D' | '30D' | '90D' | 'All';

export const DATE_RANGE_PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: '7D', label: '7D' },
  { value: '30D', label: '30D' },
  { value: '90D', label: '90D' },
  { value: 'All', label: 'All' },
];

export function presetToDateRange(preset: DateRangePreset): { startDate?: string; endDate?: string } {
  if (preset === 'All') return {};

  const days = preset === '7D' ? 7 : preset === '30D' ? 30 : 90;
  const now = new Date();
  // Day keys are computed in the SAME timezone the backend groups by
  // (STATS_TIMEZONE), so "today" matches on every page.
  const dayKey = (d: Date) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: STATS_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const endDate = dayKey(now);
  const startUtc = new Date(Date.parse(`${endDate}T00:00:00Z`));
  startUtc.setUTCDate(startUtc.getUTCDate() - (days - 1));

  return { startDate: startUtc.toISOString().slice(0, 10), endDate };
}