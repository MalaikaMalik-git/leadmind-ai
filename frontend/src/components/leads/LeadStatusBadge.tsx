// ─────────────────────────────────────────────
//  LeadMind AI — LeadStatusBadge
//  Day 12 · Session 4
//
//  Covers every status in backend/src/models/Lead.js. Grouped by meaning
//  rather than assigning each a unique color: in-progress (blue), success
//  (green), needs-attention (amber), and dead-end (red/gray).
// ─────────────────────────────────────────────

import { LeadStatus } from '@/src/lib/api/leads';

interface StatusStyle {
  color: string;
  background: string;
}

const STATUS_STYLES: Record<LeadStatus, StatusStyle> = {
  Pending:                      { color: '#94A3B8', background: 'rgba(148,163,184,0.1)' },
  Calling:                      { color: '#60A5FA', background: 'rgba(96,165,250,0.1)' },
  Qualified:                    { color: '#22C55E', background: 'rgba(34,197,94,0.1)' },
  'Meeting Booked':             { color: '#22C55E', background: 'rgba(34,197,94,0.1)' },
  'Not Qualified':              { color: '#94A3B8', background: 'rgba(148,163,184,0.08)' },
  'No Answer':                  { color: '#F59E0B', background: 'rgba(245,158,11,0.1)' },
  Voicemail:                    { color: '#F59E0B', background: 'rgba(245,158,11,0.1)' },
  Busy:                         { color: '#F59E0B', background: 'rgba(245,158,11,0.1)' },
  'Needs Human Follow-up':      { color: '#A78BFA', background: 'rgba(167,139,250,0.1)' },
  'Callback Requested':         { color: '#A78BFA', background: 'rgba(167,139,250,0.1)' },
  'Invalid Contact':            { color: '#F87171', background: 'rgba(248,113,113,0.1)' },
  Abandoned:                    { color: '#F87171', background: 'rgba(248,113,113,0.1)' },
  'Call Failed':                { color: '#F87171', background: 'rgba(248,113,113,0.1)' },
  'Qualified (No Slot)':        { color: '#F59E0B', background: 'rgba(245,158,11,0.1)' },
  'Qualified (Booking Failed)': { color: '#F59E0B', background: 'rgba(245,158,11,0.1)' },
};

interface LeadStatusBadgeProps {
  status: LeadStatus;
}

export default function LeadStatusBadge({ status }: LeadStatusBadgeProps) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.Pending;
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 9px',
        borderRadius: 99,
        fontSize: 10,
        fontWeight: 600,
        whiteSpace: 'nowrap',
        color: style.color,
        background: style.background,
      }}
    >
      {status}
    </span>
  );
}