'use client';

// ─────────────────────────────────────────────
//  LeadMind AI — StepReview (Wizard Step 4)
//  Day 9 · Session 3
//
//  Per 30-day plan Day 9: "Review & Confirm with live
//  preview panel". Shows a read-only summary of every
//  field from Steps 1-3, plus a simulated opening line
//  the AI agent would use, based on the chosen tone.
//
//  Edit links jump back to the relevant step via
//  the `onEditStep` callback (owned by page.tsx).
// ─────────────────────────────────────────────

import {
  FileText, Target, MessageSquare, Phone, Palette,
  Calendar, Moon, Pencil, Sparkles,
} from 'lucide-react';
import type { CampaignFormData } from '@/src/app/dashboard/campaigns/create/page';
import { TONES } from './StepTone';

interface StepReviewProps {
  form: CampaignFormData;
  onEditStep: (step: number) => void;
}

function formatDate(d: string): string {
  if (!d) return 'Not set';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function formatTime(t: string): string {
  if (!t) return '—';
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

export default function StepReview({ form, onEditStep }: StepReviewProps) {
  const toneMeta = TONES.find(t => t.value === form.tone);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* ── Section heading ───────────────────── */}
      <div>
        <h3 style={{ color: '#F8FAFC', fontSize: 14, fontWeight: 600, margin: 0 }}>
          Review &amp; Confirm
        </h3>
        <p style={{ color: '#475569', fontSize: 11, marginTop: 4 }}>
          Double-check everything before saving. You can jump back to any step to edit.
        </p>
      </div>

      {/* ── Live preview panel ─────────────────── */}
      <LivePreview form={form} toneMeta={toneMeta} />

      {/* ── Summary cards ──────────────────────── */}
      <SummaryCard
        title="Campaign Details"
        icon={<FileText size={13} strokeWidth={2} />}
        onEdit={() => onEditStep(1)}
      >
        <SummaryRow icon={<FileText size={11} />} label="Name" value={form.name || '—'} />
        <SummaryRow icon={<Target size={11} />} label="Goal" value={form.goal || '—'} />
        <SummaryRow icon={<MessageSquare size={11} />} label="Instructions" value={form.instructions || '—'} multiline />
        <SummaryRow icon={<Phone size={11} />} label="Daily Call Limit" value={`${form.dailyCallLimit} calls / day`} />
      </SummaryCard>

      <SummaryCard
        title="AI Voice Agent Tone"
        icon={<Palette size={13} strokeWidth={2} />}
        onEdit={() => onEditStep(2)}
      >
        {toneMeta ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontSize:      11,
              fontWeight:    600,
              padding:      '3px 10px',
              borderRadius:  99,
              background:    toneMeta.bg,
              color:         toneMeta.color,
              border:       `1px solid ${toneMeta.border}`,
            }}>
              {toneMeta.value}
            </span>
            <span style={{ color: '#475569', fontSize: 11 }}>{toneMeta.description}</span>
          </div>
        ) : (
          <span style={{ color: '#F87171', fontSize: 11 }}>No tone selected</span>
        )}
      </SummaryCard>

      <SummaryCard
        title="Schedule"
        icon={<Calendar size={13} strokeWidth={2} />}
        onEdit={() => onEditStep(3)}
      >
        <SummaryRow icon={<Calendar size={11} />} label="Start Date" value={formatDate(form.startDate)} />
        <SummaryRow icon={<Calendar size={11} />} label="End Date" value={formatDate(form.endDate)} />
        <SummaryRow
          icon={<Moon size={11} />}
          label="Quiet Hours"
          value={
            form.quietHours.enabled
              ? `${formatTime(form.quietHours.startTime)} – ${formatTime(form.quietHours.endTime)} (${form.quietHours.timezone})`
              : 'Disabled'
          }
        />
      </SummaryCard>

      {/* ── Save hint ──────────────────────────── */}
      <p style={{ color: '#334155', fontSize: 10.5, margin: 0, textAlign: 'center' }}>
        Campaigns are created as <strong style={{ color: '#64748B' }}>Draft</strong> — you can start
        the campaign once leads are uploaded.
      </p>
    </div>
  );
}

