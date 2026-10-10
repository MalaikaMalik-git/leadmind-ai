'use client';

// ─────────────────────────────────────────────
//  LeadMind AI — Calls Page
//  Day 20 · Session 2
//  UC-08  unified call log
//
//  Data flow:
//   1. On mount → fetchCampaigns() for the campaign filter dropdown
//   2. On filter/sort/page change → fetchCalls(query)
//   3. While any row on the current page is live (Initiated/Ringing/
//      Answered) → poll fetchCalls again every 8s so status/duration
//      update without a manual refresh
//   4. Export → re-fetch up to 1000 matching rows (ignoring pagination)
//      with the current filters, convert to CSV via papaparse, download
//
//  States handled: loading (SkeletonTable) · error (banner + retry) ·
//  empty (differs if filters are active) · data (CallsTable + pagination)
// ─────────────────────────────────────────────

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Papa from 'papaparse';
import {
  Filter, AlertCircle, RefreshCw, Download,
  Phone, ChevronLeft, ChevronRight, X,
} from 'lucide-react';

import SkeletonTable from '@/src/components/ui/SkeletonTable';
import CallsTable from '@/src/components/calls/CallsTable';
import WebCallPanel from '@/src/components/calls/WebCallPanel';
import { AuthError } from '@/src/types/auth';
import { fetchCalls, CallLogRow, CallsQuery, CallType, CallStatus, LIVE_CALL_STATUSES } from '@/src/lib/api/calls';
import { fetchCampaigns } from '@/src/lib/api/campaigns';
import { Campaign } from '@/src/components/campaigns/CampaignCard';

const CALL_TYPE_OPTIONS: CallType[] = ['Inbound', 'Outbound'];
const STATUS_OPTIONS: CallStatus[] = [
  'Initiated', 'Ringing', 'Answered', 'Completed',
  'No Answer', 'Busy', 'Voicemail', 'Failed', 'Abandoned',
];
const PAGE_SIZE = 20;
const POLL_INTERVAL_MS = 8000;
const EXPORT_MAX_ROWS = 1000;

