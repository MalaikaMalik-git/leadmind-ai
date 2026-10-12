'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import Papa from 'papaparse';
import { AlertCircle, ChevronRight, Loader2, X } from 'lucide-react';

import CsvDropzone from '@/src/components/leads/CsvDropzone';
import CsvPreviewTable from '@/src/components/leads/CsvPreviewTable';
import DuplicateStrategySelector from '@/src/components/leads/DuplicateStrategySelector';
import ImportResultPanel from '@/src/components/leads/ImportResultPanel';
import { detectColumnMapping, hasRequiredColumns } from '@/src/lib/utils/csvColumnMapping';
import { DuplicateStrategy, ImportFailedRow, ImportSummary, importLeads } from '@/src/lib/api/leads';

interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

type Stage = 'select-file' | 'preview' | 'result';

interface Props {
  campaignId: string;
  campaignName: string;
  onClose: () => void;
  onImported?: () => void;
  onViewLeads: () => void;
}

export default function ImportLeadsDialog({
  campaignId, campaignName, onClose, onImported, onViewLeads,
}: Props) {
  const [stage, setStage] = useState<Stage>('select-file');
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [missingColumnsWarning, setMissingColumnsWarning] = useState(false);
  const [duplicateStrategy, setDuplicateStrategy] = useState<DuplicateStrategy>('skip');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<{ summary: ImportSummary; failedRows: ImportFailedRow[] } | null>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !submitting) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, submitting]);

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
      error: (err) => setParseError(`Could not read this CSV file: ${err.message}`),
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
    if (!file) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const imported = await importLeads(campaignId, file, duplicateStrategy);
      setResult(imported);
      setStage('result');
      onImported?.();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Import failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-leads-title"
      onClick={() => !submitting && onClose()}
      style={{
        position: 'fixed', inset: 0, zIndex: 70,
        background: 'rgba(2,6,23,0.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: '100%', maxWidth: 860, maxHeight: 'min(920px, calc(100vh - 40px))',
          overflow: 'auto',
          background: '#0F172A',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 14,
          boxShadow: '0 24px 80px rgba(0,0,0,0.45)',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
          padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div>
            <h2 id="import-leads-title" style={{ color: '#F8FAFC', fontSize: 16, fontWeight: 650, margin: 0 }}>
              Import leads
            </h2>
            <p style={{ color: '#64748B', fontSize: 12, margin: '4px 0 0' }}>
              These leads are added to {campaignName} only.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
            style={{
              width: 30, height: 30, borderRadius: 8, cursor: submitting ? 'not-allowed' : 'pointer',
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
              color: '#94A3B8', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={14} />
          </button>
        </div>

        <div style={{ padding: 18 }}>
          {stage === 'select-file' && (
            <div>
              <CsvDropzone onFileSelected={handleFileSelected} />
              {parseError && <Notice color="#F87171" border="rgba(239,68,68,0.2)" background="rgba(239,68,68,0.08)" text={parseError} />}
            </div>
          )}

          {stage === 'preview' && parsed && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {missingColumnsWarning && (
                <Notice
                  color="#F59E0B"
                  border="rgba(245,158,11,0.2)"
                  background="rgba(245,158,11,0.08)"
                  text="A Full Name or Phone column was not detected. You can still import. The server will reject a row that is missing either one."
                />
              )}
              <CsvPreviewTable
                headers={parsed.headers}
                columnMapping={detectColumnMapping(parsed.headers)}
                previewRows={parsed.rows.slice(0, 5)}
                totalRows={parsed.rows.length}
              />
              <DuplicateStrategySelector value={duplicateStrategy} onChange={setDuplicateStrategy} disabled={submitting} />
              {submitError && <Notice color="#F87171" border="rgba(239,68,68,0.2)" background="rgba(239,68,68,0.08)" text={submitError} />}
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <button type="button" onClick={handleReset} disabled={submitting} style={secondaryBtn(submitting)}>
                  Choose a different file
                </button>
                <button type="button" onClick={handleSubmit} disabled={submitting} style={primaryBtn(submitting)}>
                  {submitting ? 'Importing…' : 'Import leads'}
                  {submitting ? <Loader2 size={13} className="animate-spin" /> : <ChevronRight size={13} />}
                </button>
              </div>
            </div>
          )}

          {stage === 'result' && result && (
            <ImportResultPanel
              summary={result.summary}
              failedRows={result.failedRows}
              onImportAnother={handleReset}
              onViewLeads={onViewLeads}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Notice({ text, color, border, background }: { text: string; color: string; border: string; background: string }) {
  return (
    <div style={{
      marginTop: 12, display: 'flex', alignItems: 'flex-start', gap: 8,
      padding: '10px 14px', borderRadius: 8, background, border: `1px solid ${border}`,
    }}>
      <AlertCircle size={14} color={color} style={{ marginTop: 1, flexShrink: 0 }} />
      <span style={{ fontSize: 12, color, lineHeight: 1.45 }}>{text}</span>
    </div>
  );
}

function primaryBtn(disabled: boolean): CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '9px 16px', borderRadius: 8, border: '1px solid transparent',
    background: disabled ? '#1E3A5F' : '#2563EB',
    color: disabled ? '#4B6A8F' : '#fff',
    fontSize: 12, fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
}

function secondaryBtn(disabled: boolean): CSSProperties {
  return {
    padding: '9px 16px', borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.03)',
    color: disabled ? '#334155' : '#94A3B8',
    fontSize: 12, fontWeight: 500,
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
}
