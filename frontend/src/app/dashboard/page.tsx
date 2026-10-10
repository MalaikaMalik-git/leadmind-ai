'use client';

import { useEffect, useState } from 'react';
import { Users, CheckCircle, Calendar, Phone } from 'lucide-react';
import KpiCard          from '@/src/components/dashboard/KpiCard';
import CallVolumeChart  from '@/src/components/dashboard/CallVolumeChart';
import LeadStatusDonut  from '@/src/components/dashboard/LeadStatusDonut';
import ActiveCampaigns  from '@/src/components/dashboard/ActiveCampaigns';
import RecentLeadsTable from '@/src/components/dashboard/RecentLeadsTable';
import { getDashboardStats, getCallVolume, DashboardStats, CallVolumePoint, CallVolumeRange } from '@/src/lib/api/dashboard';

export default function DashboardPage() {
  const [stats, setStats]     = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  // Chart has its own range + loading so switching 7D/30D/90D doesn't
  // reload the whole dashboard.
  const [range, setRange]               = useState<CallVolumeRange>(7);
  const [callVolume, setCallVolume]     = useState<CallVolumePoint[]>([]);
  const [chartLoading, setChartLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const data = await getDashboardStats();
        if (!cancelled) { setStats(data); setError(null); }
      } catch { if (!cancelled) setError('Failed to load dashboard data.'); }
      finally  { if (!cancelled) setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setChartLoading(true);
    getCallVolume(range)
      .then(d => { if (!cancelled) setCallVolume(d); })
      .catch(() => { if (!cancelled) setError('Failed to load call volume.'); })
      .finally(() => { if (!cancelled) setChartLoading(false); });
    return () => { cancelled = true; };
  }, [range]);

  return (
    <div className="p-5" style={{ display:'flex', flexDirection:'column', gap:14 }}>

      {/* Header */}
      <div>
        <h2 className="text-white font-bold text-xl">Dashboard</h2>
        <p className="text-slate-500 text-xs mt-0.5">Welcome back, Admin 👋 · Totals are all-time</p>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg px-3 py-2.5 text-xs text-red-400"
          style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)' }}>
          {error}
        </div>
      )}

      {/* KPI cards — 4 columns */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
        <KpiCard label="Total Leads"     value={stats?.kpis.totalLeads     ?? 0} icon={Users}       color="blue"   trend={stats?.trends?.totalLeads} loading={loading}/>
        <KpiCard label="Qualified Leads" value={stats?.kpis.qualifiedLeads ?? 0} icon={CheckCircle} color="green"  trend={stats?.trends?.qualifiedLeads} loading={loading}/>
        <KpiCard label="Meetings Booked" value={stats?.kpis.meetingsBooked ?? 0} icon={Calendar}    color="purple" trend={stats?.trends?.meetingsBooked} loading={loading}/>
        <KpiCard label="Total Calls"     value={stats?.kpis.totalCalls     ?? 0} icon={Phone}       color="amber"  trend={stats?.trends?.totalCalls} loading={loading}/>
      </div>

      {/* Middle row — chart (left) + campaigns (right) — fixed height 280px */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 340px', gap:12 }}>
        <CallVolumeChart data={callVolume} loading={chartLoading} range={range} onRangeChange={setRange}/>
        <ActiveCampaigns campaigns={stats?.activeCampaigns ?? []} loading={loading}/>
      </div>

      {/* Bottom row — recent leads (left) + donut (right) */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 280px', gap:12, alignItems:'start' }}>
        <RecentLeadsTable leads={stats?.recentLeads ?? []} loading={loading}/>
        <LeadStatusDonut  data={stats?.leadStatusBreakdown ?? {}} loading={loading}/>
      </div>

    </div>
  );
}