export default function CallsPage() {
  const [calls, setCalls] = useState<CallLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);

  const [callType, setCallType] = useState<CallType | ''>('');
  const [status, setStatus] = useState<CallStatus | ''>('');
  const [campaignFilter, setCampaignFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<NonNullable<CallsQuery['sortBy']>>('initiatedAt');
  const [sortOrder, setSortOrder] = useState<NonNullable<CallsQuery['sortOrder']>>('desc');

  const hasActiveFilters = !!(callType || status || campaignFilter || startDate || endDate);

  // ── Load campaign list once, for the filter dropdown ────────────────────
  useEffect(() => {
    fetchCampaigns({ limit: 100, includeArchived: true })
      .then(({ campaigns: data }) => setCampaigns(data))
      .catch(() => setCampaigns([]));
  }, []);

  const query: CallsQuery = useMemo(() => ({
    callType: callType || undefined,
    status: status || undefined,
    campaign: campaignFilter || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    page,
    limit: PAGE_SIZE,
    sortBy,
    sortOrder,
  }), [callType, status, campaignFilter, startDate, endDate, page, sortBy, sortOrder]);

  const loadCalls = useCallback(async (q: CallsQuery, opts: { silent?: boolean } = {}) => {
    if (!opts.silent) setLoading(true);
    setError(null);
    try {
      const { calls: data, pagination } = await fetchCalls(q);
      setCalls(data);
      setTotal(pagination.total);
      setTotalPages(pagination.totalPages);
    } catch (err) {
      if (!opts.silent) {
        const message = err instanceof AuthError ? err.message : 'Failed to load calls. Please try again.';
        setError(message);
      }
    } finally {
      if (!opts.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCalls(query);
  }, [loadCalls, query]);

  // ── Live polling — Day 20: "Live status indicator for ongoing calls" ────
  // Only polls while at least one row on the CURRENT page is still in
  // progress, and stops automatically once none are — avoids polling
  // forever on a page full of already-completed calls.
  const hasLiveCalls = calls.some((c) => LIVE_CALL_STATUSES.includes(c.status));
  const queryRef = useRef(query);
  queryRef.current = query;

  useEffect(() => {
    if (!hasLiveCalls) return;
    const interval = setInterval(() => {
      loadCalls(queryRef.current, { silent: true });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [hasLiveCalls, loadCalls]);

  const clearFilters = () => {
    setCallType('');
    setStatus('');
    setCampaignFilter('');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  const handleSortChange = (field: NonNullable<CallsQuery['sortBy']>) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
    setPage(1);
  };

  // ── CSV export — currently filtered rows, up to EXPORT_MAX_ROWS ─────────
  const handleExport = async () => {
    setExporting(true);
    try {
      const { calls: exportRows } = await fetchCalls({ ...query, page: 1, limit: EXPORT_MAX_ROWS });
      const csvRows = exportRows.map((c) => ({
        Lead: c.lead?.fullName ?? 'Unknown Lead',
        Phone: c.lead?.phone ?? '',
        Campaign: c.campaign?.name ?? 'None (inbound)',
        Type: c.callType,
        Status: c.status,
        Duration: c.durationFormatted,
        Date: new Date(c.initiatedAt).toLocaleString(),
        'Qualification Score': c.qualificationScore ?? '',
      }));
      const csv = Papa.unparse(csvRows);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `leadmind-calls-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setError('Failed to export calls. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* DEMO: browser web call — additive, phone calling is unchanged */}
      <WebCallPanel onCallFinished={() => loadCalls(queryRef.current, { silent: true })} />

      {/* ── Page header ─────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h2 style={{ color: '#F8FAFC', fontSize: 18, fontWeight: 700, margin: 0, lineHeight: 1 }}>
            Calls
          </h2>
          <p style={{ color: '#475569', fontSize: 12, marginTop: 5 }}>
            {total > 0 ? `${total} call${total === 1 ? '' : 's'} across all leads` : 'Full log of inbound and outbound calls'}
          </p>
        </div>
        <HeaderBtn
          icon={<Download size={13} strokeWidth={2} />}
          label={exporting ? 'Exporting…' : 'Export CSV'}
          onClick={handleExport}
          disabled={exporting || total === 0}
        />
      </div>

      {/* ── Filters ───────────────────────────────── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <FilterSelect
          value={callType}
          onChange={(v) => { setCallType(v as CallType | ''); setPage(1); }}
          placeholder="All Types"
          options={CALL_TYPE_OPTIONS}
        />
        <FilterSelect
          value={status}
          onChange={(v) => { setStatus(v as CallStatus | ''); setPage(1); }}
          placeholder="All Statuses"
          options={STATUS_OPTIONS}
        />
        <FilterSelect
          value={campaignFilter}
          onChange={(v) => { setCampaignFilter(v); setPage(1); }}
          placeholder="All Campaigns"
          options={campaigns.map((c) => c._id)}
          labels={Object.fromEntries(campaigns.map((c) => [c._id, c.name]))}
        />
        <DateInput value={startDate} onChange={(v) => { setStartDate(v); setPage(1); }} placeholder="From" />
        <DateInput value={endDate} onChange={(v) => { setEndDate(v); setPage(1); }} placeholder="To" />

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '7px 10px', borderRadius: 8, cursor: 'pointer',
              background: 'transparent', border: '1px solid rgba(255,255,255,0.08)',
              color: '#64748B', fontSize: 11.5,
            }}
          >
            <X size={11} /> Clear
          </button>
        )}
      </div>

      {/* ── Error banner ──────────────────────────── */}
      {error && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, padding: '10px 14px', borderRadius: 8,
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertCircle size={14} color="#F87171" />
            <span style={{ fontSize: 12, color: '#F87171' }}>{error}</span>
          </div>
          <button
            onClick={() => loadCalls(query)}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
              background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.2)',
              color: '#F87171', fontSize: 11, fontWeight: 500,
            }}
          >
            <RefreshCw size={11} /> Retry
          </button>
        </div>
      )}

      {/* ── Table / Loading / Empty ──────────────── */}
      {loading ? (
        <SkeletonTable rows={8} cols={6} />
      ) : calls.length === 0 ? (
        <EmptyState hasFilters={hasActiveFilters} onClearFilters={clearFilters} />
      ) : (
        <>
          <CallsTable calls={calls} sortBy={sortBy} sortOrder={sortOrder} onSortChange={handleSortChange} />
          {totalPages > 1 && (
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          )}
        </>
      )}
    </div>
  );
}

// ── Filter dropdown ────────────────────────────
function FilterSelect({ value, onChange, placeholder, options, labels }: {
  value: string; onChange: (v: string) => void; placeholder: string;
  options: string[]; labels?: Record<string, string>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        padding: '8px 10px', borderRadius: 8,
        background: value ? 'rgba(59,130,246,0.08)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${value ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.08)'}`,
        color: value ? '#60A5FA' : '#94A3B8', fontSize: 12, outline: 'none', cursor: 'pointer',
      }}
    >
      <option value="">{placeholder}</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>{labels?.[opt] ?? opt}</option>
      ))}
    </select>
  );
}

// ── Date filter input ──────────────────────────
function DateInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        padding: '7px 10px', borderRadius: 8,
        background: value ? 'rgba(59,130,246,0.08)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${value ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.08)'}`,
        color: value ? '#60A5FA' : '#64748B', fontSize: 12, outline: 'none', cursor: 'pointer',
        colorScheme: 'dark',
      }}
    />
  );
}

// ── Pagination controls ────────────────────────
function Pagination({ page, totalPages, onPageChange }: {
  page: number; totalPages: number; onPageChange: (p: number) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
      <PageBtn onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
        <ChevronLeft size={14} />
      </PageBtn>
      <span style={{ color: '#64748B', fontSize: 12 }}>
        Page {page} of {totalPages}
      </span>
      <PageBtn onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>
        <ChevronRight size={14} />
      </PageBtn>
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

// ── Empty state ─────────────────────────────────
function EmptyState({ hasFilters, onClearFilters }: { hasFilters: boolean; onClearFilters: () => void }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '60px 20px', gap: 12,
      borderRadius: 12, border: '1px dashed rgba(255,255,255,0.08)',
      background: 'rgba(255,255,255,0.015)',
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: '50%',
        background: 'rgba(59,130,246,0.1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Phone size={20} strokeWidth={1.5} color="#3B82F6" />
      </div>
      <div style={{ textAlign: 'center' }}>
        <p style={{ color: '#CBD5E1', fontSize: 13, fontWeight: 600, margin: 0 }}>
          {hasFilters ? 'No calls match these filters' : 'No calls yet'}
        </p>
        <p style={{ color: '#475569', fontSize: 12, marginTop: 4 }}>
          {hasFilters ? 'Try adjusting or clearing your filters' : 'Calls will show up here once a campaign starts dialing, or a lead calls in'}
        </p>
      </div>
      {hasFilters && (
        <button onClick={onClearFilters} style={{
          marginTop: 8, padding: '8px 16px', borderRadius: 8,
          background: 'rgba(255,255,255,0.04)', color: '#94A3B8', fontSize: 12,
          fontWeight: 600, border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <Filter size={13} /> Clear Filters
        </button>
      )}
    </div>
  );
}

// ── Header button ───────────────────────────────
function HeaderBtn({ icon, label, onClick, disabled }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '7px 13px', borderRadius: 8, cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 12, fontWeight: 500,
        border: '1px solid rgba(255,255,255,0.1)',
        background: 'rgba(255,255,255,0.04)', color: disabled ? '#475569' : '#94A3B8',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {icon}{label}
    </button>
  );
}