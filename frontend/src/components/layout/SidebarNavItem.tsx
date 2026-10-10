'use client';

import Link from 'next/link';
import { LucideIcon } from 'lucide-react';

interface SidebarNavItemProps {
  href: string; icon: LucideIcon; label: string;
  active?: boolean; collapsed?: boolean;
}

export default function SidebarNavItem({ href, icon: Icon, label, active = false, collapsed = false }: SidebarNavItemProps) {
  return (
    <Link href={href} title={collapsed ? label : undefined}
      className={`group relative flex items-center rounded-lg transition-all duration-150
        ${collapsed ? 'justify-center px-0 py-2' : 'gap-2.5 px-2.5 py-1.5'}
        ${active
          ? 'bg-blue-600/15 text-blue-400'
          : 'text-slate-500 hover:bg-white/[0.04] hover:text-slate-300'
        }`}
    >
      {/* Active bar */}
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full bg-blue-500"/>
      )}

      {/* Icon */}
      <Icon size={15} strokeWidth={active ? 2 : 1.75}
        className={`flex-shrink-0 ${active ? 'text-blue-400' : 'text-slate-600 group-hover:text-slate-400'}`}/>

      {/* Label */}
      {!collapsed && (
        <span className="truncate text-xs font-medium leading-none">{label}</span>
      )}

      {/* Tooltip when collapsed */}
      {collapsed && (
        <span className="pointer-events-none absolute left-full ml-2.5 z-50 whitespace-nowrap rounded-lg px-2 py-1 text-xs text-slate-200 opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}>
          {label}
        </span>
      )}
    </Link>
  );
}