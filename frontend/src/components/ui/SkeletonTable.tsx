'use client';

// ─────────────────────────────────────────────
//  LeadMind AI — SkeletonTable
//
//  Kept under its original name so every existing
//  call site keeps working, but it now renders a
//  loading spinner in a table-sized card.
// ─────────────────────────────────────────────

import { PageLoader } from '@/src/components/ui/Spinner';

interface SkeletonTableProps {
  rows?: number;
  /** Ignored — kept for backwards compatibility */
  cols?: number;
  /** Ignored — kept for backwards compatibility */
  showHeader?: boolean;
  className?: string;
}

export default function SkeletonTable({ rows = 5, className = '' }: SkeletonTableProps) {
  return (
    <PageLoader
      card
      minHeight={Math.max(160, rows * 40)}
      className={className}
    />
  );
}
