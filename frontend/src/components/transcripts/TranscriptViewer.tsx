'use client';

// ─────────────────────────────────────────────
//  LeadMind AI — TranscriptViewer
//  Day 19 · Session 2
//  UC-08  View Call Transcript
//
//  "System displays transcript in chat-like format. Transcript includes
//  timestamps and speaker labels (AI / Lead)." Special requirement:
//  "Chat UI should clearly distinguish AI and Lead messages" and "show
//  call metadata: campaign (if outbound), date, time, duration, call
//  type (inbound/outbound), and final status."
//
//  Per the 30-day plan's explicit spec: AI messages left-aligned/blue,
//  Lead messages right-aligned/gray.
// ─────────────────────────────────────────────

import { Bot, User, Phone, PhoneIncoming, PhoneOutgoing, Building2, Clock, CalendarDays, AlertTriangle, CheckCircle2, XCircle, MinusCircle } from 'lucide-react';
import { TranscriptDetail, TranscriptMessage } from '@/src/lib/api/transcripts';
import LeadStatusBadge from '@/src/components/leads/LeadStatusBadge';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

interface TranscriptViewerProps {
  transcript: TranscriptDetail;
}

export default function TranscriptViewer({ transcript }: TranscriptViewerProps) {
  const CallTypeIcon = transcript.callType === 'Outbound' ? PhoneOutgoing : PhoneIncoming;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ── Metadata header — UC-08: "show call metadata" ─────────────── */}
      <div style={{
        borderRadius: 14, border: '1px solid rgba(255,255,255,0.07)',
        background: '#111827', padding: 18,
      }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 9, flexShrink: 0,
              background: 'rgba(59,130,246,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <CallTypeIcon size={15} strokeWidth={2} color="#60A5FA" />
            </div>
            <div>
              <p style={{ color: '#F1F5F9', fontSize: 14, fontWeight: 700, margin: 0 }}>
                {transcript.lead.fullName}
              </p>
              <p style={{ color: '#64748B', fontSize: 11.5, margin: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
                <Phone size={10} strokeWidth={2} /> {transcript.lead.phone}
              </p>
            </div>
          </div>
          <LeadStatusBadge status={transcript.finalStatus} />
        </div>

        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 16,
          paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)',
        }}>
          <MetaItem icon={<CalendarDays size={12} strokeWidth={2} />} label="Date" value={formatDateTime(transcript.callDate)} />
          <MetaItem icon={<Clock size={12} strokeWidth={2} />} label="Duration" value={transcript.durationFormatted} />
          <MetaItem icon={<CallTypeIcon size={12} strokeWidth={2} />} label="Type" value={transcript.callType} />
          <MetaItem
            icon={<Building2 size={12} strokeWidth={2} />}
            label="Campaign"
            value={transcript.campaign ? transcript.campaign.name : 'None (inbound, no campaign)'}
          />
        </div>

        {transcript.detectedTopics.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>
            {transcript.detectedTopics.map((topic) => (
              <span
                key={topic}
                style={{
                  padding: '3px 9px', borderRadius: 99, fontSize: 10.5, fontWeight: 500,
                  color: '#93C5FD', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.15)',
                }}
              >
                {topic}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Abandoned / partial call notice ─────────────────────────── */}
      {transcript.isPartial && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 8,
          background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)',
        }}>
          <AlertTriangle size={14} color="#F87171" />
          <span style={{ fontSize: 12, color: '#F87171' }}>
            This call ended early — the lead hung up before a full conversation took place.
          </span>
        </div>
      )}

      {/* ── Chat transcript — UC-08: AI (left, blue) vs Lead (right, gray) ── */}
      <div style={{
        borderRadius: 14, border: '1px solid rgba(255,255,255,0.07)',
        background: '#0F172A', padding: 20,
      }}>
        {transcript.messages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px 10px', color: '#475569', fontSize: 12.5 }}>
            No conversation was recorded for this call.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {transcript.messages.map((message, i) => (
              <ChatBubble key={i} message={message} />
            ))}
          </div>
        )}
      </div>

      {/* ── Qualification summary — data already fetched, worth showing ── */}
      {transcript.qualificationScore !== null && (
        <QualificationCard
          score={transcript.qualificationScore}
          breakdown={transcript.scoreBreakdown}
          reason={transcript.qualificationReason}
        />
      )}
    </div>
  );
}

