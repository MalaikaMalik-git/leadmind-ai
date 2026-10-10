'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { TopicCount } from '@/src/lib/api/analytics';
import { Spinner } from '@/src/components/ui/Spinner';

interface Props {
  topics: TopicCount[];
  loading: boolean;
}

// Cap at the top 8 so long topic lists don't turn into an unreadable
// wall of bars — the SRS asks for "most discussed topics", not all of them.
const MAX_TOPICS = 8;

const BAR_COLOR = '#3B82F6';

function Tip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0];
  return (
    <div style={{ background: '#1E2D45', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 10px' }}>
      <p style={{ color: '#fff', fontSize: 11, fontWeight: 600 }}>{row.payload.topic}</p>
      <p style={{ color: '#94A3B8', fontSize: 11 }}>{row.value} mentions</p>
    </div>
  );
}

export default function TopicsChart({ topics, loading }: Props) {
  const chartData = topics.slice(0, MAX_TOPICS);
  const height = Math.max(220, chartData.length * 32 + 40);

  return (
    <div
      style={{
        background: '#111827',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 12,
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 8, flexShrink: 0 }}>
        <p style={{ color: '#fff', fontSize: 12, fontWeight: 600, lineHeight: 1 }}>Most Discussed Topics</p>
        <p style={{ color: '#475569', fontSize: 10, marginTop: 3 }}>Extracted from call transcripts in the selected range</p>
      </div>

      {/* Chart */}
      <div style={{ height, flexShrink: 0 }}>
        {loading ? (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', width:'100%', height:'100%', minHeight:60 }}><Spinner size={22}/></div>
        ) : chartData.length === 0 ? (
          <div className="w-full h-full flex items-center justify-center">
            <p style={{ color: '#475569', fontSize: 11 }}>No topic data for this range yet.</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ top: 2, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
              <XAxis type="number" tick={{ fill: '#334155', fontSize: 9 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="topic"
                tick={{ fill: '#94A3B8', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={110}
              />
              <Tooltip content={<Tip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={16}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={BAR_COLOR} fillOpacity={1 - i * 0.07} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
      <style>{`@keyframes sk{0%{background-position:-600px 0}100%{background-position:600px 0}}.sk{background:linear-gradient(90deg,rgba(255,255,255,0.04) 25%,rgba(255,255,255,0.08) 50%,rgba(255,255,255,0.04) 75%);background-size:600px 100%;animation:sk 1.5s ease-in-out infinite}`}</style>
    </div>
  );
}