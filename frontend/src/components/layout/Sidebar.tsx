'use client';
import { Spinner } from '@/src/components/ui/Spinner';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Megaphone, Users, Phone,
  FileText, CalendarDays, BarChart3, Settings,
  ChevronLeft, ChevronRight, LogOut,
} from 'lucide-react';
import SidebarNavItem from './SidebarNavItem';
import { useAuthContext } from '@/src/context/AuthContext';

const NAV_MAIN = [
  { href: '/dashboard',             icon: LayoutDashboard, label: 'Dashboard'   },
  { href: '/dashboard/campaigns',   icon: Megaphone,       label: 'Campaigns'   },
  { href: '/dashboard/leads',       icon: Users,           label: 'Leads'       },
  { href: '/dashboard/calls',       icon: Phone,           label: 'Calls'       },
  { href: '/dashboard/transcripts', icon: FileText,        label: 'Transcripts' },
] as const;

const NAV_MANAGE = [
  { href: '/dashboard/scheduling',  icon: CalendarDays,    label: 'Scheduling'  },
  { href: '/dashboard/analytics',   icon: BarChart3,       label: 'Analytics'   },
  { href: '/dashboard/settings',    icon: Settings,        label: 'Settings'    },
] as const;

export default function Sidebar() {
  const pathname = usePathname();
  const { admin, logout, isLoading } = useAuthContext();
  const [collapsed, setCollapsed] = useState(false);

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(href);
  }

  const initials = admin?.name
    ? admin.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : 'AD';

  return (
    <aside style={{
      width: collapsed ? 56 : 220,
      minWidth: collapsed ? 56 : 220,
      background: '#080E1C',
      borderRight: '1px solid rgba(255,255,255,0.05)',
      transition: 'width 200ms cubic-bezier(0.4,0,0.2,1), min-width 200ms cubic-bezier(0.4,0,0.2,1)',
    }} className="relative flex flex-col h-screen overflow-hidden z-20">

      {/* ── Logo ── */}
      <div className="flex items-center gap-2.5 flex-shrink-0"
        style={{ height: 56, padding: '0 14px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg,#3B82F6,#1D4ED8)', boxShadow: '0 0 10px rgba(59,130,246,0.35)' }}>
          <svg width="14" height="14" viewBox="0 0 18 18" fill="none">
            <path d="M9 2L15 5.5V12.5L9 16L3 12.5V5.5L9 2Z" stroke="white" strokeWidth="1.5" strokeLinejoin="round"/>
            <circle cx="9" cy="9" r="2.5" fill="white"/>
          </svg>
        </div>
        {!collapsed && (
          <span className="font-bold text-sm tracking-tight">
            <span className="text-white">LeadMind</span>
            <span style={{ color: '#3B82F6' }}> AI</span>
          </span>
        )}
      </div>

      {/* ── Nav ── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden" style={{ padding: '8px 8px 0' }}>

        {/* MAIN label */}
        {!collapsed && (
          <p className="text-slate-700 font-semibold uppercase tracking-widest mb-1"
            style={{ fontSize: 9, padding: '4px 8px' }}>Main</p>
        )}
        <div className="space-y-0.5">
          {NAV_MAIN.map(item => (
            <SidebarNavItem key={item.href} href={item.href} icon={item.icon}
              label={item.label} active={isActive(item.href)} collapsed={collapsed}/>
          ))}
        </div>

        {/* MANAGE label */}
        <div style={{ margin: '8px 0 4px' }}>
          {!collapsed
            ? <p className="text-slate-700 font-semibold uppercase tracking-widest"
                style={{ fontSize: 9, padding: '4px 8px' }}>Manage</p>
            : <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '4px 4px' }}/>
          }
        </div>
        <div className="space-y-0.5">
          {NAV_MANAGE.map(item => (
            <SidebarNavItem key={item.href} href={item.href} icon={item.icon}
              label={item.label} active={isActive(item.href)} collapsed={collapsed}/>
          ))}
        </div>

      </div>

      {/* ── Admin footer ── */}
      <div className="flex-shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.04)', padding: '8px 8px' }}>
        <div className={`flex items-center gap-2.5 rounded-lg px-2 py-2 ${collapsed ? 'justify-center' : ''}`}
          style={{ background: 'rgba(255,255,255,0.03)' }}>
          {/* Avatar */}
          <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
            style={{ background: 'rgba(59,130,246,0.2)', color: '#60A5FA', fontSize: 10 }}>
            {initials}
          </div>
          {!collapsed && (
            <>
              <div className="flex-1 min-w-0">
                <p className="text-slate-300 font-semibold truncate leading-none" style={{ fontSize: 11 }}>{admin?.name ?? 'Admin'}</p>
                <p className="text-slate-600 truncate leading-none mt-0.5" style={{ fontSize: 10 }}>{admin?.email ?? ''}</p>
              </div>
              <button onClick={logout} disabled={isLoading} title="Logout"
                className="flex-shrink-0 p-1 rounded-md text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-all">
                {isLoading ? <Spinner size={12} color="currentColor"/> : <LogOut size={12} strokeWidth={2}/>}
              </button>
            </>
          )}
        </div>
        {collapsed && (
          <button onClick={logout} disabled={isLoading} title="Logout"
            className="w-full flex items-center justify-center p-1.5 mt-1 rounded-lg text-slate-700 hover:text-red-400 hover:bg-red-500/10 transition-all">
            {isLoading ? <Spinner size={12} color="currentColor"/> : <LogOut size={12} strokeWidth={2}/>}
          </button>
        )}
      </div>

      {/* ── Collapse toggle ── */}
      <button onClick={() => setCollapsed(v => !v)}
        style={{
          position: 'absolute', right: -9, top: '50%', transform: 'translateY(-50%)',
          width: 18, height: 18, borderRadius: '50%',
          background: '#1E293B', border: '1px solid rgba(255,255,255,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', zIndex: 30,
        }}
        onMouseEnter={e => (e.currentTarget.style.background = '#334155')}
        onMouseLeave={e => (e.currentTarget.style.background = '#1E293B')}>
        {collapsed
          ? <ChevronRight size={9} strokeWidth={2.5} className="text-slate-400"/>
          : <ChevronLeft  size={9} strokeWidth={2.5} className="text-slate-400"/>}
      </button>
    </aside>
  );
}