'use client';

// ─────────────────────────────────────────────
//  LeadMind AI — Archive / Delete Campaign dialog
//
//  Production-style two-step "delete":
//   • Archive (recommended) — reversible; every lead, call, transcript and
//     meeting is kept and still shows in Leads / Calls / Analytics.
//   • Delete permanently — only for archived campaigns (or never-used drafts).
//     Requires typing the campaign name. Qualified leads + their history can
//     be kept (default) so the pipeline's best output is never lost.
// ─────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { Archive, Trash2, X, AlertTriangle, Loader2 } from 'lucide-react';
import {
  fetchCampaignImpact, archiveCampaign, deleteCampaignPermanently, CampaignImpact,
} from '@/src/lib/api/campaigns';

interface Props {
  campaign: { _id: string; name: string; status: string };
  onClose: () => void;
  /** Called after a successful archive / delete so the page can refresh. */
  onDone: (message: string) => void;
}

function errMsg(err: unknown, fallback: string): string {
  const e = err as { message?: string; response?: { data?: { message?: string } } };
  return e?.response?.data?.message || e?.message || fallback;
}

const BTN = { padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid transparent' } as const;

export default function DeleteCampaignModal({ campaign, onClose, onDone }: Props) {
  const [impact, setImpact] = useState<CampaignImpact | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDelete, setShowDelete] = useState(campaign.status === 'Archived');
  const [typed, setTyped] = useState('');
  const [keepQualified, setKeepQualified] = useState(true);

  const archived = campaign.status === 'Archived';
  const running = campaign.status === 'Running';

  useEffect(() => {
    fetchCampaignImpact(campaign._id)
      .then(setImpact)
      .catch((e) => setError(errMsg(e, 'Could not check the campaign.')))
      .finally(() => setLoading(false));
  }, [campaign._id]);

  const handleArchive = async () => {
    setBusy(true); setError(null);
    try {
      await archiveCampaign(campaign._id);
      onDone('Campaign archived. All leads, calls and meetings were kept.');
    } catch (e) {
      setError(errMsg(e, 'Could not archive the campaign.'));
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setBusy(true); setError(null);
    try {
      const r = await deleteCampaignPermanently(campaign._id, { confirmName: typed, keepQualified });
      onDone(r.message);
    } catch (e) {
      setError(errMsg(e, 'Could not delete the campaign.'));
      setBusy(false);
    }
  };

  const nameMatches = typed.trim() === campaign.name.trim();
  const canDelete = !!impact?.canDeletePermanently;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={() => !busy && onClose()}
      style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.72)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 480, background: '#111827', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '90vh', overflowY: 'auto' }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: 0, color: '#F8FAFC', fontSize: 15, fontWeight: 700 }}>
              {archived ? 'Delete archived campaign' : 'Remove campaign'}
            </h3>
            <p style={{ margin: '4px 0 0', color: '#94A3B8', fontSize: 12 }}>“{campaign.name}”</p>
          </div>
          <button onClick={onClose} disabled={busy} aria-label="Close" style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>

        {loading && <div style={{ color: '#94A3B8', fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}><Loader2 size={13} className="animate-spin" /> Checking what this campaign contains…</div>}

        {impact && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
            {[
              ['Leads', impact.leads],
              ['Qualified', impact.qualifiedLeads],
              ['Calls', impact.calls],
              ['Meetings', impact.meetings],
            ].map(([label, value]) => (
              <div key={label as string} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '8px 6px', textAlign: 'center' }}>
                <div style={{ color: '#F8FAFC', fontSize: 15, fontWeight: 700 }}>{value}</div>
                <div style={{ color: '#64748B', fontSize: 10 }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        {running && (
          <div style={{ fontSize: 12, color: '#FCD34D', display: 'flex', gap: 6 }}>
            <AlertTriangle size={14} style={{ flexShrink: 0 }} /> This campaign is running. Pause it first, then archive or delete it.
          </div>
        )}

        {/* ── Archive (recommended) ─────────────────────────────── */}
        {!archived && !running && (
          <div style={{ border: '1px solid rgba(59,130,246,0.3)', background: 'rgba(59,130,246,0.06)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#93C5FD', fontSize: 13, fontWeight: 600 }}>
              <Archive size={14} /> Archive <span style={{ fontSize: 10, background: 'rgba(59,130,246,0.2)', padding: '1px 6px', borderRadius: 99 }}>Recommended</span>
            </div>
            <p style={{ margin: 0, color: '#94A3B8', fontSize: 12, lineHeight: 1.5 }}>
              Hides the campaign and stops it from being started. <strong style={{ color: '#CBD5E1' }}>Nothing is lost</strong>: qualified leads, call
              transcripts and booked meetings stay available and keep counting in reports. You can restore it at any time.
            </p>
            <button onClick={handleArchive} disabled={busy || loading} style={{ ...BTN, alignSelf: 'flex-start', background: '#2563EB', color: '#fff', opacity: busy ? 0.7 : 1 }}>
              {busy && !showDelete ? 'Archiving…' : 'Archive campaign'}
            </button>
          </div>
        )}

        {/* ── Permanent delete ──────────────────────────────────── */}
        {!running && (
          <div style={{ border: '1px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.05)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#F87171', fontSize: 13, fontWeight: 600 }}>
              <Trash2 size={14} /> Delete permanently
            </div>

            {!archived && !canDelete && !loading && (
              <p style={{ margin: 0, color: '#94A3B8', fontSize: 12, lineHeight: 1.5 }}>
                Permanent deletion is only available for archived campaigns. Archive this one first — it keeps your data safe in the meantime.
              </p>
            )}

            {(archived || canDelete) && !showDelete && (
              <button onClick={() => setShowDelete(true)} style={{ ...BTN, alignSelf: 'flex-start', background: 'transparent', color: '#F87171', borderColor: 'rgba(239,68,68,0.35)' }}>
                Continue…
              </button>
            )}

            {(archived || canDelete) && showDelete && (
              <>
                <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', color: '#CBD5E1', fontSize: 12, lineHeight: 1.5, cursor: 'pointer' }}>
                  <input type="checkbox" checked={keepQualified} onChange={(e) => setKeepQualified(e.target.checked)} style={{ marginTop: 3 }} />
                  <span>
                    <strong>Keep qualified leads</strong> ({impact?.qualifiedLeads ?? 0}) with their calls, transcripts and meetings. They stay in
                    Leads, no longer tied to this campaign. Everything else is deleted.
                  </span>
                </label>

                {!keepQualified && (impact?.upcomingMeetings ?? 0) > 0 && (
                  <div style={{ fontSize: 12, color: '#FCD34D', display: 'flex', gap: 6 }}>
                    <AlertTriangle size={14} style={{ flexShrink: 0 }} /> {impact?.upcomingMeetings} upcoming meeting(s) exist. Cancel them first or keep qualified leads.
                  </div>
                )}

                <label style={{ color: '#94A3B8', fontSize: 11 }}>
                  Type <strong style={{ color: '#E2E8F0' }}>{campaign.name}</strong> to confirm
                  <input
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    placeholder={campaign.name}
                    style={{ marginTop: 4, width: '100%', background: '#0F172A', border: '1px solid #334155', borderRadius: 8, color: '#E2E8F0', fontSize: 13, padding: '8px 10px', outline: 'none' }}
                  />
                </label>

                <button
                  onClick={handleDelete}
                  disabled={busy || !nameMatches || (!keepQualified && (impact?.upcomingMeetings ?? 0) > 0)}
                  style={{ ...BTN, alignSelf: 'flex-start', background: '#DC2626', color: '#fff', opacity: busy || !nameMatches ? 0.5 : 1, cursor: nameMatches && !busy ? 'pointer' : 'not-allowed' }}
                >
                  {busy ? 'Deleting…' : 'Delete permanently'}
                </button>
                <p style={{ margin: 0, color: '#64748B', fontSize: 11 }}>This cannot be undone.</p>
              </>
            )}
          </div>
        )}

        {error && <div style={{ fontSize: 12, color: '#F87171' }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={busy} style={{ ...BTN, background: 'rgba(255,255,255,0.04)', color: '#94A3B8', borderColor: 'rgba(255,255,255,0.1)' }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
