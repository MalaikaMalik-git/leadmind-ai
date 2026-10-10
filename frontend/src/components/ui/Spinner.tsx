'use client';

// ─────────────────────────────────────────────
//  LeadMind AI — Spinner
//
//  The one loading indicator used across the app.
//   <Spinner />                 — 16px inline (buttons, labels)
//   <Spinner size={28} />       — bigger
//   <PageLoader />              — centered block for pages / cards
//   <PageLoader label="..." />  — with caption
// ─────────────────────────────────────────────

interface SpinnerProps {
  size?: number;
  color?: string;
  className?: string;
}

export function Spinner({ size = 16, color = '#3B82F6', className = '' }: SpinnerProps) {
  return (
    <svg
      role="status"
      aria-label="Loading"
      className={`animate-spin flex-shrink-0 ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={{ display: 'inline-block' }}
    >
      <circle cx="12" cy="12" r="9" stroke={color} strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 00-9-9" stroke={color} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

interface PageLoaderProps {
  label?: string;
  /** Minimum height in px. Default: 240 */
  minHeight?: number | string;
  /** Wrap in a dark card (for placing inside a page). Default: false */
  card?: boolean;
  size?: number;
  className?: string;
}

export function PageLoader({
  label,
  minHeight = 240,
  card = false,
  size = 32,
  className = '',
}: PageLoaderProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 w-full ${card ? 'rounded-xl' : ''} ${className}`}
      style={{
        minHeight,
        ...(card
          ? { backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)' }
          : {}),
      }}
    >
      <Spinner size={size} />
      {label && <span style={{ color: '#64748B', fontSize: 12 }}>{label}</span>}
    </div>
  );
}

export default Spinner;
