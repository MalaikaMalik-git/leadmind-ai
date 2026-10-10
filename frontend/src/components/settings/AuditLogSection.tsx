'use client';

// ─────────────────────────────────────────────
//  LeadMind AI — Audit Log Section
//  Day 26, Session 4
//
//  Self-contained: owns its own fetch/pagination/filter state, so it can
//  be dropped into the Settings page as a single full-width component
//  without the page needing to know about audit-log internals — same
//  "self-contained" pattern as Toast.tsx.
//
//  Hits GET /api/audit-log (auditLogController.ts, Day 26, Session 1),
//  which is already scoped to the current admin and already supports the
//  `action` partial-match filter and pagination this component uses.
// ─────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react';
import {
  History, LogIn, PlusCircle, PlayCircle, PauseCircle, Activity,
  ChevronLeft, ChevronRight, AlertCircle, RefreshCw,
} from 'lucide-react';
import { fetchAuditLog } from '@/src/lib/api/auditLog';
import { AuditLogEntry } from '@/src/types/auditLog';
import SkeletonTable from '@/src/components/ui/SkeletonTable';

const PAGE_SIZE = 10;

// ── Filter options — value is the partial-match string sent as
//    the `action` query param; '' means no filter ──────────────────────
const FILTER_OPTIONS = [
  { value: '',               label: 'All Activity' },
  { value: 'admin.login',    label: 'Logins' },
  { value: 'campaign.create',label: 'Campaigns Created' },
  { value: 'campaign.start', label: 'Campaigns Started' },
  { value: 'campaign.pause', label: 'Campaigns Paused' },
];

// ── Icon + color per action — anything not in this map falls back to a
//    generic Activity icon, so a future action type never breaks the UI ──
const ACTION_META: Record<string, { label: string; Icon: typeof History; color: string }> = {
  'admin.login':     { label: 'Login',            Icon: LogIn,       color: '#60A5FA' },
  'campaign.create': { label: 'Campaign Created',  Icon: PlusCircle,  color: '#4ADE80' },
  'campaign.start':  { label: 'Campaign Started',  Icon: PlayCircle,  color: '#4ADE80' },
  'campaign.pause':  { label: 'Campaign Paused',   Icon: PauseCircle, color: '#FCD34D' },
};

function actionMeta(action: string) {
  return ACTION_META[action] ?? { label: action, Icon: Activity, color: '#94A3B8' };
}

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatAbsolute(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export default function AuditLogSection() {
  const [entries, setEntries]     = useState<AuditLogEntry[]>([]);
  const [page, setPage]           = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal]         = useState(0);
  const [filter, setFilter]       = useState('');
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { entries: data, pagination } = await fetchAuditLog({
        page, limit: PAGE_SIZE, action: filter || undefined,
      });
      setEntries(data);
      setTotalPages(pagination.totalPages);
      setTotal(pagination.total);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load activity log.');
    } finally {
      setLoading(false);
    }
  }, [page, filter]);

  useEffect(() => { load(); }, [load]);

  // Filter change resets to page 1 — a stale page number from a longer
  // list could otherwise land past the end of a shorter filtered list.
  const handleFilterChange = (v: string) => {
    setFilter(v);
    setPage(1);
  };

  return (
    <div style={{
      background: '#111827', border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 12, padding: '14px 16px',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      {/* ── Header: title + filter ─────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#64748B' }}>
          <History size={13} />
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.03em', textTransform: 'uppercase' }}>
            Recent Activity
          </span>
          {!loading && !error && (
            <span style={{ fontSize: 10.5, color: '#334155' }}>({total})</span>
          )}
        </div>
        <select
          value={filter}
          onChange={e => handleFilterChange(e.target.value)}
          style={{
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8, padding: '6px 10px', fontSize: 11.5, color: '#F8FAFC',
            outline: 'none', cursor: 'pointer', colorScheme: 'dark',
          }}
        >
          {FILTER_OPTIONS.map(o => (
            <option key={o.value} value={o.value} style={{ background: '#111827' }}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* ── Body ────────────────────────────────── */}
      {loading ? (
        <SkeletonTable rows={5} cols={3} />
      ) : error ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '24px 0' }}>
          <AlertCircle size={18} color="#F87171" />
          <span style={{ fontSize: 12, color: '#94A3B8' }}>{error}</span>
          <button
            onClick={load}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 7,
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
              color: '#F87171', fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}
          >
            <RefreshCw size={11} /> Retry
          </button>
        </div>
      ) : entries.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <p style={{ fontSize: 12, color: '#475569', margin: 0 }}>
            {filter ? 'No activity matches this filter.' : 'No activity yet.'}
          </p>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {entries.map((entry, i) => {
              const { label, Icon, color } = actionMeta(entry.action);
              return (
                <div
                  key={entry._id}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 4px',
                    borderBottom: i < entries.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                  }}
                >
                  <div style={{
                    width: 26, height: 26, borderRadius: 7, flexShrink: 0,
                    background: `${color}1F`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Icon size={13} color={color} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11.5, fontWeight: 600, color: '#F8FAFC' }}>{label}</span>
                      <span
                        title={formatAbsolute(entry.createdAt)}
                        style={{ fontSize: 10.5, color: '#334155', cursor: 'default' }}
                      >
                        {formatRelative(entry.createdAt)}
                      </span>
                    </div>
                    <p style={{ fontSize: 11.5, color: '#64748B', margin: 0, marginTop: 2, lineHeight: 1.5 }}>
                      {entry.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Pagination — same pattern as Leads page (Day 6) ──────── */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 4 }}>
              <PageBtn onClick={() => setPage(p => p - 1)} disabled={page <= 1}>
                <ChevronLeft size={14} />
              </PageBtn>
              <span style={{ color: '#64748B', fontSize: 12 }}>
                Page {page} of {totalPages}
              </span>
              <PageBtn onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}>
                <ChevronRight size={14} />
              </PageBtn>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PageBtn({ children, onClick, disabled }: {
  children: React.ReactNode; onClick: () => void; disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 28, height: 28, borderRadius: 7,
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
        color: disabled ? '#334155' : '#94A3B8',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  );
}
