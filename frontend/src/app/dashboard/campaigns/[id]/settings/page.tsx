'use client';

// ─────────────────────────────────────────────
//  LeadMind AI — Campaign Settings Page
//  Day 10 · Session 1 — Shell & navigation
//  Day 10 · Session 2 — Editable fields (Goal/Tone/Instructions/Daily Call Limit)
//  Day 10 · Session 3 — Quiet Hours editor + validation
//  Day 10 · Session 4 — Save flow, API wiring, toasts (THIS SESSION — FINAL)
//
//  Session 4 scope (UC-03 main success scenario, steps 6–10):
//   • Save Changes now calls updateCampaign() → PUT /api/campaigns/:id
//   • Success → campaign/original/edited snapshots refresh from the
//     server response, success toast shown, isDirty resets to false
//   • Error handling:
//     - 422 (validateUpdateCampaign.ts field errors) → mapped onto the
//       same field-level error slots as client validation, plus a toast
//     - Any other error (network, 500, 404-mid-edit) → error toast only
//   • Discard Changes also clears any stale server-side field errors
//   • Save/Discard disabled while a save request is in flight, with a
//     spinner + "Saving..." label on the Save button
// ─────────────────────────────────────────────

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, AlertCircle, RefreshCw, Info, RotateCcw, Check, Loader2,
  Target, MessageSquare, FileText, Phone, Moon,
} from 'lucide-react';

import { getCampaignById, updateCampaign } from '@/src/lib/api/campaigns';
import { Campaign } from '@/src/components/campaigns/CampaignCard';
import { TONES } from '@/src/components/campaigns/wizard/steps/StepTone';
import { TIMEZONES } from '@/src/components/campaigns/wizard/steps/StepSchedule';
import Toast, { ToastState } from '@/src/components/ui/Toast';
import { PageLoader } from '@/src/components/ui/Spinner';

// ── Status badge config (matches CampaignCard) ─
const STATUS_CONFIG: Record<string, { label: string; dot: string; bg: string; color: string; border: string }> = {
  Running:   { label: 'RUNNING',   dot: '#4ADE80', bg: 'rgba(34,197,94,0.12)',  color: '#4ADE80', border: 'rgba(34,197,94,0.25)'  },
  Paused:    { label: 'PAUSED',    dot: '#FCD34D', bg: 'rgba(245,158,11,0.12)', color: '#FCD34D', border: 'rgba(245,158,11,0.25)' },
  Draft:     { label: 'DRAFT',     dot: '#64748B', bg: 'rgba(100,116,139,0.15)',color: '#94A3B8', border: 'rgba(100,116,139,0.25)' },
  Completed: { label: 'COMPLETED', dot: '#60A5FA', bg: 'rgba(59,130,246,0.12)', color: '#60A5FA', border: 'rgba(59,130,246,0.25)'  },
  Archived:  { label: 'ARCHIVED',  dot: '#475569', bg: 'rgba(71,85,105,0.15)',  color: '#64748B', border: 'rgba(71,85,105,0.25)'   },
};

// ── Editable field snapshot ────────────────────
// Only the fields this page can edit (Session 2 + 3).
// Kept separate from `campaign` so we can diff against
// the last-loaded values to know if there are unsaved edits.
interface QuietHoursFields {
  enabled:   boolean;
  startTime: string;
  endTime:   string;
  timezone:  string;
}

interface EditableFields {
  goal:           string;
  tone:           string;
  instructions:   string;
  dailyCallLimit: number;
  quietHours:     QuietHoursFields;
}

function snapshotFrom(c: Campaign): EditableFields {
  return {
    goal:           c.goal,
    tone:           c.tone,
    instructions:   c.instructions,
    dailyCallLimit: c.dailyCallLimit,
    quietHours: {
      enabled:   c.quietHours?.enabled ?? false,
      startTime: c.quietHours?.startTime ?? '22:00',
      endTime:   c.quietHours?.endTime ?? '08:00',
      timezone:  c.quietHours?.timezone ?? 'Asia/Karachi',
    },
  };
}

