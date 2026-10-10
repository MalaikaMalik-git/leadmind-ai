'use client';

// ─────────────────────────────────────────────
//  LeadMind AI — CallHistoryTimeline
//  Day 13 · Session 3
//  UC-07  View Leads & Statuses
//    "Show the details of the lead, including the call, outcome,
//     and meeting link (if booked)."
//  UC-08  View Call Transcript (link only — full viewer is Day 19)
//
//  Renders the lead's CallLog history (newest first, as returned by
//  GET /api/leads/:id) as a vertical timeline, plus the booked
//  Meeting card if UC-13 succeeded for this lead.
//
//  "View Transcript" routes to the Day 19 transcripts stub with the
//  transcript id as a query param — there's no transcript detail
//  route yet (that's Day 19 scope), so this deliberately doesn't
//  invent one. It still gives the admin a working link today and
//  the Day 19 page just needs to read the param when it lands.
// ─────────────────────────────────────────────

import { useRouter } from 'next/navigation';
import {
  PhoneOutgoing, PhoneIncoming, RotateCcw, FileText,
  CalendarClock, Video, PhoneOff,
} from 'lucide-react';
import { CallLogEntry, MeetingSummary } from '@/src/lib/api/leads';

// ── Call status → color (grouped by meaning, same approach as LeadStatusBadge) ──
const CALL_STATUS_STYLES: Record<string, { color: string; background: string }> = {
  Initiated: { color: '#60A5FA', background: 'rgba(96,165,250,0.1)' },
  Ringing: { color: '#60A5FA', background: 'rgba(96,165,250,0.1)' },
  Answered: { color: '#22C55E', background: 'rgba(34,197,94,0.1)' },
  Completed: { color: '#22C55E', background: 'rgba(34,197,94,0.1)' },
  'No Answer': { color: '#F59E0B', background: 'rgba(245,158,11,0.1)' },
  Busy: { color: '#F59E0B', background: 'rgba(245,158,11,0.1)' },
  Voicemail: { color: '#F59E0B', background: 'rgba(245,158,11,0.1)' },
  Failed: { color: '#F87171', background: 'rgba(248,113,113,0.1)' },
  Abandoned: { color: '#F87171', background: 'rgba(248,113,113,0.1)' },
};

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

interface CallHistoryTimelineProps {
  callLogs: CallLogEntry[];
  meeting: MeetingSummary | null;
}

