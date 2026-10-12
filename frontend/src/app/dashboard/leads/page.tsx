'use client';

// ─────────────────────────────────────────────
//  LeadMind AI — Leads Page
//  Day 12 · Session 4 — FINAL (real API wired)
//  UC-07  View Leads & Statuses
//
//  Data flow:
//   1. On mount → fetchCampaigns() for the campaign filter dropdown
//   2. On filter/search/sort/page change → fetchLeads(query)
//
//  States handled:
//   • loading — SkeletonTable
//   • error   — error banner with retry
//   • empty   — friendly empty state (differs if filters are active)
//   • data    — LeadsTable + pagination controls
// ─────────────────────────────────────────────

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Search, Filter, AlertCircle, RefreshCw, Upload,
  Users, ChevronLeft, ChevronRight, X, ArrowLeft,
} from 'lucide-react';

import SkeletonTable from '@/src/components/ui/SkeletonTable';
import LeadsTable from '@/src/components/leads/LeadsTable';
import { deleteLead, fetchLeads, Lead, LeadQuery, LeadStatus, LeadSource } from '@/src/lib/api/leads';
import DeleteLeadDialog from '@/src/components/leads/DeleteLeadDialog';
import { fetchCampaigns } from '@/src/lib/api/campaigns';
import { Campaign } from '@/src/components/campaigns/CampaignCard';

const STATUS_OPTIONS: LeadStatus[] = [
  'Pending', 'Calling', 'Qualified', 'Not Qualified', 'No Answer', 'Voicemail',
  'Busy', 'Meeting Booked', 'Needs Human Follow-up', 'Invalid Contact',
  'Abandoned', 'Call Failed', 'Qualified (No Slot)', 'Qualified (Booking Failed)',
];
const SOURCE_OPTIONS: LeadSource[] = ['CSV Upload', 'Inbound Call', 'Manual Entry'];
const PAGE_SIZE = 20;

