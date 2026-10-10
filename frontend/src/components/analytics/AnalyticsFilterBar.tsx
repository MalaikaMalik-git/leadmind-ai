'use client';

import { DATE_RANGE_PRESETS, DateRangePreset } from '@/src/lib/utils/dateRangePresets';
import { Campaign } from '@/src/components/campaigns/CampaignCard';

interface AnalyticsFilterBarProps {
  campaigns: Campaign[];
  campaignsLoading: boolean;
  selectedCampaignId: string; // '' = All Campaigns
  onCampaignChange: (campaignId: string) => void;
  selectedPreset: DateRangePreset;
  onPresetChange: (preset: DateRangePreset) => void;
}

export default function AnalyticsFilterBar({
  campaigns,
  campaignsLoading,
  selectedCampaignId,
  onCampaignChange,
  selectedPreset,
  onPresetChange,
}: AnalyticsFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {/* Campaign dropdown */}
      <select
        value={selectedCampaignId}
        onChange={(e) => onCampaignChange(e.target.value)}
        disabled={campaignsLoading}
        className="text-sm text-slate-200 rounded-lg px-3 py-2 outline-none"
        style={{
          background: '#111827',
          border: '1px solid rgba(255,255,255,0.08)',
          minWidth: 200,
        }}
      >
        <option value="">All Campaigns</option>
        {campaigns.map((c) => (
          <option key={c._id} value={c._id}>
            {c.name}
          </option>
        ))}
      </select>

      {/* Date range presets */}
      <div
        className="flex items-center gap-1 rounded-lg p-1"
        style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        {DATE_RANGE_PRESETS.map((p) => {
          const active = p.value === selectedPreset;
          return (
            <button
              key={p.value}
              onClick={() => onPresetChange(p.value)}
              className="text-xs font-semibold rounded-md px-3 py-1.5 transition-colors"
              style={{
                color: active ? '#fff' : '#64748B',
                background: active ? '#3B82F6' : 'transparent',
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}