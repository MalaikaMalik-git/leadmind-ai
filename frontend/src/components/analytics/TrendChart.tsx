'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TimeseriesPoint } from '@/src/lib/api/analytics';
import { Spinner } from '@/src/components/ui/Spinner';

interface Props {
  data: TimeseriesPoint[];
  granularity: 'day' | 'week';
  loading: boolean;
}

// "2026-08-01" -> "Aug 1". Week buckets ("2026-W34") are shown as-is —
// formatting an ISO week into a friendly label isn't worth the extra
// code for a one-day deadline; the tooltip still makes it unambiguous.
function formatBucketLabel(bucket: string, granularity: 'day' | 'week'): string {
  if (granularity === 'week') return bucket;
  const d = new Date(bucket + 'T00:00:00');
  if (isNaN(d.getTime())) return bucket;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function Tip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#1E2D45', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 10px' }}>
      <p style={{ color: '#94A3B8', fontSize: 11, marginBottom: 6, fontWeight: 500 }}>{label}</p>
      {payload.map((e: any) => (
        <div key={e.name} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: e.color, flexShrink: 0 }} />
          <span style={{ color: '#94A3B8', fontSize: 11 }}>{e.name}:</span>
          <span style={{ color: '#fff', fontSize: 11, fontWeight: 600 }}>{e.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function TrendChart({ data, granularity, loading }: Props) {
  const chartData = data.map((p) => ({ ...p, label: formatBucketLabel(p.bucket, granularity) }));

  return (
    <div
      style={{
        background: '#111827',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 12,
        padding: '12px 14px',
        height: 280,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 8, flexShrink: 0 }}>
        <p style={{ color: '#fff', fontSize: 12, fontWeight: 600, lineHeight: 1 }}>Calls, Qualified & Meetings Over Time</p>
        <p style={{ color: '#475569', fontSize: 10, marginTop: 3 }}>
          {granularity === 'week' ? 'Weekly' : 'Daily'} activity for the selected range
        </p>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 6, flexShrink: 0 }}>
        {[
          { l: 'Calls', c: '#3B82F6' },
          { l: 'Qualified', c: '#22C55E' },
          { l: 'Meetings', c: '#A78BFA' },
        ].map((x) => (
          <div key={x.l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 14, height: 2, borderRadius: 2, background: x.c, display: 'block' }} />
            <span style={{ color: '#475569', fontSize: 10 }}>{x.l}</span>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {loading ? (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', width:'100%', height:'100%', minHeight:60 }}><Spinner size={22}/></div>
        ) : chartData.length === 0 ? (
          <div className="w-full h-full flex items-center justify-center">
            <p style={{ color: '#475569', fontSize: 11 }}>No activity in this range.</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 2, right: 4, left: -28, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: '#334155', fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#334155', fontSize: 9 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<Tip />} cursor={{ stroke: 'rgba(255,255,255,0.08)' }} />
              <Line type="monotone" dataKey="calls" name="Calls" stroke="#3B82F6" strokeWidth={1.75} dot={false} activeDot={{ r: 3, fill: '#3B82F6', strokeWidth: 0 }} />
              <Line type="monotone" dataKey="qualified" name="Qualified" stroke="#22C55E" strokeWidth={1.75} dot={false} activeDot={{ r: 3, fill: '#22C55E', strokeWidth: 0 }} />
              <Line type="monotone" dataKey="meetings" name="Meetings" stroke="#A78BFA" strokeWidth={1.75} dot={false} activeDot={{ r: 3, fill: '#A78BFA', strokeWidth: 0 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      <style>{`@keyframes sk{0%{background-position:-600px 0}100%{background-position:600px 0}}.sk{background:linear-gradient(90deg,rgba(255,255,255,0.04) 25%,rgba(255,255,255,0.08) 50%,rgba(255,255,255,0.04) 75%);background-size:600px 100%;animation:sk 1.5s ease-in-out infinite}`}</style>
    </div>
  );
}