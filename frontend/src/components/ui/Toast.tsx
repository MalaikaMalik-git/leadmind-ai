'use client';

// ─────────────────────────────────────────────
//  LeadMind AI — Toast Notification
//  Day 10 · Session 4
//
//  Small, self-contained success/error toast — no external
//  toast library or app-wide provider needed. The consuming
//  page owns a single piece of state:
//    const [toast, setToast] = useState<ToastState | null>(null);
//  and renders <Toast .../> when it's non-null.
//
//  Auto-dismisses itself after `duration` ms (default 4000)
//  by calling onDismiss — the parent just clears its state.
//
//  Reusable anywhere else in the app (Leads, Calls, etc.)
//  that needs the same success/error notification pattern.
// ─────────────────────────────────────────────

import { useEffect } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';

export type ToastType = 'success' | 'error';

export interface ToastState {
  type:    ToastType;
  message: string;
}

interface ToastProps extends ToastState {
  onDismiss: () => void;
  duration?: number; // ms
}

const VARIANT = {
  success: {
    bg:     'rgba(34,197,94,0.12)',
    border: 'rgba(34,197,94,0.3)',
    color:  '#4ADE80',
    Icon:   CheckCircle2,
  },
  error: {
    bg:     'rgba(239,68,68,0.12)',
    border: 'rgba(239,68,68,0.3)',
    color:  '#F87171',
    Icon:   XCircle,
  },
} as const;

export default function Toast({ type, message, onDismiss, duration = 4000 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [onDismiss, duration]);

  const v = VARIANT[type];
  const Icon = v.Icon;

  return (
    <div
      role="status"
      style={{
        position:     'fixed',
        top:           20,
        right:         20,
        zIndex:        1000,
        display:       'flex',
        alignItems:    'center',
        gap:            10,
        padding:       '12px 16px',
        maxWidth:       360,
        borderRadius:   10,
        background:    '#111827',
        border:        `1px solid ${v.border}`,
        boxShadow:     '0 8px 30px rgba(0,0,0,0.4)',
        animation:     'toast-in 200ms ease-out',
      }}
    >
      <div style={{
        width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
        background: v.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={13} strokeWidth={2.5} color={v.color} />
      </div>
      <span style={{ fontSize: 12.5, color: '#E2E8F0', lineHeight: 1.5 }}>
        {message}
      </span>
      <button
        onClick={onDismiss}
        style={{
          marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer',
          color: '#475569', fontSize: 14, padding: 0, lineHeight: 1, flexShrink: 0,
        }}
        aria-label="Dismiss"
      >
        ×
      </button>
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}