'use client';

// ─────────────────────────────────────────────
//  LeadMind AI — ImportResultPanel
//  Day 12 · Session 2
//
//  Shown after a successful call to POST /api/leads/import/:campaignId.
//  Surfaces the exact summary shape the backend returns — see
//  leadController.ts importLeads() response.
// ─────────────────────────────────────────────

import { CheckCircle2, XCircle, Upload } from 'lucide-react';
import { ImportSummary, ImportFailedRow } from '@/src/lib/api/leads';

interface ImportResultPanelProps {
  summary: ImportSummary;
  failedRows: ImportFailedRow[];
  onImportAnother: () => void;
  onViewLeads: () => void;
}

export default function ImportResultPanel({
  summary,
  failedRows,
  onImportAnother,
  onViewLeads,
}: ImportResultPanelProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* ── Headline ─────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: 'rgba(34,197,94,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <CheckCircle2 size={18} color="#22C55E" />
        </div>
        <div>
          <p style={{ color: '#F8FAFC', fontSize: 14, fontWeight: 600, margin: 0 }}>Import completed</p>
          <p style={{ color: '#475569', fontSize: 12, marginTop: 2 }}>
            Batch {summary.importBatch.slice(0, 8)}… · strategy: {summary.duplicateStrategy}
          </p>
        </div>
      </div>

      {/* ── Stat cards ───────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
        <StatCard label="Total"      value={summary.total}      color="#94A3B8" />
        <StatCard label="Imported"   value={summary.success}    color="#22C55E" />
        <StatCard label="Updated"    value={summary.updated}    color="#3B82F6" />
        <StatCard label="Duplicates" value={summary.duplicates} color="#F59E0B" />
        <StatCard label="Failed"     value={summary.failed}     color="#F87171" />
      </div>

      {/* ── Failed rows detail ───────────────── */}
      {failedRows.length > 0 && (
        <div>
          <p style={{ color: '#94A3B8', fontSize: 11, fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 }}>
            Rows That Failed Validation
          </p>
          <div style={{
            borderRadius: 10, border: '1px solid rgba(239,68,68,0.15)',
            background: 'rgba(239,68,68,0.03)', overflow: 'hidden',
          }}>
            {failedRows.map((row, i) => (
              <div
                key={i}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '10px 14px',
                  borderBottom: i === failedRows.length - 1 ? 'none' : '1px solid rgba(239,68,68,0.1)',
                }}
              >
                <XCircle size={14} color="#F87171" style={{ marginTop: 1, flexShrink: 0 }} />
                <div>
                  <span style={{ color: '#F87171', fontSize: 12, fontWeight: 600 }}>
                    Row {row.row > 0 ? row.row : '—'}
                    {row.fullName ? ` (${row.fullName})` : ''}
                  </span>
                  <p style={{ color: '#94A3B8', fontSize: 11, marginTop: 2 }}>{row.reason}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Actions ──────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
        <ActionBtn icon={<Upload size={13} />} label="Import Another File" onClick={onImportAnother} primary={false} />
        <ActionBtn icon={<CheckCircle2 size={13} />} label="View Leads" onClick={onViewLeads} primary />
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 10, padding: '12px 10px', textAlign: 'center',
    }}>
      <p style={{ fontSize: 20, fontWeight: 700, color, margin: 0, lineHeight: 1 }}>{value}</p>
      <p style={{ fontSize: 10, color: '#64748B', marginTop: 4 }}>{label}</p>
    </div>
  );
}

function ActionBtn({ icon, label, onClick, primary }: {
  icon: React.ReactNode; label: string; onClick: () => void; primary: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '9px 16px', borderRadius: 8, cursor: 'pointer',
        fontSize: 12, fontWeight: 600,
        border: primary ? '1px solid transparent' : '1px solid rgba(255,255,255,0.1)',
        background: primary ? '#2563EB' : 'rgba(255,255,255,0.04)',
        color: primary ? '#fff' : '#94A3B8',
        boxShadow: primary ? '0 2px 12px rgba(37,99,235,0.35)' : 'none',
      }}
    >
      {icon}{label}
    </button>
  );
}