export default function CampaignSettingsPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  // ── Session 2/3: editable field state ─────────
  const [original, setOriginal] = useState<EditableFields | null>(null);
  const [edited,   setEdited]   = useState<EditableFields | null>(null);

  // ── Session 4: save flow state ────────────────
  const [isSaving,     setIsSaving]     = useState(false);
  const [serverErrors, setServerErrors] = useState<Partial<Record<keyof EditableFields, string>>>({});
  const [toast,        setToast]        = useState<ToastState | null>(null);

  // ── Fetch campaign ─────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const data = await getCampaignById(id);
      setCampaign(data);
      const snap = snapshotFrom(data);
      setOriginal(snap);
      setEdited(snap);
    } catch (err: any) {
      // AuthError.status is set by the apiClient response interceptor
      // (see lib/api/client.ts — patched this session to preserve it).
      if (err?.status === 404) {
        setNotFound(true);
      } else {
        setError(err?.message ?? 'Failed to load campaign. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) load();
  }, [id, load]);

  // ── Field updater ──────────────────────────────
  const updateField = <K extends keyof EditableFields>(key: K, value: EditableFields[K]) => {
    setServerErrors(prev => ({ ...prev, [key]: undefined }));
    setEdited(prev => (prev ? { ...prev, [key]: value } : prev));
  };

  // ── Quiet Hours updater (nested object) ────────
  const updateQuietHours = <K extends keyof QuietHoursFields>(key: K, value: QuietHoursFields[K]) => {
    setServerErrors(prev => ({ ...prev, quietHours: undefined }));
    setEdited(prev => (prev ? { ...prev, quietHours: { ...prev.quietHours, [key]: value } } : prev));
  };

  // ── Dirty check ────────────────────────────────
  const isDirty = useMemo(() => {
    if (!original || !edited) return false;
    return (
      original.goal !== edited.goal ||
      original.tone !== edited.tone ||
      original.instructions !== edited.instructions ||
      original.dailyCallLimit !== edited.dailyCallLimit ||
      original.quietHours.enabled !== edited.quietHours.enabled ||
      original.quietHours.startTime !== edited.quietHours.startTime ||
      original.quietHours.endTime !== edited.quietHours.endTime ||
      original.quietHours.timezone !== edited.quietHours.timezone
    );
  }, [original, edited]);

  // ── Inline validation — mirrors validateUpdateCampaign.ts ──
  const errors = useMemo(() => {
    const e: Partial<Record<keyof EditableFields, string>> = {};
    if (!edited) return e;

    if (!edited.goal.trim()) {
      e.goal = 'Goal cannot be empty.';
    } else if (edited.goal.trim().length > 500) {
      e.goal = 'Goal cannot exceed 500 characters.';
    }

    if (!edited.instructions.trim()) {
      e.instructions = 'Instructions cannot be empty.';
    } else if (edited.instructions.trim().length > 2000) {
      e.instructions = 'Instructions cannot exceed 2000 characters.';
    }

    if (
      !Number.isInteger(edited.dailyCallLimit) ||
      edited.dailyCallLimit < 1 ||
      edited.dailyCallLimit > 500
    ) {
      e.dailyCallLimit = 'Daily call limit must be an integer between 1 and 500.';
    }

    // ── Quiet Hours — mirrors validateUpdateCampaign.ts exactly ──
    // Only invalid when enabled AND start === end (zero-length window).
    // Overnight windows like 22:00 → 08:00 are valid and expected.
    if (edited.quietHours.enabled) {
      if (!edited.quietHours.startTime || !edited.quietHours.endTime) {
        e.quietHours = 'Quiet hours start and end time are required when enabled.';
      } else if (edited.quietHours.startTime === edited.quietHours.endTime) {
        e.quietHours = 'Start and end time must be different.';
      }
    }

    return e;
  }, [edited]);

  const hasErrors = Object.keys(errors).length > 0;

  // ── Merge client-side + server-side (422) field errors for display ──
  // Client errors win if both exist for the same field (they're recomputed
  // live); server errors surface anything the client check didn't catch.
  const displayErrors = useMemo(
    () => ({ ...serverErrors, ...errors }),
    [serverErrors, errors],
  );

  // ── Discard — resets edited fields back to the loaded snapshot ──
  const handleDiscard = () => {
    if (original) setEdited(original);
    setServerErrors({});
  };

  // ── Save — PUT /api/campaigns/:id (UC-03 steps 6–10) ──
  const handleSave = async () => {
    if (!edited || hasErrors || isSaving) return;

    setIsSaving(true);
    try {
      const updated = await updateCampaign(id, edited);

      // Refresh everything from the server's response — this becomes
      // the new "last saved" snapshot, so isDirty goes back to false.
      setCampaign(updated);
      const snap = snapshotFrom(updated);
      setOriginal(snap);
      setEdited(snap);
      setServerErrors({});
      setToast({ type: 'success', message: 'Campaign settings saved successfully.' });
    } catch (err: any) {
      // 422 — validateUpdateCampaign.ts field-level errors (UC-03 A1)
      if (err?.status === 422 && Array.isArray(err?.errors)) {
        const fieldErrors: Partial<Record<keyof EditableFields, string>> = {};
        for (const fe of err.errors as { field: string; message: string }[]) {
          if (fe.field in edited) {
            fieldErrors[fe.field as keyof EditableFields] = fe.message;
          }
        }
        setServerErrors(fieldErrors);
        setToast({ type: 'error', message: err.message ?? 'Please fix the highlighted fields and try again.' });
      } else {
        setToast({ type: 'error', message: err?.message ?? 'Failed to save changes. Please try again.' });
      }
    } finally {
      setIsSaving(false);
    }
  };

  // ── Back nav — warns if there are unsaved edits ──
  const handleBack = () => {
    if (isDirty && !window.confirm('You have unsaved changes. Leave without saving?')) {
      return;
    }
    router.push('/dashboard/campaigns');
  };

  // ── Loading state ──────────────────────────────
  if (loading) return <SettingsSkeleton />;

  // ── 404 state ───────────────────────────────────
  if (notFound) {
    return (
      <CenterState
        title="Campaign not found"
        message="This campaign doesn't exist or may have been deleted."
        actionLabel="Back to Campaigns"
        onAction={() => router.push('/dashboard/campaigns')}
      />
    );
  }

  // ── Error state ─────────────────────────────────
  if (error || !campaign || !edited) {
    return (
      <CenterState
        title="Couldn't load campaign"
        message={error ?? 'Something went wrong.'}
        actionLabel="Retry"
        onAction={load}
        isError
      />
    );
  }

  const st = STATUS_CONFIG[campaign.status] ?? STATUS_CONFIG.Draft;

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 760, paddingBottom: 90 }}>

      {/* ── Back button ─────────────────────────── */}
      <button
        onClick={handleBack}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: '#64748B', fontSize: 12, fontWeight: 500, padding: 0, width: 'fit-content',
        }}
      >
        <ArrowLeft size={13} /> Back to Campaigns
      </button>

      {/* ── Header: name + status badge ─────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h2 style={{ color: '#F8FAFC', fontSize: 18, fontWeight: 700, margin: 0, lineHeight: 1.3 }}>
            {campaign.name}
          </h2>
          <p style={{ color: '#475569', fontSize: 12, marginTop: 5 }}>
            Campaign Settings
          </p>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '4px 10px', borderRadius: 99,
          background: st.bg, border: `1px solid ${st.border}`, flexShrink: 0,
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%', background: st.dot,
            boxShadow: campaign.status === 'Running' ? `0 0 6px ${st.dot}` : 'none',
          }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: st.color, letterSpacing: '0.08em' }}>
            {st.label}
          </span>
        </div>
      </div>

      {/* ── Running campaign notice (UC-03 A2) ──── */}
      {campaign.status === 'Running' && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          padding: '10px 14px', borderRadius: 8,
          background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)',
        }}>
          <Info size={14} color="#60A5FA" style={{ marginTop: 1, flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: '#93C5FD', lineHeight: 1.5 }}>
            This campaign is Running — changes you save here apply only to future calls. Calls already in progress are unaffected.
          </span>
        </div>
      )}

      {/* ── Goal (editable) ──────────────────────── */}
      <Section icon={<Target size={13} />} title="Goal">
        <TextArea
          value={edited.goal}
          onChange={v => updateField('goal', v)}
          rows={2}
          error={displayErrors.goal}
        />
        <CharCount value={edited.goal.length} max={500} error={!!displayErrors.goal} />
      </Section>

      {/* ── Tone (editable — reuses wizard's TONES catalog) ── */}
      <Section icon={<MessageSquare size={13} />} title="Tone">
        <ToneSelector value={edited.tone} onChange={v => updateField('tone', v)} />
      </Section>

      {/* ── AI Instructions (editable) ───────────── */}
      <Section icon={<FileText size={13} />} title="AI Instructions">
        <TextArea
          value={edited.instructions}
          onChange={v => updateField('instructions', v)}
          rows={5}
          error={displayErrors.instructions}
        />
        <CharCount value={edited.instructions.length} max={2000} error={!!displayErrors.instructions} />
      </Section>

      {/* ── Daily Call Limit (editable) ──────────── */}
      <Section icon={<Phone size={13} />} title="Daily Call Limit">
        <NumberInput
          value={edited.dailyCallLimit}
          onChange={v => updateField('dailyCallLimit', v)}
          min={1}
          max={500}
        />
        {displayErrors.dailyCallLimit && <FieldError message={displayErrors.dailyCallLimit} />}
      </Section>

      {/* ── Quiet Hours (editable — Session 3) ───── */}
      <Section icon={<Moon size={13} />} title="Quiet Hours">
        <QuietHoursEditor
          value={edited.quietHours}
          onChange={updateQuietHours}
          error={displayErrors.quietHours}
        />
      </Section>

      {/* ── Sticky footer: Discard / Save ─────────── */}
      <div style={{
        position: 'fixed', bottom: 0, left: 240, right: 0,
        padding: '14px 24px', background: 'rgba(15,23,42,0.92)',
        backdropFilter: 'blur(8px)', borderTop: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', gap: 10, zIndex: 10,
      }}>
        <span style={{ fontSize: 11, color: '#334155' }}>
          {isSaving ? 'Saving…' : isDirty ? 'You have unsaved changes' : 'No unsaved changes'}
        </span>

        <div style={{ flex: 1 }} />

        <button
          onClick={handleDiscard}
          disabled={!isDirty || isSaving}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '9px 16px', borderRadius: 8,
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
            color: (isDirty && !isSaving) ? '#94A3B8' : '#334155', fontSize: 12, fontWeight: 500,
            cursor: (isDirty && !isSaving) ? 'pointer' : 'not-allowed',
          }}
        >
          <RotateCcw size={12} /> Discard Changes
        </button>
        <button
          onClick={handleSave}
          disabled={!isDirty || hasErrors || isSaving}
          title={hasErrors ? 'Fix the highlighted fields first' : undefined}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '9px 18px', borderRadius: 8,
            background: (!isDirty || hasErrors || isSaving) ? 'rgba(37,99,235,0.35)' : '#2563EB',
            border: '1px solid transparent',
            color: (!isDirty || hasErrors || isSaving) ? 'rgba(255,255,255,0.6)' : '#fff',
            fontSize: 12, fontWeight: 600,
            cursor: (!isDirty || hasErrors || isSaving) ? 'not-allowed' : 'pointer',
          }}
        >
          {isSaving && <Loader2 size={13} className="spin" />}
          {isSaving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>

      {/* ── Toast: success/error feedback from the save request ── */}
      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
          onDismiss={() => setToast(null)}
        />
      )}

      <style>{`
        @keyframes settings-spin { to { transform: rotate(360deg); } }
        .spin { animation: settings-spin 0.8s linear infinite; }
      `}</style>
    </div>
  );
}

