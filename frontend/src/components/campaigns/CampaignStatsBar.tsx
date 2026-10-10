'use client';
import { Spinner } from '@/src/components/ui/Spinner';

// ─────────────────────────────────────────────
//  LeadMind AI — CampaignStatsBar
//  Day 8 · Session 1
//
//  5 stat cards across the top of the Campaigns page:
//    Total · Running · Paused · Draft · Completed
//
//  Props come from the parent page (mock in Session 1,
//  real API data wired in Session 3).
// ─────────────────────────────────────────────

interface StatItem {
  label:     string;
  value:     number;
  dotColor:  string;
  valColor:  string;
  bg:        string;
  border:    string;
}

interface CampaignStatsBarProps {
  total:     number;
  running:   number;
  paused:    number;
  draft:     number;
  completed: number;
  loading?:  boolean;
}

export default function CampaignStatsBar({
  total, running, paused, draft, completed, loading = false,
}: CampaignStatsBarProps) {

  const stats: StatItem[] = [
    {
      label:    'Total Campaigns',
      value:    total,
      dotColor: '#64748B',
      valColor: '#F8FAFC',
      bg:       '#111827',
      border:   'rgba(255,255,255,0.07)',
    },
    {
      label:    'Running',
      value:    running,
      dotColor: '#4ADE80',
      valColor: '#4ADE80',
      bg:       'rgba(34,197,94,0.06)',
      border:   'rgba(34,197,94,0.18)',
    },
    {
      label:    'Paused',
      value:    paused,
      dotColor: '#FCD34D',
      valColor: '#FCD34D',
      bg:       'rgba(245,158,11,0.06)',
      border:   'rgba(245,158,11,0.18)',
    },
    {
      label:    'Draft',
      value:    draft,
      dotColor: '#64748B',
      valColor: '#94A3B8',
      bg:       '#111827',
      border:   'rgba(255,255,255,0.07)',
    },
    {
      label:    'Completed',
      value:    completed,
      dotColor: '#60A5FA',
      valColor: '#60A5FA',
      bg:       'rgba(59,130,246,0.06)',
      border:   'rgba(59,130,246,0.18)',
    },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 18 }}>
      {stats.map((s) => (
        <div
          key={s.label}
          style={{
            background:   s.bg,
            border:       `1px solid ${s.border}`,
            borderRadius: 10,
            padding:      '12px 14px',
            display:      'flex',
            flexDirection:'column',
            gap:           6,
          }}
        >
          {/* Label row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: s.dotColor, flexShrink: 0,
            }} />
            <span style={{ fontSize: 10, color: '#64748B', fontWeight: 500, letterSpacing: '0.04em' }}>
              {s.label}
            </span>
          </div>

          {/* Value */}
          {loading ? (
            <Spinner size={18} />
          ) : (
            <span style={{ fontSize: 22, fontWeight: 700, color: s.valColor, lineHeight: 1 }}>
              {s.value}
            </span>
          )}
        </div>
      ))}

      <style>{`
        @keyframes sk {
          0%   { background-position: -400px 0; }
          100% { background-position:  400px 0; }
        }
        .sk {
          background: linear-gradient(
            90deg,
            rgba(255,255,255,0.04) 25%,
            rgba(255,255,255,0.09) 50%,
            rgba(255,255,255,0.04) 75%
          );
          background-size: 400px 100%;
          animation: sk 1.5s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}