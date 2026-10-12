'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, X } from 'lucide-react';
import StepDetails from '@/src/components/campaigns/wizard/steps/StepDetails';
import StepTone from '@/src/components/campaigns/wizard/steps/StepTone';
import StepSchedule from '@/src/components/campaigns/wizard/steps/StepSchedule';
import {
  CampaignFormData, INITIAL_CAMPAIGN_FORM, campaignFormError, toCampaignPayload,
} from '@/src/components/campaigns/campaignForm';
import { createCampaign } from '@/src/lib/api/campaigns';
import { Spinner } from '@/src/components/ui/Spinner';
import { AuthError, FieldError } from '@/src/types/auth';

interface Props {
  onClose: () => void;
  /** Campaign was saved as a draft. The list should refresh. */
  onCreated: (message: string) => void;
  /** Campaign was saved and the user wants to import leads next. */
  onUploadLeads: (campaign: { _id: string; name: string }) => void;
}

export default function CreateCampaignDialog({ onClose, onCreated, onUploadLeads }: Props) {
  const [form, setForm] = useState<CampaignFormData>(INITIAL_CAMPAIGN_FORM);
  const [saving, setSaving] = useState<'draft' | 'upload' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);

  function updateForm<K extends keyof CampaignFormData>(key: K, value: CampaignFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError(null);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !saving) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  async function save(next: 'draft' | 'upload') {
    const problem = campaignFormError(form);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(next);
    setError(null);
    setFieldErrors([]);
    try {
      const campaign = await createCampaign(toCampaignPayload(form));
      if (next === 'upload') onUploadLeads({ _id: campaign._id, name: campaign.name });
      else onCreated(`“${campaign.name}” saved as a draft.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save campaign. Please try again.');
      if (err instanceof AuthError && err.errors?.length) setFieldErrors(err.errors);
      setSaving(null);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-campaign-title"
      onClick={() => !saving && onClose()}
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        background: 'rgba(2,6,23,0.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 760, maxHeight: 'min(920px, calc(100vh - 40px))',
          background: '#0F172A',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 16,
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 24px 80px rgba(0,0,0,0.45)',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 12,
          padding: '16px 18px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}>
          <div style={{ flex: 1 }}>
            <h2 id="create-campaign-title" style={{ margin: 0, color: '#F8FAFC', fontSize: 16, fontWeight: 700 }}>
              New campaign
            </h2>
            <p style={{ margin: '4px 0 0', color: '#64748B', fontSize: 12 }}>
              Set the goal, the agent’s voice, and when it may call. It is saved as a draft.
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={!!saving}
            aria-label="Close"
            title="Back to campaigns"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#94A3B8', cursor: saving ? 'not-allowed' : 'pointer',
              width: 32, height: 32, borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={15} />
          </button>
        </div>

        <div style={{ overflowY: 'auto', padding: '8px 18px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {error && (
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 6,
              padding: '10px 12px', borderRadius: 8, marginTop: 10,
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertCircle size={14} color="#F87171" />
                <span style={{ fontSize: 12, color: '#F87171' }}>{error}</span>
              </div>
              {fieldErrors.length > 0 && (
                <ul style={{ margin: '2px 0 0 22px', padding: 0 }}>
                  {fieldErrors.map((fe, i) => (
                    <li key={i} style={{ fontSize: 11.5, color: '#FCA5A5' }}>
                      <strong style={{ color: '#F87171' }}>{fe.field}:</strong> {fe.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <Section>
            <StepDetails form={form} updateForm={updateForm} />
          </Section>
          <Section>
            <StepTone form={form} updateForm={updateForm} />
          </Section>
          <Section>
            <StepSchedule form={form} updateForm={updateForm} />
          </Section>
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          padding: '12px 18px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}>
          <button
            onClick={onClose}
            disabled={!!saving}
            style={ghostBtn(!!saving)}
          >
            Cancel
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => save('draft')} disabled={!!saving} style={ghostBtn(!!saving)}>
              {saving === 'draft' ? <Spinner size={13} color="currentColor" /> : null}
              {saving === 'draft' ? 'Saving…' : 'Save draft'}
            </button>
            <button onClick={() => save('upload')} disabled={!!saving} style={primaryBtn(!!saving)}>
              {saving === 'upload' ? <Spinner size={13} color="currentColor" /> : null}
              {saving === 'upload' ? 'Saving…' : 'Save and import leads'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: '#111827',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 12,
      padding: '18px 18px 8px',
      marginTop: 10,
    }}>
      {children}
    </div>
  );
}

function ghostBtn(disabled: boolean): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#CBD5E1',
  };
}

function primaryBtn(disabled: boolean): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.7 : 1,
    background: '#2563EB', border: '1px solid transparent', color: '#fff',
  };
}
