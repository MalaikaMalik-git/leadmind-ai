'use client';

import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';
import { Spinner } from '@/src/components/ui/Spinner';

// Day 25, Session 2 — added 'rose' so the Analytics page's 5th KPI card
// (Avg Call Duration) doesn't have to reuse a color already used by
// another card. Everything else in this file is unchanged from Day 6.
type KpiColor = 'blue' | 'green' | 'purple' | 'amber' | 'rose';
interface KpiCardProps {
  label: string; value: number | string; icon: LucideIcon;
  color?: KpiColor; trend?: number; loading?: boolean;
}
const C: Record<KpiColor, { iconBg: string; iconColor: string; bar: string; glow: string }> = {
  blue:   { iconBg:'rgba(59,130,246,0.15)',  iconColor:'#60A5FA', bar:'#3B82F6', glow:'rgba(59,130,246,0.05)'  },
  green:  { iconBg:'rgba(34,197,94,0.15)',   iconColor:'#4ADE80', bar:'#22C55E', glow:'rgba(34,197,94,0.05)'   },
  purple: { iconBg:'rgba(139,92,246,0.15)',  iconColor:'#A78BFA', bar:'#8B5CF6', glow:'rgba(139,92,246,0.05)'  },
  amber:  { iconBg:'rgba(245,158,11,0.15)',  iconColor:'#FCD34D', bar:'#F59E0B', glow:'rgba(245,158,11,0.05)'  },
  rose:   { iconBg:'rgba(244,63,94,0.15)',   iconColor:'#FB7185', bar:'#F43F5E', glow:'rgba(244,63,94,0.05)'   },
};

export default function KpiCard({ label, value, icon: Icon, color='blue', trend, loading=false }: KpiCardProps) {
  const c = C[color];
  const pos = (trend ?? 0) >= 0;
  return (
    <div className="rounded-xl relative overflow-hidden" style={{
      background:'#111827', border:'1px solid rgba(255,255,255,0.07)',
      boxShadow:`0 0 16px ${c.glow}`, padding: '12px 14px',
    }}>
      {/* Top: label + icon */}
      <div className="flex items-center justify-between mb-2">
        {loading
          ? <span style={{ fontSize:10, letterSpacing:'0.07em' }} className="font-semibold text-slate-500 uppercase">{label}</span>
          : <span style={{ fontSize:10, letterSpacing:'0.07em' }} className="font-semibold text-slate-500 uppercase">{label}</span>
        }
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background:c.iconBg }}>
          <Icon size={13} strokeWidth={1.75} style={{ color:c.iconColor }}/>
        </div>
      </div>
      {/* Value */}
      {loading
        ? <div className="mb-2" style={{ height:24, display:'flex', alignItems:'center' }}><Spinner size={20}/></div>
        : <div className="text-2xl font-bold text-white mb-2" style={{ lineHeight:1 }}>
            {typeof value==='number' ? value.toLocaleString() : value}
          </div>
      }
      {/* Trend */}
      {loading
        ? <div style={{ height:16 }}/>
        : trend !== undefined
          ? <div className="flex items-center gap-1">
              <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded font-bold" style={{
                fontSize:10, background:pos?'rgba(34,197,94,0.12)':'rgba(239,68,68,0.12)',
                color:pos?'#4ADE80':'#F87171',
              }}>
                {pos?<TrendingUp size={9} strokeWidth={2.5}/>:<TrendingDown size={9} strokeWidth={2.5}/>}
                {pos?'+':''}{trend}%
              </span>
              <span className="text-slate-600" style={{ fontSize:10 }}>vs last week</span>
            </div>
          : <div className="w-full rounded-full" style={{ height:2, background:'rgba(255,255,255,0.06)' }}>
              <div className="h-full rounded-full" style={{ width:'60%', background:c.bar, opacity:0.5 }}/>
            </div>
      }
      <style>{`@keyframes sk{0%{background-position:-300px 0}100%{background-position:300px 0}}.sk{background:linear-gradient(90deg,rgba(255,255,255,0.04) 25%,rgba(255,255,255,0.09) 50%,rgba(255,255,255,0.04) 75%);background-size:300px 100%;animation:sk 1.4s ease-in-out infinite}`}</style>
    </div>
  );
}