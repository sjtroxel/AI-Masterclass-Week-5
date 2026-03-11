import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { debug } from '../lib/debug.js';
import logoSrc from '../images/PosterPilotLogo.png';

// ─── Dark mode helpers ────────────────────────────────────────────────────────

const DARK_MODE_KEY = 'poster-pilot:dark-mode';

function getInitialDarkMode(): boolean {
  const stored = localStorage.getItem(DARK_MODE_KEY);
  if (stored !== null) {
    return stored === 'true';
  }
  // Fall back to OS preference on first visit
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyDarkMode(isDark: boolean): void {
  if (isDark) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
  localStorage.setItem(DARK_MODE_KEY, String(isDark));
  debug('dark mode set', isDark);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Header() {
  // Lazy initializer runs once at mount — reads localStorage / matchMedia without
  // triggering a second render from setState inside an effect.
  const [isDark, setIsDark] = useState<boolean>(getInitialDarkMode);

  // Sync the <html> class whenever isDark changes (including the initial value).
  useEffect(() => {
    applyDarkMode(isDark);
  }, [isDark]);

  function handleToggle(): void {
    const next = !isDark;
    setIsDark(next);
    applyDarkMode(next);
  }

  return (
    <header className="flex items-center justify-between border-b border-border bg-surface-2 px-4 py-3 md:px-6 md:py-4">
      {/* Wordmark */}
      <Link
        to="/"
        className="flex items-center gap-2 no-underline"
        aria-label="Poster Pilot — home"
      >
        <img src={logoSrc} alt="" aria-hidden="true" className="h-7 w-auto md:h-9" />
        <span className="font-serif text-xl font-bold text-text md:text-2xl">Poster Pilot</span>
      </Link>

      {/* Placeholder for Search Bar (Phase 7) */}
      <div className="flex-1" />

      {/* Dark mode toggle */}
      <button
        type="button"
        onClick={handleToggle}
        aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        className="rounded-button p-2 text-text-muted transition-colors hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:outline-none"
      >
        {isDark ? (
          /* Sun icon */
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          </svg>
        ) : (
          /* Moon icon */
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
          </svg>
        )}
      </button>
    </header>
  );
}
