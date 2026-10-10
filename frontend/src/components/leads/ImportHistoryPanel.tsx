'use client';
import { Spinner } from '@/src/components/ui/Spinner';

// ─────────────────────────────────────────────
//  LeadMind AI — ImportHistoryPanel
//  Day 12 · Session 3
//
//  Sidebar on the Upload Leads page listing past import batches for the
//  current campaign. Each entry expands to show the leads that batch
//  actually created (fetched on-demand via GET /api/leads?importBatch=...).
//
//  Note: this shows leads that landed in the DB, not failed rows — failed
//  rows are never persisted (they never became Lead documents), so there's
//  nothing to look back on for a batch beyond what its immediate import
//  summary already showed at the time. See leadController.ts for the same
//  note on the backend side.
// ─────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronRight, History, Loader2, Inbox } from 'lucide-react';
import { fetchImportHistory, fetchLeads, ImportHistoryEntry, Lead } from '@/src/lib/api/leads';

interface ImportHistoryPanelProps {
  campaignId: string;
  refreshKey?: number; // bump this after a new import to force a re-fetch
}

export default function ImportHistoryPanel({ campaignId, refreshKey }: ImportHistoryPanelProps) {
  const [history, setHistory] = useState<ImportHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null);

  const loadHistory = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchImportHistory(campaignId)
      .then(setHistory)
      .catch((err: any) => setError(err?.message ?? 'Could not load import history.'))
      .finally(() => setLoading(false));
  }, [campaignId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory, refreshKey]);

  return (
    <div style={{
      background: '#111827', border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 12, padding: 18, display: 'flex', flexDirection: 'column', gap: 12,
      height: 'fit-content',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <History size={14} color="#64748B" />
        <p style={{ color: '#F8FAFC', fontSize: 13, fontWeight: 600, margin: 0 }}>Import History</p>
      </div>

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
          <Loader2 size={13} color="#475569" className="animate-spin" />
          <span style={{ color: '#475569', fontSize: 12 }}>Loading…</span>
        </div>
      )}

      {!loading && error && (
        <p style={{ color: '#F87171', fontSize: 12 }}>{error}</p>
      )}

      {!loading && !error && history.length === 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
          <Inbox size={14} color="#334155" />
          <span style={{ color: '#475569', fontSize: 12 }}>No imports yet for this campaign.</span>
        </div>
      )}

      {!loading && !error && history.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {history.map((entry) => (
            <HistoryEntryRow
              key={entry.importBatch}
              entry={entry}
              isExpanded={expandedBatch === entry.importBatch}
              onToggle={() =>
                setExpandedBatch(expandedBatch === entry.importBatch ? null : entry.importBatch)
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── One collapsible batch row ─────────────────────────────────────────────
function HistoryEntryRow({
  entry, isExpanded, onToggle,
}: { entry: ImportHistoryEntry; isExpanded: boolean; onToggle: () => void }) {
  const date = new Date(entry.importedAt);
  const dateLabel = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const timeLabel = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  return (
    <div style={{
      borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)',
      background: 'rgba(255,255,255,0.015)', overflow: 'hidden',
    }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 12px', cursor: 'pointer', background: 'transparent', border: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isExpanded ? <ChevronDown size={12} color="#64748B" /> : <ChevronRight size={12} color="#64748B" />}
          <div style={{ textAlign: 'left' }}>
            <p style={{ color: '#CBD5E1', fontSize: 12, fontWeight: 600, margin: 0 }}>
              {entry.total} lead{entry.total === 1 ? '' : 's'}
            </p>
            <p style={{ color: '#475569', fontSize: 10, marginTop: 1 }}>
              {dateLabel} · {timeLabel}
            </p>
          </div>
        </div>
        {entry.qualified > 0 && (
          <span style={{
            fontSize: 10, fontWeight: 600, color: '#22C55E',
            background: 'rgba(34,197,94,0.1)', padding: '2px 7px', borderRadius: 99,
          }}>
            {entry.qualified} qualified
          </span>
        )}
      </button>

      {isExpanded && <BatchLeadsList importBatch={entry.importBatch} />}
    </div>
  );
}

// ── Fetched on-demand only when a batch is expanded ────────────────────────
function BatchLeadsList({ importBatch }: { importBatch: string }) {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchLeads({ importBatch, limit: 50 })
      .then(({ leads: data }) => { if (!cancelled) setLeads(data); })
      .catch((err: any) => { if (!cancelled) setError(err?.message ?? 'Could not load leads.'); });
    return () => { cancelled = true; };
  }, [importBatch]);

  return (
    <div style={{
      borderTop: '1px solid rgba(255,255,255,0.06)',
      padding: '8px 12px 10px 30px',
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      {error && <p style={{ color: '#F87171', fontSize: 11 }}>{error}</p>}
      {!error && leads === null && (
        <div style={{ display:'flex', alignItems:'center', gap:6 }}><Spinner size={12} /><span style={{ color: '#475569', fontSize: 11 }}>Loading leads…</span></div>
      )}
      {!error && leads !== null && leads.map((lead) => (
        <div key={lead._id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: '#94A3B8', fontSize: 11 }}>{lead.fullName}</span>
          <span style={{ color: '#334155', fontSize: 10 }}>{lead.status}</span>
        </div>
      ))}
    </div>
  );
}