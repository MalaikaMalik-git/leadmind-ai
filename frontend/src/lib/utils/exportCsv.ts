import Papa from 'papaparse';
import { AnalyticsSummary, TimeseriesPoint, TopicCount } from '@/src/lib/api/analytics';

interface ExportCsvArgs {
  summary: AnalyticsSummary | null;
  timeseries: TimeseriesPoint[];
  topics: TopicCount[];
  campaignName: string; // "All Campaigns" or the selected campaign's name
  rangeLabel: string; // "7D" | "30D" | "90D" | "All"
}

// Builds one CSV with three sections (Summary / Trend / Topics), each with
// its own header row. Opening this in Excel/Sheets shows all three as one
// sheet, separated by a blank row — good enough for a report attachment,
// no need for a multi-sheet workbook here.
export function buildAnalyticsCsv({ summary, timeseries, topics, campaignName, rangeLabel }: ExportCsvArgs): string {
  const parts: string[] = [];

  parts.push(`LeadMind AI — Analytics Export`);
  parts.push(`Campaign,${campaignName}`);
  parts.push(`Date Range,${rangeLabel}`);
  parts.push(`Generated At,${new Date().toISOString()}`);
  parts.push('');

  parts.push('Summary');
  parts.push(
    Papa.unparse({
      fields: ['Total Calls', 'Qualified Leads', 'Meetings Booked', 'Qual Rate %', 'Avg Call Duration'],
      data: [
        [
          summary?.totalCalls ?? 0,
          summary?.qualifiedLeads ?? 0,
          summary?.meetingsBooked ?? 0,
          summary?.qualRatePercent ?? 0,
          summary?.avgCallDurationFormatted ?? '00:00',
        ],
      ],
    })
  );
  parts.push('');

  parts.push('Trend');
  parts.push(
    Papa.unparse({
      fields: ['Date/Week', 'Calls', 'Qualified', 'Meetings'],
      data: timeseries.map((p) => [p.bucket, p.calls, p.qualified, p.meetings]),
    })
  );
  parts.push('');

  parts.push('Most Discussed Topics');
  parts.push(
    Papa.unparse({
      fields: ['Topic', 'Mentions'],
      data: topics.map((t) => [t.topic, t.count]),
    })
  );

  return parts.join('\n');
}

// Triggers a browser download of the given CSV string
export function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}