// ── Small metadata item (icon + label + value) ────────────────
function MetaItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 110 }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#475569', fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>
        {icon} {label}
      </span>
      <span style={{ color: '#CBD5E1', fontSize: 12.5, fontWeight: 500 }}>{value}</span>
    </div>
  );
}

// ── Single chat bubble — AI left/blue, Lead right/gray ─────────
function ChatBubble({ message }: { message: TranscriptMessage }) {
  const isAI = message.speaker === 'AI';

  return (
    <div style={{
      display: 'flex', flexDirection: isAI ? 'row' : 'row-reverse',
      alignItems: 'flex-start', gap: 9,
    }}>
      {/* Avatar */}
      <div style={{
        width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
        background: isAI ? 'rgba(59,130,246,0.12)' : 'rgba(148,163,184,0.12)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {isAI
          ? <Bot size={13} strokeWidth={2} color="#60A5FA" />
          : <User size={13} strokeWidth={2} color="#94A3B8" />}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxWidth: '72%', alignItems: isAI ? 'flex-start' : 'flex-end' }}>
        <span style={{ color: '#475569', fontSize: 10, fontWeight: 600, padding: '0 3px' }}>
          {isAI ? 'AI Agent' : 'Lead'} · {formatTime(message.timestamp)}
        </span>
        <div style={{
          padding: '9px 13px', borderRadius: isAI ? '4px 14px 14px 14px' : '14px 4px 14px 14px',
          background: isAI ? 'rgba(59,130,246,0.12)' : 'rgba(148,163,184,0.1)',
          border: isAI ? '1px solid rgba(59,130,246,0.2)' : '1px solid rgba(148,163,184,0.15)',
        }}>
          <p style={{
            margin: 0, fontSize: 12.5, lineHeight: 1.5,
            color: isAI ? '#DBEAFE' : '#E2E8F0',
          }}>
            {message.text}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Qualification breakdown card ────────────────
function QualificationCard({
  score,
  breakdown,
  reason,
}: {
  score: number;
  breakdown: TranscriptDetail['scoreBreakdown'];
  reason: string | null;
}) {
  const criteria: Array<{ label: string; value: boolean | null }> = [
    { label: 'Budget confirmed', value: breakdown.budgetConfirmed },
    { label: 'Timeline defined', value: breakdown.timelineDefined },
    { label: 'Scope clear', value: breakdown.scopeClear },
    { label: 'Decision maker', value: breakdown.isDecisionMaker },
  ];

  const scoreColor = score >= 60 ? '#22C55E' : '#F59E0B';

  return (
    <div style={{
      borderRadius: 14, border: '1px solid rgba(255,255,255,0.07)',
      background: '#111827', padding: 18,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{ color: '#CBD5E1', fontSize: 13, fontWeight: 600 }}>AI Qualification (UC-12)</span>
        <span style={{ color: scoreColor, fontSize: 20, fontWeight: 700 }}>{score}<span style={{ fontSize: 12, color: '#475569', fontWeight: 500 }}>/100</span></span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        {criteria.map((c) => (
          <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            {c.value === true && <CheckCircle2 size={14} color="#22C55E" strokeWidth={2} />}
            {c.value === false && <XCircle size={14} color="#F87171" strokeWidth={2} />}
            {c.value === null && <MinusCircle size={14} color="#475569" strokeWidth={2} />}
            <span style={{ color: '#94A3B8', fontSize: 12 }}>{c.label}</span>
          </div>
        ))}
      </div>

      {reason && (
        <p style={{ color: '#64748B', fontSize: 12, marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)', lineHeight: 1.5 }}>
          {reason}
        </p>
      )}
    </div>
  );
}