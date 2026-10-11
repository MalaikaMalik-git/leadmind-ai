'use client';
import { Spinner } from '@/src/components/ui/Spinner';

import { useState, useEffect, useRef } from 'react';
import { ChevronDown, LogOut, Settings, User, Bell } from 'lucide-react';
import { useAuthContext } from '@/src/context/AuthContext';
import Link from 'next/link';
import GlobalSearch from '@/src/components/layout/GlobalSearch';

interface TopbarProps { title?: string; }

function useLiveDate() {
  const [display, setDisplay] = useState('');
  useEffect(() => {
    const fmt = () => new Date().toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', year:'numeric' });
    setDisplay(fmt());
    const t = setInterval(() => setDisplay(fmt()), 60000);
    return () => clearInterval(t);
  }, []);
  return display;
}

export default function Topbar({ title = 'Dashboard' }: TopbarProps) {
  const { admin, logout, isLoading } = useAuthContext();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const date = useLiveDate();

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const initials = admin?.name
    ? admin.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : 'AD';

  return (
    <header className="relative z-40 flex items-center gap-4 px-5 flex-shrink-0" style={{
      height: 64,
      background: 'rgba(11,17,32,0.8)',
      backdropFilter: 'blur(12px)',
      borderBottom: '1px solid rgba(255,255,255,0.05)',
    }}>
      {/* Page title */}
      <h1 className="text-white font-bold text-sm flex-shrink-0">{title}</h1>

      <GlobalSearch />

      <div className="flex-1"/>

      {/* Date */}
      <span className="text-slate-600 text-xs hidden md:block">{date}</span>

      {/* Divider */}
      <div className="w-px h-4 hidden md:block" style={{ background: 'rgba(255,255,255,0.07)' }}/>

      {/* Bell */}
      <button className="relative p-1.5 rounded-lg text-slate-600 hover:text-slate-300 hover:bg-white/5 transition-all">
        <Bell size={15} strokeWidth={1.75}/>
      </button>

      {/* Avatar dropdown */}
      <div className="relative flex-shrink-0" ref={ref}>
        <button onClick={() => setOpen(v => !v)}
          className="flex items-center gap-2 rounded-xl px-2 py-1.5 transition-all hover:bg-white/5">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-blue-300 flex-shrink-0"
            style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.25)' }}>
            {initials}
          </div>
          <span className="text-sm text-slate-300 hidden lg:block max-w-[100px] truncate font-medium">{admin?.name ?? 'Admin'}</span>
          <ChevronDown size={12} strokeWidth={2.5} className={`text-slate-600 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}/>
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-2 w-52 rounded-2xl overflow-hidden z-50"
            style={{ background: '#0F1E35', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 16px 48px rgba(0,0,0,0.5)' }}>
            <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-sm font-semibold text-white truncate">{admin?.name ?? 'Admin'}</p>
              <p className="text-xs text-slate-500 truncate mt-0.5">{admin?.email ?? ''}</p>
            </div>
            <div className="py-1.5">
              <Link href="/dashboard/settings" onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2 text-xs text-slate-400 hover:text-white hover:bg-white/5 transition-all">
                <Settings size={13} strokeWidth={1.75}/> Settings
              </Link>
              <Link href="/dashboard/settings#profile" onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2 text-xs text-slate-400 hover:text-white hover:bg-white/5 transition-all">
                <User size={13} strokeWidth={1.75}/> Profile
              </Link>
            </div>
            <div className="py-1.5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <button onClick={() => { setOpen(false); logout(); }} disabled={isLoading}
                className="flex w-full items-center gap-2.5 px-4 py-2 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all">
                {isLoading ? <Spinner size={13} color="currentColor"/> : <LogOut size={13} strokeWidth={1.75}/>} {isLoading ? 'Signing out…' : 'Sign out'}
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}