// ── Section container ─────────────────────────
function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: '#111827', border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 12, padding: '14px 16px',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#64748B' }}>
        {icon}
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.03em', textTransform: 'uppercase' }}>
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

// ── Editable textarea (Session 2) ──────────────
function TextArea({ value, onChange, rows, error }: {
  value: string; onChange: (v: string) => void; rows: number; error?: string;
}) {
  return (
    <div>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={rows}
        style={{
          width: '100%', background: 'rgba(255,255,255,0.03)',
          border: `1px solid ${error ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.1)'}`,
          borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#F8FAFC',
          outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6,
        }}
        onFocus={e => (e.currentTarget.style.borderColor = error ? '#F87171' : '#3B82F6')}
        onBlur={e => (e.currentTarget.style.borderColor = error ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.1)')}
      />
      {error && <FieldError message={error} />}
    </div>
  );
}

// ── Character counter ──────────────────────────
function CharCount({ value, max, error }: { value: number; max: number; error?: boolean }) {
  return (
    <span style={{
      fontSize: 10, alignSelf: 'flex-end',
      color: error ? '#F87171' : value > max * 0.9 ? '#FCD34D' : '#334155',
    }}>
      {value}/{max}
    </span>
  );
}

// ── Field-level error message ──────────────────
function FieldError({ message }: { message: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#F87171', marginTop: 4 }}>
      <AlertCircle size={11} /> {message}
    </span>
  );
}

// ── Number input with stepper buttons (Session 2) ──
// Same visual pattern as StepDetails.tsx's NumberInput (Day 9)
// so calling-rule inputs look identical across the app.
function NumberInput({ value, onChange, min, max }: {
  value: number; onChange: (v: number) => void; min: number; max: number;
}) {
  function clamp(n: number) {
    return Math.min(max, Math.max(min, n));
  }
  return (
    <div style={{
      display: 'flex', alignItems: 'center', width: 160,
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 8, overflow: 'hidden',
    }}>
      <StepperBtn label="−" onClick={() => onChange(clamp(value - 5))} />
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={e => {
          const n = parseInt(e.target.value, 10);
          onChange(Number.isNaN(n) ? min : clamp(n));
        }}
        style={{
          flex: 1, textAlign: 'center', background: 'transparent', border: 'none',
          outline: 'none', color: '#F8FAFC', fontSize: 13, fontWeight: 600, padding: '9px 4px',
        }}
      />
      <StepperBtn label="+" onClick={() => onChange(clamp(value + 5))} />
    </div>
  );
}

function StepperBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: 28, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'transparent', border: 'none', color: '#64748B', fontSize: 14,
        cursor: 'pointer', flexShrink: 0,
      }}
    >
      {label}
    </button>
  );
}

