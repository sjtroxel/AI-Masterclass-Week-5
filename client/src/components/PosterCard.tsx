import type { PosterSummary } from '@poster-pilot/shared';
import ConfidenceIndicator from './ConfidenceIndicator.js';
import ScoreLabel from './ScoreLabel.js';

interface PosterCardProps {
  poster: PosterSummary;
  similarityScore?: number;
  onSelect: (id: string) => void;
}

export default function PosterCard({ poster, similarityScore, onSelect }: PosterCardProps) {
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(poster.id);
    }
  }

  return (
    <article
      role="article"
      aria-label={`${poster.title}`}
      tabIndex={0}
      onClick={() => onSelect(poster.id)}
      onKeyDown={handleKeyDown}
      className="
        group mb-discovery break-inside-avoid
        cursor-pointer overflow-hidden rounded-card bg-surface-2
        shadow-card transition-all duration-200
        hover:scale-[1.02] hover:shadow-card-hover
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500
      "
    >
      {/* Thumbnail */}
      <div className="relative overflow-hidden">
        <img
          src={poster.thumbnail_url}
          alt={`${poster.title} — NARA collection`}
          loading="lazy"
          className="w-full object-cover"
        />

        {/* Hover overlay */}
        <div className="
          absolute inset-0 flex items-center justify-center
          bg-text/0 transition-colors duration-200
          group-hover:bg-text/10
        ">
          <span className="
            rounded-button bg-surface px-3 py-1 font-sans text-xs font-semibold text-text
            opacity-0 transition-opacity duration-200 group-hover:opacity-100
          ">
            View details
          </span>
        </div>
      </div>

      {/* Metadata */}
      <div className="p-3 flex flex-col gap-1">
        <p className="font-sans text-sm font-semibold text-text line-clamp-2 leading-snug">
          {poster.title}
        </p>

        {poster.series_title && (
          <span className="block max-w-full truncate rounded-button bg-primary-100 px-2 py-0.5 font-sans text-xs text-primary-700">
            {poster.series_title}
          </span>
        )}

        {/* Scores */}
        <div className="mt-1 flex flex-col gap-2">
          {/* Relevance — only shown on search results */}
          {similarityScore !== undefined && (
            <div className="flex flex-col gap-0.5">
              <ScoreLabel
                label="Relevance"
                description="How closely this poster matches your search query, relative to other results in this set. 100% = the best match returned."
              />
              <ConfidenceIndicator score={similarityScore} showLabel variant="search" />
            </div>
          )}

          {/* Archival confidence — always shown */}
          <div className="flex flex-col gap-0.5">
            <ScoreLabel
              label="Archival confidence"
              description="How complete and reliable the NARA catalog record is for this poster. Based on metadata richness and image quality at the time of indexing."
            />
            <ConfidenceIndicator score={poster.overall_confidence} showLabel />
          </div>
        </div>
      </div>
    </article>
  );
}
