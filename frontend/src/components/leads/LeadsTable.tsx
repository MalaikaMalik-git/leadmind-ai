'use client';

// ─────────────────────────────────────────────
//  LeadMind AI — LeadsTable
//  Day 12 · Session 4
//  UC-07  View Leads & Statuses
// ─────────────────────────────────────────────

import { ArrowUp, ArrowDown, ArrowUpDown, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Lead, LeadQuery } from '@/src/lib/api/leads';
import LeadStatusBadge from './LeadStatusBadge';

interface LeadsTableProps {
  leads: Lead[];
  sortBy: NonNullable<LeadQuery['sortBy']>;
  sortOrder: NonNullable<LeadQuery['sortOrder']>;
  onSortChange: (sortBy: NonNullable<LeadQuery['sortBy']>) => void;
  onDelete: (lead: Lead) => void;
}

interface ColumnDef {
  key: NonNullable<LeadQuery['sortBy']> | null; // null = not sortable
  label: string;
}

const COLUMNS: ColumnDef[] = [
  { key: 'fullName', label: 'Name' },
  { key: null, label: 'Contact' },
  { key: null, label: 'Campaign' },
  { key: 'status', label: 'Status' },
  { key: 'qualificationScore', label: 'Score' },
  { key: 'createdAt', label: 'Added' },
];

export default function LeadsTable({ leads, sortBy, sortOrder, onSortChange, onDelete }: LeadsTableProps) {
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
            <th style={{ width: 44, borderBottom: '1px solid rgba(255,255,255,0.07)' }} />
          </tr>
        </thead>
        <tbody>
          {leads.map((lead, i) => (
            <tr
              key={lead._id}
              onClick={() => router.push(`/dashboard/leads/${lead._id}`)}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              style={{
                borderBottom: i === leads.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.04)',
                cursor: 'pointer',
              }}
            >
              <td style={{ padding: '11px 16px', color: '#F1F5F9', fontWeight: 500, whiteSpace: 'nowrap' }}>
                {lead.fullName}
                {lead.jobTitle && (
                  <div style={{ color: '#475569', fontSize: 11, fontWeight: 400, marginTop: 1 }}>
                    {lead.jobTitle}{lead.company ? ` · ${lead.company}` : ''}
                  </div>
                )}
              </td>
              <td style={{ padding: '11px 16px', color: '#94A3B8', whiteSpace: 'nowrap' }}>
                {lead.phone}
                {lead.email && (
                  <div style={{ color: '#475569', fontSize: 11, marginTop: 1 }}>{lead.email}</div>
                )}
              </td>
              <td style={{ padding: '11px 16px', color: '#94A3B8', whiteSpace: 'nowrap' }}>
                {typeof lead.campaign === 'object' && lead.campaign ? lead.campaign.name : '—'}
              </td>
              <td style={{ padding: '11px 16px' }}>
                <LeadStatusBadge status={lead.status} />
              </td>
              <td style={{ padding: '11px 16px', color: '#CBD5E1', whiteSpace: 'nowrap' }}>
                {lead.qualificationScore !== null ? (
                  <span style={{
                    fontWeight: 600,
                    color: lead.qualificationScore >= 60 ? '#22C55E' : '#94A3B8',
                  }}>
                    {lead.qualificationScore}
                  </span>
                ) : (
                  <span style={{ color: '#334155' }}>—</span>
                )}
              </td>
              <td style={{ padding: '11px 16px', color: '#64748B', whiteSpace: 'nowrap' }}>
                {new Date(lead.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </td>
              <td style={{ padding: '11px 10px', width: 44 }}>
                <button
                  type="button"
                  aria-label={`Delete ${lead.fullName}`}
                  title={lead.status === 'Calling' ? 'This lead is on a call.' : 'Delete lead'}
                  disabled={lead.status === 'Calling'}
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete(lead);
                  }}
                  style={{
                    width: 28, height: 28, borderRadius: 7,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '1px solid rgba(248,113,113,0.25)',
                    background: 'rgba(239,68,68,0.08)',
                    color: '#F87171',
                    cursor: lead.status === 'Calling' ? 'not-allowed' : 'pointer',
                    opacity: lead.status === 'Calling' ? 0.4 : 1,
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SortIcon({ active, direction }: { active: boolean; direction: 'asc' | 'desc' }) {
  if (!active) return <ArrowUpDown size={10} color="#334155" />;
  return direction === 'asc'
    ? <ArrowUp size={10} color="#60A5FA" />
    : <ArrowDown size={10} color="#60A5FA" />;
}