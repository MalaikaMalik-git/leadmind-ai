'use client';

// ─────────────────────────────────────────────
//  LeadMind AI — Lead Detail Page
//  Day 13 · Session 2 — Shell, info card, status dropdown, admin notes
//  Day 13 · Session 3 — Call history timeline + transcript links (THIS SESSION)
//  UC-07  View Leads & Statuses
//
//  "Admin selects a particular lead. System shows the details of the
//  lead, including the call, outcome, and meeting link (if booked)."
//
//  Session 3 scope: renders the callLogs/meeting that were already being
//  fetched (and held in state, unused) since Session 2 — no new request
//  needed, just wiring CallHistoryTimeline into the layout below.
//
//  States handled: loading (skeleton) · 404 (not found) · error
//  (banner + retry) · data (info card + notes + call history).
// ─────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, AlertCircle, RefreshCw, UserX } from 'lucide-react';

import { fetchLeadById, updateLead, LeadDetail, LeadStatus } from '@/src/lib/api/leads';
import LeadInfoCard from '@/src/components/leads/LeadInfoCard';
import AdminNotesPanel from '@/src/components/leads/AdminNotesPanel';
import CallHistoryTimeline from '@/src/components/leads/CallHistoryTimeline';
import SkeletonCard from '@/src/components/ui/SkeletonCard';
import Toast, { ToastState } from '@/src/components/ui/Toast';

export default function LeadDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [detail, setDetail] = useState<LeadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isSavingStatus, setIsSavingStatus] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  // ── Fetch lead detail ─────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const data = await fetchLeadById(id);
      setDetail(data);
    } catch (err: any) {
      if (err?.status === 404) {
        setNotFound(true);
      } else {
        setError(err?.message ?? 'Failed to load lead. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) load();
  }, [id, load]);

  // ── Manual status change (UC-07) ──────────────
  const handleStatusChange = async (status: LeadStatus) => {
    if (!detail || status === detail.lead.status) return;
    setIsSavingStatus(true);
    try {
      const updatedLead = await updateLead(id, { status });
      setDetail((prev) => (prev ? { ...prev, lead: updatedLead } : prev));
      setToast({ type: 'success', message: `Status updated to "${status}".` });
    } catch (err: any) {
      setToast({ type: 'error', message: err?.message ?? 'Failed to update status.' });
    } finally {
      setIsSavingStatus(false);
    }
  };

  // ── Admin notes save ───────────────────────────
  const handleNotesSave = async (notes: string) => {
    const updatedLead = await updateLead(id, { adminNotes: notes });
    setDetail((prev) => (prev ? { ...prev, lead: updatedLead } : prev));
    setToast({ type: 'success', message: 'Notes saved.' });
  };

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 900 }}>
      {/* ── Back link ────────────────────────────── */}
      <button
        onClick={() => router.push('/dashboard/leads')}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#64748B', fontSize: 12.5, fontWeight: 500, padding: 0,
        }}
      >
        <ArrowLeft size={13} strokeWidth={2} /> Back to Leads
      </button>

      {/* ── Loading state ────────────────────────── */}
      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <SkeletonCard height={130} lines={3} />
          <SkeletonCard height={140} lines={2} />
        </div>
      )}

      {/* ── Not found ─────────────────────────────── */}
      {!loading && notFound && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '60px 20px', gap: 12, borderRadius: 12,
          border: '1px dashed rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.015)',
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: '50%', background: 'rgba(239,68,68,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <UserX size={20} strokeWidth={1.5} color="#F87171" />
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: '#CBD5E1', fontSize: 13, fontWeight: 600, margin: 0 }}>Lead not found</p>
            <p style={{ color: '#475569', fontSize: 12, marginTop: 4 }}>
              It may have been deleted, or the link is incorrect.
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
      {!loading && error && (
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
            onClick={load}
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
      {!loading && !notFound && !error && detail && (
        <>
          <LeadInfoCard
            lead={detail.lead}
            isSavingStatus={isSavingStatus}
            onStatusChange={handleStatusChange}
          />

          <AdminNotesPanel notes={detail.lead.adminNotes} onSave={handleNotesSave} />

          <CallHistoryTimeline callLogs={detail.callLogs} meeting={detail.meeting} />
        </>
      )}

      {toast && (
        <Toast type={toast.type} message={toast.message} onDismiss={() => setToast(null)} />
      )}
    </div>
  );
}