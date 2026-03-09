import { HIGH_CONFIDENCE_THRESHOLD, HUMAN_HANDOFF_THRESHOLD } from '@poster-pilot/shared';

// ─── Pure helper — exported for unit testing ──────────────────────────────────

export type ConfidenceColor = 'success' | 'warning' | 'danger';

export function getConfidenceColor(score: number): ConfidenceColor {
  if (score >= HIGH_CONFIDENCE_THRESHOLD) return 'success';  // >= 0.85
  if (score >= HUMAN_HANDOFF_THRESHOLD) return 'warning';    // >= 0.72
  return 'danger';
}

// Maps ConfidenceColor to the CSS custom property token for the progress fill
const COLOR_VAR: Record<ConfidenceColor, string> = {
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  danger:  'var(--color-danger)',
};

// Maps ConfidenceColor to a Tailwind bg utility class for the dot
const DOT_CLASS: Record<ConfidenceColor, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger:  'bg-danger',
};

// ─── Component ────────────────────────────────────────────────────────────────

interface ConfidenceIndicatorProps {
  score: number;
  showLabel?: boolean;
}

export default function ConfidenceIndicator({ score, showLabel = false }: ConfidenceIndicatorProps) {
  const color = getConfidenceColor(score);
  const pct = Math.round(score * 100);

  return (
    <div className="flex items-center gap-2">
      {/* Colored dot */}
      <span
        className={`size-2 shrink-0 rounded-full ${DOT_CLASS[color]}`}
        aria-hidden="true"
      />

      {/* Progress bar — spec requires <progress> with role="meter" */}
      <progress
        role="meter"
        aria-label={`Confidence score: ${pct}%`}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        value={pct}
        max={100}
        style={{ '--confidence-color': COLOR_VAR[color] } as React.CSSProperties}
      />

      {showLabel && (
        <span className="font-mono text-xs text-text-muted" aria-hidden="true">
          {pct}%
        </span>
      )}
    </div>
  );
}
