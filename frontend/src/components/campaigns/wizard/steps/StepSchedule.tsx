'use client';

// ─────────────────────────────────────────────
//  LeadMind AI — StepSchedule (Wizard Step 3)
//  Day 9 · Session 3
//
//  Fields (per 30-day plan Day 9 + UC-02/UC-05):
//   • Start Date / End Date        (optional)
//   • Quiet Hours toggle + times + timezone
//   • Advanced options — read-only info panel
//     (retry policy is system-defined per UC-05
//      special requirements: max 2 retries, 30 min apart —
//      NOT an editable field per spec, shown for transparency)
// ─────────────────────────────────────────────

import { useState } from 'react';
import { Calendar, Moon, Info, ChevronDown } from 'lucide-react';
import type { CampaignFormData } from '@/src/components/campaigns/campaignForm';

interface StepScheduleProps {
  form: CampaignFormData;
  updateForm: <K extends keyof CampaignFormData>(key: K, value: CampaignFormData[K]) => void;
}

// Exported so the Campaign Settings page (Day 10 · Session 3)
// reuses the exact same timezone list instead of duplicating it.
export const TIMEZONES = [
  { value: 'Asia/Karachi',    label: 'Asia/Karachi (PKT, UTC+5)' },
  { value: 'Asia/Dubai',      label: 'Asia/Dubai (GST, UTC+4)' },
  { value: 'Europe/London',   label: 'Europe/London (GMT/BST)' },
  { value: 'America/New_York',label: 'America/New York (ET)' },
  { value: 'UTC',             label: 'UTC' },
];

export default function StepSchedule({ form, updateForm }: StepScheduleProps) {
  const quietHoursInvalid =
    form.quietHours.enabled && form.quietHours.startTime === form.quietHours.endTime;

  function updateQuietHours<K extends keyof CampaignFormData['quietHours']>(
    key: K,
    value: CampaignFormData['quietHours'][K],
  ) {
    updateForm('quietHours', { ...form.quietHours, [key]: value });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>

      {/* ── Section heading ───────────────────── */}
      <div>
        <h3 style={{ color: '#F8FAFC', fontSize: 14, fontWeight: 600, margin: 0 }}>
          Schedule
        </h3>
        <p style={{ color: '#475569', fontSize: 11, marginTop: 4 }}>
          Control when this campaign runs and when it should never call leads.
        </p>
      </div>

      {/* ── Start / End Date ───────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Field icon={<Calendar size={12} strokeWidth={2} />} label="Start Date" hint="Leave blank to start immediately after activation.">
          <DateInput
            value={form.startDate}
            onChange={v => updateForm('startDate', v)}
          />
        </Field>
        <Field icon={<Calendar size={12} strokeWidth={2} />} label="End Date" hint="Leave blank to run with no fixed end date.">
          <DateInput
            value={form.endDate}
            onChange={v => updateForm('endDate', v)}
            min={form.startDate || undefined}
          />
        </Field>
      </div>

      {/* ── Quiet Hours ─────────────────────────── */}
      <div style={{
        border:      '1px solid rgba(255,255,255,0.08)',
        borderRadius: 10,
        padding:      16,
        display:      'flex',
        flexDirection:'column',
        gap:           14,
      }}>
        {/* Toggle row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Moon size={13} strokeWidth={2} color="#64748B" />
            <div>
              <span style={{ color: '#F8FAFC', fontSize: 12.5, fontWeight: 600 }}>
                Quiet Hours
              </span>
              <p style={{ color: '#475569', fontSize: 10.5, margin: 0, marginTop: 2 }}>
                Block outbound calls during a set time window every day.
              </p>
            </div>
          </div>
          <Toggle
            checked={form.quietHours.enabled}
            onChange={v => updateQuietHours('enabled', v)}
          />
        </div>

        {/* Time + timezone row — only visible when enabled */}
        {form.quietHours.enabled && (
          <div style={{
            display:             'grid',
            gridTemplateColumns: '1fr 1fr 1.3fr',
            gap:                  12,
            paddingTop:           14,
            borderTop:           '1px solid rgba(255,255,255,0.06)',
          }}>
            <Field label="Starts at" compact>
              <TimeInput
                value={form.quietHours.startTime}
                onChange={v => updateQuietHours('startTime', v)}
                invalid={quietHoursInvalid}
              />
            </Field>
            <Field label="Ends at" compact>
              <TimeInput
                value={form.quietHours.endTime}
                onChange={v => updateQuietHours('endTime', v)}
                invalid={quietHoursInvalid}
              />
            </Field>
            <Field label="Timezone" compact>
              <SelectInput
                value={form.quietHours.timezone}
                onChange={v => updateQuietHours('timezone', v)}
                options={TIMEZONES}
              />
            </Field>
          </div>
        )}

        {/* Validation message */}
        {quietHoursInvalid && (
          <p style={{ color: '#F87171', fontSize: 10.5, margin: 0 }}>
            Start and end time must be different.
          </p>
        )}
      </div>

      {/* ── Advanced options (read-only, per UC-05) ── */}
      <AdvancedOptions />

    </div>
  );
}

