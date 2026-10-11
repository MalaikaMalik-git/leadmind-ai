'use client';

// ─────────────────────────────────────────────
//  LeadMind AI — StepTone (Wizard Step 2)
//  Day 9 · Session 2
//
//  AI Voice Agent Tone selector — per 30-day plan Day 9
//  and FYP §3.3.4: Professional / Friendly / Direct /
//  Consultative / Persuasive / Soft Warm.
//
//  Colors match TONE_COLORS in CampaignCard.tsx so the
//  same tone always reads the same color across the app.
// ─────────────────────────────────────────────

import { Briefcase, Smile, ArrowRight, Users, Zap, Heart, Check } from 'lucide-react';
import type { CampaignFormData } from '@/src/components/campaigns/campaignForm';

interface StepToneProps {
  form: CampaignFormData;
  updateForm: <K extends keyof CampaignFormData>(key: K, value: CampaignFormData[K]) => void;
}

// ── Tone catalog ───────────────────────────────
// Exported so StepReview can reuse colors/samples in the live preview.
export const TONES: {
  value: CampaignFormData['tone'];
  icon: React.ElementType;
  description: string;
  sample: string;
  bg: string;
  color: string;
  border: string;
}[] = [
  {
    value: 'Professional',
    icon: Briefcase,
    description: 'Formal, polished, straight to business.',
    sample: '"Good afternoon, I\'m calling from [Company] regarding your recent inquiry..."',
    bg: 'rgba(59,130,246,0.08)', color: '#60A5FA', border: 'rgba(59,130,246,0.3)',
  },
  {
    value: 'Friendly',
    icon: Smile,
    description: 'Warm, casual, easy-going conversation.',
    sample: '"Hey! Hope I\'m not catching you at a bad time — quick question for you..."',
    bg: 'rgba(34,197,94,0.08)', color: '#4ADE80', border: 'rgba(34,197,94,0.3)',
  },
  {
    value: 'Direct',
    icon: ArrowRight,
    description: 'Short, no small talk, gets to the point fast.',
    sample: '"I\'ll keep this brief — do you have budget allocated for this project yet?"',
    bg: 'rgba(239,68,68,0.08)', color: '#F87171', border: 'rgba(239,68,68,0.3)',
  },
  {
    value: 'Consultative',
    icon: Users,
    description: 'Advisory, asks questions, listens first.',
    sample: '"I\'d love to understand your goals a bit better before I suggest anything..."',
    bg: 'rgba(139,92,246,0.08)', color: '#A78BFA', border: 'rgba(139,92,246,0.3)',
  },
  {
    value: 'Persuasive',
    icon: Zap,
    description: 'Confident, benefit-driven, creates urgency.',
    sample: '"This is exactly the kind of project where we\'ve seen the fastest results..."',
    bg: 'rgba(245,158,11,0.08)', color: '#FCD34D', border: 'rgba(245,158,11,0.3)',
  },
  {
    value: 'Soft Warm',
    icon: Heart,
    description: 'Gentle, patient, reassuring tone.',
    sample: '"No pressure at all — I just want to understand what you\'re looking for."',
    bg: 'rgba(236,72,153,0.08)', color: '#F472B6', border: 'rgba(236,72,153,0.3)',
  },
];

export default function StepTone({ form, updateForm }: StepToneProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* ── Section heading ───────────────────── */}
      <div>
        <h3 style={{ color: '#F8FAFC', fontSize: 14, fontWeight: 600, margin: 0 }}>
          AI Voice Agent Tone
        </h3>
        <p style={{ color: '#475569', fontSize: 11, marginTop: 4 }}>
          Choose the personality your AI agent uses on every call for this campaign.
        </p>
      </div>

      {/* ── Tone grid ──────────────────────────── */}
      <div style={{
        display:             'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
        gap:                  10,
      }}>
        {TONES.map(t => {
          const isSelected = form.tone === t.value;
          return (
            <ToneCard
              key={t.value}
              tone={t}
              isSelected={isSelected}
              onSelect={() => updateForm('tone', t.value)}
            />
          );
        })}
      </div>

      {/* ── Empty-selection hint ──────────────── */}
      {!form.tone && (
        <p style={{ color: '#334155', fontSize: 10.5, margin: 0 }}>
          Select a tone to continue.
        </p>
      )}
    </div>
  );
}

// ── Individual tone card ──────────────────────
import { useState } from 'react';

function ToneCard({ tone, isSelected, onSelect }: {
  tone: typeof TONES[number];
  isSelected: boolean;
  onSelect: () => void;
}) {
  const [hov, setHov] = useState(false);
  const Icon = tone.icon;

  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        textAlign:    'left',
        display:      'flex',
        flexDirection:'column',
        gap:           8,
        padding:      '13px 14px',
        borderRadius:  10,
        cursor:       'pointer',
        background:    isSelected ? tone.bg : hov ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)',
        border:       `1.5px solid ${isSelected ? tone.border : 'rgba(255,255,255,0.08)'}`,
        transition:   'all 150ms',
        position:     'relative',
      }}
    >
      {/* Selected checkmark */}
      {isSelected && (
        <div style={{
          position:      'absolute',
          top:            10,
          right:          10,
          width:          16,
          height:         16,
          borderRadius:  '50%',
          background:     tone.color,
          display:       'flex',
          alignItems:    'center',
          justifyContent:'center',
        }}>
          <Check size={10} strokeWidth={3} color="#0B1220" />
        </div>
      )}

      {/* Icon + name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width:          28,
          height:         28,
          borderRadius:    8,
          background:      isSelected ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          flexShrink:      0,
        }}>
          <Icon size={14} strokeWidth={2} color={isSelected ? tone.color : '#64748B'} />
        </div>
        <span style={{
          fontSize:   13,
          fontWeight: 600,
          color:      isSelected ? '#F8FAFC' : '#CBD5E1',
        }}>
          {tone.value}
        </span>
      </div>

      {/* Description */}
      <p style={{ color: '#64748B', fontSize: 10.5, margin: 0, lineHeight: 1.5 }}>
        {tone.description}
      </p>

      {/* Sample line */}
      <p style={{
        color:       isSelected ? tone.color : '#334155',
        fontSize:     10,
        margin:       0,
        lineHeight:   1.5,
        fontStyle:   'italic',
        paddingTop:   6,
        borderTop:   `1px solid ${isSelected ? tone.border : 'rgba(255,255,255,0.05)'}`,
      }}>
        {tone.sample}
      </p>
    </button>
  );
}