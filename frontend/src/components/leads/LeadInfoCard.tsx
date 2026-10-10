'use client';

// ─────────────────────────────────────────────
//  LeadMind AI — LeadInfoCard
//  Day 13 · Session 2
//  UC-07  View Leads & Statuses
//
//  Header card for the Lead Detail page: identity, contact info,
//  qualification score, source/meta, and the manual status-change
//  dropdown (UC-07: "Give admins space to change lead statuses").
//
//  Status changes are optimistic from the caller's point of view —
//  this component just fires onStatusChange(newStatus) and shows a
//  small inline spinner on the select while the page-level save is
//  in flight (isSavingStatus).
// ─────────────────────────────────────────────

import { Phone, Mail, Building2, Briefcase, Loader2 } from 'lucide-react';
import { Lead, LeadStatus } from '@/src/lib/api/leads';
import LeadStatusBadge from './LeadStatusBadge';

const STATUS_OPTIONS: LeadStatus[] = [
  'Pending', 'Calling', 'Qualified', 'Not Qualified', 'No Answer', 'Voicemail',
  'Busy', 'Meeting Booked', 'Needs Human Follow-up', 'Invalid Contact',
  'Abandoned', 'Call Failed', 'Qualified (No Slot)', 'Qualified (Booking Failed)',
];

interface LeadInfoCardProps {
  lead: Lead;
  isSavingStatus: boolean;
  onStatusChange: (status: LeadStatus) => void;
}

export default function LeadInfoCard({ lead, isSavingStatus, onStatusChange }: LeadInfoCardProps) {
  const initials = lead.fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || '?';

  const campaignName = typeof lead.campaign === 'object' && lead.campaign ? lead.campaign.name : null;

  return (
    <div style={{
      borderRadius: 14, border: '1px solid rgba(255,255,255,0.07)',
      background: '#111827', padding: 20,
      display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start',
    }}>
      {/* ── Avatar + identity ─────────────────────── */}
      <div style={{ display: 'flex', gap: 14, flex: '1 1 260px', minWidth: 220 }}>
        <div style={{
          width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
          background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#60A5FA', fontWeight: 700, fontSize: 17,
        }}>
          {initials}
        </div>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ color: '#F8FAFC', fontSize: 17, fontWeight: 700, margin: 0, lineHeight: 1.3 }}>
            {lead.fullName}
          </h2>
          {(lead.jobTitle || lead.company) && (
            <p style={{ color: '#64748B', fontSize: 12.5, marginTop: 3, display: 'flex', alignItems: 'center', gap: 5 }}>
              {lead.jobTitle && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Briefcase size={11} strokeWidth={2} /> {lead.jobTitle}
                </span>
              )}
              {lead.jobTitle && lead.company && <span style={{ color: '#334155' }}>·</span>}
              {lead.company && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Building2 size={11} strokeWidth={2} /> {lead.company}
                </span>
              )}
            </p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 10 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#CBD5E1', fontSize: 12.5 }}>
              <Phone size={12} strokeWidth={2} color="#475569" /> {lead.phone}
            </span>
            {lead.email && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#CBD5E1', fontSize: 12.5 }}>
                <Mail size={12} strokeWidth={2} color="#475569" /> {lead.email}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Qualification score ───────────────────── */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        padding: '8px 22px', borderRadius: 10, background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}>
        <span style={{
          fontSize: 26, fontWeight: 700, lineHeight: 1,
          color: lead.qualificationScore === null
            ? '#334155'
            : lead.qualificationScore >= 60 ? '#22C55E' : '#F59E0B',
        }}>
          {lead.qualificationScore ?? '—'}
        </span>
        <span style={{ color: '#64748B', fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>
          Score
        </span>
      </div>

      {/* ── Status + meta ─────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 200 }}>
        <div>
          <label style={{ display: 'block', color: '#475569', fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>
            Status
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <select
              value={lead.status}
              disabled={isSavingStatus}
              onChange={(e) => onStatusChange(e.target.value as LeadStatus)}
              style={{
                padding: '6px 10px', borderRadius: 8, fontSize: 12, fontWeight: 500,
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)',
                color: '#E2E8F0', outline: 'none',
                cursor: isSavingStatus ? 'not-allowed' : 'pointer',
                opacity: isSavingStatus ? 0.6 : 1,
              }}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            {isSavingStatus && <Loader2 size={13} color="#60A5FA" className="animate-spin" />}
            {!isSavingStatus && <LeadStatusBadge status={lead.status} />}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11.5, color: '#64748B' }}>
          <span>Source: <span style={{ color: '#94A3B8' }}>{lead.source}</span></span>
          {campaignName && <span>Campaign: <span style={{ color: '#94A3B8' }}>{campaignName}</span></span>}
          <span>Call attempts: <span style={{ color: '#94A3B8' }}>{lead.totalCallAttempts}</span></span>
          <span>Added: <span style={{ color: '#94A3B8' }}>{new Date(lead.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span></span>
        </div>
      </div>
    </div>
  );
}