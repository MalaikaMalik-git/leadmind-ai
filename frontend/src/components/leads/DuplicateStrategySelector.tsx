'use client';

// ─────────────────────────────────────────────
//  LeadMind AI — DuplicateStrategySelector
//  Day 12 · Session 2
//
//  UC-04 A2 — lets the admin choose how re-imported duplicates are handled.
//  Matches the backend's DuplicateStrategy type exactly (leads.ts API layer).
// ─────────────────────────────────────────────

import { Check } from 'lucide-react';
import { DuplicateStrategy } from '@/src/lib/api/leads';

interface StrategyOption {
  value: DuplicateStrategy;
  label: string;
  description: string;
}

const OPTIONS: StrategyOption[] = [
  {
    value: 'skip',
    label: 'Skip',
    description: 'Leave existing leads untouched — only new contacts are added',
  },
  {
    value: 'update',
    label: 'Update',
    description: "Overwrite the existing lead's details with the new row",
  },
  {
    value: 'importAll',
    label: 'Import All',
    description: 'Import every row as a new lead, even if it matches an existing one',
  },
];

interface DuplicateStrategySelectorProps {
  value: DuplicateStrategy;
  onChange: (value: DuplicateStrategy) => void;
  disabled?: boolean;
}

export default function DuplicateStrategySelector({
  value,
  onChange,
  disabled,
}: DuplicateStrategySelectorProps) {
  return (
    <div>
      <p style={{ color: '#94A3B8', fontSize: 11, fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 }}>
        If a Row Matches an Existing Lead
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {OPTIONS.map((opt) => {
          const isSelected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              disabled={disabled}
              onClick={() => onChange(opt.value)}
              style={{
                textAlign: 'left',
                padding: '12px 14px',
                borderRadius: 10,
                cursor: disabled ? 'not-allowed' : 'pointer',
                background: isSelected ? 'rgba(59,130,246,0.08)' : 'rgba(255,255,255,0.02)',
                border: `1.5px solid ${isSelected ? '#3B82F6' : 'rgba(255,255,255,0.08)'}`,
                transition: 'all 150ms',
                opacity: disabled ? 0.5 : 1,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: isSelected ? '#60A5FA' : '#CBD5E1', fontSize: 13, fontWeight: 600 }}>
                  {opt.label}
                </span>
                {isSelected && (
                  <div style={{
                    width: 16, height: 16, borderRadius: '50%', background: '#3B82F6',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <Check size={10} color="#fff" strokeWidth={3} />
                  </div>
                )}
              </div>
              <p style={{ color: '#64748B', fontSize: 11, lineHeight: 1.4, margin: 0 }}>
                {opt.description}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}