'use client';

// ─────────────────────────────────────────────
//  LeadMind AI — Transcripts Page
//  Day 19 · Session 2 (THIS SESSION)
//  UC-08  View Call Transcript
//
//  Reached via CallHistoryTimeline's "View Transcript" button (Day 13),
//  which links here as /dashboard/transcripts?transcriptId=<id>. Day 13's
//  component comment said "the Day 19 page just needs to read the param
//  when it lands" — this is that page.
//
//  A unified Calls page with its own list/filter UI (so this page would
//  also be reachable without a transcriptId already in hand) is Day 20
//  scope, not this session — visiting without a transcriptId shows a
//  focused empty state pointing back to where transcripts are opened from
//  today, rather than a lookalike list this session doesn't own the
//  correctness of.
//
//  States handled: no transcriptId (empty state) · loading (skeleton) ·
//  404 (not found) · error (banner + retry) · loaded (metadata + chat).
// ─────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft, AlertCircle, RefreshCw, FileX, MessagesSquare } from 'lucide-react';

import { fetchTranscriptById, TranscriptDetail } from '@/src/lib/api/transcripts';
import { AuthError } from '@/src/types/auth';
import TranscriptViewer from '@/src/components/transcripts/TranscriptViewer';
import SkeletonCard from '@/src/components/ui/SkeletonCard';

export default function TranscriptsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const transcriptId = searchParams?.get('transcriptId');

  const [transcript, setTranscript] = useState<TranscriptDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const data = await fetchTranscriptById(id);
      setTranscript(data);
    } catch (err) {
      if (err instanceof AuthError && err.status === 404) {
        setNotFound(true);
      } else {
        const message = err instanceof AuthError ? err.message : 'Failed to load transcript. Please try again.';
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (transcriptId) load(transcriptId);
  }, [transcriptId, load]);

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 900 }}>
      {/* ── Back link ────────────────────────────── */}
      <button
        onClick={() => (transcript ? router.push(`/dashboard/leads/${transcript.lead._id}`) : router.push('/dashboard/leads'))}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#64748B', fontSize: 12.5, fontWeight: 500, padding: 0,
        }}
      >
        <ArrowLeft size={13} strokeWidth={2} /> {transcript ? `Back to ${transcript.lead.fullName}` : 'Back to Leads'}
      </button>

      <div>
        <h2 style={{ color: '#F1F5F9', fontSize: 19, fontWeight: 600, margin: 0 }}>Call Transcript</h2>
        <p style={{ color: '#64748B', fontSize: 12.5, marginTop: 4 }}>
          Full conversation between the AI agent and the lead.
        </p>
      </div>

      {/* ── No transcript selected ───────────────── */}
      {!transcriptId && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '60px 20px', gap: 12, borderRadius: 12,
          border: '1px dashed rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.015)',
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: '50%', background: 'rgba(59,130,246,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <MessagesSquare size={20} strokeWidth={1.5} color="#60A5FA" />
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: '#CBD5E1', fontSize: 13, fontWeight: 600, margin: 0 }}>No transcript selected</p>
            <p style={{ color: '#475569', fontSize: 12, marginTop: 4, maxWidth: 360 }}>
              Open a lead and click &quot;View Transcript&quot; on one of their calls to see the full conversation here.
            </p>
          </div>
          <button
            onClick={() => router.push('/dashboard/leads')}
            style={{
              marginTop: 8, padding: '8px 16px', borderRadius: 8,
              background: '#2563EB', color: '#fff', fontSize: 12, fontWeight: 600,
              border: 'none', cursor: 'pointer',
            }}
          >
            Go to Leads
          </button>
        </div>
      )}

      {/* ── Loading state ────────────────────────── */}
      {transcriptId && loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <SkeletonCard height={110} lines={2} />
          <SkeletonCard height={260} lines={4} />
        </div>
      )}

      {/* ── Not found ─────────────────────────────── */}
      {transcriptId && !loading && notFound && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '60px 20px', gap: 12, borderRadius: 12,
          border: '1px dashed rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.015)',
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: '50%', background: 'rgba(239,68,68,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <FileX size={20} strokeWidth={1.5} color="#F87171" />
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: '#CBD5E1', fontSize: 13, fontWeight: 600, margin: 0 }}>Transcript not found</p>
            <p style={{ color: '#475569', fontSize: 12, marginTop: 4 }}>
              It may have been removed, or you don&apos;t have access to it.
            </p>
          </div>
          <button
            onClick={() => router.push('/dashboard/leads')}
            style={{
              marginTop: 8, padding: '8px 16px', borderRadius: 8,
              background: '#2563EB', color: '#fff', fontSize: 12, fontWeight: 600,
              border: 'none', cursor: 'pointer',
            }}
          >
            Back to Leads
          </button>
        </div>
      )}

      {/* ── Error banner ──────────────────────────── */}
      {transcriptId && !loading && error && (
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
            onClick={() => load(transcriptId)}
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

      {/* ── Loaded state ──────────────────────────── */}
      {transcriptId && !loading && !notFound && !error && transcript && (
        <TranscriptViewer transcript={transcript} />
      )}
    </div>
  );
}