export default function CallHistoryTimeline({ callLogs, meeting }: CallHistoryTimelineProps) {
  const router = useRouter();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* ── Meeting card (UC-13 — shown if booked) ─────────── */}
      {meeting && <MeetingCard meeting={meeting} />}

      {/* ── Call history ─────────────────────────────────── */}
      <div style={{
        borderRadius: 14, border: '1px solid rgba(255,255,255,0.07)',
        background: '#111827', padding: 18,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: callLogs.length ? 16 : 4 }}>
          <span style={{ color: '#CBD5E1', fontSize: 13, fontWeight: 600 }}>
            Call History
          </span>
          {callLogs.length > 0 && (
            <span style={{ color: '#475569', fontSize: 11.5 }}>
              {callLogs.length} call{callLogs.length === 1 ? '' : 's'}
            </span>
          )}
        </div>

        {callLogs.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '28px 10px', gap: 8,
          }}>
            <PhoneOff size={20} strokeWidth={1.5} color="#334155" />
            <p style={{ color: '#475569', fontSize: 12 }}>No calls have been made to this lead yet.</p>
          </div>
        ) : (
          <div style={{ position: 'relative' }}>
            {/* Connecting rail */}
            <div style={{
              position: 'absolute', left: 15, top: 6, bottom: 6, width: 1,
              background: 'rgba(255,255,255,0.07)',
            }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {callLogs.map((call) => (
                <CallLogRow
                  key={call._id}
                  call={call}
                  onViewTranscript={() =>
                    router.push(`/dashboard/transcripts?transcriptId=${call.transcript}`)
                  }
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Single call row ──────────────────────────────
function CallLogRow({ call, onViewTranscript }: { call: CallLogEntry; onViewTranscript: () => void }) {
  const style = CALL_STATUS_STYLES[call.status] ?? { color: '#94A3B8', background: 'rgba(148,163,184,0.1)' };
  const Icon = call.callType === 'Outbound' ? PhoneOutgoing : PhoneIncoming;

  return (
    <div style={{ display: 'flex', gap: 12, position: 'relative' }}>
      {/* Timeline dot */}
      <div style={{
        width: 32, height: 32, borderRadius: '50%', flexShrink: 0, zIndex: 1,
        background: style.background, border: `1px solid ${style.color}33`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={13} strokeWidth={2} color={style.color} />
      </div>

      <div style={{ flex: 1, minWidth: 0, paddingTop: 3 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#E2E8F0', fontSize: 12.5, fontWeight: 600 }}>
            {call.callType} Call
          </span>
          <span style={{
            padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 600,
            color: style.color, background: style.background,
          }}>
            {call.status}
          </span>
          {call.isRetry && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#A78BFA', fontSize: 10.5 }}>
              <RotateCcw size={10} strokeWidth={2} /> Retry (attempt {call.attemptNumber})
            </span>
          )}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 4, color: '#64748B', fontSize: 11.5 }}>
          <span>{formatDateTime(call.initiatedAt)}</span>
          <span>·</span>
          <span>{formatDuration(call.durationSeconds)}</span>
          {call.qualificationScore !== null && (
            <>
              <span>·</span>
              <span>
                Score: <span style={{ color: call.qualificationScore >= 60 ? '#22C55E' : '#94A3B8', fontWeight: 600 }}>
                  {call.qualificationScore}
                </span>
              </span>
            </>
          )}
        </div>

        {call.errorMessage && (
          <p style={{ color: '#F87171', fontSize: 11, marginTop: 4 }}>{call.errorMessage}</p>
        )}

        {call.transcript && (
          <button
            onClick={onViewTranscript}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 7,
              padding: '4px 10px', borderRadius: 7, cursor: 'pointer',
              background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)',
              color: '#60A5FA', fontSize: 11, fontWeight: 500,
            }}
          >
            <FileText size={11} strokeWidth={2} /> View Transcript
          </button>
        )}
      </div>
    </div>
  );
}

// ── Booked meeting card ──────────────────────────
function MeetingCard({ meeting }: { meeting: MeetingSummary }) {
  const statusStyle: Record<string, { color: string; background: string }> = {
    Scheduled: { color: '#60A5FA', background: 'rgba(96,165,250,0.1)' },
    Completed: { color: '#22C55E', background: 'rgba(34,197,94,0.1)' },
    Cancelled: { color: '#F87171', background: 'rgba(248,113,113,0.1)' },
    Rescheduled: { color: '#F59E0B', background: 'rgba(245,158,11,0.1)' },
    'No Show': { color: '#F87171', background: 'rgba(248,113,113,0.1)' },
  };
  const s = statusStyle[meeting.status] ?? statusStyle.Scheduled;

  return (
    <div style={{
      borderRadius: 14, border: '1px solid rgba(34,197,94,0.2)',
      background: 'rgba(34,197,94,0.04)', padding: 18,
      display: 'flex', alignItems: 'flex-start', gap: 14,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
        background: 'rgba(34,197,94,0.12)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <CalendarClock size={16} strokeWidth={2} color="#22C55E" />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#F1F5F9', fontSize: 13, fontWeight: 700 }}>{meeting.title}</span>
          <span style={{
            padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 600,
            color: s.color, background: s.background,
          }}>
            {meeting.status}
          </span>
        </div>
        <p style={{ color: '#94A3B8', fontSize: 12, marginTop: 4 }}>
          {formatDateTime(meeting.scheduledAt)} · {meeting.durationMinutes} min · {meeting.timezone}
        </p>
        {meeting.googleCalendar?.meetingLink && (
          <a
            href={meeting.googleCalendar.meetingLink}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 8,
              padding: '4px 10px', borderRadius: 7,
              background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)',
              color: '#4ADE80', fontSize: 11, fontWeight: 500, textDecoration: 'none',
            }}
          >
            <Video size={11} strokeWidth={2} /> Join Meeting
          </a>
        )}
      </div>
    </div>
  );
}