// ── Live preview panel ────────────────────────
function LivePreview({ form, toneMeta }: {
  form: CampaignFormData;
  toneMeta: typeof TONES[number] | undefined;
}) {
  const companyGoal = form.goal || 'discuss your project needs';
  const opener = toneMeta?.sample ?? '"Hi, thanks for taking my call — do you have a moment?"';

  return (
    <div style={{
      background:   'linear-gradient(135deg, rgba(37,99,235,0.08), rgba(139,92,246,0.05))',
      border:       '1px solid rgba(59,130,246,0.2)',
      borderRadius:  12,
      padding:       16,
      display:      'flex',
      flexDirection:'column',
      gap:            10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Sparkles size={13} strokeWidth={2} color="#60A5FA" />
        <span style={{ color: '#93C5FD', fontSize: 11, fontWeight: 600, letterSpacing: '0.02em' }}>
          LIVE PREVIEW — HOW YOUR AI AGENT WILL SOUND
        </span>
      </div>

      {/* Chat bubble */}
      <div style={{
        display:      'flex',
        gap:           10,
        alignItems:   'flex-start',
      }}>
        <div style={{
          width:          26,
          height:         26,
          borderRadius:  '50%',
          background:    'rgba(59,130,246,0.2)',
          display:       'flex',
          alignItems:    'center',
          justifyContent:'center',
          flexShrink:     0,
          fontSize:       11,
          fontWeight:     700,
          color:         '#60A5FA',
        }}>
          AI
        </div>
        <div style={{
          background:   'rgba(17,24,39,0.6)',
          border:       '1px solid rgba(255,255,255,0.08)',
          borderRadius:  10,
          borderTopLeftRadius: 2,
          padding:      '9px 12px',
          fontSize:      12,
          color:        '#E2E8F0',
          lineHeight:    1.6,
          maxWidth:      '85%',
          fontStyle:    'italic',
        }}>
          {opener}
        </div>
      </div>

      <p style={{ color: '#64748B', fontSize: 10, margin: 0, marginLeft: 36 }}>
        Goal for this call: {companyGoal}
      </p>
    </div>
  );
}

// ── Summary card ───────────────────────────────
function SummaryCard({ title, icon, onEdit, children }: {
  title: string; icon: React.ReactNode; onEdit: () => void; children: React.ReactNode;
}) {
  return (
    <div style={{
      background:   'rgba(255,255,255,0.02)',
      border:       '1px solid rgba(255,255,255,0.07)',
      borderRadius:  10,
      padding:       14,
    }}>
      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        marginBottom:    10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ color: '#475569', display: 'flex' }}>{icon}</span>
          <span style={{ color: '#F8FAFC', fontSize: 12.5, fontWeight: 600 }}>{title}</span>
        </div>
        <button
          type="button"
          onClick={onEdit}
          style={{
            display:     'flex',
            alignItems:  'center',
            gap:          4,
            background:  'transparent',
            border:      'none',
            color:       '#60A5FA',
            fontSize:     10.5,
            fontWeight:   500,
            cursor:      'pointer',
            padding:     '3px 6px',
          }}
        >
          <Pencil size={10} strokeWidth={2} />
          Edit
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {children}
      </div>
    </div>
  );
}

function SummaryRow({ icon, label, value, multiline }: {
  icon: React.ReactNode; label: string; value: string; multiline?: boolean;
}) {
  return (
    <div style={{
      display:       'flex',
      alignItems:     multiline ? 'flex-start' : 'center',
      gap:            8,
    }}>
      <span style={{ color: '#334155', display: 'flex', marginTop: multiline ? 2 : 0, flexShrink: 0 }}>{icon}</span>
      <span style={{ color: '#64748B', fontSize: 11, width: 110, flexShrink: 0 }}>{label}</span>
      <span style={{
        color:      '#CBD5E1',
        fontSize:    11.5,
        lineHeight:  1.6,
        overflow:   multiline ? 'visible' : 'hidden',
        textOverflow: multiline ? 'clip' : 'ellipsis',
        whiteSpace: multiline ? 'normal' : 'nowrap',
      }}>
        {value}
      </span>
    </div>
  );
}