export default function LeadsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlSearch = searchParams?.get('search') ?? '';

  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);

  const [searchInput, setSearchInput] = useState(urlSearch);
  const [search, setSearch] = useState(urlSearch); // debounced value actually used in the query
  const [status, setStatus] = useState<LeadStatus | ''>('');
  const [campaignFilter, setCampaignFilter] = useState('');
  const [source, setSource] = useState<LeadSource | ''>('');
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<NonNullable<LeadQuery['sortBy']>>('createdAt');
  const [sortOrder, setSortOrder] = useState<NonNullable<LeadQuery['sortOrder']>>('desc');
  const [deleteTarget, setDeleteTarget] = useState<Lead | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const hasActiveFilters = !!(search || status || campaignFilter || source);

  // Arriving from the top-bar search (?search=) fills this page's own box.
  useEffect(() => {
    setSearchInput(urlSearch);
    setSearch(urlSearch);
    setPage(1);
  }, [urlSearch]);

  // ── Debounce the search box so we don't fire a request on every keystroke ──
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  // ── Load campaign list once, for the filter dropdown ────────────────────
  useEffect(() => {
    fetchCampaigns({ limit: 100, includeArchived: true })
      .then(({ campaigns: data }) => setCampaigns(data))
      .catch(() => setCampaigns([]));
  }, []);

  // ── Load leads whenever any query param changes ─────────────────────────
  const query: LeadQuery = useMemo(() => ({
    search: search || undefined,
    status: status || undefined,
    campaign: campaignFilter || undefined,
    source: source || undefined,
    page,
    limit: PAGE_SIZE,
    sortBy,
    sortOrder,
  }), [search, status, campaignFilter, source, page, sortBy, sortOrder]);

  const loadLeads = useCallback(async (q: LeadQuery) => {
    setLoading(true);
    setError(null);
    try {
      const { leads: data, pagination } = await fetchLeads(q);
      setLeads(data);
      setTotal(pagination.total);
      setTotalPages(pagination.totalPages);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load leads. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLeads(query);
  }, [loadLeads, query]);

  const handleSortChange = (field: NonNullable<LeadQuery['sortBy']>) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
    setPage(1);
  };

  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setStatus('');
    setCampaignFilter('');
    setSource('');
    setPage(1);
  };

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Page header ─────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <button
            type="button"
            onClick={() => router.push('/dashboard')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8,
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#64748B', fontSize: 12, fontWeight: 500, padding: 0,
            }}
          >
            <ArrowLeft size={13} strokeWidth={2} /> Dashboard
          </button>
          <h2 style={{ color: '#F8FAFC', fontSize: 18, fontWeight: 700, margin: 0, lineHeight: 1 }}>
            Leads
          </h2>
          <p style={{ color: '#475569', fontSize: 12, marginTop: 5 }}>
            {total > 0 ? `${total} lead${total === 1 ? '' : 's'} across all campaigns` : 'View and manage all your leads'}
          </p>
        </div>
        <HeaderBtn
          icon={<Upload size={13} strokeWidth={2} />}
          label="Import Leads"
          onClick={() => router.push('/dashboard/leads/import')}
        />
      </div>

      {/* ── Search + Filters ─────────────────────── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 200 }}>
          <Search size={13} color="#475569" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search name, phone, email, company…"
            style={{
              width: '100%', padding: '8px 12px 8px 32px', borderRadius: 8,
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
              color: '#F1F5F9', fontSize: 12.5, outline: 'none',
            }}
          />
        </div>

        <FilterSelect
          value={status}
          onChange={(v) => { setStatus(v as LeadStatus | ''); setPage(1); }}
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
        <FilterSelect
          value={source}
          onChange={(v) => { setSource(v as LeadSource | ''); setPage(1); }}
          placeholder="All Sources"
          options={SOURCE_OPTIONS}
        />

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

      {/* ── Error banner ─────────────────────────── */}
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
            onClick={() => loadLeads(query)}
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
      ) : leads.length === 0 ? (
        <EmptyState hasFilters={hasActiveFilters} onClearFilters={clearFilters} onImport={() => router.push('/dashboard/leads/import')} />
      ) : (
        <>
          <LeadsTable
            leads={leads}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSortChange={handleSortChange}
            onDelete={(lead) => {
              setDeleteError(null);
              setDeleteTarget(lead);
            }}
          />
          {totalPages > 1 && (
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          )}
        </>
      )}
      {deleteTarget && (
        <DeleteLeadDialog
          leadName={deleteTarget.fullName}
          busy={deleteBusy}
          error={deleteError}
          onClose={() => { if (!deleteBusy) setDeleteTarget(null); }}
          onConfirm={async () => {
            setDeleteBusy(true);
            setDeleteError(null);
            try {
              await deleteLead(deleteTarget._id);
              setDeleteTarget(null);
              await loadLeads(query);
            } catch (err) {
              setDeleteError(err instanceof Error ? err.message : 'Could not delete this lead.');
            } finally {
              setDeleteBusy(false);
            }
          }}
        />
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
function EmptyState({ hasFilters, onClearFilters, onImport }: {
  hasFilters: boolean; onClearFilters: () => void; onImport: () => void;
}) {
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
        <Users size={20} strokeWidth={1.5} color="#3B82F6" />
      </div>
      <div style={{ textAlign: 'center' }}>
        <p style={{ color: '#CBD5E1', fontSize: 13, fontWeight: 600, margin: 0 }}>
          {hasFilters ? 'No leads match these filters' : 'No leads yet'}
        </p>
        <p style={{ color: '#475569', fontSize: 12, marginTop: 4 }}>
          {hasFilters ? 'Try adjusting or clearing your filters' : 'Import a CSV to get your first leads in'}
        </p>
      </div>
      {hasFilters ? (
        <button onClick={onClearFilters} style={emptyBtnStyle(false)}>
          <Filter size={13} /> Clear Filters
        </button>
      ) : (
        <button onClick={onImport} style={emptyBtnStyle(true)}>
          <Upload size={13} strokeWidth={2.5} /> Import Leads
        </button>
      )}
    </div>
  );
}

function emptyBtnStyle(primary: boolean): React.CSSProperties {
  return {
    marginTop: 8, padding: '8px 16px', borderRadius: 8,
    background: primary ? '#2563EB' : 'rgba(255,255,255,0.04)',
    color: primary ? '#fff' : '#94A3B8', fontSize: 12,
    fontWeight: 600, border: primary ? 'none' : '1px solid rgba(255,255,255,0.1)', cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: 6,
    boxShadow: primary ? '0 2px 10px rgba(37,99,235,0.3)' : 'none',
  };
}

// ── Header button ───────────────────────────────
function HeaderBtn({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '7px 13px', borderRadius: 8, cursor: 'pointer',
        fontSize: 12, fontWeight: 500,
        border: '1px solid rgba(255,255,255,0.1)',
        background: 'rgba(255,255,255,0.04)', color: '#94A3B8',
      }}
    >
      {icon}{label}
    </button>
  );
}