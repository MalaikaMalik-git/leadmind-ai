// ─────────────────────────────────────────────
//  LeadMind AI — CallStatusBadge
//  Day 20 · Session 2
//
//  Covers CallLog.status (backend/src/models/CallLog.js) — a DIFFERENT
//  enum from Lead.status/Transcript.finalStatus (e.g. "Completed" and
//  "Ringing" only exist here), so this is deliberately its own component
//  rather than reusing LeadStatusBadge. Same color-grouping convention:
//  in-progress (blue, pulsing), success (green), needs-attention (amber),
//  dead-end (red/gray).
// ─────────────────────────────────────────────

import { CallStatus, LIVE_CALL_STATUSES } from '@/src/lib/api/calls';

interface StatusStyle {
  color: string;
  background: string;
}

const STATUS_STYLES: Record<CallStatus, StatusStyle> = {
  Initiated:   { color: '#60A5FA', background: 'rgba(96,165,250,0.1)' },
  Ringing:     { color: '#60A5FA', background: 'rgba(96,165,250,0.1)' },
  Answered:    { color: '#60A5FA', background: 'rgba(96,165,250,0.1)' },
  Completed:   { color: '#22C55E', background: 'rgba(34,197,94,0.1)' },
  'No Answer': { color: '#F59E0B', background: 'rgba(245,158,11,0.1)' },
  Busy:        { color: '#F59E0B', background: 'rgba(245,158,11,0.1)' },
  Voicemail:   { color: '#F59E0B', background: 'rgba(245,158,11,0.1)' },
  Failed:      { color: '#F87171', background: 'rgba(248,113,113,0.1)' },
  Abandoned:   { color: '#F87171', background: 'rgba(248,113,113,0.1)' },
};

interface CallStatusBadgeProps {
  status: CallStatus;
}

export default function CallStatusBadge({ status }: CallStatusBadgeProps) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.Initiated;
  const isLive = LIVE_CALL_STATUSES.includes(status);

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 9px',
        borderRadius: 99,
        fontSize: 10,
        fontWeight: 600,
        whiteSpace: 'nowrap',
        color: style.color,
        background: style.background,
      }}
    >
      {isLive && (
        <span style={{ position: 'relative', display: 'inline-flex', width: 6, height: 6 }}>
          <span
            style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              background: style.color, opacity: 0.6,
              animation: 'callLivePulse 1.4s ease-in-out infinite',
            }}
          />
          <span style={{ position: 'relative', width: 6, height: 6, borderRadius: '50%', background: style.color }} />
        </span>
      )}
      {status}
      {isLive && (
        <style>{`
          @keyframes callLivePulse {
            0%   { transform: scale(1);   opacity: 0.6; }
            70%  { transform: scale(2.4); opacity: 0; }
            100% { transform: scale(2.4); opacity: 0; }
          }
        `}</style>
      )}
    </span>
  );
}