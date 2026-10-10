'use client';

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { CallVolumePoint, CallVolumeRange } from '@/src/lib/api/dashboard';
import { Spinner } from '@/src/components/ui/Spinner';

interface Props {
  data: CallVolumePoint[];
  loading: boolean;
  range: CallVolumeRange;
  onRangeChange: (r: CallVolumeRange) => void;
}

const RANGES: { label: string; value: CallVolumeRange }[] = [
  { label: '7D', value: 7 }, { label: '30D', value: 30 }, { label: '90D', value: 90 },
];

function Tip({ active, payload, label }: any) {
  if (!active||!payload?.length) return null;
  return (
    <div style={{ background:'#1E2D45', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, padding:'8px 10px' }}>
      <p style={{ color:'#94A3B8', fontSize:11, marginBottom:6, fontWeight:500 }}>{label}</p>
      {payload.map((e: any) => (
        <div key={e.name} style={{ display:'flex', alignItems:'center', gap:6, padding:'2px 0' }}>
          <span style={{ width:6, height:6, borderRadius:'50%', background:e.color, flexShrink:0 }}/>
          <span style={{ color:'#94A3B8', fontSize:11 }}>{e.name}:</span>
          <span style={{ color:'#fff', fontSize:11, fontWeight:600 }}>{e.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function CallVolumeChart({ data, loading, range, onRangeChange }: Props) {
  return (
    <div style={{ background:'#111827', border:'1px solid rgba(255,255,255,0.07)', borderRadius:12, padding:'12px 14px', height:220, display:'flex', flexDirection:'column' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:8, flexShrink:0 }}>
        <div>
          <p style={{ color:'#fff', fontSize:12, fontWeight:600, lineHeight:1 }}>Call Volume & Conversions</p>
          <p style={{ color:'#475569', fontSize:10, marginTop:3 }}>Daily calls vs qualified leads · last {range} days</p>
        </div>
        <div style={{ display:'flex', gap:2, padding:'3px', background:'rgba(255,255,255,0.05)', borderRadius:8 }}>
          {RANGES.map(f => (
            <button key={f.label} onClick={() => onRangeChange(f.value)} style={{
              padding:'3px 8px', borderRadius:6, fontSize:10, fontWeight:600, cursor:'pointer', border:'none',
              background:range===f.value?'#3B82F6':'transparent', color:range===f.value?'#fff':'#475569',
            }}>{f.label}</button>
          ))}
        </div>
      </div>
      {/* Legend */}
      <div style={{ display:'flex', gap:12, marginBottom:6, flexShrink:0 }}>
        {[{l:'Total Calls',c:'#3B82F6'},{l:'Qualified',c:'#22C55E'}].map(x=>(
          <div key={x.l} style={{ display:'flex', alignItems:'center', gap:5 }}>
            <span style={{ width:14, height:2, borderRadius:2, background:x.c, display:'block' }}/>
            <span style={{ color:'#475569', fontSize:10 }}>{x.l}</span>
          </div>
        ))}
      </div>
      {/* Chart */}
      <div style={{ flex:1, minHeight:0 }}>
        {loading ? <div style={{ display:'flex', alignItems:'center', justifyContent:'center', width:'100%', height:'100%', minHeight:60 }}><Spinner size={22}/></div> : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top:2, right:4, left:-28, bottom:0 }}>
              <defs>
                <linearGradient id="gC" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3B82F6" stopOpacity={0.2}/><stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/></linearGradient>
                <linearGradient id="gQ" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#22C55E" stopOpacity={0.15}/><stop offset="95%" stopColor="#22C55E" stopOpacity={0}/></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false}/>
              <XAxis dataKey="date" tick={{ fill:'#334155', fontSize:9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={24}/>
              <YAxis tick={{ fill:'#334155', fontSize:9 }} axisLine={false} tickLine={false} allowDecimals={false}/>
              <Tooltip content={<Tip/>} cursor={{ stroke:'rgba(255,255,255,0.05)' }}/>
              <Area type="monotone" dataKey="calls"    name="Total Calls" stroke="#3B82F6" strokeWidth={1.5} fill="url(#gC)" dot={false} activeDot={{ r:3, fill:'#3B82F6', strokeWidth:0 }}/>
              <Area type="monotone" dataKey="qualified" name="Qualified"   stroke="#22C55E" strokeWidth={1.5} fill="url(#gQ)" dot={false} activeDot={{ r:3, fill:'#22C55E', strokeWidth:0 }}/>
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
      <style>{`@keyframes sk{0%{background-position:-600px 0}100%{background-position:600px 0}}.sk{background:linear-gradient(90deg,rgba(255,255,255,0.04) 25%,rgba(255,255,255,0.08) 50%,rgba(255,255,255,0.04) 75%);background-size:600px 100%;animation:sk 1.5s ease-in-out infinite}`}</style>
    </div>
  );
}