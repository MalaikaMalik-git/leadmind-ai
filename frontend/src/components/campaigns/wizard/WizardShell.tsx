'use client';
import { Spinner } from '@/src/components/ui/Spinner';

// ─────────────────────────────────────────────
//  LeadMind AI — WizardShell
//  Day 9 · Session 1
//
//  The outer wrapper for the Create Campaign wizard.
//  Handles:
//   • 4-step indicator bar at the top
//   • Back / Next / Save buttons at the bottom
//   • Renders whichever step component is active
//   • Does NOT own form data — that lives in page.tsx
//     and is passed down as props
//
//  Step flow:
//   1 → Campaign Details
//   2 → AI Voice Tone
//   3 → Schedule
//   4 → Review & Confirm
// ─────────────────────────────────────────────

import { ReactNode } from 'react';
import { ChevronRight, ChevronLeft, Save, Upload } from 'lucide-react';

// ── Step metadata ─────────────────────────────
export const STEPS = [
  { number: 1, label: 'Details',  description: 'Name, goal & instructions' },
  { number: 2, label: 'Tone',     description: 'AI voice personality'       },
  { number: 3, label: 'Schedule', description: 'Dates & quiet hours'        },
  { number: 4, label: 'Review',   description: 'Confirm & save'             },
];

// ── Props ─────────────────────────────────────
interface WizardShellProps {
  currentStep:    number;            // 1-4
  children:       ReactNode;         // the active step component
  onBack:         () => void;
  onNext:         () => void;
  onSaveDraft:    () => void;
  onSaveAndUpload:() => void;
  isLastStep:     boolean;
  isSaving:       boolean;
  canAdvance:     boolean;           // page.tsx validates and sets this
}

export default function WizardShell({
  currentStep,
  children,
  onBack,
  onNext,
  onSaveDraft,
  onSaveAndUpload,
  isLastStep,
  isSaving,
  canAdvance,
}: WizardShellProps) {
  return (
    <div style={{
      minHeight:     '100%',
      display:       'flex',
      flexDirection: 'column',
      padding:        20,
      gap:            20,
    }}>

      {/* ── Page title ───────────────────────── */}
      <div>
        <h2 style={{ color: '#F8FAFC', fontSize: 18, fontWeight: 700, margin: 0 }}>
          Create Campaign
        </h2>
        <p style={{ color: '#475569', fontSize: 12, marginTop: 5 }}>
          Set up a new outbound calling campaign in 4 steps
        </p>
      </div>

      {/* ── Step indicator ───────────────────── */}
      <StepIndicator currentStep={currentStep} />

      {/* ── Step content card ────────────────── */}
      <div style={{
        background:   '#111827',
        border:       '1px solid rgba(255,255,255,0.07)',
        borderRadius:  12,
        padding:      '24px 24px',
        flex:          1,
      }}>
        {children}
      </div>

      {/* ── Bottom navigation ────────────────── */}
      <BottomNav
        currentStep={currentStep}
        onBack={onBack}
        onNext={onNext}
        onSaveDraft={onSaveDraft}
        onSaveAndUpload={onSaveAndUpload}
        isLastStep={isLastStep}
        isSaving={isSaving}
        canAdvance={canAdvance}
      />
    </div>
  );
}

// ── Step Indicator ────────────────────────────
// Original line-connector design:
//  ●——————●——————●——————●
//  1      2      3      4
// Active step shows label + description below.
// Completed steps show filled blue circle + checkmark.
// Inactive steps show grey circle + number.
// Lines between steps fill blue as steps complete.

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

      {/* ── Top row: circles + lines ── */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {STEPS.map((step, idx) => {
          const isDone   = currentStep > step.number;
          const isActive = currentStep === step.number;
          const isLast   = idx === STEPS.length - 1;

          return (
            <div key={step.number} style={{
              display:    'flex',
              alignItems: 'center',
              flex:        isLast ? 0 : 1,
            }}>
              {/* Circle */}
              <div style={{
                width:          32,
                height:         32,
                borderRadius:  '50%',
                flexShrink:     0,
                display:       'flex',
                alignItems:    'center',
                justifyContent:'center',
                fontSize:       12,
                fontWeight:     700,
                transition:    'all 250ms',
                background:    isDone
                  ? '#2563EB'
                  : isActive
                  ? 'rgba(37,99,235,0.15)'
                  : 'rgba(255,255,255,0.04)',
                border:        `2px solid ${
                  isDone
                    ? '#2563EB'
                    : isActive
                    ? '#3B82F6'
                    : 'rgba(255,255,255,0.12)'
                }`,
                color:          isDone ? '#fff' : isActive ? '#60A5FA' : '#334155',
                boxShadow:      isActive
                  ? '0 0 0 4px rgba(59,130,246,0.12), 0 0 12px rgba(59,130,246,0.2)'
                  : 'none',
              }}>
                {isDone ? (
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <path d="M2.5 6.5L5 9L10.5 4" stroke="white" strokeWidth="2"
                      strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : step.number}
              </div>

              {/* Connector line */}
              {!isLast && (
                <div style={{
                  flex:       1,
                  height:     2,
                  margin:    '0 6px',
                  borderRadius: 99,
                  background: isDone
                    ? '#2563EB'
                    : 'rgba(255,255,255,0.07)',
                  transition: 'background 300ms',
                }} />
              )}
            </div>
          );
        })}
      </div>

      {/* ── Bottom row: labels aligned under circles ── */}
      {/* Each label is positioned to align with its circle.
          We use the same flex layout but with text instead. */}
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        {STEPS.map((step, idx) => {
          const isDone   = currentStep > step.number;
          const isActive = currentStep === step.number;
          const isLast   = idx === STEPS.length - 1;

          return (
            <div key={step.number} style={{
              display:    'flex',
              flex:        isLast ? 0 : 1,
              alignItems: 'flex-start',
            }}>
              {/* Label block — fixed width matching circle (32px) */}
              <div style={{
                width:      32,
                flexShrink: 0,
                display:   'flex',
                flexDirection:'column',
                alignItems:'center',
                gap:         2,
              }}>
                <span style={{
                  fontSize:    10,
                  fontWeight:   isActive ? 600 : 400,
                  color:        isActive
                    ? '#F8FAFC'
                    : isDone
                    ? '#3B82F6'
                    : '#334155',
                  whiteSpace:  'nowrap',
                  transition:  'color 200ms',
                }}>
                  {step.label}
                </span>
                {isActive && (
                  <span style={{
                    fontSize:   9,
                    color:      '#475569',
                    whiteSpace: 'nowrap',
                  }}>
                    {step.description}
                  </span>
                )}
              </div>

              {/* Spacer matching the connector line */}
              {!isLast && <div style={{ flex: 1 }} />}
            </div>
          );
        })}
      </div>

    </div>
  );
}

