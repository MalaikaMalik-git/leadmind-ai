'use client';

import { Download, Printer } from 'lucide-react';
import { AnalyticsSummary, TimeseriesPoint, TopicCount } from '@/src/lib/api/analytics';
import { buildAnalyticsCsv, downloadCsv } from '@/src/lib/utils/exportCsv';

interface Props {
  summary: AnalyticsSummary | null;
  timeseries: TimeseriesPoint[];
  topics: TopicCount[];
  campaignName: string;
  rangeLabel: string;
}

export default function ExportButtons({ summary, timeseries, topics, campaignName, rangeLabel }: Props) {
  function handleExportCsv() {
    const csv = buildAnalyticsCsv({ summary, timeseries, topics, campaignName, rangeLabel });
    const datePart = new Date().toISOString().slice(0, 10);
    downloadCsv(csv, `leadmind-analytics-${datePart}.csv`);
  }

  function handleExportPdf() {
    // Native browser print-to-PDF — see .print-only / .no-print rules in
    // page.tsx's <style> block. The user picks "Save as PDF" as the
    // destination in the print dialog; no PDF library involved.
    window.print();
  }

  return (
    <div className="no-print flex items-center gap-2">
      <button
        onClick={handleExportCsv}
        className="flex items-center gap-1.5 text-xs font-semibold rounded-lg px-3 py-2 transition-colors"
        style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.08)', color: '#CBD5E1' }}
      >
        <Download size={13} strokeWidth={2} />
        Export CSV
      </button>
      <button
        onClick={handleExportPdf}
        className="flex items-center gap-1.5 text-xs font-semibold rounded-lg px-3 py-2 transition-colors"
        style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.08)', color: '#CBD5E1' }}
      >
        <Printer size={13} strokeWidth={2} />
        Export PDF
      </button>
    </div>
  );
}