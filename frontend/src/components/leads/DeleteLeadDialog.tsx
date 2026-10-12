'use client';

import { useEffect } from 'react';
import { Loader2, Trash2, X } from 'lucide-react';

interface Props {
  leadName: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}

export default function DeleteLeadDialog({ leadName, busy, error, onClose, onConfirm }: Props) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-lead-title"
      onClick={() => !busy && onClose()}
      style={{
        position: 'fixed', inset: 0, zIndex: 80,
        background: 'rgba(2,6,23,0.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: '100%', maxWidth: 440,
          background: '#0F172A',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 14,
          boxShadow: '0 24px 80px rgba(0,0,0,0.45)',
          padding: 18,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <h2 id="delete-lead-title" style={{ color: '#F8FAFC', fontSize: 16, fontWeight: 650, margin: 0 }}>
            Delete {leadName}?
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            style={{
              width: 30, height: 30, borderRadius: 8, cursor: busy ? 'not-allowed' : 'pointer',
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
              color: '#94A3B8', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={14} />
          </button>
        </div>
        <p style={{ color: '#94A3B8', fontSize: 13, lineHeight: 1.5, margin: '10px 0 0' }}>
          This removes the lead, their calls, and their transcript. A booked meeting is cancelled on the calendar as well.
        </p>
        {error && (
          <p style={{ color: '#F87171', fontSize: 12, margin: '12px 0 0' }}>{error}</p>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{
              padding: '8px 14px', borderRadius: 8, cursor: busy ? 'not-allowed' : 'pointer',
              border: '1px solid rgba(255,255,255,0.1)', background: 'transparent',
              color: '#94A3B8', fontSize: 12, fontWeight: 600,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 8, cursor: busy ? 'not-allowed' : 'pointer',
              border: '1px solid transparent', background: '#DC2626', color: '#fff',
              fontSize: 12, fontWeight: 600,
            }}
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            Delete lead
          </button>
        </div>
      </div>
    </div>
  );
}
