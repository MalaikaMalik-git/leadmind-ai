'use client';

import { useEffect, useState } from 'react';
import { Phone, CheckCircle, Calendar, Percent, Clock } from 'lucide-react';
import KpiCard from '@/src/components/dashboard/KpiCard';
import AnalyticsFilterBar from '@/src/components/analytics/AnalyticsFilterBar';
import TrendChart from '@/src/components/analytics/TrendChart';
import TopicsChart from '@/src/components/analytics/TopicsChart';
import ExportButtons from '@/src/components/analytics/ExportButtons';
import {
  getAnalyticsSummary,
  getAnalyticsTimeseries,
  getTopicAnalytics,
  AnalyticsSummary,
  TimeseriesPoint,
  TopicCount,
} from '@/src/lib/api/analytics';
import { fetchCampaigns } from '@/src/lib/api/campaigns';
import { Campaign } from '@/src/components/campaigns/CampaignCard';
import { DateRangePreset, presetToDateRange } from '@/src/lib/utils/dateRangePresets';

// 90D and All ranges bucket by week instead of by day — a 90-day daily
// line chart is too noisy to read, and All-time could span years.
function granularityForPreset(preset: DateRangePreset): 'day' | 'week' {
  return preset === '90D' || preset === 'All' ? 'week' : 'day';
}

export default function AnalyticsPage() {
  // ── Filters ──
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(true);
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<DateRangePreset>('All');

  // ── Summary (5 KPI cards) ──
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  // ── Trend chart ──
  const [timeseries, setTimeseries] = useState<TimeseriesPoint[]>([]);
  const [timeseriesLoading, setTimeseriesLoading] = useState(true);

  // ── Topics chart ──
  const [topics, setTopics] = useState<TopicCount[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  // Load campaigns once, for the filter dropdown
  useEffect(() => {
    let cancelled = false;
    async function loadCampaigns() {
      try {
        setCampaignsLoading(true);
        const { campaigns: list } = await fetchCampaigns({ limit: 50, includeArchived: true });
        if (!cancelled) setCampaigns(list);
      } catch {
        // Non-fatal — filter bar just falls back to "All Campaigns" only
      } finally {
        if (!cancelled) setCampaignsLoading(false);
      }
    }
    loadCampaigns();
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-fetch everything whenever campaign or date range changes.
  // Three independent calls, fired together — one failing doesn't block the others.
  useEffect(() => {
    let cancelled = false;
    const { startDate, endDate } = presetToDateRange(selectedPreset);
    const campaignId = selectedCampaignId || undefined;
    const granularity = granularityForPreset(selectedPreset);

    async function loadSummary() {
      try {
        setSummaryLoading(true);
        const data = await getAnalyticsSummary({ campaignId, startDate, endDate });
        if (!cancelled) setSummary(data);
      } catch {
        if (!cancelled) setError('Failed to load analytics data.');
      } finally {
        if (!cancelled) setSummaryLoading(false);
      }
    }

    async function loadTimeseries() {
      try {
        setTimeseriesLoading(true);
        const data = await getAnalyticsTimeseries({ campaignId, startDate, endDate, granularity });
        if (!cancelled) setTimeseries(data.series);
      } catch {
        if (!cancelled) setError('Failed to load analytics data.');
      } finally {
        if (!cancelled) setTimeseriesLoading(false);
      }
    }

    async function loadTopics() {
      try {
        setTopicsLoading(true);
        const data = await getTopicAnalytics({ campaignId, startDate, endDate });
        if (!cancelled) setTopics(data.topics);
      } catch {
        if (!cancelled) setError('Failed to load analytics data.');
      } finally {
        if (!cancelled) setTopicsLoading(false);
      }
    }

    setError(null);
    loadSummary();
    loadTimeseries();
    loadTopics();

    return () => {
      cancelled = true;
    };
  }, [selectedCampaignId, selectedPreset]);

  const campaignName = selectedCampaignId
    ? campaigns.find((c) => c._id === selectedCampaignId)?.name ?? 'Unknown Campaign'
    : 'All Campaigns';

  return (
    <div className="p-6 space-y-6">
      {/* Print-only report header — hidden on screen, shown only in the PDF export */}
      <div className="print-only" style={{ display: 'none' }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>LeadMind AI — Analytics Report</h1>
        <p style={{ fontSize: 11, color: '#333' }}>
          Campaign: {campaignName} · Range: {selectedPreset} · Generated: {new Date().toLocaleString()}
        </p>
        <hr style={{ margin: '10px 0' }} />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-white text-xl font-semibold">Analytics</h2>
          <p className="text-slate-500 text-sm mt-1">Track call volume, qualification rates, and more.</p>
        </div>
        <ExportButtons
          summary={summary}
          timeseries={timeseries}
          topics={topics}
          campaignName={campaignName}
          rangeLabel={selectedPreset}
        />
      </div>

      {/* Error */}
      {error && (
        <div
          className="no-print rounded-lg px-3 py-2.5 text-xs text-red-400"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
        >
          {error}
        </div>
      )}

      {/* Filter bar */}
      <div className="no-print">
        <AnalyticsFilterBar
          campaigns={campaigns}
          campaignsLoading={campaignsLoading}
          selectedCampaignId={selectedCampaignId}
          onCampaignChange={setSelectedCampaignId}
          selectedPreset={selectedPreset}
          onPresetChange={setSelectedPreset}
        />
      </div>

      {/* 5 KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <KpiCard
          label="Total Calls"
          value={summary?.totalCalls ?? 0}
          icon={Phone}
          color="blue"
          loading={summaryLoading}
        />
        <KpiCard
          label="Qualified Leads"
          value={summary?.qualifiedLeads ?? 0}
          icon={CheckCircle}
          color="green"
          loading={summaryLoading}
        />
        <KpiCard
          label="Meetings Booked"
          value={summary?.meetingsBooked ?? 0}
          icon={Calendar}
          color="purple"
          loading={summaryLoading}
        />
        <KpiCard
          label="Qual Rate"
          value={summary ? `${summary.qualRatePercent}%` : '0%'}
          icon={Percent}
          color="amber"
          loading={summaryLoading}
        />
        <KpiCard
          label="Avg Call Duration"
          value={summary?.avgCallDurationFormatted ?? '00:00'}
          icon={Clock}
          color="rose"
          loading={summaryLoading}
        />
      </div>

      {/* Trend chart */}
      <TrendChart data={timeseries} granularity={granularityForPreset(selectedPreset)} loading={timeseriesLoading} />

      {/* Topics chart */}
      <TopicsChart topics={topics} loading={topicsLoading} />

      {/* Print stylesheet — used only by ExportButtons' "Export PDF" (window.print()) */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body { background: #fff !important; color: #000 !important; }
        }
      `}</style>
    </div>
  );
}