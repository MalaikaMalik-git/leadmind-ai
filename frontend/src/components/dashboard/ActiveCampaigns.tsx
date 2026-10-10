'use client';

import Link from 'next/link';
import { ArrowRight, Megaphone } from 'lucide-react';
import { ActiveCampaign } from '@/src/lib/api/dashboard';
import { Spinner } from '@/src/components/ui/Spinner';

interface Props { campaigns: ActiveCampaign[]; loading: boolean; }
const ST: Record<string,{bg:string;color:string;label:string}> = {
  'Running':{ bg:'rgba(34,197,94,0.15)',  color:'#4ADE80', label:'RUNNING' },
  'Paused': { bg:'rgba(245,158,11,0.15)', color:'#FCD34D', label:'PAUSED'  },
  'Draft':  { bg:'rgba(100,116,139,0.2)', color:'#94A3B8', label:'DRAFT'   },
};

function Row({ c }: { c: ActiveCampaign }) {
  const qr  = c.callsMade>0 ? Math.round((c.qualified/c.callsMade)*100) : 0;
  const pct = c.totalLeads>0 ? Math.round((c.callsMade/c.totalLeads)*100) : 0;
  const st  = ST[c.status] ?? ST['Draft'];
  return (
    <div style={{ padding:'8px 0', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8, marginBottom:5 }}>
        <div style={{ minWidth:0, flex:1 }}>
          <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:2 }}>
            <span style={{ color:'#fff', fontSize:11, fontWeight:500 }} className="truncate">{c.name}</span>
            <span style={{ fontSize:8, padding:'2px 5px', borderRadius:4, fontWeight:700, background:st.bg, color:st.color, flexShrink:0, letterSpacing:'0.05em' }}>{st.label}</span>
          </div>
          <p style={{ color:'#334155', fontSize:10 }}>{c.totalLeads} leads · {c.meetingsBooked} meetings</p>
        </div>
        <div style={{ textAlign:'right', flexShrink:0 }}>
          <span style={{ color:'#fff', fontSize:13, fontWeight:700 }}>{qr}%</span>
          <p style={{ color:'#334155', fontSize:9 }}>qualified</p>
        </div>
      </div>
      <div style={{ width:'100%', borderRadius:99, height:2, background:'rgba(255,255,255,0.06)' }}>
        <div style={{ width:`${pct}%`, height:'100%', borderRadius:99, background:'linear-gradient(90deg,#3B82F6,#60A5FA)' }}/>
      </div>
    </div>
  );
}

export default function ActiveCampaigns({ campaigns, loading }: Props) {
  return (
    <div style={{ background:'#111827', border:'1px solid rgba(255,255,255,0.07)', borderRadius:12, padding:'12px 14px', height:220, display:'flex', flexDirection:'column' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8, flexShrink:0 }}>
        <div>
          <p style={{ color:'#fff', fontSize:12, fontWeight:600, lineHeight:1 }}>Active Campaigns</p>
          <p style={{ color:'#475569', fontSize:10, marginTop:3 }}>{campaigns.length} campaigns running</p>
        </div>
        <Link href="/dashboard/campaigns" style={{ display:'flex', alignItems:'center', gap:4, color:'#3B82F6', fontSize:10, fontWeight:500, textDecoration:'none' }}>
          View all <ArrowRight size={9} strokeWidth={2.5}/>
        </Link>
      </div>
      <div style={{ flex:1, overflowY:'auto' }}>
        {loading ? (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%' }}><Spinner size={22}/></div>
        ) : campaigns.length===0 ? (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:6 }}>
            <Megaphone size={18} strokeWidth={1.25} color="#1E293B"/>
            <p style={{ color:'#1E293B', fontSize:11, textAlign:'center' }}>No active campaigns.<br/>Start one to see it here.</p>
          </div>
        ) : campaigns.map(c=><Row key={c.id} c={c}/>)}
      </div>
      <style>{`@keyframes sk{0%{background-position:-400px 0}100%{background-position:400px 0}}.sk{background:linear-gradient(90deg,rgba(255,255,255,0.04) 25%,rgba(255,255,255,0.08) 50%,rgba(255,255,255,0.04) 75%);background-size:400px 100%;animation:sk 1.5s ease-in-out infinite}`}</style>
    </div>
  );
}