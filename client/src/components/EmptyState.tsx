import { Link } from 'react-router-dom';

const SUGGESTED_SEARCHES = [
  { label: 'WPA labor posters', q: 'WPA labor posters' },
  { label: 'NASA moon mission', q: 'NASA moon mission' },
  { label: 'WWII propaganda home front', q: 'WWII propaganda home front' },
];

export default function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-6 py-20 text-center">
      {/* Archive icon */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="48"
        height="48"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-text-muted"
        aria-hidden="true"
      >
        <rect width="20" height="5" x="2" y="3" rx="1" />
        <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
        <path d="M10 12h4" />
      </svg>

      <div className="flex flex-col gap-2">
        <h2 className="font-sans text-lg font-semibold text-text">
          No posters found
        </h2>
        <p className="font-sans text-sm text-text-muted">
          Try a different query, or explore one of these:
        </p>
      </div>

      <ul className="flex flex-wrap justify-center gap-3 list-none p-0 m-0">
        {SUGGESTED_SEARCHES.map(({ label, q }) => (
          <li key={q}>
            <Link
              to={`/search?q=${encodeURIComponent(q)}&mode=text`}
              className="
                rounded-button border border-border bg-surface-2 px-4 py-2
                font-sans text-sm text-text-muted transition-colors
                hover:border-primary-500 hover:text-primary-500
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500
              "
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
