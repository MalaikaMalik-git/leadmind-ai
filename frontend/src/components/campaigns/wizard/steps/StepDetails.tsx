'use client';

// ─────────────────────────────────────────────
//  LeadMind AI — StepDetails (Wizard Step 1)
//  Day 9 · Session 2
//
//  Fields (per FYP §3.3.4 / UC-02):
//   • Campaign Name        (required)
//   • Goal                 (required)
//   • Instructions         (required — used verbatim by AI agent, UC-02 special req)
//   • Daily Call Limit     (required, numeric ≥ 1)
//
//  Pure controlled component — no local state, no API calls.
//  Reads/writes through the `form` + `updateForm` props
//  passed down from create/page.tsx.
// ─────────────────────────────────────────────

import { FileText, Target, MessageSquare, Phone } from 'lucide-react';
import type { CampaignFormData } from '@/src/components/campaigns/campaignForm';

interface StepDetailsProps {
  form: CampaignFormData;
  updateForm: <K extends keyof CampaignFormData>(key: K, value: CampaignFormData[K]) => void;
}

export default function StepDetails({ form, updateForm }: StepDetailsProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* ── Section heading ───────────────────── */}
      <div>
        <h3 style={{ color: '#F8FAFC', fontSize: 14, fontWeight: 600, margin: 0 }}>
          Campaign Details
        </h3>
        <p style={{ color: '#475569', fontSize: 11, marginTop: 4 }}>
          Tell the AI agent what this campaign is for and how it should behave.
        </p>
      </div>

      {/* ── Campaign Name ──────────────────────── */}
      <Field
        icon={<FileText size={12} strokeWidth={2} />}
        label="Campaign Name"
        required
        hint="Shown in the Campaign List — keep it short and clear."
      >
        <TextInput
          value={form.name}
          onChange={v => updateForm('name', v)}
          placeholder="e.g. Q3 Outbound — SaaS Founders"
          maxLength={80}
        />
      </Field>

      {/* ── Goal ────────────────────────────────── */}
      <Field
        icon={<Target size={12} strokeWidth={2} />}
        label="Goal"
        required
        hint="What is this campaign trying to achieve?"
      >
        <TextInput
          value={form.goal}
          onChange={v => updateForm('goal', v)}
          placeholder="e.g. Book discovery calls with software house decision-makers"
          maxLength={140}
        />
      </Field>

      {/* ── Instructions ────────────────────────── */}
      <Field
        icon={<MessageSquare size={12} strokeWidth={2} />}
        label="AI Agent Instructions"
        required
        hint="Used verbatim by the AI agent during calls — greeting, qualifying questions, criteria."
      >
        <TextArea
          value={form.instructions}
          onChange={v => updateForm('instructions', v)}
          placeholder={
            'e.g. Greet the lead, introduce our software house, ask about their project ' +
            'budget, timeline and required service. Qualify based on a minimum budget of ' +
            '$5,000 and a defined timeline.'
          }
          rows={5}
        />
      </Field>

      {/* ── Daily Call Limit ────────────────────── */}
      <Field
        icon={<Phone size={12} strokeWidth={2} />}
        label="Daily Call Limit"
        required
        hint="Maximum number of outbound calls this campaign can place per day."
      >
        <NumberInput
          value={form.dailyCallLimit}
          onChange={v => updateForm('dailyCallLimit', v)}
          min={1}
          max={500}
        />
      </Field>

    </div>
  );
}

// ── Reusable field wrapper ────────────────────
function Field({ icon, label, required, hint, children }: {
  icon: React.ReactNode; label: string; required?: boolean;
  hint?: string; children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{
        display:    'flex',
        alignItems: 'center',
        gap:         6,
        fontSize:    12,
        fontWeight:  500,
        color:      '#94A3B8',
      }}>
        <span style={{ color: '#475569', display: 'flex' }}>{icon}</span>
        {label}
        {required && <span style={{ color: '#F87171', fontSize: 11 }}>*</span>}
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

// ── Plain-HTML text input (dark theme, inline styles) ──
function TextInput({ value, onChange, placeholder, maxLength }: {
  value: string; onChange: (v: string) => void;
  placeholder?: string; maxLength?: number;
}) {
  return (
    <div style={{ position: 'relative' }}>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        style={{
          width:        '100%',
          background:   'rgba(255,255,255,0.03)',
          border:       '1px solid rgba(255,255,255,0.1)',
          borderRadius:  8,
          padding:      '9px 12px',
          fontSize:      13,
          color:        '#F8FAFC',
          outline:      'none',
        }}
        onFocus={e => (e.currentTarget.style.borderColor = '#3B82F6')}
        onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')}
      />
      {maxLength && (
        <span style={{
          position:  'absolute',
          right:      10,
          bottom:    -16,
          fontSize:   9,
          color:     '#334155',
        }}>
          {value.length}/{maxLength}
        </span>
      )}
    </div>
  );
}

// ── Plain-HTML textarea ───────────────────────
function TextArea({ value, onChange, placeholder, rows }: {
  value: string; onChange: (v: string) => void;
  placeholder?: string; rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows ?? 4}
      style={{
        width:        '100%',
        background:   'rgba(255,255,255,0.03)',
        border:       '1px solid rgba(255,255,255,0.1)',
        borderRadius:  8,
        padding:      '10px 12px',
        fontSize:      13,
        color:        '#F8FAFC',
        outline:      'none',
        resize:       'vertical',
        fontFamily:   'inherit',
        lineHeight:    1.6,
      }}
      onFocus={e => (e.currentTarget.style.borderColor = '#3B82F6')}
      onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')}
    />
  );
}

// ── Number input with stepper buttons ─────────
function NumberInput({ value, onChange, min, max }: {
  value: number; onChange: (v: number) => void;
  min: number; max: number;
}) {
  function clamp(n: number) {
    return Math.min(max, Math.max(min, n));
  }

  return (
    <div style={{
      display:      'flex',
      alignItems:   'center',
      width:         160,
      background:   'rgba(255,255,255,0.03)',
      border:       '1px solid rgba(255,255,255,0.1)',
      borderRadius:  8,
      overflow:     'hidden',
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
          flex:         1,
          textAlign:   'center',
          background:  'transparent',
          border:      'none',
          outline:     'none',
          color:       '#F8FAFC',
          fontSize:     13,
          fontWeight:   600,
          padding:     '9px 4px',
          MozAppearance:'textfield',
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
        width:      28,
        height:     34,
        display:    'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
        border:     'none',
        color:      '#64748B',
        fontSize:    14,
        cursor:     'pointer',
        flexShrink:  0,
      }}
    >
      {label}
    </button>
  );
}