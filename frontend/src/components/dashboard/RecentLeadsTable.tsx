'use client';

import Link from 'next/link';
import { ArrowRight, Users } from 'lucide-react';
import { RecentLead } from '@/src/lib/api/dashboard';
import { Spinner } from '@/src/components/ui/Spinner';

interface Props { leads: RecentLead[]; loading: boolean; }

const SS: Record<string,{bg:string;color:string}> = {
  'Qualified':            { bg:'rgba(34,197,94,0.15)',   color:'#4ADE80' },
  'Meeting Booked':       { bg:'rgba(59,130,246,0.15)',  color:'#60A5FA' },
  'Pending':              { bg:'rgba(100,116,139,0.18)', color:'#94A3B8' },
  'Not Qualified':        { bg:'rgba(239,68,68,0.15)',   color:'#F87171' },
  'No Answer':            { bg:'rgba(245,158,11,0.15)',  color:'#FCD34D' },
  'Calling':              { bg:'rgba(167,139,250,0.15)', color:'#A78BFA' },
  'Needs Review':         { bg:'rgba(245,158,11,0.15)',  color:'#FCD34D' },
  'Abandoned':            { bg:'rgba(252,165,165,0.15)', color:'#FCA5A5' },
  'Needs Human Follow-up':{ bg:'rgba(103,232,249,0.15)', color:'#67E8F9' },
  'Call Failed':          { bg:'rgba(220,38,38,0.15)',   color:'#EF4444' },
};
const DS = { bg:'rgba(100,116,139,0.18)', color:'#94A3B8' };

const AC = ['rgba(59,130,246,0.2)','rgba(34,197,94,0.2)','rgba(139,92,246,0.2)','rgba(245,158,11,0.2)','rgba(239,68,68,0.2)'];
const AT = ['#60A5FA','#4ADE80','#A78BFA','#FCD34D','#F87171'];

function badge(status: string) {
  const s = SS[status]??DS;
  return (
    <span style={{ background:s.bg, color:s.color, fontSize:9, fontWeight:700, padding:'2px 7px', borderRadius:99, whiteSpace:'nowrap' }}>
      {status}
    </span>
  );
}

function scoreBar(score: number|null) {
  if (score===null) return <span style={{ color:'#334155', fontSize:11 }}>—</span>;
  const color = score>=60?'#4ADE80':score>=40?'#FCD34D':'#F87171';
  return (
    <div style={{ display:'flex', alignItems:'center', gap:5 }}>
      <div style={{ width:48, height:3, borderRadius:99, background:'rgba(255,255,255,0.07)', overflow:'hidden' }}>
        <div style={{ width:`${score}%`, height:'100%', borderRadius:99, background:color }}/>
      </div>
      <span style={{ fontSize:10, fontWeight:700, color }}>{score}</span>
    </div>
  );
}

function fmt(iso: string) {
  const diff = Date.now()-new Date(iso).getTime();
  const h = Math.floor(diff/3600000);
  if (h<1) return 'just now';
  if (h<24) return `${h}h ago`;
  const d = Math.floor(h/24);
  if (d<7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-US',{month:'short',day:'numeric'});
}

function initials(name: string) {
  return name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2);
}

export default function RecentLeadsTable({ leads, loading }: Props) {
  return (
    <div style={{ background:'#111827', border:'1px solid rgba(255,255,255,0.07)', borderRadius:12, overflow:'hidden' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
        <div>
          <p style={{ color:'#fff', fontSize:12, fontWeight:600, lineHeight:1 }}>Recent Leads</p>
          <p style={{ color:'#475569', fontSize:10, marginTop:3 }}>Latest qualified & active leads</p>
        </div>
        <Link href="/dashboard/leads" style={{ display:'flex', alignItems:'center', gap:4, color:'#3B82F6', fontSize:10, fontWeight:500, textDecoration:'none' }}>
          View all <ArrowRight size={9} strokeWidth={2.5}/>
        </Link>
      </div>

      {/* Table */}
      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
              {['LEAD','CAMPAIGN','SCORE','STATUS','LAST CALL'].map(col=>(
                <th key={col} style={{ padding:'7px 12px', textAlign:'left', fontSize:9, fontWeight:700, color:'#334155', letterSpacing:'0.07em' }}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ padding:'32px 12px', textAlign:'center' }}><Spinner size={22}/></td></tr>
            ) : leads.length===0 ? (
              <tr>
                <td colSpan={5} style={{ padding:'28px 12px', textAlign:'center' }}>
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
                    <div style={{ width:32, height:32, borderRadius:8, background:'rgba(255,255,255,0.04)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <Users size={15} strokeWidth={1.25} color="#1E293B"/>
                    </div>
                    <p style={{ color:'#334155', fontSize:11, fontWeight:500 }}>No leads yet</p>
                    <p style={{ color:'#1E293B', fontSize:10 }}>Upload a CSV or start a campaign to see leads here.</p>
                  </div>
                </td>
              </tr>
            ) : (
              leads.map((lead,i)=>(
                <tr key={lead.id} style={{ borderBottom:i<leads.length-1?'1px solid rgba(255,255,255,0.03)':'none', cursor:'pointer' }}
                  onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,255,255,0.02)')}
                  onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                  <td style={{ padding:'7px 12px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                      <div style={{ width:24, height:24, borderRadius:'50%', background:AC[i%5], color:AT[i%5], display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:700, flexShrink:0 }}>
                        {initials(lead.fullName)}
                      </div>
                      <div>
                        <p style={{ color:'#fff', fontSize:11, fontWeight:500, lineHeight:1 }}>{lead.fullName}</p>
                        <p style={{ color:'#334155', fontSize:9, marginTop:2 }}>{lead.source||'Outbound'}</p>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding:'7px 12px' }}><span style={{ color:'#64748B', fontSize:11 }}>{lead.campaignName}</span></td>
                  <td style={{ padding:'7px 12px' }}>{scoreBar(lead.qualificationScore)}</td>
                  <td style={{ padding:'7px 12px' }}>{badge(lead.status)}</td>
                  <td style={{ padding:'7px 12px' }}><span style={{ color:'#475569', fontSize:10 }}>{fmt(lead.createdAt)}</span></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <style>{`@keyframes sk{0%{background-position:-600px 0}100%{background-position:600px 0}}.sk{background:linear-gradient(90deg,rgba(255,255,255,0.04) 25%,rgba(255,255,255,0.08) 50%,rgba(255,255,255,0.04) 75%);background-size:600px 100%;animation:sk 1.5s ease-in-out infinite}`}</style>
    </div>
  );
}