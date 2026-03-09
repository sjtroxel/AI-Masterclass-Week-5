/** 8 skeleton cards with pulse animation — matches the real PosterGrid layout. */
export default function SkeletonGrid() {
  return (
    <div
      aria-label="Loading results"
      aria-busy="true"
      className="columns-2 gap-discovery md:columns-3 lg:columns-4"
    >
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="mb-discovery break-inside-avoid overflow-hidden rounded-card bg-surface-2 shadow-card"
        >
          {/* Image placeholder — randomise heights slightly for a natural masonry feel */}
          <div
            className="w-full animate-pulse bg-surface-3"
            style={{ height: `${180 + (i % 3) * 40}px` }}
          />
          {/* Text placeholders */}
          <div className="p-3 flex flex-col gap-2">
            <div className="h-3 w-4/5 animate-pulse rounded bg-surface-3" />
            <div className="h-3 w-3/5 animate-pulse rounded bg-surface-3" />
            <div className="mt-1 h-2 w-1/3 animate-pulse rounded bg-surface-3" />
          </div>
        </div>
      ))}
    </div>
  );
}
