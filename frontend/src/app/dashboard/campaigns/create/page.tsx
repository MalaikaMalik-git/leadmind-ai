'use client';

// ─────────────────────────────────────────────
//  LeadMind AI — Create Campaign Page
//  Day 9 · Session 4 — FINAL (real API wired)
//
//  This page is the ORCHESTRATOR of the wizard.
//  It owns ALL form state and passes it down to
//  each step as props.
//
//  Session 1: Shell + navigation only              ✅
//  Session 2: StepDetails + StepTone filled in      ✅
//  Session 3: StepSchedule + StepReview filled in   ✅
//  Session 4: Real API call on Save                 ✅ (this session)
//
//  Route: /dashboard/campaigns/create
// ─────────────────────────────────────────────

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import WizardShell from '@/src/components/campaigns/wizard/WizardShell';
import StepDetails from '@/src/components/campaigns/wizard/steps/StepDetails';
import StepTone from '@/src/components/campaigns/wizard/steps/StepTone';
import StepSchedule from '@/src/components/campaigns/wizard/steps/StepSchedule';
import StepReview from '@/src/components/campaigns/wizard/steps/StepReview';
import { createCampaign, CreateCampaignPayload } from '@/src/lib/api/campaigns';
import { AuthError, FieldError } from '@/src/types/auth';

// ── Full form data shape ──────────────────────
// Defined here so all 4 step components can
// import and use the same type.
export interface CampaignFormData {
  // Step 1 — Details
  name:          string;
  goal:          string;
  instructions:  string;
  dailyCallLimit:number;

  // Step 2 — Tone
  tone: 'Professional' | 'Friendly' | 'Direct' | 'Consultative' | 'Persuasive' | 'Soft Warm' | '';

  // Step 3 — Schedule
  startDate:  string;
  endDate:    string;
  quietHours: {
    enabled:   boolean;
    startTime: string;
    endTime:   string;
    timezone:  string;
  };
}

// ── Initial empty form ────────────────────────
const INITIAL_FORM: CampaignFormData = {
  name:           '',
  goal:           '',
  instructions:   '',
  dailyCallLimit: 50,
  tone:           '',
  startDate:      '',
  endDate:        '',
  quietHours: {
    enabled:   false,
    startTime: '22:00',
    endTime:   '08:00',
    timezone:  'Asia/Karachi',
  },
};

// ── Map wizard form state → backend payload ───
// Matches exactly what campaignController.ts createCampaign()
// destructures from req.body. Backend always sets status:
// 'Draft' on create, so we never send status here (UC-02).
function toPayload(form: CampaignFormData): CreateCampaignPayload {
  return {
    name:           form.name.trim(),
    goal:           form.goal.trim(),
    tone:           form.tone,
    instructions:   form.instructions.trim(),
    dailyCallLimit: form.dailyCallLimit,
    startDate:      form.startDate || null,
    endDate:        form.endDate   || null,
    quietHours:     form.quietHours,
  };
}

export default function CreateCampaignPage() {
  const router = useRouter();

  // ── Step state ────────────────────────────
  const [currentStep, setCurrentStep] = useState(1);

  // ── Form data state ───────────────────────
  const [form, setForm] = useState<CampaignFormData>(INITIAL_FORM);

  // ── Saving / error state ──────────────────
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);

  // ── Field updater helper ──────────────────
  // Called by each step: updateForm('name', 'Q2 Campaign')
  function updateForm<K extends keyof CampaignFormData>(
    key: K,
    value: CampaignFormData[K],
  ) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  // ── Step validation ───────────────────────
  // Returns true if the current step's required
  // fields are filled — controls Next button state
  function canAdvance(): boolean {
    switch (currentStep) {
      case 1:
        return (
          form.name.trim().length > 0 &&
          form.goal.trim().length > 0 &&
          form.instructions.trim().length > 0 &&
          form.dailyCallLimit >= 1
        );
      case 2:
        return form.tone !== '';
      case 3:
        // Schedule step — dates are optional per spec
        // but if quiet hours enabled, times must differ
        if (form.quietHours.enabled) {
          return form.quietHours.startTime !== form.quietHours.endTime;
        }
        return true;
      case 4:
        return true; // Review step — always can save
      default:
        return false;
    }
  }

  // ── Navigation ────────────────────────────
  function handleNext() {
    if (currentStep < 4 && canAdvance()) {
      setSaveError(null);
      setCurrentStep(s => s + 1);
    }
  }

  function handleBack() {
    if (currentStep > 1) {
      setSaveError(null);
      setCurrentStep(s => s - 1);
    } else {
      // Back on step 1 → go back to campaigns list
      router.push('/dashboard/campaigns');
    }
  }

  // ── Jump directly to a step (used by "Edit" links on Review) ──
  function handleEditStep(step: number) {
    setSaveError(null);
    setCurrentStep(step);
  }

  // ── Save handlers — real API calls (UC-02) ────────────────
  async function handleSaveDraft() {
    setIsSaving(true);
    setSaveError(null);
    setFieldErrors([]);
    try {
      await createCampaign(toPayload(form));
      // Backend always creates as status: 'Draft', so a plain
      // create() call already satisfies "Save as Draft".
      router.push('/dashboard/campaigns');
    } catch (err: any) {
      setSaveError(err?.message ?? 'Failed to save campaign. Please try again.');
      if (err instanceof AuthError && err.errors?.length) {
        setFieldErrors(err.errors);
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveAndUpload() {
    setIsSaving(true);
    setSaveError(null);
    setFieldErrors([]);
    try {
      const campaign = await createCampaign(toPayload(form));
      // Carry the new campaign's id into the (future, Day 11-12)
      // Upload Leads flow so it lands on this exact campaign.
      router.push(`/dashboard/leads/import?campaignId=${campaign._id}`);
    } catch (err: any) {
      setSaveError(err?.message ?? 'Failed to save campaign. Please try again.');
      if (err instanceof AuthError && err.errors?.length) {
        setFieldErrors(err.errors);
      }
    } finally {
      setIsSaving(false);
    }
  }

  // ── Render ────────────────────────────────
  return (
    <WizardShell
      currentStep={currentStep}
      onBack={handleBack}
      onNext={handleNext}
      onSaveDraft={handleSaveDraft}
      onSaveAndUpload={handleSaveAndUpload}
      isLastStep={currentStep === 4}
      isSaving={isSaving}
      canAdvance={canAdvance()}
    >
      {/* ── Save error banner — shown above whichever step is active ── */}
      {saveError && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 6,
          padding: '10px 14px', borderRadius: 8, marginBottom: 18,
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertCircle size={14} color="#F87171" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: '#F87171' }}>{saveError}</span>
          </div>

          {/* Field-level detail — this is the part that was previously silently
              dropped by client.ts, leaving only the generic "Validation failed." */}
          {fieldErrors.length > 0 && (
            <ul style={{ margin: '2px 0 0 22px', padding: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
              {fieldErrors.map((fe, i) => (
                <li key={i} style={{ fontSize: 11.5, color: '#FCA5A5' }}>
                  <strong style={{ color: '#F87171' }}>{fe.field}:</strong> {fe.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {currentStep === 1 && <StepDetails form={form} updateForm={updateForm} />}
      {currentStep === 2 && <StepTone form={form} updateForm={updateForm} />}
      {currentStep === 3 && <StepSchedule form={form} updateForm={updateForm} />}
      {currentStep === 4 && <StepReview form={form} onEditStep={handleEditStep} />}
    </WizardShell>
  );
}