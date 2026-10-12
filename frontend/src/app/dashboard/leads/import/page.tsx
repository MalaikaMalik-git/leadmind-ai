'use client';

// ─────────────────────────────────────────────
//  LeadMind AI — Upload Leads Page
//  Day 12 · Sessions 2–3
//  UC-04  Upload Lead List (CSV)
//
//  Flow:
//   1. 'select-campaign' — only shown if no ?campaignId= in the URL
//   2. 'select-file'     — CsvDropzone
//   3. 'preview'         — CsvPreviewTable + DuplicateStrategySelector + Submit
//   4. 'result'          — ImportResultPanel
//
//  Session 3 adds the ImportHistoryPanel sidebar (right column), which
//  refetches whenever historyRefreshKey changes — bumped right after a
//  successful import so the new batch appears without a manual reload.
//
//  Client-side parsing (papaparse) is used ONLY to build the preview —
//  the actual import re-parses and re-validates server-side (Day 11), which
//  remains the single source of truth. If the two ever disagreed, the
//  server's result wins; the preview is just a courtesy.
// ─────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Papa from 'papaparse';
import { PageLoader } from '@/src/components/ui/Spinner';
import { AlertCircle, ArrowLeft, ChevronRight, Loader2 } from 'lucide-react';

import CsvDropzone from '@/src/components/leads/CsvDropzone';
import CsvPreviewTable from '@/src/components/leads/CsvPreviewTable';
import DuplicateStrategySelector from '@/src/components/leads/DuplicateStrategySelector';
import ImportResultPanel from '@/src/components/leads/ImportResultPanel';
import ImportHistoryPanel from '@/src/components/leads/ImportHistoryPanel';
import { detectColumnMapping, hasRequiredColumns } from '@/src/lib/utils/csvColumnMapping';
import { importLeads, DuplicateStrategy, ImportSummary, ImportFailedRow } from '@/src/lib/api/leads';
import { fetchCampaigns } from '@/src/lib/api/campaigns';
import { Campaign } from '@/src/components/campaigns/CampaignCard';

type Stage = 'select-campaign' | 'select-file' | 'preview' | 'result';

interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