// ── Quiet Hours editor (Session 3) ─────────────
// Same toggle → conditional time/timezone row pattern as
// StepSchedule.tsx (Day 9), reusing the shared TIMEZONES list.
function QuietHoursEditor({ value, onChange, error }: {
  value: QuietHoursFields;
  onChange: <K extends keyof QuietHoursFields>(key: K, value: QuietHoursFields[K]) => void;
  error?: string;
}) {
  return (
    <div>
      {/* Toggle row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ color: '#475569', fontSize: 11, margin: 0, lineHeight: 1.5 }}>
          Block outbound calls during a set time window every day.
        </p>
        <Toggle checked={value.enabled} onChange={v => onChange('enabled', v)} />
      </div>

      {/* Time + timezone row — only visible when enabled */}
      {value.enabled && (
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 1.3fr', gap: 12,
          marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)',
        }}>
          <MiniField label="Starts at">
            <TimeInput value={value.startTime} onChange={v => onChange('startTime', v)} invalid={!!error} />
          </MiniField>
          <MiniField label="Ends at">
            <TimeInput value={value.endTime} onChange={v => onChange('endTime', v)} invalid={!!error} />
          </MiniField>
          <MiniField label="Timezone">
            <SelectInput value={value.timezone} onChange={v => onChange('timezone', v)} options={TIMEZONES} />
          </MiniField>
        </div>
      )}

      {error && <FieldError message={error} />}
    </div>
  );
}

