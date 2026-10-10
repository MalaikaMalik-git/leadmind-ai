'use client';
import { Spinner } from '@/src/components/ui/Spinner';

// ─────────────────────────────────────────────
//  LeadMind AI — CampaignCard
//  Day 8 · Session 2
//
//  Displays a single campaign with:
//   • Status badge (Running / Paused / Draft / Completed / Archived)
//   • Campaign name, goal excerpt, tone tag
//   • Lead stats: total leads, calls made, meetings booked
//   • Qualification rate progress bar
//   • Action buttons: View | Pause/Resume | Import Leads
//
//  Props: campaign object (shape from Campaign.js model)
//         onPause / onResume / onView callbacks (wired in Session 3)
// ─────────────────────────────────────────────

import { useState } from 'react';
import {
  Eye, Pause, Play, Upload, Settings, Trash2, RotateCcw,
  Users, Phone, Calendar, Target,
} from 'lucide-react';

// ── Campaign type (matches Campaign.js model) ─
export interface Campaign {
  _id:           string;
  name:          string;
  goal:          string;
  tone:          string;
  instructions:  string;
  status:        'Draft' | 'Running' | 'Paused' | 'Completed' | 'Archived';
  dailyCallLimit: number;
  quietHours: {
    enabled:   boolean;
    startTime: string;
    endTime:   string;
    timezone:  string;
  };
  startDate:     string | null;
  endDate:       string | null;
  startedAt:     string | null;
  createdAt:     string;
  stats: {
    totalLeads:    number;
    callsMade:     number;
    callsAnswered: number;
    qualified:     number;
    notQualified:  number;
    meetingsBooked:number;
    noAnswer:      number;
    failed:        number;
  };
  qualificationCriteria: {
    qualificationThreshold: number;
  };
}

// ── Status config ─────────────────────────────
const STATUS_CONFIG: Record<string, {
  label: string; dot: string; bg: string;
  color: string; border: string;
}> = {
  Running:   { label: 'RUNNING',   dot: '#4ADE80', bg: 'rgba(34,197,94,0.12)',  color: '#4ADE80', border: 'rgba(34,197,94,0.25)'  },
  Paused:    { label: 'PAUSED',    dot: '#FCD34D', bg: 'rgba(245,158,11,0.12)', color: '#FCD34D', border: 'rgba(245,158,11,0.25)' },
  Draft:     { label: 'DRAFT',     dot: '#64748B', bg: 'rgba(100,116,139,0.15)',color: '#94A3B8', border: 'rgba(100,116,139,0.25)' },
  Completed: { label: 'COMPLETED', dot: '#60A5FA', bg: 'rgba(59,130,246,0.12)', color: '#60A5FA', border: 'rgba(59,130,246,0.25)'  },
  Archived:  { label: 'ARCHIVED',  dot: '#475569', bg: 'rgba(71,85,105,0.15)',  color: '#64748B', border: 'rgba(71,85,105,0.25)'   },
};

// ── Tone pill colors ──────────────────────────
const TONE_COLORS: Record<string, { bg: string; color: string }> = {
  Professional:  { bg: 'rgba(59,130,246,0.12)',  color: '#60A5FA' },
  Friendly:      { bg: 'rgba(34,197,94,0.12)',   color: '#4ADE80' },
  Direct:        { bg: 'rgba(239,68,68,0.12)',   color: '#F87171' },
  Consultative:  { bg: 'rgba(139,92,246,0.12)',  color: '#A78BFA' },
  Persuasive:    { bg: 'rgba(245,158,11,0.12)',  color: '#FCD34D' },
  'Soft Warm':   { bg: 'rgba(236,72,153,0.12)',  color: '#F472B6' },
};

// ── Helpers ───────────────────────────────────
function qualRate(s: Campaign['stats']): number {
  if (!s.callsAnswered) return 0;
  return Math.round((s.qualified / s.callsAnswered) * 100);
}

function callProgress(s: Campaign['stats']): number {
  if (!s.totalLeads) return 0;
  return Math.round((s.callsMade / s.totalLeads) * 100);
}

function formatDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Props ─────────────────────────────────────
interface CampaignCardProps {
  campaign:   Campaign;
  onView:     (id: string) => void;
  onPause:    (id: string) => void;
  onResume:   (id: string) => void;
  onImport:   (id: string) => void;
  onSettings: (id: string) => void;
  /** Opens the archive / delete dialog */
  onDelete:   (id: string) => void;
  /** Archived campaigns only */
  onRestore:  (id: string) => void;
  /** True while a pause/resume request for this campaign is in flight */
  busy?:      boolean;
}

