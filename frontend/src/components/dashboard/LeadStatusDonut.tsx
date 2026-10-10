'use client';

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { Spinner } from '@/src/components/ui/Spinner';

interface Props { data: Record<string,number>; loading: boolean; }

const SC: Record<string,string> = {
  'Qualified':'#22C55E','Meeting Booked':'#3B82F6','Needs Review':'#F59E0B',
  'Not Qualified':'#EF4444','Pending':'#64748B','No Answer':'#FB923C',
  'Calling':'#A78BFA','Abandoned':'#F472B6',
};
const FB = ['#3B82F6','#22C55E','#F59E0B','#EF4444','#A78BFA','#FB923C'];
const gc = (s:string,i:number) => SC[s]??FB[i%FB.length];

function Tip({ active, payload }: any) {
  if (!active||!payload?.length) return null;
  return (
    <div style={{ background:'#1E2D45', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, padding:'6px 10px' }}>
      <p style={{ color:'#fff', fontSize:11, fontWeight:600 }}>{payload[0].name}</p>
      <p style={{ color:'#94A3B8', fontSize:10 }}>{payload[0].value} leads</p>
    </div>
  );
}

export default function LeadStatusDonut({ data, loading }: Props) {
  const entries = Object.entries(data).filter(([,v])=>v>0);
  const total   = entries.reduce((s,[,v])=>s+v,0);
  const cd      = entries.map(([name,value])=>({name,value}));

  return (
    <div style={{ background:'#111827', border:'1px solid rgba(255,255,255,0.07)', borderRadius:12, padding:'12px 14px' }}>
      <p style={{ color:'#fff', fontSize:12, fontWeight:600, lineHeight:1 }}>Lead Status</p>
      <p style={{ color:'#475569', fontSize:10, marginTop:3, marginBottom:10 }}>Distribution overview</p>

      {loading ? (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:'28px 0' }}><Spinner size={22}/></div>
      ) : cd.length===0 ? (
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6, padding:'12px 0' }}>
          <div style={{ width:64, height:64, borderRadius:'50%', border:'6px solid rgba(255,255,255,0.05)' }}/>
          <p style={{ color:'#1E293B', fontSize:11 }}>No lead data yet</p>
        </div>
      ) : (
        <>
          <div style={{ height:100 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={cd} cx="50%" cy="50%" innerRadius={28} outerRadius={46} paddingAngle={2} dataKey="value" strokeWidth={0}>
                  {cd.map((e,i)=><Cell key={e.name} fill={gc(e.name,i)}/>)}
                </Pie>
                <Tooltip content={<Tip/>}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div style={{ marginTop:8, display:'flex', flexDirection:'column', gap:5 }}>
            {cd.slice(0,5).map((e,i)=>(
              <div key={e.name} style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, minWidth:0 }}>
                  <span style={{ width:7, height:7, borderRadius:'50%', background:gc(e.name,i), flexShrink:0 }}/>
                  <span style={{ color:'#64748B', fontSize:10 }} className="truncate">{e.name}</span>
                </div>
                <span style={{ color:'#CBD5E1', fontSize:10, fontWeight:600, marginLeft:8, flexShrink:0 }}>{e.value}</span>
              </div>
            ))}
            {total>0 && (
              <div style={{ display:'flex', justifyContent:'space-between', paddingTop:6, borderTop:'1px solid rgba(255,255,255,0.05)', marginTop:2 }}>
                <span style={{ color:'#475569', fontSize:10, fontWeight:500 }}>Total</span>
                <span style={{ color:'#fff', fontSize:10, fontWeight:700 }}>{total}</span>
              </div>
            )}
          </div>
        </>
      )}
      <style>{`@keyframes sk{0%{background-position:-400px 0}100%{background-position:400px 0}}.sk{background:linear-gradient(90deg,rgba(255,255,255,0.04) 25%,rgba(255,255,255,0.08) 50%,rgba(255,255,255,0.04) 75%);background-size:400px 100%;animation:sk 1.5s ease-in-out infinite}`}</style>
    </div>
  );
}