function MiniField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 10.5, fontWeight: 500, color: '#94A3B8' }}>{label}</label>
      {children}
    </div>
  );
}

const baseInputStyle: React.CSSProperties = {
  width: '100%', background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
  padding: '9px 12px', fontSize: 13, color: '#F8FAFC',
  outline: 'none', colorScheme: 'dark',
};

function TimeInput({ value, onChange, invalid }: { value: string; onChange: (v: string) => void; invalid?: boolean }) {
  return (
    <input
      type="time"
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{ ...baseInputStyle, borderColor: invalid ? 'rgba(239,68,68,0.5)' : (baseInputStyle.border as string) }}
    />
  );
}

function SelectInput({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{ ...baseInputStyle, cursor: 'pointer' }}>
      {options.map(o => (
        <option key={o.value} value={o.value} style={{ background: '#111827' }}>{o.label}</option>
      ))}
    </select>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      style={{
        width: 38, height: 22, borderRadius: 99, border: 'none', cursor: 'pointer',
        background: checked ? '#2563EB' : 'rgba(255,255,255,0.12)',
        position: 'relative', transition: 'background 200ms', flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: checked ? 19 : 3, width: 16, height: 16,
        borderRadius: '50%', background: '#fff', transition: 'left 200ms',
        boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
      }} />
    </button>
  );
}