export default function CampaignCard({
  campaign, onView, onPause, onResume, onImport, onSettings, onDelete, onRestore, busy = false,
}: CampaignCardProps) {
  const [hovered, setHovered] = useState(false);

  const st   = STATUS_CONFIG[campaign.status] ?? STATUS_CONFIG.Draft;
  const tone = TONE_COLORS[campaign.tone]    ?? TONE_COLORS.Professional;
  const qr   = qualRate(campaign.stats);
  const cp   = callProgress(campaign.stats);

  // Qualification rate bar colour: green ≥60, amber 30–59, red <30
  const archived = campaign.status === 'Archived';
  const qrBarColor = qr >= 60 ? '#4ADE80' : qr >= 30 ? '#FCD34D' : '#F87171';

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background:   '#111827',
        border:       `1px solid ${hovered ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.07)'}`,
        borderRadius:  12,
        padding:      '14px 16px',
        display:      'flex',
        flexDirection:'column',
        gap:           12,
        transition:   'border-color 150ms, box-shadow 150ms',
        boxShadow:    hovered ? '0 4px 24px rgba(0,0,0,0.35)' : 'none',
        cursor:       'default',
        opacity:      archived ? 0.8 : 1,
      }}
    >
      {/* ── Row 1: Status badge + Tone pill ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        {/* Status badge */}
        <div style={{
          display:     'flex',
          alignItems:  'center',
          gap:          5,
          padding:     '3px 8px',
          borderRadius: 99,
          background:   st.bg,
          border:      `1px solid ${st.border}`,
        }}>
          {/* Pulsing dot for Running */}
          <span style={{
            width:      6,
            height:     6,
            borderRadius:'50%',
            background:  st.dot,
            flexShrink:  0,
            boxShadow:   campaign.status === 'Running' ? `0 0 6px ${st.dot}` : 'none',
          }} />
          <span style={{ fontSize: 9, fontWeight: 700, color: st.color, letterSpacing: '0.08em' }}>
            {st.label}
          </span>
        </div>

        {/* Tone pill */}
        <span style={{
          fontSize:     9,
          fontWeight:   600,
          padding:     '2px 8px',
          borderRadius: 99,
          background:   tone.bg,
          color:        tone.color,
          letterSpacing:'0.04em',
        }}>
          {campaign.tone}
        </span>
      </div>

      {/* ── Row 2: Campaign name + goal ── */}
      <div>
        <h3 style={{
          color:      '#F8FAFC',
          fontSize:    14,
          fontWeight:  600,
          margin:      0,
          lineHeight:  1.3,
          whiteSpace: 'nowrap',
          overflow:   'hidden',
          textOverflow:'ellipsis',
        }}>
          {campaign.name}
        </h3>
        <p style={{
          color:      '#475569',
          fontSize:    11,
          marginTop:   4,
          lineHeight:  1.5,
          display:    '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient:'vertical',
          overflow:   'hidden',
        }}>
          {campaign.goal}
        </p>
      </div>

      {/* ── Row 3: 4 mini stats ── */}
      <div style={{
        display:             'grid',
        gridTemplateColumns: 'repeat(4,1fr)',
        gap:                  6,
      }}>
        {[
          { icon: Users,    label: 'Leads',    value: campaign.stats.totalLeads     },
          { icon: Phone,    label: 'Calls',    value: campaign.stats.callsMade      },
          { icon: Target,   label: 'Qualified',value: campaign.stats.qualified      },
          { icon: Calendar, label: 'Meetings', value: campaign.stats.meetingsBooked },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} style={{
            background:   'rgba(255,255,255,0.03)',
            border:       '1px solid rgba(255,255,255,0.05)',
            borderRadius:  8,
            padding:      '7px 8px',
            textAlign:    'center',
          }}>
            <Icon size={11} strokeWidth={1.75} color="#334155" style={{ marginBottom: 3 }} />
            <div style={{ color: '#F8FAFC', fontSize: 13, fontWeight: 700, lineHeight: 1 }}>
              {value}
            </div>
            <div style={{ color: '#334155', fontSize: 9, marginTop: 2, letterSpacing: '0.03em' }}>
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* ── Row 4: Qualification rate bar ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
          <span style={{ fontSize: 10, color: '#475569', fontWeight: 500 }}>Qualification Rate</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: qrBarColor }}>{qr}%</span>
        </div>
        {/* Progress track */}
        <div style={{ height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
          <div style={{
            height:      '100%',
            borderRadius: 99,
            width:       `${qr}%`,
            background:   qrBarColor,
            transition:  'width 600ms cubic-bezier(0.4,0,0.2,1)',
            boxShadow:   `0 0 6px ${qrBarColor}55`,
          }} />
        </div>

        {/* Call progress sub-label */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 5 }}>
          <span style={{ fontSize: 9, color: '#334155' }}>
            {campaign.stats.callsMade} of {campaign.stats.totalLeads} leads called
          </span>
          <span style={{ fontSize: 9, color: '#334155' }}>{cp}%</span>
        </div>
        {/* Call progress track (thin, subtle) */}
        <div style={{ height: 2, borderRadius: 99, background: 'rgba(255,255,255,0.04)', overflow: 'hidden', marginTop: 3 }}>
          <div style={{
            height:      '100%',
            borderRadius: 99,
            width:       `${cp}%`,
            background:  'rgba(59,130,246,0.4)',
          }} />
        </div>
      </div>

      {/* ── Row 5: Date info ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 10, color: '#334155' }}>
          Created {formatDate(campaign.createdAt)}
        </span>
        {campaign.startedAt && (
          <span style={{ fontSize: 10, color: '#334155' }}>
            · Started {formatDate(campaign.startedAt)}
          </span>
        )}
      </div>

      {/* ── Row 6: Action buttons ── */}
      <div style={{
        display:       'flex',
        alignItems:    'center',
        gap:            6,
        paddingTop:     10,
        borderTop:     '1px solid rgba(255,255,255,0.05)',
      }}>
        {/* View button — always visible */}
        <ActionBtn
          icon={<Eye size={11} strokeWidth={2} />}
          label="View"
          onClick={() => onView(campaign._id)}
          variant="ghost"
        />

        {archived ? (
          <>
            <ActionBtn
              icon={<RotateCcw size={11} strokeWidth={2} />}
              label="Restore"
              onClick={() => onRestore(campaign._id)}
              variant="green"
              loading={busy}
            />
            <div style={{ flex: 1 }} />
            <ActionBtn
              icon={<Trash2 size={11} strokeWidth={2} />}
              label="Delete"
              onClick={() => onDelete(campaign._id)}
              variant="red"
            />
          </>
        ) : (
          <>
            {/* Settings — opens the edit page */}
            <ActionBtn
              icon={<Settings size={11} strokeWidth={2} />}
              label="Settings"
              onClick={() => onSettings(campaign._id)}
              variant="ghost"
            />

            {/* Pause (Running) or Resume (Paused) */}
            {campaign.status === 'Running' && (
              <ActionBtn
                icon={<Pause size={11} strokeWidth={2} />}
                label="Pause"
                onClick={() => onPause(campaign._id)}
                variant="amber"
                loading={busy}
              />
            )}
            {campaign.status === 'Paused' && (
              <ActionBtn
                icon={<Play size={11} strokeWidth={2} />}
                label="Resume"
                onClick={() => onResume(campaign._id)}
                variant="green"
                loading={busy}
              />
            )}

            {/* Spacer */}
            <div style={{ flex: 1 }} />

            <ActionBtn
              icon={<Upload size={11} strokeWidth={2} />}
              label="Import"
              onClick={() => onImport(campaign._id)}
              variant="ghost"
            />
            {/* Archive / delete (opens a confirmation dialog) */}
            <ActionBtn
              icon={<Trash2 size={11} strokeWidth={2} />}
              label="Delete"
              onClick={() => onDelete(campaign._id)}
              variant="red"
            />
          </>
        )}
      </div>
    </div>
  );
}

