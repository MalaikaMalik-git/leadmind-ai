'use client';

// ─────────────────────────────────────────────
//  LeadMind AI — Campaigns Page
//  Day 8 · Session 3 — FINAL (real API wired)
//
//  Data flow:
//   1. On mount → fetchCampaignStats() for the stats bar
//      + fetchCampaigns() for the card grid
//   2. On tab change → fetchCampaigns({ status }) for filtered cards
//   3. Pause/Resume → updateCampaignStatus() then refetch
//
//  States handled:
//   • loading  — skeleton cards shown
//   • error    — error banner with retry
//   • empty    — friendly empty state per tab
//   • data     — real CampaignCard grid
// ─────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Upload, Megaphone, AlertCircle, RefreshCw } from 'lucide-react';

import CampaignStatsBar from '@/src/components/campaigns/CampaignStatsBar';
import CampaignCard, { Campaign } from '@/src/components/campaigns/CampaignCard';
import DeleteCampaignModal from '@/src/components/campaigns/DeleteCampaignModal';
import CreateCampaignDialog from '@/src/components/campaigns/CreateCampaignDialog';
import Toast, { ToastState } from '@/src/components/ui/Toast';
import {
  fetchCampaigns,
  fetchCampaignStats,
  updateCampaignStatus,
  restoreCampaign,
  CampaignQuery,
} from '@/src/lib/api/campaigns';
import { PageLoader } from '@/src/components/ui/Spinner';

// ── Filter tabs ───────────────────────────────
type FilterTab = 'All' | 'Running' | 'Paused' | 'Draft' | 'Completed' | 'Archived';
const TABS: FilterTab[] = ['All', 'Running', 'Paused', 'Draft', 'Completed', 'Archived'];

// ── Stats shape ───────────────────────────────
interface Stats {
  total: number; running: number;
  paused: number; draft: number; completed: number; archived: number;
}

const EMPTY_STATS: Stats = { total: 0, running: 0, paused: 0, draft: 0, completed: 0, archived: 0 };