// ── Tone selector (Session 2) ──────────────────
// Reuses the exact TONES catalog exported from the Create Campaign
// wizard's StepTone.tsx — same 6 tones, same colors, everywhere.
function ToneSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
      {TONES.map(t => {
        const active = t.value === value;
        const Icon = t.icon;
        return (
          <button
            key={t.value}
            type="button"
            onClick={() => onChange(t.value)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '8px 10px', borderRadius: 8, textAlign: 'left',
              background: active ? t.bg : 'rgba(255,255,255,0.03)',
              border: `1px solid ${active ? t.border : 'rgba(255,255,255,0.08)'}`,
              cursor: 'pointer', transition: 'all 150ms',
            }}
          >
            <Icon size={13} strokeWidth={2} color={active ? t.color : '#64748B'} />
            <span style={{
              fontSize: 11.5, fontWeight: active ? 600 : 500,
              color: active ? t.color : '#94A3B8',
            }}>
              {t.value}
            </span>
            {active && <Check size={12} color={t.color} style={{ marginLeft: 'auto' }} />}
          </button>
        );
      })}
    </div>
  );
}

// ── Loading skeleton ───────────────────────────
function SettingsSkeleton() {
  return <PageLoader minHeight="calc(100vh - 120px)" label="Loading campaign settings…" />;
}

// ── Shared error / 404 center state ────────────
function CenterState({
  title, message, actionLabel, onAction, isError,
}: {
  title: string; message: string; actionLabel: string; onAction: () => void; isError?: boolean;
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '80px 20px', gap: 12,
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: '50%',
        background: isError ? 'rgba(239,68,68,0.1)' : 'rgba(100,116,139,0.12)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <AlertCircle size={20} strokeWidth={1.5} color={isError ? '#F87171' : '#64748B'} />
      </div>
      <div style={{ textAlign: 'center' }}>
        <p style={{ color: '#CBD5E1', fontSize: 13, fontWeight: 600, margin: 0 }}>{title}</p>
        <p style={{ color: '#475569', fontSize: 12, marginTop: 4 }}>{message}</p>
      </div>
      <button
        onClick={onAction}
        style={{
          marginTop: 8, display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
          background: isError ? 'rgba(239,68,68,0.12)' : '#2563EB',
          border: isError ? '1px solid rgba(239,68,68,0.25)' : '1px solid transparent',
          color: isError ? '#F87171' : '#fff', fontSize: 12, fontWeight: 600,
        }}
      >
        {isError && <RefreshCw size={12} />}
        {actionLabel}
      </button>
    </div>
  );
}