export default function ImportLeadsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const campaignIdFromUrl = searchParams.get('campaignId');

  const [campaignId, setCampaignId] = useState<string | null>(campaignIdFromUrl);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(false);

  const [stage, setStage] = useState<Stage>(campaignIdFromUrl ? 'select-file' : 'select-campaign');
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [missingColumnsWarning, setMissingColumnsWarning] = useState(false);

  const [duplicateStrategy, setDuplicateStrategy] = useState<DuplicateStrategy>('skip');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [result, setResult] = useState<{ summary: ImportSummary; failedRows: ImportFailedRow[] } | null>(null);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  // ── If no campaignId in URL, let the admin pick one first ─────────────
  useEffect(() => {
    if (stage !== 'select-campaign') return;
    setCampaignsLoading(true);
    fetchCampaigns({ limit: 100 })
      .then(({ campaigns: data }) => setCampaigns(data))
      .catch(() => setCampaigns([]))
      .finally(() => setCampaignsLoading(false));
  }, [stage]);

  const handleSelectCampaign = (id: string) => {
    setCampaignId(id);
    setStage('select-file');
  };

  // ── Parse the file client-side, purely for the preview ─────────────────
  const handleFileSelected = useCallback((selectedFile: File) => {
    setFile(selectedFile);
    setParseError(null);

    Papa.parse<Record<string, string>>(selectedFile, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (!results.data || results.data.length === 0) {
          setParseError('This file appears to be empty or contains no data rows.');
          return;
        }
        const headers = results.meta.fields ?? [];
        setMissingColumnsWarning(!hasRequiredColumns(headers));
        setParsed({ headers, rows: results.data });
        setStage('preview');
      },
      error: (err) => {
        setParseError(`Could not read this CSV file: ${err.message}`);
      },
    });
  }, []);

  const handleReset = () => {
    setFile(null);
    setParsed(null);
    setParseError(null);
    setResult(null);
    setSubmitError(null);
    setDuplicateStrategy('skip');
    setStage('select-file');
  };

  const handleSubmit = async () => {
    if (!file || !campaignId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await importLeads(campaignId, file, duplicateStrategy);
      setResult(res);
      setStage('result');
      setHistoryRefreshKey((k) => k + 1);
    } catch (err: any) {
      setSubmitError(err?.message ?? 'Import failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1080 }}>

      {/* ── Page header ──────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          onClick={() => router.push('/dashboard/campaigns')}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 30, height: 30, borderRadius: 8, cursor: 'pointer',
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <ArrowLeft size={14} color="#94A3B8" />
        </button>
        <div>
          <h2 style={{ color: '#F8FAFC', fontSize: 18, fontWeight: 700, margin: 0 }}>Upload Leads</h2>
          <p style={{ color: '#475569', fontSize: 12, marginTop: 3 }}>
            Import a CSV of leads into this campaign
          </p>
        </div>
      </div>

      {/* ── Two-column body: main card + import history sidebar ────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: stage === 'select-campaign' ? '1fr' : '1fr 280px',
        gap: 20, alignItems: 'start',
      }}>

        {/* ── Content card ─────────────────────── */}
        <div style={{
          background: '#111827', border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 12, padding: 24,
        }}>

          {/* Stage 1: pick a campaign (only if URL didn't give us one) */}
          {stage === 'select-campaign' && (
            <CampaignPicker
              campaigns={campaigns}
              loading={campaignsLoading}
              onSelect={handleSelectCampaign}
            />
          )}

          {/* Stage 2: choose file */}
          {stage === 'select-file' && (
            <div>
              <CsvDropzone onFileSelected={handleFileSelected} />
              {parseError && (
                <div style={{
                  marginTop: 12, display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 14px', borderRadius: 8,
                  background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                }}>
                  <AlertCircle size={14} color="#F87171" />
                  <span style={{ fontSize: 12, color: '#F87171' }}>{parseError}</span>
                </div>
              )}
            </div>
          )}

          {/* Stage 3: preview + strategy + submit */}
          {stage === 'preview' && parsed && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {missingColumnsWarning && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 14px', borderRadius: 8,
                  background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
                }}>
                  <AlertCircle size={14} color="#F59E0B" />
                  <span style={{ fontSize: 12, color: '#F59E0B' }}>
                    We couldn&apos;t confidently detect a Full Name and/or Phone column in this file.
                    You can still try importing — the server will give an exact error if something&apos;s missing.
                  </span>
                </div>
              )}

              <CsvPreviewTable
                headers={parsed.headers}
                columnMapping={detectColumnMapping(parsed.headers)}
                previewRows={parsed.rows.slice(0, 5)}
                totalRows={parsed.rows.length}
              />

              <DuplicateStrategySelector
                value={duplicateStrategy}
                onChange={setDuplicateStrategy}
                disabled={submitting}
              />

              {submitError && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 14px', borderRadius: 8,
                  background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                }}>
                  <AlertCircle size={14} color="#F87171" />
                  <span style={{ fontSize: 12, color: '#F87171' }}>{submitError}</span>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
                <SecondaryBtn label="Choose Different File" onClick={handleReset} disabled={submitting} />
                <PrimaryBtn
                  label={submitting ? 'Importing…' : 'Import Leads'}
                  icon={submitting ? <Loader2 size={13} className="animate-spin" /> : <ChevronRight size={13} />}
                  onClick={handleSubmit}
                  disabled={submitting}
                />
              </div>
            </div>
          )}

          {/* Stage 4: result */}
          {stage === 'result' && result && (
            <ImportResultPanel
              summary={result.summary}
              failedRows={result.failedRows}
              onImportAnother={handleReset}
              onViewLeads={() => router.push(campaignId ? `/dashboard/campaigns/${campaignId}` : '/dashboard/leads')}
            />
          )}
        </div>

        {/* ── Import History sidebar — only once we know which campaign ── */}
        {stage !== 'select-campaign' && campaignId && (
          <ImportHistoryPanel campaignId={campaignId} refreshKey={historyRefreshKey} />
        )}
      </div>
    </div>
  );
}

// ── Campaign picker (fallback when no ?campaignId in URL) ──────────────
function CampaignPicker({
  campaigns, loading, onSelect,
}: { campaigns: Campaign[]; loading: boolean; onSelect: (id: string) => void }) {
  if (loading) {
    return <PageLoader minHeight={120} size={22} label="Loading your campaigns…" />;
  }

  if (campaigns.length === 0) {
    return (
      <p style={{ color: '#64748B', fontSize: 12 }}>
        You don&apos;t have any campaigns yet. Create one first, then come back to upload leads.
      </p>
    );
  }

  return (
    <div>
      <p style={{ color: '#94A3B8', fontSize: 11, fontWeight: 600, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.4 }}>
        Select a Campaign to Import Into
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {campaigns.map((c) => (
          <button
            key={c._id}
            onClick={() => onSelect(c._id)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
              background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
            }}
          >
            <span style={{ color: '#CBD5E1', fontSize: 13, fontWeight: 500 }}>{c.name}</span>
            <span style={{ color: '#475569', fontSize: 11 }}>{c.status}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Small local buttons (kept local since these are the only two here) ──
function PrimaryBtn({ label, icon, onClick, disabled }: {
  label: string; icon: React.ReactNode; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '9px 18px', borderRadius: 8,
        border: '1px solid transparent',
        background: disabled ? '#1E3A5F' : '#2563EB',
        color: disabled ? '#4B6A8F' : '#fff',
        fontSize: 12, fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        boxShadow: disabled ? 'none' : '0 2px 12px rgba(37,99,235,0.35)',
      }}
    >
      {label}{icon}
    </button>
  );
}

function SecondaryBtn({ label, onClick, disabled }: {
  label: string; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '9px 16px', borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.1)',
        background: 'rgba(255,255,255,0.03)',
        color: disabled ? '#334155' : '#94A3B8',
        fontSize: 12, fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {label}
    </button>
  );
}