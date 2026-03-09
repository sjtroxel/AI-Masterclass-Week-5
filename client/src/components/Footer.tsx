export default function Footer() {
  return (
    <footer className="border-t border-border bg-surface-2 px-6 py-4">
      <nav aria-label="Footer navigation">
        <ul className="flex flex-wrap gap-6 font-sans text-sm text-text-muted list-none p-0 m-0">
          <li>
            <a
              href="/about"
              className="hover:text-text transition-colors focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:outline-none rounded-sm"
            >
              About
            </a>
          </li>
          <li>
            <a
              href="https://catalog.archives.gov"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="NARA Catalog (opens in new tab)"
              className="hover:text-text transition-colors focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:outline-none rounded-sm"
            >
              NARA Catalog ↗
            </a>
          </li>
          <li>
            <a
              href="https://github.com/sjtroxel/poster-pilot/issues"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Submit feedback (opens in new tab)"
              className="hover:text-text transition-colors focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:outline-none rounded-sm"
            >
              Feedback ↗
            </a>
          </li>
        </ul>
      </nav>
    </footer>
  );
}