// ── Advanced options — collapsible info panel ──
// Per UC-05 Special Requirements, retry policy and rate
// limiting are system-defined (not admin-editable), so this
// is shown for transparency rather than as editable fields.
function AdvancedOptions() {
  const [open, setOpen] = useState(false);

  return (
    <div style={{
      border:       '1px solid rgba(255,255,255,0.06)',
      borderRadius:  10,
      overflow:     'hidden',
    }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width:          '100%',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          padding:        '11px 14px',
          background:     'rgba(255,255,255,0.02)',
          border:         'none',
          cursor:         'pointer',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94A3B8', fontSize: 12, fontWeight: 500 }}>
          <Info size={12} strokeWidth={2} color="#475569" />
          Advanced Options
        </span>
        <ChevronDown
          size={14}
          strokeWidth={2}
          color="#475569"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }}
        />
      </button>

      {open && (
        <div style={{ padding: '4px 14px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <InfoRow label="Retry policy" value="Max 2 retries, 30 minutes apart" />
          <InfoRow label="Call rate limiting" value="Enforced automatically to avoid carrier blocking" />
          <InfoRow label="Quiet hours compliance" value="Checked before every call is placed" />
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ color: '#475569', fontSize: 10.5 }}>{label}</span>
      <span style={{ color: '#64748B', fontSize: 10.5, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

// ── Reusable field wrapper ────────────────────
function Field({ icon, label, hint, compact, children }: {
  icon?: React.ReactNode; label: string; hint?: string;
  compact?: boolean; children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{
        display:    'flex',
        alignItems: 'center',
        gap:         6,
        fontSize:    compact ? 10.5 : 12,
        fontWeight:  500,
        color:      '#94A3B8',
      }}>
        {icon && <span style={{ color: '#475569', display: 'flex' }}>{icon}</span>}
        {label}
      </label>
      {children}
      {hint && (
        <p style={{ color: '#334155', fontSize: 10.5, margin: 0, lineHeight: 1.5 }}>
          {hint}
        </p>
      )}
    </div>
  );
}

// ── Inputs ─────────────────────────────────────
const baseInputStyle: React.CSSProperties = {
  width:        '100%',
  background:   'rgba(255,255,255,0.03)',
  border:       '1px solid rgba(255,255,255,0.1)',
  borderRadius:  8,
  padding:      '9px 12px',
  fontSize:      13,
  color:        '#F8FAFC',
  outline:      'none',
  colorScheme:  'dark',
};

function DateInput({ value, onChange, min }: { value: string; onChange: (v: string) => void; min?: string }) {
  return (
    <input
      type="date"
      value={value}
      min={min}
      onChange={e => onChange(e.target.value)}
      style={baseInputStyle}
      onFocus={e => (e.currentTarget.style.borderColor = '#3B82F6')}
      onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')}
    />
  );
}

function TimeInput({ value, onChange, invalid }: { value: string; onChange: (v: string) => void; invalid?: boolean }) {
  return (
    <input
      type="time"
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        ...baseInputStyle,
        borderColor: invalid ? 'rgba(239,68,68,0.5)' : baseInputStyle.border as string,
      }}
    />
  );
}

function SelectInput({ value, onChange, options }: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{ ...baseInputStyle, cursor: 'pointer' }}
    >
      {options.map(o => (
        <option key={o.value} value={o.value} style={{ background: '#111827' }}>
          {o.label}
        </option>
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
        width:         38,
        height:        22,
        borderRadius:  99,
        border:        'none',
        cursor:        'pointer',
        background:    checked ? '#2563EB' : 'rgba(255,255,255,0.12)',
        position:      'relative',
        transition:    'background 200ms',
        flexShrink:     0,
      }}
    >
      <span style={{
        position:     'absolute',
        top:           3,
        left:          checked ? 19 : 3,
        width:         16,
        height:        16,
        borderRadius: '50%',
        background:   '#fff',
        transition:   'left 200ms',
        boxShadow:    '0 1px 3px rgba(0,0,0,0.4)',
      }} />
    </button>
  );
}