'use client';

// ─────────────────────────────────────────────
//  LeadMind AI — AdminNotesPanel
//  Day 13 · Session 2
//  UC-07  View Leads & Statuses — "Give admins space to ... add their own notes"
//
//  Self-contained editable notes field: tracks its own dirty state against
//  the last-saved value, disables Save when nothing changed or over the
//  1000-char backend limit (validateLead.ts), and reports save/error back
//  to the parent page via callbacks so the page can drive its shared toast.
// ─────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { NotebookPen, Loader2, Check } from 'lucide-react';

const MAX_LENGTH = 1000;

interface AdminNotesPanelProps {
  notes: string | null;
  onSave: (notes: string) => Promise<void>;
}

export default function AdminNotesPanel({ notes, onSave }: AdminNotesPanelProps) {
  const [value, setValue] = useState(notes ?? '');
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep the field in sync if the lead is reloaded (e.g. after a status change)
  useEffect(() => {
    setValue(notes ?? '');
  }, [notes]);

  const isDirty = value !== (notes ?? '');
  const overLimit = value.length > MAX_LENGTH;

  const handleSave = async () => {
    if (!isDirty || overLimit) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(value);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to save notes.');
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    setValue(notes ?? '');
    setError(null);
  };

  return (
    <div style={{
      borderRadius: 14, border: '1px solid rgba(255,255,255,0.07)',
      background: '#111827', padding: 18,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#CBD5E1', fontSize: 13, fontWeight: 600 }}>
          <NotebookPen size={14} strokeWidth={2} color="#60A5FA" /> Admin Notes
        </span>
        {justSaved && !isDirty && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#4ADE80', fontSize: 11.5, fontWeight: 500 }}>
            <Check size={12} strokeWidth={2.5} /> Saved
          </span>
        )}
      </div>

      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Add notes about this lead — call outcomes, preferences, follow-up reminders…"
        rows={4}
        style={{
          width: '100%', resize: 'vertical', minHeight: 88,
          padding: '10px 12px', borderRadius: 9,
          background: 'rgba(255,255,255,0.03)',
          border: `1px solid ${overLimit ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.08)'}`,
          color: '#F1F5F9', fontSize: 12.5, lineHeight: 1.6,
          fontFamily: 'inherit', outline: 'none',
        }}
      />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
        <span style={{ fontSize: 11, color: overLimit ? '#F87171' : '#475569' }}>
          {value.length}/{MAX_LENGTH}{overLimit ? ' — too long' : ''}
        </span>

        {isDirty && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleDiscard}
              disabled={saving}
              style={{
                padding: '6px 12px', borderRadius: 7, fontSize: 11.5, fontWeight: 500,
                background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
                color: '#94A3B8', cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              Discard
            </button>
            <button
              onClick={handleSave}
              disabled={saving || overLimit}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 7, fontSize: 11.5, fontWeight: 600,
                background: overLimit ? 'rgba(37,99,235,0.4)' : '#2563EB', color: '#fff',
                border: 'none', cursor: saving || overLimit ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving && <Loader2 size={12} className="animate-spin" />}
              {saving ? 'Saving…' : 'Save Notes'}
            </button>
          </div>
        )}
      </div>

      {error && (
        <p style={{ color: '#F87171', fontSize: 11.5, marginTop: 8 }}>{error}</p>
      )}
    </div>
  );
}