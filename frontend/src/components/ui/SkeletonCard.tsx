'use client';

// ─────────────────────────────────────────────
//  LeadMind AI — SkeletonCard
//
//  Kept under its original name so every existing
//  call site keeps working, but it now renders a
//  loading spinner inside the card instead of
//  shimmer bars.
// ─────────────────────────────────────────────

import { PageLoader } from '@/src/components/ui/Spinner';

interface SkeletonCardProps {
  /** Card height in px. Default: 96 */
  height?: number;
  /** Ignored — kept for backwards compatibility */
  lines?: number;
  /** Ignored — kept for backwards compatibility */
  showLabel?: boolean;
  className?: string;
}

export default function SkeletonCard({ height = 96, className = '' }: SkeletonCardProps) {
  return (
    <PageLoader
      card
      minHeight={height}
      size={height < 120 ? 20 : 28}
      className={className}
    />
  );
}
