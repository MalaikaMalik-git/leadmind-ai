'use client';

// Campaign workspace — one screen for a campaign's leads, qualification
// progress, and transcripts. View lands here so the client does not leave
// the campaign to inspect a lead or a conversation.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  AlertCircle, ArrowLeft, MessagesSquare, Pause, Phone, Play, RefreshCw, Settings, Trash2, Upload,
} from 'lucide-react';

import { Campaign } from '@/src/components/campaigns/CampaignCard';
import LeadStatusBadge from '@/src/components/leads/LeadStatusBadge';
import TranscriptViewer from '@/src/components/transcripts/TranscriptViewer';
import { PageLoader, Spinner } from '@/src/components/ui/Spinner';
import Toast, { ToastState } from '@/src/components/ui/Toast';
import { getCampaignById, updateCampaignStatus } from '@/src/lib/api/campaigns';
import { deleteLead, fetchLeads, Lead, LeadStatus } from '@/src/lib/api/leads';
import ImportLeadsDialog from '@/src/components/leads/ImportLeadsDialog';
import DeleteLeadDialog from '@/src/components/leads/DeleteLeadDialog';
import {
  fetchLeadTranscripts, fetchTranscriptById, TranscriptDetail, TranscriptSummary,
} from '@/src/lib/api/transcripts';
import { AuthError } from '@/src/types/auth';

type Outcome = 'Qualified' | 'Pending' | 'Unqualified' | 'Other';
type OutcomeFilter = 'All' | Outcome;

const QUALIFIED: LeadStatus[] = [
  'Qualified', 'Meeting Booked', 'Qualified (No Slot)', 'Qualified (Booking Failed)',
];
const PENDING: LeadStatus[] = ['Pending', 'Calling'];
const UNQUALIFIED: LeadStatus[] = ['Not Qualified'];

const STATUS_CONFIG: Record<string, { label: string; dot: string; bg: string; color: string; border: string }> = {
  Running:   { label: 'RUNNING',   dot: '#4ADE80', bg: 'rgba(34,197,94,0.12)',  color: '#4ADE80', border: 'rgba(34,197,94,0.25)'  },
  Paused:    { label: 'PAUSED',    dot: '#FCD34D', bg: 'rgba(245,158,11,0.12)', color: '#FCD34D', border: 'rgba(245,158,11,0.25)' },
  Draft:     { label: 'DRAFT',     dot: '#64748B', bg: 'rgba(100,116,139,0.15)',color: '#94A3B8', border: 'rgba(100,116,139,0.25)' },
  Completed: { label: 'COMPLETED', dot: '#60A5FA', bg: 'rgba(59,130,246,0.12)', color: '#60A5FA', border: 'rgba(59,130,246,0.25)'  },
  Archived:  { label: 'ARCHIVED',  dot: '#475569', bg: 'rgba(71,85,105,0.15)',  color: '#64748B', border: 'rgba(71,85,105,0.25)'   },
};

const OUTCOME_META: Record<Outcome, { color: string; hint: string }> = {
  Qualified:   { color: '#4ADE80', hint: 'Agent marked these leads as a fit' },
  Pending:     { color: '#94A3B8', hint: 'Waiting for the agent, or on a call now' },
  Unqualified: { color: '#F87171', hint: 'Agent finished and they are not a fit' },
  Other:       { color: '#FCD34D', hint: 'No answer, voicemail, callback, or a failed call' },
};