// ── Small reusable action button ─────────────

type BtnVariant = 'ghost' | 'amber' | 'green' | 'red';

const VARIANT_STYLES: Record<BtnVariant, {
  bg: string; color: string; hoverBg: string; border: string;
}> = {
  ghost: {
    bg: 'rgba(255,255,255,0.04)', color: '#64748B',
    hoverBg: 'rgba(255,255,255,0.08)', border: 'rgba(255,255,255,0.08)',
  },
  amber: {
    bg: 'rgba(245,158,11,0.1)', color: '#FCD34D',
    hoverBg: 'rgba(245,158,11,0.18)', border: 'rgba(245,158,11,0.2)',
  },
  green: {
    bg: 'rgba(34,197,94,0.1)', color: '#4ADE80',
    hoverBg: 'rgba(34,197,94,0.18)', border: 'rgba(34,197,94,0.2)',
  },
  red: {
    bg: 'rgba(239,68,68,0.08)', color: '#F87171',
    hoverBg: 'rgba(239,68,68,0.16)', border: 'rgba(239,68,68,0.2)',
  },
};

function ActionBtn({ icon, label, onClick, variant, loading = false }: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  variant: BtnVariant;
  loading?: boolean;
}) {
  const [hov, setHov] = useState(false);
  const v = VARIANT_STYLES[variant];

  return (
    <button
      onClick={onClick}
      disabled={loading}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display:     'flex',
        alignItems:  'center',
        gap:          4,
        padding:     '5px 9px',
        borderRadius: 6,
        border:      `1px solid ${v.border}`,
        background:   hov ? v.hoverBg : v.bg,
        color:        v.color,
        fontSize:     10,
        fontWeight:   500,
        cursor:      loading ? 'not-allowed' : 'pointer',
        opacity:     loading ? 0.7 : 1,
        transition:  'all 150ms',
        whiteSpace:  'nowrap',
      }}
    >
      {loading ? <Spinner size={11} color="currentColor" /> : icon}
      {label}
    </button>
  );
}