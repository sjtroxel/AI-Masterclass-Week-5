import { useState } from 'react';

interface ScoreLabelProps {
  label: string;
  description: string;
}

/**
 * A score label with an inline-expand ⓘ button.
 * Clicking the icon toggles a one-line explanation below the label.
 * Uses an inline expand (not an absolutely-positioned tooltip) so it works
 * correctly inside overflow-hidden containers like PosterCard.
 */
export default function ScoreLabel({ label, description }: ScoreLabelProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1">
        <span className="font-sans text-xs text-text-muted">{label}</span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
          aria-expanded={open}
          aria-label={`Explain: ${label}`}
          className="
            flex items-center justify-center rounded-full
            text-text-muted transition-colors hover:text-text
            focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500
          "
        >
          {/* Info circle icon */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        </button>
      </div>

      {open && (
        <p className="rounded bg-surface-3 px-2 py-1 font-sans text-xs text-text-muted leading-snug">
          {description}
        </p>
      )}
    </div>
  );
}