export default function CampaignsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlSearch = (searchParams?.get('search') || '').trim();

  // ── State ─────────────────────────────────────
  const [activeTab,      setActiveTab]      = useState<FilterTab>('All');
  const [campaigns,      setCampaigns]      = useState<Campaign[]>([]);
  const [stats,          setStats]          = useState<Stats>(EMPTY_STATS);
  const [loading,        setLoading]        = useState(true);
  const [statsLoading,   setStatsLoading]   = useState(true);
  const [error,          setError]          = useState<string | null>(null);
  const [actionLoading,  setActionLoading]  = useState<string | null>(null); // campaign id being actioned
  const [deleteTarget,   setDeleteTarget]   = useState<Campaign | null>(null);  // campaign in the archive/delete dialog
  const [creating,       setCreating]       = useState(false);
  const [toast,          setToast]          = useState<ToastState | null>(null);

  useEffect(() => {
    if (searchParams?.get('create') === '1') setCreating(true);
  }, [searchParams]);

  // ── Fetch campaigns for current tab ──────────
  const loadCampaigns = useCallback(async (tab: FilterTab) => {
    setLoading(true);
    setError(null);
    try {
      const query: CampaignQuery = tab === 'All' ? {} : { status: tab as Campaign['status'] };
      if (urlSearch) {
        query.search = urlSearch;
        query.includeArchived = true;
      }
      const { campaigns: data } = await fetchCampaigns(query);
      setCampaigns(data);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load campaigns. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [urlSearch]);

  // ── Fetch stats bar data ──────────────────────
  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const s = await fetchCampaignStats();
      setStats(s);
    } catch {
      // Stats failure is non-fatal — keep showing zeros
    } finally {
      setStatsLoading(false);
    }
  }, []);

  // ── On mount: load stats. Campaigns reload when the tab or the search changes.
  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    loadCampaigns(activeTab);
  }, [loadCampaigns, activeTab]);

  const handleTabChange = (tab: FilterTab) => {
    setActiveTab(tab);
  };

  // ── Pause handler ─────────────────────────────
  const handlePause = async (id: string) => {
    setActionLoading(id);
    try {
      await updateCampaignStatus(id, 'Paused');
      // Optimistic UI update
      setCampaigns(prev =>
        prev.map(c => c._id === id ? { ...c, status: 'Paused' as const } : c)
      );
      // Refresh stats bar
      loadStats();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to pause campaign.');
    } finally {
      setActionLoading(null);
    }
  };

  // ── Resume handler ────────────────────────────
  const handleResume = async (id: string) => {
    setActionLoading(id);
    try {
      await updateCampaignStatus(id, 'Running');
      setCampaigns(prev =>
        prev.map(c => c._id === id ? { ...c, status: 'Running' as const } : c)
      );
      loadStats();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to resume campaign.');
    } finally {
      setActionLoading(null);
    }
  };

  // ── Restore (archived → back to the working list) ──
  const handleRestore = async (id: string) => {
    setActionLoading(id);
    try {
      await restoreCampaign(id);
      setToast({ type: 'success', message: 'Campaign restored (paused — start it when you are ready).' });
      loadStats();
      loadCampaigns(activeTab);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to restore campaign.');
    } finally {
      setActionLoading(null);
    }
  };

  // ── Archive / delete dialog ──
  const handleDelete = (id: string) => {
    const c = campaigns.find(x => x._id === id);
    if (c) setDeleteTarget(c);
  };
  const handleDeleteDone = (message: string) => {
    setDeleteTarget(null);
    setToast({ type: 'success', message });
    loadStats();
    loadCampaigns(activeTab);
  };

  // ── View + Import + Settings handlers ─────────
  const handleView     = (id: string) => router.push(`/dashboard/campaigns/${id}`);
  const handleImport   = (id: string) => router.push(`/dashboard/leads/import?campaignId=${id}`);
  const handleSettings = (id: string) => router.push(`/dashboard/campaigns/${id}/settings`);

  // ── Tab counts from stats ─────────────────────
  const tabCount = (tab: FilterTab): number | null => {
    if (tab === 'All')       return null;
    if (tab === 'Running')   return stats.running;
    if (tab === 'Paused')    return stats.paused;
    if (tab === 'Draft')     return stats.draft;
    if (tab === 'Completed') return stats.completed;
    if (tab === 'Archived')  return stats.archived;
    return null;
  };

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Page header ─────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h2 style={{ color: '#F8FAFC', fontSize: 18, fontWeight: 700, margin: 0, lineHeight: 1 }}>
            Campaigns
          </h2>
          <p style={{ color: '#475569', fontSize: 12, marginTop: 5 }}>
            Manage your outbound calling campaigns
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <HeaderBtn
            icon={<Upload size={13} strokeWidth={2} />}
            label="Import Leads"
            onClick={() => router.push('/dashboard/leads/import')}
            primary={false}
          />
          <HeaderBtn
            icon={<Plus size={13} strokeWidth={2.5} />}
            label="New Campaign"
            onClick={() => setCreating(true)}
            primary={true}
          />
        </div>
      </div>

      {/* ── Stats bar ────────────────────────────── */}
      <CampaignStatsBar {...stats} loading={statsLoading} />

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
            onClick={() => { setError(null); loadCampaigns(activeTab); loadStats(); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
              background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.2)',
              color: '#F87171', fontSize: 11, fontWeight: 500,
            }}
          >
            <RefreshCw size={11} />
            Retry
          </button>
        </div>
      )}

      {urlSearch && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ fontSize: 12, color: '#94A3B8' }}>
            Campaigns matching “{urlSearch}”
          </span>
          <button
            type="button"
            onClick={() => router.replace('/dashboard/campaigns')}
            style={{
              padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
              color: '#94A3B8', fontSize: 11, fontWeight: 500,
            }}
          >
            Clear search
          </button>
        </div>
      )}

      {/* ── Filter tabs ──────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {TABS.map(tab => {
          const active = activeTab === tab;
          const count  = tabCount(tab);
          return (
            <button
              key={tab}
              onClick={() => handleTabChange(tab)}
              style={{
                position: 'relative', padding: '8px 14px',
                fontSize: 12, fontWeight: active ? 600 : 400,
                color: active ? '#60A5FA' : '#64748B',
                background: 'transparent', border: 'none',
                cursor: 'pointer', whiteSpace: 'nowrap', transition: 'color 150ms',
              }}
            >
              {tab}
              {count !== null && (
                <span style={{
                  marginLeft: 4, fontSize: 9, fontWeight: 600,
                  padding: '1px 5px', borderRadius: 99,
                  background: active ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.06)',
                  color: active ? '#60A5FA' : '#475569',
                }}>
                  {count}
                </span>
              )}
              {active && (
                <span style={{
                  position: 'absolute', bottom: -1, left: 0, right: 0,
                  height: 2, background: '#3B82F6', borderRadius: '2px 2px 0 0',
                }} />
              )}
            </button>
          );
        })}
      </div>

      {/* ── Cards grid / Loading / Empty ─────────── */}
      {loading ? (
        <SkeletonGrid />
      ) : campaigns.length === 0 ? (
        <EmptyState
          tab={activeTab}
          onCreate={() => setCreating(true)}
        />
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: 12, paddingBottom: 8,
        }}>
          {campaigns.map(c => (
            <CampaignCard
              key={c._id}
              campaign={c}
              onView={handleView}
              onPause={handlePause}
              onResume={handleResume}
              onImport={handleImport}
              onSettings={handleSettings}
              onDelete={handleDelete}
              onRestore={handleRestore}
              busy={actionLoading === c._id}
            />
          ))}
        </div>
      )}

      {creating && (
        <CreateCampaignDialog
          onClose={() => {
            setCreating(false);
            if (searchParams?.get('create') === '1') router.replace('/dashboard/campaigns');
          }}
          onCreated={(message) => {
            setCreating(false);
            setToast({ type: 'success', message });
            loadStats();
            loadCampaigns(activeTab);
            if (searchParams?.get('create') === '1') router.replace('/dashboard/campaigns');
          }}
          onUploadLeads={(campaignId) => router.push(`/dashboard/leads/import?campaignId=${campaignId}`)}
        />
      )}
      {deleteTarget && (
        <DeleteCampaignModal
          campaign={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDone={handleDeleteDone}
        />
      )}
      {toast && <Toast {...toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}

// ── Loading state ─────────────────────────────
function SkeletonGrid() {
  return <PageLoader card minHeight={320} label="Loading campaigns…" />;
}

// ── Empty state ───────────────────────────────
function EmptyState({ tab, onCreate }: { tab: FilterTab; onCreate: () => void }) {
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
        <Megaphone size={20} strokeWidth={1.5} color="#3B82F6" />
      </div>
      <div style={{ textAlign: 'center' }}>
        <p style={{ color: '#CBD5E1', fontSize: 13, fontWeight: 600, margin: 0 }}>
          No campaigns yet
        </p>
        <p style={{ color: '#475569', fontSize: 12, marginTop: 4 }}>
          {tab === 'All'
            ? 'Create your first campaign to start qualifying leads'
            : tab === 'Archived'
              ? 'Archived campaigns appear here — nothing archived yet'
              : `No ${tab.toLowerCase()} campaigns right now`}
        </p>
      </div>
      {tab === 'All' && (
        <button
          onClick={onCreate}
          style={{
            marginTop: 8, padding: '8px 16px', borderRadius: 8,
            background: '#2563EB', color: '#fff', fontSize: 12,
            fontWeight: 600, border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
            boxShadow: '0 2px 10px rgba(37,99,235,0.3)',
          }}
        >
          <Plus size={13} strokeWidth={2.5} /> Create Campaign
        </button>
      )}
    </div>
  );
}

// ── Header button ─────────────────────────────
function HeaderBtn({ icon, label, onClick, primary }: {
  icon: React.ReactNode; label: string; onClick: () => void; primary: boolean;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '7px 13px', borderRadius: 8, cursor: 'pointer',
        fontSize: 12, fontWeight: primary ? 600 : 500, whiteSpace: 'nowrap',
        transition: 'all 150ms',
        border:     primary ? '1px solid transparent' : '1px solid rgba(255,255,255,0.1)',
        background: primary ? (hov ? '#1D4ED8' : '#2563EB') : (hov ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)'),
        color:      primary ? '#fff' : (hov ? '#CBD5E1' : '#94A3B8'),
        boxShadow:  primary ? '0 2px 12px rgba(37,99,235,0.35)' : 'none',
      }}
    >
      {icon}{label}
    </button>
  );
}