// ── Bottom navigation ─────────────────────────

interface BottomNavProps {
  currentStep:     number;
  onBack:          () => void;
  onNext:          () => void;
  onSaveDraft:     () => void;
  onSaveAndUpload: () => void;
  isLastStep:      boolean;
  isSaving:        boolean;
  canAdvance:      boolean;
}

function BottomNav({
  currentStep, onBack, onNext,
  onSaveDraft, onSaveAndUpload,
  isLastStep, isSaving, canAdvance,
}: BottomNavProps) {
  return (
    <div style={{
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'space-between',
      gap:             12,
      paddingTop:      4,
    }}>

      {/* Left — Back button */}
      <GhostBtn
        icon={<ChevronLeft size={14} strokeWidth={2} />}
        label="Back"
        onClick={onBack}
        disabled={currentStep === 1}
        iconLeft
      />

      {/* Right — depends on which step */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {isLastStep ? (
          <>
            {/* Save as Draft */}
            <GhostBtn
              icon={isSaving ? <Spinner size={13} color="currentColor" /> : <Save size={13} strokeWidth={2} />}
              label={isSaving ? 'Saving…' : 'Save as Draft'}
              onClick={onSaveDraft}
              disabled={isSaving}
              iconLeft
            />

            {/* Save & Upload Leads — primary */}
            <PrimaryBtn
              icon={isSaving ? <Spinner size={13} color="currentColor" /> : <Upload size={13} strokeWidth={2} />}
              label={isSaving ? 'Saving…' : 'Save & Upload Leads'}
              onClick={onSaveAndUpload}
              disabled={isSaving}
            />
          </>
        ) : (
          /* Next button */
          <PrimaryBtn
            icon={<ChevronRight size={14} strokeWidth={2} />}
            label="Next"
            onClick={onNext}
            disabled={!canAdvance}
            iconRight
          />
        )}
      </div>
    </div>
  );
}

// ── Reusable buttons ──────────────────────────

import { useState } from 'react';

function GhostBtn({ icon, label, onClick, disabled, iconLeft }: {
  icon: ReactNode; label: string; onClick: () => void;
  disabled?: boolean; iconLeft?: boolean;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display:    'flex',
        alignItems: 'center',
        gap:         6,
        padding:   '8px 16px',
        borderRadius: 8,
        border:    '1px solid rgba(255,255,255,0.1)',
        background:  hov && !disabled ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)',
        color:       disabled ? '#334155' : hov ? '#CBD5E1' : '#94A3B8',
        fontSize:    12,
        fontWeight:  500,
        cursor:      disabled ? 'not-allowed' : 'pointer',
        transition: 'all 150ms',
        flexDirection: iconLeft ? 'row' : 'row-reverse',
      }}
    >
      {icon}{label}
    </button>
  );
}

function PrimaryBtn({ icon, label, onClick, disabled, iconRight }: {
  icon: ReactNode; label: string; onClick: () => void;
  disabled?: boolean; iconRight?: boolean;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display:    'flex',
        alignItems: 'center',
        gap:         6,
        padding:   '8px 18px',
        borderRadius: 8,
        border:    '1px solid transparent',
        background:  disabled ? '#1E3A5F' : hov ? '#1D4ED8' : '#2563EB',
        color:       disabled ? '#4B6A8F' : '#fff',
        fontSize:    12,
        fontWeight:  600,
        cursor:      disabled ? 'not-allowed' : 'pointer',
        transition: 'all 150ms',
        boxShadow:   disabled ? 'none' : '0 2px 12px rgba(37,99,235,0.35)',
        flexDirection: iconRight ? 'row-reverse' : 'row',
      }}
    >
      {icon}{label}
    </button>
  );
}