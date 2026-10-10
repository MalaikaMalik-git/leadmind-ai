'use client';

// ─────────────────────────────────────────────
//  LeadMind AI — CallsTable
//  Day 20 · Session 2
//  UC-08  "Table of all calls: lead name, campaign, type (inbound/
//          outbound), duration, status, date" · "Click row → open
//          transcript modal or page" · "Live status indicator for
//          ongoing calls"
// ─────────────────────────────────────────────

import { ArrowUp, ArrowDown, ArrowUpDown, PhoneIncoming, PhoneOutgoing } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { CallLogRow, CallsQuery, LIVE_CALL_STATUSES } from '@/src/lib/api/calls';
import CallStatusBadge from './CallStatusBadge';

interface CallsTableProps {
  calls: CallLogRow[];
  sortBy: NonNullable<CallsQuery['sortBy']>;
  sortOrder: NonNullable<CallsQuery['sortOrder']>;
  onSortChange: (sortBy: NonNullable<CallsQuery['sortBy']>) => void;
}

interface ColumnDef {
  key: NonNullable<CallsQuery['sortBy']> | null; // null = not sortable
  label: string;
}

const COLUMNS: ColumnDef[] = [
  { key: null, label: 'Lead' },
  { key: null, label: 'Campaign' },
  { key: null, label: 'Type' },
  { key: 'durationSeconds', label: 'Duration' },
  { key: 'status', label: 'Status' },
  { key: 'initiatedAt', label: 'Date' },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export default function CallsTable({ calls, sortBy, sortOrder, onSortChange }: CallsTableProps) {
  const router = useRouter();

  return (
    <div style={{
      borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)',
      overflow: 'auto', background: '#111827',
    }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead>
          <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
            {COLUMNS.map((col) => (
              <th
                key={col.label}
                onClick={col.key ? () => onSortChange(col.key!) : undefined}
                style={{
                  textAlign: 'left', padding: '11px 16px',
                  color: '#94A3B8', fontWeight: 600, fontSize: 11,
                  textTransform: 'uppercase', letterSpacing: 0.4,
                  whiteSpace: 'nowrap',
                  borderBottom: '1px solid rgba(255,255,255,0.07)',
                  cursor: col.key ? 'pointer' : 'default',
                  userSelect: 'none',
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {col.label}
                  {col.key && <SortIcon active={sortBy === col.key} direction={sortOrder} />}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {calls.map((call, i) => {
            const isLive = LIVE_CALL_STATUSES.includes(call.status);
            const hasTranscript = !!call.transcript;
            const isClickable = hasTranscript;
            const CallTypeIcon = call.callType === 'Outbound' ? PhoneOutgoing : PhoneIncoming;

            return (
              <tr
                key={call._id}
                onClick={() => isClickable && router.push(`/dashboard/transcripts?transcriptId=${call.transcript}`)}
                onMouseEnter={(e) => { if (isClickable) e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                style={{
                  borderBottom: i === calls.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.04)',
                  cursor: isClickable ? 'pointer' : 'default',
                  opacity: isLive && !hasTranscript ? 0.85 : 1,
                }}
                title={!isClickable ? (isLive ? 'Call still in progress — no transcript yet' : 'No transcript available for this call') : undefined}
              >
                <td style={{ padding: '11px 16px', color: '#F1F5F9', fontWeight: 500, whiteSpace: 'nowrap' }}>
                  {call.lead?.fullName ?? 'Unknown Lead'}
                  {call.lead?.phone && (
                    <div style={{ color: '#475569', fontSize: 11, fontWeight: 400, marginTop: 1 }}>
                      {call.lead.phone}
                    </div>
                  )}
                </td>
                <td style={{ padding: '11px 16px', color: '#94A3B8', whiteSpace: 'nowrap' }}>
                  {call.campaign?.name ?? <span style={{ color: '#475569' }}>None (inbound)</span>}
                </td>
                <td style={{ padding: '11px 16px', color: '#94A3B8', whiteSpace: 'nowrap' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <CallTypeIcon size={12} strokeWidth={2} color={call.callType === 'Outbound' ? '#60A5FA' : '#A78BFA'} />
                    {call.callType}
                  </span>
                </td>
                <td style={{ padding: '11px 16px', color: '#94A3B8', whiteSpace: 'nowrap' }}>
                  {call.durationFormatted}
                </td>
                <td style={{ padding: '11px 16px', whiteSpace: 'nowrap' }}>
                  <CallStatusBadge status={call.status} />
                </td>
                <td style={{ padding: '11px 16px', color: '#64748B', whiteSpace: 'nowrap' }}>
                  {formatDate(call.initiatedAt)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SortIcon({ active, direction }: { active: boolean; direction: 'asc' | 'desc' }) {
  if (!active) return <ArrowUpDown size={11} color="#475569" />;
  return direction === 'asc' ? <ArrowUp size={11} color="#60A5FA" /> : <ArrowDown size={11} color="#60A5FA" />;
}