function outcomeOf(status: LeadStatus): Outcome {
  if (QUALIFIED.includes(status)) return 'Qualified';
  if (PENDING.includes(status)) return 'Pending';
  if (UNQUALIFIED.includes(status)) return 'Unqualified';
  return 'Other';
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

async function fetchAllCampaignLeads(campaignId: string): Promise<Lead[]> {
  const all: Lead[] = [];
  let page = 1;
  let hasNext = true;
  while (hasNext && page <= 50) {
    const result = await fetchLeads({
      campaign: campaignId,
      page,
      limit: 100,
      sortBy: 'fullName',
      sortOrder: 'asc',
    });
    all.push(...result.leads);
    hasNext = result.pagination?.hasNext ?? false;
    page += 1;
  }
  return all;
}

export default function CampaignWorkspacePage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filter, setFilter] = useState<OutcomeFilter>('All');
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  const [transcripts, setTranscripts] = useState<TranscriptSummary[]>([]);
  const [transcriptsLoading, setTranscriptsLoading] = useState(false);
  const [transcriptError, setTranscriptError] = useState<string | null>(null);
  const [selectedTranscriptId, setSelectedTranscriptId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptDetail | null>(null);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const transcriptGen = useRef(0);
  const [statusBusy, setStatusBusy] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Lead | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const [campaignData, leadData] = await Promise.all([
        getCampaignById(id),
        fetchAllCampaignLeads(id),
      ]);
      setCampaign(campaignData);
      setLeads(leadData);
      setSelectedLeadId((current) => {
        if (current && leadData.some((lead) => lead._id === current)) return current;
        return leadData[0]?._id ?? null;
      });
    } catch (err) {
      const status = err instanceof AuthError ? err.status : (err as { status?: number })?.status;
      if (status === 404) setNotFound(true);
      else setError(err instanceof Error ? err.message : 'Failed to load this campaign.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) load();
  }, [id, load]);

  const counts = useMemo(() => {
    const tally: Record<Outcome, number> = { Qualified: 0, Pending: 0, Unqualified: 0, Other: 0 };
    for (const lead of leads) tally[outcomeOf(lead.status)] += 1;
    return tally;
  }, [leads]);

  const visibleLeads = useMemo(
    () => (filter === 'All' ? leads : leads.filter((lead) => outcomeOf(lead.status) === filter)),
    [leads, filter],
  );

  useEffect(() => {
    if (!visibleLeads.length) {
      setSelectedLeadId(null);
      return;
    }
    setSelectedLeadId((current) => (
      current && visibleLeads.some((lead) => lead._id === current) ? current : visibleLeads[0]._id
    ));
  }, [visibleLeads]);

  const selectedLead = leads.find((lead) => lead._id === selectedLeadId) ?? null;
  const pendingCount = leads.filter((lead) => lead.status === 'Pending').length;

  const changeStatus = async (next: 'Running' | 'Paused') => {
    if (!campaign || statusBusy) return;
    const wasDraft = campaign.status === 'Draft';
    setStatusBusy(true);
    try {
      await updateCampaignStatus(id, next);
      setCampaign((prev) => (prev ? { ...prev, status: next } : prev));
      setToast({
        type: 'success',
        message: next === 'Paused'
          ? 'Campaign paused. A call already in progress will finish. No new calls will start.'
          : wasDraft
            ? 'Campaign started. The agent is calling the next pending lead.'
            : 'Campaign resumed. The agent is calling the next pending lead.',
      });
      try {
        const leadData = await fetchAllCampaignLeads(id);
        setLeads(leadData);
      } catch {
        // The status change already succeeded. The list refreshes on the next visit.
      }
    } catch (err) {
      setToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Could not update this campaign.',
      });
    } finally {
      setStatusBusy(false);
    }
  };

  const openTranscript = useCallback(async (transcriptId: string) => {
    const gen = ++transcriptGen.current;
    setSelectedTranscriptId(transcriptId);
    setTranscriptLoading(true);
    setTranscriptError(null);
    try {
      const detail = await fetchTranscriptById(transcriptId);
      if (transcriptGen.current !== gen) return;
      setTranscript(detail);
    } catch (err) {
      if (transcriptGen.current !== gen) return;
      setTranscript(null);
      setTranscriptError(err instanceof Error ? err.message : 'Failed to load this transcript.');
    } finally {
      if (transcriptGen.current === gen) setTranscriptLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedLeadId) {
      transcriptGen.current += 1;
      setTranscripts([]);
      setTranscript(null);
      setSelectedTranscriptId(null);
      setTranscriptError(null);
      return;
    }

    const gen = ++transcriptGen.current;
    setTranscriptsLoading(true);
    setTranscriptLoading(false);
    setTranscriptError(null);
    setTranscript(null);
    setTranscripts([]);
    setSelectedTranscriptId(null);

    (async () => {
      try {
        const list = await fetchLeadTranscripts(selectedLeadId);
        if (transcriptGen.current !== gen) return;
        setTranscripts(list);
        if (!list[0]) return;
        setSelectedTranscriptId(list[0]._id);
        setTranscriptLoading(true);
        const detail = await fetchTranscriptById(list[0]._id);
        if (transcriptGen.current !== gen) return;
        setTranscript(detail);
      } catch (err) {
        if (transcriptGen.current !== gen) return;
        setTranscriptError(err instanceof Error ? err.message : 'Failed to load transcripts.');
      } finally {
        if (transcriptGen.current === gen) {
          setTranscriptsLoading(false);
          setTranscriptLoading(false);
        }
      }
    })();
  }, [selectedLeadId]);

  if (loading) {
    return <PageLoader minHeight="calc(100vh - 120px)" label="Loading campaign…" />;
  }

  if (notFound) {
    return (
      <CenterState
        title="Campaign not found"
        message="This campaign may have been removed."
        actionLabel="Back to Campaigns"
        onAction={() => router.push('/dashboard/campaigns')}
      />
    );
  }

  if (error || !campaign) {
    return (
      <CenterState
        title="Could not load campaign"
        message={error ?? 'Something went wrong.'}
        actionLabel="Retry"
        onAction={load}
        isError
      />
    );
  }

  const status = STATUS_CONFIG[campaign.status] ?? STATUS_CONFIG.Draft;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: 'calc(100vh - 64px)', minHeight: 560,
      padding: 20, gap: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexShrink: 0 }}>
        <div style={{ minWidth: 0 }}>
          <button
            onClick={() => router.push('/dashboard/campaigns')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8,
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#64748B', fontSize: 12, fontWeight: 500, padding: 0,
            }}
          >
            <ArrowLeft size={13} strokeWidth={2} /> Campaigns
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ color: '#F8FAFC', fontSize: 20, fontWeight: 600, margin: 0 }}>{campaign.name}</h2>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '3px 8px', borderRadius: 99,
              background: status.bg, border: `1px solid ${status.border}`,
              color: status.color, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: status.dot }} />
              {status.label}
            </span>
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
              background: 'rgba(59,130,246,0.12)', color: '#60A5FA',
            }}>
              {campaign.tone}
            </span>
          </div>
          <p style={{ color: '#64748B', fontSize: 12.5, margin: '6px 0 0', maxWidth: 720, lineHeight: 1.5 }}>
            {campaign.goal}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
          {campaign.status === 'Running' && (
            <HeaderButton
              icon={statusBusy ? <Spinner size={12} color="#FCD34D" /> : <Pause size={12} strokeWidth={2} />}
              label="Pause"
              tone="pause"
              disabled={statusBusy}
              title="Stop new calls. A call already in progress will finish."
              onClick={() => changeStatus('Paused')}
            />
          )}
          {(campaign.status === 'Paused' || campaign.status === 'Draft') && (
            <HeaderButton
              icon={statusBusy ? <Spinner size={12} color="#4ADE80" /> : <Play size={12} strokeWidth={2} />}
              label={campaign.status === 'Paused' ? 'Resume' : 'Start'}
              tone="run"
              disabled={statusBusy || pendingCount === 0}
              title={pendingCount === 0
                ? 'No pending leads left to call.'
                : 'The agent calls the next pending lead.'}
              onClick={() => changeStatus('Running')}
            />
          )}
          <HeaderButton
            icon={<Upload size={12} strokeWidth={2} />}
            label="Import"
            onClick={() => setImportOpen(true)}
          />
          <HeaderButton
            icon={<Settings size={12} strokeWidth={2} />}
            label="Settings"
            onClick={() => router.push(`/dashboard/campaigns/${id}/settings`)}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
        <OutcomeChip
          label="All"
          count={leads.length}
          active={filter === 'All'}
          color="#60A5FA"
          onClick={() => setFilter('All')}
        />
        {(Object.keys(OUTCOME_META) as Outcome[]).map((key) => (
          <OutcomeChip
            key={key}
            label={key}
            count={counts[key]}
            active={filter === key}
            color={OUTCOME_META[key].color}
            onClick={() => setFilter(key)}
          />
        ))}
      </div>

      <div style={{
        flex: 1, minHeight: 0,
        display: 'grid',
        gridTemplateColumns: 'minmax(280px, 380px) minmax(0, 1fr)',
        gap: 16,
      }}>
        <section style={{
          minHeight: 0, overflow: 'auto',
          borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)',
          background: '#111827',
        }}>
          <div style={{
            position: 'sticky', top: 0, zIndex: 1,
            padding: '12px 14px',
            background: '#111827',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            color: '#94A3B8', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em',
          }}>
            {visibleLeads.length} lead{visibleLeads.length === 1 ? '' : 's'}
            {filter !== 'All' ? ` · ${filter}` : ''}
          </div>
          {visibleLeads.length === 0 ? (
            <p style={{ color: '#475569', fontSize: 12.5, padding: 18, margin: 0 }}>
              {leads.length === 0
                ? 'No leads in this campaign yet. Import a list to give the agent people to call.'
                : 'No leads in this group.'}
            </p>
          ) : (
            visibleLeads.map((lead) => {
              const selected = lead._id === selectedLeadId;
              const onCall = lead.status === 'Calling';
              return (
                <div
                  key={lead._id}
                  style={{
                    display: 'flex', alignItems: 'stretch',
                    background: selected ? 'rgba(59,130,246,0.08)' : 'transparent',
                    borderLeft: selected ? '2px solid #3B82F6' : '2px solid transparent',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                  }}
                >
                <button
                  onClick={() => setSelectedLeadId(lead._id)}
                  style={{
                    display: 'block', flex: 1, minWidth: 0, textAlign: 'left',
                    padding: '12px 8px 12px 12px', cursor: 'pointer',
                    background: 'transparent', border: 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ color: '#F1F5F9', fontSize: 13, fontWeight: 600 }}>{lead.fullName}</span>
                    <span style={{ color: '#64748B', fontSize: 11, fontWeight: 600 }}>
                      {lead.qualificationScore == null ? '—' : lead.qualificationScore}
                    </span>
                  </div>
                  {(lead.company || lead.jobTitle) && (
                    <div style={{ color: '#475569', fontSize: 11.5, marginTop: 3 }}>
                      {[lead.company, lead.jobTitle].filter(Boolean).join(' · ')}
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8 }}>
                    <LeadStatusBadge status={lead.status} />
                    <span style={{ color: '#334155', fontSize: 10.5 }}>{lead.phone}</span>
                  </div>
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${lead.fullName}`}
                  title={onCall ? 'This lead is on a call.' : 'Delete lead'}
                  disabled={onCall}
                  onClick={() => {
                    setDeleteError(null);
                    setDeleteTarget(lead);
                  }}
                  style={{
                    alignSelf: 'center', marginRight: 8,
                    width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '1px solid rgba(248,113,113,0.25)',
                    background: 'rgba(239,68,68,0.08)',
                    color: '#F87171',
                    cursor: onCall ? 'not-allowed' : 'pointer',
                    opacity: onCall ? 0.4 : 1,
                  }}
                >
                  <Trash2 size={13} />
                </button>
                </div>
              );
            })
          )}
        </section>

        <section style={{
          minHeight: 0, overflow: 'auto',
          borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)',
          background: '#111827', padding: 18,
        }}>
          {!selectedLead ? (
            <EmptyDetail
              title="Select a lead"
              message="Their status and conversation stay on this page."
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <h3 style={{ color: '#F8FAFC', fontSize: 16, fontWeight: 600, margin: 0 }}>{selectedLead.fullName}</h3>
                  <p style={{ color: '#64748B', fontSize: 12, margin: '4px 0 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Phone size={11} strokeWidth={2} />
                    {selectedLead.phone}
                    {selectedLead.company ? ` · ${selectedLead.company}` : ''}
                    {selectedLead.jobTitle ? ` · ${selectedLead.jobTitle}` : ''}
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <LeadStatusBadge status={selectedLead.status} />
                  <button
                    type="button"
                    disabled={selectedLead.status === 'Calling'}
                    title={selectedLead.status === 'Calling' ? 'This lead is on a call.' : 'Delete lead'}
                    onClick={() => {
                      setDeleteError(null);
                      setDeleteTarget(selectedLead);
                    }}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '5px 9px', borderRadius: 7,
                      border: '1px solid rgba(248,113,113,0.25)',
                      background: 'rgba(239,68,68,0.08)',
                      color: '#F87171', fontSize: 11, fontWeight: 600,
                      cursor: selectedLead.status === 'Calling' ? 'not-allowed' : 'pointer',
                      opacity: selectedLead.status === 'Calling' ? 0.4 : 1,
                    }}
                  >
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
              </div>

              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8,
              }}>
                <Fact label="Score" value={selectedLead.qualificationScore == null ? 'Not scored' : String(selectedLead.qualificationScore)} />
                <Fact label="Calls" value={String(selectedLead.totalCallAttempts)} />
                <Fact label="Group" value={outcomeOf(selectedLead.status)} />
              </div>

              <p style={{ color: '#94A3B8', fontSize: 12.5, lineHeight: 1.55, margin: 0 }}>
                {selectedLead.qualificationReason
                  || (outcomeOf(selectedLead.status) === 'Pending'
                    ? 'The agent has not finished with this lead yet.'
                    : 'No qualification note yet.')}
              </p>

              <div>
                <div style={{ color: '#CBD5E1', fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
                  Conversations
                </div>
                {transcriptsLoading && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#64748B', fontSize: 12 }}>
                    <Spinner size={14} /> Loading conversations…
                  </div>
                )}
                {!transcriptsLoading && transcripts.length === 0 && !transcriptError && (
                  <EmptyDetail
                    title="No conversation yet"
                    message={outcomeOf(selectedLead.status) === 'Pending'
                      ? 'This lead is still waiting. The transcript will show here after the agent calls.'
                      : 'The agent has no saved transcript for this lead.'}
                  />
                )}
                {transcripts.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {transcripts.map((item, index) => {
                      const active = item._id === selectedTranscriptId;
                      return (
                        <button
                          key={item._id}
                          onClick={() => openTranscript(item._id)}
                          style={{
                            textAlign: 'left', cursor: 'pointer',
                            padding: '8px 10px', borderRadius: 8,
                            background: active ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.03)',
                            border: active ? '1px solid rgba(59,130,246,0.35)' : '1px solid rgba(255,255,255,0.06)',
                            color: '#CBD5E1',
                          }}
                        >
                          <div style={{ fontSize: 11.5, fontWeight: 600 }}>
                            {item.callType} · {formatWhen(item.callDate)}
                          </div>
                          <div style={{ fontSize: 10.5, color: '#64748B', marginTop: 2 }}>
                            Call {transcripts.length - index} · {formatDuration(item.durationSeconds)} · {item.messageCount} messages
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {transcriptError && (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                  padding: '10px 12px', borderRadius: 8,
                  background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                  color: '#FCA5A5', fontSize: 12,
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <AlertCircle size={14} /> {transcriptError}
                  </span>
                  {selectedTranscriptId && (
                    <button
                      onClick={() => openTranscript(selectedTranscriptId)}
                      style={{
                        background: 'none', border: 'none', color: '#FCA5A5',
                        cursor: 'pointer', fontSize: 12, fontWeight: 600,
                      }}
                    >
                      Retry
                    </button>
                  )}
                </div>
              )}

              {transcriptLoading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#64748B', fontSize: 12 }}>
                  <Spinner size={14} /> Loading transcript…
                </div>
              )}

              {transcript && !transcriptLoading && <TranscriptViewer transcript={transcript} />}
            </div>
          )}
        </section>
      </div>
      {importOpen && campaign && (
        <ImportLeadsDialog
          campaignId={id}
          campaignName={campaign.name}
          onClose={() => setImportOpen(false)}
          onImported={() => { load(); }}
          onViewLeads={() => {
            setImportOpen(false);
            setFilter('All');
            load();
          }}
        />
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
              setToast({ type: 'success', message: `${deleteTarget.fullName} was deleted.` });
              setDeleteTarget(null);
              await load();
            } catch (err) {
              setDeleteError(err instanceof Error ? err.message : 'Could not delete this lead.');
            } finally {
              setDeleteBusy(false);
            }
          }}
        />
      )}
      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
          duration={5500}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  );
}

function OutcomeChip({
  label, count, active, color, onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '7px 12px', borderRadius: 999, cursor: 'pointer',
        background: active ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)',
        border: active ? `1px solid ${color}` : '1px solid rgba(255,255,255,0.07)',
        color: active ? '#F8FAFC' : '#94A3B8',
        fontSize: 12, fontWeight: 600,
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />
      {label}
      <span style={{ color: active ? color : '#64748B', fontVariantNumeric: 'tabular-nums' }}>{count}</span>
    </button>
  );
}

function HeaderButton({
  icon, label, onClick, tone = 'neutral', disabled = false, title,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  tone?: 'neutral' | 'pause' | 'run';
  disabled?: boolean;
  title?: string;
}) {
  const tones = {
    neutral: { background: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.08)', color: '#CBD5E1' },
    pause: { background: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.28)', color: '#FCD34D' },
    run: { background: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.28)', color: '#4ADE80' },
  } as const;
  const toneStyle = tones[tone];

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '7px 12px', borderRadius: 8,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        background: toneStyle.background,
        border: `1px solid ${toneStyle.border}`,
        color: toneStyle.color, fontSize: 12, fontWeight: 600,
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      padding: '10px 12px', borderRadius: 8,
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.05)',
    }}>
      <div style={{ color: '#475569', fontSize: 10, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ color: '#F1F5F9', fontSize: 13, fontWeight: 600, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function EmptyDetail({ title, message }: { title: string; message: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '28px 16px', gap: 8, textAlign: 'center',
      borderRadius: 10, border: '1px dashed rgba(255,255,255,0.08)',
    }}>
      <MessagesSquare size={16} strokeWidth={1.75} color="#475569" />
      <p style={{ color: '#CBD5E1', fontSize: 13, fontWeight: 600, margin: 0 }}>{title}</p>
      <p style={{ color: '#475569', fontSize: 12, margin: 0, maxWidth: 360 }}>{message}</p>
    </div>
  );
}

function CenterState({
  title, message, actionLabel, onAction, isError,
}: {
  title: string;
  message: string;
  actionLabel: string;
  onAction: () => void;
  isError?: boolean;
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '80px 20px', gap: 12,
    }}>
      <AlertCircle size={20} strokeWidth={1.5} color={isError ? '#F87171' : '#64748B'} />
      <div style={{ textAlign: 'center' }}>
        <p style={{ color: '#CBD5E1', fontSize: 13, fontWeight: 600, margin: 0 }}>{title}</p>
        <p style={{ color: '#475569', fontSize: 12, marginTop: 4 }}>{message}</p>
      </div>
      <button
        onClick={onAction}
        style={{
          marginTop: 8, display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
          background: isError ? 'rgba(239,68,68,0.12)' : '#2563EB',
          border: isError ? '1px solid rgba(239,68,68,0.25)' : '1px solid transparent',
          color: isError ? '#F87171' : '#fff', fontSize: 12, fontWeight: 600,
        }}
      >
        {isError && <RefreshCw size={12} />}
        {actionLabel}
      </button>
    </div>
  );
}
